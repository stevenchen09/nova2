/**
 * cost-database 云函数 — 成本资料库 CRUD
 *
 * 集合: cost_records
 * 字段: model, color, materialCost, weightPerMeter, notes, updatedAt, updatedBy
 *
 * 权限:
 *   - list:         全部角色（admin/sales/factory 均可查看完整字段）
 *   - create/update/delete/batchImport: 全部角色均可操作
 *
 * 输入:
 *   { action: 'list'|'create'|'update'|'delete'|'batchImport',
 *     record?: { model, color, materialCost, weightPerMeter, notes },
 *     id?: string,
 *     records?: [...] }
 *
 * 输出:
 *   { code: 0, data: { records: [...] | { count: number } }, message: 'OK' }
 */

const { db } = require('./common/db');
const { verifyUser, sendResponse } = require('./common/auth');

const COLLECTION = 'cost_records';

// 对 sales 脱敏时移除的字段
const SENSITIVE_FIELDS = ['materialCost'];

exports.main = async (event, context) => {
  // 1. 验证登录与角色
  const authResult = await verifyUser(event, context, db);
  if (authResult.code !== 0) return authResult;
  const { uid, role } = authResult.data;

  const { action } = event || {};

  try {
    switch (action) {
      case 'list':
        return await handleList(role);
      case 'create':
        return await handleCreate(event, uid, role);
      case 'update':
        return await handleUpdate(event, uid, role);
      case 'delete':
        return await handleDelete(event, uid, role);
      case 'batchImport':
        return await handleBatchImport(event, uid, role);
      default:
        return sendResponse(400, null, `不支持的操作: ${action}`);
    }
  } catch (err) {
    console.error('[cost-database] error:', err);
    return sendResponse(500, null, `服务器错误: ${err.message || err}`);
  }
};

/**
 * list — 列表查询（角色脱敏）
 *
 * ⚠️ CloudBase NoSQL 的 .get() 默认只返回 100 条，单次最多 1000 条。
 *    用分页循环确保取到全部记录，避免"导入 229 条但列表只显示 100 条"的假象。
 */
async function handleList(role) {
  const PAGE_SIZE = 1000;
  let allRecords = [];
  let offset = 0;

  while (true) {
    const res = await db
      .collection(COLLECTION)
      .skip(offset)
      .limit(PAGE_SIZE)
      .get();
    const batch = res.data || [];
    allRecords = allRecords.concat(batch);

    if (batch.length < PAGE_SIZE) break; // 已取完
    offset += PAGE_SIZE;
  }

  // 确保 id 字段存在（前端用 record.id 操作编辑/删除）
  const records = allRecords.map(r => ({ ...r, id: r._id }));

  return sendResponse(0, { records, total: records.length }, 'OK');
}

/**
 * create — 新增记录（仅 admin）
 */
async function handleCreate(event, uid, role) {
  const { record } = event || {};
  const validation = validateRecord(record);
  if (!validation.ok) {
    return sendResponse(400, null, validation.message);
  }

  const now = new Date().toISOString();
  const doc = {
    model: String(record.model).trim(),
    color: String(record.color).trim(),
    materialCost: Number(record.materialCost),
    weightPerMeter: Number(record.weightPerMeter),
    notes: record.notes ? String(record.notes) : '',
    updatedAt: now,
    updatedBy: uid,
  };

  const res = await db.collection(COLLECTION).add(doc);

  return sendResponse(0, { record: { _id: res.id, ...doc } }, 'OK');
}

/**
 * update — 更新记录（仅 admin）
 */
async function handleUpdate(event, uid, role) {
  const { id, record } = event || {};
  if (!id) {
    return sendResponse(400, null, '缺少必要参数: id');
  }
  const validation = validateRecord(record);
  if (!validation.ok) {
    return sendResponse(400, null, validation.message);
  }

  const now = new Date().toISOString();
  const update = {
    model: String(record.model).trim(),
    color: String(record.color).trim(),
    materialCost: Number(record.materialCost),
    weightPerMeter: Number(record.weightPerMeter),
    notes: record.notes ? String(record.notes) : '',
    updatedAt: now,
    updatedBy: uid,
  };

  const res = await db
    .collection(COLLECTION)
    .doc(id)
    .update(update);

  if (!res.updated || res.updated === 0) {
    return sendResponse(404, null, '记录不存在或未更新');
  }

  return sendResponse(0, { record: { _id: id, ...update } }, 'OK');
}

/**
 * delete — 删除记录（仅 admin）
 */
async function handleDelete(event, uid, role) {
  const { id } = event || {};
  if (!id) {
    return sendResponse(400, null, '缺少必要参数: id');
  }

  const res = await db.collection(COLLECTION).doc(id).remove();

  if (!res.deleted || res.deleted === 0) {
    return sendResponse(404, null, '记录不存在或已删除');
  }

  return sendResponse(0, { count: res.deleted }, 'OK');
}

/**
 * batchImport — 批量导入（仅 admin）
 *
 * 按 model+color 匹配去重合并：
 *   - 已存在则更新（合并：新值覆盖旧值，notes 追加）
 *   - 不存在则新增
 *
 * 返回 { count, inserted, updated }
 */
async function handleBatchImport(event, uid, role) {
  const { records } = event || {};
  if (!Array.isArray(records) || records.length === 0) {
    return sendResponse(400, null, '缺少必要参数: records（非空数组）');
  }

  const now = new Date().toISOString();

  // 第一步：批量校验 + 规范化
  const valid = [];
  for (const rec of records) {
    const validation = validateRecord(rec);
    if (!validation.ok) {
      console.warn('[batchImport] skip invalid record:', rec, validation.message);
      continue;
    }
    valid.push({
      model: String(rec.model).trim(),
      color: String(rec.color).trim(),
      materialCost: Number(rec.materialCost),
      weightPerMeter: Number(rec.weightPerMeter),
      notes: rec.notes ? String(rec.notes) : '',
    });
  }

  if (valid.length === 0) {
    return sendResponse(0, { count: 0, inserted: 0, updated: 0 }, '无有效记录');
  }

  // 第二步：一次性查所有 model+color 组合，构建存在映射
  // CloudBase NoSQL 的 $or 写法：{ $or: [{model:A,color:A},{model:B,color:B}...] }
  const orConditions = valid.map(r => ({ model: r.model, color: r.color }));
  const existRes = await db
    .collection(COLLECTION)
    .where({ $or: orConditions })
    .limit(1000)
    .get();

  const existMap = new Map(); // key = "model||color" -> existing record
  for (const ex of (existRes.data || [])) {
    existMap.set(`${ex.model}||${ex.color}`, ex);
  }

  // 第三步：分桶 — 已有(更新) / 全新(新增)，并发执行所有写
  const updateOps = [];
  const insertOps = [];
  let updated = 0;
  let inserted = 0;

  for (const rec of valid) {
    const key = `${rec.model}||${rec.color}`;
    const existing = existMap.get(key);
    if (existing) {
      const mergedNotes = mergeNotes(existing.notes, rec.notes);
      updateOps.push(
        db.collection(COLLECTION).doc(existing._id).update({
          materialCost: rec.materialCost,
          weightPerMeter: rec.weightPerMeter,
          notes: mergedNotes,
          updatedAt: now,
          updatedBy: uid,
        })
      );
      updated++;
    } else {
      insertOps.push(
        db.collection(COLLECTION).add({
          model: rec.model,
          color: rec.color,
          materialCost: rec.materialCost,
          weightPerMeter: rec.weightPerMeter,
          notes: rec.notes,
          updatedAt: now,
          updatedBy: uid,
        })
      );
      inserted++;
    }
  }

  // 并发执行所有写操作（每个内部已经是独立请求）
  await Promise.all([...updateOps, ...insertOps]);

  return sendResponse(
    0,
    { count: inserted + updated, inserted, updated },
    `导入完成：新增 ${inserted} 条，更新 ${updated} 条`
  );
}

/**
 * 校验单条记录合法性
 */
function validateRecord(record) {
  if (!record || typeof record !== 'object') {
    return { ok: false, message: '记录不能为空' };
  }
  if (!record.model || !String(record.model).trim()) {
    return { ok: false, message: '缺少必要字段: model' };
  }
  if (!record.color || !String(record.color).trim()) {
    return { ok: false, message: '缺少必要字段: color' };
  }
  if (record.materialCost == null || isNaN(Number(record.materialCost))) {
    return { ok: false, message: '字段 materialCost 必须为数字' };
  }
  if (record.weightPerMeter == null || isNaN(Number(record.weightPerMeter))) {
    return { ok: false, message: '字段 weightPerMeter 必须为数字' };
  }
  return { ok: true };
}

/**
 * 移除敏感字段（对 sales 脱敏）
 */
function stripSensitive(rec) {
  const clone = { ...rec };
  for (const f of SENSITIVE_FIELDS) {
    delete clone[f];
  }
  return clone;
}

/**
 * 合并备注：保留旧备注 + 追加新备注（去重）
 */
function mergeNotes(oldNotes, newNotes) {
  const oldStr = oldNotes ? String(oldNotes).trim() : '';
  const newStr = newNotes ? String(newNotes).trim() : '';
  if (!newStr) return oldStr;
  if (!oldStr) return newStr;
  if (oldStr.includes(newStr)) return oldStr;
  return `${oldStr} | ${newStr}`;
}

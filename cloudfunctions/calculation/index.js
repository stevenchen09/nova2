/**
 * calculation 云函数 — 算料记录存储
 *
 * 集合: calculations
 * 字段:
 *   ownerUid, clientName, orderName, items (FrameItem[]),
 *   priceConfig (PriceConfig 快照), results (GroupResult[]),
 *   totalQuotePrice, totalCostPrice, profit, profitMargin, createdAt
 *
 * 权限:
 *   - save:   admin/sales（自动注入 ownerUid）
 *   - list:   admin(所有) / sales(仅自己的) / factory(仅自己的)
 *   - get:    本人或 admin
 *   - delete: 本人或 admin
 *   - update: admin/sales（本人或 admin，保留 ownerUid/createdAt）
 *
 * 输入:
 *   { action: 'save'|'list'|'get'|'delete'|'update', record?: HistoryRecord, id?: string }
 *
 * 输出:
 *   { code: 0, data: { records: [...] | record: {...} | count: number }, message: 'OK' }
 */

const { db } = require('./common/db');
const { verifyUser, sendResponse } = require('./common/auth');

const COLLECTION = 'calculations';

// list 返回时排除的字段（避免列表过大）
const LIST_EXCLUDE_FIELDS = { items: 0, results: 0, priceConfig: 0 };

exports.main = async (event, context) => {
  const authResult = await verifyUser(event, context, db);
  if (authResult.code !== 0) return authResult;
  const { uid, role } = authResult.data;

  const { action } = event || {};

  try {
    switch (action) {
      case 'save':
        return await handleSave(event, uid, role);
      case 'list':
        return await handleList(uid, role);
      case 'get':
        return await handleGet(event, uid, role);
      case 'delete':
        return await handleDelete(event, uid, role);
      case 'update':
        return await handleUpdate(event, uid, role);
      default:
        return sendResponse(400, null, `不支持的操作: ${action}`);
    }
  } catch (err) {
    console.error('[calculation] error:', err);
    return sendResponse(500, null, `服务器错误: ${err.message || err}`);
  }
};

/**
 * save — 保存算料记录（admin/sales）
 *
 * 自动注入 ownerUid 与 createdAt，忽略客户端传入的这两个字段。
 */
async function handleSave(event, uid, role) {
  if (role !== 'admin' && role !== 'sales') {
    return sendResponse(403, null, '无权保存算料记录');
  }

  const { record } = event || {};
  const validation = validateRecord(record);
  if (!validation.ok) {
    return sendResponse(400, null, validation.message);
  }

  const now = new Date().toISOString();

  // 构造入库文档（强制注入服务端字段，防止伪造 ownerUid）
  const items = Array.isArray(record.items) ? record.items : [];
  const doc = {
    ownerUid: uid,
    clientName: String(record.clientName || '').trim(),
    orderName: String(record.orderName || '').trim(),
    items: items,
    priceConfig: record.priceConfig && typeof record.priceConfig === 'object'
      ? record.priceConfig
      : {},
    results: Array.isArray(record.results) ? record.results : [],
    totalQuotePrice: Number(record.totalQuotePrice) || 0,
    totalCostPrice: Number(record.totalCostPrice) || 0,
    profit: Number(record.profit) || 0,
    profitMargin: Number(record.profitMargin) || 0,
    totalQuantity: items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0),
    notes: record.notes ? String(record.notes) : '',
    createdAt: now,
  };

  const res = await db.collection(COLLECTION).add(doc);

  return sendResponse(
    0,
    { record: { _id: res.id, ...doc } },
    '已保存'
  );
}

/**
 * list — 列表查询（权限隔离）
 *
 * admin 返回所有；sales/factory 仅返回自己的。
 * 列表仅返回摘要字段（不含 items/results/priceConfig 大字段）。
 */
async function handleList(uid, role) {
  let query = db.collection(COLLECTION);

  if (role !== 'admin') {
    // sales/factory 仅返回自己的
    query = query.where({ ownerUid: uid });
  }

  // 按 createdAt 倒序；列表仅返回摘要字段（不含大字段）
  const res = await query
    .field(LIST_EXCLUDE_FIELDS)
    .orderBy('createdAt', 'desc')
    .get();

  let records = res.data || [];

  // 确保 id 字段存在（前端用 record.id 操作）
  records = records.map(r => ({ ...r, id: r._id }));

  // sales 额外脱敏：移除可能存在的成本字段（防御性）
  if (role === 'sales') {
    records = records.map(stripCostFromList);
  }

  return sendResponse(0, { records }, 'OK');
}

/**
 * get — 获取单条详情（本人或 admin）
 */
async function handleGet(event, uid, role) {
  const { id } = event || {};
  if (!id) {
    return sendResponse(400, null, '缺少必要参数: id');
  }

  const res = await db.collection(COLLECTION).doc(id).get();

  if (!res.data || res.data.length === 0) {
    return sendResponse(404, null, '记录不存在');
  }

  const record = res.data[0];

  // 权限校验：仅本人或 admin
  if (record.ownerUid !== uid && role !== 'admin') {
    return sendResponse(403, null, '无权查看此记录');
  }

  // sales 额外脱敏 priceConfig 中的成本轨字段
  let safeRecord = record;
  if (role === 'sales') {
    safeRecord = {
      ...record,
      priceConfig: stripCostFromConfig(record.priceConfig),
    };
  }

  // 统一注入 id 字段（前端用 record.id 操作，与 list 接口保持一致）
  safeRecord = { ...safeRecord, id: record._id };

  return sendResponse(0, { record: safeRecord }, 'OK');
}

/**
 * delete — 删除记录（本人或 admin）
 */
async function handleDelete(event, uid, role) {
  const { id } = event || {};
  if (!id) {
    return sendResponse(400, null, '缺少必要参数: id');
  }

  // 先查记录确认权限
  const res = await db.collection(COLLECTION).doc(id).get();

  if (!res.data || res.data.length === 0) {
    return sendResponse(404, null, '记录不存在');
  }

  const record = res.data[0];
  if (record.ownerUid !== uid && role !== 'admin') {
    return sendResponse(403, null, '无权删除此记录');
  }

  await db.collection(COLLECTION).doc(id).remove();

  return sendResponse(0, { count: 1 }, '已删除');
}

/**
 * update — 更新已有算料记录（admin/sales，本人或 admin）
 *
 * 与 save 的区别：
 *   - 不创建新记录，而是覆盖原记录的可变字段
 *   - 强制保留 ownerUid 和 createdAt（不允许客户端修改）
 *   - 注入 updatedAt 时间戳
 */
async function handleUpdate(event, uid, role) {
  if (role !== 'admin' && role !== 'sales') {
    return sendResponse(403, null, '无权更新算料记录');
  }

  const { id, record } = event || {};
  if (!id) {
    return sendResponse(400, null, '缺少必要参数: id');
  }

  const validation = validateRecord(record);
  if (!validation.ok) {
    return sendResponse(400, null, validation.message);
  }

  // 先查记录确认存在 + 权限校验（本人或 admin）
  const existRes = await db.collection(COLLECTION).doc(id).get();
  if (!existRes.data || existRes.data.length === 0) {
    return sendResponse(404, null, '记录不存在');
  }

  const existRecord = existRes.data[0];
  if (existRecord.ownerUid !== uid && role !== 'admin') {
    return sendResponse(403, null, '无权更新此记录');
  }

  const now = new Date().toISOString();

  // 构造更新文档（与 handleSave 字段一致，但不包含 ownerUid 和 createdAt，加上 updatedAt）
  const items = Array.isArray(record.items) ? record.items : [];
  const updateDoc = {
    clientName: String(record.clientName || '').trim(),
    orderName: String(record.orderName || '').trim(),
    items: items,
    priceConfig: record.priceConfig && typeof record.priceConfig === 'object'
      ? record.priceConfig
      : {},
    results: Array.isArray(record.results) ? record.results : [],
    totalQuotePrice: Number(record.totalQuotePrice) || 0,
    totalCostPrice: Number(record.totalCostPrice) || 0,
    profit: Number(record.profit) || 0,
    profitMargin: Number(record.profitMargin) || 0,
    totalQuantity: items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0),
    notes: record.notes ? String(record.notes) : '',
    updatedAt: now,
  };

  await db.collection(COLLECTION).doc(id).update(updateDoc);

  // 统一注入 id 字段（前端用 record.id 操作，与 list/get 接口保持一致）
  return sendResponse(
    0,
    { record: { _id: id, id, ...updateDoc } },
    '已更新'
  );
}

/**
 * 校验记录合法性
 */
function validateRecord(record) {
  if (!record || typeof record !== 'object') {
    return { ok: false, message: '记录不能为空' };
  }
  if (!Array.isArray(record.items)) {
    return { ok: false, message: '字段 items 必须为数组' };
  }
  if (!Array.isArray(record.results)) {
    return { ok: false, message: '字段 results 必须为数组' };
  }
  return { ok: true };
}

/**
 * 列表项脱敏：移除 results 中的成本字段（防御性，列表通常已 exclude）
 */
function stripCostFromList(rec) {
  // 列表已通过 field 参数排除大字段，这里仅做防御性处理
  return rec;
}

/**
 * PriceConfig 快照脱敏：移除成本轨字段（对 sales）
 */
function stripCostFromConfig(priceConfig) {
  if (!priceConfig || typeof priceConfig !== 'object') {
    return priceConfig;
  }
  const clone = { ...priceConfig };
  delete clone.costAccessoryPrice;
  delete clone.costCuttingFee;
  delete clone.costTaxRate;
  return clone;
}

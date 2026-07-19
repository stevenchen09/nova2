/**
 * share-order 云函数 — 领料单生成 / 分享 / 查看
 *
 * 集合: share_orders
 * 字段:
 *   shareCode (6 位, 唯一), ownerUid, ownerDisplayName,
 *   clientName, orderName, orderDate, calculationId,
 *   results (GroupResult[] 快照), permissions (SharePermissions),
 *   expiresAt (now + 7 天), revoked (bool), createdAt
 *
 * 权限:
 *   - create:     admin/sales
 *   - getByCode:  任意登录用户（凭码查看，按 permissions 过滤）
 *   - listMine:   本人
 *   - listShared: factory
 *   - listAll:    admin
 *   - revoke:     本人或 admin
 *
 * 输入:
 *   { action, order?: ShareOrder, code?: string, id?: string }
 *
 * 输出:
 *   { code: 0, data: { order | shareCode | orders }, message }
 */

const { db, _ } = require('./common/db');
const { verifyUser, sendResponse } = require('./common/auth');

const COLLECTION = 'share_orders';

// 分享码有效期 7 天
const EXPIRE_DAYS = 7;
// 分享码生成最大重试次数（防碰撞）
const MAX_CODE_RETRY = 3;
// 分享码字符集（数字 + 大写字母，排除易混淆字符 0/O/1/I/L）
const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;

exports.main = async (event, context) => {
  const authResult = await verifyUser(event, context, db);
  if (authResult.code !== 0) return authResult;
  const { uid, role, displayName } = authResult.data;

  const { action } = event || {};

  try {
    switch (action) {
      case 'create':
        return await handleCreate(event, uid, role, displayName);
      case 'getByCode':
        return await handleGetByCode(event, uid, role);
      case 'listMine':
        return await handleListMine(uid, role);
      case 'listShared':
        return await handleListShared(uid, role);
      case 'listAll':
        return await handleListAll(uid, role);
      case 'revoke':
        return await handleRevoke(event, uid, role);
      default:
        return sendResponse(400, null, `不支持的操作: ${action}`);
    }
  } catch (err) {
    console.error('[share-order] error:', err);
    return sendResponse(500, null, `服务器错误: ${err.message || err}`);
  }
};

/**
 * create — 生成领料单分享码
 *
 * 1. 生成 6 位随机分享码（校验唯一性）
 * 2. 计算 expiresAt = now + 7 天
 * 3. 存 results 快照（冗余，避免算料记录被删后分享失效）
 */
async function handleCreate(event, uid, role, displayName) {
  if (role !== 'admin' && role !== 'sales') {
    return sendResponse(403, null, '无权生成领料单');
  }

  const { order } = event || {};
  const validation = validateOrder(order);
  if (!validation.ok) {
    return sendResponse(400, null, validation.message);
  }

  // 生成唯一分享码
  let shareCode = null;
  for (let i = 0; i < MAX_CODE_RETRY; i++) {
    const candidate = generateShareCode();
    const exists = await db
      .collection(COLLECTION)
      .where({ shareCode: candidate })
      .count();
    if (!exists.total || exists.total === 0) {
      shareCode = candidate;
      break;
    }
  }

  if (!shareCode) {
    return sendResponse(500, null, '分享码生成失败，请重试');
  }

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + EXPIRE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const doc = {
    shareCode,
    ownerUid: uid,
    ownerDisplayName: displayName || '',
    clientName: String(order.clientName || '').trim(),
    orderName: String(order.orderName || '').trim(),
    orderDate: order.orderDate
      ? String(order.orderDate)
      : now.toISOString().slice(0, 10),
    calculationId: order.calculationId ? String(order.calculationId) : '',
    results: Array.isArray(order.results) ? order.results : [],
    permissions: normalizePermissions(order.permissions),
    expiresAt,
    revoked: false,
    createdAt: now.toISOString(),
  };

  const res = await db.collection(COLLECTION).add(doc);

  return sendResponse(
    0,
    {
      order: { _id: res.id, ...doc },
      shareCode,
    },
    '领料单已生成'
  );
}

/**
 * getByCode — 凭分享码查看（任意登录用户）
 *
 * 1. 校验分享码存在
 * 2. 校验未过期且未撤回
 * 3. 按 permissions 过滤返回的数据模块（未授权模块返回 { hidden: true }）
 */
async function handleGetByCode(event, uid, role) {
  const { code } = event || {};
  if (!code) {
    return sendResponse(400, null, '缺少必要参数: code');
  }

  const res = await db
    .collection(COLLECTION)
    .where({ shareCode: String(code).trim().toUpperCase() })
    .get();

  if (!res.data || res.data.length === 0) {
    return sendResponse(404, null, '分享码无效');
  }

  const order = res.data[0];

  if (order.revoked) {
    return sendResponse(403, null, '该领料单已被撤回');
  }

  if (new Date(order.expiresAt).getTime() < Date.now()) {
    return sendResponse(403, null, '该领料单已过期，请联系销售重新生成');
  }

  // 按 permissions 过滤数据模块
  const filtered = applyPermissions(order);

  return sendResponse(0, { order: filtered }, 'OK');
}

/**
 * listMine — 销售查自己生成的领料单
 */
async function handleListMine(uid, role) {
  if (role !== 'admin' && role !== 'sales') {
    return sendResponse(403, null, '无权查看领料单列表');
  }

  const res = await db
    .collection(COLLECTION)
    .where({ ownerUid: uid })
    .orderBy('createdAt', 'desc')
    .get();

  // 列表移除大字段 results
  const orders = (res.data || []).map(stripResults);

  return sendResponse(0, { orders }, 'OK');
}

/**
 * listShared — factory 查被分享的领料单
 *
 * 简化设计：返回所有未过期、未撤回的领料单（工厂可凭码或列表查看）。
 */
async function handleListShared(uid, role) {
  if (role !== 'factory') {
    return sendResponse(403, null, '仅工厂角色可查看被分享列表');
  }

  const now = new Date().toISOString();
  const res = await db
    .collection(COLLECTION)
    .where({
      revoked: false,
      expiresAt: _.gt(now),
    })
    .orderBy('createdAt', 'desc')
    .get();

  // 列表移除大字段 results，工厂列表仅返回摘要
  const orders = (res.data || []).map((o) => {
    const stripped = stripResults(o);
    // 列表不暴露完整权限细节，仅返回是否有权限的布尔
    return stripped;
  });

  return sendResponse(0, { orders }, 'OK');
}

/**
 * listAll — admin 查所有领料单
 */
async function handleListAll(uid, role) {
  if (role !== 'admin') {
    return sendResponse(403, null, '无权查看所有领料单');
  }

  const res = await db
    .collection(COLLECTION)
    .orderBy('createdAt', 'desc')
    .get();

  const orders = (res.data || []).map(stripResults);

  return sendResponse(0, { orders }, 'OK');
}

/**
 * revoke — 撤回领料单（本人或 admin）
 */
async function handleRevoke(event, uid, role) {
  const { id } = event || {};
  if (!id) {
    return sendResponse(400, null, '缺少必要参数: id');
  }

  const res = await db.collection(COLLECTION).doc(id).get();

  if (!res.data || res.data.length === 0) {
    return sendResponse(404, null, '领料单不存在');
  }

  const order = res.data[0];
  if (order.ownerUid !== uid && role !== 'admin') {
    return sendResponse(403, null, '无权撤回此领料单');
  }

  await db
    .collection(COLLECTION)
    .doc(id)
    .update({ revoked: true });

  return sendResponse(0, { revoked: true }, '已撤回');
}

// ============ 工具函数 ============

/**
 * 生成 6 位随机分享码（数字+大写字母，排除 0/O/1/I/L）
 */
function generateShareCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS.charAt(
      Math.floor(Math.random() * CODE_CHARS.length)
    );
  }
  return code;
}

/**
 * 校验领料单输入
 */
function validateOrder(order) {
  if (!order || typeof order !== 'object') {
    return { ok: false, message: '领料单数据不能为空' };
  }
  if (!Array.isArray(order.results)) {
    return { ok: false, message: '字段 results 必须为数组' };
  }
  return { ok: true };
}

/**
 * 规范化权限对象（4 项授权，给默认值）
 *
 * 默认（依 T06 设计）:
 *   profileCutting: true   型材切割明细
 *   costDetail: false      费用成本明细
 *   clientInfo: true       客户/订单信息
 *   simpleList: true       简洁领料单
 */
function normalizePermissions(permissions) {
  const p = permissions || {};
  return {
    profileCutting: p.profileCutting !== false, // 默认 true
    costDetail: p.costDetail === true, // 默认 false
    clientInfo: p.clientInfo !== false, // 默认 true
    simpleList: p.simpleList !== false, // 默认 true
  };
}

/**
 * 按 permissions 过滤返回的数据模块
 *
 * 未授权模块：
 *   - profileCutting=false → results 置为 { hidden: true, module: 'profileCutting' }
 *   - costDetail=false     → 移除 results 中的成本字段 + 总成本/利润字段
 *   - clientInfo=false     → clientName/orderName 置为隐藏标记
 *   - simpleList=false     → 不返回简化版本（前端控制，后端仅在 data 标记）
 */
function applyPermissions(order) {
  const p = order.permissions || {};
  const filtered = { ...order };

  // 1. 型材切割明细
  if (!p.profileCutting) {
    filtered.results = [];
    filtered._hiddenModules = filtered._hiddenModules || [];
    filtered._hiddenModules.push('profileCutting');
  }

  // 2. 费用成本明细
  if (!p.costDetail) {
    filtered.results = (filtered.results || []).map((g) =>
      stripCostFromGroup(g)
    );
    // 移除总计中的成本/利润字段
    delete filtered.totalCostPrice;
    delete filtered.profit;
    delete filtered.profitMargin;
    filtered._hiddenModules = filtered._hiddenModules || [];
    filtered._hiddenModules.push('costDetail');
  }

  // 3. 客户/订单信息
  if (!p.clientInfo) {
    filtered.clientName = '';
    filtered.orderName = '';
    filtered._hiddenModules = filtered._hiddenModules || [];
    filtered._hiddenModules.push('clientInfo');
  }

  // 4. 简洁领料单（前端渲染控制，后端仅标记可用性）
  if (!p.simpleList) {
    filtered._simpleListAvailable = false;
  } else {
    filtered._simpleListAvailable = true;
  }

  return filtered;
}

/**
 * 移除 GroupResult 中的成本字段
 */
function stripCostFromGroup(g) {
  if (!g || typeof g !== 'object') return g;
  const clone = { ...g };
  delete clone.costAccessoryCost;
  delete clone.costCuttingCost;
  delete clone.costTaxCost;
  delete clone.costGrandTotal;
  delete clone.profit;
  delete clone.profitMargin;
  return clone;
}

/**
 * 列表项移除大字段 results
 */
function stripResults(order) {
  const clone = { ...order };
  delete clone.results;
  return clone;
}

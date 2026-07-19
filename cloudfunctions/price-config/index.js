/**
 * price-config 云函数 — 全局费率配置读写
 *
 * 集合: price_config（单文档，_id: "global"）
 * 字段:
 *   materialPrice, mode,
 *   quoteAccessoryPrice, quoteCuttingFee, quoteTaxRate,
 *   costAccessoryPrice, costCuttingFee, costTaxRate,
 *   defaultWeightPerMeter, defaultWeightPerAccessorySet,
 *   updatedAt, updatedBy
 *
 * 权限:
 *   - get:    全部角色（admin/sales/factory 均可查看完整双轨配置）
 *   - update: 全部角色均可操作
 *
 * 输入:
 *   { action: 'get' | 'update', config?: PriceConfig }
 *
 * 输出:
 *   { code: 0, data: { config: PriceConfig }, message: 'OK' }
 */

const { db } = require('./common/db');
const { verifyUser, sendResponse } = require('./common/auth');

const COLLECTION = 'price_config';
const DOC_ID = 'global';

// 对 sales 脱敏时移除的字段（成本轨）
const COST_FIELDS = ['costAccessoryPrice', 'costCuttingFee', 'costTaxRate'];

// 配置字段白名单（update 时仅允许这些字段写入）
const CONFIG_FIELDS = [
  'materialPrice',
  'mode',
  'quoteAccessoryPrice',
  'quoteCuttingFee',
  'quoteTaxRate',
  'costAccessoryPrice',
  'costCuttingFee',
  'costTaxRate',
  'defaultWeightPerMeter',
  'defaultWeightPerAccessorySet',
  'colorReuseRules',
];

// 合法的 mode 值
const VALID_MODES = ['批量单(按整料)', '零散单(按周长)'];

exports.main = async (event, context) => {
  const authResult = await verifyUser(event, context, db);
  if (authResult.code !== 0) return authResult;
  const { uid, role } = authResult.data;

  const { action } = event || {};

  try {
    switch (action) {
      case 'get':
        return await handleGet(role);
      case 'update':
        return await handleUpdate(event, uid, role);
      default:
        return sendResponse(400, null, `不支持的操作: ${action}`);
    }
  } catch (err) {
    console.error('[price-config] error:', err);
    return sendResponse(500, null, `服务器错误: ${err.message || err}`);
  }
};

/**
 * 读取全局配置（单文档）
 */
async function getConfigDoc() {
  const res = await db
    .collection(COLLECTION)
    .doc(DOC_ID)
    .get();

  if (res.data && res.data.length > 0) {
    return res.data[0];
  }
  return null;
}

/**
 * get — 读取配置（角色脱敏）
 */
async function handleGet(role) {
  let config = await getConfigDoc();

  // 首次读取时若不存在，初始化默认配置
  if (!config) {
    config = getDefaultConfig();
    await db
      .collection(COLLECTION)
      .add({ _id: DOC_ID, ...config });
  }

  // 移除内部字段
  const { _id, ...rest } = config;
  let safeConfig = rest;

  return sendResponse(0, { config: safeConfig }, 'OK');
}

/**
 * update — 更新配置（仅 admin）
 */
async function handleUpdate(event, uid, role) {
  const { config } = event || {};
  if (!config || typeof config !== 'object') {
    return sendResponse(400, null, '缺少必要参数: config');
  }

  const validation = validateConfig(config);
  if (!validation.ok) {
    return sendResponse(400, null, validation.message);
  }

  // 仅取白名单字段
  const update = {};
  for (const f of CONFIG_FIELDS) {
    if (config[f] !== undefined) {
      update[f] = config[f];
    }
  }

  // 数值字段强转（跳过 mode 和 colorReuseRules —— 它们不是数值）
  for (const f of CONFIG_FIELDS) {
    if (
      update[f] !== undefined &&
      f !== 'mode' &&
      f !== 'colorReuseRules' &&
      typeof update[f] !== 'number'
    ) {
      update[f] = Number(update[f]);
    }
  }

  update.updatedAt = new Date().toISOString();
  update.updatedBy = uid;

  // 单文档 upsert：先查是否存在
  const existing = await getConfigDoc();
  if (existing) {
    await db
      .collection(COLLECTION)
      .doc(DOC_ID)
      .update(update);
  } else {
    await db
      .collection(COLLECTION)
      .add({ _id: DOC_ID, ...getDefaultConfig(), ...update });
  }

  // 返回更新后的完整配置
  const fresh = await getConfigDoc();
  const { _id, ...safeConfig } = fresh;

  return sendResponse(0, { config: safeConfig }, '配置已更新');
}

/**
 * 校验配置字段合法性
 */
function validateConfig(config) {
  if (config.mode && !VALID_MODES.includes(config.mode)) {
    return {
      ok: false,
      message: `mode 必须为: ${VALID_MODES.join(' / ')}`,
    };
  }

  const numericFields = [
    'materialPrice',
    'quoteAccessoryPrice',
    'quoteCuttingFee',
    'quoteTaxRate',
    'costAccessoryPrice',
    'costCuttingFee',
    'costTaxRate',
    'defaultWeightPerMeter',
    'defaultWeightPerAccessorySet',
  ];

  for (const f of numericFields) {
    if (config[f] !== undefined && config[f] !== null) {
      const n = Number(config[f]);
      if (isNaN(n)) {
        return { ok: false, message: `字段 ${f} 必须为数字` };
      }
      if (n < 0) {
        return { ok: false, message: `字段 ${f} 不能为负数` };
      }
    }
  }

  // colorReuseRules 校验：必须是数组，每项有 sourceColor 和 targetColor
  if (config.colorReuseRules !== undefined && config.colorReuseRules !== null) {
    if (!Array.isArray(config.colorReuseRules)) {
      return { ok: false, message: 'colorReuseRules 必须为数组' };
    }
    for (let i = 0; i < config.colorReuseRules.length; i++) {
      const rule = config.colorReuseRules[i];
      if (!rule || typeof rule !== 'object') {
        return { ok: false, message: `colorReuseRules[${i}] 必须为对象` };
      }
      if (typeof rule.sourceColor !== 'string' || !rule.sourceColor.trim()) {
        return { ok: false, message: `colorReuseRules[${i}].sourceColor 不能为空` };
      }
      if (typeof rule.targetColor !== 'string' || !rule.targetColor.trim()) {
        return { ok: false, message: `colorReuseRules[${i}].targetColor 不能为空` };
      }
    }
  }

  // 税率范围校验（0 ~ 1）
  for (const f of ['quoteTaxRate', 'costTaxRate']) {
    if (config[f] !== undefined && config[f] !== null) {
      const n = Number(config[f]);
      if (n < 0 || n > 1) {
        return { ok: false, message: `字段 ${f} 应在 0~1 之间` };
      }
    }
  }

  return { ok: true };
}

/**
 * 默认配置（首次初始化用）
 */
function getDefaultConfig() {
  return {
    materialPrice: 0,
    mode: '批量单(按整料)',
    quoteAccessoryPrice: 0,
    quoteCuttingFee: 0,
    quoteTaxRate: 0,
    costAccessoryPrice: 0,
    costCuttingFee: 0,
    costTaxRate: 0,
    defaultWeightPerMeter: 0,
    defaultWeightPerAccessorySet: 0,
    colorReuseRules: [
      { sourceColor: '哑银', targetColor: '哑黑' },
      { sourceColor: '浅哑金', targetColor: '哑黑' },
      { sourceColor: '磨砂白', targetColor: '哑黑' },
      { sourceColor: '亮钛金', targetColor: '磨光亮金' },
      { sourceColor: '紫金', targetColor: '磨光亮金' },
    ],
    updatedAt: new Date().toISOString(),
    updatedBy: '',
  };
}

/**
 * 移除成本轨字段（对 sales 脱敏）
 */
function stripCostFields(config) {
  const clone = { ...config };
  for (const f of COST_FIELDS) {
    delete clone[f];
  }
  return clone;
}

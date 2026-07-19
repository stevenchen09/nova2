/**
 * 成本费率覆盖功能测试 (Cost Override Feature Tests)
 *
 * 项目无测试框架 (vitest/jest)，采用独立 TS 测试文件 + tsx 运行方式。
 * 测试覆盖6个核心场景：
 *   1. 覆盖开关切换（effectiveConfig 构造逻辑）
 *   2. 覆盖值计算正确性（costAccessoryCost 等使用覆盖值）
 *   3. 覆盖不影响全局 priceConfig
 *   4. 历史保存含覆盖值（effectiveConfig 快照）
 *   5. 历史载入恢复覆盖（差异检测逻辑）
 *   6. 清空工作区重置覆盖
 *
 * 运行: npx tsx src/__tests__/costOverride.test.ts
 */

import {
  FrameItem,
  PriceConfig,
  CostOverride,
  SizeType,
  PricingMode,
  HistoryRecord,
  CostRecord,
} from '../types';
import { calculateGroupedResults } from '../utils/calculation';

// ─────────────────────────────────────────────────────────────────────
// 测试框架（极简实现）
// ─────────────────────────────────────────────────────────────────────

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failedDetails: string[] = [];

function assert(condition: boolean, message: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    // console.log(`  ✅ ${message}`);
  } else {
    failedTests++;
    failedDetails.push(message);
    console.error(`  ❌ ${message}`);
  }
}

function assertApprox(
  actual: number,
  expected: number,
  tolerance: number,
  message: string,
): void {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, `${message} (expected: ${expected}, got: ${actual}, diff: ${diff})`);
}

function describe(name: string, fn: () => void): void {
  console.log(`\n📋 ${name}`);
  fn();
}

// ─────────────────────────────────────────────────────────────────────
// 测试数据
// ─────────────────────────────────────────────────────────────────────

const BASE_PRICE_CONFIG: PriceConfig = {
  materialPrice: 45,
  mode: PricingMode.BATCH,
  quoteAccessoryPrice: 15,
  quoteCuttingFee: 3,
  quoteTaxRate: 0.13,
  costAccessoryPrice: 10.5,
  costCuttingFee: 2.1,
  costTaxRate: 0.13,
  defaultWeightPerMeter: 0.85,
  defaultWeightPerAccessorySet: 0.12,
  colorReuseRules: [],
};

const SAMPLE_ITEMS: FrameItem[] = [
  {
    id: 'item-1',
    model: '测试型号A',
    color: '哑黑',
    sizeType: SizeType.OD,
    width: 100,
    height: 80,
    quantity: 10,
  },
];

const SAMPLE_COST_DB: CostRecord[] = [
  {
    id: 'cost-1',
    model: '测试型号A',
    color: '哑黑',
    materialCost: 27,
    weightPerMeter: 0.85,
    notes: '测试记录',
    updatedAt: new Date().toISOString(),
  },
];

// ─────────────────────────────────────────────────────────────────────
// 辅助函数：模拟 QuoteWorkspace 中的 effectiveConfig 构造
// ─────────────────────────────────────────────────────────────────────

function buildEffectiveConfig(
  priceConfig: PriceConfig,
  costOverride: CostOverride | null,
): PriceConfig {
  return costOverride
    ? { ...priceConfig, ...costOverride }
    : { ...priceConfig };
}

// ─────────────────────────────────────────────────────────────────────
// 辅助函数：模拟 App.tsx 中 onLoadRecord 的差异检测逻辑
// ─────────────────────────────────────────────────────────────────────

function detectCostOverride(
  globalConfig: PriceConfig,
  snapshotConfig: PriceConfig,
): CostOverride | null {
  const s = snapshotConfig;
  const g = globalConfig;
  if (
    s.costAccessoryPrice !== g.costAccessoryPrice ||
    s.costCuttingFee !== g.costCuttingFee ||
    s.costTaxRate !== g.costTaxRate
  ) {
    return {
      costAccessoryPrice: s.costAccessoryPrice,
      costCuttingFee: s.costCuttingFee,
      costTaxRate: s.costTaxRate,
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// 辅助函数：模拟 useCalculation.saveCurrentToHistory 的快照逻辑
// ─────────────────────────────────────────────────────────────────────

function buildHistorySnapshot(
  globalPriceConfig: PriceConfig,
  costOverride: CostOverride | null,
  items: FrameItem[],
  results: ReturnType<typeof calculateGroupedResults>,
  clientName: string = '测试客户',
  orderName: string = '测试订单',
): HistoryRecord {
  const effectiveConfig = buildEffectiveConfig(globalPriceConfig, costOverride);

  const finalQuotePrice = results.reduce((acc, g) => acc + g.totalPrice, 0);
  const finalCostPrice = results.reduce((acc, g) => acc + (g.totalCost || 0), 0);
  const finalProfit = finalQuotePrice - finalCostPrice;
  const finalMargin =
    finalQuotePrice > 0 ? (finalProfit / finalQuotePrice) * 100 : 0;

  return {
    id: `history-${Date.now()}`,
    clientName: clientName.trim() || '散客',
    orderName: orderName.trim() || `切框订单-${new Date().toLocaleDateString()}`,
    createdAt: new Date().toISOString(),
    items: [...items],
    priceConfig: { ...effectiveConfig },
    results: [...results],
    totalQuotePrice: Number(finalQuotePrice.toFixed(2)),
    totalCostPrice: Number(finalCostPrice.toFixed(2)),
    profit: Number(finalProfit.toFixed(2)),
    profitMargin: Number(finalMargin.toFixed(1)),
  };
}

// ═════════════════════════════════════════════════════════════════════
// 测试场景
// ═════════════════════════════════════════════════════════════════════

describe('场景1: 覆盖开关切换', () => {
  // 1a. 开关关闭 → effectiveConfig === priceConfig（无覆盖）
  const noOverride = buildEffectiveConfig(BASE_PRICE_CONFIG, null);
  assert(
    noOverride.costAccessoryPrice === BASE_PRICE_CONFIG.costAccessoryPrice,
    '1a: 开关关闭时 costAccessoryPrice 应等于全局值',
  );
  assert(
    noOverride.costCuttingFee === BASE_PRICE_CONFIG.costCuttingFee,
    '1a: 开关关闭时 costCuttingFee 应等于全局值',
  );
  assert(
    noOverride.costTaxRate === BASE_PRICE_CONFIG.costTaxRate,
    '1a: 开关关闭时 costTaxRate 应等于全局值',
  );

  // 1b. 开关开启 → 首次深拷贝全局默认值（模拟 CostOverridePanel.handleToggle）
  const firstOverride: CostOverride = {
    costAccessoryPrice: BASE_PRICE_CONFIG.costAccessoryPrice,
    costCuttingFee: BASE_PRICE_CONFIG.costCuttingFee,
    costTaxRate: BASE_PRICE_CONFIG.costTaxRate,
  };
  const withOverride = buildEffectiveConfig(BASE_PRICE_CONFIG, firstOverride);
  assert(
    withOverride.costAccessoryPrice === BASE_PRICE_CONFIG.costAccessoryPrice,
    '1b: 开关开启（首次）时 costAccessoryPrice 应预填全局默认值',
  );

  // 1c. 开关关闭 → costOverride = null，计算回退全局值
  const resultsNoOverride = calculateGroupedResults(
    SAMPLE_ITEMS,
    buildEffectiveConfig(BASE_PRICE_CONFIG, null),
    false,
    SAMPLE_COST_DB,
  );
  assert(
    resultsNoOverride.length > 0,
    '1c: 无覆盖时计算应产出结果',
  );
  assert(
    resultsNoOverride[0].costAccessoryCost !== undefined,
    '1c: costAccessoryCost 字段应存在',
  );
  // costAccessoryCost = totalQuantity * costAccessoryPrice = 10 * 10.5 = 105
  assertApprox(
    resultsNoOverride[0].costAccessoryCost!,
    105,
    0.01,
    '1c: 无覆盖时 costAccessoryCost = 10 × 10.5 = 105',
  );
});

describe('场景2: 覆盖值计算正确性', () => {
  // 2a. 开启覆盖，修改 costAccessoryPrice 为 20
  const override: CostOverride = {
    costAccessoryPrice: 20,
    costCuttingFee: 2.1,
    costTaxRate: 0.13,
  };
  const effectiveConfig = buildEffectiveConfig(BASE_PRICE_CONFIG, override);

  assert(
    effectiveConfig.costAccessoryPrice === 20,
    '2a: 覆盖后 effectiveConfig.costAccessoryPrice 应为 20',
  );

  const resultsWithOverride = calculateGroupedResults(
    SAMPLE_ITEMS,
    effectiveConfig,
    false,
    SAMPLE_COST_DB,
  );

  // 2b. costAccessoryCost 应该用覆盖值 × 数量 = 20 × 10 = 200
  assertApprox(
    resultsWithOverride[0].costAccessoryCost!,
    200,
    0.01,
    '2b: 覆盖 costAccessoryPrice=20 → costAccessoryCost = 20 × 10 = 200',
  );

  // 2c. costCuttingCost 用覆盖值（此场景未改，仍为 2.1）
  assertApprox(
    resultsWithOverride[0].costCuttingCost!,
    21,
    0.01,
    '2c: costCuttingCost = 2.1 × 10 = 21 (未覆盖)',
  );

  // 2d. costGrandTotal 应反映覆盖后的总成本
  // 批量模式：材料 + costAccessory + costCutting + 税
  // 材料 = totalBars * 3.15 * 27 (costMaterial from costDb)
  const totalBars = resultsWithOverride[0].totalBars;
  const expectedMaterial = totalBars * 3.15 * 27;
  const expectedSubTotal = expectedMaterial + 200 + 21;
  const expectedTax = expectedSubTotal * 0.13;
  const expectedGrandTotal = expectedSubTotal + expectedTax;
  assertApprox(
    resultsWithOverride[0].costGrandTotal!,
    Number(expectedGrandTotal.toFixed(2)),
    0.02,
    '2d: costGrandTotal 应反映覆盖后总成本 (材料+200+21+税)',
  );

  // 2e. 覆盖 costCuttingFee 为 5
  const override2: CostOverride = {
    costAccessoryPrice: 10.5,
    costCuttingFee: 5,
    costTaxRate: 0.13,
  };
  const effectiveConfig2 = buildEffectiveConfig(BASE_PRICE_CONFIG, override2);
  const resultsOverride2 = calculateGroupedResults(
    SAMPLE_ITEMS,
    effectiveConfig2,
    false,
    SAMPLE_COST_DB,
  );
  assertApprox(
    resultsOverride2[0].costCuttingCost!,
    50,
    0.01,
    '2e: 覆盖 costCuttingFee=5 → costCuttingCost = 5 × 10 = 50',
  );

  // 2f. 覆盖 costTaxRate 为 0.06
  const override3: CostOverride = {
    costAccessoryPrice: 10.5,
    costCuttingFee: 2.1,
    costTaxRate: 0.06,
  };
  const effectiveConfig3 = buildEffectiveConfig(BASE_PRICE_CONFIG, override3);
  const resultsOverride3 = calculateGroupedResults(
    SAMPLE_ITEMS,
    effectiveConfig3,
    false,
    SAMPLE_COST_DB,
  );
  // 验证税率影响：subTotal = 材料 + 105 + 21
  const subTotal3 = expectedMaterial + 105 + 21;
  const expectedTax3 = subTotal3 * 0.06;
  assertApprox(
    resultsOverride3[0].costTaxCost!,
    Number(expectedTax3.toFixed(2)),
    0.02,
    '2f: 覆盖 costTaxRate=0.06 → costTaxCost 应按 6% 计算',
  );
});

describe('场景3: 覆盖不影响全局', () => {
  const originalGlobal = { ...BASE_PRICE_CONFIG };
  const override: CostOverride = {
    costAccessoryPrice: 99,
    costCuttingFee: 88,
    costTaxRate: 0.5,
  };

  // 构造 effectiveConfig
  const effectiveConfig = buildEffectiveConfig(BASE_PRICE_CONFIG, override);

  // 3a. 全局 priceConfig 不被修改
  assert(
    BASE_PRICE_CONFIG.costAccessoryPrice === 10.5,
    '3a: 全局 costAccessoryPrice 不变 (仍为 10.5)',
  );
  assert(
    BASE_PRICE_CONFIG.costCuttingFee === 2.1,
    '3a: 全局 costCuttingFee 不变 (仍为 2.1)',
  );
  assert(
    BASE_PRICE_CONFIG.costTaxRate === 0.13,
    '3a: 全局 costTaxRate 不变 (仍为 0.13)',
  );

  // 3b. effectiveConfig 的 cost* 字段已被覆盖
  assert(
    effectiveConfig.costAccessoryPrice === 99,
    '3b: effectiveConfig.costAccessoryPrice = 99 (覆盖值)',
  );
  assert(
    effectiveConfig.costCuttingFee === 88,
    '3b: effectiveConfig.costCuttingFee = 88 (覆盖值)',
  );
  assert(
    effectiveConfig.costTaxRate === 0.5,
    '3b: effectiveConfig.costTaxRate = 0.5 (覆盖值)',
  );

  // 3c. effectiveConfig 的非 cost* 字段保持全局值
  assert(
    effectiveConfig.materialPrice === BASE_PRICE_CONFIG.materialPrice,
    '3c: effectiveConfig.materialPrice 保持全局值',
  );
  assert(
    effectiveConfig.quoteAccessoryPrice === BASE_PRICE_CONFIG.quoteAccessoryPrice,
    '3c: effectiveConfig.quoteAccessoryPrice 保持全局值',
  );

  // 3d. 原始对象引用未被修改（深拷贝验证）
  assert(
    originalGlobal.costAccessoryPrice === BASE_PRICE_CONFIG.costAccessoryPrice,
    '3d: 原始全局配置快照未被污染',
  );
});

describe('场景4: 历史保存含覆盖值', () => {
  const override: CostOverride = {
    costAccessoryPrice: 25,
    costCuttingFee: 3.5,
    costTaxRate: 0.1,
  };

  // 模拟计算结果
  const effectiveConfig = buildEffectiveConfig(BASE_PRICE_CONFIG, override);
  const results = calculateGroupedResults(
    SAMPLE_ITEMS,
    effectiveConfig,
    false,
    SAMPLE_COST_DB,
  );

  // 模拟 saveCurrentToHistory
  const historyRecord = buildHistorySnapshot(
    BASE_PRICE_CONFIG,
    override,
    SAMPLE_ITEMS,
    results,
  );

  // 4a. HistoryRecord.priceConfig 应为 effectiveConfig（含覆盖值）
  assert(
    historyRecord.priceConfig.costAccessoryPrice === 25,
    '4a: 历史快照 costAccessoryPrice = 25 (覆盖值)',
  );
  assert(
    historyRecord.priceConfig.costCuttingFee === 3.5,
    '4a: 历史快照 costCuttingFee = 3.5 (覆盖值)',
  );
  assert(
    historyRecord.priceConfig.costTaxRate === 0.1,
    '4a: 历史快照 costTaxRate = 0.1 (覆盖值)',
  );

  // 4b. 历史快照的 quote* 字段保持全局值
  assert(
    historyRecord.priceConfig.quoteAccessoryPrice === BASE_PRICE_CONFIG.quoteAccessoryPrice,
    '4b: 历史快照 quoteAccessoryPrice 保持全局值',
  );

  // 4c. 无覆盖时，历史快照 priceConfig 等于全局配置
  const historyNoOverride = buildHistorySnapshot(
    BASE_PRICE_CONFIG,
    null,
    SAMPLE_ITEMS,
    calculateGroupedResults(SAMPLE_ITEMS, BASE_PRICE_CONFIG, false, SAMPLE_COST_DB),
  );
  assert(
    historyNoOverride.priceConfig.costAccessoryPrice === BASE_PRICE_CONFIG.costAccessoryPrice,
    '4c: 无覆盖时历史快照 costAccessoryPrice = 全局值',
  );
});

describe('场景5: 历史载入恢复覆盖', () => {
  // 5a. 载入含覆盖值的历史记录 → 自动检测差异 → setCostOverride
  const overrideHistory: HistoryRecord = buildHistorySnapshot(
    BASE_PRICE_CONFIG,
    {
      costAccessoryPrice: 30,
      costCuttingFee: 4,
      costTaxRate: 0.09,
    },
    SAMPLE_ITEMS,
    calculateGroupedResults(
      SAMPLE_ITEMS,
      buildEffectiveConfig(BASE_PRICE_CONFIG, {
        costAccessoryPrice: 30,
        costCuttingFee: 4,
        costTaxRate: 0.09,
      }),
      false,
      SAMPLE_COST_DB,
    ),
  );

  // 模拟 onLoadRecord 中的差异检测
  const detectedOverride = detectCostOverride(
    BASE_PRICE_CONFIG,
    overrideHistory.priceConfig,
  );

  assert(
    detectedOverride !== null,
    '5a: 检测到差异时 costOverride 不为 null',
  );
  assert(
    detectedOverride!.costAccessoryPrice === 30,
    '5a: 检测到 costAccessoryPrice = 30',
  );
  assert(
    detectedOverride!.costCuttingFee === 4,
    '5a: 检测到 costCuttingFee = 4',
  );
  assert(
    detectedOverride!.costTaxRate === 0.09,
    '5a: 检测到 costTaxRate = 0.09',
  );

  // 5b. 载入无覆盖的历史记录 → costOverride = null
  const noOverrideHistory: HistoryRecord = buildHistorySnapshot(
    BASE_PRICE_CONFIG,
    null,
    SAMPLE_ITEMS,
    calculateGroupedResults(SAMPLE_ITEMS, BASE_PRICE_CONFIG, false, SAMPLE_COST_DB),
  );

  const detectedNull = detectCostOverride(
    BASE_PRICE_CONFIG,
    noOverrideHistory.priceConfig,
  );

  assert(
    detectedNull === null,
    '5b: 无差异时 costOverride = null',
  );

  // 5c. 部分字段有差异（仅 costAccessoryPrice 不同）
  const partialOverrideHistory: HistoryRecord = buildHistorySnapshot(
    BASE_PRICE_CONFIG,
    {
      costAccessoryPrice: 15,
      costCuttingFee: 2.1,
      costTaxRate: 0.13,
    },
    SAMPLE_ITEMS,
    calculateGroupedResults(
      SAMPLE_ITEMS,
      buildEffectiveConfig(BASE_PRICE_CONFIG, {
        costAccessoryPrice: 15,
        costCuttingFee: 2.1,
        costTaxRate: 0.13,
      }),
      false,
      SAMPLE_COST_DB,
    ),
  );

  const detectedPartial = detectCostOverride(
    BASE_PRICE_CONFIG,
    partialOverrideHistory.priceConfig,
  );

  assert(
    detectedPartial !== null,
    '5c: 仅一个字段不同时也应检测到覆盖',
  );
  assert(
    detectedPartial!.costAccessoryPrice === 15,
    '5c: 检测到 costAccessoryPrice = 15',
  );
});

describe('场景6: 清空工作区重置覆盖', () => {
  // 模拟 handleClearAll 逻辑
  let costOverrideState: CostOverride | null = {
    costAccessoryPrice: 50,
    costCuttingFee: 5,
    costTaxRate: 0.2,
  };

  // 模拟 handleClearAll: setCostOverride(null)
  const handleClearAll = () => {
    costOverrideState = null;
  };

  // 初始状态：有覆盖
  assert(
    costOverrideState !== null,
    '6a: 初始状态有覆盖 (非 null)',
  );

  // 执行清空
  handleClearAll();

  assert(
    costOverrideState === null,
    '6b: handleClearAll 后 costOverride = null',
  );

  // 验证清空后 effectiveConfig 回退全局
  const effectiveConfig = buildEffectiveConfig(BASE_PRICE_CONFIG, costOverrideState);
  assert(
    effectiveConfig.costAccessoryPrice === BASE_PRICE_CONFIG.costAccessoryPrice,
    '6c: 清空后 effectiveConfig 回退全局 costAccessoryPrice',
  );
});

// ═════════════════════════════════════════════════════════════════════
// 附加：边界条件测试
// ═════════════════════════════════════════════════════════════════════

describe('边界条件: 覆盖值为 0', () => {
  const zeroOverride: CostOverride = {
    costAccessoryPrice: 0,
    costCuttingFee: 0,
    costTaxRate: 0,
  };
  const effectiveConfig = buildEffectiveConfig(BASE_PRICE_CONFIG, zeroOverride);
  const results = calculateGroupedResults(
    SAMPLE_ITEMS,
    effectiveConfig,
    false,
    SAMPLE_COST_DB,
  );

  assert(
    results[0].costAccessoryCost === 0,
    '边界: costAccessoryPrice=0 → costAccessoryCost=0',
  );
  assert(
    results[0].costCuttingCost === 0,
    '边界: costCuttingFee=0 → costCuttingCost=0',
  );
  assert(
    results[0].costTaxCost === 0,
    '边界: costTaxRate=0 → costTaxCost=0',
  );
  // costGrandTotal = 材料 + 0 + 0 + 0 = 材料
  const expectedMaterial = results[0].totalBars * 3.15 * 27;
  assertApprox(
    results[0].costGrandTotal!,
    Number(expectedMaterial.toFixed(2)),
    0.02,
    '边界: 税率为0时 costGrandTotal = 纯材料成本',
  );
});

describe('边界条件: 零散单模式覆盖', () => {
  const retailConfig: PriceConfig = {
    ...BASE_PRICE_CONFIG,
    mode: PricingMode.RETAIL,
  };
  const override: CostOverride = {
    costAccessoryPrice: 18,
    costCuttingFee: 3,
    costTaxRate: 0.1,
  };
  const effectiveConfig = buildEffectiveConfig(retailConfig, override);
  const results = calculateGroupedResults(
    SAMPLE_ITEMS,
    effectiveConfig,
    false,
    SAMPLE_COST_DB,
  );

  // 零散模式 costAccessoryCost = costAccessoryPrice × quantity = 18 × 10 = 180
  assertApprox(
    results[0].costAccessoryCost!,
    180,
    0.01,
    '零散模式: costAccessoryCost = 18 × 10 = 180',
  );
  assertApprox(
    results[0].costCuttingCost!,
    30,
    0.01,
    '零散模式: costCuttingCost = 3 × 10 = 30',
  );
});

describe('边界条件: 多分组覆盖一致性', () => {
  const multiItems: FrameItem[] = [
    {
      id: 'item-1',
      model: '型号A',
      color: '黑色',
      sizeType: SizeType.OD,
      width: 100,
      height: 80,
      quantity: 5,
    },
    {
      id: 'item-2',
      model: '型号B',
      color: '银色',
      sizeType: SizeType.OD,
      width: 120,
      height: 90,
      quantity: 8,
    },
  ];
  const multiCostDb: CostRecord[] = [
    {
      id: 'c1',
      model: '型号A',
      color: '黑色',
      materialCost: 25,
      weightPerMeter: 0.8,
      notes: '',
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'c2',
      model: '型号B',
      color: '银色',
      materialCost: 30,
      weightPerMeter: 0.9,
      notes: '',
      updatedAt: new Date().toISOString(),
    },
  ];

  const override: CostOverride = {
    costAccessoryPrice: 15,
    costCuttingFee: 3.5,
    costTaxRate: 0.1,
  };
  const effectiveConfig = buildEffectiveConfig(BASE_PRICE_CONFIG, override);
  const results = calculateGroupedResults(
    multiItems,
    effectiveConfig,
    false,
    multiCostDb,
  );

  assert(
    results.length === 2,
    '多分组: 应产生 2 个分组结果',
  );

  // 分组1: 型号A, quantity=5 → costAccessoryCost = 15 × 5 = 75
  assertApprox(
    results[0].costAccessoryCost!,
    75,
    0.01,
    '多分组[0]: costAccessoryCost = 15 × 5 = 75',
  );

  // 分组2: 型号B, quantity=8 → costAccessoryCost = 15 × 8 = 120
  assertApprox(
    results[1].costAccessoryCost!,
    120,
    0.01,
    '多分组[1]: costAccessoryCost = 15 × 8 = 120',
  );
});

// ═════════════════════════════════════════════════════════════════════
// 汇总输出
// ═════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════════');
console.log(`  测试汇总: ${totalTests} 项 | 通过: ${passedTests} | 失败: ${failedTests}`);
console.log('══════════════════════════════════════════════════\n');

if (failedTests > 0) {
  console.error('❌ 失败项明细:');
  failedDetails.forEach((d, i) => console.error(`   ${i + 1}. ${d}`));
  process.exit(1);
} else {
  console.log('✅ 全部测试通过！');
  process.exit(0);
}

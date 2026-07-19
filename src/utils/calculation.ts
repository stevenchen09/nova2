
import { FrameItem, CalculatedEdge, BarPlan, GroupResult, SizeType, PricingMode, PriceConfig, QuotationLineItem, CostRecord, PackingComparison } from '../types';
import { BAR_FULL_LENGTH, BAR_USABLE_LENGTH, CUTTING_LOSS, WALL_THICKNESS } from '../constants';

/**
 * V3 双轨制计算结果 — 报价轨道与成本轨道并行输出
 *
 * 报价轨道（quote）：使用 quote* 费率，用于给客户看的报价单
 * 成本轨道（cost）：使用 cost* 费率，用于内部利润核算
 */
export interface QuoteTrack {
  materialCost: number;
  accessoryCost: number;
  cuttingCost: number;
  taxCost: number;
  subTotal: number;
  grandTotal: number;
}

export interface CostTrack {
  materialCost: number;       // 与报价轨道相同（材料单价不变）
  accessoryCost: number;      // 使用 costAccessoryPrice
  cuttingCost: number;        // 使用 costCuttingFee
  taxCost: number;            // 使用 costTaxRate
  subTotal: number;
  grandTotal: number;
}

export interface DualCalculationResult {
  quote: QuoteTrack;
  cost: CostTrack;
  profit: number;             // 毛利 = quote.grandTotal - cost.grandTotal
  profitRate: number;         // 利润率 = profit / quote.grandTotal
}

/**
 * FFD（First-Fit Decreasing）排料算法
 * 按长度降序排序后，每条边装入第一支能容纳它的料，装不下则开新料。
 */
export function packFFD(edges: CalculatedEdge[], barUsableLength: number): BarPlan[] {
  const sorted = [...edges].sort((a, b) => b.length - a.length);
  const plans: BarPlan[] = [];
  for (const edge of sorted) {
    let placed = false;
    for (const plan of plans) {
      if (edge.length <= plan.remaining) {
        plan.segments.push(edge);
        plan.remaining = Number((plan.remaining - edge.length).toFixed(4));
        placed = true;
        break;
      }
    }
    if (!placed) {
      plans.push({
        totalUsableLength: barUsableLength,
        segments: [edge],
        remaining: Number((barUsableLength - edge.length).toFixed(4)),
      });
    }
  }
  return plans;
}

/**
 * Optimal 排料算法（DP 背包 + 最长边优先）
 *
 * 算法：
 *   1. 所有边按长度降序排序
 *   2. 取最长边作为当前支料基准（必装）
 *   3. 在剩余短边中用 0-1 背包 DP 找出能装入剩余空间且总长最大的组合
 *   4. 装完后移除已装边，开下一支料，重复直到所有边装完
 *
 * 边长离散化到毫米（×1000 取整）以适用 DP。
 * 复杂度 O(n × W)，n<100, W<3050，<5ms。
 *
 * 与 FFD/BFD 的区别：每支料都找出"最优装入组合"（使浪费最少），
 * 而不是逐条边贪心选择。
 */
export function packOptimal(edges: CalculatedEdge[], barUsableLength: number): BarPlan[] {
  const SCALE = 1000;
  const capacity = Math.floor(barUsableLength * SCALE);
  // 使用副本，不修改入参（纯函数）
  const sorted = [...edges].sort((a, b) => b.length - a.length);
  const remaining = [...sorted];
  const plans: BarPlan[] = [];

  while (remaining.length > 0) {
    // 最长边作为基准，必装
    const firstEdge = remaining[0];
    const firstW = Math.floor(firstEdge.length * SCALE);

    if (firstW > capacity) {
      // 超长边单独装一支（实际业务中罕见）
      plans.push({
        totalUsableLength: barUsableLength,
        segments: [firstEdge],
        remaining: Number((barUsableLength - firstEdge.length).toFixed(4)),
      });
      remaining.shift();
      continue;
    }

    // 剩余容量（毫米）
    const subCapacity = capacity - firstW;
    // 候选边（除第一条外）
    const candidates = remaining.slice(1);
    const n = candidates.length;

    // 0-1 背包 DP：在 candidates 中选若干，总长 ≤ subCapacity，使总长最大
    // dp[j] = 容量 j 时的最大总长（离散值）
    const dp = new Int32Array(subCapacity + 1);
    // selected[i][j] = 1 表示在容量 j 时选中了 candidates[i]
    const selected: Uint8Array[] = [];
    for (let i = 0; i < n; i++) {
      selected.push(new Uint8Array(subCapacity + 1));
    }

    for (let i = 0; i < n; i++) {
      const w = Math.floor(candidates[i].length * SCALE);
      if (w > subCapacity) continue;
      for (let j = subCapacity; j >= w; j--) {
        if (dp[j - w] + w > dp[j]) {
          dp[j] = dp[j - w] + w;
          selected[i][j] = 1;
        }
      }
    }

    // 回溯找出选中的 candidates 索引
    const chosenIdx: number[] = [];
    let j = subCapacity;
    for (let i = n - 1; i >= 0; i--) {
      if (selected[i][j] === 1) {
        chosenIdx.push(i);
        j -= Math.floor(candidates[i].length * SCALE);
      }
    }

    // 构造本支料的 segments（firstEdge + 选中的短边）
    const segEdges: CalculatedEdge[] = [firstEdge];
    for (const idx of chosenIdx) {
      segEdges.push(candidates[idx]);
    }
    const totalLen = segEdges.reduce((s, e) => s + e.length, 0);
    plans.push({
      totalUsableLength: barUsableLength,
      segments: segEdges,
      remaining: Number((barUsableLength - totalLen).toFixed(4)),
    });

    // 从 remaining 移除：先移除 chosenIdx（在 candidates 即 remaining[1:] 中的索引）
    // 必须从大到小移除以避免索引错位
    chosenIdx.sort((a, b) => b - a);
    for (const idx of chosenIdx) {
      remaining.splice(idx + 1, 1); // +1 因为 candidates = remaining.slice(1)
    }
    // 最后移除 firstEdge（索引 0）
    remaining.shift();
  }

  return plans;
}

/**
 * 核心逻辑：合并算料与报价（并计算成本与毛利）
 *
 * V2 重构要点：
 * 1. 成本公式：材料 + 全局配件(按套) + 全局切割(按米) + 税金(按小计)
 * 2. 查价增强：标记 exact / model-fallback 来源
 * 3. 重量计算：优先使用 CostRecord.weightPerMeter，回退到 config.defaultWeightPerMeter
 * 4. 零散模式切割长度 = 周长 * 1.2 系数
 *
 * V3 字段重命名：
 * - globalAccessoryPrice → quoteAccessoryPrice
 * - globalCuttingFee → quoteCuttingFee
 * - globalTaxRate → quoteTaxRate
 *
 * V3 双轨制改造（T04）：
 * - 新增成本轨道计算（使用 cost* 费率字段）
 * - 返回值中新增 cost* / dual* 字段段
 * - 利润 = 报价总额 - 成本总额（真实毛利）
 */
export const calculateGroupedResults = (
  items: FrameItem[],
  config: PriceConfig,
  includeWeight: boolean = false,
  costDatabase: CostRecord[] = []
): GroupResult[] => {
  // 1. 严格按型号和颜色分组
  const groups: Record<string, FrameItem[]> = {};
  items.forEach(item => {
    const key = `${item.model || '未指定型号'}-${item.color || '未指定颜色'}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  const results: GroupResult[] = [];

  Object.keys(groups).forEach(key => {
    const groupItems = groups[key];
    const { model, color } = groupItems[0];
    const totalQuantity = groupItems.reduce((sum, item) => sum + item.quantity, 0);

    // 2. 将组内所有尺寸的边长汇总到"待切池"，实现合并算料
    let allEdges: CalculatedEdge[] = [];
    groupItems.forEach(item => {
      const widthM = item.width / 100;
      const heightM = item.height / 100;

      const widthAdj = item.sizeType === SizeType.ID
        ? widthM + CUTTING_LOSS + WALL_THICKNESS
        : widthM + CUTTING_LOSS;

      const heightAdj = item.sizeType === SizeType.ID
        ? heightM + CUTTING_LOSS + WALL_THICKNESS
        : heightM + CUTTING_LOSS;

      // 每个框有 2 条横边 2 条纵边
      for (let i = 0; i < item.quantity * 2; i++) {
        allEdges.push({
          length: Number(widthAdj.toFixed(4)),
          sourceId: item.id,
          description: `${item.width}x${item.height} ${item.sizeType} (宽)`
        });
        allEdges.push({
          length: Number(heightAdj.toFixed(4)),
          sourceId: item.id,
          description: `${item.width}x${item.height} ${item.sizeType} (高)`
        });
      }
    });

    // 双算法并行：FFD + Optimal(DP背包)
    const ffdPlans = packFFD(allEdges, BAR_USABLE_LENGTH);
    const optimalPlans = packOptimal(allEdges, BAR_USABLE_LENGTH);

    // 一致性校验：两种算法 segments 总长度必须 ≈ allEdges 总长度（容差 0.0001）
    const allEdgesSum = allEdges.reduce((s, e) => s + e.length, 0);
    const ffdSum = ffdPlans.reduce((s, p) => s + p.segments.reduce((ss, e) => ss + e.length, 0), 0);
    const optimalSum = optimalPlans.reduce((s, p) => s + p.segments.reduce((ss, e) => ss + e.length, 0), 0);
    const tolerance = 0.0001;

    let plans: BarPlan[];
    let packingComparison: PackingComparison | undefined;

    if (Math.abs(ffdSum - allEdgesSum) < tolerance && Math.abs(optimalSum - allEdgesSum) < tolerance) {
      // 校验通过：比较 barCount 选优
      const ffdBarCount = ffdPlans.length;
      const optimalBarCount = optimalPlans.length;
      const ffdRemainingTotal = ffdPlans.reduce((s, p) => s + p.remaining, 0);
      const optimalRemainingTotal = optimalPlans.reduce((s, p) => s + p.remaining, 0);

      // Optimal 支数严格小于 FFD 才选 Optimal，否则（含相等）默认 FFD
      const selected: 'FFD' | 'OPT' = optimalBarCount < ffdBarCount ? 'OPT' : 'FFD';
      plans = selected === 'OPT' ? optimalPlans : ffdPlans;

      packingComparison = {
        ffd: { barCount: ffdBarCount, remainingTotal: Number(ffdRemainingTotal.toFixed(4)) },
        opt: { barCount: optimalBarCount, remainingTotal: Number(optimalRemainingTotal.toFixed(4)) },
        selected,
      };
    } else {
      // 校验失败：回退 FFD
      console.warn('[排料校验失败] FFD/Optimal segments 总长与 allEdges 不一致，回退 FFD', {
        allEdgesSum, ffdSum, optimalSum,
      });
      plans = ffdPlans;
      packingComparison = undefined;
    }

    const totalBars = plans.length;

    // ---- 3. 查价逻辑（四级链路：精确匹配 → 复用规则 → 型号回退 → 估算）----
    const modelLower = model.trim().toLowerCase();
    const colorLower = color.trim().toLowerCase();

    // 1. 精确匹配：型号 + 颜色
    const exactMatch = costDatabase.find(
      r => r.model.trim().toLowerCase() === modelLower &&
           r.color.trim().toLowerCase() === colorLower
    );

    let costRecord: CostRecord | undefined = exactMatch;
    let priceSource: 'exact' | 'reuse' | 'model-fallback' = 'exact';

    // 2. 复用规则匹配：查找 sourceColor === color 的规则，再在同型号中找 targetColor
    if (!costRecord) {
      const reuseRule = config.colorReuseRules?.find(
        rule => rule.sourceColor.trim().toLowerCase() === colorLower
      );
      if (reuseRule) {
        const targetLower = reuseRule.targetColor.trim().toLowerCase();
        const reuseMatch = costDatabase.find(
          r => r.model.trim().toLowerCase() === modelLower &&
               r.color.trim().toLowerCase() === targetLower
        );
        if (reuseMatch) {
          costRecord = reuseMatch;
          priceSource = 'reuse';
        }
      }
    }

    // 3. 型号回退：仅型号匹配
    if (!costRecord) {
      const modelFallback = costDatabase.find(
        r => r.model.trim().toLowerCase() === modelLower
      );
      if (modelFallback) {
        costRecord = modelFallback;
        priceSource = 'model-fallback';
      }
    }

    // 4. 估算
    const costMaterial = costRecord ? costRecord.materialCost : (config.materialPrice * 0.6);
    const actualWeightPerMeter = costRecord?.weightPerMeter ?? config.defaultWeightPerMeter;

    // 计算总切割长度（从 allEdges 中累加所有边的长度）
    const totalCuttingLength = allEdges.reduce((sum, edge) => sum + edge.length, 0);

    // 4. 计算报价与成本 (V3 双轨制: quote* 报价费率 + cost* 成本费率)
    let totalPrice = 0;
    const lineItems: QuotationLineItem[] = [];

    // ── 报价轨道（quote track）─ 使用 quote* 费率 ──
    let materialCostGroup = 0;      // 材料成本（两轨道相同）
    let accessoryCostGroup = 0;     // 配件成本（报价费率）
    let cuttingCostGroup = 0;       // 切工成本（报价费率）
    let taxCostGroup = 0;           // 税金（报价费率）
    let totalCost = 0;              // 报价轨道总成本

    // ── 成本轨道（cost track）─ 使用 cost* 费率 ──
    let costAccessoryCostGroup = 0;   // 配件成本（成本费率）
    let costCuttingCostGroup = 0;     // 切工成本（成本费率）
    let costTaxCostGroup = 0;         // 税金（成本税率）
    let totalCostReal = 0;            // 成本轨道总成本

    if (config.mode === PricingMode.BATCH) {
      // ── 批量单模式 ──
      // V4 修复：切工费改为"按个"计算（元/个 × 数量），不再按米×长度
      const avgMeters = (totalBars * BAR_FULL_LENGTH) / totalQuantity;
      // 单框切割工费 = quoteCuttingFee（每框固定工费，不再除以长度）
      const perFrameCuttingCost = config.quoteCuttingFee;
      const uPrice = ((avgMeters * config.materialPrice) + config.quoteAccessoryPrice + perFrameCuttingCost) * (1 + config.quoteTaxRate);

      groupItems.forEach(item => {
        const itemTotal = uPrice * item.quantity;
        totalPrice += itemTotal;
        lineItems.push({
          id: item.id, model, color, size: `${item.width}x${item.height} (${item.sizeType})`,
          unitPrice: Number(uPrice.toFixed(2)), quantity: item.quantity, totalPrice: Number(itemTotal.toFixed(2))
        });
      });

      // === 报价轨道成本计算 ===
      materialCostGroup = totalBars * BAR_FULL_LENGTH * costMaterial;
      accessoryCostGroup = totalQuantity * config.quoteAccessoryPrice;
      // V4: 切工费 = 每个工费 × 数量
      cuttingCostGroup = totalQuantity * config.quoteCuttingFee;
      const subTotalQuote = materialCostGroup + accessoryCostGroup + cuttingCostGroup;
      taxCostGroup = subTotalQuote * config.quoteTaxRate;
      totalCost = subTotalQuote + taxCostGroup;

      // === 成本轨道成本计算 🆕 ===
      costAccessoryCostGroup = totalQuantity * config.costAccessoryPrice;
      // V4: 切工费 = 每个工费 × 数量
      costCuttingCostGroup = totalQuantity * config.costCuttingFee;
      const subTotalCost = materialCostGroup + costAccessoryCostGroup + costCuttingCostGroup;  // 材料相同
      costTaxCostGroup = subTotalCost * config.costTaxRate;
      totalCostReal = subTotalCost + costTaxCostGroup;

    } else {
      // ── 零散单模式 ──
      // V4 修复：切工费改为"按个"计算（元/个 × 数量），不再按米×长度
      groupItems.forEach(item => {
        const perimeterM = ((item.width + item.height) * 2) / 100;
        const retailCuttingLength = perimeterM * 1.2;
        // V4: 切工费 = 每个固定工费，不再乘以长度
        const perFrameCuttingCost = config.quoteCuttingFee;
        const uPrice = ((retailCuttingLength * config.materialPrice) + config.quoteAccessoryPrice + perFrameCuttingCost) * (1 + config.quoteTaxRate);
        const itemTotal = uPrice * item.quantity;
        totalPrice += itemTotal;
        lineItems.push({
          id: item.id, model, color, size: `${item.width}x${item.height} (${item.sizeType})`,
          unitPrice: Number(uPrice.toFixed(2)), quantity: item.quantity, totalPrice: Number(itemTotal.toFixed(2))
        });

        // 累计每个项的零散报价轨道成本 (V4: 切工按个计费)
        const itemMaterialCost = retailCuttingLength * costMaterial * item.quantity;
        const itemAccessoryCost = config.quoteAccessoryPrice * item.quantity;
        const itemCuttingCost = config.quoteCuttingFee * item.quantity;

        materialCostGroup += itemMaterialCost;
        accessoryCostGroup += itemAccessoryCost;
        cuttingCostGroup += itemCuttingCost;

        // 累计每个项的零散成本轨道成本 🆕 (V4: 切工按个计费)
        const costItemAccessoryCost = config.costAccessoryPrice * item.quantity;
        const costItemCuttingCost = config.costCuttingFee * item.quantity;

        costAccessoryCostGroup += costItemAccessoryCost;
        costCuttingCostGroup += costItemCuttingCost;
      });

      // 零散模式报价轨道税金 & 总成本
      const subTotalQuote = materialCostGroup + accessoryCostGroup + cuttingCostGroup;
      taxCostGroup = subTotalQuote * config.quoteTaxRate;
      totalCost = subTotalQuote + taxCostGroup;

      // 零散模式成本轨道税金 & 总成本 🆕
      const subTotalCost = materialCostGroup + costAccessoryCostGroup + costCuttingCostGroup;
      costTaxCostGroup = subTotalCost * config.costTaxRate;
      totalCostReal = subTotalCost + costTaxCostGroup;
    }

    // === V3 双轨制：利润使用真实成本（成本轨道）计算 🆕 ===
    const dualProfit = totalPrice - totalCostReal;
    const dualProfitRate = totalPrice > 0 ? (dualProfit / totalPrice) * 100 : 0;

    // 🔍 DEBUG: 诊断单价显示问题 — 输出关键中间值
    console.log('[calc Debug]', {
      model, color, mode: config.mode, isBatch: config.mode === PricingMode.BATCH,
      costMaterial, priceSource, costRecord: costRecord ? { model: costRecord.model, color: costRecord.color, materialCost: costRecord.materialCost } : null,
      totalBars, BAR_FULL_LENGTH, materialCostGroup,
      batchExpected: totalBars * BAR_FULL_LENGTH * costMaterial,
    });

    const result: GroupResult = {
      model, color, totalBars, plans, originalItems: groupItems, lineItems,
      totalPrice: Number(totalPrice.toFixed(2)),
      unitPrice: Number((totalPrice / totalQuantity).toFixed(2)),
      totalQuantity,
      avgMetersPerFrame: (totalBars * BAR_FULL_LENGTH) / totalQuantity,
      // ── 报价轨道成本（使用 quote* 费率，原有字段保持不变）──
      totalCost: Number(totalCost.toFixed(2)),
      materialCost: Number(materialCostGroup.toFixed(2)),
      costMaterial: Number(costMaterial.toFixed(4)),  // 🆕 供显示层直接取用，避免除法误差
      accessoryCost: Number(accessoryCostGroup.toFixed(2)),
      cuttingCost: Number(cuttingCostGroup.toFixed(2)),
      taxCost: Number(taxCostGroup.toFixed(2)),       // 单独列示税金
      profit: Number(dualProfit.toFixed(2)),            // 🆕 V3: 使用真实毛利（报价-真实成本）
      profitMargin: Number(dualProfitRate.toFixed(1)),  // 🆕 V3: 使用真实利润率
      // ── 成本轨道（🆕 V3 双轨制：使用 cost* 费率）──
      costAccessoryCost: Number(costAccessoryCostGroup.toFixed(2)),
      costCuttingCost: Number(costCuttingCostGroup.toFixed(2)),
      costTaxCost: Number(costTaxCostGroup.toFixed(2)),
      costGrandTotal: Number(totalCostReal.toFixed(2)),
      // ---- V2 新增字段 ----
      totalCuttingLength: Number(totalCuttingLength.toFixed(4)),
      actualWeightPerMeter: actualWeightPerMeter,
      priceSource,
      packingComparison,
    };

    // 5. 重量计算逻辑 (使用 actualWeightPerMeter)
    if (includeWeight) {
      const groupTotalMeters = totalBars * BAR_FULL_LENGTH;
      const matWeight = groupTotalMeters * actualWeightPerMeter;
      const accWeight = totalQuantity * (config.defaultWeightPerAccessorySet || 0);
      result.materialWeight = Number(matWeight.toFixed(3));
      result.accessoryWeight = Number(accWeight.toFixed(3));
      result.totalWeight = Number((matWeight + accWeight).toFixed(3));
    }

    results.push(result);
  });

  return results;
};

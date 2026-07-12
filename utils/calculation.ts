
import { FrameItem, CalculatedEdge, BarPlan, GroupResult, SizeType, PricingMode, PriceConfig, QuotationLineItem, CostRecord } from '../types';
import { BAR_FULL_LENGTH, BAR_USABLE_LENGTH, CUTTING_LOSS, WALL_THICKNESS } from '../constants';

/**
 * 核心逻辑：合并算料与报价（并计算成本与毛利）
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
    // 确保 key 包含型号和颜色，空值在解析时已处理为统一默认值
    const key = `${item.model || '未指定型号'}-${item.color || '未指定颜色'}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  const results: GroupResult[] = [];

  Object.keys(groups).forEach(key => {
    const groupItems = groups[key];
    const { model, color } = groupItems[0];
    const totalQuantity = groupItems.reduce((sum, item) => sum + item.quantity, 0);
    
    // 2. 将组内所有尺寸的边长汇总到“待切池”，实现合并算料
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

    // 贪心排料算法
    allEdges.sort((a, b) => b.length - a.length);
    const plans: BarPlan[] = [];
    let remainingEdges = [...allEdges];

    while (remainingEdges.length > 0) {
      const currentBar: BarPlan = {
        totalUsableLength: BAR_USABLE_LENGTH,
        segments: [],
        remaining: BAR_USABLE_LENGTH
      };
      let i = 0;
      while (i < remainingEdges.length) {
        if (remainingEdges[i].length <= currentBar.remaining) {
          const edge = remainingEdges.splice(i, 1)[0];
          currentBar.segments.push(edge);
          currentBar.remaining = Number((currentBar.remaining - edge.length).toFixed(4));
        } else {
          i++;
        }
      }
      plans.push(currentBar);
    }

    // 3. 计算报价与成本 (合并后的报价 & 并行成本)
    let totalPrice = 0;
    const lineItems: QuotationLineItem[] = [];
    const totalBars = plans.length;

    // 检索该型号和颜色在成本资料库中的价格
    const costRecord = costDatabase.find(
      r => r.model.trim().toLowerCase() === model.trim().toLowerCase() &&
           r.color.trim().toLowerCase() === color.trim().toLowerCase()
    ) || costDatabase.find(
      r => r.model.trim().toLowerCase() === model.trim().toLowerCase()
    );

    // 如果找不到对应的成本，则默认使用报价的一定比例作为估算成本 (比如材料60%, 配件60%, 切工60%)
    const costMaterial = costRecord ? costRecord.materialCost : (config.materialPrice * 0.6);
    const costAccessory = costRecord ? costRecord.accessoryCost : (config.accessoryPrice * 0.6);
    const costCutting = costRecord ? costRecord.cuttingCost : (config.cuttingFee * 0.6);

    let totalCost = 0;
    let materialCostGroup = 0;
    let accessoryCostGroup = 0;
    let cuttingCostGroup = 0;

    if (config.mode === PricingMode.BATCH) {
      // 批量单模式：((总支数 * 3.15 / 总数量) * 单价 + 配件 + 切工) * 税率
      const avgMeters = (totalBars * BAR_FULL_LENGTH) / totalQuantity;
      const uPrice = ((avgMeters * config.materialPrice) + config.accessoryPrice + config.cuttingFee) * config.taxRate;
      
      groupItems.forEach(item => {
        const itemTotal = uPrice * item.quantity;
        totalPrice += itemTotal;
        lineItems.push({
          id: item.id, model, color, size: `${item.width}x${item.height} (${item.sizeType})`,
          unitPrice: Number(uPrice.toFixed(2)), quantity: item.quantity, totalPrice: Number(itemTotal.toFixed(2))
        });
      });

      // 成本计算 (批量模式)：材料总支数 * 3.15 * 材料成本单价 + 数量 * 配件成本 + 数量 * 切割成本
      materialCostGroup = totalBars * BAR_FULL_LENGTH * costMaterial;
      accessoryCostGroup = totalQuantity * costAccessory;
      cuttingCostGroup = totalQuantity * costCutting;
      totalCost = materialCostGroup + accessoryCostGroup + cuttingCostGroup;
    } else {
      // 零散单模式：每个尺寸按自己的周长算
      groupItems.forEach(item => {
        const perimeterM = ((item.width + item.height) * 2) / 100;
        const uPrice = ((perimeterM * 1.2 * config.materialPrice) + config.accessoryPrice + config.cuttingFee) * config.taxRate;
        const itemTotal = uPrice * item.quantity;
        totalPrice += itemTotal;
        lineItems.push({
          id: item.id, model, color, size: `${item.width}x${item.height} (${item.sizeType})`,
          unitPrice: Number(uPrice.toFixed(2)), quantity: item.quantity, totalPrice: Number(itemTotal.toFixed(2))
        });

        // 累计每个项的零散成本 (零散周长 * 1.2 系数)
        const itemMaterialCost = perimeterM * 1.2 * costMaterial * item.quantity;
        const itemAccessoryCost = costAccessory * item.quantity;
        const itemCuttingCost = costCutting * item.quantity;

        materialCostGroup += itemMaterialCost;
        accessoryCostGroup += itemAccessoryCost;
        cuttingCostGroup += itemCuttingCost;
      });
      totalCost = materialCostGroup + accessoryCostGroup + cuttingCostGroup;
    }

    const profit = totalPrice - totalCost;
    const profitMargin = totalPrice > 0 ? (profit / totalPrice) * 100 : 0;

    const result: GroupResult = {
      model, color, totalBars, plans, originalItems: groupItems, lineItems,
      totalPrice: Number(totalPrice.toFixed(2)),
      unitPrice: Number((totalPrice / totalQuantity).toFixed(2)),
      totalQuantity,
      avgMetersPerFrame: (totalBars * BAR_FULL_LENGTH) / totalQuantity,
      // 注入成本信息
      totalCost: Number(totalCost.toFixed(2)),
      materialCost: Number(materialCostGroup.toFixed(2)),
      accessoryCost: Number(accessoryCostGroup.toFixed(2)),
      cuttingCost: Number(cuttingCostGroup.toFixed(2)),
      profit: Number(profit.toFixed(2)),
      profitMargin: Number(profitMargin.toFixed(1))
    };

    // 4. 重量计算逻辑
    if (includeWeight) {
      const groupTotalMeters = totalBars * BAR_FULL_LENGTH;
      const matWeight = groupTotalMeters * config.weightPerMeter;
      const accWeight = totalQuantity * config.weightPerAccessorySet;
      result.materialWeight = Number(matWeight.toFixed(3));
      result.accessoryWeight = Number(accWeight.toFixed(3));
      result.totalWeight = Number((matWeight + accWeight).toFixed(3));
    }

    results.push(result);
  });

  return results;
};


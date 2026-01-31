
import { FrameItem, CalculatedEdge, BarPlan, GroupResult, SizeType, PricingMode, PriceConfig, QuotationLineItem } from '../types';
import { BAR_FULL_LENGTH, BAR_USABLE_LENGTH, CUTTING_LOSS, WALL_THICKNESS } from '../constants';

export const calculateGroupedResults = (items: FrameItem[], config: PriceConfig): GroupResult[] => {
  const groups: Record<string, FrameItem[]> = {};
  items.forEach(item => {
    const key = `${item.model}-${item.color}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  const results: GroupResult[] = [];

  Object.keys(groups).forEach(key => {
    const groupItems = groups[key];
    const { model, color } = groupItems[0];
    const totalQuantity = groupItems.reduce((sum, item) => sum + item.quantity, 0);
    
    // 1. 物理切割排料计算
    let allEdges: CalculatedEdge[] = [];
    groupItems.forEach(item => {
      const widthM = item.width / 100;
      const heightM = item.height / 100;
      
      const widthAdj = item.sizeType === SizeType.OD 
        ? widthM + CUTTING_LOSS 
        : widthM + CUTTING_LOSS + WALL_THICKNESS;
        
      const heightAdj = item.sizeType === SizeType.OD 
        ? heightM + CUTTING_LOSS 
        : heightM + CUTTING_LOSS + WALL_THICKNESS;

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

    allEdges.sort((a, b) => b.length - a.length);

    const plans: BarPlan[] = [];
    let remainingEdges = [...allEdges];

    while (remainingEdges.length > 0) {
      const currentBar: BarPlan = {
        totalUsableLength: BAR_USABLE_LENGTH,
        segments: [],
        remaining: BAR_USABLE_LENGTH
      };
      let searchIndex = 0;
      while (searchIndex < remainingEdges.length) {
        if (remainingEdges[searchIndex].length <= currentBar.remaining) {
          const edge = remainingEdges.splice(searchIndex, 1)[0];
          currentBar.segments.push(edge);
          currentBar.remaining = Number((currentBar.remaining - edge.length).toFixed(4));
        } else {
          searchIndex++;
        }
      }
      plans.push(currentBar);
    }

    // 2. 报价计算
    let totalPrice = 0;
    let avgMeters = 0;
    const lineItems: QuotationLineItem[] = [];

    if (config.mode === PricingMode.RETAIL) {
      groupItems.forEach(item => {
        const perimeterM = ((item.width + item.height) * 2) / 100;
        const itemMetersWithLoss = perimeterM * 1.2;
        const uPrice = (itemMetersWithLoss * config.materialPrice + config.accessoryPrice + config.cuttingFee) * config.taxRate;
        const itemTotal = uPrice * item.quantity;
        
        totalPrice += itemTotal;
        avgMeters += itemMetersWithLoss * item.quantity;

        lineItems.push({
          id: item.id,
          model: item.model,
          color: item.color,
          size: `${item.width}x${item.height} (${item.sizeType})`,
          unitPrice: Number(uPrice.toFixed(2)),
          quantity: item.quantity,
          totalPrice: Number(itemTotal.toFixed(2))
        });
      });
      avgMeters = avgMeters / totalQuantity;
    } else {
      const totalMeters = plans.length * BAR_FULL_LENGTH;
      avgMeters = totalMeters / totalQuantity;
      const uPrice = (avgMeters * config.materialPrice + config.accessoryPrice + config.cuttingFee) * config.taxRate;
      
      groupItems.forEach(item => {
        const itemTotal = uPrice * item.quantity;
        totalPrice += itemTotal;
        lineItems.push({
          id: item.id,
          model: item.model,
          color: item.color,
          size: `${item.width}x${item.height} (${item.sizeType})`,
          unitPrice: Number(uPrice.toFixed(2)),
          quantity: item.quantity,
          totalPrice: Number(itemTotal.toFixed(2))
        });
      });
    }

    results.push({
      model,
      color,
      totalBars: plans.length,
      plans,
      originalItems: groupItems,
      lineItems,
      totalPrice: Number(totalPrice.toFixed(2)),
      unitPrice: Number((totalPrice / totalQuantity).toFixed(2)),
      totalQuantity,
      avgMetersPerFrame: Number(avgMeters.toFixed(3))
    });
  });

  return results;
};

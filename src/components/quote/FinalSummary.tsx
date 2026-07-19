import React from 'react';
import { GroupResult, PriceConfig } from '../../types';

interface FinalSummaryProps {
  results: GroupResult[];
  priceConfig: PriceConfig;
  showWeight: boolean;
}

/**
 * Bottom final settlement area shown at the end of the quotation results.
 *
 * Displays grand-total quote price, total frame count, and estimated
 * total weight in a dark full-width banner.
 */
const FinalSummary: React.FC<FinalSummaryProps> = ({
  results,
  priceConfig,
  showWeight,
}) => {
  if (results.length === 0) return null;

  const grandTotal = results.reduce(
    (acc: number, g: GroupResult) => acc + g.totalPrice,
    0,
  );
  const totalFrames = results.reduce(
    (acc: number, g: GroupResult) => acc + g.totalQuantity,
    0,
  );
  const totalWeight = results.reduce(
    (acc: number, g: GroupResult) => acc + (g.totalWeight || 0),
    0,
  );

  return (
    <div className="mt-20 bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full -mr-40 -mt-40 blur-3xl" />
      <div className="flex flex-col md:flex-row justify-between items-end gap-8 relative z-10">
        <div className="space-y-1.5">
          <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">
            FINAL QUOTATION
          </h4>
          <p className="text-2xl font-black tracking-tight text-white">
            全单结算最终统计
          </p>
          <p className="text-[10px] text-slate-400 font-bold">
            模式：{priceConfig.mode} ｜ 包含成品框：{totalFrames} 个
          </p>
        </div>

        <div className="text-right">
          <p className="text-[9px] font-black text-slate-400 uppercase mb-1">
            应收合同款
          </p>
          <p className="text-5xl font-black tracking-tighter text-indigo-400">
            ¥ {grandTotal.toLocaleString()}
          </p>
          {showWeight && (
            <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-widest">
              预估成品总重: {totalWeight.toFixed(2)} kg
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FinalSummary;

import React, { useState } from 'react';
import { GroupResult, PriceConfig, PricingMode } from '../../types';
import { BAR_FULL_LENGTH } from '../../constants';

interface ResultsDashboardProps {
  results: GroupResult[];
  showCosts: boolean;
  showWeight: boolean;
  clientName: string;
  priceConfig: PriceConfig;
  /** 是否启用了 per-quote 成本费率覆盖 */
  hasCostOverride: boolean;
  onToggleShowWeight: () => void;
  onCopyQuotation: () => Promise<void>;
  onExportCSV: () => void;
  getGroupedUniquePlans: (
    plans: import('../../types').BarPlan[],
  ) => Array<{ plan: import('../../types').BarPlan; count: number }>;
}

/**
 * Cost / profit dashboard + detailed calculation results table (V3 双轨制版).
 *
 * 变更说明：
 * - 成本明细展示报价轨道四项：材料 / 配件(全局) / 切工(按米) / 税金
 * - V3：每项均展示「单价 × 数量」明细，便于核对资料库取值
 * - V3：新增成本轨道对照项「成本配件(内部)」「成本切工(内部)」
 *   （使用 cost* 费率，对应成本资料库设置值；改成本库不影响报价轨）
 * - 顶部汇总条同步展示成本库配件/切工总额
 */
const ResultsDashboard: React.FC<ResultsDashboardProps> = ({
  results,
  showCosts,
  showWeight,
  clientName,
  priceConfig,
  hasCostOverride,
  onToggleShowWeight,
  onCopyQuotation,
  onExportCSV,
  getGroupedUniquePlans,
}) => {
  // ── 手动线密度覆盖状态 ──────────────────────────────────────────
  // key = `${model}-${color}`，value = 用户手动输入的线密度
  const [weightOverrides, setWeightOverrides] = useState<Record<string, number>>({});

  // Dynamic import to avoid bundling BarVisualizer when no results exist
  const [BarVisualizer, setBarVisualizer] = React.useState<
    React.ComponentType<{ plan: import('../../types').BarPlan; count: number; index: number }> | null
  >(null);

  React.useEffect(() => {
    if (results.length > 0 && !BarVisualizer) {
      import('../BarVisualizer').then((mod) => {
        setBarVisualizer(() => mod.default);
      });
    }
  }, [results.length, BarVisualizer]);

  if (results.length === 0) return null;

  const totalQuote = results.reduce((acc, g) => acc + g.totalPrice, 0);
  const totalCost = results.reduce((acc, g) => acc + (g.totalCost || 0), 0);
  // V2: 汇总各分项成本
  const totalMaterialCost = results.reduce((acc, g) => acc + (g.materialCost || 0), 0);
  const totalAccessoryCost = results.reduce((acc, g) => acc + (g.accessoryCost || 0), 0);
  const totalCuttingCost = results.reduce((acc, g) => acc + (g.cuttingCost || 0), 0);
  const totalTaxCost = results.reduce((acc, g) => acc + (g.taxCost || 0), 0);
  // V3: 成本轨道汇总（来自成本资料库费率）
  const totalCostAccessory = results.reduce((acc, g) => acc + (g.costAccessoryCost || 0), 0);
  const totalCostCutting = results.reduce((acc, g) => acc + (g.costCuttingCost || 0), 0);

  const profit = totalQuote - totalCost;
  const margin = totalQuote > 0 ? (profit / totalQuote) * 100 : 0;

  /** Helper: render a margin badge with color coding by threshold */
  const MarginBadge = ({ value }: { value: number }) => (
    <span
      className={`text-[10px] px-2.5 py-0.5 rounded-full font-black ${
        value >= 40
          ? 'bg-emerald-500/20 text-emerald-400'
          : value >= 25
            ? 'bg-blue-500/20 text-blue-400'
            : value >= 0
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-red-500/20 text-rose-400 animate-pulse'
      }`}
    >
      毛利率: {value.toFixed(1)}%
    </span>
  );

  /**
   * 渲染单组的成本明细分解（V3 双轨制：报价轨道 + 成本轨道）
   *
   * - 报价轨道：materialCost / accessoryCost / cuttingCost / taxCost
   *   使用 quote* 费率计算，决定客户报价与毛利
   * - 成本轨道：costAccessoryCost / costCuttingCost / costTaxCost / costGrandTotal
   *   使用 cost* 费率计算，对应"成本资料库"中设置的值
   *
   * 每项均展示「单价 × 数量 = 总价」格式，便于核对资料库取值。
   */
  const renderCostBreakdown = (group: GroupResult) => {
    // 🐛 FIX: 直接使用 costMaterial 作为单价，避免在零散单(按周长)模式下
    // 用 materialCost / (totalBars × BAR_FULL_LENGTH) 导致单价错误。
    // 零散单模式下 materialCost = sum(perimeter × 1.2 × costMaterial × qty)，
    // 与 totalBars × BAR_FULL_LENGTH 无比例关系，除法得出的"单价"不等于 costMaterial。
    // 批量单模式下 materialCost = totalBars × BAR_FULL_LENGTH × costMaterial，
    // 此时 materialCost / costMaterial = totalBars × BAR_FULL_LENGTH，结果一致。
    const matUnitPrice = group.costMaterial ?? 0;
    const matMeters = matUnitPrice > 0
      ? (group.materialCost ?? 0) / matUnitPrice
      : group.totalBars * BAR_FULL_LENGTH; // 兼容旧数据(无 costMaterial 字段)
    const qty = Math.max(group.totalQuantity, 1);

    return (
      <div className="mt-3">
        {/* 双轨制说明 */}
        <p className="text-[9px] text-slate-400 font-medium mb-1.5">
          ⚠ 成本明细分两轨：上方「报价」按报价费率计（决定客户价/毛利），下方「成本」按成本资料库费率计（改成本库不影响报价轨）
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {/* ── 报价轨道 ── */}
          <div className="bg-slate-50 rounded-xl px-3 py-2">
            <p className="text-[8px] font-black text-slate-400 uppercase">材料成本</p>
            <p className="text-sm font-black text-slate-800">¥ {(group.materialCost ?? 0).toFixed(2)}</p>
            <p className="text-[8px] text-slate-400 mt-0.5">
              ¥{matUnitPrice.toFixed(2)}/米 × {matMeters.toFixed(1)}米
            </p>
          </div>
          <div className="bg-indigo-50/50 rounded-xl px-3 py-2">
            <p className="text-[8px] font-black text-indigo-400 uppercase">配件成本(报价)</p>
            <p className="text-sm font-black text-indigo-700">¥ {(group.accessoryCost ?? 0).toFixed(2)}</p>
            <p className="text-[8px] text-indigo-400 mt-0.5">
              ¥{((group.accessoryCost ?? 0) / qty).toFixed(2)}/套 × {group.totalQuantity}个
            </p>
          </div>
          <div className="bg-amber-50/50 rounded-xl px-3 py-2">
            <p className="text-[8px] font-black text-amber-500 uppercase">切工成本(报价)</p>
            <p className="text-sm font-black text-amber-700">¥ {(group.cuttingCost ?? 0).toFixed(2)}</p>
            <p className="text-[8px] text-amber-500 mt-0.5">
              ¥{((group.cuttingCost ?? 0) / qty).toFixed(2)}/个 × {group.totalQuantity}个
            </p>
          </div>
          <div className="bg-rose-50/50 rounded-xl px-3 py-2">
            <p className="text-[8px] font-black text-rose-400 uppercase">税金成本(报价)</p>
            <p className="text-sm font-black text-rose-600">¥ {(group.taxCost ?? 0).toFixed(2)}</p>
            <p className="text-[8px] text-rose-400 mt-0.5">
              ¥{((group.taxCost ?? 0) / qty).toFixed(2)}/个 × {group.totalQuantity}个
            </p>
          </div>

          {/* ── 成本轨道（对照，来自成本资料库费率）── */}
          <div className="bg-rose-50/40 rounded-xl px-3 py-2 border border-rose-100">
            <p className="text-[8px] font-black text-rose-400 uppercase">成本配件(内部)</p>
            <p className="text-sm font-black text-rose-700">¥ {(group.costAccessoryCost ?? 0).toFixed(2)}</p>
            <p className="text-[8px] text-rose-400 mt-0.5">
              ¥{((group.costAccessoryCost ?? 0) / qty).toFixed(2)}/套 × {group.totalQuantity}个
            </p>
          </div>
          <div className="bg-orange-50/40 rounded-xl px-3 py-2 border border-orange-100">
            <p className="text-[8px] font-black text-orange-400 uppercase">成本切工(内部)</p>
            <p className="text-sm font-black text-orange-700">¥ {(group.costCuttingCost ?? 0).toFixed(2)}</p>
            <p className="text-[8px] text-orange-400 mt-0.5">
              ¥{((group.costCuttingCost ?? 0) / qty).toFixed(2)}/个 × {group.totalQuantity}个
            </p>
          </div>
        </div>
      </div>
    );
  };

  /**
   * 渲染排料算法对比卡片（FFD vs OPT vs GLB）
   */
  const renderPackingComparison = (group: GroupResult) => {
    if (!group.packingComparison) return null;
    const { ffd, opt, global, selected } = group.packingComparison;
    const names: Record<'ffd' | 'opt' | 'global', string> = { ffd: 'FFD', opt: 'OPT', global: 'GLB' };

    let summaryText: string;
    if (selected === 'GLB') {
      summaryText = `GLB 全局套裁更优，比 FFD 节省 ${ffd.barCount - global.barCount} 支`;
    } else if (selected === 'OPT' && opt.barCount < ffd.barCount) {
      summaryText = `OPT 更优，比 FFD 节省 ${ffd.barCount - opt.barCount} 支`;
    } else {
      summaryText = '三种算法用料一致，采用 FFD';
    }

    return (
      <details className="mt-2 border border-slate-200 rounded-lg overflow-hidden">
        <summary className="px-3 py-2 bg-slate-50 cursor-pointer text-xs font-bold text-slate-700 hover:bg-slate-100">
          排料算法对比：{summaryText}
        </summary>
        <div className="p-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-1">算法</th>
                <th className="text-right py-1">用料支数</th>
                <th className="text-right py-1">总剩余(m)</th>
                <th className="text-center py-1">状态</th>
              </tr>
            </thead>
            <tbody>
              {(['ffd', 'opt', 'global'] as const).map((key) => {
                const stat = group.packingComparison![key];
                const isSelected = group.packingComparison!.selected === names[key];
                return (
                  <tr key={key} className={`border-b border-slate-100 ${isSelected ? 'bg-emerald-50' : ''}`}>
                    <td className="py-1.5 font-bold">{names[key]}{isSelected && ' ★'}</td>
                    <td className="text-right">{stat.barCount}</td>
                    <td className="text-right">{stat.remainingTotal}</td>
                    <td className="text-center">{isSelected ? '✅ 已选用' : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    );
  };

  return (
    <>
      {/* ---- Profit & cost summary card ---- */}
      {showCosts && (
        <section className="bg-gradient-to-tr from-indigo-900 to-slate-900 text-white p-7 rounded-[2.5rem] shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full -mr-40 -mt-40 blur-3xl" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative z-10">
            {/* Total quote */}
            <div className="space-y-1 md:col-span-1 border-r border-white/10 pr-4">
              <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">
                合同总报价 (含税)
              </p>
              <p className="text-3xl font-black tracking-tight text-white">
                ¥ {totalQuote.toLocaleString()}
              </p>
              <p className="text-[9px] text-slate-400 font-medium">
                报价客户：{clientName || '临时散客'}
              </p>
            </div>

            {/* Total cost */}
            <div className="space-y-1 md:col-span-1 border-r border-white/10 pr-4">
              <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">
                核算底价总成本
              </p>
              <p className="text-3xl font-black tracking-tight text-slate-100">
                ¥ {totalCost.toLocaleString()}
              </p>
              <p className="text-[9px] text-slate-400 font-medium">依据底价资料库计算</p>
            </div>

            {/* Profit */}
            <div className="space-y-1 md:col-span-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                  预估净毛利
                </p>
                <MarginBadge value={margin} />
              </div>
              <p className="text-3xl font-black tracking-tight text-emerald-400">
                ¥ {profit.toLocaleString()}
              </p>
              {/* V2: 四项成本汇总条 */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                <span className="text-[9px] text-slate-300 font-medium">
                  材料: ¥{totalMaterialCost.toFixed(0)}
                </span>
                <span className="text-[9px] text-indigo-300 font-medium">
                  配件(报价): ¥{totalAccessoryCost.toFixed(0)}
                </span>
                <span className="text-[9px] text-amber-300 font-medium">
                  切工(报价): ¥{totalCuttingCost.toFixed(0)}
                </span>
                <span className="text-[9px] text-rose-300 font-medium">
                  税金: ¥{totalTaxCost.toFixed(0)}
                </span>
                <span className="text-[9px] text-rose-400/70 font-medium">
                  配件(成本库): ¥{totalCostAccessory.toFixed(0)}
                  {hasCostOverride && (
                    <span className="ml-1 text-[8px] bg-amber-500/30 text-amber-200 px-1 py-0.5 rounded-full font-black">
                      自定义成本
                    </span>
                  )}
                </span>
                <span className="text-[9px] text-orange-400/70 font-medium">
                  切工(成本库): ¥{totalCostCutting.toFixed(0)}
                  {hasCostOverride && (
                    <span className="ml-1 text-[8px] bg-amber-500/30 text-amber-200 px-1 py-0.5 rounded-full font-black">
                      自定义成本
                    </span>
                  )}
                </span>
              </div>
              <p className="text-[9px] text-slate-400 font-medium">
                未扣除人工与固定设备摊销
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ---- Detailed calculation result cards ---- */}
      <section className="printable-area bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200 min-h-[600px]">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8 border-b border-slate-100 pb-6">
          <div>
            <h2 className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-1">
              Calculation Results
            </h2>
            <p className="text-slate-400 text-xs font-bold">
              相同型号颜色已自动合并算料与平摊报价
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={onToggleShowWeight}
              className={`px-3 py-1.5 text-xs font-black rounded-xl border transition-all ${
                showWeight
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {showWeight ? '隐藏重量' : '估算总重量'}
            </button>
            <button
              onClick={onCopyQuotation}
              className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-black rounded-xl hover:bg-slate-200 transition-all no-print"
            >
              复制报价
            </button>
            <button
              onClick={onExportCSV}
              className="px-3 py-1.5 bg-slate-900 text-white text-xs font-black rounded-xl hover:bg-black transition-all no-print"
            >
              导出 CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="no-print print-btn flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors text-xs font-medium"
            >
              🖨️ 打印报价单
            </button>
          </div>
        </div>

        <div className="space-y-16">
          {results.map((group, groupIdx) => {
            // ── 线密度覆盖 & 有效重量计算 ──
            const groupKey = `${group.model}-${group.color}`;
            const isWeightOverridden = weightOverrides[groupKey] !== undefined;
            const effectiveWPM = isWeightOverridden
              ? weightOverrides[groupKey]
              : (group.actualWeightPerMeter ?? 0);
            const groupTotalMeters = group.totalBars * BAR_FULL_LENGTH;
            const matWeight = groupTotalMeters * effectiveWPM;
            const totalEffWeight = matWeight + (group.accessoryWeight ?? 0);
            const sourceLabel =
              group.priceSource === 'exact'
                ? '来自成本库·精确匹配'
                : group.priceSource === 'reuse'
                  ? '来自成本库·复用匹配'
                  : group.priceSource === 'model-fallback'
                    ? '来自成本库·型号回退'
                    : '';

            return (
            <div key={groupIdx} className="relative">
              {/* Group header */}
              <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest">
                      批次 #{groupIdx + 1}
                    </span>
                    <span className="text-slate-300">/</span>
                    <span className="font-black text-md text-slate-900">
                      {group.model} &middot; {group.color}
                    </span>
                    {/* 线密度显示 + 手动覆盖输入框 */}
                    {group.actualWeightPerMeter !== undefined && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="0.001"
                          min={0}
                          value={effectiveWPM}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '') {
                              setWeightOverrides((prev) => {
                                const next = { ...prev };
                                delete next[groupKey];
                                return next;
                              });
                            } else {
                              const n = Number(v);
                              if (!isNaN(n)) {
                                setWeightOverrides((prev) => ({
                                  ...prev,
                                  [groupKey]: n,
                                }));
                              }
                            }
                          }}
                          className={`w-16 text-[9px] font-bold rounded-full px-2 py-0.5 border outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                            isWeightOverridden
                              ? 'border-amber-300 bg-amber-50 text-amber-700'
                              : 'border-slate-200 bg-slate-100 text-slate-500'
                          }`}
                          title="线密度 (kg/m)，可手动覆盖"
                        />
                        <span className="text-[9px] text-slate-400 font-medium">
                          kg/m
                        </span>
                        {sourceLabel && (
                          <span className="text-[9px] text-slate-400 font-medium bg-slate-50 px-1.5 py-0.5 rounded-full border border-slate-100">
                            {sourceLabel}
                          </span>
                        )}
                        {isWeightOverridden && (
                          <button
                            onClick={() =>
                              setWeightOverrides((prev) => {
                                const next = { ...prev };
                                delete next[groupKey];
                                return next;
                              })
                            }
                            className="text-[9px] text-amber-500 hover:text-amber-700 underline font-bold"
                          >
                            重置
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] font-bold text-slate-400">
                    包含 {group.totalQuantity} 个成品 ｜ 耗用{' '}
                    {group.totalBars} 支 3.15m 整料 ｜{' '}
                    {showCosts && group.totalCost ? (
                      <span className="text-emerald-600 font-extrabold ml-1">
                        底价成本: ¥{group.totalCost} (毛利: ¥{group.profit},{' '}
                        {group.profitMargin}%)
                      </span>
                    ) : (
                      <span className="text-slate-400 ml-1">
                        单件摊耗: {group.avgMetersPerFrame.toFixed(2)}米/框
                      </span>
                    )}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">
                    批次结算总价
                  </p>
                  <p className="text-2xl font-black text-slate-900 tracking-tighter">
                    ¥ {group.totalPrice.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* V2: 四项成本明细分解 */}
              {showCosts && group.totalCost && renderCostBreakdown(group)}

              {/* 排料算法对比卡片 */}
              {renderPackingComparison(group)}

              {/* Line item table */}
              <div className="overflow-hidden rounded-2xl border border-slate-100 mt-4 mb-6">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3 font-black text-slate-400 uppercase tracking-widest">
                        规格尺寸详情
                      </th>
                      <th className="px-5 py-3 font-black text-slate-400 uppercase tracking-widest text-center">
                        成品数量
                      </th>
                      <th className="px-5 py-3 font-black text-slate-400 uppercase tracking-widest">
                        {priceConfig.mode === PricingMode.BATCH
                          ? '平摊单价'
                          : '报价单价'}
                      </th>
                      <th className="px-5 py-3 font-black text-slate-400 uppercase tracking-widest text-right">
                        报价小计
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {group.lineItems.map((line) => (
                      <tr
                        key={line.id}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-5 py-3 font-bold text-slate-700">
                          {line.size}
                        </td>
                        <td className="px-5 py-3 text-center font-black text-indigo-600">
                          {line.quantity}
                        </td>
                        <td className="px-5 py-3 font-bold">
                          ¥ {line.unitPrice}
                        </td>
                        <td className="px-5 py-3 text-right font-black text-slate-900">
                          ¥ {line.totalPrice.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {showWeight && group.totalWeight !== undefined && (
                    <tfoot className="bg-indigo-50/30">
                      <tr>
                        <td colSpan={4} className="px-5 py-2.5">
                          <div className="flex gap-6 text-[10px] font-bold text-indigo-700 uppercase">
                            <span>材料毛重: {matWeight.toFixed(3)}kg</span>
                            <span>配件总重: {group.accessoryWeight ?? 0}kg</span>
                            <span className="font-black underline underline-offset-4">
                              批次总重: {totalEffWeight.toFixed(3)}kg
                            </span>
                            {/* 线密度展示（使用 effectiveWPM） */}
                            {group.actualWeightPerMeter !== undefined && (
                              <span>线密度: {effectiveWPM} kg/m</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Bar visualizer grid */}
              {BarVisualizer && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {getGroupedUniquePlans(group.plans).map((unique, uIdx) => (
                    <BarVisualizer
                      key={uIdx}
                      plan={unique.plan}
                      count={unique.count}
                      index={groupIdx + uIdx}
                    />
                  ))}
                </div>
              )}
            </div>
            );
          })}
        </div>
      </section>
    </>
  );
};

export default ResultsDashboard;

import React, { useMemo } from 'react';
import { GroupResult, PriceConfig, CostRecord } from '../../types';

/**
 * Props for CostProfitPanel — receives calculation results, pricing config,
 * cost database, visibility flag, and client name.
 */
interface CostProfitPanelProps {
  results: GroupResult[];
  priceConfig: PriceConfig;
  costDatabase: CostRecord[];
  showCosts: boolean;
  clientName: string;
}

/**
 * CostProfitPanel — detailed cost and profit analysis page (V3 双轨制升级版).
 *
 * V3-T04 改造：
 * - 四格卡片升级为「报价总额 / 成本总额 / 毛利润 / 利润率」
 * - 新增「成本明细对比」表格（报价金额 vs 成本金额）
 * - 利润计算使用真实成本轨道（cost* 费率）
 * - 差异行（配件、切工）淡色高亮标注
 *
 * Renders:
 * 1. Page header with title & client name
 * 2. Four summary cards (quote total / cost total / gross profit / margin)
 * 3. Cost detail comparison table (quote vs cost per category)
 * 4. Profit highlight bar
 * 5. Per-model material cost detail table
 * 6. Weight information section
 * 7. Empty-state guidance when no results exist
 */
const CostProfitPanel: React.FC<CostProfitPanelProps> = ({
  results,
  priceConfig,
  costDatabase,
  showCosts,
  clientName,
}) => {
  // ── Computed aggregates (V3 双轨制) ─────────────────────────────
  const aggregated = useMemo(() => {
    // === 报价轨道汇总 ===
    const totalMaterialCost = results.reduce(
      (sum, r) => sum + (r.materialCost ?? 0),
      0,
    );
    const quoteAccessoryCost = results.reduce(
      (sum, r) => sum + (r.accessoryCost ?? 0),
      0,
    );
    const quoteCuttingCost = results.reduce(
      (sum, r) => sum + (r.cuttingCost ?? 0),
      0,
    );
    const quoteTaxCost = results.reduce(
      (sum, r) => sum + (r.taxCost ?? 0),
      0,
    );
    const totalQuotePrice = results.reduce((sum, r) => sum + r.totalPrice, 0);
    const quoteAllCost = totalMaterialCost + quoteAccessoryCost + quoteCuttingCost + quoteTaxCost;

    // === 成本轨道汇总 🆕 ===
    const costAccessoryCost = results.reduce(
      (sum, r) => sum + (r.costAccessoryCost ?? 0),
      0,
    );
    const costCuttingCost = results.reduce(
      (sum, r) => sum + (r.costCuttingCost ?? 0),
      0,
    );
    const costTaxCost = results.reduce(
      (sum, r) => sum + (r.costTaxCost ?? 0),
      0,
    );
    const costGrandTotal = results.reduce(
      (sum, r) => sum + (r.costGrandTotal ?? 0),
      0,
    );

    // === 真实毛利 & 利润率（报价 - 成本）🆕 ===
    const grossProfit = totalQuotePrice - costGrandTotal;
    const profitMargin =
      totalQuotePrice > 0 ? (grossProfit / totalQuotePrice) * 100 : 0;

    // Total material weight from actualWeightPerMeter * quantity
    const totalMaterialWeight = results.reduce((sum, r) => {
      const wpm = r.actualWeightPerMeter ?? priceConfig.defaultWeightPerMeter;
      return sum + wpm * r.totalQuantity;
    }, 0);

    // Accessory weight
    const totalAccessoryWeight =
      results.length * (priceConfig.defaultWeightPerAccessorySet ?? 0);

    return {
      totalMaterialCost,
      quoteAccessoryCost,
      quoteCuttingCost,
      quoteTaxCost,
      quoteAllCost,
      totalQuotePrice,
      // 成本轨道
      costAccessoryCost,
      costCuttingCost,
      costTaxCost,
      costGrandTotal,
      // 利润
      grossProfit,
      profitMargin,
      // 重量
      totalMaterialWeight,
      totalAccessoryWeight,
    };
  }, [results, priceConfig]);

  // ── Build lookup map for cost database ───────────────────────────
  const costLookup = useMemo(() => {
    const map = new Map<string, CostRecord>();
    for (const record of costDatabase) {
      map.set(`${record.model}|${record.color}`, record);
    }
    return map;
  }, [costDatabase]);

  // ── Helper: format currency ──────────────────────────────────────
  const fmt = (val: number): string =>
    val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Empty state ──────────────────────────────────────────────────
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-8">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-12 text-center max-w-md">
          {/* Icon */}
          <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-2">暂无数据</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            请在「报价算料工作区」添加画框尺寸后，再来查看成本利润分析。
          </p>
        </div>
      </div>
    );
  }

  // ── 成本对比行数据 ─────────────────────────────────────────────
  const comparisonRows = [
    {
      label: '材料成本',
      icon: '📦',
      color: 'blue',
      quoteVal: aggregated.totalMaterialCost,
      costVal: aggregated.totalMaterialCost,   // 材料两轨相同
      hasDiff: false,
    },
    {
      label: '配件成本',
      icon: '🔧',
      color: 'amber',
      quoteVal: aggregated.quoteAccessoryCost,
      costVal: aggregated.costAccessoryCost,
      hasDiff: true,
    },
    {
      label: '切工成本',
      icon: '✂️',
      color: 'orange',
      quoteVal: aggregated.quoteCuttingCost,
      costVal: aggregated.costCuttingCost,
      hasDiff: true,
    },
    {
      label: '税金',
      icon: '📋',
      color: 'rose',
      quoteVal: aggregated.quoteTaxCost,
      costVal: aggregated.costTaxCost,
      hasDiff: Math.abs(aggregated.quoteTaxCost - aggregated.costTaxCost) > 0.01,
    },
  ];

  const quoteSubtotal = comparisonRows.reduce((s, r) => s + r.quoteVal, 0);
  const costSubtotal = comparisonRows.reduce((s, r) => s + r.costVal, 0);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* ════════════ Area 1: Page Title ════════════ */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 shadow-lg shadow-emerald-600/15 text-white">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 backdrop-blur-sm p-2.5 rounded-xl">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">成本利润深度分析</h1>
            {clientName && (
              <p className="text-emerald-100 text-xs font-semibold mt-0.5">
                客户：{clientName}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ════════════ Area 2: Four Summary Cards (V3 Dual-Track) ════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Quote Total Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">报价总额</span>
          </div>
          <p className="text-2xl font-black tabular-nums text-blue-600">
            ¥{fmt(aggregated.totalQuotePrice)}
          </p>
        </div>

        {/* Cost Total Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h-2m2 0h-2M7 21h2m0 0h2m-2 0V5a2 2 0 012-2h6a2 2 0 012 2v16" />
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">成本总额</span>
          </div>
          <p className={`text-2xl font-black tabular-nums ${showCosts ? 'text-indigo-600' : 'text-slate-300'}`}>
            {showCosts ? `¥${fmt(aggregated.costGrandTotal)}` : '***'}
          </p>
        </div>

        {/* Gross Profit Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">毛利润</span>
          </div>
          <p className={`text-2xl font-black tabular-nums ${showCosts ? 'text-emerald-600' : 'text-slate-300'}`}>
            {showCosts ? `¥${fmt(aggregated.grossProfit)}` : '***'}
          </p>
        </div>

        {/* Profit Margin Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2z" />
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">利润率</span>
          </div>
          <p className={`text-2xl font-black tabular-nums ${showCosts ? 'text-purple-600' : 'text-slate-300'}`}>
            {showCosts ? `${aggregated.profitMargin.toFixed(1)}%` : '***'}
          </p>
        </div>
      </div>

      {/* ════════════ Area 3: 🆕 V3-T04 成本明细对比表 ════════════ */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-violet-700 to-purple-700 px-6 py-3 flex items-center justify-between">
          <h2 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2H7a2 2 0 01-2-2V7a2 2 0 012-2m0 10V3m0 10h2a2 2 0 002-2H9m0 0H5" />
            </svg>
            成本明细对比（双轨制）
          </h2>
          <span className="text-[10px] text-purple-200 font-semibold">quote* vs cost*</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">项目</th>
                <th className="px-5 py-3 text-[10px] font-black text-blue-500 uppercase tracking-wider text-right">报价金额</th>
                <th className="px-5 py-3 text-[10px] font-black text-indigo-500 uppercase tracking-wider text-right">成本金额</th>
                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">差额</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {comparisonRows.map((row) => {
                const diff = row.quoteVal - row.costVal;
                const diffAbs = Math.abs(diff);
                return (
                  <tr
                    key={row.label}
                    className={`hover:bg-slate-50/80 transition-colors ${row.hasDiff && diffAbs > 0.001 ? 'bg-amber-50/30' : ''}`}
                  >
                    <td className="px-5 py-3.5 text-sm font-bold text-slate-800">
                      <span className="mr-1.5">{row.icon}</span>{row.label}
                      {row.hasDiff && diffAbs > 0.001 && (
                        <span className="ml-1.5 inline-flex items-center text-[9px] font-semibold text-amber-600 bg-amber-100 px-1.5 py-0 rounded-full">差异</span>
                      )}
                    </td>
                    <td className={`px-5 py-3.5 text-sm text-right tabular-nums font-semibold ${showCosts ? 'text-blue-600' : 'text-slate-300'}`}>
                      {showCosts ? `¥${fmt(row.quoteVal)}` : '***'}
                    </td>
                    <td className={`px-5 py-3.5 text-sm text-right tabular-nums font-semibold ${showCosts ? 'text-indigo-600' : 'text-slate-300'}`}>
                      {showCosts ? `¥${fmt(row.costVal)}` : '***'}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-right tabular-nums font-medium">
                      {diffAbs > 0.001 ? (
                        <span className={diff > 0 ? 'text-emerald-500' : 'text-red-400'}>
                          {diff > 0 ? '+' : ''}{fmt(diff)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {/* 合计行 */}
              <tr className="bg-slate-100/60 font-black">
                <td className="px-5 py-3.5 text-sm text-slate-800">合计</td>
                <td className="px-5 py-3.5 text-sm text-right text-blue-700 tabular-nums">{showCosts ? `¥${fmt(quoteSubtotal)}` : '***'}</td>
                <td className="px-5 py-3.5 text-sm text-right text-indigo-700 tabular-nums">{showCosts ? `¥${fmt(costSubtotal)}` : '***'}</td>
                <td className="px-5 py-3.5 text-sm text-right tabular-nums text-emerald-600">
                  {showCosts ? `+${fmt(quoteSubtotal - costSubtotal)}` : '***'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ════════════ Area 4: 🆕 V3-T04 本次毛利高亮条 ════════════ */}
      <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 rounded-2xl p-6 shadow-lg text-white overflow-hidden relative">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-6 -right-6 w-32 h-32 bg-white rounded-full blur-2xl" />
          <div className="absolute -bottom-6 -left-6 w-40 h-40 bg-white rounded-full blur-2xl" />
        </div>
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-white/80">本次真实毛利</p>
              <p className="text-2xl font-black tabular-nums mt-0.5">
                ¥{showCosts ? fmt(aggregated.grossProfit) : '***'}
                <span className="ml-3 text-base font-semibold text-white/70">
                  （利润率 {showCosts ? `${aggregated.profitMargin.toFixed(1)}%` : '***'}）
                </span>
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-sm">
            <div className="text-center">
              <p className="text-white/60 text-[10px] font-semibold uppercase">报价总额</p>
              <p className="font-black tabular-nums">¥{fmt(aggregated.totalQuotePrice)}</p>
            </div>
            <div className="w-px h-10 bg-white/20" />
            <div className="text-center">
              <p className="text-white/60 text-[10px] font-semibold uppercase">成本总额</p>
              <p className="font-black tabular-nums">{showCosts ? `¥${fmt(aggregated.costGrandTotal)}` : '***'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════ Area 5: 按尺寸成本明细（成本轨道）🆕 ════════════ */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-teal-700 to-emerald-700 px-6 py-3 flex items-center justify-between">
          <h2 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M4 7h16M4 7v10a2 2 0 002 2h12a2 2 0 002-2V7M4 7l2-3h12l2 3M8 12h8" />
            </svg>
            按尺寸成本明细（成本轨道）
          </h2>
          <span className="text-[10px] text-teal-200 font-semibold">材料成本按切割长度比例分摊</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">型号</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">颜色</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">尺寸</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">数量</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">材料</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">配件</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">切工</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">税金</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">成本小计</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.flatMap(group =>
                (group.sizeCosts ?? []).map(sc => ({ group, sc }))
              ).map(({ group, sc }) => (
                <tr
                  key={`${group.model}-${group.color}-${sc.itemId}`}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  <td className="px-4 py-3 text-sm font-bold text-slate-800">{group.model}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{group.color}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{sc.size}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 text-right tabular-nums">{sc.quantity}</td>
                  <td className={`px-4 py-3 text-sm text-right tabular-nums font-semibold ${showCosts ? 'text-slate-700' : 'text-slate-300'}`}>
                    {showCosts ? `¥${fmt(sc.materialCost)}` : '***'}
                  </td>
                  <td className={`px-4 py-3 text-sm text-right tabular-nums font-semibold ${showCosts ? 'text-slate-700' : 'text-slate-300'}`}>
                    {showCosts ? `¥${fmt(sc.accessoryCost)}` : '***'}
                  </td>
                  <td className={`px-4 py-3 text-sm text-right tabular-nums font-semibold ${showCosts ? 'text-slate-700' : 'text-slate-300'}`}>
                    {showCosts ? `¥${fmt(sc.cuttingCost)}` : '***'}
                  </td>
                  <td className={`px-4 py-3 text-sm text-right tabular-nums font-semibold ${showCosts ? 'text-slate-700' : 'text-slate-300'}`}>
                    {showCosts ? `¥${fmt(sc.taxCost)}` : '***'}
                  </td>
                  <td className={`px-4 py-3 text-sm text-right tabular-nums font-bold ${showCosts ? 'text-indigo-700' : 'text-slate-300'}`}>
                    {showCosts ? `¥${fmt(sc.totalCost)}` : '***'}
                  </td>
                </tr>
              ))}
              {/* 合计行 = 组级成本总额 */}
              <tr className="bg-slate-100/60 font-black">
                <td className="px-4 py-3.5 text-sm text-slate-800" colSpan={4}>合计</td>
                <td className="px-4 py-3.5 text-sm text-right text-slate-800 tabular-nums">{showCosts ? `¥${fmt(aggregated.totalMaterialCost)}` : '***'}</td>
                <td className="px-4 py-3.5 text-sm text-right text-slate-800 tabular-nums">{showCosts ? `¥${fmt(aggregated.costAccessoryCost)}` : '***'}</td>
                <td className="px-4 py-3.5 text-sm text-right text-slate-800 tabular-nums">{showCosts ? `¥${fmt(aggregated.costCuttingCost)}` : '***'}</td>
                <td className="px-4 py-3.5 text-sm text-right text-slate-800 tabular-nums">{showCosts ? `¥${fmt(aggregated.costTaxCost)}` : '***'}</td>
                <td className="px-4 py-3.5 text-sm text-right text-indigo-700 tabular-nums">{showCosts ? `¥${fmt(aggregated.costGrandTotal)}` : '***'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ════════════ Area 6: Material Detail Table ════════════ */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-6 py-3 flex items-center justify-between">
          <h2 className="text-xs font-black text-white uppercase tracking-wider">材料成本明细（按型号分组）</h2>
          <span className="text-[10px] text-slate-400 font-semibold">{results.length} 条记录</span>
        </div>
        <div className="overflow-x-auto -mx-px">
          <table className="w-full min-w-[680px] text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">型号</th>
                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">颜色</th>
                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">数量</th>
                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">长度(m)</th>
                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">单价</th>
                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">材料小计</th>
                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">来源</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.map((row) => {
                const key = `${row.model}|${row.color}`;
                const costRec = costLookup.get(key);
                const unitCost = row.materialCost !== undefined && row.totalQuantity > 0
                  ? row.materialCost / row.totalQuantity
                  : (costRec?.materialCost ?? priceConfig.materialPrice);
                const isFallback = row.priceSource === 'model-fallback';

                // Determine total meters — use avgMetersPerFrame if available, or estimate
                const totalMeters = row.avgMetersPerFrame
                  ? row.avgMetersPerFrame * row.totalQuantity
                  : row.totalQuantity; // fallback

                return (
                  <tr
                    key={key}
                    className={`hover:bg-slate-50/80 transition-colors ${isFallback ? 'bg-amber-50/30' : ''}`}
                  >
                    <td className="px-5 py-3.5 text-sm font-bold text-slate-800">{row.model}</td>
                    <td className="px-5 py-3.5 text-sm text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-300 border border-slate-200" />
                        {row.color}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-slate-700 text-right tabular-nums">
                      {row.totalQuantity}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 text-right tabular-nums">
                      {totalMeters.toFixed(2)}
                    </td>
                    <td className={`px-5 py-3.5 text-sm text-right tabular-nums font-semibold ${showCosts ? 'text-slate-700' : 'text-slate-300'}`}>
                      {showCosts ? `¥${unitCost.toFixed(2)}` : '***'}
                    </td>
                    <td className={`px-5 py-3.5 text-sm text-right tabular-nums font-bold ${showCosts ? 'text-slate-800' : 'text-slate-300'}`}>
                      {showCosts ? `¥${fmt(row.materialCost ?? 0)}` : '***'}
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      {isFallback ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded-full">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                          复用 {row.color} 单价
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                          精确匹配
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════════════ Area 6: Weight Summary ════════════ */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
            <svg className="w-4.5 h-4.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <h2 className="text-sm font-black text-slate-800">重量信息</h2>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">材料总重</p>
            <p className="text-xl font-black text-slate-800 tabular-nums">
              {aggregated.totalMaterialWeight.toFixed(2)} <span className="text-xs font-semibold text-slate-400 ml-0.5">kg</span>
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">配件总重</p>
            <p className="text-xl font-black text-slate-800 tabular-nums">
              {aggregated.totalAccessoryWeight.toFixed(2)} <span className="text-xs font-semibold text-slate-400 ml-0.5">kg</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CostProfitPanel;

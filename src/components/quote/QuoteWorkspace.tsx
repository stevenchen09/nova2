import React, { useState, useLayoutEffect } from 'react';
import {
  FrameItem,
  GroupResult,
  PriceConfig,
  CostRecord,
  CostOverride,
  Role,
} from '../../types';
import { UseCalculationReturn } from '../../hooks/useCalculation';

import ClientInfoCard from './ClientInfoCard';
import PriceConfigCard from './PriceConfigCard';
import CostOverridePanel from './CostOverridePanel';
import InputPanel from './InputPanel';
import ItemListPanel from './ItemListPanel';
import ResultsDashboard from './ResultsDashboard';
import FinalSummary from './FinalSummary';
import GeneratePickListModal from '../picklist/GeneratePickListModal';

interface QuoteWorkspaceProps {
  /* ---- State owned by parent (useLocalStorage / useCloudData / useAuth) ---- */
  role: Role;
  clientName: string;
  setClientName: React.Dispatch<React.SetStateAction<string>>;
  orderName: string;
  setOrderName: React.Dispatch<React.SetStateAction<string>>;

  /* ---- Price config（云端加载）---- */
  priceConfig: PriceConfig;
  priceConfigLoading: boolean;
  setPriceConfig: React.Dispatch<React.SetStateAction<PriceConfig>>;
  persistPriceConfig: (config: PriceConfig) => Promise<PriceConfig>;

  /* ---- Cost database（云端加载，用于查价）---- */
  costDatabase: CostRecord[];
  showCosts: boolean;

  /* ---- per-quote 成本费率覆盖 ---- */
  costOverride: CostOverride | null;
  setCostOverride: React.Dispatch<React.SetStateAction<CostOverride | null>>;

  /* ---- Calculation hook return (already initialised with deps) ---- */
  calc: UseCalculationReturn;
}

/**
 * Main quotation workspace panel — V4 云端改造版.
 *
 * 变更说明（V3 → V4）：
 * - 移除 priceConfigMemory / setPriceConfigMemory props（云端统一存储，废弃本地记忆）
 * - 移除 historyRecords / setHistoryRecords props（由 useCloudData 统一管理）
 * - PriceConfigCard 改为接收 role + persistPriceConfig（admin 可保存，sales 只读）
 * - costDatabase 改由父组件从云端传入
 */
const QuoteWorkspace: React.FC<QuoteWorkspaceProps> = ({
  role,
  clientName,
  setClientName,
  orderName,
  setOrderName,
  priceConfig,
  priceConfigLoading,
  setPriceConfig,
  persistPriceConfig,
  costDatabase,
  showCosts,
  costOverride,
  setCostOverride,
  calc,
}) => {
  const {
    inputText,
    setInputText,
    items,
    setItems,
    results,
    setResults,
    isLoading,
    statusMsg,
    showWeight,
    setShowWeight,
    fileInputRef,
    isDragging,
    useAiParser,
    setUseAiParser,
    addItemByText,
    handleFileUpload,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    removeItem,
    clearAll,
    copyQuotation,
    exportCSV,
    saveCurrentToHistory,
    getGroupedUniquePlans,
    setCurrentHistoryId,
    currentHistoryId,
  } = calc;

  // ---- Auto-calculate when inputs change (useLayoutEffect 避免跨 Tab 切换首帧旧结果) ----
  useLayoutEffect(() => {
    if (!items || items.length === 0) {
      setResults([]);
      return;
    }
    try {
      // 构造 effectiveConfig：costOverride 覆盖全局 priceConfig 的 cost* 字段
      const effectiveConfig = costOverride
        ? { ...priceConfig, ...costOverride }
        : priceConfig;
      const res = calculateGroupedResults(
        items,
        effectiveConfig,
        showWeight,
        costDatabase,
      );
      setResults(res);
    } catch (err) {
      // 计算异常时不白屏，保留旧 results 供用户查看
      console.error('[QuoteWorkspace] calculateGroupedResults error:', err);
    }
  }, [items, priceConfig, costOverride, showWeight, costDatabase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Action handlers (thin wrappers that inject external state) ----

  /** Trigger text parsing */
  const handleManualParse = async () => {
    await addItemByText(inputText);
  };

  // ---- 领料单弹窗状态 ----
  const [pickListModalOpen, setPickListModalOpen] = useState(false);

  /** Clear workspace including client/order fields and cost override */
  const handleClearAll = () => {
    clearAll();
    setClientName('');
    setOrderName('');
    setCostOverride(null);
    setCurrentHistoryId(null);
  };

  /** Save to history via callback — 传入 costOverride 以构造 effectiveConfig 快照 */
  const handleSaveToHistory = async () => {
    await saveCurrentToHistory(costOverride);
  };

  return (
    <>
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-5 sticky top-0 z-10 flex items-center justify-between shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black tracking-tight text-slate-900">
              算料与智能报价工作区
            </h2>
            <span className="text-[10px] bg-slate-100 text-slate-500 border px-2 py-0.5 rounded-md font-bold">
              主线算料池
            </span>
          </div>
          <p className="text-xs text-slate-400">
            相同型号、颜色自动合并套料，计算最佳支数与毛利润
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleClearAll}
            className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
          >
            清空工作区
          </button>
          {results.length > 0 && (
            <button
              onClick={handleSaveToHistory}
              className="px-5 py-2.5 bg-emerald-600 text-white text-xs font-black rounded-xl hover:bg-emerald-700 shadow-md shadow-emerald-500/15 transition-all flex items-center gap-1.5"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                />
              </svg>
              保存本单报价
            </button>
          )}
        </div>
      </header>

      {/* Main content grid */}
      <main className="printable-area px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl w-full mx-auto">
        {/* Left column: configuration & input */}
        <div className="lg:col-span-4 space-y-6">
          <ClientInfoCard
            clientName={clientName}
            onClientNameChange={setClientName}
            orderName={orderName}
            onOrderNameChange={setOrderName}
          />

          <PriceConfigCard
            role={role}
            priceConfig={priceConfig}
            priceConfigLoading={priceConfigLoading}
            onPriceConfigChange={setPriceConfig}
            onPersistPriceConfig={persistPriceConfig}
          />

          <CostOverridePanel
            priceConfig={priceConfig}
            costOverride={costOverride}
            onCostOverrideChange={setCostOverride}
          />

          <InputPanel
            inputText={inputText}
            onInputChange={setInputText}
            onParse={handleManualParse}
            onFileUpload={(e) => handleFileUpload(e)}
            onPaste={(e) => handlePaste(e)}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e)}
            isLoading={isLoading}
            statusMsg={statusMsg}
            isDragging={isDragging}
            useAiParser={useAiParser}
            onToggleAiParser={setUseAiParser}
            fileInputRef={fileInputRef}
            validationError={calc.validationError}
            onClearValidationError={() => calc.setValidationError('')}
          />

          <ItemListPanel
            items={items}
            onRemoveItem={removeItem}
            onClearItems={() => setItems([])}
          />
        </div>

        {/* Right column: results */}
        <div className="lg:col-span-8 space-y-6">
          <ResultsDashboard
            results={results}
            showCosts={showCosts}
            showWeight={showWeight}
            clientName={clientName}
            priceConfig={priceConfig}
            hasCostOverride={costOverride !== null}
            onToggleShowWeight={() => setShowWeight(!showWeight)}
            onCopyQuotation={() => copyQuotation()}
            onExportCSV={() => exportCSV()}
            getGroupedUniquePlans={getGroupedUniquePlans}
          />

          {results.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={() => setPickListModalOpen(true)}
                className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-500/15 transition-all flex items-center gap-1.5"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
                生成领料单
              </button>
            </div>
          )}

          <FinalSummary
            results={results}
            priceConfig={costOverride ? { ...priceConfig, ...costOverride } : priceConfig}
            showWeight={showWeight}
          />
        </div>
      </main>

      {/* ── 生成领料单弹窗 ── */}
      <GeneratePickListModal
        isOpen={pickListModalOpen}
        onClose={() => setPickListModalOpen(false)}
        results={results}
        calculationId={currentHistoryId || undefined}
        onGenerated={(shareCode) => {
          // 生成成功后弹窗内部展示分享码，此处仅记录日志
          console.log('[PickList] generated shareCode:', shareCode);
        }}
        initialClientName={clientName}
        initialOrderName={orderName}
      />
    </>
  );
};

// Need to import calculation utility for auto-recalc effect
import { calculateGroupedResults } from '../../utils/calculation';

export default QuoteWorkspace;

import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useCloudData } from './hooks/useCloudData';
import { useCalculation } from './hooks/useCalculation';
import { cloudService } from './services/cloudService';
import { ActiveTab, PriceConfig, CostOverride } from './types';

import LoginForm from './components/auth/LoginForm';
import Sidebar from './components/layout/Sidebar';
import QuoteWorkspace from './components/quote/QuoteWorkspace';
import ErrorBoundary from './components/common/ErrorBoundary';
import CostDatabasePanel from './components/cost/CostDatabasePanel';
import HistoryPanel from './components/history/HistoryPanel';
import SettingsPanel from './components/settings/SettingsPanel';
import CostProfitPanel from './components/profit/CostProfitPanel';
import PickListPanel from './components/picklist/PickListPanel';

/** Default price config used as fallback (V3: dual-track quote* + cost*) */
const DEFAULT_PRICE_CONFIG: PriceConfig = {
  materialPrice: 45,
  mode: '批量单(按整料)' as any,
  // === 报价费率 ===
  quoteAccessoryPrice: 15,
  quoteCuttingFee: 3,
  quoteTaxRate: 0.13,
  // === 成本费率 ===
  costAccessoryPrice: 10.5,
  costCuttingFee: 2.1,
  costTaxRate: 0.13,
  defaultWeightPerMeter: 0.85,
  defaultWeightPerAccessorySet: 0.12,
};

/**
 * V4 应用根组件 — 云端数据架构
 *
 * 变更说明（V3 → V4）：
 * - 引入 useCloudData hook，集中加载 costDb / priceConfig / historyRecords
 * - useLocalStorage 仅保留本地临时数据（items/clientName/orderName/showCosts）
 * - 移除 aiSettings 传递（SettingsPanel 自管 cloudService.aiSettings）
 * - 工厂角色默认 activeTab = 'picklist'
 */
const App: React.FC = () => {
  // ── Hook initialisation ──────────────────────────────────────────
  const auth = useAuth();
  const storage = useLocalStorage(auth.currentUser?.username);
  const cloud = useCloudData(
    auth.currentUser
      ? {
          uid: auth.currentUser.uid,
          username: auth.currentUser.username,
          role: auth.currentUser.role,
        }
      : null,
  );

  // Wire calculation hook — V4: 保存历史改走 cloudService.calculation.save
  const calc = useCalculation({
    priceConfig: cloud.priceConfig,
    costDatabase: cloud.costDatabase,
    showCosts: storage.showCosts,
    clientName: storage.clientName,
    orderName: storage.orderName,
    saveHistoryRecord: cloud.saveHistoryRecord,
    updateHistoryRecord: cloud.updateHistoryRecord,
  });

  // ── Navigation state ─────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('quote');

  // ── per-quote 成本费率覆盖（不污染全局 priceConfig）──────────────
  const [costOverride, setCostOverride] = useState<CostOverride | null>(null);

  // ── 登录态加载中 ─────────────────────────────────────────────────
  if (auth.isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="animate-spin h-8 w-8 text-indigo-600"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <p className="text-xs text-slate-400 font-bold">正在验证登录状态...</p>
        </div>
      </div>
    );
  }

  // ── Unauthenticated view ────────────────────────────────────────
  if (!auth.currentUser) {
    return (
      <LoginForm
        handleLogin={auth.handleLogin}
        loginError={auth.loginError}
      />
    );
  }

  // ── Authenticated layout ─────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-indigo-100">
      {/* Sidebar navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => setActiveTab(tab)}
        currentUser={auth.currentUser}
        onLogout={auth.logout}
        showCosts={storage.showCosts}
        onToggleShowCosts={() => storage.setShowCosts(!storage.showCosts)}
        historyCount={cloud.historyRecords.length}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Global loading bar */}
        {calc.isLoading && (
          <div className="fixed top-0 left-0 right-0 z-50 h-1.5 bg-indigo-100 overflow-hidden">
            <div
              className="h-full bg-indigo-600 animate-[loading_1.5s_infinite_linear]"
              style={{ width: '40%' }}
            ></div>
          </div>
        )}

        {/* ── Tab: Quote Workspace ──────────────────────────────── */}
        {activeTab === 'quote' && (
          <ErrorBoundary>
            <QuoteWorkspace
              role={auth.currentUser.role}
              clientName={storage.clientName}
              setClientName={storage.setClientName}
              orderName={storage.orderName}
              setOrderName={storage.setOrderName}
              priceConfig={cloud.priceConfig}
              priceConfigLoading={cloud.priceConfigLoading}
              setPriceConfig={cloud.setPriceConfig}
              persistPriceConfig={cloud.persistPriceConfig}
              costDatabase={cloud.costDatabase}
              showCosts={storage.showCosts}
              calc={calc}
              costOverride={costOverride}
              setCostOverride={setCostOverride}
            />
          </ErrorBoundary>
        )}

        {/* ── Tab: Cost Database ─────────────────────────────────── */}
        {activeTab === 'cost' && (
          <CostDatabasePanel
            role={auth.currentUser.role}
            costDatabase={cloud.costDatabase}
            costDbLoading={cloud.costDbLoading}
            costDbError={cloud.costDbError}
            onCreateCostRecord={cloud.createCostRecord}
            onUpdateCostRecord={cloud.updateCostRecord}
            onDeleteCostRecord={cloud.deleteCostRecord}
            onImportClick={() => calc.costFileInputRef.current?.click()}
            onExtractFile={calc.extractCostFileContent}
            onParseWithAI={calc.parseCostWithAI}
            onBatchImport={cloud.batchImportCostRecords}
            onCostFileUpload={(e) =>
              calc.handleCostFileUpload(
                e,
                cloud.costDatabase,
                undefined,
                cloud.batchImportCostRecords,
              )
            }
            costFileInputRef={calc.costFileInputRef}
            /* 全局成本费率（双轨制）*/
            priceConfig={cloud.priceConfig}
            priceConfigLoading={cloud.priceConfigLoading}
            onPersistPriceConfig={cloud.persistPriceConfig}
            onPriceConfigChange={cloud.setPriceConfig}
          />
        )}

        {/* ── Tab: Cost & Profit Analysis ───────────────────────── */}
        {activeTab === 'profit' && (
          <CostProfitPanel
            results={calc.results || []}
            priceConfig={cloud.priceConfig || DEFAULT_PRICE_CONFIG}
            costDatabase={cloud.costDatabase || []}
            showCosts={storage.showCosts}
            clientName={storage.clientName || ''}
          />
        )}

        {/* ── Tab: Picklist ─────────────────────────────────────── */}
        {activeTab === 'picklist' && (
          <PickListPanel currentUser={auth.currentUser} />
        )}

        {/* ── Tab: History Records ───────────────────────────────── */}
        {activeTab === 'history' && (
          <HistoryPanel
            role={auth.currentUser.role}
            historyRecords={cloud.historyRecords}
            historyLoading={cloud.historyLoading}
            historyError={cloud.historyError}
            onDeleteHistoryRecord={cloud.deleteHistoryRecord}
            showCosts={storage.showCosts}
            onLoadRecord={async (record) => {
              try {
                if (
                  confirm(
                    `是否载入历史记录：【${record.clientName} - ${record.orderName}】？这会覆盖当前的算料工作区。`,
                  )
                ) {
                  // ⚠️ list 接口不返回 items 大字段（云端做了列表摘要优化），
                  // 必须先调 get 接口拿完整 record 才能取到 items/results/priceConfig
                  const fullRecord = await cloudService.calculation.get(record.id);
                  const safeRecord = fullRecord || record;

                  // 数据兜底：旧历史记录可能缺字段，全部用默认值补全
                  const safeItems = Array.isArray(safeRecord.items) ? safeRecord.items : [];
                  const safePriceConfig = safeRecord.priceConfig || {};
                  const safeClientName = String(safeRecord.clientName || '');
                  const safeOrderName = String(safeRecord.orderName || '');

                  // 恢复 items（results 故意不恢复，让 useLayoutEffect 重算：
                  // 旧 V3 快照的 results 缺 V4 新字段（avgMetersPerFrame/lineItems/cost* 等），
                  // 直接渲染旧 results 会 throw 白屏。重算保证 results 是完整 V4 格式）
                  calc.setItems(safeItems);

                  // 记住当前正在编辑的历史记录 ID，保存时走 update 而非 save
                  calc.setCurrentHistoryId(safeRecord.id);

                  // 兼容旧记录：V3 时代的快照可能缺 cost* 字段，用全局值兜底
                  const g = cloud.priceConfig;
                  const sCostAccessory =
                    typeof safePriceConfig.costAccessoryPrice === 'number'
                      ? safePriceConfig.costAccessoryPrice
                      : g.costAccessoryPrice;
                  const sCostCutting =
                    typeof safePriceConfig.costCuttingFee === 'number'
                      ? safePriceConfig.costCuttingFee
                      : g.costCuttingFee;
                  const sCostTax =
                    typeof safePriceConfig.costTaxRate === 'number'
                      ? safePriceConfig.costTaxRate
                      : g.costTaxRate;

                  if (
                    sCostAccessory !== g.costAccessoryPrice ||
                    sCostCutting !== g.costCuttingFee ||
                    sCostTax !== g.costTaxRate
                  ) {
                    setCostOverride({
                      costAccessoryPrice: sCostAccessory,
                      costCuttingFee: sCostCutting,
                      costTaxRate: sCostTax,
                    });
                  } else {
                    setCostOverride(null);
                  }
                  storage.setClientName(safeClientName);
                  storage.setOrderName(safeOrderName);
                  setActiveTab('quote');

                  if (safeItems.length === 0) {
                    alert(
                      '该历史记录的算料数据为空（可能保存时数据缺失），已切换到算料工作区但无项目可显示。',
                    );
                  }
                }
              } catch (err: any) {
                console.error('[onLoadRecord] error:', err);
                alert(
                  `载入历史记录失败：${err.message || err}\n\n该记录可能已损坏，建议删除。`,
                );
              }
            }}
          />
        )}

        {/* ── Tab: Settings ──────────────────────────────────────── */}
        {activeTab === 'settings' && (
          <SettingsPanel
            currentUser={auth.currentUser}
            exportAllBackup={() => {
              // V4: 简化备份 — 仅导出云端数据快照
              const backupData = {
                version: '4.0.0',
                costDatabase: cloud.costDatabase,
                historyRecords: cloud.historyRecords,
                priceConfig: cloud.priceConfig,
                exportDate: new Date().toISOString(),
              };
              const blob = new Blob([JSON.stringify(backupData, null, 2)], {
                type: 'application/json',
              });
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = `nova2_云端数据备份_${new Date().getTime()}.json`;
              link.click();
            }}
            importBackupFile={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = async (event) => {
                try {
                  const data = JSON.parse(event.target?.result as string);
                  if (data.costDatabase && Array.isArray(data.costDatabase)) {
                    await cloud.batchImportCostRecords(data.costDatabase);
                  }
                  if (data.priceConfig) {
                    await cloud.persistPriceConfig(data.priceConfig);
                  }
                  alert('数据恢复成功！已同步到云端。');
                } catch {
                  alert('解析备份文件失败，请确保格式正确。');
                }
              };
              reader.readAsText(file);
              e.target.value = '';
            }}
          />
        )}
      </div>
    </div>
  );
};

export default App;

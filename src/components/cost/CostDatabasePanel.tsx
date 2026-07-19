import React, { useState, useEffect, useMemo } from 'react';
import { CostRecord, PriceConfig, Role, ColorReuseRule } from '../../types';
import ColorReuseRulesModal from './ColorReuseRulesModal';

interface CostDatabasePanelProps {
  role: Role;
  costDatabase: CostRecord[];
  costDbLoading: boolean;
  costDbError: string;
  onCreateCostRecord: (record: CostRecord) => Promise<CostRecord>;
  onUpdateCostRecord: (record: CostRecord) => Promise<CostRecord>;
  onDeleteCostRecord: (id: string) => Promise<void>;
  onImportClick: () => void;
  onExtractFile: (file: File) => Promise<{
    textContent: string;
    filePayload?: { mimeType: string; data: string };
    fileName: string;
    fileType: string;
  }>;
  onParseWithAI: (
    textContent: string,
    filePayload?: { mimeType: string; data: string },
  ) => Promise<Partial<CostRecord>[]>;
  onBatchImport: (records: CostRecord[]) => Promise<number>;
  onCostFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  costFileInputRef: React.RefObject<HTMLInputElement | null>;
  priceConfig: PriceConfig;
  priceConfigLoading: boolean;
  onPersistPriceConfig: (config: PriceConfig) => Promise<PriceConfig>;
  onPriceConfigChange: React.Dispatch<React.SetStateAction<PriceConfig>>;
}

/**
 * V2 默认表单值（不含 accessoryCost/cuttingCost，新增 weightPerMeter）
 */
const DEFAULT_COST_FORM = {
  model: '',
  color: '',
  materialCost: 25,
  weightPerMeter: 0.85,
  notes: '',
};

/**
 * Cost database management panel — V4 云端改造版.
 *
 * 变更说明（V3 → V4）：
 * - 数据源改为云端（由父组件传入 costDatabase + loading + error）
 * - 增删改走 cloudService.costDb.{create,update,delete}（onCreateCostRecord 等回调）
 * - 角色权限：admin 完整增删改 + 显示 materialCost 列；sales 只读 + 隐藏 materialCost 列
 * - 全局成本费率区：仅 admin 可见可编辑；sales 完全隐藏
 * - 移除 localStorage 相关逻辑
 */
const CostDatabasePanel: React.FC<CostDatabasePanelProps> = ({
  role,
  costDatabase,
  costDbLoading,
  costDbError,
  onCreateCostRecord,
  onUpdateCostRecord,
  onDeleteCostRecord,
  onImportClick,
  onExtractFile,
  onParseWithAI,
  onBatchImport,
  onCostFileUpload,
  costFileInputRef,
  priceConfig,
  priceConfigLoading,
  onPersistPriceConfig,
  onPriceConfigChange,
}) => {
  const isAdmin = true;
  const isReadOnly = false;

  // ── Local UI state ──────────────────────────────────────────────
  // 待解析文件预览状态
  const [pendingFile, setPendingFile] = useState<{
    fileName: string;
    fileType: string;
    textContent: string;
    filePayload?: { mimeType: string; data: string };
  } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedRecords, setParsedRecords] = useState<Partial<CostRecord>[]>([]);

  /** 处理文件选择：先提取文本/图片（不调 AI），让用户预览后再决定是否解析 */
  const handleFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 清空旧数据
    setParsedRecords([]);
    try {
      setParsing(true);
      const result = await onExtractFile(file);
      setPendingFile(result);
    } catch (err: any) {
      alert(`文件解析失败: ${err.message || err}`);
    } finally {
      setParsing(false);
      // 清空 input value 允许再次选择同一文件
      if (e.target) e.target.value = '';
    }
  };

  /** 用户点击"开始 AI 解析"按钮 */
  const handleStartAiParse = async () => {
    if (!pendingFile) return;
    setParsing(true);
    try {
      const records = await onParseWithAI(
        pendingFile.textContent,
        pendingFile.filePayload,
      );
      setParsedRecords(records);
      if (records.length === 0) {
        alert(
          'AI 未能从文件中识别到底价信息。\n\n' +
          '提示：可以尝试更清晰的图片，或确认文件包含型号/颜色/价格信息。',
        );
      }
    } catch (err: any) {
      alert(`AI 解析失败: ${err.message || err}`);
    } finally {
      setParsing(false);
    }
  };

  /** 取消预览 */
  const handleCancelPreview = () => {
    setPendingFile(null);
    setParsedRecords([]);
  };

  /** 确认导入解析结果到云端（走 cloudService.batchImport） */
  const handleConfirmImport = async () => {
    if (parsedRecords.length === 0) return;
    if (!confirm(`确认导入 ${parsedRecords.length} 条底价记录到云端？`)) return;
    try {
      const recordsToImport = parsedRecords.map((item: any) => ({
        id: `cost-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        model: String(item.model || '').trim(),
        color: String(item.color || '').trim(),
        materialCost: Number(item.materialCost) || 0,
        weightPerMeter: Number(item.weightPerMeter) || 0.85,
        notes: item.notes || 'AI 批量导入',
        updatedAt: new Date().toISOString(),
      })) as CostRecord[];
      const count = await onBatchImport(recordsToImport);
      alert(`✅ 成功导入 ${count} 条底价记录（已去重合并）！`);
      setPendingFile(null);
      setParsedRecords([]);
      // 刷新页面以加载最新数据
      window.location.reload();
    } catch (err: any) {
      alert(`导入出错: ${err.message || err}`);
    }
  };
  const [costForm, setCostForm] = useState(DEFAULT_COST_FORM);
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  const [costSearch, setCostSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [costRateDraft, setCostRateDraft] = useState<PriceConfig | null>(null);
  const [rateSaving, setRateSaving] = useState(false);
  const [reuseRulesModalOpen, setReuseRulesModalOpen] = useState(false);

  // 当 priceConfig 变化时同步本地成本费率草稿
  useEffect(() => {
    setCostRateDraft({
      costAccessoryPrice: priceConfig.costAccessoryPrice,
      costCuttingFee: priceConfig.costCuttingFee,
      costTaxRate: priceConfig.costTaxRate,
    } as PriceConfig);
  }, [priceConfig.costAccessoryPrice, priceConfig.costCuttingFee, priceConfig.costTaxRate]);

  /** Save or update a cost record from the form */
  const handleSaveCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!costForm.model.trim() || !costForm.color.trim()) {
      alert('请填写完整的型号与颜色');
      return;
    }

    const updatedRecord: CostRecord = {
      id:
        editingCostId ||
        `cost-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      model: costForm.model.trim(),
      color: costForm.color.trim(),
      materialCost: Number(costForm.materialCost) || 0,
      weightPerMeter: Number(costForm.weightPerMeter) || 0,
      notes: costForm.notes.trim(),
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      if (editingCostId) {
        await onUpdateCostRecord(updatedRecord);
        setEditingCostId(null);
      } else {
        const existingIdx = costDatabase.findIndex(
          (r) =>
            r.model.toLowerCase() === updatedRecord.model.toLowerCase() &&
            r.color.toLowerCase() === updatedRecord.color.toLowerCase(),
        );
        if (existingIdx !== -1) {
          if (
            confirm(
              `型号【${updatedRecord.model}】颜色【${updatedRecord.color}】已存在，是否直接更新它的底价？`,
            )
          ) {
            await onUpdateCostRecord({
              ...updatedRecord,
              id: costDatabase[existingIdx].id,
            });
          } else {
            return;
          }
        } else {
          await onCreateCostRecord(updatedRecord);
        }
      }
      setCostForm(DEFAULT_COST_FORM);
    } catch (err: any) {
      alert(`保存失败: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  /** Populate form for editing an existing record */
  const editCostRecord = (record: CostRecord) => {
    setEditingCostId(record.id);
    setCostForm({
      model: record.model,
      color: record.color,
      materialCost: record.materialCost,
      weightPerMeter: record.weightPerMeter ?? 0.85,
      notes: record.notes || '',
    });
  };

  const deleteCostRecord = async (id: string) => {
    if (!confirm('确认删除该材料的底价配置吗？')) return;
    try {
      await onDeleteCostRecord(id);
      if (editingCostId === id) {
        setEditingCostId(null);
        setCostForm(DEFAULT_COST_FORM);
      }
    } catch (err: any) {
      alert(`删除失败: ${err.message || err}`);
    }
  };

  /** 保存成本费率到云端 — 只修改 cost* 字段，绝不碰 quote* 字段 */
  const handleSaveCostRates = async () => {
    if (!costRateDraft) return;
    setRateSaving(true);
    try {
      // 只更新 cost* 字段，quote* 字段保持原值不动
      const updated: PriceConfig = {
        ...priceConfig,
        costAccessoryPrice: Number(costRateDraft.costAccessoryPrice) || 0,
        costCuttingFee: Number(costRateDraft.costCuttingFee) || 0,
        costTaxRate: Number(costRateDraft.costTaxRate) || 0,
      };
      // 持久化到云端（云端只更新提供的字段）
      const saved = await onPersistPriceConfig(updated);
      // 更新本地 state（用云端返回的完整配置）
      onPriceConfigChange(saved);
      alert('成本费率已保存到云端');
    } catch (err: any) {
      alert(`保存费率失败: ${err.message || err}`);
    } finally {
      setRateSaving(false);
    }
  };

  const filteredCostDb = costDatabase.filter(
    (r) =>
      r.model.toLowerCase().includes(costSearch.toLowerCase()) ||
      r.color.toLowerCase().includes(costSearch.toLowerCase()) ||
      (r.notes || '').toLowerCase().includes(costSearch.toLowerCase()),
  );

  // ── 颜色复用规则标签计算 ──────────────────────────────────────────
  // sourceColorMap: 源颜色 → 目标颜色（用于显示 ↻ 标签）
  // targetCountMap: 目标颜色 → 被复用次数（用于显示 ← N个复用 标签）
  const { sourceColorMap, targetCountMap } = useMemo(() => {
    const rules = priceConfig.colorReuseRules || [];
    const sMap: Record<string, string> = {};
    const tCount: Record<string, number> = {};
    for (const rule of rules) {
      const sLower = rule.sourceColor.trim().toLowerCase();
      const tLower = rule.targetColor.trim().toLowerCase();
      sMap[sLower] = rule.targetColor;
      tCount[tLower] = (tCount[tLower] || 0) + 1;
    }
    return { sourceColorMap: sMap, targetCountMap: tCount };
  }, [priceConfig.colorReuseRules]);

  /** 保存复用规则到云端 */
  const handleSaveReuseRules = async (rules: ColorReuseRule[]) => {
    await onPersistPriceConfig({ ...priceConfig, colorReuseRules: rules });
  };

  return (
    <>
      <header className="bg-white border-b border-slate-200 px-8 py-5 sticky top-0 z-10 flex items-center justify-between shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-black tracking-tight text-slate-900">
            材料成本底价资料库
          </h2>
          <p className="text-xs text-slate-400">
            维护每款型材及颜色的底价信息，以实现精准的利润率核算
          </p>
        </div>
        <div className="flex items-center gap-2">
            <button
              onClick={() => setReuseRulesModalOpen(true)}
              className="px-4 py-2 bg-violet-50 text-violet-600 border border-violet-200 text-xs font-black rounded-xl hover:bg-violet-100 transition-all flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              颜色复用规则
            </button>
            <button
              onClick={onImportClick}
              className="px-4 py-2 bg-indigo-50 text-indigo-600 border border-indigo-200 text-xs font-black rounded-xl hover:bg-indigo-100 transition-all flex items-center gap-1.5"
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
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              上传底价资料导入
            </button>
            <input
              type="file"
              ref={costFileInputRef as React.RefObject<HTMLInputElement>}
              onChange={handleFileSelect}
              accept=".csv,.txt,.png,.jpg,.jpeg,.gif,.bmp,.webp,.xlsx,.xls,.pdf,.docx,.doc,.md"
              hidden
            />
          </div>
      </header>

      {/* ════════════ 全局成本费率输入区域 ════════════ */}
      {costRateDraft && (
        <div className="px-8 pt-6 pb-2 max-w-7xl w-full mx-auto">
          <details className="group" open>
            <summary className="cursor-pointer select-none list-none flex items-center gap-2 mb-3">
              <span className="transform transition-transform duration-200 group-open:rotate-90 text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                </svg>
              </span>
              <h3 className="text-sm font-black text-slate-700 tracking-tight">全局成本费率（内部核算用）</h3>
              <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">双轨制</span>
              {priceConfigLoading && (
                <span className="text-[10px] text-slate-400">加载中...</span>
              )}
            </summary>

            <div className="bg-gradient-to-br from-emerald-50/80 to-teal-50/60 border border-emerald-200 rounded-2xl p-5 space-y-4 shadow-sm">
              <p className="text-xs text-emerald-700 leading-relaxed font-medium">
                💡 这些值用于<strong>成本利润核算</strong>，与报价区的报价费率分开管理。修改后点击「保存费率」按钮同步到云端。
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 成本配件单价 */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase ml-1">
                    <span className="w-5 h-5 rounded-md bg-amber-100 text-amber-600 flex items-center justify-center text-[10px]">配</span>
                    成本配件单价
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      max={9999}
                      value={costRateDraft.costAccessoryPrice}
                      onChange={(e) =>
                        setCostRateDraft((prev) =>
                          prev
                            ? { ...prev, costAccessoryPrice: Number(e.target.value) || 0 }
                            : prev,
                        )
                      }
                      className="w-full bg-white border border-emerald-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 ring-emerald-500/30 outline-none shadow-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="如: 10.5"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">元/套</span>
                  </div>
                  <p className="text-[10px] text-slate-400 ml-1">
                    报价: ¥{priceConfig.quoteAccessoryPrice.toFixed(2)}/套
                  </p>
                </div>

                {/* 成本切工费率 */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase ml-1">
                    <span className="w-5 h-5 rounded-md bg-orange-100 text-orange-600 flex items-center justify-center text-[10px]">切</span>
                    成本切工费率
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      max={9999}
                      value={costRateDraft.costCuttingFee}
                      onChange={(e) =>
                        setCostRateDraft((prev) =>
                          prev
                            ? { ...prev, costCuttingFee: Number(e.target.value) || 0 }
                            : prev,
                        )
                      }
                      className="w-full bg-white border border-emerald-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 ring-emerald-500/30 outline-none shadow-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="如: 2.1"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">元/个</span>
                  </div>
                  <p className="text-[10px] text-slate-400 ml-1">
                    报价: ¥{priceConfig.quoteCuttingFee.toFixed(2)}/米
                  </p>
                </div>

                {/* 成本税率 */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase ml-1">
                    <span className="w-5 h-5 rounded-md bg-rose-100 text-rose-600 flex items-center justify-center text-[10px]">税</span>
                    成本税率
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.0001"
                      min={0}
                      max={1}
                      value={costRateDraft.costTaxRate}
                      onChange={(e) =>
                        setCostRateDraft((prev) =>
                          prev
                            ? { ...prev, costTaxRate: Number(e.target.value) || 0 }
                            : prev,
                        )
                      }
                      className="w-full bg-white border border-emerald-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 ring-emerald-500/30 outline-none shadow-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="如: 0.13"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">纯税率</span>
                  </div>
                  <p className="text-[10px] text-slate-400 ml-1">
                    报价: {(priceConfig.quoteTaxRate * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Quick reference bar + 保存按钮 */}
              <div className="flex items-center justify-between gap-4 pt-2 border-t border-emerald-100 text-[10px] text-slate-500">
                <div className="flex items-center gap-4">
                  <span className="font-medium">差价参考：</span>
                  <span>配件差 ¥{(priceConfig.quoteAccessoryPrice - (costRateDraft.costAccessoryPrice || 0)).toFixed(2)}/套</span>
                  <span>切工差 ¥{(priceConfig.quoteCuttingFee - (costRateDraft.costCuttingFee || 0)).toFixed(2)}/个</span>
                </div>
                <button
                  onClick={handleSaveCostRates}
                  disabled={rateSaving}
                  className="px-4 py-1.5 bg-emerald-600 text-white text-[11px] font-black rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 shadow-sm"
                >
                  {rateSaving ? '保存中...' : '保存费率'}
                </button>
              </div>
              <p className="text-[8px] text-slate-400 text-right mt-1">如多人同时编辑，以最后保存为准</p>
            </div>
          </details>
        </div>
      )}

      <main className="px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl w-full mx-auto">
        {/* Left: form */}
        <div className="lg:col-span-4 space-y-6">
            <section className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
              <h3 className="text-xs font-black text-slate-950 uppercase tracking-widest mb-4">
                {editingCostId ? '✏️ 编辑材料底价' : '➕ 新增型材底价'}
              </h3>
              <form onSubmit={handleSaveCost} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
                    型材型号 *
                  </label>
                  <input
                    type="text"
                    required
                    value={costForm.model}
                    onChange={(e) =>
                      setCostForm({ ...costForm, model: e.target.value })
                    }
                    placeholder="如: D1822, Y3011"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
                    型材颜色 *
                  </label>
                  <input
                    type="text"
                    required
                    value={costForm.color}
                    onChange={(e) =>
                      setCostForm({ ...costForm, color: e.target.value })
                    }
                    placeholder="如: 黑色, 哑金, 灰色"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
                      材料底价 (元/米) *
                    </label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      min={0}
                      max={9999}
                      value={costForm.materialCost}
                      onChange={(e) =>
                        setCostForm({
                          ...costForm,
                          materialCost: Number(e.target.value),
                        })
                      }
                      placeholder="25"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
                      重量 (kg/m)
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min={0}
                      max={10}
                      value={costForm.weightPerMeter}
                      onChange={(e) =>
                        setCostForm({
                          ...costForm,
                          weightPerMeter: Number(e.target.value),
                        })
                      }
                      placeholder="0.85"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
                    备注说明
                  </label>
                  <input
                    type="text"
                    value={costForm.notes}
                    onChange={(e) =>
                      setCostForm({ ...costForm, notes: e.target.value })
                    }
                    placeholder="材质厚度、主配货厂家等"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-indigo-600 text-white text-xs font-black py-2.5 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/10 disabled:opacity-50"
                  >
                    {saving ? '保存中...' : editingCostId ? '保存修改' : '确认添加'}
                  </button>
                  {editingCostId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCostId(null);
                        setCostForm(DEFAULT_COST_FORM);
                      }}
                      className="px-4 bg-slate-100 text-slate-600 text-xs font-black rounded-xl hover:bg-slate-200 transition-all"
                    >
                      取消
                    </button>
                  )}
                </div>
              </form>
            </section>

            {/* Smart import guide */}
            <div className="bg-indigo-50/50 border border-indigo-100 p-5 rounded-[2rem] text-xs space-y-2 text-indigo-950">
              <p className="font-black flex items-center gap-1.5">
                <span className="text-base">💡</span>底价智能导入小助手
              </p>
              <p className="leading-relaxed text-indigo-800">
                在顶部点击<b>"上传底价资料导入"</b>
                ，可以直接拖入您的报价表单图片、微信截图、Excel 表格、PDF 文档。
              </p>
              <p className="leading-relaxed text-indigo-800">
                上传后会先<strong>显示预览</strong>，您可检查提取的文字内容；
                再点击"开始 AI 解析"由 AI 智能识别底价，最后确认导入。
              </p>
            </div>

            {/* 文件预览 + AI 解析流程 */}
            {pendingFile && (
              <div className="bg-amber-50/60 border-2 border-amber-300 p-5 rounded-[2rem] space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span>📄</span>文件预览
                  </h4>
                  <button
                    onClick={handleCancelPreview}
                    className="text-amber-700 hover:text-amber-900 text-xs font-bold"
                  >
                    ✕ 取消
                  </button>
                </div>
                <div className="text-xs text-amber-800">
                  <div className="font-bold mb-1">
                    📎 {pendingFile.fileName}{' '}
                    <span className="text-amber-600 font-normal">
                      ({pendingFile.fileType})
                    </span>
                  </div>
                  <div className="bg-white/70 border border-amber-200 rounded-lg p-3 max-h-40 overflow-auto whitespace-pre-wrap text-[10px] font-mono leading-relaxed">
                    {pendingFile.textContent.slice(0, 2000)}
                    {pendingFile.textContent.length > 2000 && (
                      <span className="text-amber-600">
                        {'\n'}... 还有 {pendingFile.textContent.length - 2000} 字符
                      </span>
                    )}
                  </div>
                </div>
                {parsedRecords.length === 0 ? (
                  <button
                    onClick={handleStartAiParse}
                    disabled={parsing}
                    className="w-full bg-amber-500 text-white text-xs font-black py-2.5 rounded-xl hover:bg-amber-600 transition-all disabled:opacity-50 shadow-md shadow-amber-500/20"
                  >
                    {parsing ? '🤖 AI 解析中...' : '🤖 开始 AI 智能解析'}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-black text-emerald-900">
                        ✅ AI 解析完成，识别到 {parsedRecords.length} 条底价
                      </h5>
                      <button
                        onClick={() => setParsedRecords([])}
                        className="text-slate-500 hover:text-slate-700 text-[10px] underline"
                      >
                        重新解析
                      </button>
                    </div>
                    <div className="bg-white border border-emerald-200 rounded-lg p-2 max-h-64 overflow-auto">
                      <table className="w-full text-[10px]">
                        <thead className="bg-emerald-50/50">
                          <tr>
                            <th className="px-2 py-1 text-left text-emerald-700">型号</th>
                            <th className="px-2 py-1 text-left text-emerald-700">颜色</th>
                            <th className="px-2 py-1 text-right text-emerald-700">单价</th>
                            <th className="px-2 py-1 text-right text-emerald-700">重量</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedRecords.map((r, i) => (
                            <tr key={i} className="border-t border-emerald-100">
                              <td className="px-2 py-1 font-bold">{r.model || '?'}</td>
                              <td className="px-2 py-1 text-slate-600">{r.color || '?'}</td>
                              <td className="px-2 py-1 text-right text-indigo-600 font-bold">
                                ¥{r.materialCost}
                              </td>
                              <td className="px-2 py-1 text-right text-slate-500">
                                {r.weightPerMeter}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      onClick={handleConfirmImport}
                      className="w-full bg-emerald-600 text-white text-xs font-black py-2.5 rounded-xl hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/20"
                    >
                      ✅ 确认导入到云端
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

        {/* Right: list table */}
        <div className="lg:col-span-8 space-y-6">
          <section className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={costSearch}
                  onChange={(e) => setCostSearch(e.target.value)}
                  placeholder="检索型号、颜色、说明备注..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none placeholder:text-slate-300"
                />
                <svg
                  className="w-4 h-4 text-slate-300 absolute left-3.5 top-2.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>

            {/* 加载/错误状态 */}
            {costDbLoading ? (
              <div className="text-center py-12 text-slate-400 text-xs font-bold">
                正在从云端加载底价数据...
              </div>
            ) : costDbError ? (
              <div className="text-center py-12 text-rose-500 text-xs font-bold">
                加载失败: {costDbError}
              </div>
            ) : (
              <div className="overflow-auto rounded-2xl border border-slate-100 max-h-[60vh]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3.5 font-black text-slate-400 uppercase tracking-widest">型号</th>
                      <th className="px-5 py-3.5 font-black text-slate-400 uppercase tracking-widest">颜色</th>
                      <th className="px-5 py-3.5 font-black text-slate-400 uppercase tracking-widest">材料成本 (元/米)</th>
                      <th className="px-5 py-3.5 font-black text-slate-400 uppercase tracking-widest">重量 (kg/m)</th>
                      <th className="px-5 py-3.5 font-black text-slate-400 uppercase tracking-widest">备注</th>
                      <th className="px-5 py-3.5 font-black text-slate-400 text-right uppercase tracking-widest">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                    {filteredCostDb.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-slate-300 font-black tracking-widest uppercase">
                          无对应底价数据
                        </td>
                      </tr>
                    ) : (
                      filteredCostDb.map((record) => (
                        <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3.5 font-black text-slate-900">{record.model}</td>
                          <td className="px-5 py-3.5 text-slate-600">
                            <div className="flex flex-col gap-0.5">
                              <span>{record.color}</span>
                              {/* 复用规则标签 */}
                              {sourceColorMap[record.color.trim().toLowerCase()] && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5 w-fit">
                                  ↻ {sourceColorMap[record.color.trim().toLowerCase()]}
                                </span>
                              )}
                              {targetCountMap[record.color.trim().toLowerCase()] && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] text-blue-500 bg-blue-50 rounded-full px-1.5 py-0.5 w-fit">
                                  ← {targetCountMap[record.color.trim().toLowerCase()]}个复用
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-indigo-600">¥ {record.materialCost}</td>
                          <td className="px-5 py-3.5 text-slate-500">{record.weightPerMeter}</td>
                          <td className="px-5 py-3.5 text-slate-400 font-medium max-w-[150px] truncate" title={record.notes}>{record.notes || '-'}</td>
                          <td className="px-5 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                            <button onClick={() => editCostRecord(record)} className="text-indigo-600 hover:text-indigo-800 hover:underline text-xs">编辑</button>
                            <span className="text-slate-200">|</span>
                            <button onClick={() => deleteCostRecord(record.id)} className="text-red-500 hover:text-red-700 hover:underline text-xs">删除</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* 颜色复用规则模态框 */}
      <ColorReuseRulesModal
        open={reuseRulesModalOpen}
        onClose={() => setReuseRulesModalOpen(false)}
        rules={priceConfig.colorReuseRules || []}
        onSave={handleSaveReuseRules}
      />
    </>
  );
};

export default CostDatabasePanel;

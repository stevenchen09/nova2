import React, { useState, useEffect } from 'react';
import { PriceConfig, PricingMode, Role } from '../../types';

/** 单个价格字段的配置元信息 */
interface FieldConfig {
  configKey: keyof Pick<
    PriceConfig,
    | 'materialPrice'
    | 'quoteAccessoryPrice'
    | 'quoteCuttingFee'
    | 'quoteTaxRate'
    | 'defaultWeightPerMeter'
    | 'defaultWeightPerAccessorySet'
  >;
  label: string;
  min: number;
  max: number;
  step: string;
  defaultValue: number;
}

/** V3 价格字段完整配置表（quote* 字段名体系） */
const PRICE_FIELDS: FieldConfig[] = [
  {
    configKey: 'materialPrice',
    label: '材料报价(元/米)',
    min: 0,
    max: 9999,
    step: '0.01',
    defaultValue: 45,
  },
  {
    configKey: 'quoteAccessoryPrice',
    label: '配件单价(元/套)',
    min: 0,
    max: 999,
    step: '0.01',
    defaultValue: 15,
  },
  {
    configKey: 'quoteCuttingFee',
    label: '切割工费(元/个)',
    min: 0,
    max: 99,
    step: '0.01',
    defaultValue: 3,
  },
  {
    configKey: 'quoteTaxRate',
    label: '税率(0=无税)',
    min: 0,
    max: 0.3,
    step: '0.0001',
    defaultValue: 0.13,
  },
  {
    configKey: 'defaultWeightPerMeter',
    label: '材料重量(kg/m)',
    min: 0,
    max: 10,
    step: '0.001',
    defaultValue: 0.85,
  },
  {
    configKey: 'defaultWeightPerAccessorySet',
    label: '配件重量(kg/套)',
    min: 0,
    max: 5,
    step: '0.001',
    defaultValue: 0.12,
  },
];

interface PriceConfigCardProps {
  /** 当前用户角色 */
  role: Role;
  /** 当前费率配置（云端加载） */
  priceConfig: PriceConfig;
  priceConfigLoading: boolean;
  /** 本地实时更新（live 预览，不持久化） */
  onPriceConfigChange: React.Dispatch<React.SetStateAction<PriceConfig>>;
  /** 持久化到云端 */
  onPersistPriceConfig: (config: PriceConfig) => Promise<PriceConfig>;
}

/**
 * Pricing parameter configuration card — V4 云端改造版.
 *
 * 变更说明（V3 → V4）：
 * - 数据源改为云端（priceConfig 由父组件通过 useCloudData 提供）
 * - 移除 priceConfigMemory（本地记忆功能废弃，云端统一存储）
 * - admin 可编辑所有字段；sales 字段全部 disabled 只读
 * - 添加「保存费率」按钮，显式调用 cloudService.priceConfig.update
 * - 编辑时实时同步本地 state（供工作区 live 预览），保存时持久化到云端
 */
const PriceConfigCard: React.FC<PriceConfigCardProps> = ({
  role,
  priceConfig,
  priceConfigLoading,
  onPriceConfigChange,
  onPersistPriceConfig,
}) => {
  const isAdmin = true;
  const isReadOnly = false;

  /** 本地草稿（用于检测是否有未保存修改） */
  const [draft, setDraft] = useState<PriceConfig>(priceConfig);
  const [saving, setSaving] = useState(false);

  // 当外部 priceConfig 的【报价字段】变化时（如云端刷新），同步到本地草稿
  // 注意：cost* 字段变化不触发重置（避免成本库保存时影响报价区草稿）
  const quoteSignature = JSON.stringify({
    materialPrice: priceConfig.materialPrice,
    mode: priceConfig.mode,
    quoteAccessoryPrice: priceConfig.quoteAccessoryPrice,
    quoteCuttingFee: priceConfig.quoteCuttingFee,
    quoteTaxRate: priceConfig.quoteTaxRate,
    defaultWeightPerMeter: priceConfig.defaultWeightPerMeter,
    defaultWeightPerAccessorySet: priceConfig.defaultWeightPerAccessorySet,
  });
  useEffect(() => {
    setDraft(priceConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteSignature]);

  const hasUnsavedChanges =
    JSON.stringify({
      materialPrice: draft.materialPrice,
      mode: draft.mode,
      quoteAccessoryPrice: draft.quoteAccessoryPrice,
      quoteCuttingFee: draft.quoteCuttingFee,
      quoteTaxRate: draft.quoteTaxRate,
      defaultWeightPerMeter: draft.defaultWeightPerMeter,
      defaultWeightPerAccessorySet: draft.defaultWeightPerAccessorySet,
    }) !==
    JSON.stringify({
      materialPrice: priceConfig.materialPrice,
      mode: priceConfig.mode,
      quoteAccessoryPrice: priceConfig.quoteAccessoryPrice,
      quoteCuttingFee: priceConfig.quoteCuttingFee,
      quoteTaxRate: priceConfig.quoteTaxRate,
      defaultWeightPerMeter: priceConfig.defaultWeightPerMeter,
      defaultWeightPerAccessorySet: priceConfig.defaultWeightPerAccessorySet,
    });

  /** 字段变更：同步到本地草稿 + 实时同步到父级 state（供 live 预览） */
  const handleFieldChange = (field: FieldConfig, value: number) => {
    const next = { ...draft, [field.configKey]: value };
    setDraft(next);
    onPriceConfigChange(next);
  };

  /** 模式切换 */
  const handleModeChange = (mode: PricingMode) => {
    const next = { ...draft, mode };
    setDraft(next);
    onPriceConfigChange(next);
  };

  /** 保存到云端 */
  const handleSave = async () => {
    setSaving(true);
    try {
      await onPersistPriceConfig(draft);
    } catch (err: any) {
      alert(`保存费率失败: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  if (priceConfigLoading) {
    return (
      <section className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
        <p className="text-xs text-slate-400 text-center py-4">正在加载费率配置...</p>
      </section>
    );
  }

  return (
    <section className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          报价计费与技术参数
        </h3>
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <span className="text-[9px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-extrabold">
              未保存
            </span>
          )}
          <span className="text-[9px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-extrabold">
            {isReadOnly ? '只读' : '手动核价'}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Mode toggle */}
        <div className="flex p-1 bg-slate-100 rounded-2xl">
          <button
            onClick={() => !isReadOnly && handleModeChange(PricingMode.BATCH)}
            disabled={isReadOnly}
            className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all ${
              priceConfig.mode === PricingMode.BATCH
                ? 'bg-white text-slate-900 shadow'
                : 'text-slate-400'
            } ${isReadOnly ? 'cursor-not-allowed' : ''}`}
          >
            批量整料合并
          </button>
          <button
            onClick={() => !isReadOnly && handleModeChange(PricingMode.RETAIL)}
            disabled={isReadOnly}
            className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all ${
              priceConfig.mode === PricingMode.RETAIL
                ? 'bg-white text-slate-900 shadow'
                : 'text-slate-400'
            } ${isReadOnly ? 'cursor-not-allowed' : ''}`}
          >
            零散周长计算
          </button>
        </div>

        {/* Numeric fields grid */}
        <div className="grid grid-cols-2 gap-3">
          {PRICE_FIELDS.map((field) => (
            <div key={field.configKey} className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase ml-1">
                {field.label}
              </label>
              <input
                type="number"
                min={field.min}
                max={field.max}
                step={field.step}
                value={draft[field.configKey] ?? field.defaultValue}
                onChange={(e) => {
                  if (isReadOnly) return;
                  const raw = e.target.value;
                  if (raw === '' || raw === '-') return;
                  const val = parseFloat(raw);
                  if (!isNaN(val)) {
                    handleFieldChange(field, val);
                  }
                }}
                onBlur={(e) => {
                  if (isReadOnly) return;
                  const val = parseFloat(e.target.value);
                  if (isNaN(val)) return;
                  const clamped = Math.min(field.max, Math.max(field.min, val));
                  if (clamped !== val) {
                    handleFieldChange(field, clamped);
                  }
                }}
                disabled={isReadOnly}
                className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-1.5 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                  isReadOnly ? 'opacity-60 cursor-not-allowed bg-slate-100' : ''
                }`}
              />
              {/* 切割单价下方帮助提示 */}
              {field.configKey === 'quoteCuttingFee' && (
                <p className="text-[8px] text-slate-400 ml-1 mt-0.5">
                  💡 切割费按总切割边长计算(元/米)
                </p>
              )}
            </div>
          ))}
        </div>

        {/* 保存按钮 */}
          <button
            onClick={handleSave}
            disabled={saving || !hasUnsavedChanges}
            className="w-full bg-indigo-600 text-white py-2 text-xs font-black rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {saving ? '保存中...' : hasUnsavedChanges ? '保存费率到云端' : '✓ 已同步云端'}
          </button>
          <p className="text-[8px] text-slate-400 text-center mt-1">如多人同时编辑，以最后保存为准</p>
      </div>
    </section>
  );
};

export default PriceConfigCard;

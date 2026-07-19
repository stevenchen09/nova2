import React from 'react';
import { PriceConfig, CostOverride } from '../../types';

interface CostOverridePanelProps {
  /** 全局默认费率（来自云端 priceConfig） */
  priceConfig: PriceConfig;
  /** 当前覆盖值（null 表示使用全局默认） */
  costOverride: CostOverride | null;
  /** 覆盖值变更回调 */
  onCostOverrideChange: (override: CostOverride | null) => void;
}

/**
 * 成本费率覆盖面板（per-quote 级别临时覆盖）
 *
 * 设计说明：
 * - 开关关闭时：使用全局 priceConfig 的 cost* 值，三字段 disabled
 * - 开关开启时：首次深拷贝全局默认值，用户可逐项编辑
 * - 每个字段下方灰色小字显示"全局默认: ¥X.XX"
 * - 底部"重置为全局默认"按钮将覆盖值重置为全局当前值
 *
 * 核心模式：effectiveConfig = costOverride ? {...priceConfig, ...costOverride} : priceConfig
 * 全局 priceConfig 不被污染（不写回云端）。
 */
const CostOverridePanel: React.FC<CostOverridePanelProps> = ({
  priceConfig,
  costOverride,
  onCostOverrideChange,
}) => {
  const isEnabled = costOverride !== null;

  /** 开启/关闭覆盖 */
  const handleToggle = () => {
    if (isEnabled) {
      // 关闭覆盖 = setCostOverride(null)，回退到全局最新值
      onCostOverrideChange(null);
    } else {
      // 首次开启：深拷贝全局默认值
      onCostOverrideChange({
        costAccessoryPrice: priceConfig.costAccessoryPrice,
        costCuttingFee: priceConfig.costCuttingFee,
        costTaxRate: priceConfig.costTaxRate,
      });
    }
  };

  /** 更新单个覆盖字段 */
  const handleFieldChange = (field: keyof CostOverride, value: number) => {
    if (!costOverride) return;
    onCostOverrideChange({
      ...costOverride,
      [field]: value,
    });
  };

  /** 重置为全局默认值（保持开启状态，仅重置数值） */
  const handleReset = () => {
    onCostOverrideChange({
      costAccessoryPrice: priceConfig.costAccessoryPrice,
      costCuttingFee: priceConfig.costCuttingFee,
      costTaxRate: priceConfig.costTaxRate,
    });
  };

  // 当前显示值：开启时用覆盖值，关闭时用全局值
  const displayAccessoryPrice = isEnabled
    ? costOverride!.costAccessoryPrice
    : priceConfig.costAccessoryPrice;
  const displayCuttingFee = isEnabled
    ? costOverride!.costCuttingFee
    : priceConfig.costCuttingFee;
  const displayTaxRate = isEnabled
    ? costOverride!.costTaxRate
    : priceConfig.costTaxRate;

  return (
    <div
      className={`bg-white p-5 rounded-2xl border transition-all ${
        isEnabled
          ? 'border-amber-300 shadow-md shadow-amber-100'
          : 'border-slate-200 shadow-sm'
      }`}
    >
      {/* 标题行 + 开关 */}
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-0.5">
          <h3 className="text-xs font-black text-slate-800 tracking-tight">
            成本费率覆盖
          </h3>
          <p className="text-[10px] text-slate-400 font-medium">
            临时覆盖本单成本费率，不影响全局设置
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={handleToggle}
            className="sr-only peer"
          />
          <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all after:border after:border-slate-300 peer-checked:bg-amber-500"></div>
          <span className="ml-2 text-[10px] font-black text-slate-500 select-none">
            {isEnabled ? '自定义成本费率' : '使用全局默认'}
          </span>
        </label>
      </div>

      {/* 三个数字输入框：配件/切工并排，税率单独一行 */}
      <div className="space-y-3">
        {/* 成本配件单价 + 成本切工费率 并排 */}
        <div className="grid grid-cols-2 gap-3">
          {/* 成本配件单价 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold text-slate-600">
                成本配件单价
              </label>
              <span className="text-[9px] text-slate-400 font-medium">元/套</span>
            </div>
            <input
              type="number"
              step="0.01"
              min={0}
              value={displayAccessoryPrice}
              disabled={!isEnabled}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!isNaN(v)) handleFieldChange('costAccessoryPrice', v);
              }}
              className={`w-full px-2.5 py-1.5 text-sm font-bold rounded-lg border outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                isEnabled
                  ? 'border-amber-200 bg-amber-50/30 text-slate-800 focus:border-amber-400 focus:ring-2 focus:ring-amber-100'
                  : 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
              }`}
            />
            <p className="text-[9px] text-slate-400 mt-0.5 font-medium">
              全局: ¥{priceConfig.costAccessoryPrice.toFixed(2)}
            </p>
          </div>

          {/* 成本切工费率 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold text-slate-600">
                成本切工费率
              </label>
              <span className="text-[9px] text-slate-400 font-medium">元/个</span>
            </div>
            <input
              type="number"
              step="0.01"
              min={0}
              value={displayCuttingFee}
              disabled={!isEnabled}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!isNaN(v)) handleFieldChange('costCuttingFee', v);
              }}
              className={`w-full px-2.5 py-1.5 text-sm font-bold rounded-lg border outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                isEnabled
                  ? 'border-amber-200 bg-amber-50/30 text-slate-800 focus:border-amber-400 focus:ring-2 focus:ring-amber-100'
                  : 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
              }`}
            />
            <p className="text-[9px] text-slate-400 mt-0.5 font-medium">
              全局: ¥{priceConfig.costCuttingFee.toFixed(2)}
            </p>
          </div>
        </div>

        {/* 成本税率 单独一行 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] font-bold text-slate-600">
              成本税率
            </label>
            <span className="text-[9px] text-slate-400 font-medium">
              纯税率（如 0.13 = 13%）
            </span>
          </div>
          <input
            type="number"
            step="0.0001"
            min={0}
            max={1}
            value={displayTaxRate}
            disabled={!isEnabled}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!isNaN(v)) handleFieldChange('costTaxRate', v);
            }}
            className={`w-full px-3 py-2 text-sm font-bold rounded-lg border outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
              isEnabled
                ? 'border-amber-200 bg-amber-50/30 text-slate-800 focus:border-amber-400 focus:ring-2 focus:ring-amber-100'
                : 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
            }`}
          />
          <p className="text-[9px] text-slate-400 mt-0.5 font-medium">
            全局默认: {(priceConfig.costTaxRate * 100).toFixed(2)}%（{priceConfig.costTaxRate.toFixed(4)}）
          </p>
        </div>
      </div>

      {/* 底部重置按钮 */}
      {isEnabled && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <button
            onClick={handleReset}
            className="text-[10px] font-bold text-slate-400 hover:text-amber-600 transition-colors"
          >
            ↺ 重置为全局默认
          </button>
        </div>
      )}
    </div>
  );
};

export default CostOverridePanel;

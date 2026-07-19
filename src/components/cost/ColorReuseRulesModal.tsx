import React, { useState, useEffect } from 'react';
import { ColorReuseRule } from '../../types';

interface ColorReuseRulesModalProps {
  open: boolean;
  onClose: () => void;
  rules: ColorReuseRule[];
  onSave: (rules: ColorReuseRule[]) => Promise<void>;
}

/**
 * 默认颜色复用规则（与云函数 getDefaultConfig 保持一致）
 */
const DEFAULT_RULES: ColorReuseRule[] = [
  { sourceColor: '哑银', targetColor: '哑黑' },
  { sourceColor: '浅哑金', targetColor: '哑黑' },
  { sourceColor: '磨砂白', targetColor: '哑黑' },
  { sourceColor: '亮钛金', targetColor: '磨光亮金' },
  { sourceColor: '紫金', targetColor: '磨光亮金' },
];

/**
 * ColorReuseRulesModal — 颜色单价复用规则管理模态框
 *
 * 功能：
 *   - 左侧列出当前映射（源→目标），每行有删除按钮
 *   - 右侧新增表单（源颜色 + 目标颜色 + 添加按钮）
 *   - 底部"恢复默认规则"和"保存到云端"按钮
 *   - 校验：源≠目标；不允许循环；源不重复
 *
 * 样式与 CostDatabasePanel 保持一致（Tailwind + slate 色系）
 */
const ColorReuseRulesModal: React.FC<ColorReuseRulesModalProps> = ({
  open,
  onClose,
  rules,
  onSave,
}) => {
  const [localRules, setLocalRules] = useState<ColorReuseRule[]>(rules);
  const [newSource, setNewSource] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // 打开时同步外部 rules 到本地编辑状态
  useEffect(() => {
    if (open) {
      setLocalRules(rules.length > 0 ? rules.map(r => ({ ...r })) : []);
      setNewSource('');
      setNewTarget('');
      setError('');
    }
  }, [open, rules]);

  if (!open) return null;

  /**
   * 校验单条规则合法性
   * @returns 错误信息，空字符串表示通过
   */
  const validateRule = (
    source: string,
    target: string,
    existingRules: ColorReuseRule[],
    excludeIdx?: number,
  ): string => {
    const s = source.trim();
    const t = target.trim();
    if (!s) return '源颜色不能为空';
    if (!t) return '目标颜色不能为空';
    if (s === t) return '源颜色和目标颜色不能相同';

    // 源颜色不重复
    for (let i = 0; i < existingRules.length; i++) {
      if (excludeIdx !== undefined && i === excludeIdx) continue;
      if (existingRules[i].sourceColor.trim() === s) {
        return `源颜色"${s}"已存在重复规则`;
      }
    }

    // 不允许循环引用：A→B 和 B→A 不能同时存在
    for (let i = 0; i < existingRules.length; i++) {
      if (excludeIdx !== undefined && i === excludeIdx) continue;
      if (
        existingRules[i].sourceColor.trim() === t &&
        existingRules[i].targetColor.trim() === s
      ) {
        return `存在循环引用：${t}→${s} 与 ${s}→${t} 冲突`;
      }
    }

    return '';
  };

  /** 添加新规则 */
  const handleAddRule = () => {
    const err = validateRule(newSource, newTarget, localRules);
    if (err) {
      setError(err);
      return;
    }
    setLocalRules([
      ...localRules,
      { sourceColor: newSource.trim(), targetColor: newTarget.trim() },
    ]);
    setNewSource('');
    setNewTarget('');
    setError('');
  };

  /** 删除指定索引的规则 */
  const handleDeleteRule = (idx: number) => {
    setLocalRules(localRules.filter((_, i) => i !== idx));
    setError('');
  };

  /** 恢复默认规则 */
  const handleRestoreDefaults = () => {
    setLocalRules(DEFAULT_RULES.map(r => ({ ...r })));
    setError('');
  };

  /** 保存到云端 */
  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(localRules);
      onClose();
    } catch (err: any) {
      setError(`保存失败: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-sm font-black text-slate-900 tracking-tight">
              颜色单价复用规则
            </h3>
            <p className="text-[10px] text-slate-400">
              当某颜色无底价时，自动复用目标颜色的底价进行查价
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-all"
          >
            ✕
          </button>
        </div>

        {/* ── Body: left list + right form ── */}
        <div className="flex-1 overflow-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: existing rules list */}
          <div>
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
              当前映射 ({localRules.length})
            </h4>
            {localRules.length === 0 ? (
              <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl px-4 py-8 text-center">
                <p className="text-xs text-slate-400 italic">暂无复用规则</p>
                <p className="text-[10px] text-slate-300 mt-1">
                  在右侧添加新映射
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {localRules.map((rule, idx) => (
                  <div
                    key={`${rule.sourceColor}-${idx}`}
                    className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 group hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <span className="text-slate-700">{rule.sourceColor}</span>
                      <svg
                        className="w-3.5 h-3.5 text-slate-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.5"
                          d="M14 5l7 7m0 0l-7 7m7-7H3"
                        />
                      </svg>
                      <span className="text-indigo-600">{rule.targetColor}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteRule(idx)}
                      className="text-red-400 hover:text-red-600 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: add new rule form */}
          <div>
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
              新增映射
            </h4>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
                  源颜色（无底价的颜色）
                </label>
                <input
                  type="text"
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  placeholder="如: 哑银"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 ring-violet-500/20 outline-none placeholder:text-slate-300"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddRule();
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
                  目标颜色（有底价的颜色）
                </label>
                <input
                  type="text"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  placeholder="如: 哑黑"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 ring-violet-500/20 outline-none placeholder:text-slate-300"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddRule();
                  }}
                />
              </div>
              {error && (
                <p className="text-[10px] text-red-500 font-bold bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">
                  ⚠ {error}
                </p>
              )}
              <button
                onClick={handleAddRule}
                disabled={!newSource.trim() || !newTarget.trim()}
                className="w-full bg-violet-600 text-white text-xs font-black py-2.5 rounded-xl hover:bg-violet-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-1"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                添加映射
              </button>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
          <button
            onClick={handleRestoreDefaults}
            className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
          >
            ↻ 恢复默认规则
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-violet-600 text-white text-xs font-black rounded-xl hover:bg-violet-700 transition-all disabled:opacity-50 shadow-sm"
            >
              {saving ? '保存中...' : '保存到云端'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColorReuseRulesModal;

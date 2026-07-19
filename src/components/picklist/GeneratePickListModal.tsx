import React, { useState, useEffect } from 'react';
import { GroupResult, SharePermissions } from '../../types';
import { cloudService } from '../../services/cloudService';

interface GeneratePickListModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: GroupResult[];
  calculationId?: string;
  onGenerated: (shareCode: string) => void;
  /** 可选：预填客户名（来自工作区当前 clientName） */
  initialClientName?: string;
  /** 可选：预填订单名（来自工作区当前 orderName） */
  initialOrderName?: string;
}

/**
 * V4 T06 — 生成领料单模态框
 *
 * 销售算完料后点击「生成领料单」弹出。包含：
 *   - 客户名/订单名/订单日期输入
 *   - 4 项分享权限勾选（profileCutting / costDetail / clientInfo / simpleList）
 *   - 调 cloudService.shareOrder.create 生成分享码
 *   - 成功后展示分享码 + 复制按钮 + 分享链接
 */
const GeneratePickListModal: React.FC<GeneratePickListModalProps> = ({
  isOpen,
  onClose,
  results,
  calculationId,
  onGenerated,
  initialClientName,
  initialOrderName,
}) => {
  // ── 表单状态 ──────────────────────────────────────────────────
  const [clientName, setClientName] = useState('');
  const [orderName, setOrderName] = useState('');
  const [orderDate, setOrderDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [permissions, setPermissions] = useState<SharePermissions>({
    profileCutting: true,
    costDetail: false,
    clientInfo: true,
    simpleList: true,
  });

  // ── 提交状态 ──────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [generated, setGenerated] = useState<{
    shareCode: string;
    expiresAt: string;
  } | null>(null);

  // 打开时重置状态（同时预填工作区当前客户/订单名）
  useEffect(() => {
    if (isOpen) {
      setSubmitting(false);
      setErrorMsg('');
      setGenerated(null);
      setClientName(initialClientName || '');
      setOrderName(initialOrderName || '');
      setOrderDate(new Date().toISOString().slice(0, 10));
      setPermissions({
        profileCutting: true,
        costDetail: false,
        clientInfo: true,
        simpleList: true,
      });
    }
  }, [isOpen, initialClientName, initialOrderName]);

  if (!isOpen) return null;

  // ── 复选框切换 ────────────────────────────────────────────────
  const togglePermission = (key: keyof SharePermissions) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ── 生成领料单 ────────────────────────────────────────────────
  const handleGenerate = async () => {
    setErrorMsg('');

    if (!clientName.trim()) {
      setErrorMsg('请填写客户名称');
      return;
    }
    if (!orderName.trim()) {
      setErrorMsg('请填写订单名称');
      return;
    }
    if (!orderDate) {
      setErrorMsg('请选择订单日期');
      return;
    }
    if (!results || results.length === 0) {
      setErrorMsg('当前无算料结果，无法生成领料单');
      return;
    }

    // 至少勾选一项权限
    const anyChecked =
      permissions.profileCutting ||
      permissions.costDetail ||
      permissions.clientInfo ||
      permissions.simpleList;
    if (!anyChecked) {
      setErrorMsg('请至少勾选一项分享内容');
      return;
    }

    setSubmitting(true);
    try {
      const res = await cloudService.shareOrder.create({
        clientName: clientName.trim(),
        orderName: orderName.trim(),
        orderDate,
        calculationId: calculationId || '',
        results,
        permissions,
      });
      setGenerated({ shareCode: res.shareCode, expiresAt: res.expiresAt });
      onGenerated(res.shareCode);
    } catch (e: any) {
      setErrorMsg(e?.message || '生成领料单失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  // ── 复制分享码 ────────────────────────────────────────────────
  const handleCopyCode = async () => {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.shareCode);
    } catch {
      // 降级方案
      const ta = document.createElement('textarea');
      ta.value = generated.shareCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  // ── 关闭弹窗 ────────────────────────────────────────────────
  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-indigo-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
            </div>
            <h3 className="text-base font-black text-slate-900">生成领料单</h3>
          </div>
          <button
            onClick={handleClose}
            disabled={submitting}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1.5 transition-all disabled:opacity-40"
            aria-label="关闭"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* 主体 */}
        <div className="px-6 py-5 space-y-5">
          {generated ? (
            // ── 成功结果展示 ──
            <div className="space-y-5">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 mb-3">
                  <svg
                    className="w-6 h-6 text-emerald-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <p className="text-sm font-black text-emerald-700 mb-1">
                  领料单已生成
                </p>
                <p className="text-[11px] text-emerald-600">
                  请将分享码发送给工厂端，对方输入后即可查看
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">
                  分享码（6 位）
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-900 text-indigo-300 font-mono text-2xl font-black tracking-[0.5em] text-center py-3 rounded-xl">
                    {generated.shareCode}
                  </div>
                  <button
                    onClick={handleCopyCode}
                    className="px-4 py-3 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition-all whitespace-nowrap"
                  >
                    复制
                  </button>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-amber-500 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-[11px] text-amber-700 font-bold">
                  有效期至：
                  {new Date(generated.expiresAt).toLocaleString('zh-CN', {
                    hour12: false,
                  })}
                  （7 天内有效）
                </p>
              </div>
            </div>
          ) : (
            // ── 表单 ──
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                    客户名称
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="如：张三"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none placeholder:text-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                    订单名称
                  </label>
                  <input
                    type="text"
                    value={orderName}
                    onChange={(e) => setOrderName(e.target.value)}
                    placeholder="如：画框A"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none placeholder:text-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                  订单日期
                </label>
                <input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none"
                />
              </div>

              {/* 分享内容授权 */}
              <div>
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">
                  分享内容授权
                </p>
                <div className="space-y-2">
                  <PermissionCheckbox
                    label="型材切割明细"
                    desc="型号/颜色/长度/数量"
                    checked={permissions.profileCutting}
                    onChange={() => togglePermission('profileCutting')}
                  />
                  <PermissionCheckbox
                    label="费用成本明细"
                    desc="材料/配件/切工/税金"
                    checked={permissions.costDetail}
                    onChange={() => togglePermission('costDetail')}
                    warning="含成本数据"
                  />
                  <PermissionCheckbox
                    label="客户/订单信息"
                    desc="客户名/订单名/日期"
                    checked={permissions.clientInfo}
                    onChange={() => togglePermission('clientInfo')}
                  />
                  <PermissionCheckbox
                    label="简洁领料单"
                    desc="型号×数量汇总"
                    checked={permissions.simpleList}
                    onChange={() => togglePermission('simpleList')}
                  />
                </div>
              </div>

              <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 space-y-1.5">
                <p className="text-[11px] text-indigo-700 font-bold flex items-center gap-1.5">
                  <span>💡</span>
                  未勾选的内容工厂端将不可见
                </p>
                <p className="text-[11px] text-indigo-700 font-bold flex items-center gap-1.5">
                  <span>⏰</span>
                  分享码 7 天内有效
                </p>
              </div>

              {errorMsg && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
                  <p className="text-[11px] text-rose-600 font-bold">
                    {errorMsg}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            onClick={handleClose}
            disabled={submitting}
            className="px-4 py-2 text-xs font-black text-slate-500 hover:bg-slate-100 rounded-xl transition-all disabled:opacity-40"
          >
            {generated ? '关闭' : '取消'}
          </button>
          {!generated && (
            <button
              onClick={handleGenerate}
              disabled={submitting}
              className="px-5 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-500/15 transition-all disabled:opacity-60 flex items-center gap-1.5"
            >
              {submitting && (
                <svg
                  className="animate-spin h-3.5 w-3.5"
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
              )}
              生成领料单
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── 内部组件：权限勾选项 ──────────────────────────────────────
interface PermissionCheckboxProps {
  label: string;
  desc: string;
  checked: boolean;
  onChange: () => void;
  warning?: string;
}

const PermissionCheckbox: React.FC<PermissionCheckboxProps> = ({
  label,
  desc,
  checked,
  onChange,
  warning,
}) => (
  <label
    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
      checked
        ? 'bg-indigo-50/50 border-indigo-200'
        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
    }`}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30 cursor-pointer"
    />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-black text-slate-800">{label}</span>
        {warning && (
          <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">
            ⚠️ {warning}
          </span>
        )}
      </div>
      <p className="text-[10px] text-slate-400 font-bold">{desc}</p>
    </div>
  </label>
);

export default GeneratePickListModal;

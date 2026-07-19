import React, { useState, useEffect, useCallback } from 'react';
import { ShareOrder, GroupResult } from '../../types';
import { cloudService } from '../../services/cloudService';

interface PickListDetailProps {
  /** 分享码（二选一传入） */
  shareCode?: string;
  /** 直接传入 ShareOrder 对象（如从列表跳转时） */
  order?: ShareOrder;
  onClose: () => void;
}

/**
 * V4 T07 — 领料单详情页
 *
 * 按 permissions 渲染 4 个模块：
 *   - profileCutting: 型材切割明细表（型号/颜色/长度/数量/重量）
 *   - costDetail: 费用成本明细表
 *   - clientInfo: 客户/订单信息
 *   - simpleList: 简洁领料单（型号×数量汇总）
 *
 * 未授权模块显示「此部分内容未被分享」。
 * 过期/已撤回时显示对应状态提示。
 */
const PickListDetail: React.FC<PickListDetailProps> = ({
  shareCode,
  order: initialOrder,
  onClose,
}) => {
  const [order, setOrder] = useState<ShareOrder | null>(initialOrder || null);
  const [loading, setLoading] = useState<boolean>(!initialOrder);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const loadOrder = useCallback(async (code: string) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const o = await cloudService.shareOrder.getByCode(code);
      setOrder(o);
    } catch (e: any) {
      setErrorMsg(e?.message || '获取领料单失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialOrder && shareCode) {
      loadOrder(shareCode);
    }
  }, [initialOrder, shareCode, loadOrder]);

  // ── 状态判断 ────────────────────────────────────────────────
  const isExpired = order
    ? new Date(order.expiresAt).getTime() < Date.now()
    : false;
  const isRevoked = order?.revoked === true;
  const isInvalid = isExpired || isRevoked;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
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
            <h3 className="text-base font-black text-slate-900">领料单详情</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1.5 transition-all"
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
        <div className="px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-20">
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
            </div>
          ) : errorMsg ? (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-8 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-100 mb-3">
                <svg
                  className="w-6 h-6 text-rose-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <p className="text-sm font-black text-rose-700 mb-1">查询失败</p>
              <p className="text-[11px] text-rose-600">{errorMsg}</p>
            </div>
          ) : order ? (
            <div className="space-y-5">
              {/* ── 状态提示条 ── */}
              {isRevoked && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-rose-500 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                    />
                  </svg>
                  <p className="text-[11px] text-rose-700 font-bold">
                    此领料单已被销售撤回，内容仅供查看，不再有效
                  </p>
                </div>
              )}
              {isExpired && !isRevoked && (
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
                    此领料单已过期，如需查看请联系销售重新生成
                  </p>
                </div>
              )}

              {/* ── 基本信息 ── */}
              <div className="bg-slate-50 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-0.5">
                    分享码
                  </p>
                  <p className="font-mono font-black text-indigo-600 tracking-widest">
                    {order.shareCode}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-0.5">
                    销售员
                  </p>
                  <p className="font-black text-slate-800">
                    {order.ownerDisplayName}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-0.5">
                    生成时间
                  </p>
                  <p className="font-bold text-slate-600">
                    {new Date(order.createdAt).toLocaleString('zh-CN', {
                      hour12: false,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-0.5">
                    有效期至
                  </p>
                  <p
                    className={`font-bold ${
                      isExpired ? 'text-rose-600' : 'text-slate-600'
                    }`}
                  >
                    {new Date(order.expiresAt).toLocaleString('zh-CN', {
                      hour12: false,
                    })}
                  </p>
                </div>
                {order.results?.[0]?.packingComparison?.selected && (
                  <div className="col-span-2 md:col-span-4">
                    <div className="text-xs text-slate-600">
                      排料算法：<span className="font-bold text-indigo-600">{order.results[0].packingComparison.selected}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ── 模块 1：型材切割明细 ── */}
              <PermissionSection
                title="型材切割明细"
                icon="📐"
                granted={order.permissions.profileCutting}
              >
                <ProfileCuttingTable results={order.results} />
              </PermissionSection>

              {/* ── 模块 2：费用成本明细 ── */}
              <PermissionSection
                title="费用成本明细"
                icon="💰"
                granted={order.permissions.costDetail}
              >
                <CostDetailTable results={order.results} />
              </PermissionSection>

              {/* ── 模块 3：客户/订单信息 ── */}
              <PermissionSection
                title="客户/订单信息"
                icon="👤"
                granted={order.permissions.clientInfo}
              >
                <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-0.5">
                      客户
                    </p>
                    <p className="font-black text-slate-800">
                      {order.clientName}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-0.5">
                      订单
                    </p>
                    <p className="font-black text-slate-800">
                      {order.orderName}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-0.5">
                      日期
                    </p>
                    <p className="font-bold text-slate-600">{order.orderDate}</p>
                  </div>
                </div>
              </PermissionSection>

              {/* ── 模块 4：简洁领料单 ── */}
              <PermissionSection
                title="简洁领料单"
                icon="📝"
                granted={order.permissions.simpleList}
              >
                <SimpleListTable results={order.results} />
              </PermissionSection>

              {isInvalid && (
                <p className="text-center text-[10px] text-slate-400 pt-2">
                  ※ 因领料单已失效，数据可能不再反映最新状态
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-20 text-slate-400 text-xs font-bold">
              未找到领料单
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── 内部组件：模块容器（带权限判断） ────────────────────────
interface PermissionSectionProps {
  title: string;
  icon: string;
  granted: boolean;
  children: React.ReactNode;
}

const PermissionSection: React.FC<PermissionSectionProps> = ({
  title,
  icon,
  granted,
  children,
}) => (
  <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
    <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
      <span className="text-base">{icon}</span>
      <h4 className="text-xs font-black text-slate-800">{title}</h4>
    </div>
    <div className="p-4">
      {granted ? (
        children
      ) : (
        <div className="bg-slate-50 rounded-xl p-4 text-center">
          <p className="text-[11px] text-slate-400 font-bold flex items-center justify-center gap-1.5">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
              />
            </svg>
            此部分内容未被分享
          </p>
        </div>
      )}
    </div>
  </section>
);

// ── 内部组件：型材切割明细表 ────────────────────────────────
const ProfileCuttingTable: React.FC<{ results: GroupResult[] }> = ({
  results,
}) => {
  // 展平所有 plans 的 segments
  const rows: {
    model: string;
    color: string;
    description: string;
    length: number;
    quantity: number;
    weight?: number;
  }[] = [];
  results.forEach((g) => {
    g.plans.forEach((plan) => {
      plan.segments.forEach((seg) => {
        rows.push({
          model: g.model,
          color: g.color,
          description: seg.description,
          length: Math.round(seg.length * 1000), // m → mm
          quantity: 1,
          weight: g.actualWeightPerMeter
            ? Number((seg.length * g.actualWeightPerMeter).toFixed(2))
            : undefined,
        });
      });
    });
  });

  if (rows.length === 0) {
    return <EmptyHint text="无型材切割明细数据" />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 border-b border-slate-100">
          <tr>
            <th className="px-3 py-2.5 font-black text-slate-400 uppercase tracking-wider">型号</th>
            <th className="px-3 py-2.5 font-black text-slate-400 uppercase tracking-wider">颜色</th>
            <th className="px-3 py-2.5 font-black text-slate-400 uppercase tracking-wider">描述</th>
            <th className="px-3 py-2.5 font-black text-slate-400 uppercase tracking-wider text-right">长度(mm)</th>
            <th className="px-3 py-2.5 font-black text-slate-400 uppercase tracking-wider text-right">数量</th>
            <th className="px-3 py-2.5 font-black text-slate-400 uppercase tracking-wider text-right">重量(kg)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50/50">
              <td className="px-3 py-2.5 font-black text-slate-900">{r.model}</td>
              <td className="px-3 py-2.5 text-slate-600">{r.color}</td>
              <td className="px-3 py-2.5 text-slate-600">{r.description}</td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-700">{r.length}</td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-700">{r.quantity}</td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-500">
                {r.weight ?? '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── 内部组件：费用成本明细表 ────────────────────────────────
const CostDetailTable: React.FC<{ results: GroupResult[] }> = ({ results }) => {
  if (results.length === 0) {
    return <EmptyHint text="无费用成本数据" />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 border-b border-slate-100">
          <tr>
            <th className="px-3 py-2.5 font-black text-slate-400 uppercase tracking-wider">型号</th>
            <th className="px-3 py-2.5 font-black text-slate-400 uppercase tracking-wider">颜色</th>
            <th className="px-3 py-2.5 font-black text-slate-400 uppercase tracking-wider text-right">材料成本</th>
            <th className="px-3 py-2.5 font-black text-slate-400 uppercase tracking-wider text-right">配件成本</th>
            <th className="px-3 py-2.5 font-black text-slate-400 uppercase tracking-wider text-right">切工成本</th>
            <th className="px-3 py-2.5 font-black text-slate-400 uppercase tracking-wider text-right">税金</th>
            <th className="px-3 py-2.5 font-black text-slate-400 uppercase tracking-wider text-right">成本合计</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
          {results.map((g, i) => (
            <tr key={i} className="hover:bg-slate-50/50">
              <td className="px-3 py-2.5 font-black text-slate-900">{g.model}</td>
              <td className="px-3 py-2.5 text-slate-600">{g.color}</td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                {g.materialCost != null ? `¥${g.materialCost.toFixed(2)}` : '-'}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                {g.costAccessoryCost != null ? `¥${g.costAccessoryCost.toFixed(2)}` : '-'}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                {g.costCuttingCost != null ? `¥${g.costCuttingCost.toFixed(2)}` : '-'}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                {g.costTaxCost != null ? `¥${g.costTaxCost.toFixed(2)}` : '-'}
              </td>
              <td className="px-3 py-2.5 text-right font-mono font-black text-indigo-600">
                {g.costGrandTotal != null ? `¥${g.costGrandTotal.toFixed(2)}` : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── 内部组件：简洁领料单（型号×数量汇总） ──────────────────
const SimpleListTable: React.FC<{ results: GroupResult[] }> = ({ results }) => {
  if (results.length === 0) {
    return <EmptyHint text="无领料汇总数据" />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 border-b border-slate-100">
          <tr>
            <th className="px-3 py-2.5 font-black text-slate-400 uppercase tracking-wider">型号</th>
            <th className="px-3 py-2.5 font-black text-slate-400 uppercase tracking-wider">颜色</th>
            <th className="px-3 py-2.5 font-black text-slate-400 uppercase tracking-wider text-right">数量(件)</th>
            <th className="px-3 py-2.5 font-black text-slate-400 uppercase tracking-wider text-right">支数</th>
            <th className="px-3 py-2.5 font-black text-slate-400 uppercase tracking-wider text-right">总长度(m)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
          {results.map((g, i) => (
            <tr key={i} className="hover:bg-slate-50/50">
              <td className="px-3 py-2.5 font-black text-slate-900">{g.model}</td>
              <td className="px-3 py-2.5 text-slate-600">{g.color}</td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-700">{g.totalQuantity}</td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-700">{g.totalBars}</td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                {g.totalCuttingLength != null
                  ? g.totalCuttingLength.toFixed(2)
                  : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── 空数据提示 ────────────────────────────────────────────
const EmptyHint: React.FC<{ text: string }> = ({ text }) => (
  <div className="bg-slate-50 rounded-xl p-4 text-center">
    <p className="text-[11px] text-slate-400 font-bold">{text}</p>
  </div>
);

export default PickListDetail;

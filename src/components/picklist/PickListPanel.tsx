import React, { useState, useEffect, useCallback } from 'react';
import { ShareOrder, UserAccount } from '../../types';
import { cloudService } from '../../services/cloudService';
import ShareCodeInput from './ShareCodeInput';
import PickListDetail from './PickListDetail';

interface PickListPanelProps {
  currentUser: UserAccount;
}

/**
 * V4 T06/T07 — 领料单列表页
 *
 * 按角色显示不同内容：
 *   - admin:    cloudService.shareOrder.listAll() 显示所有
 *   - sales:    cloudService.shareOrder.listMine() 显示自己的
 *   - factory:  cloudService.shareOrder.listShared() + 顶部分享码输入区
 *
 * 每行点击「查看」→ 打开 PickListDetail。
 */
const PickListPanel: React.FC<PickListPanelProps> = ({ currentUser }) => {
  const role = currentUser.role;

  const [orders, setOrders] = useState<ShareOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');

  // 详情弹窗
  const [detailOrder, setDetailOrder] = useState<ShareOrder | null>(null);
  const [detailCode, setDetailCode] = useState<string>('');

  // 分享码查询
  const [codeQuerying, setCodeQuerying] = useState(false);
  const [codeError, setCodeError] = useState('');

  // ── 加载列表 ────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      let list: ShareOrder[] = [];
      if (role === 'admin') {
        list = await cloudService.shareOrder.listAll();
      } else if (role === 'sales') {
        list = await cloudService.shareOrder.listMine();
      } else {
        list = await cloudService.shareOrder.listShared();
      }
      // 按创建时间倒序
      list.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setOrders(list);
    } catch (e: any) {
      setListError(e?.message || '加载列表失败');
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // ── 工厂端分享码查询 ──────────────────────────────────────
  const handleCodeSubmit = async (code: string) => {
    setCodeQuerying(true);
    setCodeError('');
    try {
      const order = await cloudService.shareOrder.getByCode(code);
      setDetailOrder(order);
      setDetailCode('');
    } catch (e: any) {
      setCodeError(e?.message || '未找到该分享码对应的领料单');
    } finally {
      setCodeQuerying(false);
    }
  };

  // ── 销售端撤回 ────────────────────────────────────────────
  const handleRevoke = async (id: string, shareCode: string) => {
    if (!confirm(`确认撤回分享码 ${shareCode} 吗？撤回后工厂端将无法查看。`)) return;
    try {
      await cloudService.shareOrder.revoke(id);
      await loadList();
    } catch (e: any) {
      alert(e?.message || '撤回失败');
    }
  };

  // ── 关闭详情 ──────────────────────────────────────────────
  const closeDetail = () => {
    setDetailOrder(null);
    setDetailCode('');
  };

  // ── 状态标签 ──────────────────────────────────────────────
  const renderStatus = (o: ShareOrder) => {
    if (o.revoked) {
      return (
        <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-rose-50 text-rose-600">
          已撤回
        </span>
      );
    }
    if (new Date(o.expiresAt).getTime() < Date.now()) {
      return (
        <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-slate-100 text-slate-500">
          已过期
        </span>
      );
    }
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-emerald-50 text-emerald-600">
        有效
      </span>
    );
  };

  // ── 列表标题区分角色 ──────────────────────────────────────
  const listTitle =
    role === 'factory' ? '我的领料单' : '领料单列表';

  // ── 是否显示撤回按钮（admin/sales，且未撤回） ─────────────
  const canRevoke = role === 'admin' || role === 'sales';

  return (
    <>
      {/* 头部 */}
      <header className="bg-white border-b border-slate-200 px-8 py-5 sticky top-0 z-10 flex items-center justify-between shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-black tracking-tight text-slate-900">
            {listTitle}
          </h2>
          <p className="text-xs text-slate-400">
            {role === 'factory'
              ? '输入分享码查看领料单，或查看被分享的领料单'
              : '生成领料单分享给工厂端，管理历史分享记录'}
          </p>
        </div>
        <button
          onClick={loadList}
          disabled={loading}
          className="px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-100 rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-40"
        >
          <svg
            className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          刷新
        </button>
      </header>

      <main className="px-8 py-8 max-w-6xl w-full mx-auto space-y-6">
        {/* ── 工厂端：分享码输入区 ── */}
        {role === 'factory' && (
          <ShareCodeInput
            onSubmit={handleCodeSubmit}
            errorMsg={codeError}
            loading={codeQuerying}
          />
        )}

        {/* ── 列表 ── */}
        <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-slate-800">
              {role === 'factory' ? '被分享的领料单' : '全部领料单'}
            </h3>
            <span className="text-[10px] text-slate-400 font-bold">
              共 {orders.length} 条
            </span>
          </div>

          {listError ? (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-3">
              <p className="text-[11px] text-rose-600 font-bold">{listError}</p>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 font-black text-slate-400 uppercase tracking-wider">分享码</th>
                  {role === 'factory' ? (
                    <th className="px-4 py-3 font-black text-slate-400 uppercase tracking-wider">销售员</th>
                  ) : (
                    <th className="px-4 py-3 font-black text-slate-400 uppercase tracking-wider">客户</th>
                  )}
                  {role !== 'factory' && (
                    <th className="px-4 py-3 font-black text-slate-400 uppercase tracking-wider">订单</th>
                  )}
                  <th className="px-4 py-3 font-black text-slate-400 uppercase tracking-wider">生成日期</th>
                  <th className="px-4 py-3 font-black text-slate-400 uppercase tracking-wider text-center">状态</th>
                  <th className="px-4 py-3 font-black text-slate-400 uppercase tracking-wider text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                {loading && orders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={role === 'factory' ? 5 : 6}
                      className="text-center py-12 text-slate-300 font-black tracking-widest uppercase"
                    >
                      加载中...
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={role === 'factory' ? 5 : 6}
                      className="text-center py-12 text-slate-300 font-black tracking-widest uppercase"
                    >
                      {role === 'factory' ? '暂无被分享的领料单' : '暂无领料单'}
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-mono font-black text-indigo-600 tracking-widest">
                        {o.shareCode}
                      </td>
                      {role === 'factory' ? (
                        <td className="px-4 py-3 font-black text-slate-900">
                          {o.ownerDisplayName}
                        </td>
                      ) : (
                        <td className="px-4 py-3 font-black text-slate-900">
                          {o.clientName}
                        </td>
                      )}
                      {role !== 'factory' && (
                        <td className="px-4 py-3 text-slate-600">{o.orderName}</td>
                      )}
                      <td className="px-4 py-3 text-slate-400 font-medium">
                        {new Date(o.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="px-4 py-3 text-center">{renderStatus(o)}</td>
                      <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => setDetailOrder(o)}
                          className="px-2.5 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-xs font-black transition-all"
                        >
                          查看
                        </button>
                        {canRevoke && !o.revoked && (
                          <button
                            onClick={() => handleRevoke(o.id, o.shareCode)}
                            className="px-2.5 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-xs font-black transition-all"
                          >
                            撤回
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* ── 详情弹窗 ── */}
      {detailOrder && (
        <PickListDetail order={detailOrder} onClose={closeDetail} />
      )}
      {detailCode && (
        <PickListDetail shareCode={detailCode} onClose={closeDetail} />
      )}
    </>
  );
};

export default PickListPanel;

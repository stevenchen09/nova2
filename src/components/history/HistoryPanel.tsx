import React, { useState, useMemo } from 'react';
import { HistoryRecord, Role } from '../../types';

interface HistoryPanelProps {
  /** 当前用户角色 */
  role: Role;
  /** 历史记录列表（云端加载） */
  historyRecords: HistoryRecord[];
  historyLoading: boolean;
  historyError: string;
  /** 删除记录（云端） */
  onDeleteHistoryRecord: (id: string) => Promise<void>;
  /** 是否显示底价与利润列 */
  showCosts: boolean;
  /** 加载某条记录到工作区 */
  onLoadRecord: (record: HistoryRecord) => void;
}

/**
 * History records panel — V4 云端改造版.
 *
 * 变更说明（V3 → V4）：
 * - 数据源改为 cloudService.calculation.list()（由父组件传入）
 * - admin 看所有用户记录；sales 只看自己的（云函数已按角色过滤）
 * - 删除走 cloudService.calculation.delete
 * - 移除「清空全部历史」按钮（云端按记录粒度管理）
 * - 加载中/错误状态显示
 */
const HistoryPanel: React.FC<HistoryPanelProps> = ({
  role,
  historyRecords,
  historyLoading,
  historyError,
  onDeleteHistoryRecord,
  showCosts,
  onLoadRecord,
}) => {
  const [historySearch, setHistorySearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isAdmin = role === 'admin';
  const canDelete = role !== 'factory';

  const deleteHistoryRecord = async (id: string) => {
    if (!confirm('确认彻底删除该条历史报价单吗？该操作不可撤销。')) return;
    setDeletingId(id);
    try {
      await onDeleteHistoryRecord(id);
    } catch (err: any) {
      alert(`删除失败: ${err.message || err}`);
    } finally {
      setDeletingId(null);
    }
  };

  const filteredHistory = useMemo(
    () =>
      historyRecords.filter(
        (r) =>
          r.clientName.toLowerCase().includes(historySearch.toLowerCase()) ||
          r.orderName.toLowerCase().includes(historySearch.toLowerCase()),
      ),
    [historyRecords, historySearch],
  );

  return (
    <>
      <header className="bg-white border-b border-slate-200 px-8 py-5 sticky top-0 z-10 flex items-center justify-between shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-black tracking-tight text-slate-900">
            历史报价单记录
            {isAdmin && (
              <span className="ml-2 text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-extrabold">
                全部用户
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-400">
            {isAdmin
              ? '管理员视图：可查看所有销售提交的报价单'
              : '系统自动云端持久化每一笔报价，支持一键载入工作区二次修改'}
          </p>
        </div>
      </header>

      <main className="px-8 py-8 max-w-7xl w-full mx-auto space-y-6">
        <section className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
            <div className="relative flex-1">
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="检索历史订单，按客户姓名或项目名称搜索..."
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
          {historyLoading ? (
            <div className="text-center py-16 text-slate-400 text-xs font-bold">
              正在从云端加载历史记录...
            </div>
          ) : historyError ? (
            <div className="text-center py-16 text-rose-500 text-xs font-bold">
              加载失败: {historyError}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-4 font-black text-slate-400 uppercase tracking-widest">保存日期</th>
                    <th className="px-5 py-4 font-black text-slate-400 uppercase tracking-widest">客户姓名</th>
                    <th className="px-5 py-4 font-black text-slate-400 uppercase tracking-widest">订单/项目名称</th>
                    <th className="px-5 py-4 font-black text-slate-400 uppercase tracking-widest text-center">成品件数</th>
                    <th className="px-5 py-4 font-black text-slate-400 uppercase tracking-widest">报价总金额</th>
                    {showCosts && (
                      <th className="px-5 py-4 font-black text-slate-400 uppercase tracking-widest">预估毛利率</th>
                    )}
                    <th className="px-5 py-4 font-black text-slate-400 text-right uppercase tracking-widest">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={showCosts ? 7 : 6} className="text-center py-16 text-slate-300 font-black tracking-widest uppercase">
                        无历史报价记录
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((record) => (
                      <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-4 text-slate-400 font-medium">
                          {new Date(record.createdAt).toLocaleString('zh-CN', {
                            hour12: false,
                          })}
                        </td>
                        <td className="px-5 py-4 font-black text-slate-900">{record.clientName}</td>
                        <td className="px-5 py-4 text-slate-600">{record.orderName}</td>
                        <td className="px-5 py-4 text-center text-slate-500">
                          {(record.totalQuantity || (record.items ? record.items.reduce((acc, i) => acc + i.quantity, 0) : 0))} 个
                        </td>
                        <td className="px-5 py-4 text-indigo-600 font-black">
                          ¥ {record.totalQuotePrice.toLocaleString()}
                        </td>
                        {showCosts && (
                          <td className="px-5 py-4">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                                record.profitMargin >= 40
                                  ? 'bg-emerald-50 text-emerald-600'
                                  : record.profitMargin >= 25
                                    ? 'bg-blue-50 text-blue-600'
                                    : record.profitMargin >= 0
                                      ? 'bg-amber-50 text-amber-600'
                                      : 'bg-rose-50 text-rose-600'
                              }`}
                            >
                              {record.profitMargin}%
                            </span>
                          </td>
                        )}
                        <td className="px-5 py-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => onLoadRecord(record)}
                            className="px-2.5 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-xs font-black transition-all"
                          >
                            载入此单
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => deleteHistoryRecord(record.id)}
                              disabled={deletingId === record.id}
                              className="px-2.5 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-xs font-black transition-all disabled:opacity-50"
                            >
                              {deletingId === record.id ? '删除中...' : '删除'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
};

export default HistoryPanel;

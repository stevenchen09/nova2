import React from 'react';
import { UserAccount, ActiveTab, Role } from '../../types';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: React.Dispatch<React.SetStateAction<ActiveTab>>;
  currentUser: UserAccount;
  onLogout: () => void;
  showCosts: boolean;
  onToggleShowCosts: () => void;
  historyCount: number;
}

/**
 * V4 导航项配置 — 声明式结构，每项带角色权限
 *
 * 渲染时按 currentUser.role 过滤，实现角色隔离：
 *   - admin:    全部导航
 *   - sales:    报价/成本/领料单/历史/设置（无成本利润）
 *   - factory:  仅领料单 + 设置
 */
const NAV_ITEMS: {
  tab: ActiveTab;
  label: string;
  roles: Role[];
  iconPath: string;
}[] = [
  {
    tab: 'quote',
    label: '报价算料工作区',
    roles: ['admin', 'sales', 'factory'],
    iconPath:
      'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z',
  },
  {
    tab: 'cost',
    label: '材料成本资料库',
    roles: ['admin', 'sales', 'factory'],
    iconPath:
      'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
  },
  {
    tab: 'profit',
    label: '成本利润',
    roles: ['admin', 'sales', 'factory'],
    iconPath:
      'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    tab: 'picklist',
    label: '领料单',
    roles: ['admin', 'sales', 'factory'],
    iconPath:
      'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
  {
    tab: 'history',
    label: '历史报价记录',
    roles: ['admin', 'sales', 'factory'],
    iconPath: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    tab: 'settings',
    label: '系统设置',
    roles: ['admin', 'sales', 'factory'],
    iconPath:
      'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  },
];

/**
 * V4 侧边栏 — 按角色动态渲染导航 + 当前用户信息 + 退出
 */
const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onLogout,
  showCosts,
  onToggleShowCosts,
  historyCount,
}) => {
  // 按角色过滤可见导航项
  const visibleNavItems = NAV_ITEMS.filter((item) =>
    item.roles.includes(currentUser.role),
  );

  // 所有角色均可切换底价显示
  const canToggleCosts = true;

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800 shadow-2xl relative z-40">
      {/* Branding header */}
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-indigo-500 to-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-black text-white tracking-wide leading-tight">
              铝合金切框报价助手
            </h1>
            <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider">
              Cloud Edition v4.0
            </span>
          </div>
        </div>
      </div>

      {/* Navigation menu */}
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const isActive = activeTab === item.tab;
          const badge =
            item.tab === 'history' && historyCount > 0
              ? historyCount
              : undefined;
          return (
            <button
              key={item.tab}
              onClick={() => setActiveTab(item.tab)}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                  : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              <svg
                className="w-4.5 h-4.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.2"
                  d={item.iconPath}
                />
              </svg>
              {item.label}
              {badge !== undefined && (
                <span className="ml-auto bg-slate-800 text-[9px] text-indigo-400 font-extrabold px-2 py-0.5 rounded-full">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom section: user info + toggles */}
      <div className="p-4 border-t border-slate-800 space-y-3">
        {/* Current user card */}
        <div className="flex items-center gap-3 bg-slate-950/50 p-3 rounded-2xl border border-slate-800/60">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs text-white uppercase ${
              currentUser.avatarColor === 'indigo'
                ? 'bg-indigo-600'
                : currentUser.avatarColor === 'emerald'
                  ? 'bg-emerald-600'
                  : 'bg-amber-500'
            }`}
          >
            {currentUser.displayName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black text-slate-100 truncate">
              {currentUser.displayName}
            </p>
            <p className="text-[9px] text-slate-400 truncate">
              {currentUser.role === 'admin'
                ? '超级管理员'
                : currentUser.role === 'sales'
                  ? '销售员'
                  : '工厂加工端'}
            </p>
          </div>
          <button
            onClick={onLogout}
            className="text-slate-400 hover:text-rose-400 transition-all text-[9px] font-bold p-1 hover:bg-slate-800 rounded-lg shrink-0"
            title="退出登录"
          >
            退出
          </button>
        </div>

        {/* Show costs toggle（工厂角色隐藏）*/}
        {canToggleCosts && (
          <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/60">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-200">
                  👀 显示底价与利润
                </p>
                <p className="text-[8px] text-slate-500">客户在旁建议关闭此项</p>
              </div>
              <button
                onClick={onToggleShowCosts}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  showCosts ? 'bg-indigo-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    showCosts ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {/* Storage status indicator */}
        <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
          <span>CloudBase 云端存储</span>
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

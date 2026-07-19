import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  UserAccount,
  AISettings,
  AIProvider,
  AIProviderConfig,
  Role,
} from '../../types';
import {
  PROVIDER_LABELS,
  PROVIDER_KEY_URLS,
  PROVIDER_MODELS,
} from '../../services/aiService';
import { cloudService } from '../../services/cloudService';

// ─────────────────────────────────────────────────────────────────────
// Tab-ordered provider list (display order in UI)
// ─────────────────────────────────────────────────────────────────────
const PROVIDER_TAB_ORDER: AIProvider[] = [
  'deepseek',
  'qwen',
  'ernie',
  'zhipu',
  'moonshot',
  'baichuan',
  'openai',
  'gemini',
  'doubao',
  'yi',
];

/** Color accent gradient for each provider tab */
const PROVIDER_COLORS: Record<AIProvider, string> = {
  deepseek: 'from-blue-500 to-blue-600',
  qwen: 'from-orange-500 to-orange-600',
  ernie: 'from-red-500 to-red-600',
  zhipu: 'from-teal-500 to-teal-600',
  moonshot: 'from-violet-500 to-violet-600',
  baichuan: 'from-emerald-500 to-emerald-600',
  openai: 'from-green-500 to-green-600',
  gemini: 'from-sky-400 to-blue-500',
  doubao: 'from-indigo-500 to-indigo-600',
  yi: 'from-purple-500 to-purple-600',
};

const PROVIDER_BORDER_COLORS: Record<AIProvider, string> = {
  deepseek: 'border-blue-500',
  qwen: 'border-orange-500',
  ernie: 'border-red-500',
  zhipu: 'border-teal-500',
  moonshot: 'border-violet-500',
  baichuan: 'border-emerald-500',
  openai: 'border-green-500',
  gemini: 'border-sky-400',
  doubao: 'border-indigo-500',
  yi: 'border-purple-500',
};

interface SettingsPanelProps {
  currentUser: UserAccount;
  exportAllBackup: () => void;
  importBackupFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * V4 系统设置面板
 *
 * 变更说明（V3 → V4）：
 * - AI 配置区块仅 admin 可见，数据源改为 cloudService.aiSettings（返回脱敏 apiKey）
 * - 用户管理区块改为调 cloudService.userManage（list/create/update/delete）
 * - 销售/工厂角色仅显示个人信息 + 备份恢复
 * - 移除前端直连 AI 测试（改走 cloudService.ai.testConnection）
 */
const SettingsPanel: React.FC<SettingsPanelProps> = ({
  currentUser,
  exportAllBackup,
  importBackupFile,
}) => {
  const isAdmin = currentUser.role === 'admin';

  // ── AI 配置状态（仅 admin）──────────────────────────────────────
  const [aiSettings, setAiSettings] = useState<AISettings | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<AIProvider>('deepseek');
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);

  // ── 用户管理状态（仅 admin）─────────────────────────────────────
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSaving, setUserSaving] = useState(false);

  // ── 加载 AI 配置 ────────────────────────────────────────────────
  const loadAiSettings = useCallback(async () => {
    if (!isAdmin) return;
    setAiLoading(true);
    try {
      const cfg = await cloudService.aiSettings.get();
      setAiSettings(cfg);
      if (cfg.activeProvider) setActiveTab(cfg.activeProvider);
    } catch (err: any) {
      alert('加载 AI 配置失败: ' + (err.message || err));
    } finally {
      setAiLoading(false);
    }
  }, [isAdmin]);

  // ── 加载用户列表 ────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setUsersLoading(true);
    try {
      const list = await cloudService.userManage.list();
      setUsers(list);
    } catch (err: any) {
      alert('加载用户列表失败: ' + (err.message || err));
    } finally {
      setUsersLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      loadAiSettings();
      loadUsers();
    }
  }, [isAdmin, loadAiSettings, loadUsers]);

  // ── Derived: current active tab's config ───────────────────────
  const currentConfig = useMemo<AIProviderConfig>(
    () =>
      aiSettings?.providers.find((p) => p.provider === activeTab) || {
        provider: activeTab,
        apiKey: '',
        baseUrl: PROVIDER_LABELS[activeTab] ? '' : '',
        model: '',
        enabled: false,
      },
    [aiSettings?.providers, activeTab],
  );

  const isDefaultProvider = aiSettings?.activeProvider === activeTab;

  // ── AI 配置操作 ─────────────────────────────────────────────────
  const updateField = <K extends keyof AIProviderConfig>(
    provider: AIProvider,
    field: K,
    value: AIProviderConfig[K],
  ) => {
    setAiSettings((prev) => {
      const baseSettings = prev || {
        providers: [],
        activeProvider: activeTab,
      };
      const exists = baseSettings.providers.find((p) => p.provider === provider);
      let newProviders: AIProviderConfig[];
      if (exists) {
        newProviders = baseSettings.providers.map((p) =>
          p.provider === provider ? { ...p, [field]: value } : p,
        );
      } else {
        newProviders = [
          ...baseSettings.providers,
          { provider, apiKey: '', baseUrl: '', model: '', enabled: false, [field]: value } as AIProviderConfig,
        ];
      }
      return { ...baseSettings, providers: newProviders };
    });
  };

  const makeActive = (provider: AIProvider) => {
    setAiSettings((prev) => {
      const baseSettings = prev || {
        providers: [],
        activeProvider: activeTab,
      };
      return {
        ...baseSettings,
        activeProvider: provider,
        providers: baseSettings.providers.map((p) =>
          p.provider === provider ? { ...p, enabled: true } : p,
        ),
      };
    });
  };

  const saveAiSettings = async () => {
    if (!aiSettings) return;
    setAiSaving(true);
    try {
      const updated = await cloudService.aiSettings.update(aiSettings);
      setAiSettings(updated);
      alert('AI 配置保存成功！');
    } catch (err: any) {
      alert('保存失败: ' + (err.message || err));
    } finally {
      setAiSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await cloudService.ai.testConnection();
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, msg: err.message || String(err) });
    } finally {
      setTesting(false);
    }
  };

  // ── 用户管理操作 ────────────────────────────────────────────────
  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const uName = (form.elements.namedItem('uName') as HTMLInputElement).value.trim().toLowerCase();
    const uDName = (form.elements.namedItem('uDName') as HTMLInputElement).value.trim();
    const uPass = (form.elements.namedItem('uPass') as HTMLInputElement).value.trim();
    const uRole = (form.elements.namedItem('uRole') as HTMLSelectElement).value as Role;

    if (!uName || !uDName || !uPass) {
      alert('请填写完整的账号分配信息！');
      return;
    }
    if (users.some((u) => u.username === uName)) {
      alert('该用户已存在，无法重复添加！');
      return;
    }

    setUserSaving(true);
    try {
      await cloudService.userManage.create({
        username: uName,
        displayName: uDName,
        password: uPass,
        role: uRole,
      });
      form.reset();
      alert(`成功创建账号【${uDName}】`);
      await loadUsers();
    } catch (err: any) {
      alert('创建失败: ' + (err.message || err));
    } finally {
      setUserSaving(false);
    }
  };

  const handleDeleteUser = async (uid: string, displayName: string) => {
    if (!confirm(`确认要注销员工账号【${displayName}】吗？`)) return;
    try {
      await cloudService.userManage.delete(uid);
      alert('账号已注销');
      await loadUsers();
    } catch (err: any) {
      alert('删除失败: ' + (err.message || err));
    }
  };

  // ── 修改自己的密码（所有角色可用）─────────────────────────────────
  const [passwordSaving, setPasswordSaving] = useState(false);

  const handleChangeOwnPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const currentPassword = (
      form.elements.namedItem('currentPassword') as HTMLInputElement
    ).value;
    const newPassword = (
      form.elements.namedItem('newPassword') as HTMLInputElement
    ).value;
    const confirmPassword = (
      form.elements.namedItem('confirmPassword') as HTMLInputElement
    ).value;

    if (!currentPassword.trim()) {
      alert('请输入当前密码！');
      return;
    }
    if (!newPassword.trim()) {
      alert('请输入新密码！');
      return;
    }
    if (newPassword.length < 8) {
      alert('新密码长度不能少于 8 位！\n（CloudBase 要求 8-32 位，含大写、小写、数字、特殊字符中至少 3 类）');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('两次输入的新密码不一致！');
      return;
    }

    setPasswordSaving(true);
    try {
      const result = await cloudService.userManage.changeOwnPassword(
        currentPassword.trim(),
        newPassword.trim(),
      );
      alert(result.message || '密码修改成功，请退出后使用新密码重新登录。');
      form.reset();
    } catch (err: any) {
      alert('修改密码失败: ' + (err.message || err));
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleUpdateOwnProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const dName = (e.currentTarget.elements.namedItem('dName') as HTMLInputElement).value;
    if (!dName.trim()) {
      alert('显示名不能为空！');
      return;
    }
    try {
      const result = await cloudService.userManage.updateOwnProfile(dName.trim());
      alert(result.message || '个人信息更新成功！');
    } catch (err: any) {
      alert('更新失败: ' + (err.message || err));
    }
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <>
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-5 sticky top-0 z-10 flex items-center justify-between shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-black tracking-tight text-slate-900">
            系统设置
          </h2>
          <p className="text-xs text-slate-400">
            {isAdmin ? '配置 AI 供应商、管理账号、备份恢复' : '个人信息与数据备份'}
          </p>
        </div>
      </header>

      <main className="px-8 py-8 max-w-4xl w-full mx-auto space-y-8">
        {/* ══════════════════════════════════════════════════════════════
            Section 1: AI 配置（仅 admin 可见）
           ══════════════════════════════════════════════════════════════ */}
        {isAdmin && (
          <section className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-black text-slate-950 uppercase tracking-widest">
                🤖 AI 智能识别配置
              </h3>
              <button
                onClick={saveAiSettings}
                disabled={aiSaving || !aiSettings}
                className="px-5 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50"
              >
                {aiSaving ? '保存中...' : '保存配置'}
              </button>
            </div>

            {aiLoading ? (
              <p className="text-xs text-slate-400 text-center py-8">加载 AI 配置中...</p>
            ) : (
              <>
                {/* Provider Tab Bar — 始终显示 10 个供应商 Tab，让用户可以开始配置 */}
                <div className="space-y-2 mb-6">
                  <label className="text-xs font-black text-slate-500 uppercase ml-1 block">
                    选择 AI 供应商
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PROVIDER_TAB_ORDER.map((provider) => {
                      const cfg = aiSettings?.providers.find(
                        (p) => p.provider === provider,
                      );
                      const isActive = activeTab === provider;
                      const isDef = aiSettings?.activeProvider === provider;
                      const keySet = Boolean(cfg?.apiKey?.trim());
                      const colors = PROVIDER_COLORS[provider];
                      const bColor = PROVIDER_BORDER_COLORS[provider];

                      return (
                        <button
                          key={provider}
                          type="button"
                          onClick={() => setActiveTab(provider)}
                          className={`relative px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border-2 ${
                            isActive
                              ? `${bColor} bg-gradient-to-br ${colors} text-white shadow-md scale-[1.03]`
                              : isDef
                                ? `${bColor} bg-white text-slate-700 hover:bg-slate-50`
                                : keySet
                                  ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                  : 'border-slate-100 bg-slate-50/80 text-slate-400 hover:bg-slate-100'
                          }`}
                          title={
                            keySet
                              ? `${PROVIDER_LABELS[provider]} — 已配置`
                              : `${PROVIDER_LABELS[provider]} — 未配置 API Key`
                          }
                        >
                          {!keySet && (
                            <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber-400 rounded-full flex items-center justify-center text-[8px] text-white font-black leading-none">
                              !
                            </span>
                          )}
                          {PROVIDER_LABELS[provider]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Current Provider Config Card */}
                <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/80 to-white p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-white text-xs font-black bg-gradient-to-br ${PROVIDER_COLORS[activeTab]}`}
                      >
                        {PROVIDER_LABELS[activeTab].charAt(0)}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          {PROVIDER_LABELS[activeTab]}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {isDefaultProvider
                            ? '✅ 当前默认供应商'
                            : '已配置，非默认使用'}
                        </p>
                      </div>
                    </div>
                    <label
                      className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg transition-all ${
                        isDefaultProvider
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          : 'bg-slate-50 text-slate-500 border border-transparent hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="radio"
                        name="active-provider"
                        checked={isDefaultProvider}
                        onChange={() => makeActive(activeTab)}
                        className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-[11px] font-bold">设为默认</span>
                    </label>
                  </div>

                  {/* API Key */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between ml-1">
                      <label className="text-xs font-black text-slate-500 uppercase">
                        API Key (密钥) *
                      </label>
                      <a
                        href={PROVIDER_KEY_URLS[activeTab]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-indigo-500 hover:text-indigo-700 underline font-medium"
                      >
                        获取 API Key →
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        type={showKeys[activeTab] ? 'text' : 'password'}
                        value={currentConfig.apiKey || ''}
                        onChange={(e) =>
                          updateField(activeTab, 'apiKey', e.target.value)
                        }
                        placeholder={
                          activeTab === 'gemini' ? 'AIza...' : 'sk-******'
                        }
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 pr-10 text-xs font-mono font-bold focus:ring-2 ring-indigo-500/20 outline-none placeholder:text-slate-300"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowKeys((prev) => ({
                            ...prev,
                            [activeTab]: !prev[activeTab],
                          }))
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showKeys[activeTab] ? '🙈' : '👁'}
                      </button>
                    </div>
                    {currentConfig.apiKey && currentConfig.apiKey.startsWith('***') && (
                      <p className="text-[10px] text-slate-400 ml-1">
                        已保存（脱敏显示）。如需更换请直接输入新 Key。
                      </p>
                    )}
                  </div>

                  {/* Base URL + Model */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-slate-500 uppercase ml-1 block">
                        API 端点 (Base URL)
                      </label>
                      <input
                        type="text"
                        value={currentConfig.baseUrl || ''}
                        onChange={(e) =>
                          updateField(activeTab, 'baseUrl', e.target.value)
                        }
                        disabled={activeTab === 'gemini'}
                        placeholder={
                          activeTab === 'gemini'
                            ? '无需配置（使用 Google SDK）'
                            : getUrlPlaceholder(activeTab)
                        }
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none disabled:opacity-40 disabled:bg-slate-50 disabled:cursor-not-allowed placeholder:text-slate-300"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-slate-500 uppercase ml-1 block">
                        模型名称 (Model)
                      </label>
                      <select
                        value={currentConfig.model || ''}
                        onChange={(e) =>
                          updateField(activeTab, 'model', e.target.value)
                        }
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none cursor-pointer"
                      >
                        <option value="">选择模型</option>
                        {[...PROVIDER_MODELS[activeTab]].map((modelOption) => (
                          <option key={modelOption} value={modelOption}>
                            {modelOption}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Test Connection */}
                  <div className="pt-2 flex items-center gap-4">
                    <button
                      type="button"
                      disabled={testing}
                      onClick={runTest}
                      className="px-5 py-2.5 bg-slate-900 text-white hover:bg-black text-xs font-black rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {testing && (
                        <svg
                          className="animate-spin h-3.5 w-3.5 text-white"
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
                      测试当前默认供应商
                    </button>
                    {testResult && (
                      <span
                        className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border ${
                          testResult.success
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                            : 'bg-red-50 text-red-500 border-red-100'
                        }`}
                      >
                        {testResult.msg}
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {/* ══════════════════════════════════════════════════════════════
            Section 2: 备份与恢复
           ══════════════════════════════════════════════════════════════ */}
        <section className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200">
          <h3 className="text-xs font-black text-slate-950 uppercase tracking-widest mb-4">
            📦 系统防丢备份与迁移
          </h3>
          <p className="text-xs text-slate-400 mb-6">
            当更换设备、重新装系统或发布部署时，可以完整导出底价资料库、历史单据，并在任何新环境中一键无损导入恢复。
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={exportAllBackup}
              className="px-5 py-3 bg-indigo-50 text-indigo-600 border border-indigo-200 text-xs font-black rounded-xl hover:bg-indigo-100 transition-all flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0L8 8m4-4v12" />
              </svg>
              一键备份：导出完整数据 (JSON)
            </button>
            <button
              onClick={() => document.getElementById('restore_file_input')?.click()}
              className="px-5 py-3 bg-slate-50 text-slate-700 border border-slate-200 text-xs font-black rounded-xl hover:bg-slate-100 transition-all flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 8l4 4m0 0l4-4m-4 4V4" />
              </svg>
              恢复备份：导入数据文件
            </button>
            <input
              type="file"
              id="restore_file_input"
              onChange={importBackupFile}
              accept=".json"
              hidden
            />
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            Section 3: 个人信息 & 修改密码
           ══════════════════════════════════════════════════════════════ */}
        <section className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200">
          <h3 className="text-xs font-black text-slate-950 uppercase tracking-widest mb-4">
            👤 个人账户信息
          </h3>

          {/* 修改姓名/称呼 */}
          <form
            onSubmit={handleUpdateOwnProfile}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end bg-slate-50 p-5 rounded-2xl border border-slate-100 mb-4"
          >
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">修改姓名/称呼</label>
              <input
                type="text"
                name="dName"
                defaultValue={currentUser.displayName}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none"
              />
            </div>
            <button
              type="submit"
              className="bg-indigo-600 text-white py-2 px-4 rounded-xl font-black text-xs hover:bg-indigo-700 transition-all shadow-sm"
            >
              保存姓名
            </button>
          </form>

          {/* 修改密码 */}
          <form
            onSubmit={handleChangeOwnPassword}
            className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-slate-50 p-5 rounded-2xl border border-slate-100"
          >
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">当前密码</label>
              <input
                type="password"
                name="currentPassword"
                placeholder="请输入当前密码"
                required
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-mono font-bold focus:ring-2 ring-indigo-500/20 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">新密码</label>
              <input
                type="password"
                name="newPassword"
                placeholder="至少 8 位，含大小写/数字/符号中3类"
                required
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-mono font-bold focus:ring-2 ring-indigo-500/20 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">确认新密码</label>
              <input
                type="password"
                name="confirmPassword"
                placeholder="再次输入新密码"
                required
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-mono font-bold focus:ring-2 ring-indigo-500/20 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={passwordSaving}
              className="bg-slate-900 text-white py-2 px-4 rounded-xl font-black text-xs hover:bg-black transition-all shadow-sm disabled:opacity-50"
            >
              {passwordSaving ? '修改中...' : '修改密码'}
            </button>
          </form>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            Section 4: 账号管理（仅 admin）
           ══════════════════════════════════════════════════════════════ */}
        {isAdmin && (
          <section className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-6">
              <div>
                <h3 className="text-xs font-black text-slate-950 uppercase tracking-widest">
                  👥 下属账号安全管理
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  创建销售/工厂账号，分配角色权限
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Create user form */}
              <form
                onSubmit={handleCreateUser}
                className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100"
              >
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400">用户名 (英/数)</label>
                  <input type="text" name="uName" placeholder="如 sales_lee" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400">真实姓名</label>
                  <input type="text" name="uDName" placeholder="如 李小龙" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400">初始密码</label>
                  <input type="text" name="uPass" placeholder="8位以上，含大小写/数字/符号中3类" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono font-bold focus:ring-2 ring-indigo-500/20 outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400">岗位角色权限</label>
                  <select name="uRole" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none">
                    <option value="sales">销售业务员</option>
                    <option value="factory">工厂加工端</option>
                    <option value="admin">超级管理员</option>
                  </select>
                </div>
                <button type="submit" disabled={userSaving} className="bg-slate-900 text-white hover:bg-black rounded-xl text-xs font-black py-2.5 shadow-md disabled:opacity-50">
                  {userSaving ? '创建中...' : '确定分配创建'}
                </button>
              </form>

              {/* Users table */}
              {usersLoading ? (
                <p className="text-xs text-slate-400 text-center py-8">加载用户列表...</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-5 py-3 font-black text-slate-400">成员姓名</th>
                        <th className="px-5 py-3 font-black text-slate-400">用户名</th>
                        <th className="px-5 py-3 font-black text-slate-400">岗位权限</th>
                        <th className="px-5 py-3 font-black text-slate-400 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                      {users.map((u) => (
                        <tr key={u.uid} className="hover:bg-slate-50/50 transition-all">
                          <td className="px-5 py-3 flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white uppercase font-black ${u.avatarColor === 'indigo' ? 'bg-indigo-600' : u.avatarColor === 'emerald' ? 'bg-emerald-600' : 'bg-amber-500'}`}>
                              {u.displayName.charAt(0)}
                            </div>
                            <span className="text-slate-900">{u.displayName}</span>
                          </td>
                          <td className="px-5 py-3 text-slate-500">{u.username}</td>
                          <td className="px-5 py-3">
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-black ${u.role === 'admin' ? 'bg-indigo-50 text-indigo-600' : u.role === 'sales' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                              {u.role === 'admin' ? '超级管理员' : u.role === 'sales' ? '销售员' : '工厂加工端'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            {u.uid === currentUser.uid ? (
                              <span className="text-[10px] text-slate-300 font-medium italic">当前登录中</span>
                            ) : (
                              <button
                                onClick={() => handleDeleteUser(u.uid, u.displayName)}
                                className="text-rose-600 hover:text-rose-800 hover:underline text-xs"
                              >
                                注销账号
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Module-level helpers
// ─────────────────────────────────────────────────────────────────────

function getUrlPlaceholder(provider: AIProvider): string {
  const map: Partial<Record<AIProvider, string>> = {
    deepseek: 'https://api.deepseek.com/v1',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    ernie: 'https://qianfan.baidubce.com/v2',
    zhipu: 'https://open.bigmodel.cn/api/paas/v4',
    moonshot: 'https://api.moonshot.cn/v1',
    baichuan: 'https://api.baichuan-ai.com/v1',
    openai: 'https://api.openai.com/v1',
    doubao: 'https://ark.cn-beijing.volces.com/api/v3',
    yi: 'https://api.lingyiwanwu.com/v1',
  };
  return map[provider] || 'https://api.example.com/v1';
}

export default SettingsPanel;

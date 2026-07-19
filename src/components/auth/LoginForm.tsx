import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

interface LoginFormProps {
  handleLogin: (username: string, password: string) => Promise<void>;
  loginError: string;
}

/**
 * V4 登录表单 — CloudBase 账号密码登录
 *
 * 变更说明（V3 → V4）：
 * - 移除注册 tab（用户改由管理员在系统设置中创建）
 * - 移除快速登录/演示账号按钮
 * - 登录调 cloudService.auth.login（经 useAuth.handleLogin）
 * - 保留原有视觉风格
 */
const LoginForm: React.FC<LoginFormProps> = ({ handleLogin, loginError }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await handleLogin(username, password);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-indigo-100">
      <div className="sm:mx-auto w-full max-w-md">
        <div className="flex justify-center mb-4">
          <div className="bg-indigo-600 p-3 rounded-2xl shadow-xl shadow-indigo-500/20 text-white animate-bounce">
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
        </div>
        <h2 className="text-center text-2xl font-black text-slate-900 tracking-tight">
          铝合金切框报价助手
        </h2>
        <p className="mt-1 text-center text-xs text-slate-400 font-bold uppercase tracking-wider">
          企业账号安全登录系统
        </p>
      </div>

      <div className="mt-8 sm:mx-auto w-full max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-xl border border-slate-200/80 rounded-[2.5rem] sm:px-10">
          <form className="space-y-4" onSubmit={onSubmit}>
            {loginError && (
              <div className="bg-rose-50 text-rose-600 border border-rose-100 px-4 py-2 rounded-xl text-[11px] font-bold">
                ⚠️ {loginError}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">
                用户名/账号
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none placeholder:text-slate-300"
                placeholder="请输入登录用户名"
                autoComplete="username"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">
                  登录密码
                </label>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-mono font-bold focus:ring-2 ring-indigo-500/20 outline-none placeholder:text-slate-300"
                placeholder="请输入密码"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-black text-xs hover:bg-indigo-700 active:scale-98 transition-all shadow-md shadow-indigo-600/10 mt-2 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting && (
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
              {isSubmitting ? '登录中...' : '立即登录系统'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-[10px] text-slate-400 font-medium">
          提示：账号由管理员统一分配。如需开通新账号，请联系系统管理员。
        </p>
      </div>
    </div>
  );
};

export default LoginForm;

import { useState, useEffect, useCallback } from 'react';
import { UserAccount } from '../types';
import { cloudService } from '../services/cloudService';

/**
 * useAuth V4 — CloudBase 账号密码认证
 *
 * 变更说明（V3 → V4）：
 * - 移除所有 localStorage mock 逻辑（aluminum_users / aluminum_current_user / hashPassword / DEFAULT_USERS）
 * - 移除 quickLogin / handleRegister / users 列表 / addUser / updateUser / deleteUser
 *   （用户管理改由 SettingsPanel 直接调 cloudService.userManage）
 * - 登录改为调 cloudService.auth.login(username, password)（CloudBase Auth SDK）
 * - 登录成功后调 cloudService.auth.getProfile() 获取角色信息
 * - 会话持久化由 CloudBase Auth SDK persistence:'local' 自动处理
 *
 * 返回值结构：
 *   {
 *     currentUser, isAuthLoading, loginError,
 *     handleLogin, logout, refreshProfile,
 *   }
 */
export interface UseAuthReturn {
  /** 当前登录用户，未登录时为 null */
  currentUser: UserAccount | null;
  /** 登录态初始化中（首次进入页面检查 CloudBase 会话时为 true） */
  isAuthLoading: boolean;
  /** 登录错误信息 */
  loginError: string;
  /** 账号密码登录 */
  handleLogin: (username: string, password: string) => Promise<void>;
  /** 退出登录 */
  logout: () => Promise<void>;
  /** 刷新当前用户 profile（角色/显示名等） */
  refreshProfile: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [loginError, setLoginError] = useState('');

  // ── 首次进入：检查 CloudBase 登录态 ──────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { isLogin, uid } = await cloudService.auth.getLoginState();
        if (!isLogin || !uid) {
          if (mounted) setIsAuthLoading(false);
          return;
        }
        // 已有登录态，拉取角色信息
        try {
          const profile = await cloudService.auth.getProfile();
          if (mounted) {
            setCurrentUser(profile as UserAccount);
            setIsAuthLoading(false);
          }
        } catch (e) {
          // 登录态有效但 users 集合无记录（未初始化）
          console.warn('获取用户信息失败:', e);
          if (mounted) {
            setCurrentUser(null);
            setIsAuthLoading(false);
          }
        }
      } catch (e) {
        console.warn('检查登录态失败:', e);
        if (mounted) setIsAuthLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // ── 登录 ─────────────────────────────────────────────────────────
  const handleLogin = useCallback(async (username: string, password: string) => {
    setLoginError('');
    if (!username.trim() || !password) {
      setLoginError('请输入用户名和密码');
      return;
    }
    try {
      // 1. CloudBase Auth 登录
      await cloudService.auth.login(username.trim(), password);
      // 2. 等待 auth token 传播到 callFunction（SDK 内部异步持久化需要时间）
      await new Promise((r) => setTimeout(r, 300));
      // 3. 拉取用户 profile（含角色）
      const profile = await cloudService.auth.getProfile();
      setCurrentUser(profile as UserAccount);
    } catch (e: any) {
      // cloudService 层已统一抛出 Error(message)，这里再做一次防御性字符串化，
      // 确保传给 setLoginError 的永远是 string，不会触发 React 渲染 [object Object]。
      let msg: string;
      if (typeof e === 'string') {
        msg = e;
      } else if (e?.message && typeof e.message === 'string') {
        msg = e.message;
      } else if (e?.message && typeof e.message === 'object') {
        msg =
          (e.message as any).message ||
          (e.message as any).errMsg ||
          JSON.stringify(e.message);
      } else {
        try {
          msg = typeof e === 'object' ? JSON.stringify(e) : String(e);
        } catch {
          msg = '登录失败，请稍后重试';
        }
      }
      // 友好化常见错误
      const lower = msg.toLowerCase();
      if (msg.includes('密码') || lower.includes('password') || lower.includes('invalid')) {
        setLoginError('用户名或密码错误');
      } else if (
        msg.includes('用户') ||
        lower.includes('user') ||
        lower.includes('not exist') ||
        lower.includes('exist')
      ) {
        setLoginError('账号不存在或未开通');
      } else {
        setLoginError(msg);
      }
    }
  }, []);

  // ── 退出登录 ─────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    if (!confirm('是否确认退出登录？')) return;
    try {
      await cloudService.auth.logout();
    } catch (e) {
      // 即使退出失败也清空本地状态
      console.warn('退出登录异常:', e);
    }
    setCurrentUser(null);
  }, []);

  // ── 刷新 profile ─────────────────────────────────────────────────
  const refreshProfile = useCallback(async () => {
    if (!currentUser) return;
    try {
      const profile = await cloudService.auth.getProfile();
      setCurrentUser(profile as UserAccount);
    } catch (e) {
      console.warn('刷新用户信息失败:', e);
    }
  }, [currentUser]);

  return {
    currentUser,
    isAuthLoading,
    loginError,
    handleLogin,
    logout,
    refreshProfile,
  };
}

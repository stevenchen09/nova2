/**
 * cloudService.ts — 统一云函数调用封装层
 *
 * 职责：
 *   1. 初始化 CloudBase JS SDK 单例
 *   2. 封装所有云函数调用（auth / userManage / ai / costDb / priceConfig / aiSettings / calculation / shareOrder）
 *   3. 统一处理 { code, data, message } 响应格式
 *   4. 提供认证相关能力（login / logout / getLoginState）
 *
 * 所有前端组件统一通过此模块访问后端，不直接调用 cloudbase SDK。
 */

import cloudbase from '@cloudbase/js-sdk';
import type {
  AISettings,
  PriceConfig,
  CostRecord,
  HistoryRecord,
  ShareOrder,
  UserAccount,
  Role,
} from '../types';

// ─────────────────────────────────────────────────────────────────────
// SDK 初始化（单例）
// ─────────────────────────────────────────────────────────────────────

const envId = import.meta.env.VITE_CLOUDBASE_ENV_ID as string;

/** CloudBase app 实例类型 */
type CloudApp = ReturnType<typeof cloudbase.init>;
/** auth 实例类型 */
type CloudAuth = ReturnType<CloudApp['auth']>;

let app: CloudApp;
let authInstance: CloudAuth | null = null;

function getApp(): CloudApp {
  if (!app) {
    app = cloudbase.init({ env: envId });
  }
  return app;
}

function getAuth(): CloudAuth {
  if (!authInstance) {
    // V4: 用 session 持久化，关闭浏览器后需重新登录（不自动登录）
    authInstance = getApp().auth({ persistence: 'session' });
  }
  return authInstance;
}

// ─────────────────────────────────────────────────────────────────────
// 通用云函数调用封装
// ─────────────────────────────────────────────────────────────────────

/**
 * 从 CloudBase Auth SDK 抛出的非标准错误对象中提取可读消息。
 *
 * SDK 拒绝时可能给出多种形状：
 *   - 标准 Error（含 .message 字符串）
 *   - { code, message } 其中 message 是字符串
 *   - { errMsg: '...' }（微信风格）
 *   - 纯对象（无 .message），此时 String(e) 会得到 "[object Object]"
 *
 * 此函数保证返回一个字符串，便于上层 UI 直接渲染。
 */
function normalizeAuthError(e: any): string {
  if (e == null) return '未知错误';
  if (typeof e === 'string') return e;
  if (typeof e.message === 'string' && e.message) return e.message;
  if (typeof e.errMsg === 'string' && e.errMsg) return e.errMsg;
  if (e.message && typeof e.message === 'object') {
    const inner = e.message as any;
    if (typeof inner.message === 'string') return inner.message;
    if (typeof inner.errMsg === 'string') return inner.errMsg;
  }
  if (typeof e.code === 'string' || typeof e.code === 'number') {
    return `登录失败 (code=${e.code})`;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return '登录失败，请稍后重试';
  }
}

/**
 * 调用云函数并解包统一响应格式
 *
 * @param name   云函数名
 * @param data   传给云函数的 event 数据
 * @returns      data 字段（云函数返回的 {code, data, message} 中的 data）
 * @throws       业务错误时抛出 Error(message)，由调用方捕获
 */
async function callFunction<T = any>(
  name: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const a = getApp();
  const auth = getAuth();

  // 关键修复：CloudBase JS SDK v3 的 callFunction 不会自动传 auth context
  // 需要手动从 auth 实例获取 uid，传给云函数
  let callerUid = '';
  try {
    const loginState = await auth.getLoginState();
    if (loginState && (loginState as any).isLogin !== false) {
      const user = (loginState as any).user;
      callerUid = user?.uid || user?.userId || '';
    }
  } catch {
    // 忽略
  }

  const res: any = await a.callFunction({
    name,
    data: { ...data, _callerUid: callerUid },
  });

  // 兼容 SDK 3.x 多种返回结构
  let result: { code: number; data: T; message: string } | undefined;

  if (res?.result && typeof res.result === 'object') {
    result = res.result as { code: number; data: T; message: string };
  } else if (res && typeof res.code !== 'undefined') {
    result = res as { code: number; data: T; message: string };
  } else if (res?.result === null || res?.result === undefined) {
    throw new Error('云函数调用失败：请刷新页面重试');
  }

  if (!result) {
    throw new Error('云函数返回格式异常');
  }

  if (result.code !== 0) {
    const msg =
      (typeof result.message === 'string' && result.message) ||
      `云函数错误 (code=${result.code})`;
    throw new Error(msg);
  }
  return result.data;
}

// ─────────────────────────────────────────────────────────────────────
// 类型定义（与云函数返回结构对齐）
// ─────────────────────────────────────────────────────────────────────

export interface CloudProfile {
  uid: string;
  username: string;
  role: Role;
  displayName: string;
  avatarColor: string;
}

export interface FilePayload {
  mimeType: string;
  data: string; // base64
}

// ─────────────────────────────────────────────────────────────────────
// 各模块 API 封装
// ─────────────────────────────────────────────────────────────────────

export const cloudService = {
  // ── 认证（CloudBase Auth SDK + auth-manage 云函数）──────────────
  auth: {
    /**
     * 账号密码登录（CloudBase Auth v3: signInWithPassword）
     *
     * 直接调用 Auth SDK，其抛出的错误对象形状不固定（可能没有 .message 字符串），
     * 这里统一捕获并重新抛出 new Error(可读字符串)，避免上层渲染出 [object Object]。
     */
    async login(username: string, password: string): Promise<void> {
      const auth = getAuth();
      try {
        await auth.signInWithPassword({ username, password });
      } catch (e: any) {
        throw new Error(normalizeAuthError(e));
      }
    },

    /** 退出登录 */
    async logout(): Promise<void> {
      const auth = getAuth();
      await auth.signOut();
    },

    /** 获取登录态（不含角色信息） */
    async getLoginState(): Promise<{ isLogin: boolean; uid?: string }> {
      const auth = getAuth();
      const state = await auth.getLoginState();
      if (state && (state as any).isLogin !== false) {
        const uid = (state.user as any)?.uid;
        return { isLogin: true, uid };
      }
      return { isLogin: false };
    },

    /**
     * 获取当前用户完整 profile（调 auth-manage 云函数，含角色）
     *
     * 云函数返回 { profile: {...} }，这里解包后直接返回 CloudProfile。
     */
    async getProfile(): Promise<CloudProfile> {
      const res = await callFunction<{ profile: CloudProfile }>('auth-manage', {
        action: 'getProfile',
      });
      return res.profile;
    },
  },

  // ── 用户管理（仅 admin）─────────────────────────────────────────
  userManage: {
    async list(): Promise<UserAccount[]> {
      const res = await callFunction<{ users: UserAccount[] }>('auth-manage', {
        action: 'list',
      });
      return res.users || [];
    },

    async create(user: {
      username: string;
      password: string;
      role: Role;
      displayName: string;
    }): Promise<UserAccount> {
      return callFunction<UserAccount>('auth-manage', {
        action: 'create',
        user,
      });
    },

    async update(
      uid: string,
      patch: Partial<Pick<UserAccount, 'role' | 'displayName'>>,
      password?: string,
    ): Promise<{ uid: string; patch: Partial<UserAccount> }> {
      return callFunction('auth-manage', {
        action: 'update',
        uid,
        user: patch,
        password,
      });
    },

    async delete(uid: string): Promise<{ uid: string }> {
      return callFunction('auth-manage', { action: 'delete', uid });
    },

    /**
     * 修改自己的密码（所有登录用户可用，无需 admin 权限）
     *
     * 云函数会先校验 currentPassword 正确性，再调 updateUser 设置新密码。
     * 成功后建议提示用户重新登录。
     */
    async changeOwnPassword(
      currentPassword: string,
      newPassword: string,
    ): Promise<{ uid: string; message: string }> {
      return callFunction('auth-manage', {
        action: 'changeOwnPassword',
        currentPassword,
        newPassword,
      });
    },

    /**
     * 修改自己的显示名（所有登录用户可用，无需 admin 权限）
     */
    async updateOwnProfile(
      displayName: string,
    ): Promise<{ uid: string; displayName: string; message: string }> {
      return callFunction('auth-manage', {
        action: 'updateOwnProfile',
        displayName,
      });
    },
  },

  // ── AI 代理（所有登录用户）─────────────────────────────────────
  ai: {
    /** 智能解析订单文本 */
    async parseOrder(text: string, filePayload?: FilePayload): Promise<any[]> {
      const res = await callFunction<{ results: any[] }>('ai-proxy', {
        action: 'parseOrder',
        text,
        filePayload: filePayload || null,
      });
      return res.results || [];
    },

    /** 智能解析成本表格 */
    async parseCost(
      text: string,
      filePayload?: FilePayload,
    ): Promise<Partial<CostRecord>[]> {
      const res = await callFunction<{ results: Partial<CostRecord>[] }>('ai-proxy', {
        action: 'parseCost',
        text,
        filePayload: filePayload || null,
      });
      return res.results || [];
    },

    /** 测试当前激活供应商连接 */
    async testConnection(): Promise<{ success: boolean; msg: string }> {
      return callFunction('ai-proxy', { action: 'testConnection' });
    },
  },

  // ── 成本资料库 ────────────────────────────────────────────────
  costDb: {
    async list(): Promise<CostRecord[]> {
      const res = await callFunction<{ records: CostRecord[] }>('cost-database', {
        action: 'list',
      });
      return res.records || [];
    },

    async create(record: CostRecord): Promise<CostRecord> {
      return callFunction('cost-database', { action: 'create', record });
    },

    async update(record: CostRecord): Promise<CostRecord> {
      // 云函数要求顶级 id 字段，从 record.id 拆出来
      const { id, ...rest } = record;
      return callFunction('cost-database', { action: 'update', id, record: rest });
    },

    async delete(id: string): Promise<{ id: string }> {
      return callFunction('cost-database', { action: 'delete', id });
    },

    async batchImport(records: CostRecord[]): Promise<{ count: number }> {
      return callFunction('cost-database', { action: 'batchImport', records });
    },
  },

  // ── 费率配置 ──────────────────────────────────────────────────
  priceConfig: {
    async get(): Promise<PriceConfig | null> {
      const res = await callFunction<{ config: PriceConfig | null }>('price-config', {
        action: 'get',
      });
      return res.config;
    },

    async update(config: PriceConfig): Promise<PriceConfig> {
      const res = await callFunction<{ config: PriceConfig }>('price-config', {
        action: 'update',
        config,
      });
      return res.config;
    },
  },

  // ── AI 配置（仅 admin，返回脱敏 apiKey）────────────────────────
  aiSettings: {
    async get(): Promise<AISettings> {
      const res = await callFunction<{ config: AISettings }>('auth-manage', {
        action: 'getAiSettings',
      });
      return res.config;
    },

    async update(settings: AISettings): Promise<AISettings> {
      const res = await callFunction<{ config: AISettings }>('auth-manage', {
        action: 'updateAiSettings',
        settings,
      });
      return res.config;
    },
  },

  // ── 算料记录 ──────────────────────────────────────────────────
  calculation: {
    async save(record: HistoryRecord): Promise<{ id: string; record: HistoryRecord }> {
      return callFunction('calculation', { action: 'save', record });
    },

    async update(id: string, record: HistoryRecord): Promise<{ record: HistoryRecord }> {
      return callFunction('calculation', { action: 'update', id, record });
    },

    async list(): Promise<HistoryRecord[]> {
      const res = await callFunction<{ records: HistoryRecord[] }>('calculation', {
        action: 'list',
      });
      return res.records || [];
    },

    async get(id: string): Promise<HistoryRecord> {
      const res = await callFunction<{ record: HistoryRecord }>('calculation', {
        action: 'get',
        id,
      });
      return res.record;
    },

    async delete(id: string): Promise<{ id: string }> {
      return callFunction('calculation', { action: 'delete', id });
    },
  },

  // ── 领料单 / 分享 ─────────────────────────────────────────────
  shareOrder: {
    async create(
      order: Omit<
        ShareOrder,
        | 'id'
        | 'shareCode'
        | 'ownerUid'
        | 'ownerDisplayName'
        | 'createdAt'
        | 'expiresAt'
        | 'revoked'
      >,
    ): Promise<{ id: string; shareCode: string; expiresAt: string }> {
      return callFunction('share-order', { action: 'create', order });
    },

    async getByCode(code: string): Promise<ShareOrder> {
      const res = await callFunction<{ order: ShareOrder }>('share-order', {
        action: 'getByCode',
        code,
      });
      return res.order;
    },

    async listMine(): Promise<ShareOrder[]> {
      const res = await callFunction<{ orders: ShareOrder[] }>('share-order', {
        action: 'listMine',
      });
      return res.orders || [];
    },

    async listShared(): Promise<ShareOrder[]> {
      const res = await callFunction<{ orders: ShareOrder[] }>('share-order', {
        action: 'listShared',
      });
      return res.orders || [];
    },

    async listAll(): Promise<ShareOrder[]> {
      const res = await callFunction<{ orders: ShareOrder[] }>('share-order', {
        action: 'listAll',
      });
      return res.orders || [];
    },

    async revoke(id: string): Promise<{ id: string }> {
      return callFunction('share-order', { action: 'revoke', id });
    },
  },
};

export default cloudService;

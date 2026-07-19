/**
 * auth-manage 云函数 — 用户管理 + 角色解析
 *
 * 实现 action：
 *   - getProfile:        所有登录用户，根据 _callerUid 查 users 集合返回用户信息
 *   - changeOwnPassword: 所有登录用户，校验新密码强度后修改自己的密码（无需 admin）
 *   - list:              仅 admin，返回所有用户
 *   - create:            仅 admin，调 @cloudbase/manager-node 创建用户名密码账号 → 获得 uid → 写入 users 集合
 *   - update:            仅 admin，修改角色/显示名/密码
 *   - delete:            仅 admin，从 users 集合删除 + 删除 CloudBase Auth 账号
 *   - getAiSettings:     仅 admin，读取 AI 供应商配置（脱敏 apiKey）
 *   - updateAiSettings:  仅 admin，更新 AI 供应商配置
 *
 * 重要：@cloudbase/node-sdk 的 app.auth() 没有 createUser/updateUser/deleteUser 方法。
 *       用户管理操作必须使用 @cloudbase/manager-node 的 app.user.createUser/modifyEndUser/deleteEndUsers。
 *       云函数运行环境会自动注入 TENCENTCLOUD_SECRETID / TENCENTCLOUD_SECRETKEY。
 */

const { db, app } = require('./common/db');
const { verifyUser, sendResponse } = require('./common/auth');

// ── @cloudbase/manager-node 初始化（延迟加载）──────────────────────────
let _mgrApp = null;

/**
 * 获取 manager-node 实例（用于用户管理操作）
 *
 * 云函数运行环境自动注入以下环境变量：
 *   - TENCENTCLOUD_SECRETID
 *   - TENCENTCLOUD_SECRETKEY
 *   - TENCENTCLOUD_SESSIONTOKEN（临时令牌，可能不存在）
 *   - SCF_NAMESPACE（环境 ID）
 */
function getMgr() {
  if (_mgrApp) return _mgrApp;

  const CloudBase = require('@cloudbase/manager-node');
  const envId = process.env.SCF_NAMESPACE || process.env.TCB_ENV || '';
  const secretId = process.env.TENCENTCLOUD_SECRETID || '';
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY || '';
  const token = process.env.TENCENTCLOUD_SESSIONTOKEN || undefined;

  if (!secretId || !secretKey) {
    throw new Error('云函数环境缺少 TENCENTCLOUD_SECRETID/SECRETKEY，无法执行用户管理操作');
  }

  const initOpts = { secretId, secretKey, envId };
  if (token) initOpts.token = token;

  _mgrApp = CloudBase.init(initOpts);
  return _mgrApp;
}

/**
 * 头像颜色按角色自动分配
 */
function avatarColorByRole(role) {
  if (role === 'admin') return 'indigo';
  if (role === 'sales') return 'emerald';
  return 'amber';
}

exports.main = async (event, context) => {
  const { action, user: userInput, uid, password } = event || {};

  // ── bootstrapAdmin 应急通道：无需登录，用于恢复/初始化 admin 账号 ───
  // 用途：当 CloudBase Auth 中的 admin 账号被误删/禁用/环境重置时，
  //      可通过此接口无登录地重建 admin 账号（密码为 bootstrapPassword 传入）。
  // 限制：仅当环境中不存在任何 admin 角色时才会创建，避免被恶意调用覆盖现有账号。
  if (action === 'bootstrapAdmin') {
    const { bootstrapPassword } = event || {};
    if (!bootstrapPassword || bootstrapPassword.length < 8) {
      return sendResponse(400, null, '请传入至少 8 位的 bootstrapPassword');
    }

    try {
      // 1. 检查是否已存在 admin 账号
      const existAdmin = await db
        .collection('users')
        .where({ role: 'admin' })
        .limit(1)
        .get();
      if (existAdmin.data && existAdmin.data.length > 0) {
        return sendResponse(409, null, 'admin 账号已存在，不可重复创建');
      }
    } catch (e) {
      return sendResponse(500, null, `查询 admin 失败: ${e.message || e}`);
    }

    // 2. 在 CloudBase Auth 中创建 admin 登录账号
    let newUid;
    try {
      const mgr = getMgr();
      const res = await mgr.user.createUser({
        name: 'admin',
        password: bootstrapPassword,
        type: 'internalUser',
        nickName: 'admin',
      });
      newUid =
        res?.Data?.Uid ||
        res?.data?.uid ||
        res?.uid ||
        res?.Data?.uid;
      if (!newUid) {
        return sendResponse(500, null, '创建 admin 未返回 uid: ' + JSON.stringify(res));
      }
    } catch (e) {
      return sendResponse(500, null, `创建 admin 登录账号失败: ${e.message || e}`);
    }

    // 3. 写入 users 集合
    const now = new Date().toISOString();
    const doc = {
      uid: newUid,
      username: 'admin',
      role: 'admin',
      displayName: '系统管理员',
      avatarColor: avatarColorByRole('admin'),
      createdAt: now,
      createdBy: 'system',
    };
    try {
      await db.collection('users').add(doc);
    } catch (e) {
      // 回滚删除 Auth 账号
      try {
        const mgr = getMgr();
        await mgr.user.deleteUsers({ uids: [newUid] });
      } catch {}
      return sendResponse(500, null, `写入 admin 资料失败: ${e.message || e}`);
    }

    return sendResponse(0, { user: doc }, 'admin 账号已重建，请使用 admin / bootstrapPassword 登录');
  }

  // 从 event._callerUid 或 context.userInfo 获取当前用户 uid
  // （CloudBase JS SDK v3 不会自动传 context.userInfo，前端手动传 _callerUid）
  const currentUid = event._callerUid || (context.userInfo && context.userInfo.uid) || '';

  // getProfile 不走 verifyUser（它本身就是查当前用户）
  if (action === 'getProfile') {
    if (!currentUid) {
      return sendResponse(401, null, '未登录');
    }
    try {
      const doc = await db
        .collection('users')
        .where({ uid: currentUid })
        .get();
      const u = doc.data && doc.data[0];
      if (!u) {
        return sendResponse(403, null, '用户信息不存在，请联系管理员');
      }
      return sendResponse(0, {
        profile: {
          uid: u.uid,
          username: u.username,
          role: u.role,
          displayName: u.displayName,
          avatarColor: u.avatarColor,
        },
      });
    } catch (err) {
      return sendResponse(500, null, `获取用户信息失败: ${err.message || err}`);
    }
  }

  // changeOwnPassword 不需要 admin 权限，仅校验登录 + 新密码强度
  if (action === 'changeOwnPassword') {
    if (!currentUid) {
      return sendResponse(401, null, '未登录');
    }
    const { currentPassword, newPassword } = event || {};
    if (!currentPassword || !newPassword) {
      return sendResponse(400, null, '请输入当前密码和新密码');
    }
    if (newPassword.length < 8) {
      return sendResponse(400, null, '新密码长度不能少于 8 位');
    }

    // 使用 @cloudbase/manager-node 修改密码
    try {
      const mgr = getMgr();
          await mgr.user.modifyUser({
            uid: currentUid,
            password: newPassword,
          });
    } catch (e) {
      return sendResponse(500, null, `修改密码失败: ${e.message || e}`);
    }

    return sendResponse(0, { uid: currentUid }, '密码修改成功，请退出后使用新密码重新登录');
  }

  // updateOwnProfile 不需要 admin 权限，仅允许修改自己的显示名
  if (action === 'updateOwnProfile') {
    if (!currentUid) {
      return sendResponse(401, null, '未登录');
    }
    const { displayName: newName } = event || {};
    if (!newName || !newName.trim()) {
      return sendResponse(400, null, '显示名不能为空');
    }
    try {
      await db.collection('users').where({ uid: currentUid }).update({
        displayName: newName.trim(),
        updatedAt: new Date().toISOString(),
      });
      return sendResponse(0, { uid: currentUid, displayName: newName.trim() }, '个人信息更新成功');
    } catch (e) {
      return sendResponse(500, null, `更新失败: ${e.message || e}`);
    }
  }

  // 其余 action 需要登录 + admin 校验
  // 先查用户角色
  if (!currentUid) {
    return sendResponse(401, null, '未登录');
  }
  let currentUser;
  try {
    const userDoc = await db.collection('users').where({ uid: currentUid }).get();
    currentUser = userDoc.data && userDoc.data[0];
  } catch (e) {
    return sendResponse(500, null, `查询用户失败: ${e.message || e}`);
  }
  if (!currentUser) {
    return sendResponse(403, null, '用户信息不存在');
  }

  if (currentUser.role !== 'admin') {
    return sendResponse(403, null, '仅管理员可执行用户管理操作');
  }

  try {
    switch (action) {
      // ── list: 返回所有用户 ───────────────────────────────────────
      case 'list': {
        const res = await db
          .collection('users')
          .orderBy('createdAt', 'asc')
          .limit(500)
          .get();
        const users = (res.data || []).map((u) => ({
          uid: u.uid,
          username: u.username,
          role: u.role,
          displayName: u.displayName,
          avatarColor: u.avatarColor,
          createdAt: u.createdAt,
        }));
        return sendResponse(0, { users });
      }

      // ── create: 创建 CloudBase 账号 + 写 users 集合 ────────────────
      case 'create': {
        const { username, password: pwd, role, displayName } = userInput || {};
        if (!username || !pwd || !role || !displayName) {
          return sendResponse(400, null, '缺少必填字段: username/password/role/displayName');
        }
        if (!['admin', 'sales', 'factory'].includes(role)) {
          return sendResponse(400, null, '非法角色: ' + role);
        }

        // 1. 查重
        const exists = await db
          .collection('users')
          .where({ username })
          .get();
        if (exists.data && exists.data.length > 0) {
          return sendResponse(409, null, '用户名已存在');
        }

        // 2. 调 @cloudbase/manager-node 创建用户名密码账号
        let newUid;
        try {
          const mgr = getMgr();
          const res = await mgr.user.createUser({
            name: username,
            password: pwd,
            type: 'internalUser',
            nickName: username,
          });
          // 返回结构兼容多种格式
          newUid =
            res?.Data?.Uid ||
            res?.data?.uid ||
            res?.uid ||
            res?.Data?.uid;
          if (!newUid) {
            return sendResponse(500, null, '创建账号未返回 uid，请检查 SDK 版本: ' + JSON.stringify(res));
          }
        } catch (e) {
          return sendResponse(500, null, `创建登录账号失败: ${e.message || e}`);
        }

        // 3. 写入 users 集合
        const now = new Date().toISOString();
        const doc = {
          uid: newUid,
          username,
          role,
          displayName,
          avatarColor: avatarColorByRole(role),
          createdAt: now,
          createdBy: currentUser.uid,
        };
        try {
          await db.collection('users').add(doc);
        } catch (e) {
          // 数据写入失败，尝试回滚删除 Auth 账号（忽略失败）
          try {
            const mgr = getMgr();
            await mgr.user.deleteUsers({ uids: [newUid] });
          } catch {}
          return sendResponse(500, null, `写入用户资料失败: ${e.message || e}`);
        }

        return sendResponse(0, { user: doc }, '用户创建成功');
      }

      // ── update: 修改角色/显示名/密码 ────────────────────────────────
      case 'update': {
        if (!uid) return sendResponse(400, null, '缺少 uid 参数');
        const patch = {};
        if (userInput?.role) {
          if (!['admin', 'sales', 'factory'].includes(userInput.role)) {
            return sendResponse(400, null, '非法角色: ' + userInput.role);
          }
          patch.role = userInput.role;
          patch.avatarColor = avatarColorByRole(userInput.role);
        }
        if (userInput?.displayName) patch.displayName = userInput.displayName;

        // 改密码：调 @cloudbase/manager-node
        if (password) {
          try {
            const mgr = getMgr();
          await mgr.user.modifyUser({
            uid: uid,
            password: password,
          });
          } catch (e) {
            return sendResponse(500, null, `重置密码失败: ${e.message || e}`);
          }
        }

        if (Object.keys(patch).length === 0 && !password) {
          return sendResponse(400, null, '无可更新字段');
        }
        patch.updatedAt = new Date().toISOString();
        patch.updatedBy = currentUser.uid;

        if (Object.keys(patch).length > 1) {
          // 有角色/显示名等字段需要更新（updatedAt/updatedBy 除外）
          await db
            .collection('users')
            .where({ uid })
            .update(patch);
        }

        return sendResponse(0, { uid, patch }, '用户更新成功');
      }

      // ── delete: 删 users 集合 + 删除 CloudBase 登录账号 ────────────────
      case 'delete': {
        if (!uid) return sendResponse(400, null, '缺少 uid 参数');
        if (uid === currentUser.uid) {
          return sendResponse(400, null, '不可删除当前登录账号');
        }

        // 1. 删 users 集合记录
        await db
          .collection('users')
          .where({ uid })
          .remove();

        // 2. 删除 CloudBase 登录账号
        try {
          const mgr = getMgr();
          await mgr.user.deleteUsers({ uids: [uid] });
        } catch (e) {
          // 账号删除失败不阻塞，仅记录
          console.warn('删除登录账号失败:', e.message || e);
        }

        return sendResponse(0, { uid }, '用户已删除');
      }

      // ── getAiSettings: 读取 AI 供应商配置（脱敏 apiKey）──────────────
      case 'getAiSettings': {
        if (currentUser.role !== 'admin') {
          return sendResponse(403, null, '仅管理员可查看 AI 配置');
        }
        const doc = await db.collection('ai_settings').doc('global').get();
        const data = doc.data && doc.data[0];
        if (!data) {
          // 未初始化：返回空配置骨架
          return sendResponse(0, {
            config: {
              providers: [],
              activeProvider: '',
            },
          });
        }
        // 脱敏：apiKey 仅保留末四位
        const { _id, _openid, updatedAt, updatedBy, ...cfg } = data;
        if (Array.isArray(cfg.providers)) {
          cfg.providers = cfg.providers.map((p) => ({
            ...p,
            apiKey: maskApiKey(p.apiKey),
          }));
        }
        return sendResponse(0, { config: cfg });
      }

      // ── updateAiSettings: 更新 AI 供应商配置 ─────────────────────────
      case 'updateAiSettings': {
        if (currentUser.role !== 'admin') {
          return sendResponse(403, null, '仅管理员可修改 AI 配置');
        }
        const { settings } = event || {};
        if (!settings || !Array.isArray(settings.providers)) {
          return sendResponse(400, null, 'AI 配置格式不合法');
        }

        // 对于脱敏 apiKey（***xxxx）保持原有明文：读旧文档比对
        const oldDoc = await db.collection('ai_settings').doc('global').get();
        const oldData = oldDoc.data && oldDoc.data[0];
        const oldProvidersMap = new Map();
        if (oldData && Array.isArray(oldData.providers)) {
          oldData.providers.forEach((p) => {
            oldProvidersMap.set(p.provider, p.apiKey);
          });
        }

        // 若提交的 apiKey 是脱敏占位（以 *** 开头），则用旧明文还原
        const mergedProviders = settings.providers.map((p) => {
          if (p.apiKey && typeof p.apiKey === 'string' && p.apiKey.startsWith('***')) {
            return { ...p, apiKey: oldProvidersMap.get(p.provider) || '' };
          }
          return p;
        });

        const now = new Date().toISOString();
        const doc = {
          ...settings,
          providers: mergedProviders,
          updatedAt: now,
          updatedBy: currentUser.uid,
        };
        await db.collection('ai_settings').doc('global').set(doc);

        // 返回脱敏后的配置
        const maskedConfig = {
          ...settings,
          providers: mergedProviders.map((p) => ({
            ...p,
            apiKey: maskApiKey(p.apiKey),
          })),
        };
        return sendResponse(0, { config: maskedConfig }, 'AI 配置已更新');
      }

      default:
        return sendResponse(400, null, `未知 action: ${action}`);
    }
  } catch (err) {
    return sendResponse(500, null, `服务器错误: ${err.message || err}`);
  }
};

/**
 * 脱敏 API Key：仅保留末四位，前缀以 *** 占位
 *
 * 示例：sk-abcd1234efgh5678 → ***5678
 */
function maskApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return '';
  if (apiKey.length <= 4) return '***';
  return '***' + apiKey.slice(-4);
}

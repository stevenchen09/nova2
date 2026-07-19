/**
 * 公共鉴权工具（云函数共用）
 *
 * 提供统一登录校验、角色获取与响应封装。
 * 所有云函数入口均应先调用 verifyUser 确认调用者身份。
 *
 * V4 修复：CloudBase JS SDK v3 的 callFunction 不会自动传 context.userInfo
 * 前端手动传 _callerUid，云函数从 event._callerUid 取 uid
 */

/**
 * 验证用户登录 + 获取角色
 *
 * @param {object} event    云函数事件入参（含 _callerUid）
 * @param {object} context  云函数上下文（含 userInfo，作为回退）
 * @param {object} db       已初始化的 CloudBase 数据库实例
 * @returns {Promise<{code: number, data: any, message: string}>}
 *   - code=0  表示通过，data 含 { uid, role, username, displayName }
 *   - code=401 未登录
 *   - code=403 用户信息不存在
 */
async function verifyUser(event, context, db) {
  // 优先从 event._callerUid 获取（前端传的），其次从 context.userInfo
  const callerUid = (event && event._callerUid) || (context && context.userInfo && context.userInfo.uid) || '';
  if (!callerUid) {
    return { code: 401, data: null, message: '未登录' };
  }

  const userDoc = await db
    .collection('users')
    .where({ uid: callerUid })
    .get();

  if (!userDoc.data || userDoc.data.length === 0) {
    return { code: 403, data: null, message: '用户信息不存在' };
  }

  const user = userDoc.data[0];
  return {
    code: 0,
    data: {
      uid: user.uid,
      role: user.role,
      username: user.username,
      displayName: user.displayName,
      avatarColor: user.avatarColor,
    },
  };
}

/**
 * 统一响应封装
 *
 * @param {number} code     业务码（0=成功，非 0=业务错误）
 * @param {any}    data     返回数据
 * @param {string} message  提示消息
 */
function sendResponse(code, data, message = 'OK') {
  return { code, data, message };
}

module.exports = { verifyUser, sendResponse };

/**
 * 公共鉴权工具（云函数共用）
 *
 * V4 修复：CloudBase JS SDK v3 的 callFunction 不会自动传 context.userInfo
 * 前端手动传 _callerUid，云函数从 event._callerUid 取 uid
 */

async function verifyUser(event, context, db) {
  // 优先从 event._callerUid 获取（前端传的），其次从 context.userInfo
  const uid = (event && event._callerUid) || (context && context.userInfo && context.userInfo.uid) || '';
  if (!uid) {
    return { code: 401, data: null, message: '未登录' };
  }

  const userDoc = await db
    .collection('users')
    .where({ uid })
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

function sendResponse(code, data, message = 'OK') {
  return { code, data, message };
}

module.exports = { verifyUser, sendResponse };

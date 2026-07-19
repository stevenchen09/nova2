/**
 * 密码哈希工具模块
 * 使用 Web Crypto API (SHA-256) 对密码进行单向哈希
 * 确保存储在 localStorage 的密码不以明文形式保存
 */

/**
 * 对密码进行 SHA-256 哈希处理
 * @param password - 原始明文密码
 * @returns 64位十六进制哈希字符串
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + '_nova2_salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 判断一个值是否已经过 SHA-256 哈希
 * 哈希后的密码为 64 位小写十六进制字符串
 * @param value - 待检测的值
 * @returns true 表示已经是哈希值，false 表示是明文
 */
export function isHashed(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

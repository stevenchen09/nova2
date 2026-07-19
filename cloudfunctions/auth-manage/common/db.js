/**
 * 公共数据库访问封装（云函数共用）
 *
 * 基于 @cloudbase/node-sdk 初始化 CloudBase 应用与数据库实例。
 * 云函数运行时，CloudBase 会自动注入当前环境 ID 到 process.env.SCF_NAMESPACE，
 * 因此无需在前端配置 envId，也无需在云函数中硬编码。
 *
 * 所有云函数通过 `const { db } = require('../common/db');` 获取数据库实例，
 * 以管理端身份访问集合（不受安全规则限制，权限由云函数内部逻辑控制）。
 */

const tcb = require('@cloudbase/node-sdk');

// CloudBase 云函数运行环境会自动注入 SCF_NAMESPACE（即环境 ID）
// 兜底：若本地调试时未注入，可由 TCB_ENV / SCF_ENVIRONMENT 等变量补充
const envId = process.env.SCF_NAMESPACE || process.env.TCB_ENV || '';

const app = tcb.init(
  envId ? { env: envId } : {}
);

const db = app.database();

/**
 * 获取服务端 command 对象（用于 db.command 的查询操作符）
 * 用法：const _ = db.command; _.gt(0) / _.in([...]) 等
 */
const _ = db.command;

module.exports = { app, db, _ };

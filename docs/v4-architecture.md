# Nova2 V4 架构设计文档

> **版本**: v4.0 | **日期**: 2026-07-12 | **作者**: 架构师 高见远（Gao）
> **关联文档**: [V4 PRD](./v4-prd.md) | [V2 增量设计](./v2-incremental-design.md)

---

## 1. 系统架构总览

### 1.1 架构变迁概述

V3 是纯前端应用（Vite + React + localStorage），所有数据存浏览器本地，AI Key 暴露在前端。V4 升级为 **腾讯云 CloudBase Serverless 云端架构**，实现 API Key 后端化、成本数据全局共享、多角色协作。

```
┌─────────────────────────────────────────────────────────────────────┐
│                         用户浏览器（前端）                           │
│  Vite + React 19 + TypeScript + Tailwind CSS v4                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────┐  │
│  │ 报价算料     │  │ 成本资料库   │  │ 领料单/分享  │  │ 系统设置  │  │
│  │ QuoteWork   │  │ CostDB(只读) │  │ PickList    │  │ Settings  │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬────┘  │
│         │                │                │               │        │
│         └────────────────┴────────────────┴───────────────┘        │
│                              │                                      │
│              ┌───────────────▼───────────────┐                     │
│              │  cloudService.ts (统一API层)   │                     │
│              │  封装所有云函数调用 + 鉴权      │                     │
│              └───────────────┬───────────────┘                     │
└──────────────────────────────┼─────────────────────────────────────┘
                               │ HTTPS (CloudBase JS SDK)
                               │ cloudbase.callFunction()
═══════════════════════════════╪═══════════════════════════════════════
                    腾讯云 CloudBase (Serverless)
┌──────────────────────────────┼─────────────────────────────────────┐
│              ┌───────────────▼───────────────┐                     │
│              │     CloudBase 认证服务          │                     │
│              │  (用户名/密码登录，返回 uid)     │                     │
│              └───────────────┬───────────────┘                     │
│                               │                                     │
│  ┌────────────┐ ┌────────────┐ │ ┌────────────┐ ┌────────────┐    │
│  │ ai-proxy   │ │cost-database│ │ │price-config│ │ auth-manage│    │
│  │ 云函数      │ │ 云函数      │ │ │ 云函数      │ │ 云函数      │    │
│  └─────┬──────┘ └─────┬──────┘   └─────┬──────┘ └─────┬──────┘    │
│        │              │                │              │            │
│        │   ┌──────────┴────────┐ ┌─────┴──────┐ ┌─────┴──────┐    │
│        │   │ calculation 云函数 │ │share-order │ │            │    │
│        │   │ (算料记录存取)     │ │ 云函数      │ │            │    │
│        │   └──────────┬────────┘ └─────┬──────┘ └─────┬──────┘    │
│        │              │                │              │            │
│        │    ┌─────────▼────────────────▼──────────────▼─────┐     │
│        │    │            CloudBase 云数据库 (NoSQL)           │     │
│        │    │  users │ cost_records │ price_config │ ai_settings │     │
│        │    │  calculations │ share_orders                   │     │
│        │    └────────────────────────────────────────────────┘     │
│        │                                                            │
│        ▼                                                            │
│  ┌──────────────────┐  ┌──────────────────────────────────────┐  │
│  │ 外部 AI API       │  │ CloudBase 静态托管 (前端构建产物)      │  │
│  │ 10家供应商         │  │ dist/ → CDN 分发                      │  │
│  └──────────────────┘  └──────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### 1.2 数据流说明

| 数据流 | 路径 | 说明 |
|--------|------|------|
| **AI 调用** | 前端 → `ai-proxy` 云函数 → 外部 AI API | API Key 存云数据库 `ai_settings` 集合，云函数读取后调 AI，前端零接触 Key |
| **成本库读写** | 前端 → `cost-database` 云函数 → `cost_records` 集合 | 管理员可写，销售只读（云函数内做角色校验），工厂不可见 |
| **费率配置** | 前端 → `price-config` 云函数 → `price_config` 集合 | 管理员设置，所有角色读取（销售读报价轨，管理员读双轨） |
| **算料记录** | 前端 → `calculation` 云函数 → `calculations` 集合 | 销售存自己的，管理员看所有 |
| **领料单分享** | 前端 → `share-order` 云函数 → `share_orders` 集合 | 销售生成，工厂凭分享码查看 |
| **用户认证** | 前端 → CloudBase 认证 SDK → 返回 uid → 前端读 `users` 集合取角色 | 账密登录由 CloudBase 原生处理，角色信息存 `users` 集合 |

### 1.3 CloudBase 环境配置

| 配置项 | 值 / 说明 |
|--------|-----------|
| **云开发环境 ID (envId)** | 需用户在腾讯云控制台开通 CloudBase 后获取，前端通过环境变量 `VITE_CLOUDBASE_ENV_ID` 注入 |
| **地域** | 推荐广州 (ap-guangzhou) 或上海 (ap-shanghai)，视用户业务所在地定 |
| **套餐** | 基础版（按量付费）即可满足初期需求；并发云函数调用数视销售规模调整 |
| **静态托管** | 开通静态网站托管，将 `dist/` 上传；绑定自定义域名（可选） |
| **云函数运行时** | Node.js 16 或 18（CloudBase 支持） |
| **数据库权限** | 所有集合统一设为「仅创建者可读写」或「私有」，**所有数据访问强制走云函数**，由云函数内部做角色鉴权 |

### 1.4 前后端通信方式

使用 **CloudBase JS SDK** (`@cloudbase/js-sdk`) 的 `callFunction` 能力：

```typescript
// 前端初始化（cloudService.ts 中）
import cloudbase from '@cloudbase/js-sdk';

const app = cloudbase.init({
  env: import.meta.env.VITE_CLOUDBASE_ENV_ID,
});

// 调用云函数
const result = await app.callFunction({
  name: 'ai-proxy',
  data: { action: 'parseOrder', text: '...', filePayload: null },
});
// result.result 为云函数 return 的对象
```

登录认证使用 CloudBase Auth：
```typescript
const auth = app.auth({ persistence: 'local' });
await auth.signInWithUsernameOrEmail({ username, password });
const loginState = await auth.getLoginState();
const uid = loginState.user.uid;
```

---

## 2. 云函数设计

所有云函数统一遵循以下约定：
- **入口结构**: Node.js 云函数，`index.js` 导出 `main` 函数，接收 `(event, context)`
- **event 内容**: 前端 `callFunction` 传入的 `data` 对象 + CloudBase 注入的 `userInfo`（含 `uid`）
- **统一响应格式**: `{ code: 0, data: any, message: string }`，`code=0` 表示成功，非 0 表示业务错误
- **鉴权方式**: 每个云函数入口先校验 `context.userInfo` 是否登录，再查 `users` 集合确认角色，按角色判断是否允许执行
- **依赖**: `@cloudbase/node-sdk`（数据库访问）、`node-fetch`（调 AI API，Node 18+ 可用原生 fetch）

### 2.1 `ai-proxy` — AI 代理调用

| 项 | 说明 |
|----|------|
| **功能** | 代理前端所有 AI 请求（订单解析、成本解析、连接测试）；从 `ai_settings` 集合读取 Key，调外部 AI API，返回解析结果 |
| **输入** | `{ action: 'parseOrder' \| 'parseCost' \| 'testConnection', text?: string, filePayload?: {mimeType, data} }` |
| **输出** | `{ code: 0, data: { results: [...] } }` 或错误 |
| **权限** | admin / sales / factory 均可调用（所有登录用户） |
| **涉及集合** | `ai_settings`（读） |

**核心逻辑**:
1. 从 `ai_settings` 集合读取已启用的供应商配置（含 apiKey、baseUrl、model）
2. 按 `activeProvider` 选择激活供应商
3. 复用 V3 `aiService.ts` 中的请求构建逻辑（OpenAI 兼容格式 / Gemini 特殊路径），迁移到云函数内
4. 调用 AI API，解析返回 JSON，回传给前端
5. **apiKey 在云函数内使用，绝不出现在返回结果中**

### 2.2 `cost-database` — 成本资料库 CRUD

| 项 | 说明 |
|----|------|
| **功能** | 成本记录的增删改查 + 批量导入；管理员可写，销售只读（且隐藏 materialCost 字段），工厂不可调用 |
| **输入** | `{ action: 'list' \| 'create' \| 'update' \| 'delete' \| 'batchImport', record?: CostRecord, id?: string, records?: CostRecord[] }` |
| **输出** | `{ code: 0, data: { records: [...] \| { count: number } } }` |
| **权限** | `list`: admin(全字段) / sales(脱敏：移除 materialCost)；其他 action: 仅 admin |
| **涉及集合** | `cost_records`（读写） |

**核心逻辑**:
1. `list`: admin 返回完整字段；sales 返回时遍历移除 `materialCost` 字段（敏感成本数据）；factory 拒绝
2. `create/update/delete`: 仅 admin，校验字段合法性后写入
3. `batchImport`: 仅 admin，支持去重合并（按 model+color 匹配）

### 2.3 `price-config` — 成本费率读写

| 项 | 说明 |
|----|------|
| **功能** | 读取/更新全局 PriceConfig（双轨 quote* + cost*） |
| **输入** | `{ action: 'get' \| 'update', config?: PriceConfig }` |
| **输出** | `{ code: 0, data: { config: PriceConfig } }` |
| **权限** | `get`: admin(完整双轨) / sales(仅报价轨 quote* + 重量默认值，隐藏 cost*); `update`: 仅 admin |
| **涉及集合** | `price_config`（读写） |

**核心逻辑**:
1. 全局只有一份 PriceConfig 文档（`_id: "global"`）
2. `get`: admin 返回完整；sales 返回时移除 `costAccessoryPrice`/`costCuttingFee`/`costTaxRate` 字段
3. `update`: 仅 admin，校验字段后覆盖更新

### 2.4 `auth-manage` — 用户管理

| 项 | 说明 |
|----|------|
| **功能** | 用户管理（管理员建号/改角色/删号/列表）；获取当前用户信息（角色解析） |
| **输入** | `{ action: 'getProfile' \| 'list' \| 'create' \| 'update' \| 'delete', user?: {username, password, role, displayName}, uid?: string }` |
| **输出** | `{ code: 0, data: { profile: {...} \| users: [...] } }` |
| **权限** | `getProfile`: 所有登录用户；`list/create/update/delete`: 仅 admin |
| **涉及集合** | `users`（读写）；同时调用 CloudBase 管理 API 创建登录账号 |

**核心逻辑**:
1. `getProfile`: 根据 `context.userInfo.uid` 查 `users` 集合，返回 `{ uid, username, role, displayName, avatarColor }`
2. `create`: admin 请求 → 调 CloudBase Server SDK 创建用户名密码账号 → 获得 uid → 写入 `users` 集合（含 role/displayName）
3. `update`: 修改角色/显示名；若改密码则同时调 CloudBase 管理 API 重置密码
4. `delete`: 从 `users` 集合删除 + 调 CloudBase 管理 API 禁用账号

> **注意**: CloudBase 创建用户需要管理员权限。`auth-manage` 云函数需配置为「使用 CloudBase 服务端 SDK」（`@cloudbase/node-sdk` 的 `admin` 模式），或在 CloudBase 控制台开启「云函数免鉴权调用管理 API」。

### 2.5 `calculation` — 算料记录存储

| 项 | 说明 |
|----|------|
| **功能** | 算料历史记录的保存与查询（替代 V3 的 localStorage history） |
| **输入** | `{ action: 'save' \| 'list' \| 'get' \| 'delete', record?: HistoryRecord, id?: string }` |
| **输出** | `{ code: 0, data: { records: [...] \| record: {...} } }` |
| **权限** | `save`: admin/sales（存时绑定 uid）；`list`: admin(所有) / sales(仅自己的)；`get/delete`: 本人或 admin |
| **涉及集合** | `calculations`（读写） |

**核心逻辑**:
1. `save`: 记录写入时自动注入 `ownerUid` 字段（来自 `context.userInfo.uid`）
2. `list`: admin 返回所有；sales 仅返回 `ownerUid === 当前uid` 的记录

### 2.6 `share-order` — 领料单生成/分享/查看

| 项 | 说明 |
|----|------|
| **功能** | 领料单生成、分享码生成、分享查询、工厂查看 |
| **输入** | `{ action: 'create' \| 'getByCode' \| 'listMine' \| 'listShared' \| 'listAll' \| 'revoke', order?: ShareOrder, code?: string, id?: string }` |
| **输出** | `{ code: 0, data: { order: {...} \| shareCode: "XXXXXX" \| orders: [...] } }` |
| **权限** | `create`: admin/sales；`getByCode`: 任意登录用户（凭码查看）；`listMine`: 本人；`listShared`: factory；`listAll`: admin；`revoke`: 本人或 admin |
| **涉及集合** | `share_orders`（读写）、`calculations`（读，关联算料记录） |

**核心逻辑**:
1. `create`: 生成 6 位随机分享码（数字+大写字母，排除易混淆字符 0/O/1/I/L），校验唯一性，写入 `share_orders` 集合，设 `expiresAt = now + 7天`
2. `getByCode`: 工厂输入码 → 查询 → 校验未过期 → 按 `permissions` 字段过滤返回的数据模块（未授权模块返回 `{ hidden: true }`）
3. `listShared`: factory 角色查询所有分享给自己的领料单（当前简化为所有未过期且 factory 可见的）
4. `revoke`: 标记 `revoked = true`，工厂不可再查看

---

## 3. 云数据库设计

### 3.0 权限规则总策略

**所有集合的安全规则统一设为「仅创建者可读写」或「私有（仅管理端）」**，前端不直接读写任何集合，**所有数据访问强制通过云函数**，由云函数内部根据 `context.userInfo.uid` + `users` 集合中的 `role` 做细粒度鉴权。这样能最大限度保证安全性，且权限逻辑集中在云函数中便于维护。

> CloudBase 数据库权限规则可在控制台「数据库」→「数据权限」中设置，选择「仅创建者可读写」或自定义规则。由于我们全部走云函数（云函数以管理端身份访问 DB，不受安全规则限制），客户端 SDK 即使有权限也无法直接读到数据。

### 3.1 `users` — 用户表

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 自动生成 |
| `uid` | string | CloudBase 认证 uid（主业务键，唯一索引） |
| `username` | string | 登录用户名（唯一） |
| `role` | string | `admin` / `sales` / `factory` |
| `displayName` | string | 显示名称 |
| `avatarColor` | string | 头像颜色（indigo/emerald/amber） |
| `createdAt` | string | ISO 时间 |
| `createdBy` | string | 创建者 uid |

**索引**: `uid`（唯一）、`username`（唯一）
**权限**: 仅管理端（云函数访问）

### 3.2 `cost_records` — 材料成本库

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 自动生成 |
| `model` | string | 型号（如 D1822） |
| `color` | string | 颜色（如 黑色） |
| `materialCost` | number | 材料底价 元/米（对销售脱敏） |
| `weightPerMeter` | number | 线密度 kg/m |
| `notes` | string | 备注 |
| `updatedAt` | string | ISO 时间 |
| `updatedBy` | string | 最后修改者 uid |

**索引**: 复合索引 `(model, color)`（唯一，用于去重合并）
**权限**: 仅管理端

### 3.3 `price_config` — 全局费率配置

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 固定值 `"global"`（单文档） |
| `materialPrice` | number | 材料报价单价 元/米 |
| `mode` | string | `批量单(按整料)` / `零散单(按周长)` |
| `quoteAccessoryPrice` | number | 报价配件单价 元/套 |
| `quoteCuttingFee` | number | 报价切割单价 元/米 |
| `quoteTaxRate` | number | 报价税率（0.13 = 13%） |
| `costAccessoryPrice` | number | 成本配件单价（admin 专属，对销售脱敏） |
| `costCuttingFee` | number | 成本切割单价（admin 专属） |
| `costTaxRate` | number | 成本税率（admin 专属） |
| `defaultWeightPerMeter` | number | 默认线密度 kg/m |
| `defaultWeightPerAccessorySet` | number | 配件重量 kg/套 |
| `updatedAt` | string | ISO 时间 |
| `updatedBy` | string | 修改者 uid |

**索引**: 无（单文档，按 `_id` 查询）
**权限**: 仅管理端

### 3.4 `ai_settings` — AI 供应商配置

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 固定值 `"global"`（单文档） |
| `providers` | array | 供应商配置数组，每项 `{ provider, apiKey, baseUrl, model, enabled }` |
| `activeProvider` | string | 当前激活供应商 |
| `updatedAt` | string | ISO 时间 |
| `updatedBy` | string | 修改者 uid |

**索引**: 无（单文档）
**权限**: 仅管理端（**前端永不直接读取此集合，仅 `ai-proxy` 云函数读取**）

> **安全要点**: `ai_settings` 中的 `apiKey` 字段是核心机密。前端获取 AI 配置列表时，`auth-manage` 或专用接口必须返回**脱敏后的配置**（apiKey 显示为 `"***...***abcd"` 末四位），仅 `ai-proxy` 云函数在服务端读取明文。

### 3.5 `calculations` — 算料记录

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 自动生成 |
| `ownerUid` | string | 所属用户 uid（用于权限隔离） |
| `clientName` | string | 客户名 |
| `orderName` | string | 订单名 |
| `items` | array | FrameItem[]（原始尺寸输入） |
| `priceConfig` | object | 当时的 PriceConfig 快照 |
| `results` | array | GroupResult[]（计算结果） |
| `totalQuotePrice` | number | 报价总价 |
| `totalCostPrice` | number | 成本总价 |
| `profit` | number | 利润 |
| `profitMargin` | number | 利润率 |
| `createdAt` | string | ISO 时间 |

**索引**: `ownerUid` + `createdAt`（复合，用于按用户查询历史列表）
**权限**: 仅管理端

### 3.6 `share_orders` — 领料单/分享记录

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 自动生成 |
| `shareCode` | string | 6 位分享码（唯一） |
| `ownerUid` | string | 生成者 uid（销售/管理员） |
| `ownerDisplayName` | string | 生成者显示名（工厂端展示用） |
| `clientName` | string | 客户名 |
| `orderName` | string | 订单名 |
| `orderDate` | string | 订单日期 |
| `calculationId` | string | 关联的算料记录 _id |
| `results` | array | GroupResult[]（计算结果快照，冗余存储避免算料记录被删后分享失效） |
| `permissions` | object | `{ profileCutting: bool, costDetail: bool, clientInfo: bool, simpleList: bool }` 四项授权 |
| `expiresAt` | string | 过期时间 ISO（now + 7天） |
| `revoked` | bool | 是否已撤回 |
| `createdAt` | string | ISO 时间 |

**索引**: `shareCode`（唯一）、`ownerUid` + `createdAt`（复合）
**权限**: 仅管理端

### 3.7 数据库集合关系图

```
users (uid) ────────┬── calculations (ownerUid)
                    ├── share_orders (ownerUid)
                    ├── cost_records (updatedBy)
                    └── price_config / ai_settings (updatedBy)

calculations (_id) ──── share_orders (calculationId) [冗余 results 快照]
```

---

## 4. 前端改造方案

### 4.1 认证改造：`useAuth.ts` → CloudBase 认证

**改造要点**:
- 移除所有 `localStorage.getItem('aluminum_users')` / `aluminum_current_user` 逻辑
- 移除前端密码哈希（`hashPassword`）、`DEFAULT_USERS` 种子数据、`quickLogin` 快速登录、`handleRegister` 注册
- 登录改为调用 CloudBase Auth SDK 的 `signInWithUsernameOrEmail`
- 登录成功后获取 `uid`，调用 `auth-manage` 云函数 `getProfile` 获取角色信息
- 用户管理（`addUser`/`updateUser`/`deleteUser`）改为调用 `auth-manage` 云函数
- 会话持久化由 CloudBase Auth SDK 的 `persistence: 'local'` 自动处理

**`useAuth` 新返回值结构**:
```typescript
interface UseAuthReturn {
  currentUser: { uid: string; username: string; role: 'admin'|'sales'|'factory'; displayName: string; avatarColor: string } | null;
  isAuthLoading: boolean;          // 登录态初始化中
  loginError: string;
  handleLogin: (username, password) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;  // 刷新角色信息
}
```

> 用户管理功能从 `useAuth` 移出，改由 `SettingsPanel` 中管理员区块直接调用 `cloudService` 的用户管理方法。

### 4.2 新增 API 调用层：`src/services/cloudService.ts`

统一封装所有云函数调用，提供类型安全的 API：

```typescript
// cloudService.ts 核心结构
import cloudbase from '@cloudbase/js-sdk';

const app = cloudbase.init({ env: import.meta.env.VITE_CLOUDBASE_ENV_ID });
let authInstance: ReturnType<typeof app.auth> | null = null;

export const cloudService = {
  // ── 认证 ──
  auth: {
    login(username, password),
    logout(),
    getLoginState(),     // 返回 { isLogin, uid }
    getProfile(),        // 调 auth-manage 云函数获取角色
  },
  // ── 用户管理（admin）──
  userManage: {
    list(), create(user), update(uid, patch), delete(uid),
  },
  // ── AI 代理 ──
  ai: {
    parseOrder(text, filePayload?),
    parseCost(text, filePayload?),
    testConnection(),
  },
  // ── 成本资料库 ──
  costDb: {
    list(),               // 自动按角色脱敏
    create(record), update(record), delete(id), batchImport(records),
  },
  // ── 费率配置 ──
  priceConfig: {
    get(),                // 自动按角色脱敏
    update(config),
  },
  // ── AI 配置（admin）──
  aiSettings: {
    get(),                // 返回脱敏 apiKey
    update(settings),
  },
  // ── 算料记录 ──
  calculation: {
    save(record), list(), get(id), delete(id),
  },
  // ── 领料单/分享 ──
  shareOrder: {
    create(order),        // 返回 shareCode
    getByCode(code),      // 工厂查看
    listMine(),           // 销售查自己
    listShared(),         // 工厂查被分享的
    listAll(),            // 管理员查所有
    revoke(id),
  },
};
```

### 4.3 组件改造清单

| 组件 | 文件路径 | 改造内容 |
|------|----------|----------|
| **LoginForm** | `components/auth/LoginForm.tsx` | 移除注册 tab、快速登录按钮；改为调 `cloudService.auth.login`；保留视觉风格 |
| **Sidebar** | `components/layout/Sidebar.tsx` | 按 `currentUser.role` 动态渲染导航项；工厂角色新增「领料单」入口，隐藏报价/成本/利润 |
| **SettingsPanel** | `components/settings/SettingsPanel.tsx` | AI 配置区块仅 admin 可见，改调 `cloudService.aiSettings`；用户管理区块改调 `cloudService.userManage`；销售/工厂仅显示个人信息 |
| **CostDatabasePanel** | `components/cost/CostDatabasePanel.tsx` | 数据源改为 `cloudService.costDb.list()`；sales 模式隐藏增删改按钮 + 隐藏 materialCost 列；费率设置区块仅 admin 可见 |
| **InputPanel** | `components/quote/InputPanel.tsx` | AI 调用改走 `cloudService.ai.parseOrder`（不再传 aiSettings） |
| **QuoteWorkspace** | `components/quote/QuoteWorkspace.tsx` | 移除 aiSettings prop 传递；新增「生成领料单」按钮入口 |
| **PriceConfigCard** | `components/quote/PriceConfigCard.tsx` | cost* 字段仅 admin 可编辑；sales 只读展示报价轨 |
| **ResultsDashboard** | `components/quote/ResultsDashboard.tsx` | 无大改（纯展示组件） |
| **CostProfitPanel** | `components/profit/CostProfitPanel.tsx` | 仅 admin 可见（导航层已控制） |
| **HistoryPanel** | `components/history/HistoryPanel.tsx` | 数据源改为 `cloudService.calculation.list()`；载入逻辑不变 |

### 4.4 新增组件清单

| 组件 | 路径 | 功能 |
|------|------|------|
| **GeneratePickListModal** | `components/picklist/GeneratePickListModal.tsx` | 生成领料单弹窗：客户/订单信息输入 + 4 项数据授权勾选 + 生成分享码 |
| **PickListPanel** | `components/picklist/PickListPanel.tsx` | 领料单列表页（销售看自己的 / 管理员看所有 / 工厂看被分享的） |
| **PickListDetail** | `components/picklist/PickListDetail.tsx` | 领料单详情页：按 permissions 展示 4 个模块，未授权模块显示「此部分内容未被分享」 |
| **ShareCodeInput** | `components/picklist/ShareCodeInput.tsx` | 工厂端输入分享码入口（可独立于登录，也可在登录后入口） |

### 4.5 路由/导航按角色动态渲染

改造 `Sidebar.tsx`，导航项配置改为带角色权限的声明式结构：

```typescript
const NAV_ITEMS: { tab: ActiveTab; label: string; roles: Role[]; icon: string }[] = [
  { tab: 'quote',     label: '报价算料',   roles: ['admin', 'sales'],           icon: '📐' },
  { tab: 'cost',      label: '成本资料库', roles: ['admin', 'sales'],           icon: '📦' },
  { tab: 'profit',    label: '成本利润',   roles: ['admin'],                    icon: '💰' },
  { tab: 'picklist',  label: '领料单',     roles: ['admin', 'sales', 'factory'], icon: '📋' },
  { tab: 'history',   label: '历史记录',   roles: ['admin', 'sales'],           icon: '🕘' },
  { tab: 'settings',  label: '系统设置',   roles: ['admin', 'sales', 'factory'], icon: '⚙️' },
];
// 渲染时过滤：NAV_ITEMS.filter(item => item.roles.includes(currentUser.role))
```

`ActiveTab` 类型新增 `'picklist'`。工厂角色登录后默认 `activeTab = 'picklist'`。

### 4.6 `useLocalStorage.ts` 改造策略

V3 的 `useLocalStorage` 管理了多种状态，V4 中需要分流：

| V3 状态 | V4 去向 |
|---------|---------|
| `costDatabase` | 改为调 `cloudService.costDb.list()`，在组件内用 useState + useEffect 加载 |
| `historyRecords` | 改为调 `cloudService.calculation.list()` |
| `items` | 仍用本地 state（算料工作区临时数据，无需云端持久化） |
| `priceConfig` | 改为调 `cloudService.priceConfig.get()` |
| `aiSettings` | 移除前端存储（改为后端管理，前端不再持有 Key） |
| `clientName`/`orderName` | 仍用本地 state（工作区临时输入） |
| `showCosts` | 仍用 localStorage（UI 偏好） |

建议将 `useLocalStorage` 重构为 `useCloudData` hook，统一管理从云端加载的数据 + loading 状态。或者按职责拆分为多个小 hook（`useCostDb` / `usePriceConfig` / `useCalcHistory`），降低耦合。

---

## 5. 任务分解（T01–T08）

### T01: CloudBase 环境初始化 + 云函数脚手架

| 项 | 内容 |
|----|------|
| **描述** | 开通 CloudBase 环境，搭建云函数项目目录结构，编写公共鉴权工具，部署空壳云函数验证连通性 |
| **涉及文件** | 新建 `cloudfunctions/` 目录；`cloudfunctions/common/auth.js`（公共鉴权工具）；`cloudfunctions/common/db.js`（数据库访问封装）；6 个云函数的 `index.js` + `package.json` 骨架；前端新增 `.env` 文件含 `VITE_CLOUDBASE_ENV_ID`；新增 `src/services/cloudService.ts` 初始化骨架 |
| **改动点** | 1. 在腾讯云控制台开通 CloudBase，记录 envId；2. 创建 6 个云函数目录（ai-proxy/cost-database/price-config/auth-manage/calculation/share-order）；3. 编写公共 `verifyUser(event, context)` 工具：从 context 取 uid → 查 users 集合 → 返回 `{uid, role}`；4. 编写公共 `sendResponse(code, data, message)` 统一响应；5. 前端 `cloudService.ts` 初始化 cloudbase app + 封装 `callFunction` 通用方法；6. 在 `.env` 配置 envId |
| **验收标准** | 6 个云函数均可部署且能被前端调用返回 `{code:0}`；前端 `cloudService.init()` 不报错；登录态获取正常 |
| **依赖** | 无（首要任务） |

### T02: 用户认证 + 权限体系

| 项 | 内容 |
|----|------|
| **描述** | 实现 CloudBase 账密登录 + `auth-manage` 云函数完整逻辑 + 前端 `useAuth` 改造 + 角色动态导航 |
| **涉及文件** | `cloudfunctions/auth-manage/index.js`；`cloudfunctions/common/auth.js`；`src/hooks/useAuth.ts`；`src/components/auth/LoginForm.tsx`；`src/components/layout/Sidebar.tsx`；`src/App.tsx`；`src/types.ts`（UserAccount.role 加 factory） |
| **改动点** | 1. `auth-manage` 实现 `getProfile`/`list`/`create`/`update`/`delete`；2. `useAuth` 改为调 `cloudService.auth`，移除 localStorage/mock 逻辑；3. `LoginForm` 移除注册/快速登录，改为 CloudBase 登录；4. `Sidebar` 按角色动态渲染（含新增 picklist 入口）；5. 初始化时由管理员通过 `auth-manage.create` 建第一个 admin 账号 |
| **验收标准** | 账密登录成功；不同角色登录后侧边栏导航项不同；admin 可在设置页建销售/工厂账号；新建账号可登录 |
| **依赖** | T01 |

### T03: AI 代理云函数 + 前端调用改造

| 项 | 内容 |
|----|------|
| **描述** | 实现 `ai-proxy` 云函数（迁移 V3 `aiService.ts` 核心逻辑）；前端 AI 调用改走云函数；AI 配置管理（admin 可设置/测试，Key 存云数据库） |
| **涉及文件** | `cloudfunctions/ai-proxy/index.js`；`cloudfunctions/auth-manage/index.js`（新增 AI 配置管理 action，或单独 ai-settings 函数）；`src/services/cloudService.ts`（ai 模块）；`src/services/aiService.ts`（保留类型定义/常量，移除直连逻辑）；`src/hooks/useCalculation.ts`；`src/components/quote/InputPanel.tsx`；`src/components/settings/SettingsPanel.tsx`（AI 配置区块） |
| **改动点** | 1. 将 V3 `aiService.ts` 的 `callAIGeneric`/`callGemini`/`getAIHeaders`/`resolveEndpoint` 迁移到 `ai-proxy` 云函数；2. 云函数从 `ai_settings` 集合读配置；3. `cloudService.ai.parseOrder/parseCost/testConnection` 封装；4. `useCalculation` 中 `parseOrderWithAi` 改为调 `cloudService.ai`；5. SettingsPanel AI 配置改调 `cloudService.aiSettings`（apiKey 脱敏显示）；6. 移除前端 `aiSettings` localStorage 持久化 |
| **验收标准** | 销售/工厂无需配置任何 Key 即可用 AI 算料；admin 可在设置页配置/测试/保存 AI 供应商；前端网络请求中无 apiKey 明文出现 |
| **依赖** | T01、T02（需登录态） |

### T04: 成本资料库云端化

| 项 | 内容 |
|----|------|
| **描述** | 实现 `cost-database` 云函数；前端 `CostDatabasePanel` 改为调云端；销售只读 + 脱敏；管理员增删改 |
| **涉及文件** | `cloudfunctions/cost-database/index.js`；`src/services/cloudService.ts`（costDb 模块）；`src/components/cost/CostDatabasePanel.tsx`；`src/hooks/useCalculation.ts`（`handleCostFileUpload` 改走云端 AI 解析） |
| **改动点** | 1. `cost-database` 实现 `list`(角色脱敏)/`create`/`update`/`delete`/`batchImport`；2. `CostDatabasePanel` 数据源改 `cloudService.costDb.list()`；3. sales 模式隐藏增删改按钮 + materialCost 列；4. 批量导入文件上传改走 `cloudService.ai.parseCost` 再 `batchImport`；5. 移除前端 localStorage cost_db 持久化 |
| **验收标准** | admin 增删改成本记录后，其他用户刷新可见；sales 看不到 materialCost 列且无编辑按钮；factory 导航无成本库入口 |
| **依赖** | T01、T02、T03（批量导入依赖 AI 代理） |

### T05: 算料功能迁移（localStorage → 后端）

| 项 | 内容 |
|----|------|
| **描述** | 实现 `price-config` 云函数 + `calculation` 云函数；前端费率配置改云端读取；算料历史记录改云端存储 |
| **涉及文件** | `cloudfunctions/price-config/index.js`；`cloudfunctions/calculation/index.js`；`src/services/cloudService.ts`（priceConfig + calculation 模块）；`src/components/quote/PriceConfigCard.tsx`；`src/components/history/HistoryPanel.tsx`；`src/hooks/useLocalStorage.ts`（重构为 useCloudData 或拆分） |
| **改动点** | 1. `price-config` 实现 `get`(角色脱敏)/`update`；2. `calculation` 实现 `save`/`list`(权限隔离)/`get`/`delete`；3. `PriceConfigCard` 改为从云端加载 + admin 可编辑；4. `HistoryPanel` 改为 `cloudService.calculation.list()`；5. 算料工作区保存历史改调 `cloudService.calculation.save`；6. 移除前端 localStorage price_config / history 持久化 |
| **验收标准** | admin 修改费率后所有用户刷新可见；销售保存算料记录后可在历史中查看；admin 可查看所有用户的算料记录；sales 看不到 cost* 费率字段 |
| **依赖** | T01、T02 |

### T06: 领料单生成 + 分享功能

| 项 | 内容 |
|----|------|
| **描述** | 实现 `share-order` 云函数的 `create`/`listMine`/`listAll`/`revoke`；新增领料单生成组件 + 销售端列表 |
| **涉及文件** | `cloudfunctions/share-order/index.js`；`src/services/cloudService.ts`（shareOrder 模块）；`src/components/picklist/GeneratePickListModal.tsx`（新增）；`src/components/picklist/PickListPanel.tsx`（新增）；`src/components/quote/QuoteWorkspace.tsx`（新增「生成领料单」按钮）；`src/types.ts`（新增 ShareOrder 类型） |
| **改动点** | 1. `share-order.create` 生成 6 位分享码 + 7 天有效期 + 存 results 快照；2. `GeneratePickListModal` 实现 4 项数据授权勾选（默认：型材明细✓/费用明细✗/客户信息✓/简洁领料单✓）；3. `PickListPanel` 销售/管理员列表视图；4. `QuoteWorkspace` 完成算料后显示「生成领料单」按钮；5. 新增 `ShareOrder`/`SharePermissions` 类型定义 |
| **验收标准** | 销售算完料后可生成领料单并获 6 位分享码；4 项数据授权可独立勾选；销售可在列表查看自己生成的领料单；分享码 7 天后过期 |
| **依赖** | T05（需算料记录已云端化） |

### T07: 工厂端领料单查看

| 项 | 内容 |
|----|------|
| **描述** | 实现 `share-order.getByCode`/`listShared`；新增工厂端领料单查看组件 |
| **涉及文件** | `cloudfunctions/share-order/index.js`（补全 getByCode/listShared）；`src/services/cloudService.ts`（补全）；`src/components/picklist/PickListDetail.tsx`（新增）；`src/components/picklist/ShareCodeInput.tsx`（新增）；`src/components/layout/Sidebar.tsx`（工厂默认 tab=picklist） |
| **改动点** | 1. `getByCode` 校验有效期 + 按 permissions 过滤返回模块；2. `listShared` 返回所有未过期且 factory 可见的领料单；3. `PickListDetail` 按 permissions 渲染 4 模块，未授权显示「此部分内容未被分享」；4. `ShareCodeInput` 工厂端输入码入口；5. 工厂登录后默认进入领料单列表 |
| **验收标准** | 工厂输入有效分享码可查看领料单；未授权模块显示提示；过期码提示需重新生成；工厂列表可查看所有被分享的领料单 |
| **依赖** | T06 |

### T08: 集成测试 + 部署

| 项 | 内容 |
|----|------|
| **描述** | 全流程集成测试（三角色端到端）；前端构建部署到 CloudBase 静态托管；云端数据初始化（种子成本库 + 默认费率） |
| **涉及文件** | 全部；新增 `cloudfunctions/seed/init.js`（数据初始化脚本）；`vite.config.mjs`（构建配置确认）；`package.json`（新增部署脚本） |
| **改动点** | 1. 编写三角色端到端测试用例（admin 建号→配置 AI→设费率→建成本库；销售算料→生成领料单；工厂查看）；2. `npm run build` 构建前端；3. 部署 dist/ 到 CloudBase 静态托管；4. 运行 seed 脚本初始化默认 price_config + 种子 cost_records；5. 确认所有云函数生产环境配置 |
| **验收标准** | 三角色完整流程跑通；线上环境可访问；数据初始化完成；P0+P1 所有需求验收通过 |
| **依赖** | T02、T03、T04、T05、T06、T07 |

### 任务依赖关系图

```
T01 (环境+脚手架)
 ├─→ T02 (认证+权限)
 │    ├─→ T03 (AI 代理) ──┐
 │    ├─→ T04 (成本库) ←──┘ (批量导入依赖 AI)
 │    ├─→ T05 (算料迁移)
 │    │    └─→ T06 (领料单生成)
 │    │         └─→ T07 (工厂端查看)
 │    └────────────────→ T08 (集成测试) ← T03/T04/T05/T06/T07
 └─────────────────────→ T08
```

可并行：T03、T04、T05 在 T02 完成后可部分并行（T04 的批量导入需等 T03）。

---

## 6. 关键技术决策

### 6.1 CloudBase JS SDK 引入方式

**决策**: 前端通过 npm 包 `@cloudbase/js-sdk` 引入，在 `src/services/cloudService.ts` 中单例初始化。

```bash
npm install @cloudbase/js-sdk
```

```typescript
// cloudService.ts
import cloudbase from '@cloudbase/js-sdk';
const app = cloudbase.init({ env: import.meta.env.VITE_CLOUDBASE_ENV_ID });
export { app };
```

**理由**: npm 包管理规范，版本可控，Tree-shaking 友好。不使用 `<script>` CDN 方式（避免全局污染 + 版本不可控）。

### 6.2 云函数本地开发 + 部署流程

**决策**: 使用 **CloudBase CLI (`@cloudbase/cli`)** 进行本地开发与部署。

```bash
npm install -g @cloudbase/cli
cloudbase login              # 登录腾讯云
cloudbase functions:deploy ai-proxy    # 部署单个云函数
cloudbase functions:deploy --all       # 部署所有云函数
```

**项目结构**:
```
nova2/
├── cloudfunctions/
│   ├── common/              # 公共模块（不部署，被其他函数 require）
│   │   ├── auth.js          # 鉴权工具
│   │   └── db.js            # 数据库访问封装
│   ├── ai-proxy/
│   │   ├── index.js
│   │   └── package.json
│   ├── cost-database/...
│   ├── price-config/...
│   ├── auth-manage/...
│   ├── calculation/...
│   └── share-order/...
├── cloudbaserc.json         # CloudBase 配置（envId、函数配置）
└── src/                     # 前端代码
```

**`cloudbaserc.json` 示例**:
```json
{
  "envId": "your-env-id",
  "functions": [
    { "name": "ai-proxy", "timeout": 30, "runtime": "Nodejs16.13" },
    { "name": "cost-database", "timeout": 10 },
    { "name": "price-config", "timeout": 10 },
    { "name": "auth-manage", "timeout": 10 },
    { "name": "calculation", "timeout": 10 },
    { "name": "share-order", "timeout": 10 }
  ]
}
```

> **注意**: `ai-proxy` 云函数 timeout 设为 30s（AI 调用可能较慢），其他 10s 足够。

### 6.3 数据库权限规则配置策略

**决策**: 所有集合设为「仅管理端可读写」（即安全规则为 `false`，客户端 SDK 完全无法访问），**所有数据访问必须经云函数**。

**理由**:
1. 权限逻辑集中在云函数中，便于审计和维护
2. 避免 CloudBase 安全规则语法复杂导致的配置漏洞
3. 云函数以管理端身份访问 DB，可灵活实现细粒度权限（如销售脱敏读取）

在 CloudBase 控制台 → 数据库 → 选择集合 → 权限设置 → 选择「仅管理端可读写」。

### 6.4 AI Key 存储方案（对用户决策的细化）

**用户决策**: 「API Key 统一存后端云函数环境变量，前端用户不可见」

**架构细化决策**: 将 AI 供应商配置（含 apiKey）存入 `ai_settings` **云数据库集合**，而非云函数环境变量。`ai-proxy` 云函数运行时从数据库读取配置。

**理由**:
1. 环境变量修改需重新部署云函数，管理员无法通过 UI 实时管理（PRD P0-4 要求「管理员可在后台管理配置」）
2. 数据库存储可实现 UI 实时增删改 + 测试连接，体验与 V3 一致
3. 安全目标完全达成：apiKey 仅在云函数服务端使用，前端通过 `auth-manage` 获取配置时返回**脱敏值**（`***abcd`），`ai-proxy` 调用时读明文，前端零接触
4. 多供应商配置（10 家）结构化存储在 DB 比环境变量更清晰

**安全补偿措施**:
- `ai_settings` 集合权限设为「仅管理端」
- 前端获取 AI 配置列表的接口强制脱敏 apiKey
- 仅 `ai-proxy` 云函数读取明文 apiKey

> 若用户坚持使用环境变量，可作为 bootstrap 初始值（首次部署时 env var 注入默认配置 → 写入 DB → 后续通过 UI 管理）。两种方式可共存。

### 6.5 前端环境变量管理

**决策**: 使用 Vite 的 `.env` 文件管理环境变量。

```bash
# .env.local （git 忽略）
VITE_CLOUDBASE_ENV_ID=your-env-id-prod
```

```typescript
// 代码中访问
const envId = import.meta.env.VITE_CLOUDBASE_ENV_ID;
```

**暴露给前端的变量**（以 `VITE_` 前缀）:
- `VITE_CLOUDBASE_ENV_ID` — CloudBase 环境 ID

**不暴露给前端的敏感信息**: AI apiKey（存云数据库）、数据库凭证（CloudBase 内部管理）

### 6.6 角色值定义

**决策**: V4 内部角色值使用 `admin` / `sales` / `factory`（V3 的 `operator` 统一改为 `factory`）。

**理由**: V4 是全新云端系统，用户由管理员重建（PRD Q3 确认云端重建），无历史数据迁移负担。`factory` 语义更清晰，与 UI 显示「工厂」一致。

**改动点**: `types.ts` 中 `UserAccount.role` 类型从 `'admin' | 'sales' | 'operator'` 改为 `'admin' | 'sales' | 'factory'`。

---

## 7. 风险评估与缓解措施

| 风险 | 等级 | 影响 | 缓解措施 |
|------|------|------|----------|
| **CloudBase 环境未开通** | 🔴 高 | 阻塞 T01 所有后端工作 | 尽早确认用户腾讯云账号状态；提供开通指引文档；T01 前先验证 envId 可用 |
| **AI 调用延迟/超时** | 🟡 中 | 云函数 timeout，用户等待久 | `ai-proxy` timeout 设 30s；前端 loading 动画；AI 返回异常时友好提示重试 |
| **分享码碰撞** | 🟢 低 | 6 位码空间 ~21 亿，初期碰撞概率极低 | 生成时查 DB 校验唯一，碰撞则重新生成（最多 3 次） |
| **API Key 泄露到前端** | 🔴 高 | 安全事故 | 1. `ai_settings` 集合仅管理端；2. 前端获取配置接口强制脱敏；3. 代码 review 检查云函数返回不含 apiKey 明文 |
| **成本数据对销售泄露** | 🟡 中 | 销售看到材料底价 | 1. `cost-database.list` 云函数内对 sales 角色移除 materialCost 字段；2. `price-config.get` 对 sales 移除 cost* 字段；3. 前端组件也做隐藏（双保险） |
| **云函数冷启动延迟** | 🟡 中 | 首次调用慢（1-2s） | CloudBase 可配置预留实例（高级版）；前端 loading 提示；非实时操作可接受 |
| **CloudBase 用户管理 API 权限** | 🟡 中 | `auth-manage` 建号失败 | 需在 CloudBase 控制台开启「云函数调用管理 API」或使用 Server SDK admin 模式；T02 中优先验证此能力 |
| **V3→V4 用户习惯断裂** | 🟢 低 | 销售/工厂需重新登录 | 1. 保留 V3 视觉风格降低学习成本；2. 管理员建号时统一通知新密码；3. V3 数据不迁移（PRD Q3） |
| **领料单数据冗余一致性** | 🟢 低 | 算料记录修改后分享的快照不同步 | 设计上 `share_orders.results` 是生成时的快照，**不随源数据变化**（符合业务：分享的是当时的领料单） |
| **并发写入 price_config** | 🟢 低 | 多 admin 同时改费率 | 单文档 + `updatedAt` 最后写入胜出；UI 提示「配置已更新请刷新」 |

---

## 附录 A: V4 类型定义补充（`types.ts` 新增）

```typescript
// V4 角色值（替换 V3 的 operator）
export type Role = 'admin' | 'sales' | 'factory';

// 更新 UserAccount.role
export interface UserAccount {
  uid: string;              // 🆕 CloudBase uid
  username: string;
  role: Role;
  displayName: string;
  avatarColor: string;
  createdAt: string;
}

// 🆕 V4 领料单分享权限
export interface SharePermissions {
  profileCutting: boolean;   // 型材切割明细
  costDetail: boolean;        // 费用成本明细
  clientInfo: boolean;        // 客户/订单信息
  simpleList: boolean;        // 简洁领料单
}

// 🆕 V4 领料单/分享记录
export interface ShareOrder {
  id: string;
  shareCode: string;          // 6 位
  ownerUid: string;
  ownerDisplayName: string;
  clientName: string;
  orderName: string;
  orderDate: string;
  calculationId: string;
  results: GroupResult[];     // 快照
  permissions: SharePermissions;
  expiresAt: string;          // ISO
  revoked: boolean;
  createdAt: string;
}

// 🆕 V4 ActiveTab 新增 picklist
export type ActiveTab = 'quote' | 'cost' | 'history' | 'settings' | 'profit' | 'picklist';
```

---

## 附录 B: 云函数统一响应格式约定

```javascript
// 成功
{ code: 0, data: { ... }, message: 'OK' }

// 业务错误（未登录）
{ code: 401, data: null, message: '未登录' }

// 权限不足
{ code: 403, data: null, message: '无权限执行此操作' }

// 参数错误
{ code: 400, data: null, message: '缺少必要参数: xxx' }

// 服务器错误
{ code: 500, data: null, message: 'AI 调用失败: xxx' }
```

前端 `cloudService.ts` 统一处理：`code !== 0` 时抛出 `Error(message)`，调用方 try-catch。

---

*文档完。如需调整任何设计决策，请与架构师 高见远 沟通。*

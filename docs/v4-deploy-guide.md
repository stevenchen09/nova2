# Nova2 V4 CloudBase 部署指南

## 已完成
- ✅ 代码全部写好（6 云函数 + 前端）
- ✅ 前端构建成功（545 模块）
- ✅ .env 已填入环境 ID: `tnt-2xt47gjle`
- ✅ cloudbaserc.json 已填入环境 ID
- ✅ CloudBase 环境已开通
- ✅ 6 个数据库集合已创建
- ✅ admin 用户已创建（UID: 2076601930562420737）

## 你需要做的（3 步）

### 第 1 步：安装 CloudBase CLI

打开 **Windows 终端**（不是 WorkBuddy），执行：

```bash
npm install -g @cloudbase/cli
```

### 第 2 步：登录腾讯云

```bash
cloudbase login
```

会自动打开浏览器，用你的腾讯云账号扫码/登录授权。

### 第 3 步：一键部署全部

进入项目目录后执行：

```bash
cd C:\codefils\nova2

# 部署全部云函数（6个）
cloudbase functions:deploy --all --envId tnt-2xt47gjle

# 部署前端到静态托管
cloudbase hosting:deploy ./dist --envId tnt-2xt47gjle
```

## 部署后验证

1. 打开 CloudBase 控制台 → 云函数 → 确认 6 个函数都在
2. 打开 CloudBase 控制台 → 静态网站托管 → 查看域名
3. 用浏览器打开静态托管域名
4. 用 admin / H137136b 登录

## 如果 CLI 部署失败（备选方案）

### 手动部署云函数（控制台上传）

对每个云函数目录执行：
1. CloudBase 控制台 → 云函数 → 新建云函数
2. 函数名填对应名称（如 `ai-proxy`）
3. 运行时选 Node.js 16
4. 执行超时设 30 秒（ai-proxy）或 10 秒（其他）
5. 上传代码：把 `cloudfunctions/ai-proxy/` 目录打包成 zip 上传
6. 重复 6 次

6 个函数名：
- `ai-proxy`（超时 30s）
- `auth-manage`（超时 10s）
- `cost-database`（超时 10s）
- `price-config`（超时 10s）
- `calculation`（超时 10s）
- `share-order`（超时 10s）

### 手动部署前端

1. CloudBase 控制台 → 静态网站托管 → 文件管理
2. 上传 `dist/` 目录下的所有文件
3. 访问静态托管域名


export enum SizeType {
  OD = '外径',
  ID = '内径'
}

export enum PricingMode {
  RETAIL = '零散单(按周长)',
  BATCH = '批量单(按整料)'
}

/**
 * 支持的 AI 供应商（V3 扩展：覆盖国内主流大模型）
 */
export type AIProvider =
  | 'deepseek'
  | 'gemini'
  | 'openai'
  | 'qwen'        // 通义千问 DashScope
  | 'ernie'       // 文心一言 百度
  | 'zhipu'       // 智谱 GLM
  | 'moonshot'    // 月之暗面 Kimi
  | 'baichuan'    // 百川
  | 'doubao'      // 豆包 字节跳动
  | 'yi';         // 零一万物

/**
 * 单个 AI 供应商配置项（V3 多供应商架构）
 */
export interface AIProviderConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;      // API Base URL（可自定义，带默认值）
  model: string;        // 模型名称
  enabled: boolean;     // 是否启用
}

/**
 * 多供应商配置存储（V3 新增）
 *
 * 替代旧版 AiSettings 单一 provider 结构，
 * 支持用户同时配置多个供应商并切换使用。
 */
export interface AISettings {
  providers: AIProviderConfig[];
  activeProvider: AIProvider;
}

/**
 * 颜色单价复用规则（源颜色复用目标颜色的成本单价）
 */
export interface ColorReuseRule {
  sourceColor: string;   // 源颜色名（如"哑银"）
  targetColor: string;   // 目标颜色名（如"哑黑"）
}

/**
 * 全局报价/费率配置（V3 双轨制重构版）
 *
 * 变更说明：
 * - V2 的 global* 字段重命名为 quote*（报价费率），语义更清晰
 * - 新增 cost* 成本费率字段（内部核算用）
 * - 报价区和成本利润面板分别使用不同的费率体系
 */
export interface PriceConfig {
  materialPrice: number;              // 元/米 (材料报价单价)
  mode: PricingMode;                  // 批量单 / 零散单

  // === 报价费率（对外报价用） ===
  // V3: 原 global* → quote* 重命名
  quoteAccessoryPrice: number;        // 元/套 (报价配件单价)
  quoteCuttingFee: number;            // 元/米 (报价切割单价，按总切割长度计费)
  quoteTaxRate: number;               // 如 0.13 表示 13% 税率 (0=无税)

  // === 成本费率（内部核算用）🆕 ===
  costAccessoryPrice: number;         // 元/套 (成本配件单价)
  costCuttingFee: number;             // 元/米 (成本切割单价)
  costTaxRate: number;                // 如 0.13 表示 13% 税率

  // === 重量默认值 ===
  defaultWeightPerMeter: number;            // kg/m 默认线密度
  defaultWeightPerAccessorySet?: number;    // kg/套 配件重量

  // === 颜色单价复用规则 🆕 ===
  colorReuseRules: ColorReuseRule[];  // 颜色单价复用规则
}

/**
 * @deprecated 使用 AISettings 替代。保留此类型仅用于旧数据迁移兼容。
 */
export interface AiSettings {
  provider: 'gemini' | 'deepseek' | 'openai';
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * 单个框型条目（用户输入的原始尺寸）
 */
export interface FrameItem {
  id: string;
  model: string;
  color: string;
  sizeType: SizeType;
  width: number;  // CM
  height: number; // CM
  quantity: number;
}

/**
 * 报价清单行项目
 */
export interface QuotationLineItem {
  id: string;
  model: string;
  color: string;
  size: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
}

/** 计算出的单条边 */
export interface CalculatedEdge {
  length: number; // M
  sourceId: string;
  description: string;
}

/** 单支原料排料方案 */
export interface BarPlan {
  totalUsableLength: number;
  segments: CalculatedEdge[];
  remaining: number;
}

/** 单个排料算法的统计信息 */
export interface AlgorithmStat {
  barCount: number;
  remainingTotal: number;
}

/** 排料算法对比结果 */
export interface PackingComparison {
  ffd: AlgorithmStat;
  opt: AlgorithmStat;    // Optimal（DP 背包 + 最长边优先）
  global: AlgorithmStat; // GLB（全局套裁：切割模式枚举 + 整数规划）
  selected: 'FFD' | 'OPT' | 'GLB';
}

/**
 * 分组计算结果（同一型号+颜色的合并结果）
 *
 * V2 新增字段：totalCuttingLength, taxCost, actualWeightPerMeter, priceSource
 * V3 双轨制新增字段（T04）：costAccessoryCost, costCuttingCost, costTaxCost, costGrandTotal
 */
export interface GroupResult {
  model: string;
  color: string;
  totalBars: number;
  plans: BarPlan[];
  originalItems: FrameItem[];
  lineItems: QuotationLineItem[];
  // 报价结果
  totalPrice: number;
  unitPrice: number;           // 平均单价
  totalQuantity: number;
  // 明细数据用于显示
  avgMetersPerFrame: number;
  // 重量结果 (可选)
  totalWeight?: number;
  materialWeight?: number;
  accessoryWeight?: number;
  // 报价轨道成本（使用 quote* 费率）
  totalCost?: number;
  materialCost?: number;
  costMaterial?: number;       // 🆕 实际材料单价(元/米)，来自成本库或估算，用于显示层直接取用
  accessoryCost?: number;      // quoteAccessoryPrice 计算
  cuttingCost?: number;        // quoteCuttingFee 计算
  profit?: number;             // 🆕 V3-T04: 真实毛利 = totalPrice - costGrandTotal
  profitMargin?: number;       // 🆕 V3-T04: 真实利润率
  taxCost?: number;            // quoteTaxRate 计算
  // ---- V3-T04 🆕 成本轨道（使用 cost* 费率）----
  costAccessoryCost?: number;   // costAccessoryPrice 计算的配件成本
  costCuttingCost?: number;     // costCuttingFee 计算的切工成本
  costTaxCost?: number;         // costTaxRate 计算的税金
  costGrandTotal?: number;      // 成本轨道总计 = material + costAccessory + costCutting + costTax
  // ---- V2 新增字段 ----
  totalCuttingLength?: number;     // 总切割长度(米)
  actualWeightPerMeter?: number;   // 实际使用的线密度 kg/m
  priceSource?: 'exact' | 'reuse' | 'model-fallback'; // 查价来源标记
  packingComparison?: PackingComparison;     // 🆕 排料算法对比结果（FFD vs OPT vs GLB）
}

/**
 * 成本资料库记录（V2 重构版）
 *
 * 变更说明：
 * - 新增 weightPerMeter 字段（型材线密度 kg/m）
 * - 删除 accessoryCost 和 cuttingCost 字段（配件/切工改为全局统一费率）
 */
export interface CostRecord {
  id: string;
  model: string;
  color: string;
  materialCost: number;    // 元/米 (材料底价)
  weightPerMeter: number;  // kg/m (型材线密度)
  notes?: string;
  updatedAt: string;
}

/**
 * 历史报价记录
 */
export interface HistoryRecord {
  id: string;
  clientName: string;
  orderName: string;
  createdAt: string;
  items: FrameItem[];
  priceConfig: PriceConfig;
  results: GroupResult[];
  totalQuotePrice: number;
  totalCostPrice: number;
  profit: number;
  profitMargin: number;
  notes?: string;
}

/** 成本费率覆盖值（per-quote 级别临时覆盖） */
export interface CostOverride {
  costAccessoryPrice: number;  // 元/套
  costCuttingFee: number;      // 元/个
  costTaxRate: number;         // 纯税率（如 0.13）
}

/** 用户账户信息 */
export interface UserAccount {
  uid: string;              // 🆕 V4: CloudBase 认证 uid
  username: string;
  role: Role;
  displayName: string;
  avatarColor: string;
  password?: string;
  createdAt: string;
}

/** V4 角色值（替换 V3 的 operator → factory） */
export type Role = 'admin' | 'sales' | 'factory';

/** Navigation tab identifiers (V4: 新增 'picklist') */
export type ActiveTab = 'quote' | 'cost' | 'history' | 'settings' | 'profit' | 'picklist';

/**
 * V4 领料单分享权限（4 项独立授权模块）
 */
export interface SharePermissions {
  profileCutting: boolean;   // 型材切割明细
  costDetail: boolean;       // 费用成本明细
  clientInfo: boolean;       // 客户/订单信息
  simpleList: boolean;       // 简洁领料单
}

/**
 * V4 领料单 / 分享记录
 */
export interface ShareOrder {
  id: string;
  shareCode: string;          // 6 位分享码
  ownerUid: string;
  ownerDisplayName: string;
  clientName: string;
  orderName: string;
  orderDate: string;
  calculationId: string;
  results: GroupResult[];     // 快照（冗余存储，避免算料记录删除后分享失效）
  permissions: SharePermissions;
  expiresAt: string;          // ISO（now + 7天）
  revoked: boolean;
  createdAt: string;
}

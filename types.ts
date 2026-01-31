
export enum SizeType {
  OD = '外径',
  ID = '内径'
}

export enum PricingMode {
  RETAIL = '零散单(按周长)',
  BATCH = '批量单(按整料)'
}

export interface PriceConfig {
  materialPrice: number; // 元/米
  accessoryPrice: number; // 元/个
  cuttingFee: number; // 元/个
  taxRate: number; // 例如 1.13 表示 13% 税，1.0 表示无税
  mode: PricingMode;
}

export interface FrameItem {
  id: string;
  model: string;
  color: string;
  sizeType: SizeType;
  width: number; // CM
  height: number; // CM
  quantity: number;
}

export interface QuotationLineItem {
  id: string;
  model: string;
  color: string;
  size: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
}

export interface CalculatedEdge {
  length: number; // M
  sourceId: string;
  description: string;
}

export interface BarPlan {
  totalUsableLength: number;
  segments: CalculatedEdge[];
  remaining: number;
}

export interface GroupResult {
  model: string;
  color: string;
  totalBars: number;
  plans: BarPlan[];
  originalItems: FrameItem[];
  lineItems: QuotationLineItem[];
  // 报价结果
  totalPrice: number;
  unitPrice: number; // 平均单价
  totalQuantity: number;
  // 明细数据用于显示
  avgMetersPerFrame: number;
}

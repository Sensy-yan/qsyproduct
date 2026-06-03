export type JobStatus =
  | "pending"
  | "bootstrapping"
  | "scraping"
  | "awaiting_human" // 验证码需人工介入
  | "done"
  | "failed";

export interface Merchant {
  shopUuid: string;
  name: string;
  category: string;
  address: string;
  city: string;
  sourceUrl: string;
  scrapedAt: number; // epoch ms,由编排层注入
}

export interface Deal {
  dealId: string;
  shopUuid: string;
  title: string;
  price: number;
  marketPrice: number;
  salesCount: number;
  validFrom: number | null;
  validTo: number | null;
  category: string;
  rawJson: string;
}

export interface DealItem {
  dealId: string;
  name: string;
  qty: number;
  spec: string;
  stepOrder: number; // 服务步骤顺序;非步骤型为 0
  duration: string; // 如 "40分钟";无则空串
}

export type RuleType =
  | "booking" // 预约方式
  | "refund" // 退款规则
  | "usable_time" // 使用时间
  | "applicable_shop" // 适用门店
  | "notice"; // 其他购买须知

export interface DealRule {
  dealId: string;
  ruleType: RuleType;
  text: string;
}

export interface Review {
  dealId: string | null;
  shopUuid: string;
  rating: number;
  text: string;
  userMasked: string;
  reviewDate: number | null;
}

export interface Session {
  headers: Record<string, string>;
  shopUuid: string;
}

export interface ScrapeResult {
  merchant: Merchant;
  deals: Deal[];
  items: DealItem[];
  rules: DealRule[];
  reviews: Review[];
}

export interface Env {
  DB: D1Database;
  RAW: R2Bucket;
  BROWSER: Fetcher;
}

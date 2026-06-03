import type { Deal, DealItem, DealRule, Review, RuleType } from "../types";

/** 用户昵称脱敏:保留首尾,中间用单个 * 替换;2 字保留首字 + *。 */
export function maskUser(name: string): string {
  if (name.length <= 1) return name;
  if (name.length === 2) return name[0] + "*";
  return name[0] + "*" + name[name.length - 1];
}

// 安全取值助手:按路径读取,缺失返回默认值。
function num(v: unknown, d = 0): number { const n = Number(v); return Number.isFinite(n) ? n : d; }
function str(v: unknown, d = ""): string { return v == null ? d : String(v); }

export function normalizeDealList(raw: unknown, shopUuid: string): Deal[] {
  // RECON: 列表数组路径,例如 (raw as any).data.dealList
  const list = ((raw as any)?.data?.dealList ?? []) as any[];
  return list.map((d) => ({
    dealId: str(d.dealId ?? d.id),            // RECON: 团单ID字段
    shopUuid,
    title: str(d.title),                       // RECON
    price: num(d.price),                       // RECON(若加密:此处接 decodeWithMap 后再 Number)
    marketPrice: num(d.marketPrice ?? d.originPrice), // RECON
    salesCount: num(d.sales ?? d.soldCount),   // RECON
    validFrom: d.validFrom ? num(d.validFrom) : null, // RECON
    validTo: d.validTo ? num(d.validTo) : null,       // RECON
    category: str(d.category),                 // RECON
    rawJson: JSON.stringify(d),
  }));
}

export function normalizeDealDetail(raw: unknown, dealId: string): { items: DealItem[]; rules: DealRule[] } {
  const data = (raw as any)?.data ?? {};
  // RECON: 套餐明细数组路径,例如 data.contents / data.menu
  const items: DealItem[] = ((data.contents ?? []) as any[]).map((it, idx) => ({
    dealId,
    name: str(it.name),       // RECON
    qty: num(it.count, 1),    // RECON
    spec: str(it.spec),       // RECON
    stepOrder: num(it.stepOrder, idx), // RECON:服务步骤型团单的顺序;非步骤型用数组下标
    duration: str(it.duration),        // RECON
  }));
  // RECON: 规则文本来源(购买须知/退款/预约/使用时间/适用门店)
  const ruleSources: Array<[RuleType, unknown]> = [
    ["booking", data.bookingRule],
    ["refund", data.refundRule],
    ["usable_time", data.usableTime],
    ["applicable_shop", data.applicableShops],
    ["notice", data.notice],
  ];
  const rules: DealRule[] = ruleSources
    .filter(([, v]) => v != null && str(v) !== "")
    .map(([ruleType, v]) => ({ dealId, ruleType, text: str(v) }));
  return { items, rules };
}

export function normalizeReviews(raw: unknown, shopUuid: string): Review[] {
  // RECON: 评价数组路径
  const list = ((raw as any)?.data?.reviews ?? []) as any[];
  return list.map((r) => ({
    dealId: r.dealId ? str(r.dealId) : null, // RECON
    shopUuid,
    rating: num(r.star ?? r.rating),         // RECON
    text: str(r.reviewBody ?? r.content),    // RECON
    userMasked: maskUser(str(r.userName ?? r.author)), // RECON
    reviewDate: r.addTime ? num(r.addTime) : null,     // RECON
  }));
}

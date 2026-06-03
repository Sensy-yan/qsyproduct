import { describe, it, expect } from "vitest";
import dealList from "./fixtures/deal-list.json";
import dealDetail from "./fixtures/deal-detail.json";
import reviews from "./fixtures/reviews.json";
import { normalizeDealList, normalizeDealDetail, normalizeReviews, maskUser } from "../src/parse/normalize";

describe("normalize", () => {
  it("从列表响应解析出团单", () => {
    const deals = normalizeDealList(dealList as unknown, "shop1");
    expect(deals.length).toBeGreaterThan(0);
    expect(deals[0]).toMatchObject({ shopUuid: "shop1" });
    expect(typeof deals[0].dealId).toBe("string");
    expect(typeof deals[0].price).toBe("number");
  });

  it("从详情响应解析出套餐明细与规则", () => {
    const { items, rules } = normalizeDealDetail(dealDetail as unknown, "deal1");
    expect(items.every((i) => i.dealId === "deal1")).toBe(true);
    expect(items.length).toBeGreaterThan(0);
    expect(rules.some((r) => r.ruleType === "refund")).toBe(true);
  });

  it("评价用户脱敏", () => {
    expect(maskUser("张三丰")).toBe("张*丰");
    expect(maskUser("ab")).toBe("a*");
    const rs = normalizeReviews(reviews as unknown, "shop1");
    expect(rs.length).toBeGreaterThan(0);
    expect(rs.every((r) => r.userMasked.length <= 1 || r.userMasked.includes("*"))).toBe(true);
  });
});

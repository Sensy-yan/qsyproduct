import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { upsertMerchant, upsertDeals, getMerchant, getDeals } from "../src/db/repo";
import type { Merchant, Deal } from "../src/types";

const M: Merchant = {
  shopUuid: "shop1", name: "测试店", category: "美容", address: "X路1号",
  city: "上海", sourceUrl: "https://e.dianping.com/shop1", scrapedAt: 1000,
};
const D: Deal = {
  dealId: "deal1", shopUuid: "shop1", title: "面部护理", price: 99,
  marketPrice: 199, salesCount: 12, validFrom: null, validTo: null,
  category: "美容", rawJson: "{}",
};

describe("repo", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM merchant; DELETE FROM deal;");
  });

  it("upsert 并读回商家", async () => {
    await upsertMerchant(env.DB, M);
    expect(await getMerchant(env.DB, "shop1")).toMatchObject({ name: "测试店", city: "上海" });
  });

  it("重复 upsert deal 不产生重复行(幂等)", async () => {
    await upsertDeals(env.DB, [D]);
    await upsertDeals(env.DB, [{ ...D, salesCount: 20 }]);
    const deals = await getDeals(env.DB, "shop1");
    expect(deals).toHaveLength(1);
    expect(deals[0].salesCount).toBe(20);
  });
});

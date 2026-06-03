import { describe, it, expect, beforeEach } from "vitest";
import { createDb, applySchema, type Db } from "../src/db/sqlite";
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
  let db: Db;
  beforeEach(() => { db = createDb(":memory:"); applySchema(db); });

  it("upsert 并读回商家", async () => {
    await upsertMerchant(db, M);
    expect(await getMerchant(db, "shop1")).toMatchObject({ name: "测试店", city: "上海" });
  });

  it("重复 upsert deal 不产生重复行(幂等)", async () => {
    await upsertDeals(db, [D]);
    await upsertDeals(db, [{ ...D, salesCount: 20 }]);
    const deals = await getDeals(db, "shop1");
    expect(deals).toHaveLength(1);
    expect(deals[0].salesCount).toBe(20);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { createDb, applySchema, type Db } from "../src/db/sqlite";
import { getDealProcess, getItemsByShop, getRulesByShop } from "../src/db/repo";

describe("service process repo", () => {
  let db: Db;
  beforeEach(async () => {
    db = createDb(":memory:"); applySchema(db);
    await db.exec("INSERT INTO deal (deal_id,shop_uuid,title) VALUES ('d1','s1','护理')");
    await db.exec("INSERT INTO deal_item (deal_id,name,qty,spec,step_order,duration) VALUES ('d1','洁面',1,'标准',1,'20分钟'),('d1','按摩',1,'',2,'30分钟')");
    await db.exec("INSERT INTO deal_rule (deal_id,rule_type,text) VALUES ('d1','refund','支持随时退'),('d1','booking','需提前预约')");
  });

  it("getDealProcess 按步骤序返回 items 和 rules", async () => {
    const { items, rules } = await getDealProcess(db, "d1");
    expect(items.map((i: any) => i.name)).toEqual(["洁面", "按摩"]);
    expect(rules).toHaveLength(2);
  });

  it("getItemsByShop / getRulesByShop 按店聚合", async () => {
    expect(await getItemsByShop(db, "s1")).toHaveLength(2);
    expect(await getRulesByShop(db, "s1")).toHaveLength(2);
  });
});

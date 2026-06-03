import { describe, it, expect, beforeEach } from "vitest";
import { createDb, applySchema, type Db } from "../src/db/sqlite";
import { createApp } from "../src/index";

describe("UI", () => {
  let db: Db;
  beforeEach(() => { db = createDb(":memory:"); applySchema(db); });
  const make = () => createApp({ db, startScrape: () => {} });

  it("GET / 返回 HTML 页面", async () => {
    const res = await make().request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<form");
    expect(html).toContain("/jobs");
  });

  it("GET /merchants/:shopUuid/deals 返回团单 JSON", async () => {
    await db.exec("INSERT INTO merchant (shop_uuid,name) VALUES ('s1','店')");
    await db.exec("INSERT INTO deal (deal_id,shop_uuid,title,price,sales_count) VALUES ('d1','s1','护理',99,5)");
    const res = await make().request("/merchants/s1/deals");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json() as { deals: Array<{ title: string }> };
    expect(body.deals).toHaveLength(1);
    expect(body.deals[0].title).toBe("护理");
  });

  it("GET /deals/:dealId/process 返回服务流程", async () => {
    await db.exec("INSERT INTO deal_item (deal_id,name,step_order) VALUES ('d1','洁面',1)");
    await db.exec("INSERT INTO deal_rule (deal_id,rule_type,text) VALUES ('d1','refund','支持退')");
    const res = await make().request("/deals/d1/process");
    const body = await res.json() as { items: unknown[]; rules: unknown[] };
    expect(body.items).toHaveLength(1);
    expect(body.rules).toHaveLength(1);
  });

  it("服务步骤 / 履约规则 CSV 导出", async () => {
    await db.exec("INSERT INTO deal (deal_id,shop_uuid,title) VALUES ('d1','s1','护理')");
    await db.exec("INSERT INTO deal_item (deal_id,name,step_order) VALUES ('d1','洁面',1)");
    await db.exec("INSERT INTO deal_rule (deal_id,rule_type,text) VALUES ('d1','refund','支持退')");
    const app = make();
    expect(await (await app.request("/export/s1/items.csv")).text()).toContain("洁面");
    expect(await (await app.request("/export/s1/rules.csv")).text()).toContain("支持退");
  });
});

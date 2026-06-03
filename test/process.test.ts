import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { getDealProcess, getItemsByShop, getRulesByShop } from "../src/db/repo";

describe("service process", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM deal; DELETE FROM deal_item; DELETE FROM deal_rule;");
    await env.DB.exec("INSERT INTO deal (deal_id,shop_uuid,title) VALUES ('d1','s1','护理')");
    await env.DB.exec("INSERT INTO deal_item (deal_id,name,qty,spec,step_order,duration) VALUES ('d1','洁面',1,'标准',1,'20分钟'),('d1','按摩',1,'',2,'30分钟')");
    await env.DB.exec("INSERT INTO deal_rule (deal_id,rule_type,text) VALUES ('d1','refund','支持随时退'),('d1','booking','需提前预约')");
  });

  it("getDealProcess 按步骤序返回 items 和 rules", async () => {
    const { items, rules } = await getDealProcess(env.DB, "d1");
    expect(items.map((i: any) => i.name)).toEqual(["洁面", "按摩"]);
    expect(rules).toHaveLength(2);
  });

  it("getItemsByShop / getRulesByShop 按店聚合", async () => {
    expect(await getItemsByShop(env.DB, "s1")).toHaveLength(2);
    expect(await getRulesByShop(env.DB, "s1")).toHaveLength(2);
  });

  it("GET /deals/:dealId/process 返回 JSON", async () => {
    const res = await SELF.fetch("https://x/deals/d1/process");
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[]; rules: unknown[] };
    expect(body.items).toHaveLength(2);
    expect(body.rules).toHaveLength(2);
  });

  it("GET /export/:shop/items.csv 与 rules.csv", async () => {
    const it = await SELF.fetch("https://x/export/s1/items.csv");
    expect(it.headers.get("content-type")).toContain("text/csv");
    expect(await it.text()).toContain("洁面");
    const ru = await SELF.fetch("https://x/export/s1/rules.csv");
    expect(await ru.text()).toContain("支持随时退");
  });
});

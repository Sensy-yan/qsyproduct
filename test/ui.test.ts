import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";

describe("UI", () => {
  beforeEach(async () => { await env.DB.exec("DELETE FROM merchant; DELETE FROM deal;"); });

  it("GET / 返回 HTML 页面", async () => {
    const res = await SELF.fetch("https://x/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<form");
    expect(html).toContain("/jobs");
  });

  it("GET /merchants/:shopUuid/deals 返回团单 JSON", async () => {
    await env.DB.exec("INSERT INTO merchant (shop_uuid,name) VALUES ('s1','店')");
    await env.DB.exec("INSERT INTO deal (deal_id,shop_uuid,title,price,sales_count) VALUES ('d1','s1','护理',99,5)");
    const res = await SELF.fetch("https://x/merchants/s1/deals");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json() as { deals: Array<{ title: string }> };
    expect(body.deals).toHaveLength(1);
    expect(body.deals[0].title).toBe("护理");
  });
});

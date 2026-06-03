import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";

describe("HTTP API", () => {
  beforeEach(async () => { await env.DB.exec("DELETE FROM job;"); });

  it("POST /jobs 缺 url 返回 400", async () => {
    const res = await SELF.fetch("https://x/jobs", { method: "POST", body: JSON.stringify({}) });
    expect(res.status).toBe(400);
  });

  it("GET /jobs/:id 不存在返回 404", async () => {
    const res = await SELF.fetch("https://x/jobs/nope");
    expect(res.status).toBe(404);
  });

  it("GET /export/:shopUuid.csv 返回 CSV content-type", async () => {
    await env.DB.exec("INSERT INTO merchant (shop_uuid,name) VALUES ('s1','店')");
    await env.DB.exec("INSERT INTO deal (deal_id,shop_uuid,title,price) VALUES ('d1','s1','护理',99)");
    const res = await SELF.fetch("https://x/export/s1.csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(await res.text()).toContain("护理");
  });
});

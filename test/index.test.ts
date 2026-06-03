import { describe, it, expect, beforeEach } from "vitest";
import { createDb, applySchema, type Db } from "../src/db/sqlite";
import { createApp } from "../src/index";

describe("HTTP API", () => {
  let db: Db;
  beforeEach(() => { db = createDb(":memory:"); applySchema(db); });

  it("POST /jobs 缺 url 返回 400", async () => {
    const app = createApp({ db, startScrape: () => {} });
    const res = await app.request("/jobs", { method: "POST", body: JSON.stringify({}), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(400);
  });

  it("GET /jobs/:id 不存在返回 404", async () => {
    const app = createApp({ db, startScrape: () => {} });
    const res = await app.request("/jobs/nope");
    expect(res.status).toBe(404);
  });

  it("POST /jobs 有 url 返回 jobId 并触发 startScrape", async () => {
    let calledUrl = "";
    const app = createApp({ db, startScrape: (_id, url) => { calledUrl = url; } });
    const res = await app.request("/jobs", { method: "POST", body: JSON.stringify({ url: "u1" }), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(200);
    const body = await res.json() as { jobId: string };
    expect(body.jobId).toBeTruthy();
    expect(calledUrl).toBe("u1");
  });

  it("GET /export/:shopUuid.csv 返回 CSV", async () => {
    await db.exec("INSERT INTO merchant (shop_uuid,name) VALUES ('s1','店')");
    await db.exec("INSERT INTO deal (deal_id,shop_uuid,title,price) VALUES ('d1','s1','护理',99)");
    const app = createApp({ db, startScrape: () => {} });
    const res = await app.request("/export/s1.csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(await res.text()).toContain("护理");
  });
});

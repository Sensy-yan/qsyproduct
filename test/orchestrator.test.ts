import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, applySchema, type Db } from "../src/db/sqlite";
import { runScrapeJob } from "../src/orchestrator";
import { getJob } from "../src/db/job";

describe("orchestrator", () => {
  let db: Db;
  beforeEach(() => { db = createDb(":memory:"); applySchema(db); });

  it("成功路径:job 置 done 且写入数据", async () => {
    const deps = {
      now: () => 1000,
      bootstrap: vi.fn(async () => ({ headers: {}, shopUuid: "shop1" })),
      scrape: vi.fn(async () => ({
        merchant: { shopUuid: "shop1", name: "店", category: "美容", address: "", city: "上海", sourceUrl: "u", scrapedAt: 1000 },
        deals: [{ dealId: "d1", shopUuid: "shop1", title: "护理", price: 99, marketPrice: 199, salesCount: 3, validFrom: null, validTo: null, category: "美容", rawJson: "{}" }],
        items: [{ dealId: "d1", name: "洁面", qty: 1, spec: "", stepOrder: 0, duration: "20分钟" }],
        rules: [{ dealId: "d1", ruleType: "refund" as const, text: "支持随时退" }],
        reviews: [{ dealId: "d1", shopUuid: "shop1", rating: 5, text: "好", userMasked: "张*丰", reviewDate: 900 }],
      })),
    };
    const jobId = await runScrapeJob({ db }, "u", deps);
    const j = await getJob(db, jobId);
    expect(j?.status).toBe("done");
    const { results } = await db.prepare("SELECT * FROM deal WHERE shop_uuid='shop1'").all();
    expect(results).toHaveLength(1);
  });

  it("验证码中断:job 置 awaiting_human", async () => {
    const { CaptchaInterrupt } = await import("../src/session/bootstrap");
    const deps = {
      now: () => 1000,
      bootstrap: vi.fn(async () => { throw new CaptchaInterrupt("p.png"); }),
      scrape: vi.fn(),
    };
    const jobId = await runScrapeJob({ db }, "u", deps);
    const j = await getJob(db, jobId);
    expect(j?.status).toBe("awaiting_human");
    expect(deps.scrape).not.toHaveBeenCalled();
  });
});

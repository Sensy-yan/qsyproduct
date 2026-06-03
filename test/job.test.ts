import { describe, it, expect, beforeEach } from "vitest";
import { createDb, applySchema, type Db } from "../src/db/sqlite";
import { createJob, setJobStatus, getJob } from "../src/db/job";

describe("job", () => {
  let db: Db;
  beforeEach(() => { db = createDb(":memory:"); applySchema(db); });

  it("创建后为 pending", async () => {
    const id = await createJob(db, "https://e.dianping.com/shop1", 1000);
    const j = await getJob(db, id);
    expect(j?.status).toBe("pending");
    expect(j?.merchant_url).toBe("https://e.dianping.com/shop1");
  });

  it("状态流转并记录错误", async () => {
    const id = await createJob(db, "u", 1000);
    await setJobStatus(db, id, "failed", { error: "captcha", finishedAt: 2000 });
    const j = await getJob(db, id);
    expect(j?.status).toBe("failed");
    expect(j?.error).toBe("captcha");
    expect(j?.finished_at).toBe(2000);
  });
});

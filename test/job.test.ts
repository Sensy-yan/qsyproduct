import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createJob, setJobStatus, getJob } from "../src/db/job";

describe("job", () => {
  beforeEach(async () => { await env.DB.exec("DELETE FROM job;"); });

  it("创建后为 pending", async () => {
    const id = await createJob(env.DB, "https://e.dianping.com/shop1", 1000);
    const j = await getJob(env.DB, id);
    expect(j?.status).toBe("pending");
    expect(j?.merchant_url).toBe("https://e.dianping.com/shop1");
  });

  it("状态流转并记录错误", async () => {
    const id = await createJob(env.DB, "u", 1000);
    await setJobStatus(env.DB, id, "failed", { error: "captcha", finishedAt: 2000 });
    const j = await getJob(env.DB, id);
    expect(j?.status).toBe("failed");
    expect(j?.error).toBe("captcha");
    expect(j?.finished_at).toBe(2000);
  });
});

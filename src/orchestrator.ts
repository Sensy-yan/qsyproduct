import type { Ctx, ScrapeResult, Session } from "./types";
import { createJob, setJobStatus } from "./db/job";
import { upsertMerchant, upsertDeals, replaceItems, replaceRules, replaceReviewsForShop } from "./db/repo";
import { bootstrapSession, CaptchaInterrupt } from "./session/bootstrap";
import { CaptchaError } from "./scrape/client";
import { scrapeMerchant } from "./scrape/run";

export interface OrchestratorDeps {
  now: () => number;
  bootstrap: (ctx: Ctx, url: string, jobId: string) => Promise<Session>;
  scrape: (ctx: Ctx, session: Session, url: string) => Promise<ScrapeResult>;
}

const defaultDeps: OrchestratorDeps = {
  now: () => Date.now(),
  bootstrap: (_ctx, url, jobId) => bootstrapSession(url, jobId),
  scrape: (ctx, session, url) => scrapeMerchant(ctx, session, url),
};

export async function runScrapeJob(
  ctx: Ctx,
  merchantUrl: string,
  deps: OrchestratorDeps = defaultDeps,
): Promise<string> {
  const jobId = await createJob(ctx.db, merchantUrl, deps.now());
  await executeScrapeJob(ctx, jobId, merchantUrl, deps);
  return jobId;
}

/** 对已存在的 jobId 执行抓取流程(供 HTTP 层后台调用)。 */
export async function executeScrapeJob(
  ctx: Ctx,
  jobId: string,
  merchantUrl: string,
  deps: OrchestratorDeps = defaultDeps,
): Promise<void> {
  try {
    await setJobStatus(ctx.db, jobId, "bootstrapping");
    const session = await deps.bootstrap(ctx, merchantUrl, jobId);
    await setJobStatus(ctx.db, jobId, "scraping");
    const r = await deps.scrape(ctx, session, merchantUrl);
    await upsertMerchant(ctx.db, r.merchant);
    await upsertDeals(ctx.db, r.deals);
    for (const deal of r.deals) {
      await replaceItems(ctx.db, deal.dealId, r.items.filter((i) => i.dealId === deal.dealId));
      await replaceRules(ctx.db, deal.dealId, r.rules.filter((ru) => ru.dealId === deal.dealId));
    }
    await replaceReviewsForShop(ctx.db, r.merchant.shopUuid, r.reviews);
    await setJobStatus(ctx.db, jobId, "done", {
      finishedAt: deps.now(),
      stats: { deals: r.deals.length, reviews: r.reviews.length, shopUuid: r.merchant.shopUuid },
    });
  } catch (e) {
    if (e instanceof CaptchaInterrupt || e instanceof CaptchaError) {
      await setJobStatus(ctx.db, jobId, "awaiting_human", { error: "需人工处理验证码", finishedAt: deps.now() });
    } else {
      await setJobStatus(ctx.db, jobId, "failed", { error: e instanceof Error ? e.message : String(e), finishedAt: deps.now() });
    }
  }
}

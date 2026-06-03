import type { Env, ScrapeResult, Session } from "./types";
import { createJob, setJobStatus } from "./db/job";
import { upsertMerchant, upsertDeals, replaceItems, replaceRules, replaceReviewsForShop } from "./db/repo";
import { bootstrapSession, CaptchaInterrupt } from "./session/bootstrap";
import { CaptchaError } from "./scrape/client";
import { scrapeMerchant } from "./scrape/run";

export interface OrchestratorDeps {
  now: () => number;
  bootstrap: (env: Env, url: string, jobId: string) => Promise<Session>;
  scrape: (env: Env, session: Session, url: string) => Promise<ScrapeResult>;
}

const defaultDeps: OrchestratorDeps = {
  now: () => Date.now(),
  bootstrap: (env, url, jobId) => bootstrapSession(env.BROWSER, env.RAW, url, jobId),
  scrape: (env, session, url) => scrapeMerchant(env, session, url),
};

export async function runScrapeJob(
  env: Env,
  merchantUrl: string,
  deps: OrchestratorDeps = defaultDeps,
): Promise<string> {
  const jobId = await createJob(env.DB, merchantUrl, deps.now());
  try {
    await setJobStatus(env.DB, jobId, "bootstrapping");
    const session = await deps.bootstrap(env, merchantUrl, jobId);

    await setJobStatus(env.DB, jobId, "scraping");
    const r = await deps.scrape(env, session, merchantUrl);

    await upsertMerchant(env.DB, r.merchant);
    await upsertDeals(env.DB, r.deals);
    for (const deal of r.deals) {
      await replaceItems(env.DB, deal.dealId, r.items.filter((i) => i.dealId === deal.dealId));
      await replaceRules(env.DB, deal.dealId, r.rules.filter((ru) => ru.dealId === deal.dealId));
    }
    await replaceReviewsForShop(env.DB, r.merchant.shopUuid, r.reviews);

    await setJobStatus(env.DB, jobId, "done", {
      finishedAt: deps.now(),
      stats: { deals: r.deals.length, reviews: r.reviews.length, shopUuid: r.merchant.shopUuid },
    });
  } catch (e) {
    if (e instanceof CaptchaInterrupt || e instanceof CaptchaError) {
      await setJobStatus(env.DB, jobId, "awaiting_human", {
        error: "需人工处理验证码", finishedAt: deps.now(),
      });
    } else {
      await setJobStatus(env.DB, jobId, "failed", {
        error: e instanceof Error ? e.message : String(e), finishedAt: deps.now(),
      });
    }
  }
  return jobId;
}

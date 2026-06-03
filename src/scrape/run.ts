import type { Ctx, ScrapeResult, Session, Deal, DealItem, DealRule, Review } from "../types";
import { DianpingClient } from "./client";
import { normalizeDealList, normalizeDealDetail, normalizeReviews } from "../parse/normalize";

export async function scrapeMerchant(ctx: Ctx, session: Session, url: string): Promise<ScrapeResult> {
  const client = new DianpingClient({
    fetchImpl: fetch,
    headers: session.headers,
    minIntervalMs: 1500,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  });
  const shopUuid = session.shopUuid;

  const listPages = await client.fetchAllDealListPages(shopUuid);
  const deals: Deal[] = listPages.flatMap((p) => normalizeDealList(p, shopUuid));

  const items: DealItem[] = [];
  const rules: DealRule[] = [];
  for (const d of deals) {
    const detail = await client.fetchDealDetail(d.dealId);
    const n = normalizeDealDetail(detail, d.dealId);
    items.push(...n.items);
    rules.push(...n.rules);
  }

  const reviewPages = await client.fetchAllReviewPages(shopUuid);
  const reviews: Review[] = reviewPages.flatMap((p) => normalizeReviews(p, shopUuid));

  // merchant 详细字段来自列表/详情响应(RECON:确认商家信息所在响应);当前为最小实现。
  const merchant = {
    shopUuid, name: "", category: "", address: "", city: "",
    sourceUrl: url, scrapedAt: Date.now(),
  };
  return { merchant, deals, items, rules, reviews };
}

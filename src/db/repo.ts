import type { Merchant, Deal, DealItem, DealRule, Review } from "../types";
import type { Db } from "./sqlite";

export async function upsertMerchant(db: Db, m: Merchant): Promise<void> {
  await db
    .prepare(
      `INSERT INTO merchant (shop_uuid,name,category,address,city,source_url,scraped_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(shop_uuid) DO UPDATE SET
         name=excluded.name, category=excluded.category, address=excluded.address,
         city=excluded.city, source_url=excluded.source_url, scraped_at=excluded.scraped_at`,
    )
    .bind(m.shopUuid, m.name, m.category, m.address, m.city, m.sourceUrl, m.scrapedAt)
    .run();
}

export async function upsertDeals(db: Db, deals: Deal[]): Promise<void> {
  const stmt = db.prepare(
    `INSERT INTO deal (deal_id,shop_uuid,title,price,market_price,sales_count,valid_from,valid_to,category,raw_json)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(deal_id) DO UPDATE SET
       title=excluded.title, price=excluded.price, market_price=excluded.market_price,
       sales_count=excluded.sales_count, valid_from=excluded.valid_from,
       valid_to=excluded.valid_to, category=excluded.category, raw_json=excluded.raw_json`,
  );
  await db.batch(
    deals.map((d) =>
      stmt.bind(d.dealId, d.shopUuid, d.title, d.price, d.marketPrice, d.salesCount,
        d.validFrom, d.validTo, d.category, d.rawJson),
    ),
  );
}

/** deal_item / deal_rule / review 无业务主键,按 dealId 先删后插,保证重跑幂等。 */
export async function replaceItems(db: Db, dealId: string, items: DealItem[]): Promise<void> {
  await db.prepare("DELETE FROM deal_item WHERE deal_id=?").bind(dealId).run();
  if (items.length === 0) return;
  const stmt = db.prepare(
    "INSERT INTO deal_item (deal_id,name,qty,spec,step_order,duration) VALUES (?,?,?,?,?,?)",
  );
  await db.batch(items.map((i) => stmt.bind(i.dealId, i.name, i.qty, i.spec, i.stepOrder, i.duration)));
}

export async function replaceRules(db: Db, dealId: string, rules: DealRule[]): Promise<void> {
  await db.prepare("DELETE FROM deal_rule WHERE deal_id=?").bind(dealId).run();
  if (rules.length === 0) return;
  const stmt = db.prepare("INSERT INTO deal_rule (deal_id,rule_type,text) VALUES (?,?,?)");
  await db.batch(rules.map((r) => stmt.bind(r.dealId, r.ruleType, r.text)));
}

export async function replaceReviewsForShop(db: Db, shopUuid: string, reviews: Review[]): Promise<void> {
  await db.prepare("DELETE FROM review WHERE shop_uuid=?").bind(shopUuid).run();
  if (reviews.length === 0) return;
  const stmt = db.prepare(
    "INSERT INTO review (deal_id,shop_uuid,rating,text,user_masked,review_date) VALUES (?,?,?,?,?,?)",
  );
  await db.batch(reviews.map((r) => stmt.bind(r.dealId, r.shopUuid, r.rating, r.text, r.userMasked, r.reviewDate)));
}

export async function getMerchant(db: Db, shopUuid: string): Promise<Record<string, unknown> | null> {
  return db.prepare("SELECT * FROM merchant WHERE shop_uuid=?").bind(shopUuid).first();
}

export async function getDeals(db: Db, shopUuid: string): Promise<Array<{ salesCount: number } & Record<string, unknown>>> {
  const { results } = await db
    .prepare("SELECT *, sales_count AS salesCount FROM deal WHERE shop_uuid=?")
    .bind(shopUuid)
    .all();
  return results as Array<{ salesCount: number } & Record<string, unknown>>;
}

export async function getDealProcess(
  db: Db,
  dealId: string,
): Promise<{ items: Record<string, unknown>[]; rules: Record<string, unknown>[] }> {
  const items = await db
    .prepare("SELECT * FROM deal_item WHERE deal_id=? ORDER BY step_order")
    .bind(dealId).all();
  const rules = await db
    .prepare("SELECT * FROM deal_rule WHERE deal_id=?")
    .bind(dealId).all();
  return {
    items: items.results as Record<string, unknown>[],
    rules: rules.results as Record<string, unknown>[],
  };
}

export async function getItemsByShop(db: Db, shopUuid: string): Promise<Record<string, unknown>[]> {
  const { results } = await db
    .prepare(
      "SELECT di.deal_id, di.name, di.qty, di.spec, di.step_order, di.duration FROM deal_item di JOIN deal d ON di.deal_id=d.deal_id WHERE d.shop_uuid=? ORDER BY di.deal_id, di.step_order",
    )
    .bind(shopUuid).all();
  return results as Record<string, unknown>[];
}

export async function getRulesByShop(db: Db, shopUuid: string): Promise<Record<string, unknown>[]> {
  const { results } = await db
    .prepare(
      "SELECT dr.deal_id, dr.rule_type, dr.text FROM deal_rule dr JOIN deal d ON dr.deal_id=d.deal_id WHERE d.shop_uuid=?",
    )
    .bind(shopUuid).all();
  return results as Record<string, unknown>[];
}

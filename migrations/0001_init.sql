CREATE TABLE job (
  id TEXT PRIMARY KEY,
  merchant_url TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  error TEXT,
  stats_json TEXT
);

CREATE TABLE merchant (
  shop_uuid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  address TEXT,
  city TEXT,
  source_url TEXT,
  scraped_at INTEGER
);

CREATE TABLE deal (
  deal_id TEXT PRIMARY KEY,
  shop_uuid TEXT NOT NULL,
  title TEXT,
  price REAL,
  market_price REAL,
  sales_count INTEGER,
  valid_from INTEGER,
  valid_to INTEGER,
  category TEXT,
  raw_json TEXT
);

CREATE TABLE deal_item (
  deal_id TEXT NOT NULL,
  name TEXT,
  qty INTEGER,
  spec TEXT,
  step_order INTEGER DEFAULT 0,
  duration TEXT
);
CREATE INDEX idx_deal_item_deal ON deal_item(deal_id);

CREATE TABLE deal_rule (
  deal_id TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  text TEXT
);
CREATE INDEX idx_deal_rule_deal ON deal_rule(deal_id);

CREATE TABLE review (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id TEXT,
  shop_uuid TEXT NOT NULL,
  rating REAL,
  text TEXT,
  user_masked TEXT,
  review_date INTEGER
);
CREATE INDEX idx_review_shop ON review(shop_uuid);

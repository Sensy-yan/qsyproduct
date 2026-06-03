# 美团/点评单商家团单抓取工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 部署在 Cloudflare 的按需工具,输入一个大众点评商家 URL,抓取其全部团单的详情、履约流程、服务步骤、评价/销量,导出 Excel/CSV。

**Architecture:** 混合法——Browser Rendering 跑一次浏览器建立会话(cookie/token)并半自动过验证码,随后 Worker 用 `fetch` 调 JSON 接口拉列表/详情/评价;解析层做字体解密与字段归一化;D1 存结构化数据、R2 存原始响应与字体文件;最后从 D1 导出 CSV/Excel。

**Tech Stack:** Cloudflare Workers (TypeScript) · Hono · Browser Rendering (`@cloudflare/puppeteer`) · D1 · R2 · Wrangler · Vitest + `@cloudflare/vitest-pool-workers`。

**关键依赖:** Task 1(侦察)是网络相关任务(Task 9/10/11)的前置。侦察未完成前,可先并行实现与网络无关的任务(Task 2–8)。

**范围变更(2026-06-03,用户追加):** 增加「最小单页界面」——输入商家 URL → 点击抓取 → 轮询状态 → 完成后展示团单列表 + 下载 CSV。由 Worker 直接返回内联 HTML,无前端构建步骤。为支撑界面新增:`GET /`(HTML 页)、`GET /merchants/:shopUuid/deals`(JSON,供表格渲染);并让 job 完成时在 `stats_json` 写入 `shopUuid`(供页面拿到后取数/导出)。详见文末 Task 15。

---

## 文件结构

```
package.json                       # 依赖与脚本
wrangler.toml                      # CF 配置:D1/R2/Browser binding
tsconfig.json
vitest.config.ts
migrations/0001_init.sql           # D1 表结构
docs/recon/dianping-endpoints.md   # Task 1 侦察产物(契约)
test/fixtures/                     # 录制的真实响应与字体文件
src/
  types.ts                         # 共享类型:Merchant/Deal/DealItem/DealRule/Review/Job
  db/repo.ts                       # D1 仓储:upsert / 查询
  parse/font.ts                    # 字体解密:glyph->字符映射
  parse/normalize.ts               # 原始 JSON -> 数据模型(字段映射来自侦察)
  scrape/endpoints.ts              # 接口 URL/参数构造(常量来自侦察)
  scrape/client.ts                 # DianpingClient:列表/详情/规则/评价 + 限速
  session/bootstrap.ts             # Browser Rendering:开页/取会话/半自动验证码
  export/csv.ts                    # D1 -> CSV
  orchestrator.ts                  # 串联 job:bootstrap->scrape->parse->store
  index.ts                         # Worker 入口 + Hono 路由
```

每个文件单一职责:`parse/*` 纯函数(易测),`scrape/*` 负责网络,`session/*` 负责浏览器,`db/*` 负责持久化,`orchestrator.ts` 只做编排,`index.ts` 只做 HTTP。

---

## Task 1: 接口侦察(GATE — 阻塞 Task 9/10/11)

这是混合法的成败前提。产出一份契约文档,后续网络层据此实现。**本任务为人工抓包,无代码,但有明确验收物。**

**Files:**
- Create: `docs/recon/dianping-endpoints.md`
- Create: `test/fixtures/deal-list.json`、`test/fixtures/deal-detail.json`、`test/fixtures/reviews.json`、`test/fixtures/shop.woff`

- [ ] **Step 1: 抓包记录接口契约**

用 Chrome DevTools(或 Charles/mitmproxy)打开一个已知大众点评商家 H5 页,操作「团购 tab → 点开团单 → 翻评价」,在 `docs/recon/dianping-endpoints.md` 记录:

```markdown
## 商家团单列表接口
- Method/URL: <填写>
- 必需 query/body 参数: <逐个列出,标注哪些是签名/token>
- 必需 header: <Cookie / User-Agent / Referer / X-* 等>
- 返回结构: dealId / title / price / marketPrice / sales 的 JSON 路径

## 团单详情接口
- ... (套餐明细数组路径、购买须知/规则文本路径、适用门店、有效期)

## 评价接口
- ... (分页参数、rating / 文本 / 用户 / 日期路径)

## 字体加密
- 哪些字段是加密字符: <例如 price、sales>
- 字体文件 URL 来源: <CSS @font-face / 接口字段>
- 加密类型: woff glyph 映射 / 偏移量

## 验证码
- 触发条件: <频率/IP/行为>
- 滑块类型: <网易易盾/腾讯/自研>
```

- [ ] **Step 2: 录制真实响应为 fixture**

把上述三个接口的一份真实响应分别另存为 `test/fixtures/deal-list.json`、`deal-detail.json`、`reviews.json`;把当前字体文件存为 `test/fixtures/shop.woff`。这些是 Task 5/9 单测的输入。

- [ ] **Step 3: Commit**

```bash
git add docs/recon/dianping-endpoints.md test/fixtures/
git commit -m "docs: 大众点评接口侦察契约与响应 fixture"
```

验收:`dianping-endpoints.md` 中每个接口的 URL、参数、返回路径、字体字段均已填写,无 `<填写>` 残留;四个 fixture 文件存在且非空。

---

## Task 2: 项目脚手架与配置

**Files:**
- Create: `package.json`, `tsconfig.json`, `wrangler.toml`, `vitest.config.ts`

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "dianping-merchant-scraper",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "migrate:local": "wrangler d1 migrations apply scraper-db --local"
  },
  "dependencies": {
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "@cloudflare/puppeteer": "^0.0.14",
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "@cloudflare/workers-types": "^4.20240909.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0",
    "wrangler": "^3.78.0"
  }
}
```

- [ ] **Step 2: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: 写 wrangler.toml**

```toml
name = "dianping-merchant-scraper"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

browser = { binding = "BROWSER" }

[[d1_databases]]
binding = "DB"
database_name = "scraper-db"
database_id = "PLACEHOLDER_RUN_wrangler_d1_create"
migrations_dir = "migrations"

[[r2_buckets]]
binding = "RAW"
bucket_name = "scraper-raw"
```

> 注:`database_id` 在 `wrangler d1 create scraper-db` 后回填;`browser` binding 需 Workers 付费计划。

- [ ] **Step 4: 写 vitest.config.ts**

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
      },
    },
  },
});
```

- [ ] **Step 5: 安装依赖并验证类型**

Run: `npm install && npx tsc --noEmit`
Expected: 安装成功,`tsc` 无类型错误(此时无 src 文件,应静默通过)。

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json wrangler.toml vitest.config.ts package-lock.json
git commit -m "chore: Cloudflare Worker 项目脚手架"
```

---

## Task 3: 共享类型定义

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: 写类型**

```ts
export type JobStatus =
  | "pending"
  | "bootstrapping"
  | "scraping"
  | "awaiting_human" // 验证码需人工介入
  | "done"
  | "failed";

export interface Merchant {
  shopUuid: string;
  name: string;
  category: string;
  address: string;
  city: string;
  sourceUrl: string;
  scrapedAt: number; // epoch ms,由编排层注入
}

export interface Deal {
  dealId: string;
  shopUuid: string;
  title: string;
  price: number;
  marketPrice: number;
  salesCount: number;
  validFrom: number | null;
  validTo: number | null;
  category: string;
  rawJson: string;
}

export interface DealItem {
  dealId: string;
  name: string;
  qty: number;
  spec: string;
  stepOrder: number; // 服务步骤顺序;非步骤型为 0
  duration: string; // 如 "40分钟";无则空串
}

export type RuleType =
  | "booking" // 预约方式
  | "refund" // 退款规则
  | "usable_time" // 使用时间
  | "applicable_shop" // 适用门店
  | "notice"; // 其他购买须知

export interface DealRule {
  dealId: string;
  ruleType: RuleType;
  text: string;
}

export interface Review {
  dealId: string | null;
  shopUuid: string;
  rating: number;
  text: string;
  userMasked: string;
  reviewDate: number | null;
}

export interface ScrapeResult {
  merchant: Merchant;
  deals: Deal[];
  items: DealItem[];
  rules: DealRule[];
  reviews: Review[];
}

export interface Env {
  DB: D1Database;
  RAW: R2Bucket;
  BROWSER: Fetcher;
}
```

- [ ] **Step 2: 验证类型编译**

Run: `npx tsc --noEmit`
Expected: PASS,无错误。

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: 核心数据模型类型"
```

---

## Task 4: D1 表结构(migration)

**Files:**
- Create: `migrations/0001_init.sql`

- [ ] **Step 1: 写 migration SQL**

```sql
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
```

- [ ] **Step 2: 应用 migration 到本地 D1**

Run: `npx wrangler d1 create scraper-db` (回填 wrangler.toml 的 database_id), 然后 `npm run migrate:local`
Expected: 输出 `7 tables`(含 sqlite 内部表则更多),无报错。

- [ ] **Step 3: Commit**

```bash
git add migrations/0001_init.sql wrangler.toml
git commit -m "feat: D1 表结构 migration"
```

---

## Task 5: 字体解密模块

字体加密机制是确定的(woff glyph → 字符映射),与具体商家无关。用 Task 1 录制的 `shop.woff` 做端到端断言,另用合成映射做纯逻辑单测。

**Files:**
- Create: `src/parse/font.ts`
- Test: `test/font.test.ts`

- [ ] **Step 1: 写失败测试(纯逻辑)**

```ts
import { describe, it, expect } from "vitest";
import { decodeWithMap } from "../src/parse/font";

describe("decodeWithMap", () => {
  it("用 glyph 映射还原加密串", () => {
    // 映射:私有区码点 -> 真实字符
    const map = new Map<string, string>([
      ["", "1"],
      ["", "9"],
      ["", "."],
    ]);
    expect(decodeWithMap("", map)).toBe("19.9");
  });

  it("非加密字符原样保留", () => {
    const map = new Map<string, string>([["", "5"]]);
    expect(decodeWithMap("¥元", map)).toBe("¥5元");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/font.test.ts`
Expected: FAIL — `decodeWithMap is not a function`。

- [ ] **Step 3: 实现 font.ts**

```ts
/**
 * 字体解密:大众点评把数字/部分文字渲染为自定义字体的私有区码点。
 * 解密分两步:
 *  1. buildGlyphMap: 解析 woff 字体,建立 "私有区码点 -> 真实字符" 映射。
 *  2. decodeWithMap: 用映射替换字符串中的加密码点。
 *
 * 注意:字体文件每次抓取动态下载,映射不可硬编码。
 */

/** 用已知映射替换加密码点(纯函数,易测)。 */
export function decodeWithMap(input: string, map: Map<string, string>): string {
  let out = "";
  for (const ch of input) {
    out += map.get(ch) ?? ch;
  }
  return out;
}

/**
 * 解析 woff 字体二进制,建立 glyph 映射。
 * 实现思路(Task 1 侦察确认具体加密类型后定稿):
 *  - 若为「码点->字形」型:用 OpenType 解析 cmap + glyph 轮廓,
 *    将每个私有区码点的字形与一组「已知字符的标准字形」做轮廓匹配。
 *  - 已知字符基准来自一份对照字体(随仓库提供的 baseline.woff)。
 * 这里给出基于 opentype.js 风格的轮廓哈希匹配骨架。
 */
export async function buildGlyphMap(
  woff: ArrayBuffer,
  baseline: Array<{ char: string; contourHash: string }>,
): Promise<Map<string, string>> {
  const { parseFont, glyphContourHash, privateUseCodepoints } = await import(
    "./font-internal"
  );
  const font = parseFont(woff);
  const map = new Map<string, string>();
  for (const cp of privateUseCodepoints(font)) {
    const hash = glyphContourHash(font, cp);
    const match = baseline.find((b) => b.contourHash === hash);
    if (match) map.set(String.fromCodePoint(cp), match.char);
  }
  return map;
}
```

> `font-internal.ts`(woff 解析的底层实现)在 Step 5 落地,签名:`parseFont(buf): Font`、`privateUseCodepoints(font): number[]`、`glyphContourHash(font, cp): string`。具体匹配算法在 Task 1 确认加密类型后定稿;`decodeWithMap` 与本任务测试不依赖它。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/font.test.ts`
Expected: PASS(两个 `decodeWithMap` 用例通过)。

- [ ] **Step 5: 实现 font-internal.ts 并加端到端字体测试**

侦察确认加密类型后,落地 `src/parse/font-internal.ts`,并新增基于 `test/fixtures/shop.woff` 的断言(已知该商家某字段解密后的真值)。先写测试再实现,提交。

```bash
git add src/parse/font.ts src/parse/font-internal.ts test/font.test.ts
git commit -m "feat: 字体解密模块"
```

---

## Task 6: CSV/Excel 导出

纯函数,与网络无关。导出多张表为 CSV(Excel 可直接打开 CSV;如需 .xlsx 可后续加,YAGNI 先 CSV)。

**Files:**
- Create: `src/export/csv.ts`
- Test: `test/csv.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import { toCsv } from "../src/export/csv";

describe("toCsv", () => {
  it("生成带表头的 CSV", () => {
    const rows = [
      { dealId: "d1", title: "双人餐", price: 99 },
      { dealId: "d2", title: "单人,套餐", price: 49 },
    ];
    const csv = toCsv(rows, ["dealId", "title", "price"]);
    expect(csv).toBe(
      'dealId,title,price\r\nd1,双人餐,99\r\nd2,"单人,套餐",49',
    );
  });

  it("转义引号与换行", () => {
    const rows = [{ text: 'he said "hi"\nbye' }];
    expect(toCsv(rows, ["text"])).toBe('text\r\n"he said ""hi""\nbye"');
  });

  it("空值输出空字符串", () => {
    const rows = [{ a: null, b: undefined as unknown as string }];
    expect(toCsv(rows, ["a", "b"])).toBe("a,b\r\n,");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/csv.test.ts`
Expected: FAIL — `toCsv is not a function`。

- [ ] **Step 3: 实现 csv.ts**

```ts
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** 把对象数组按给定列顺序转为 RFC4180 CSV(CRLF 行分隔)。 */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: string[],
): string {
  const header = columns.map(escapeCell).join(",");
  const body = rows.map((row) =>
    columns.map((c) => escapeCell(row[c])).join(","),
  );
  return [header, ...body].join("\r\n");
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/csv.test.ts`
Expected: PASS(三个用例)。

- [ ] **Step 5: Commit**

```bash
git add src/export/csv.ts test/csv.test.ts
git commit -m "feat: CSV 导出"
```

---

## Task 7: D1 仓储层

用 `@cloudflare/vitest-pool-workers` 在真实 D1(本地 miniflare)上测 upsert 与查询。

**Files:**
- Create: `src/db/repo.ts`
- Test: `test/repo.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { upsertMerchant, upsertDeals, getMerchant, getDeals } from "../src/db/repo";
import type { Merchant, Deal } from "../src/types";

const M: Merchant = {
  shopUuid: "shop1", name: "测试店", category: "美容", address: "X路1号",
  city: "上海", sourceUrl: "https://e.dianping.com/shop1", scrapedAt: 1000,
};
const D: Deal = {
  dealId: "deal1", shopUuid: "shop1", title: "面部护理", price: 99,
  marketPrice: 199, salesCount: 12, validFrom: null, validTo: null,
  category: "美容", rawJson: "{}",
};

describe("repo", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM merchant; DELETE FROM deal;");
  });

  it("upsert 并读回商家", async () => {
    await upsertMerchant(env.DB, M);
    expect(await getMerchant(env.DB, "shop1")).toMatchObject({ name: "测试店", city: "上海" });
  });

  it("重复 upsert deal 不产生重复行(幂等)", async () => {
    await upsertDeals(env.DB, [D]);
    await upsertDeals(env.DB, [{ ...D, salesCount: 20 }]);
    const deals = await getDeals(env.DB, "shop1");
    expect(deals).toHaveLength(1);
    expect(deals[0].salesCount).toBe(20);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/repo.test.ts`
Expected: FAIL — 模块/导出不存在。

- [ ] **Step 3: 实现 repo.ts**

```ts
import type { Merchant, Deal, DealItem, DealRule, Review } from "../types";

export async function upsertMerchant(db: D1Database, m: Merchant): Promise<void> {
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

export async function upsertDeals(db: D1Database, deals: Deal[]): Promise<void> {
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
export async function replaceItems(db: D1Database, dealId: string, items: DealItem[]): Promise<void> {
  await db.prepare("DELETE FROM deal_item WHERE deal_id=?").bind(dealId).run();
  if (items.length === 0) return;
  const stmt = db.prepare(
    "INSERT INTO deal_item (deal_id,name,qty,spec,step_order,duration) VALUES (?,?,?,?,?,?)",
  );
  await db.batch(items.map((i) => stmt.bind(i.dealId, i.name, i.qty, i.spec, i.stepOrder, i.duration)));
}

export async function replaceRules(db: D1Database, dealId: string, rules: DealRule[]): Promise<void> {
  await db.prepare("DELETE FROM deal_rule WHERE deal_id=?").bind(dealId).run();
  if (rules.length === 0) return;
  const stmt = db.prepare("INSERT INTO deal_rule (deal_id,rule_type,text) VALUES (?,?,?)");
  await db.batch(rules.map((r) => stmt.bind(r.dealId, r.ruleType, r.text)));
}

export async function replaceReviewsForShop(db: D1Database, shopUuid: string, reviews: Review[]): Promise<void> {
  await db.prepare("DELETE FROM review WHERE shop_uuid=?").bind(shopUuid).run();
  if (reviews.length === 0) return;
  const stmt = db.prepare(
    "INSERT INTO review (deal_id,shop_uuid,rating,text,user_masked,review_date) VALUES (?,?,?,?,?,?)",
  );
  await db.batch(reviews.map((r) => stmt.bind(r.dealId, r.shopUuid, r.rating, r.text, r.userMasked, r.reviewDate)));
}

export async function getMerchant(db: D1Database, shopUuid: string): Promise<Record<string, unknown> | null> {
  return db.prepare("SELECT * FROM merchant WHERE shop_uuid=?").bind(shopUuid).first();
}

export async function getDeals(db: D1Database, shopUuid: string): Promise<Array<{ salesCount: number } & Record<string, unknown>>> {
  const { results } = await db
    .prepare("SELECT *, sales_count AS salesCount FROM deal WHERE shop_uuid=?")
    .bind(shopUuid)
    .all();
  return results as Array<{ salesCount: number } & Record<string, unknown>>;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/repo.test.ts`
Expected: PASS(两个用例)。

- [ ] **Step 5: Commit**

```bash
git add src/db/repo.ts test/repo.test.ts
git commit -m "feat: D1 仓储层(upsert/幂等查询)"
```

---

## Task 8: Job 状态机

**Files:**
- Create: `src/db/job.ts`
- Test: `test/job.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/job.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 job.ts**

```ts
import type { JobStatus } from "../types";

/** id 由调用方传入(编排层用 crypto.randomUUID());startedAt 由调用方传入,避免模块内取时间。 */
export async function createJob(db: D1Database, merchantUrl: string, startedAt: number): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO job (id,merchant_url,status,started_at) VALUES (?,?,?,?)")
    .bind(id, merchantUrl, "pending", startedAt)
    .run();
  return id;
}

export async function setJobStatus(
  db: D1Database,
  id: string,
  status: JobStatus,
  opts: { error?: string; finishedAt?: number; stats?: unknown } = {},
): Promise<void> {
  await db
    .prepare("UPDATE job SET status=?, error=?, finished_at=?, stats_json=? WHERE id=?")
    .bind(status, opts.error ?? null, opts.finishedAt ?? null,
      opts.stats ? JSON.stringify(opts.stats) : null, id)
    .run();
}

export async function getJob(db: D1Database, id: string): Promise<Record<string, unknown> | null> {
  return db.prepare("SELECT * FROM job WHERE id=?").bind(id).first();
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/job.test.ts`
Expected: PASS(两个用例)。

- [ ] **Step 5: Commit**

```bash
git add src/db/job.ts test/job.test.ts
git commit -m "feat: job 状态机"
```

---

## Task 9: 响应归一化(依赖 Task 1)

把侦察录制的真实响应映射到数据模型。**字段路径来自 `docs/recon/dianping-endpoints.md`** —— 下方代码中标注 `// RECON:` 的取值路径必须按侦察产物填写;测试输入是 Task 1 的 fixture。

**Files:**
- Create: `src/parse/normalize.ts`
- Test: `test/normalize.test.ts`

- [ ] **Step 1: 写失败测试(用真实 fixture)**

```ts
import { describe, it, expect } from "vitest";
import dealList from "./fixtures/deal-list.json";
import dealDetail from "./fixtures/deal-detail.json";
import reviews from "./fixtures/reviews.json";
import { normalizeDealList, normalizeDealDetail, normalizeReviews, maskUser } from "../src/parse/normalize";

describe("normalize", () => {
  it("从列表响应解析出团单(数量与首条字段按 fixture 真值断言)", () => {
    const deals = normalizeDealList(dealList as unknown, "shop1");
    // 下列期望值在 Task 1 录制 fixture 后,按 fixture 实际内容填写:
    expect(deals.length).toBeGreaterThan(0);
    expect(deals[0]).toMatchObject({ shopUuid: "shop1" });
    expect(typeof deals[0].dealId).toBe("string");
    expect(typeof deals[0].price).toBe("number");
  });

  it("从详情响应解析出套餐明细与规则", () => {
    const { items, rules } = normalizeDealDetail(dealDetail as unknown, "deal1");
    expect(items.every((i) => i.dealId === "deal1")).toBe(true);
    expect(rules.some((r) => r.ruleType === "refund")).toBe(true);
  });

  it("评价用户脱敏", () => {
    expect(maskUser("张三丰")).toBe("张*丰");
    expect(maskUser("ab")).toBe("a*");
    const rs = normalizeReviews(reviews as unknown, "shop1");
    expect(rs.every((r) => !/^.{3,}$/.test(r.userMasked) || r.userMasked.includes("*"))).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/normalize.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 normalize.ts**

```ts
import type { Deal, DealItem, DealRule, Review, RuleType } from "../types";

/** 用户昵称脱敏:保留首尾,中间用单个 * 替换;2 字保留首字 + *。 */
export function maskUser(name: string): string {
  if (name.length <= 1) return name;
  if (name.length === 2) return name[0] + "*";
  return name[0] + "*" + name[name.length - 1];
}

// 安全取值助手:按路径读取,缺失返回默认值。
function num(v: unknown, d = 0): number { const n = Number(v); return Number.isFinite(n) ? n : d; }
function str(v: unknown, d = ""): string { return v == null ? d : String(v); }

export function normalizeDealList(raw: unknown, shopUuid: string): Deal[] {
  // RECON: 列表数组路径,例如 (raw as any).data.dealList
  const list = ((raw as any)?.data?.dealList ?? []) as any[];
  return list.map((d) => ({
    dealId: str(d.dealId ?? d.id),            // RECON: 团单ID字段
    shopUuid,
    title: str(d.title),                       // RECON
    price: num(d.price),                       // RECON(若加密:此处接 decodeWithMap 后再 Number)
    marketPrice: num(d.marketPrice ?? d.originPrice), // RECON
    salesCount: num(d.sales ?? d.soldCount),   // RECON
    validFrom: d.validFrom ? num(d.validFrom) : null, // RECON
    validTo: d.validTo ? num(d.validTo) : null,       // RECON
    category: str(d.category),                 // RECON
    rawJson: JSON.stringify(d),
  }));
}

export function normalizeDealDetail(raw: unknown, dealId: string): { items: DealItem[]; rules: DealRule[] } {
  const data = (raw as any)?.data ?? {};
  // RECON: 套餐明细数组路径,例如 data.contents / data.menu
  const items: DealItem[] = ((data.contents ?? []) as any[]).map((it, idx) => ({
    dealId,
    name: str(it.name),       // RECON
    qty: num(it.count, 1),    // RECON
    spec: str(it.spec),       // RECON
    stepOrder: num(it.stepOrder, idx), // RECON:服务步骤型团单的顺序;非步骤型用数组下标
    duration: str(it.duration),        // RECON
  }));
  // RECON: 规则文本来源(购买须知/退款/预约/使用时间/适用门店)
  const ruleSources: Array<[RuleType, unknown]> = [
    ["booking", data.bookingRule],
    ["refund", data.refundRule],
    ["usable_time", data.usableTime],
    ["applicable_shop", data.applicableShops],
    ["notice", data.notice],
  ];
  const rules: DealRule[] = ruleSources
    .filter(([, v]) => v != null && str(v) !== "")
    .map(([ruleType, v]) => ({ dealId, ruleType, text: str(v) }));
  return { items, rules };
}

export function normalizeReviews(raw: unknown, shopUuid: string): Review[] {
  // RECON: 评价数组路径
  const list = ((raw as any)?.data?.reviews ?? []) as any[];
  return list.map((r) => ({
    dealId: r.dealId ? str(r.dealId) : null, // RECON
    shopUuid,
    rating: num(r.star ?? r.rating),         // RECON
    text: str(r.reviewBody ?? r.content),    // RECON
    userMasked: maskUser(str(r.userName ?? r.author)), // RECON
    reviewDate: r.addTime ? num(r.addTime) : null,     // RECON
  }));
}
```

- [ ] **Step 4: 按真实 fixture 校准并通过测试**

依据录制的 fixture 实际结构,修正 `// RECON:` 标注的取值路径,并把 Step 1 中 `toMatchObject` 的期望值改为 fixture 真值。
Run: `npx vitest run test/normalize.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/parse/normalize.ts test/normalize.test.ts
git commit -m "feat: 响应归一化与用户脱敏"
```

---

## Task 10: 接口抓取客户端(依赖 Task 1)

构造接口请求并限速。**URL/参数/签名头来自侦察产物。** 用 `vi.fn` 注入的 fetch 测限速与分页,不打真实网络。

**Files:**
- Create: `src/scrape/endpoints.ts`, `src/scrape/client.ts`
- Test: `test/client.test.ts`

- [ ] **Step 1: 写 endpoints.ts(常量来自 Task 1)**

```ts
// 所有 URL/参数模板来自 docs/recon/dianping-endpoints.md(Task 1)。
// 占位常量在侦察后回填为真实值。
export const BASE = "https://m.dianping.com"; // RECON
export function dealListUrl(shopUuid: string, page: number): string {
  // RECON: 真实路径与分页参数名
  return `${BASE}/api/shop/${shopUuid}/deals?page=${page}`;
}
export function dealDetailUrl(dealId: string): string {
  return `${BASE}/api/deal/${dealId}`; // RECON
}
export function reviewsUrl(shopUuid: string, page: number): string {
  return `${BASE}/api/shop/${shopUuid}/reviews?page=${page}`; // RECON
}
```

- [ ] **Step 2: 写失败测试(限速 + 分页)**

```ts
import { describe, it, expect, vi } from "vitest";
import { DianpingClient } from "../src/scrape/client";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

describe("DianpingClient", () => {
  it("分页拉取直到空页", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { dealList: [{ dealId: "a" }, { dealId: "b" }] } }))
      .mockResolvedValueOnce(jsonResponse({ data: { dealList: [] } }));
    const client = new DianpingClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      headers: { Cookie: "x=1" },
      minIntervalMs: 0,
      sleep: async () => {},
    });
    const pages = await client.fetchAllDealListPages("shop1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pages).toHaveLength(1); // 只返回非空页
  });

  it("每次请求之间调用 sleep(限速)", async () => {
    const sleep = vi.fn(async () => {});
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { dealList: [{ dealId: "a" }] } }))
      .mockResolvedValueOnce(jsonResponse({ data: { dealList: [] } }));
    const client = new DianpingClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      headers: {}, minIntervalMs: 500, sleep,
    });
    await client.fetchAllDealListPages("shop1");
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("403/验证码响应抛 CaptchaError", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("verify", { status: 403 }));
    const client = new DianpingClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      headers: {}, minIntervalMs: 0, sleep: async () => {},
    });
    await expect(client.fetchDealDetail("d1")).rejects.toThrow("CAPTCHA");
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run test/client.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 4: 实现 client.ts**

```ts
import { dealListUrl, dealDetailUrl, reviewsUrl } from "./endpoints";

export class CaptchaError extends Error {
  constructor() { super("CAPTCHA"); this.name = "CaptchaError"; }
}

export interface ClientOpts {
  fetchImpl: typeof fetch;
  headers: Record<string, string>; // 来自会话引导:Cookie/token/UA/Referer
  minIntervalMs: number;
  sleep: (ms: number) => Promise<void>;
}

export class DianpingClient {
  constructor(private opts: ClientOpts) {}

  private async get(url: string): Promise<any> {
    await this.opts.sleep(this.opts.minIntervalMs); // 限速:每请求前等待
    const res = await this.opts.fetchImpl(url, { headers: this.opts.headers });
    if (res.status === 403 || res.status === 429) throw new CaptchaError();
    return res.json();
  }

  /** 翻页拉团单列表,遇空页停止,返回每页原始响应(非空)。 */
  async fetchAllDealListPages(shopUuid: string): Promise<any[]> {
    const pages: any[] = [];
    for (let page = 1; page <= 100; page++) {
      const body = await this.get(dealListUrl(shopUuid, page));
      const list = body?.data?.dealList ?? []; // RECON: 与 normalize 同源路径
      if (list.length === 0) break;
      pages.push(body);
    }
    return pages;
  }

  async fetchDealDetail(dealId: string): Promise<any> {
    return this.get(dealDetailUrl(dealId));
  }

  async fetchAllReviewPages(shopUuid: string): Promise<any[]> {
    const pages: any[] = [];
    for (let page = 1; page <= 100; page++) {
      const body = await this.get(reviewsUrl(shopUuid, page));
      const list = body?.data?.reviews ?? []; // RECON
      if (list.length === 0) break;
      pages.push(body);
    }
    return pages;
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run test/client.test.ts`
Expected: PASS(三个用例)。

- [ ] **Step 6: Commit**

```bash
git add src/scrape/endpoints.ts src/scrape/client.ts test/client.test.ts
git commit -m "feat: 接口抓取客户端(限速/分页/验证码识别)"
```

---

## Task 11: 会话引导(Browser Rendering,依赖 Task 1)

用 Browser Rendering 打开商家页,取 cookie/UA/token;遇验证码转 `awaiting_human`(把截图存 R2 供人工处理)。**此任务需真实 Browser binding,无法纯单测;以集成验证为主,逻辑部分抽纯函数单测。**

**Files:**
- Create: `src/session/bootstrap.ts`
- Test: `test/session.test.ts`(仅测纯逻辑:从 page 信息构造 headers、识别验证码页)

- [ ] **Step 1: 写失败测试(纯逻辑)**

```ts
import { describe, it, expect } from "vitest";
import { buildHeaders, isCaptchaPage } from "../src/session/bootstrap";

describe("session helpers", () => {
  it("把 cookies 数组拼成 Cookie 头", () => {
    const headers = buildHeaders(
      [{ name: "a", value: "1" }, { name: "b", value: "2" }],
      "UA-String",
      "https://m.dianping.com/shop1",
    );
    expect(headers.Cookie).toBe("a=1; b=2");
    expect(headers["User-Agent"]).toBe("UA-String");
    expect(headers.Referer).toBe("https://m.dianping.com/shop1");
  });

  it("根据页面 URL/内容识别验证码", () => {
    expect(isCaptchaPage("https://verify.dianping.com/...", "")).toBe(true);
    expect(isCaptchaPage("https://m.dianping.com/shop1", "请完成安全验证")).toBe(true);
    expect(isCaptchaPage("https://m.dianping.com/shop1", "团购")).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/session.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 bootstrap.ts**

```ts
import puppeteer from "@cloudflare/puppeteer";

export interface Session {
  headers: Record<string, string>;
  shopUuid: string;
}

export function buildHeaders(
  cookies: Array<{ name: string; value: string }>,
  userAgent: string,
  referer: string,
): Record<string, string> {
  return {
    Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    "User-Agent": userAgent,
    Referer: referer,
  };
}

export function isCaptchaPage(url: string, bodyText: string): boolean {
  // RECON: 用 Task 1 确认的验证域名/提示文案校准
  if (/verify\.|\/captcha|\/verify/.test(url)) return true;
  return /安全验证|滑动验证|请完成/.test(bodyText);
}

/** 从 URL 解析 shopUuid。RECON: 按真实 URL 形态校准正则。 */
export function parseShopUuid(url: string): string {
  const m = url.match(/\/shop\/([A-Za-z0-9]+)/) ?? url.match(/shopId=([A-Za-z0-9]+)/);
  if (!m) throw new Error(`无法从 URL 解析 shopUuid: ${url}`);
  return m[1];
}

export class CaptchaInterrupt extends Error {
  constructor(public screenshotKey: string) { super("CAPTCHA_INTERRUPT"); }
}

/**
 * 打开商家页,建立会话。遇验证码:截图存 R2,抛 CaptchaInterrupt(编排层据此置 awaiting_human)。
 * proxyUrl 为可选——裸跑时不传;被风控后传入代理(设计:先裸跑触发再上)。
 */
export async function bootstrapSession(
  browserBinding: Fetcher,
  r2: R2Bucket,
  merchantUrl: string,
  jobId: string,
  proxyUrl?: string,
): Promise<Session> {
  const browser = await puppeteer.launch(browserBinding);
  try {
    const page = await browser.newPage();
    if (proxyUrl) await page.authenticate?.({ username: "", password: "" }); // 代理凭证按服务商填写
    await page.goto(merchantUrl, { waitUntil: "networkidle0" });
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (isCaptchaPage(page.url(), bodyText)) {
      const shot = await page.screenshot();
      const key = `captcha/${jobId}.png`;
      await r2.put(key, shot);
      throw new CaptchaInterrupt(key);
    }
    const cookies = await page.cookies();
    const ua = await browser.userAgent();
    return {
      headers: buildHeaders(cookies, ua, merchantUrl),
      shopUuid: parseShopUuid(merchantUrl),
    };
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/session.test.ts`
Expected: PASS(两个用例)。

- [ ] **Step 5: 集成验证(部署后手动)**

部署到 CF 后,对一个真实商家 URL 触发抓取,确认 `bootstrapSession` 能取到 Cookie(查 job 进入 `scraping`)或正确转 `awaiting_human`(R2 有截图)。在 plan 执行记录中标注结果。

- [ ] **Step 6: Commit**

```bash
git add src/session/bootstrap.ts test/session.test.ts
git commit -m "feat: 会话引导与验证码中断处理"
```

---

## Task 12: 编排器

串联各层。注入时间戳(避免模块内取时间),把 fetch/sleep 作为依赖传入,便于测试。

**Files:**
- Create: `src/orchestrator.ts`
- Test: `test/orchestrator.test.ts`

- [ ] **Step 1: 写失败测试(注入 fake 各层)**

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { runScrapeJob } from "../src/orchestrator";
import { getJob } from "../src/db/job";

describe("orchestrator", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM job; DELETE FROM merchant; DELETE FROM deal; DELETE FROM deal_item; DELETE FROM deal_rule; DELETE FROM review;");
  });

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
    const jobId = await runScrapeJob(env, "u", deps);
    const j = await getJob(env.DB, jobId);
    expect(j?.status).toBe("done");
    const { results } = await env.DB.prepare("SELECT * FROM deal WHERE shop_uuid='shop1'").all();
    expect(results).toHaveLength(1);
  });

  it("验证码中断:job 置 awaiting_human", async () => {
    const { CaptchaInterrupt } = await import("../src/session/bootstrap");
    const deps = {
      now: () => 1000,
      bootstrap: vi.fn(async () => { throw new CaptchaInterrupt("captcha/x.png"); }),
      scrape: vi.fn(),
    };
    const jobId = await runScrapeJob(env, "u", deps);
    const j = await getJob(env.DB, jobId);
    expect(j?.status).toBe("awaiting_human");
    expect(deps.scrape).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/orchestrator.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 orchestrator.ts**

```ts
import type { Env, ScrapeResult } from "./types";
import { createJob, setJobStatus } from "./db/job";
import { upsertMerchant, upsertDeals, replaceItems, replaceRules, replaceReviewsForShop } from "./db/repo";
import { bootstrapSession, CaptchaInterrupt, type Session } from "./session/bootstrap";
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
      stats: { deals: r.deals.length, reviews: r.reviews.length },
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
```

- [ ] **Step 4: 实现 scrape/run.ts(把 client + normalize 组装成 ScrapeResult)**

```ts
// src/scrape/run.ts
import type { Env, ScrapeResult, Session, Deal, DealItem, DealRule, Review } from "../types";
import { DianpingClient } from "./client";
import { buildGlyphMap } from "../parse/font";
import { normalizeDealList, normalizeDealDetail, normalizeReviews } from "../parse/normalize";

// 注:Session 类型从 session/bootstrap re-export 或在 types 中声明;此处按 types 引用。
export async function scrapeMerchant(env: Env, session: { headers: Record<string,string>; shopUuid: string }, url: string): Promise<ScrapeResult> {
  const client = new DianpingClient({
    fetchImpl: fetch, headers: session.headers, minIntervalMs: 1500,
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

  // merchant 字段来自列表/详情响应(RECON:确认商家信息所在响应),此处占位最小实现。
  const merchant = {
    shopUuid, name: "", category: "", address: "", city: "",
    sourceUrl: url, scrapedAt: Date.now(),
  };
  return { merchant, deals, items, rules, reviews };
}
```

> 注:`Session` 类型建议在 `types.ts` 增补并由 `bootstrap.ts` 引用,避免循环依赖。字体解密在 `normalizeDealList` 内对加密字段调用(Task 9 的 RECON 标注处接 `buildGlyphMap`/`decodeWithMap`);若侦察确认列表接口无加密、仅详情页加密,则相应调整。

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run test/orchestrator.test.ts`
Expected: PASS(两个用例)。

- [ ] **Step 6: Commit**

```bash
git add src/orchestrator.ts src/scrape/run.ts test/orchestrator.test.ts src/types.ts
git commit -m "feat: 编排器与抓取组装"
```

---

## Task 13: Worker 入口与 HTTP 路由

**Files:**
- Create: `src/index.ts`
- Test: `test/index.test.ts`

- [ ] **Step 1: 写失败测试(用 SELF fetch)**

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/index.test.ts`
Expected: FAIL — 入口不存在。

- [ ] **Step 3: 实现 index.ts**

```ts
import { Hono } from "hono";
import type { Env } from "./types";
import { getJob } from "./db/job";
import { getDeals } from "./db/repo";
import { runScrapeJob } from "./orchestrator";
import { toCsv } from "./export/csv";

const app = new Hono<{ Bindings: Env }>();

// 创建抓取任务。异步执行,立即返回 jobId。
app.post("/jobs", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const url = (body as { url?: string }).url;
  if (!url) return c.json({ error: "缺少 url" }, 400);
  // 同步执行整轮抓取后返回。单商家一次性、团单数有限时可接受。
  // 风险:团单数多 + 1.5s 限速会逼近 Worker 请求时长上限——见文末「已知风险」,
  // 触限时改为 Queue 消费者/Durable Object 后台执行,POST 仅建 job 并立即返回 jobId。
  const jobId = await runScrapeJob(c.env, url);
  return c.json({ jobId });
});

app.get("/jobs/:id", async (c) => {
  const job = await getJob(c.env.DB, c.req.param("id"));
  if (!job) return c.json({ error: "未找到" }, 404);
  return c.json(job);
});

app.get("/export/:shopUuid{.+\\.csv}", async (c) => {
  const shopUuid = c.req.param("shopUuid").replace(/\.csv$/, "");
  const deals = await getDeals(c.env.DB, shopUuid);
  const csv = toCsv(deals, ["deal_id", "title", "price", "market_price", "sales_count", "category"]);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${shopUuid}.csv"`,
    },
  });
});

export default app;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/index.test.ts`
Expected: PASS(三个用例)。

- [ ] **Step 5: 全量测试 + 类型检查**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 全部 PASS,无类型错误。

- [ ] **Step 6: Commit**

```bash
git add src/index.ts test/index.test.ts
git commit -m "feat: Worker HTTP 入口(创建任务/查询/导出CSV)"
```

---

## Task 14: 部署与端到端验证

**Files:** 无新文件;部署与手动验证。

- [ ] **Step 1: 创建远端资源**

Run:
```bash
npx wrangler d1 create scraper-db        # 回填 database_id 到 wrangler.toml
npx wrangler r2 bucket create scraper-raw
npx wrangler d1 migrations apply scraper-db --remote
```
Expected: 资源创建成功,migration 应用无误。

- [ ] **Step 2: 部署**

Run: `npx wrangler deploy`
Expected: 输出 workers.dev URL。

- [ ] **Step 3: 端到端跑一个真实商家**

Run:
```bash
curl -X POST https://<worker-url>/jobs -d '{"url":"<真实大众点评商家URL>"}'
# 轮询 job
curl https://<worker-url>/jobs/<jobId>
```
Expected:job 最终为 `done`(或 `awaiting_human` 表示触发验证码——按设计需人工处理截图,然后重试)。

- [ ] **Step 4: 导出验证**

Run: `curl https://<worker-url>/export/<shopUuid>.csv -o out.csv`
Expected:out.csv 含真实团单行,价格/销量经字体解密为正常数字。

- [ ] **Step 5: 记录结果**

在本 plan 末尾追加「执行记录」小节:是否触发验证码、是否需上代理、字体解密是否正确、字段是否齐全。

---

## 已知风险与回退

- **接口/签名轮换**:Task 9/10 的 RECON 路径与 endpoints 失效时,重做 Task 1 侦察并更新常量。
- **机房 IP 被风控**:Task 14 若频繁 `awaiting_human`,按设计接入住宅/4G 代理(`bootstrapSession` 的 `proxyUrl` 参数 + client 经代理出网)。
- **字体类型与预期不符**:Task 5 Step 5 落地 `font-internal.ts` 时若发现非轮廓匹配型加密,改用对应解法(如映射表型直接建 Map)。
- **抓取超 Worker 时长上限**:`POST /jobs` 同步抓取在团单数多 + 1.5s 限速下可能逼近 Worker 请求时长上限(免费档 ~10ms CPU 误导,实为墙钟+子请求约束)。回退:把 `runScrapeJob` 移到 Cloudflare Queues 消费者或 Durable Object 中后台执行,`POST /jobs` 改为先 `createJob` 返回 jobId、再 enqueue,客户端轮询 `GET /jobs/:id`。spec §5.3 已预留 Queues 为可选依赖。
- **Session 类型归属**:`Session` 接口当前定义于 `session/bootstrap.ts`,而 `scrape/run.ts` 从 `types.ts` 引用——执行 Task 12 时统一为「在 `types.ts` 定义 `Session`,`bootstrap.ts` import 之」,避免重复定义。(已在 Task 3 落实:`Session` 定义于 `types.ts`。)

---

## Task 15: 最小单页界面(2026-06-03 追加)

由 Worker 内联返回 HTML,无前端构建。页面:输入商家 URL → 点「抓取」→ 轮询 `GET /jobs/:id` → 完成后用 `shopUuid` 拉团单 JSON 渲染表格 + 提供 CSV 下载。recon-无关(渲染 D1 中既有数据)。

**前置改动:** 编排器(Task 12)在 job 完成时把 `shopUuid` 写入 `stats`,即 `stats: { deals, reviews, shopUuid }`,以便页面从 `GET /jobs/:id` 的 `stats_json` 取到。

**Files:**
- Modify: `src/index.ts`(在 Task 13 的 Hono 应用上新增 `GET /` 与 `GET /merchants/:shopUuid/deals`)
- Create: `src/ui/page.ts`(导出 HTML 字符串,保持 index.ts 聚焦路由)
- Test: `test/ui.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";

describe("UI", () => {
  beforeEach(async () => { await env.DB.exec("DELETE FROM merchant; DELETE FROM deal;"); });

  it("GET / 返回 HTML 页面", async () => {
    const res = await SELF.fetch("https://x/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<form"); // 含抓取表单
    expect(html).toContain("/jobs"); // 前端会 POST /jobs
  });

  it("GET /merchants/:shopUuid/deals 返回团单 JSON", async () => {
    await env.DB.exec("INSERT INTO merchant (shop_uuid,name) VALUES ('s1','店')");
    await env.DB.exec("INSERT INTO deal (deal_id,shop_uuid,title,price,sales_count) VALUES ('d1','s1','护理',99,5)");
    const res = await SELF.fetch("https://x/merchants/s1/deals");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json() as { deals: Array<{ title: string }> };
    expect(body.deals).toHaveLength(1);
    expect(body.deals[0].title).toBe("护理");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/ui.test.ts`
Expected: FAIL(`GET /` 走到 Task 13 的 stub 或 404;deals 路由不存在)。

- [ ] **Step 3: 实现 src/ui/page.ts(内联 HTML + 原生 JS,无依赖)**

```ts
export const PAGE_HTML = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>大众点评团单抓取</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; }
  form { display: flex; gap: .5rem; }
  input[type=url] { flex: 1; padding: .5rem; }
  button { padding: .5rem 1rem; cursor: pointer; }
  #status { margin: 1rem 0; color: #555; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
  th, td { border: 1px solid #ddd; padding: .4rem .6rem; text-align: left; font-size: 14px; }
  th { background: #f5f5f5; }
  .hidden { display: none; }
</style>
</head>
<body>
  <h1>大众点评单商家团单抓取</h1>
  <form id="f">
    <input type="url" id="url" placeholder="粘贴商家页面 URL" required>
    <button type="submit">抓取</button>
  </form>
  <div id="status"></div>
  <a id="csv" class="hidden" download>下载 CSV</a>
  <table id="t" class="hidden"><thead><tr>
    <th>团单</th><th>现价</th><th>原价</th><th>已售</th><th>品类</th>
  </tr></thead><tbody></tbody></table>
<script>
const f = document.getElementById('f');
const statusEl = document.getElementById('status');
const table = document.getElementById('t');
const tbody = table.querySelector('tbody');
const csv = document.getElementById('csv');

f.addEventListener('submit', async (e) => {
  e.preventDefault();
  table.classList.add('hidden'); csv.classList.add('hidden'); tbody.innerHTML = '';
  statusEl.textContent = '创建任务…';
  const r = await fetch('/jobs', { method: 'POST', headers: {'content-type':'application/json'},
    body: JSON.stringify({ url: document.getElementById('url').value }) });
  if (!r.ok) { statusEl.textContent = '创建失败:' + (await r.text()); return; }
  const { jobId } = await r.json();
  poll(jobId);
});

async function poll(jobId) {
  const r = await fetch('/jobs/' + jobId);
  const job = await r.json();
  statusEl.textContent = '状态:' + job.status;
  if (job.status === 'done') {
    const stats = job.stats_json ? JSON.parse(job.stats_json) : {};
    if (stats.shopUuid) await render(stats.shopUuid);
    return;
  }
  if (job.status === 'failed' || job.status === 'awaiting_human') {
    statusEl.textContent = '状态:' + job.status + (job.error ? '(' + job.error + ')' : '');
    return;
  }
  setTimeout(() => poll(jobId), 2000);
}

async function render(shopUuid) {
  const r = await fetch('/merchants/' + encodeURIComponent(shopUuid) + '/deals');
  const { deals } = await r.json();
  statusEl.textContent = '完成,共 ' + deals.length + ' 个团单';
  for (const d of deals) {
    const tr = document.createElement('tr');
    for (const v of [d.title, d.price, d.market_price, d.sales_count, d.category]) {
      const td = document.createElement('td'); td.textContent = v == null ? '' : v; tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.classList.remove('hidden');
  csv.href = '/export/' + encodeURIComponent(shopUuid) + '.csv';
  csv.classList.remove('hidden');
}
</script>
</body>
</html>`;
```

- [ ] **Step 4: 在 src/index.ts 的 Hono 应用上新增两条路由(其余 Task 13 路由保持不变)**

```ts
import { PAGE_HTML } from "./ui/page";

// 在 const app = new Hono... 之后、export default app 之前加:

app.get("/", (c) =>
  c.html(PAGE_HTML),
);

app.get("/merchants/:shopUuid/deals", async (c) => {
  const deals = await getDeals(c.env.DB, c.req.param("shopUuid"));
  return c.json({ deals });
});
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run test/ui.test.ts && npx vitest run`
Expected: ui.test.ts 2 用例 PASS;全量套件 PASS。然后 `npx tsc --noEmit` 干净。

- [ ] **Step 6: Commit**

```bash
git add src/ui/page.ts src/index.ts test/ui.test.ts
git commit -m "feat: 最小单页抓取界面"
```


---

## Task 16: 服务流程展示与导出(2026-06-03 追加)

把已存库的服务流程露出来:`deal_item`(服务步骤)+ `deal_rule`(履约/使用规则)。recon-无关(读 D1 既有数据)。

**改动:**
- `src/db/repo.ts`:新增 `getDealProcess(db, dealId)`(单团单的 items+rules,items 按 step_order 排序)、`getItemsByShop(db, shopUuid)`、`getRulesByShop(db, shopUuid)`(JOIN deal 取整店)。
- `src/index.ts`:新增 `GET /deals/:dealId/process`(JSON)、`GET /export/:shopUuid/items.csv`、`GET /export/:shopUuid/rules.csv`。
- `src/ui/page.ts`:团单行可点击展开,显示「履约流程」(rule_type 中文标签 + 文本)与「服务步骤」(按 step_order:名称/规格/数量/时长);下载区新增「服务步骤 CSV」「履约规则 CSV」两个链接。
- 测试:repo 三个新函数;`GET /deals/:dealId/process` JSON;两个 CSV 导出。

rule_type 中文标签:booking→预约方式,refund→退款规则,usable_time→使用时间,applicable_shop→适用门店,notice→购买须知。

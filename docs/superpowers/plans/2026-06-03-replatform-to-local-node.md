# 再平台:Cloudflare Worker → 纯本地 Node 应用

> 2026-06-03。用户决定:不部署云,改成本地运行。去掉 R2/付费计划/Browser Rendering 本地限制等全部门槛。

## 目标

`npm run dev` 即可本地全跑:真实 Playwright 浏览器(有头,手动过验证码)+ 本地 SQLite + Hono on Node + 现有界面。单商家一次性竞品分析。

## 复用 vs 改写

**直接复用(不动):** `src/types.ts` 的数据模型类型(去掉 Worker 的 `Env`)、`src/parse/font.ts`、`src/parse/font-internal.ts`、`src/parse/normalize.ts`、`src/export/csv.ts`、`src/scrape/client.ts`(fetch 在 Node 全局可用)、`src/scrape/endpoints.ts`、`src/ui/page.ts`、`migrations/0001_init.sql`、合成 fixture。

**改写三层:**
- 存储:D1 → better-sqlite3。用一个 **D1 兼容 shim**(`src/db/sqlite.ts`)暴露 `prepare/bind/run/all/first/batch/exec` 的异步接口,使 `repo.ts`/`job.ts` 函数体**保持不变**,仅把参数类型 `D1Database` 换成 `Db`。
- 浏览器:`@cloudflare/puppeteer` → `playwright`。真实 Chromium,有头;检测到验证码时**等待用户手动完成**(轮询直到离开验证页,超时则抛 `CaptchaInterrupt`);截图写本地文件代替 R2。
- 服务器:Worker `export default app` → `createApp({ db, startScrape })` 工厂 + `src/server.ts` 用 `@hono/node-server` 启动;处理器用注入的 `db` 取代 `c.env.DB`。

**删除:** `wrangler.toml`、`test/apply-migrations.ts`、`test/env.d.ts`、`vitest` 的 pool-workers 配置、`.cf.env`(已删)。

**测试:** vitest-pool-workers → 纯 vitest(node)。`repo/job/process/orchestrator/index/ui` 测试改用 `createDb(':memory:')` + `applySchema`,HTTP 用 Hono 的 `app.request()`。`font/csv/normalize` 测试不变。

## 任务分块(强耦合,按块做以保证整合一致)

### Chunk A — 基础 + 存储
- 改 `package.json`(去 wrangler/puppeteer/workers-types/pool-workers;加 better-sqlite3、playwright、@hono/node-server、tsx、@types/better-sqlite3、@types/node)、`tsconfig.json`(types:["node"],lib 加 DOM 供 playwright evaluate)、`vitest.config.ts`(node)。
- 删 `wrangler.toml`、`test/apply-migrations.ts`、`test/env.d.ts`。
- 新建 `src/db/sqlite.ts`:`Db` 接口 + `createDb(path):Db`(better-sqlite3,异步壳)+ `applySchema(db)`(执行 migrations/0001_init.sql)。
- `repo.ts`/`job.ts`:`D1Database`→`Db`,函数体不变;`crypto.randomUUID()` Node 全局可用。
- 重写 `repo.test.ts`/`job.test.ts`/`process.test.ts`:`createDb(':memory:')`+`applySchema`,去掉 `cloudflare:test`。
- 验收:这几个测试在纯 vitest 下通过。

### Chunk B — 浏览器 + 抓取 + 编排
- 重写 `src/session/bootstrap.ts`:Playwright `chromium.launch({ headless:false })`;保留 `buildHeaders/isCaptchaPage/parseShopUuid/CaptchaInterrupt`;验证码等待人工 + 本地截图。
- `src/types.ts`:去 `Env`,新增 `Ctx { db: Db }`(供编排/服务器)。
- `orchestrator.ts`/`scrape/run.ts`:`Env`→`Ctx`;`defaultDeps` 用 playwright bootstrap + node scrape;后台执行(去掉 `waitUntil`)。
- 重写 `session.test.ts`(纯函数)、`orchestrator.test.ts`(注入 fake + 内存库)。
- 验收:相关测试通过。

### Chunk C — 服务器 + 界面
- `src/index.ts` → `createApp({ db, startScrape })` 工厂,处理器用注入 db;`POST /jobs` 调 `startScrape(jobId,url)` 后台跑、立即返回 jobId。
- 新建 `src/server.ts`:`createDb('./data/scraper.db')`→`applySchema`→`createApp`→`serve`(@hono/node-server,端口 3000)。
- 重写 `index.test.ts`/`ui.test.ts`:`createApp({db,startScrape:noop})` + `app.request()`。
- 验收:`npm test` 全绿;`npm run dev` 启动,curl `/`、`/merchants/:id/deals`、`/export/*`、`/deals/:id/process` 正常。

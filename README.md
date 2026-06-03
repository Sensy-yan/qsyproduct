# 大众点评单商家团单抓取工具(本地 Node 版)

输入一个大众点评商家页面 URL,抓取该商家**全部团单**及每个团单的**完整画像**——团单详情、履约/使用流程、服务项目步骤、评价/销量——并在网页上查看、导出 CSV。面向单商家、一次性的竞品/市场分析。

## 技术栈

纯本地运行,无云依赖:Node.js · TypeScript · Hono(+ @hono/node-server)· better-sqlite3(本地 SQLite)· Playwright(真实 Chromium,有头,验证码手动通过)· Vitest。

## 运行

```bash
npm install
npx playwright install chromium   # 首次需下载浏览器内核(实际抓取用)
npm run dev                       # 启动 http://localhost:3000
```

打开 http://localhost:3000 → 粘贴商家 URL → 点「抓取」→ 完成后列表展示团单(点行展开看服务流程)→ 下载团单 / 服务步骤 / 履约规则三份 CSV。

数据存于 `./data/scraper.db`(本地 SQLite,已 gitignore)。

## 测试

```bash
npm test        # vitest,全部单元/集成测试
```

## 当前状态与待办

- ✅ 完整链路已通:抓取编排 → 解析(团单/服务步骤/履约规则/评价 + 字体解密)→ SQLite 存储 → 网页展示(含服务流程展开)→ 三份 CSV 导出。验证码采用有头浏览器人工通过。
- ⏳ **接口侦察(关键,待人工)**:`src/parse/normalize.ts` 与 `src/scrape/endpoints.ts` 中标注 `// RECON:` 的接口 URL、参数、字段路径,目前是**按假设填的占位值**(测试用合成 fixture)。需抓包大众点评商家 H5,把真实接口/字段填进去,才能抓到真数据。详见 `docs/recon/dianping-endpoints.md`(待创建)与 `docs/superpowers/plans/2026-06-03-meituan-merchant-deals-scraper.md` 的 Task 1。
- ⏳ 字体解密底层 `src/parse/font-internal.ts` 为占位,待侦察确认加密类型后落地。

## 目录

- `src/db/` — SQLite 封装与仓储
- `src/scrape/` — 接口客户端、抓取编排
- `src/session/` — Playwright 会话引导、验证码处理
- `src/parse/` — 字体解密、响应归一化
- `src/export/` — CSV 导出
- `src/ui/` — 单页界面(内联 HTML)
- `src/server.ts` — Node 入口
- `migrations/0001_init.sql` — 表结构
- `docs/superpowers/` — 设计与实现计划

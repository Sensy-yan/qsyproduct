import { serve } from "@hono/node-server";
import { mkdirSync } from "node:fs";
import { createDb, applySchema } from "./db/sqlite";
import { createApp } from "./index";
import { executeScrapeJob } from "./orchestrator";

mkdirSync("./data", { recursive: true });
const db = createDb("./data/scraper.db");
applySchema(db);

const startScrape = (jobId: string, url: string) => {
  // 后台执行,不阻塞 HTTP 响应;失败已在 executeScrapeJob 内落库为 failed/awaiting_human。
  executeScrapeJob({ db }, jobId, url).catch((e) => console.error("scrape job error:", e));
};

const app = createApp({ db, startScrape });
const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`大众点评团单抓取工具已启动: http://localhost:${info.port}`);
});

import { Hono } from "hono";
import type { Env } from "./types";
import { getJob, createJob } from "./db/job";
import { getDeals, getDealProcess, getItemsByShop, getRulesByShop } from "./db/repo";
import { executeScrapeJob } from "./orchestrator";
import { toCsv } from "./export/csv";
import { PAGE_HTML } from "./ui/page";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.html(PAGE_HTML));

// 创建抓取任务:先建 job 立即返回 jobId,抓取在后台执行,前端轮询 GET /jobs/:id。
app.post("/jobs", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const url = (body as { url?: string }).url;
  if (!url) return c.json({ error: "缺少 url" }, 400);
  const jobId = await createJob(c.env.DB, url, Date.now());
  c.executionCtx.waitUntil(executeScrapeJob(c.env, jobId, url));
  return c.json({ jobId });
});

app.get("/jobs/:id", async (c) => {
  const job = await getJob(c.env.DB, c.req.param("id"));
  if (!job) return c.json({ error: "未找到" }, 404);
  return c.json(job);
});

app.get("/merchants/:shopUuid/deals", async (c) => {
  const deals = await getDeals(c.env.DB, c.req.param("shopUuid"));
  return c.json({ deals });
});

app.get("/deals/:dealId/process", async (c) => {
  const { items, rules } = await getDealProcess(c.env.DB, c.req.param("dealId"));
  return c.json({ items, rules });
});

app.get("/export/:shopUuid/items.csv", async (c) => {
  const shopUuid = c.req.param("shopUuid");
  const items = await getItemsByShop(c.env.DB, shopUuid);
  const csv = toCsv(items, ["deal_id", "name", "qty", "spec", "step_order", "duration"]);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${shopUuid}-items.csv"`,
    },
  });
});

app.get("/export/:shopUuid/rules.csv", async (c) => {
  const shopUuid = c.req.param("shopUuid");
  const rules = await getRulesByShop(c.env.DB, shopUuid);
  const csv = toCsv(rules, ["deal_id", "rule_type", "text"]);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${shopUuid}-rules.csv"`,
    },
  });
});

app.get("/export/:file", async (c) => {
  const shopUuid = c.req.param("file").replace(/\.csv$/, "");
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

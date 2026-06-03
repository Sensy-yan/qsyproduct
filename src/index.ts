import { Hono } from "hono";
import type { Db } from "./db/sqlite";
import { getJob, createJob } from "./db/job";
import { getDeals, getDealProcess, getItemsByShop, getRulesByShop } from "./db/repo";
import { toCsv } from "./export/csv";
import { PAGE_HTML } from "./ui/page";

export interface AppDeps {
  db: Db;
  /** 后台启动抓取(jobId 已创建)。 */
  startScrape: (jobId: string, url: string) => void;
}

export function createApp({ db, startScrape }: AppDeps) {
  const app = new Hono();

  app.get("/", (c) => c.html(PAGE_HTML));

  // 建任务:立即返回 jobId,抓取后台执行,前端轮询 GET /jobs/:id。
  app.post("/jobs", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const url = (body as { url?: string }).url;
    if (!url) return c.json({ error: "缺少 url" }, 400);
    const jobId = await createJob(db, url, Date.now());
    startScrape(jobId, url);
    return c.json({ jobId });
  });

  app.get("/jobs/:id", async (c) => {
    const job = await getJob(db, c.req.param("id"));
    if (!job) return c.json({ error: "未找到" }, 404);
    return c.json(job);
  });

  app.get("/merchants/:shopUuid/deals", async (c) => {
    const deals = await getDeals(db, c.req.param("shopUuid"));
    return c.json({ deals });
  });

  app.get("/deals/:dealId/process", async (c) => {
    const { items, rules } = await getDealProcess(db, c.req.param("dealId"));
    return c.json({ items, rules });
  });

  app.get("/export/:shopUuid/items.csv", async (c) => {
    const shopUuid = c.req.param("shopUuid");
    const items = await getItemsByShop(db, shopUuid);
    const csv = toCsv(items, ["deal_id", "name", "qty", "spec", "step_order", "duration"]);
    return new Response(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${shopUuid}-items.csv"` },
    });
  });

  app.get("/export/:shopUuid/rules.csv", async (c) => {
    const shopUuid = c.req.param("shopUuid");
    const rules = await getRulesByShop(db, shopUuid);
    const csv = toCsv(rules, ["deal_id", "rule_type", "text"]);
    return new Response(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${shopUuid}-rules.csv"` },
    });
  });

  app.get("/export/:file", async (c) => {
    const shopUuid = c.req.param("file").replace(/\.csv$/, "");
    const deals = await getDeals(db, shopUuid);
    const csv = toCsv(deals, ["deal_id", "title", "price", "market_price", "sales_count", "category"]);
    return new Response(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${shopUuid}.csv"` },
    });
  });

  return app;
}

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

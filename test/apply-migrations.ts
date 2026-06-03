import { applyD1Migrations, env } from "cloudflare:test";

// 每个测试 worker 启动时把 migrations 应用到隔离的本地 D1。
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

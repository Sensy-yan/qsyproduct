import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface PreparedStatement {
  bind(...values: unknown[]): PreparedStatement;
  run(): Promise<{ success: boolean }>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

export interface Db {
  prepare(sql: string): PreparedStatement;
  batch(stmts: PreparedStatement[]): Promise<unknown[]>;
  exec(sql: string): Promise<void>;
  _raw: Database.Database;
}

class Stmt implements PreparedStatement {
  constructor(private db: Database.Database, private sql: string, private vals: unknown[] = []) {}
  bind(...values: unknown[]): PreparedStatement {
    return new Stmt(this.db, this.sql, values);
  }
  runSync(): void {
    this.db.prepare(this.sql).run(...(this.vals as never[]));
  }
  async run() {
    this.runSync();
    return { success: true };
  }
  async all<T = Record<string, unknown>>() {
    const results = this.db.prepare(this.sql).all(...(this.vals as never[])) as T[];
    return { results };
  }
  async first<T = Record<string, unknown>>() {
    const r = this.db.prepare(this.sql).get(...(this.vals as never[])) as T | undefined;
    return r ?? null;
  }
}

/** 创建本地 SQLite,暴露与 Cloudflare D1 兼容的最小接口。 */
export function createDb(path: string): Db {
  const raw = new Database(path);
  raw.pragma("journal_mode = WAL");
  return {
    _raw: raw,
    prepare(sql: string) {
      return new Stmt(raw, sql);
    },
    async batch(stmts: PreparedStatement[]) {
      const tx = raw.transaction(() => {
        for (const s of stmts) (s as unknown as { runSync(): void }).runSync();
      });
      tx();
      return [];
    },
    async exec(sql: string) {
      raw.exec(sql);
    },
  };
}

/** 把 migrations/0001_init.sql 应用到库(建表)。幂等:已建表则跳过。 */
export function applySchema(db: Db): void {
  const existing = db._raw
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='job'")
    .get();
  if (existing) return;
  const sqlPath = fileURLToPath(new URL("../../migrations/0001_init.sql", import.meta.url));
  db._raw.exec(readFileSync(sqlPath, "utf8"));
}

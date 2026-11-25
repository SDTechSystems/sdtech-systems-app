// Sustituto de Cloudflare D1 para pruebas, sobre node:sqlite (Node 22).
import { DatabaseSync } from "node:sqlite";

type Value = string | number | bigint | null | Uint8Array;

const toValue = (v: unknown): Value => {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  return v as Value;
};

class TestStatement {
  constructor(private db: DatabaseSync, readonly sql: string, private args: Value[] = []) {}
  bind(...args: unknown[]) {
    return new TestStatement(this.db, this.sql, args.map(toValue));
  }
  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.args) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : { ...row }) as T;
  }
  async all<T = Record<string, unknown>>() {
    const rows = this.db.prepare(this.sql).all(...this.args) as Record<string, unknown>[];
    return { results: rows.map((r) => ({ ...r })) as T[], success: true, meta: {} };
  }
  async run() {
    return this.runSync();
  }
  runSync() {
    const r = this.db.prepare(this.sql).run(...this.args);
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

export function createTestDb(): D1Database {
  const db = new DatabaseSync(":memory:");
  const api = {
    prepare: (sql: string) => new TestStatement(db, sql),
    async batch(stmts: TestStatement[]) {
      db.exec("BEGIN");
      try {
        const out = stmts.map((s) => s.runSync());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
  return api as unknown as D1Database;
}

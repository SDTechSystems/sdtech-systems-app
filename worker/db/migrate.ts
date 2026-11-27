import { MIGRATIONS } from "./migrations";

let ready: Promise<void> | null = null;

/** Aplica las migraciones pendientes. Una vez por isolate; tolera que otro isolate corra a la vez. */
export function ensureSchema(db: D1Database): Promise<void> {
  if (!ready) {
    ready = apply(db).catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

/** Solo para pruebas. */
export function resetSchemaFlag(): void {
  ready = null;
}

async function apply(db: D1Database): Promise<void> {
  await db.prepare("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)").run();
  const { results } = await db.prepare("SELECT id FROM schema_migrations").all<{ id: string }>();
  const applied = new Set(results.map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    try {
      await db.batch([
        ...m.statements.map((s) => db.prepare(s)),
        db.prepare("INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)").bind(m.id, new Date().toISOString()),
      ]);
    } catch (e) {
      // Otro isolate pudo aplicarla a la vez (la nuestra chocó y se revirtió): si ya quedó aplicada, se sigue.
      if (!(await db.prepare("SELECT 1 FROM schema_migrations WHERE id = ?").bind(m.id).first())) throw e;
    }
  }
}

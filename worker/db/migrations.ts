import { CATALOG_SEED } from "./seed";

export interface Migration {
  id: string;
  statements: string[];
}

const SEED_AT = "2026-11-25T00:00:00.000Z";
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

const seedCatalog = CATALOG_SEED.map(
  (it, i) =>
    `INSERT OR IGNORE INTO catalog_items (id, service, name, description, price, currency, billing, price_from, active, sort, created_at, updated_at) VALUES (${q(it.id)}, ${q(it.service)}, ${q(it.name)}, ${q(it.description)}, ${it.price}, 'COP', ${q(it.billing)}, ${it.priceFrom ? 1 : 0}, 1, ${i + 1}, ${q(SEED_AT)}, ${q(SEED_AT)})`,
);

export const MIGRATIONS: Migration[] = [
  {
    id: "0001_base",
    statements: [
      `CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('owner','collaborator')), name TEXT, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, document TEXT, city TEXT, company TEXT, notes TEXT, search_text TEXT NOT NULL DEFAULT '', archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS catalog_items (id TEXT PRIMARY KEY, service TEXT NOT NULL CHECK(service IN ('web','marca','software','general')), name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', price INTEGER NOT NULL CHECK(price >= 0), currency TEXT NOT NULL DEFAULT 'COP' CHECK(currency IN ('COP','USD')), billing TEXT NOT NULL DEFAULT 'unico' CHECK(billing IN ('unico','mensual','anual')), price_from INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS activity_log (id TEXT PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL, detail TEXT)`,
      `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_clients_archived_name ON clients (archived, name)`,
      `CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log (entity_type, entity_id, at)`,
      ...seedCatalog,
    ],
  },
];

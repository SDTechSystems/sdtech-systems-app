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
  {
    id: "0002_quotes_projects",
    statements: [
      `CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL)`,
      `INSERT OR IGNORE INTO counters (name, value) VALUES ('quote', 0), ('invoice', 0)`,
      `CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, client_id TEXT NOT NULL, service TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'COP', status TEXT NOT NULL CHECK(status IN ('draft','sent','approved','rejected')), advance_percent INTEGER NOT NULL DEFAULT 50, notes TEXT NOT NULL DEFAULT '', conditions TEXT NOT NULL DEFAULT '', issued_at TEXT, valid_until TEXT, approved_at TEXT, approved_by TEXT, approved_name TEXT, client_comment TEXT, owner_note TEXT, approval_snapshot TEXT, project_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS quote_items (id TEXT PRIMARY KEY, quote_id TEXT NOT NULL, position INTEGER NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', quantity INTEGER NOT NULL CHECK(quantity >= 1), unit_price INTEGER NOT NULL CHECK(unit_price >= 0), catalog_item_id TEXT)`,
      `CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, quote_id TEXT, service TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','delivered','cancelled')), start_date TEXT, due_date TEXT, total INTEGER, currency TEXT, advance_percent INTEGER, delivery_url TEXT, delivery_released INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS phases (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, parent_id TEXT, position INTEGER NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','done')), due_date TEXT, client_note TEXT, done_at TEXT, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS portal_tokens (token TEXT PRIMARY KEY, client_id TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT)`,
      `CREATE INDEX IF NOT EXISTS idx_quotes_client ON quotes (client_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items (quote_id, position)`,
      `CREATE INDEX IF NOT EXISTS idx_projects_client ON projects (client_id, status)`,
      `CREATE INDEX IF NOT EXISTS idx_phases_project ON phases (project_id, position)`,
      `CREATE INDEX IF NOT EXISTS idx_portal_tokens_client ON portal_tokens (client_id)`,
    ],
  },
];

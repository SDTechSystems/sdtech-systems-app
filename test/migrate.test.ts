import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "./d1";
import { ensureSchema, resetSchemaFlag } from "../worker/db/migrate";

const TABLES = ["schema_migrations", "users", "clients", "catalog_items", "activity_log", "settings"];

const expected: [string, number, string, number][] = [
  ["Asesoría y diagnóstico", 0, "unico", 0],
  ["Landing page", 650000, "unico", 0],
  ["Sitio informativo", 1200000, "unico", 0],
  ["Catálogo con pedido por WhatsApp", 1500000, "unico", 0],
  ["Tienda en línea", 2200000, "unico", 1],
  ["Página adicional", 120000, "unico", 0],
  ["Mantenimiento web", 80000, "mensual", 0],
  ["Gestión de hosting y dominio", 25000, "mensual", 0],
  ["Kit de marca estándar", 450000, "unico", 0],
  ["Ronda de ajustes adicional", 40000, "unico", 0],
  ["Herramienta en Google Sheets", 500000, "unico", 0],
  ["Aplicación a medida · Fase 1 (MVP)", 2500000, "unico", 1],
  ["Soporte y mantenimiento de software", 120000, "mensual", 0],
  ["Capacitación adicional (por hora)", 50000, "unico", 0],
];

describe("ensureSchema", () => {
  beforeEach(() => resetSchemaFlag());

  it("creates every table", async () => {
    const db = createTestDb();
    await ensureSchema(db);
    const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>();
    const names = results.map((r) => r.name);
    for (const t of TABLES) expect(names).toContain(t);
  });

  it("is idempotent, also when called concurrently", async () => {
    const db = createTestDb();
    await ensureSchema(db);
    resetSchemaFlag();
    await Promise.all([ensureSchema(db), ensureSchema(db)]);
    const row = await db.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE id = '0001_base'").first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it("seeds the starter catalog in COP with the agreed prices", async () => {
    const db = createTestDb();
    await ensureSchema(db);
    const { results } = await db
      .prepare("SELECT name, price, billing, price_from, currency FROM catalog_items ORDER BY sort")
      .all<{ name: string; price: number; billing: string; price_from: number; currency: string }>();
    expect(results).toHaveLength(14);
    expect(results.every((r) => r.currency === "COP")).toBe(true);
    expect(results.map((r) => [r.name, r.price, r.billing, r.price_from])).toEqual(expected);
    const hosting = await db.prepare("SELECT description FROM catalog_items WHERE name = 'Gestión de hosting y dominio'").first<{ description: string }>();
    expect(hosting?.description.endsWith("(más el costo del proveedor)")).toBe(true);
  });

  it("does not re-seed after Juan edits or deletes items", async () => {
    const db = createTestDb();
    await ensureSchema(db);
    await db.prepare("DELETE FROM catalog_items WHERE name = 'Landing page'").run();
    resetSchemaFlag();
    await ensureSchema(db);
    const row = await db.prepare("SELECT COUNT(*) AS n FROM catalog_items").first<{ n: number }>();
    expect(row?.n).toBe(13);
  });
});

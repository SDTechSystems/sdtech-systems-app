import { DEFAULT_PHASE_TEMPLATES } from "../shared/phases";
import type { Service, Settings } from "../shared/types";

/** Condiciones por defecto de la cotización (diseño § 7). */
export const DEFAULT_CONDITIONS = [
  "Esta cotización es válida por 30 días desde su fecha de emisión. Después de ese plazo, los valores se recalculan.",
  "Para iniciar se requiere un anticipo del 50%. El saldo se paga antes de la entrega de los archivos finales o la publicación.",
  "Los costos de terceros (dominio, hosting, plataformas, licencias, pasarelas de pago) no están incluidos, salvo que aparezcan como ítem. Pueden variar según el proveedor y la tasa de cambio.",
  "Los cambios que modifiquen el alcance o el valor se presentan y se aprueban en tu página de seguimiento antes de realizarse.",
  "Los archivos finales, accesos y entregables se comparten cuando el pago esté completo.",
  "Los tiempos de entrega cuentan desde el pago del anticipo y la entrega de los contenidos necesarios por parte del cliente.",
].join("\n");

export const DEFAULT_SETTINGS: Settings = {
  company: { name: "SD Tech Systems", phone: "+57 305 814 7293", email: "contacto@sdtechsystems.dev", website: "sdtechsystems.dev" },
  payment: { brebKey: "3058147293", bank: "Davibank", usdText: "" },
  quotes: { validityDays: 30, advancePercent: 50, conditions: DEFAULT_CONDITIONS },
  phaseTemplates: DEFAULT_PHASE_TEMPLATES,
};

const SERVICES: Service[] = ["web", "marca", "software", "general"];

export async function getSettings(db: D1Database): Promise<Settings> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'app'").first<{ value: string }>();
  const saved = row ? (JSON.parse(row.value) as Partial<Settings>) : {};
  return mergeSettings(DEFAULT_SETTINGS, saved);
}

export function mergeSettings(base: Settings, patch: Partial<Settings>): Settings {
  return {
    company: { ...base.company, ...patch.company },
    payment: { ...base.payment, ...patch.payment },
    quotes: { ...base.quotes, ...patch.quotes },
    phaseTemplates: { ...base.phaseTemplates, ...patch.phaseTemplates },
  };
}

export function validSettings(s: Settings): boolean {
  const { validityDays, advancePercent } = s.quotes;
  if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 365) return false;
  if (!Number.isInteger(advancePercent) || advancePercent < 0 || advancePercent > 100) return false;
  for (const svc of SERVICES) {
    const t = s.phaseTemplates[svc];
    if (!Array.isArray(t) || t.length === 0 || t.some((n) => typeof n !== "string" || !n.trim())) return false;
  }
  for (const section of [s.company, s.payment] as Record<string, unknown>[]) {
    if (Object.values(section).some((v) => typeof v !== "string")) return false;
  }
  return typeof s.quotes.conditions === "string";
}

export function saveSettingsStatement(db: D1Database, s: Settings): D1PreparedStatement {
  return db.prepare("INSERT INTO settings (key, value) VALUES ('app', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(s));
}

/** Consecutivo atómico (COT-0001, FAC-0001…). */
export async function nextNumber(db: D1Database, counter: "quote" | "invoice"): Promise<number> {
  const row = await db.prepare("UPDATE counters SET value = value + 1 WHERE name = ? RETURNING value").bind(counter).first<{ value: number }>();
  if (!row) throw new Error(`counter ${counter} missing`);
  return row.value;
}

export const formatNumber = (prefix: "COT" | "FAC", n: number): string => `${prefix}-${String(n).padStart(4, "0")}`;

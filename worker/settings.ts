import { DEFAULT_PHASE_TEMPLATES } from "../shared/phases";
import { DEFAULT_TEMPLATES, type TemplateKey } from "../shared/templates";
import type { PaymentMethodOption, Service, Settings } from "../shared/types";

/** Condiciones por defecto de la cotización (diseño § 7). */
export const DEFAULT_CONDITIONS = [
  "Esta cotización es válida por 30 días desde su fecha de emisión. Después de ese plazo, los valores se recalculan.",
  "Para iniciar se requiere un anticipo del 50%. El saldo se paga antes de la entrega de los archivos finales o la publicación.",
  "Los costos de terceros (dominio, hosting, plataformas, licencias, pasarelas de pago) no están incluidos, salvo que aparezcan como ítem. Pueden variar según el proveedor y la tasa de cambio.",
  "Los cambios que modifiquen el alcance o el valor se presentan y se aprueban en tu página de seguimiento antes de realizarse.",
  "Los archivos finales, accesos y entregables se comparten cuando el pago esté completo.",
  "Los tiempos de entrega cuentan desde el pago del anticipo y la entrega de los contenidos necesarios por parte del cliente.",
].join("\n");

export const DEFAULT_PAYMENT_METHODS: PaymentMethodOption[] = [
  { id: "breb", name: "Bre-B", detail: "3058147293 · Davibank", showOnDocs: true, active: true },
  { id: "nequi", name: "Nequi", detail: "", showOnDocs: true, active: true },
  { id: "bancolombia", name: "Bancolombia", detail: "", showOnDocs: false, active: true },
  { id: "efectivo", name: "Efectivo", detail: "", showOnDocs: false, active: true },
  { id: "tarjeta", name: "Tarjeta", detail: "Datáfono, Bold o Nequi Negocios", showOnDocs: true, active: true },
];

export const DEFAULT_SETTINGS: Settings = {
  company: { name: "SD Tech Systems", phone: "+57 305 814 7293", email: "contacto@sdtechsystems.dev", website: "sdtechsystems.dev", nit: "", taxNote: "No responsable de IVA" },
  payment: { brebKey: "3058147293", bank: "Davibank", usdText: "", methods: DEFAULT_PAYMENT_METHODS },
  quotes: { validityDays: 30, advancePercent: 50, conditions: DEFAULT_CONDITIONS },
  phaseTemplates: DEFAULT_PHASE_TEMPLATES,
  templates: DEFAULT_TEMPLATES,
  alerts: { staleDays: 7, dueSoonDays: 7, quoteExpiringDays: 5 },
  calendar: { eventHour: 9 },
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
    templates: { ...base.templates, ...patch.templates },
    alerts: { ...base.alerts, ...patch.alerts },
    calendar: { ...base.calendar, ...patch.calendar },
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
  if (Object.values(s.company).some((v) => typeof v !== "string")) return false;
  const { methods, ...payment } = s.payment;
  if (Object.values(payment).some((v) => typeof v !== "string")) return false;
  if (!validMethods(methods)) return false;
  for (const key of Object.keys(DEFAULT_TEMPLATES) as TemplateKey[]) {
    const t = s.templates[key];
    if (typeof t !== "string" || !t.trim()) return false;
  }
  for (const v of Object.values(s.alerts)) if (!Number.isInteger(v) || v < 1 || v > 90) return false;
  if (!Number.isInteger(s.calendar.eventHour) || s.calendar.eventHour < 0 || s.calendar.eventHour > 22) return false;
  return typeof s.quotes.conditions === "string";
}

function validMethods(methods: unknown): methods is PaymentMethodOption[] {
  if (!Array.isArray(methods) || methods.length < 1 || methods.length > 12) return false;
  const ids = new Set<string>();
  for (const m of methods as Partial<PaymentMethodOption>[]) {
    if (!m || typeof m.id !== "string" || !/^[a-z0-9-]{1,24}$/.test(m.id) || ids.has(m.id)) return false;
    ids.add(m.id);
    if (typeof m.name !== "string" || !m.name.trim() || typeof m.detail !== "string") return false;
    if (typeof m.showOnDocs !== "boolean" || typeof m.active !== "boolean") return false;
  }
  // Al menos uno activo: sin medios no se puede registrar un pago.
  return (methods as PaymentMethodOption[]).some((m) => m.active);
}

export function saveSettingsStatement(db: D1Database, s: Settings): D1PreparedStatement {
  return db.prepare("INSERT INTO settings (key, value) VALUES ('app', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(s));
}

/** Consecutivo atómico (COT-0001, REC-0001, CC-0001…). El contador «invoice» (FAC-) ya no avanza. */
export async function nextNumber(db: D1Database, counter: "quote" | "receipt" | "collection"): Promise<number> {
  const row = await db.prepare("UPDATE counters SET value = value + 1 WHERE name = ? RETURNING value").bind(counter).first<{ value: number }>();
  if (!row) throw new Error(`counter ${counter} missing`);
  return row.value;
}

export const formatNumber = (prefix: "COT" | "REC" | "CC", n: number): string => `${prefix}-${String(n).padStart(4, "0")}`;

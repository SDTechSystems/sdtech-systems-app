const bogota = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" });

/** Fecha de hoy en Colombia, YYYY-MM-DD. */
export const todayBogota = (now: Date = new Date()): string => bogota.format(now);

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Vigente hasta el final de validUntil (inclusive). */
export const isExpired = (validUntil: string, today: string): boolean => today > validUntil;

export const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

const longDate = new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "UTC" });

/** "2026-12-25" → "25 de diciembre de 2026". */
export const formatLongDate = (date: string): string => longDate.format(new Date(`${date}T12:00:00Z`));

/** Día calendario en Bogotá de un instante ISO (no usar iso.slice(0, 10): eso es la fecha UTC). */
export const dayOf = (iso: string): string => todayBogota(new Date(iso));

export type Cycle = "mensual" | "anual";

/** Suma un mes o un año. Si el día no existe en el mes destino, usa el último día de ese mes. */
export function addCycle(date: string, cycle: Cycle): string {
  const [y, m, d] = date.split("-").map(Number);
  const months = cycle === "anual" ? 12 : 1;
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

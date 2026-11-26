import type { PaymentMethodOption } from "../../shared/types";

/** Id a partir del nombre: minúsculas, sin tildes, con guiones; si ya existe agrega -2, -3… */
export function newMethodId(name: string, existing: PaymentMethodOption[]): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "medio";
  const taken = new Set(existing.map((m) => m.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

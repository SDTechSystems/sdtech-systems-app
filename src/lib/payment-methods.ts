import type { Collection, PaymentMethodOption, PaymentPlan } from "../../shared/types";

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

/** Medio que se propone al registrar un pago: el primero activo en Ajustes. */
export const firstActiveMethod = (methods: PaymentMethodOption[]): string => methods.find((m) => m.active)?.id ?? "";

/** ¿Es el único medio activo? No se puede desactivar: sin medios no se puede registrar un pago. */
export const isLastActive = (methods: PaymentMethodOption[], i: number): boolean => !!methods[i]?.active && methods.filter((m) => m.active).length === 1;

/** Opción del registro de pago desde una cuenta de cobro: repartir entre sus promesas abiertas, por fecha. */
export const SPLIT_CHOICE = "split";
type Target = { plan?: PaymentPlan; collection?: Collection };

/** Lo que el selector «¿A qué compromiso corresponde?» propone: la promesa del botón, repartir (desde una cuenta) o la primera pendiente. */
export const defaultPlanChoice = (target: Target, choices: PaymentPlan[]): string =>
  target.plan?.id ?? (target.collection ? SPLIT_CHOICE : choices[0]?.id ?? "none");

/** La promesa que se manda a la API: null para un abono general o para que el servidor reparta entre las promesas de la cuenta. */
export const planIdToSend = (target: Target, choice: string): string | null =>
  target.plan?.id ?? (choice === "none" || choice === SPLIT_CHOICE ? null : choice);

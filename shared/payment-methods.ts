import type { PaymentMethodOption } from "./types";

/** Nombre del medio de pago; si ya no existe en Ajustes, el id tal cual. */
export function methodLabel(methods: PaymentMethodOption[], id: string): string {
  return methods.find((m) => m.id === id)?.name ?? id;
}

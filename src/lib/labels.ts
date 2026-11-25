import { formatMoney } from "../../shared/money";
import type { Billing, CatalogItem, Service } from "../../shared/types";
import { ApiError } from "./api";

export const SERVICE_LABEL: Record<Service, string> = {
  web: "Páginas web",
  marca: "Diseño de marca",
  software: "Software a medida",
  general: "General",
};

export const BILLING_SUFFIX: Record<Billing, string> = { unico: "", mensual: "/mes", anual: "/año" };
export const BILLING_LABEL: Record<Billing, string> = { unico: "Pago único", mensual: "Mensual", anual: "Anual" };

export function priceLabel(item: Pick<CatalogItem, "price" | "currency" | "billing" | "priceFrom">): string {
  if (item.price === 0) return "Gratis";
  return `${item.priceFrom ? "desde " : ""}${formatMoney(item.price, item.currency)}${BILLING_SUFFIX[item.billing]}`;
}

const ERRORS: Record<string, string> = {
  name_required: "Escribe el nombre",
  invalid_phone: "Revisa el número de WhatsApp",
  invalid_email: "Revisa el correo",
  invalid_price: "Revisa el precio",
  invalid_service: "Elige un servicio",
  already_exists: "Ese correo ya tiene acceso",
  cannot_remove_owner: "No se puede quitar al dueño",
  forbidden: "No tienes permiso para esto",
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return ERRORS[e.code] ?? `Algo salió mal (${e.code})`;
  return "No se pudo conectar. Revisa tu internet.";
}

export const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

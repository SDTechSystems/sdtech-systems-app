import { formatLongDate } from "../../shared/dates";
import { formatMoney } from "../../shared/money";
import { DEFAULT_TEMPLATES, fillTemplate } from "../../shared/templates";
import type { Billing, CatalogItem, PhaseStatus, ProjectStatus, Quote, QuoteStatus, Service, SubscriptionKind } from "../../shared/types";
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
  items_required: "Agrega al menos un ítem",
  invalid_items: "Revisa los ítems: cada uno necesita nombre, cantidad y precio",
  invalid_client: "Escoge un cliente",
  not_editable: "Esta cotización ya se envió; ya no se puede editar",
  not_approvable: "Esta cotización ya no se puede aprobar (vencida o ya aprobada)",
  not_renewable: "Solo se renuevan cotizaciones vencidas o rechazadas",
  invalid_date: "Revisa la fecha",
  invalid_settings: "Revisa los ajustes: anticipo entre 0 y 100 y vigencia entre 1 y 365 días",
  title_required: "Escribe el nombre del proyecto",
  cannot_remove_owner: "No se puede quitar al dueño",
  forbidden: "No tienes permiso para esto",
  lines_required: "No hay nada que cobrar todavía: agrega al menos una línea",
  nothing_paid: "Esa cuenta de cobro aún no tiene pagos: registra el pago antes de emitir el recibo",
  invalid_line: "Revisa las líneas: cada una necesita título, cantidad y valor",
  detail_too_long: "El detalle de una línea puede tener hasta 2.000 caracteres",
  invalid_plan: "Esa promesa ya está pagada o no es de este proyecto",
  plan_already_billed: "Esa promesa ya está en otra cuenta de cobro abierta",
  plan_in_collection: "Esa promesa está en una cuenta de cobro: anúlala primero",
  invalid_collection: "Esa cuenta de cobro ya no está vigente (anulada o de otro proyecto)",
  invalid_payment: "Revisa los pagos marcados: alguno no es de este proyecto",
  invalid_url: "El link de pago debe empezar por https://",
  delivery_url_required: "Primero guarda un link o sube la entrega",
  invalid_amount: "Revisa el valor: debe ser mayor que 0",
  invalid_method: "Elige un medio de pago activo",
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return ERRORS[e.code] ?? `Algo salió mal (${e.code})`;
  return "No se pudo conectar. Revisa tu internet.";
}

export const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

export const quoteStatusLabel: Record<QuoteStatus, string> = {
  draft: "Borrador",
  sent: "Enviada",
  approved: "Aprobada",
  rejected: "Rechazada",
  expired: "Vencida",
};

export const projectStatusLabel: Record<ProjectStatus, string> = { active: "En curso", paused: "En pausa", delivered: "Entregado", cancelled: "Cancelado" };
export const phaseStatusLabel: Record<PhaseStatus, string> = { pending: "Pendiente", in_progress: "En curso", done: "Hecha" };

export const firstName = (name: string): string => name.trim().split(/\s+/)[0];

export function quoteWhatsAppText(
  q: Pick<Quote, "number" | "total" | "currency" | "validUntil">,
  clientName: string,
  portalUrl: string,
  template: string = DEFAULT_TEMPLATES.quote,
): string {
  return fillTemplate(template, {
    nombre: firstName(clientName),
    numero: q.number,
    total: formatMoney(q.total, q.currency),
    link: portalUrl,
    vence: q.validUntil ? formatLongDate(q.validUntil) : "",
  });
}

export const formatDate = (date: string): string => formatLongDate(date);
export { signedMoney } from "../../shared/money";

export const SUBSCRIPTION_KIND_LABEL: Record<SubscriptionKind, string> = {
  hosting: "Hosting",
  dominio: "Dominio",
  mantenimiento: "Mantenimiento",
  soporte: "Soporte",
  otro: "Otro",
};

const ACTIVITY: Record<string, string> = {
  create: "Creó el registro",
  update: "Actualizó los datos",
  phase: "Cambió una fase",
  add_phase: "Agregó una fase o ronda",
  delete_phase: "Quitó una ronda",
  payment: "Registró un pago",
  delete_payment: "Borró un pago",
  add_payment_plan: "Agregó un compromiso de pago",
  update_payment_plan: "Actualizó un compromiso de pago",
  delete_payment_plan: "Borró un compromiso de pago",
  reminder: "Envió un recordatorio por WhatsApp",
  meeting: "Agendó una reunión",
  change_created: "Creó un cambio de costo",
  change_approved: "Se aprobó un cambio de costo",
  change_rejected: "Se rechazó un cambio de costo",
  change_deleted: "Borró un cambio de costo",
  adjustment_requested: "El cliente pidió un ajuste",
  adjustment_resolved: "Marcó un ajuste como hecho",
  delivery_released: "Liberó la entrega",
  delivery_withdrawn: "Retiró la entrega",
  invoice_issued: "Emitió un recibo de pago",
  invoice_voided: "Anuló un recibo de pago",
  collection_issued: "Emitió una cuenta de cobro",
  collection_voided: "Anuló una cuenta de cobro",
  collection_total: "Cambió el total con una cuenta de cobro",
};
export const activityLabel = (action: string): string => ACTIVITY[action] ?? action;

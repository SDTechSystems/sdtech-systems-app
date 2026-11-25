import { formatLongDate, meetingDayLabel, meetingTime24Label } from "../../shared/dates";
import { formatMoney } from "../../shared/money";
import { waLink } from "../../shared/phone";
import type { TemplateKey } from "../../shared/templates";
import type { Currency, Meeting, PaymentPlan, Project, Settings, Subscription } from "../../shared/types";
import { apiSend } from "./api";
import { firstName } from "./labels";

export function paymentVars(plan: Pick<PaymentPlan, "label" | "amount" | "paidAmount" | "dueDate">, currency: Currency, clientName: string, settings: Pick<Settings, "payment">, portalUrl: string) {
  return {
    nombre: firstName(clientName),
    concepto: plan.label,
    monto: formatMoney(Math.max(plan.amount - plan.paidAmount, 0), currency),
    fecha: formatLongDate(plan.dueDate),
    llave: settings.payment.brebKey,
    banco: settings.payment.bank,
    link: portalUrl,
  };
}

export function progressVars(project: Pick<Project, "title" | "progress" | "phases">, clientName: string, portalUrl: string) {
  const top = project.phases.filter((f) => !f.parentId);
  const current = top.find((f) => f.status === "in_progress") ?? [...top].reverse().find((f) => f.status === "done") ?? top[0];
  return { nombre: firstName(clientName), proyecto: project.title, fase: current?.name ?? "", avance: String(project.progress), link: portalUrl };
}

/**
 * Abre WhatsApp con el texto. Sin teléfono, lo copia al portapapeles y devuelve false.
 * Llamar sin await previo (o con la pestaña ya abierta) para que el navegador no bloquee la ventana.
 */
export function openWhatsApp(phone: string | null, text: string, tab: Window | null = null): boolean {
  if (phone) {
    const url = waLink(phone, text);
    if (tab) tab.location.href = url;
    else window.open(url, "_blank");
    return true;
  }
  tab?.close();
  void navigator.clipboard?.writeText(text).catch(() => undefined);
  return false;
}

export const logReminder = (entityType: "project" | "quote" | "payment_plan" | "client", entityId: string, kind: TemplateKey) =>
  apiSend("POST", "/api/admin/reminders", { entityType, entityId, kind }).catch(() => undefined);

export function meetingVars(meeting: Pick<Meeting, "startAt" | "meetUrl">, clientName: string) {
  return { nombre: firstName(clientName), fecha: meetingDayLabel(meeting.startAt), hora: meetingTime24Label(meeting.startAt), meet: meeting.meetUrl ?? "" };
}

export function subscriptionVars(sub: Pick<Subscription, "name" | "amount" | "currency" | "nextDue" | "clientName">, settings: Pick<Settings, "payment">) {
  return {
    nombre: firstName(sub.clientName),
    servicio: sub.name,
    monto: formatMoney(sub.amount, sub.currency),
    fecha: formatLongDate(sub.nextDue),
    llave: settings.payment.brebKey,
    banco: settings.payment.bank,
  };
}

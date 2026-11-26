import { dayOf, formatLongDate } from "../dates";
import { formatMoney } from "../money";
import type { Quote, Settings } from "../types";
import { docCompany, docParty, type DocClient, type DocModel } from "./model";

export function quoteDocModel(q: Quote, client: DocClient, settings: Settings, portalUrl: string): DocModel {
  const s = settings.payment;
  const payItem =
    q.currency === "USD"
      ? { name: s.usdText || "Datos de pago en dólares: te los enviamos por chat.", detail: "" }
      : { name: "Llave Bre-B", detail: `${s.brebKey} · ${s.bank}` };
  const facts = [{ label: "Válida hasta", value: q.validUntil ? formatLongDate(q.validUntil) : "—" }];
  if (q.advancePercent > 0) facts.push({ label: `Anticipo requerido (${q.advancePercent}%)`, value: formatMoney(q.advanceAmount, q.currency) });
  return {
    kind: "quote",
    title: "COTIZACIÓN",
    number: q.number,
    issuedOn: q.issuedAt ? dayOf(q.issuedAt) : "",
    currency: q.currency,
    voided: false,
    company: docCompany(settings),
    party: docParty(client),
    from: null,
    intro: null,
    lines: q.items.map((i) => ({ title: i.title, detail: i.detail, quantity: i.quantity, unitPrice: i.unitPrice, total: i.quantity * i.unitPrice })),
    totals: [{ label: "Total", amount: q.total, tone: "grand" }],
    facts,
    payment: { title: "Pago", items: [payItem] },
    links: [],
    note: q.notes.trim() || null,
    conditions: q.conditions.split("\n").map((l) => l.trim()).filter(Boolean),
    thanks: null,
    footer: {
      qrUrl: portalUrl,
      qrCaption: "Escanea el código o entra a tu página de seguimiento para aprobar esta cotización y ver el avance de tu proyecto.",
      verifyCode: null,
      verifyUrl: null,
    },
  };
}

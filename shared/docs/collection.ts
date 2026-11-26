import { dayOf, formatLongDate } from "../dates";
import type { Collection, Settings } from "../types";
import { amountInWords } from "../words";
import { docCompany, docParty, type DocModel } from "./model";

/** Cuenta de cobro: redacción cordial, nunca «DEBE A». */
export function collectionDocModel(c: Collection, settings: Settings, portalUrl: string): DocModel {
  const company = docCompany(settings);
  const facts = c.dueDate ? [{ label: "Fecha acordada de pago", value: formatLongDate(c.dueDate) }] : [];
  facts.push({ label: "Proyecto", value: c.projectTitle });
  const links = [
    ...(c.paymentUrl ? [{ label: "Pagar en línea", url: c.paymentUrl }] : []),
    ...(c.deliveryUrl ? [{ label: "Tu entrega", url: c.deliveryUrl }] : []),
  ];
  return {
    kind: "collection",
    title: "CUENTA DE COBRO",
    number: c.number,
    issuedOn: dayOf(c.issuedAt),
    currency: c.currency,
    voided: c.status === "voided",
    company,
    party: docParty(c.client),
    from: company.nit ? `${company.name} · NIT ${company.nit}` : company.name,
    intro: { text: "Por los servicios prestados, el valor a pagar es:", amount: c.total, words: amountInWords(c.total, c.currency) },
    lines: c.lines,
    totals: [{ label: "Total", amount: c.total, tone: "grand" }],
    facts,
    payment: c.methods.length ? { title: "Medios de pago", items: c.methods } : null,
    links,
    note: c.note,
    conditions: [],
    thanks: "Gracias por confiar en SD Tech Systems.",
    smallPrint: null,
    footer: { qrUrl: portalUrl, qrCaption: "Escanea para ver tu proyecto, tus cuentas de cobro y tus pagos.", verifyCode: null, verifyUrl: null },
  };
}

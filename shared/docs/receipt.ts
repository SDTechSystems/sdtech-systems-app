import { dayOf, formatLongDate } from "../dates";
import { formatMoney } from "../money";
import { methodLabel } from "../payment-methods";
import type { Invoice, Settings } from "../types";
import { docCompany, docParty, verifyUrl, type DocModel } from "./model";

/**
 * Recibo de pago (antes «factura»): también los FAC- viejos se titulan «RECIBO DE PAGO».
 * Un REC- muestra su total y los pagos que lo cubren; lo que falta se lee en «Saldo del proyecto»
 * (sin él si el proyecto no tiene total). Los FAC- se muestran como se emitieron, con su «Saldo».
 */
export function receiptDocModel(inv: Invoice, settings: Settings, portalUrl: string): DocModel {
  const legacy = inv.number.startsWith("FAC-");
  return {
    kind: "receipt",
    title: "RECIBO DE PAGO",
    number: inv.number,
    issuedOn: dayOf(inv.issuedAt),
    currency: inv.currency,
    voided: inv.voided,
    company: docCompany(settings),
    party: docParty(inv.client),
    from: null,
    intro: null,
    lines: inv.lines.map((l) => ({ title: l.title, detail: l.detail, quantity: l.quantity, unitPrice: l.unitPrice, total: l.total })),
    totals: [
      { label: "Total", amount: inv.total, tone: "grand" },
      ...inv.payments.map((p) => ({ label: `Pago ${methodLabel(settings.payment.methods, p.method)} · ${formatLongDate(p.paidOn)}`, amount: p.amount, tone: "minus" as const })),
      ...(legacy ? [{ label: "Saldo", amount: Math.max(inv.balance, 0), tone: "balance" as const }] : []),
    ],
    facts: [
      { label: "Proyecto", value: inv.projectTitle },
      ...(inv.collectionNumber ? [{ label: "Cuenta de cobro", value: inv.collectionNumber }] : []),
      ...(!legacy && inv.projectBalance !== null ? [{ label: "Saldo del proyecto", value: formatMoney(Math.max(inv.projectBalance, 0), inv.currency) }] : []),
    ],
    payment: null,
    links: [],
    note: null,
    conditions: [],
    thanks: null,
    smallPrint: null,
    footer: {
      qrUrl: portalUrl,
      qrCaption: "Escanea para ver tu proyecto, tus servicios y tus pagos.",
      verifyCode: inv.verifyCode,
      verifyUrl: verifyUrl(inv.verifyCode),
    },
  };
}

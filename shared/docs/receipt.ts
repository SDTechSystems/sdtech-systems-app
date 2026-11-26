import { dayOf, formatLongDate } from "../dates";
import { methodLabel } from "../payment-methods";
import type { Invoice, Settings } from "../types";
import { docCompany, docParty, type DocModel } from "./model";

const VERIFY_BASE = "clientes.sdtechsystems.dev/verificar/";

/** Recibo de pago (antes «factura»): también los FAC- viejos se titulan «RECIBO DE PAGO». */
export function receiptDocModel(inv: Invoice, settings: Settings, portalUrl: string): DocModel {
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
      { label: "Saldo", amount: Math.max(inv.balance, 0), tone: "balance" },
    ],
    facts: [{ label: "Proyecto", value: inv.projectTitle }],
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
      verifyUrl: `${VERIFY_BASE}${inv.verifyCode}`,
    },
  };
}

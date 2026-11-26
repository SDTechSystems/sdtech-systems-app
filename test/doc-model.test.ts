import { describe, expect, it } from "vitest";
import { quoteDocModel } from "../shared/docs/quote";
import { receiptDocModel } from "../shared/docs/receipt";
import { DEFAULT_SETTINGS } from "../worker/settings";
import type { Invoice, Quote, Settings } from "../shared/types";

const THIRD_PARTY = "Los costos de terceros (dominio, hosting, plataformas) pueden variar según el proveedor y la tasa de cambio.";
const PORTAL = "https://clientes.sdtechsystems.dev/c/abc";
const client = { name: "María Gómez", company: "Jen Essence", document: "1234", city: "Medellín", phone: "573058147293", email: "maria@example.com" };

const quote: Quote = {
  id: "q1",
  number: "COT-0001",
  clientId: "c1",
  clientName: "María Gómez",
  service: "web",
  currency: "COP",
  status: "sent",
  items: [
    { id: "i1", title: "Landing page", detail: "Una página", quantity: 1, unitPrice: 650000, catalogItemId: null },
    { id: "i2", title: "Página adicional", detail: "", quantity: 2, unitPrice: 120000, catalogItemId: null },
  ],
  total: 890000,
  advancePercent: 50,
  advanceAmount: 445000,
  notes: "Incluye hosting el primer año",
  conditions: "Primera condición\n\n  Segunda condición  ",
  issuedAt: "2026-11-26T01:30:00.000Z",
  validUntil: "2026-12-25",
  approvedAt: null,
  approvedBy: null,
  approvedName: null,
  clientComment: null,
  projectId: null,
  createdAt: "2026-11-25T00:00:00.000Z",
};

const invoice = (number: string): Invoice => ({
  id: "inv1",
  number,
  projectId: "p1",
  clientId: "c1",
  issuedAt: "2026-11-26T15:00:00.000Z",
  currency: "COP",
  total: 920000,
  paid: 385000,
  balance: 535000,
  verifyCode: "ABCDEFGHJK",
  voided: false,
  projectTitle: "Web Jen Essence",
  lines: [{ title: "Landing page", detail: "", quantity: 1, unitPrice: 920000, total: 920000 }],
  payments: [{ paidOn: "2026-11-25", method: "breb", amount: 385000 }],
  client,
});

const withNit: Settings = { ...DEFAULT_SETTINGS, company: { ...DEFAULT_SETTINGS.company, nit: "901.234.567-8" } };

describe("document model", () => {
  it("quote model keeps the Bre-B payment line only", () => {
    const m = quoteDocModel(quote, client, DEFAULT_SETTINGS, PORTAL);
    expect(m.payment).toEqual({ title: "Pago", items: [{ name: "Llave Bre-B", detail: "3058147293 · Davibank" }] });
  });

  it("quote model carries the quote's lines, totals, dates and conditions", () => {
    const m = quoteDocModel(quote, client, withNit, PORTAL);
    expect(m).toMatchObject({ kind: "quote", title: "COTIZACIÓN", number: "COT-0001", issuedOn: "2026-11-25", currency: "COP", voided: false, from: null, intro: null });
    expect(m.company).toEqual({ name: "SD Tech Systems", nit: "901.234.567-8", phone: "+57 305 814 7293", email: "contacto@sdtechsystems.dev", website: "sdtechsystems.dev", taxNote: "No responsable de IVA" });
    expect(m.party).toEqual({ name: "María Gómez", lines: ["Jen Essence", "Documento: 1234", "Medellín", "+573058147293", "maria@example.com"] });
    expect(m.lines.map((l) => l.total)).toEqual([650000, 240000]);
    expect(m.totals).toEqual([{ label: "Total", amount: 890000, tone: "grand" }]);
    expect(m.facts).toEqual([
      { label: "Válida hasta", value: "25 de diciembre de 2026" },
      { label: "Anticipo requerido (50%)", value: "$ 445.000" },
    ]);
    expect(m.note).toBe("Incluye hosting el primer año");
    expect(m.conditions).toEqual(["Primera condición", "Segunda condición"]);
    expect(m.footer).toMatchObject({ qrUrl: PORTAL, verifyCode: null, verifyUrl: null });
    expect(m.smallPrint).toBe(THIRD_PARTY);
  });

  it("quote model keeps the third-party costs note even when the conditions are empty", () => {
    const m = quoteDocModel({ ...quote, conditions: "" }, client, DEFAULT_SETTINGS, PORTAL);
    expect(m.conditions).toEqual([]);
    expect(m.smallPrint).toBe(THIRD_PARTY);
  });

  it("quote model in dollars uses the dollar payment text", () => {
    const usd = { ...DEFAULT_SETTINGS, payment: { ...DEFAULT_SETTINGS.payment, usdText: "PayPal: pagos@sdtechsystems.dev" } };
    const m = quoteDocModel({ ...quote, currency: "USD", advancePercent: 0 }, client, usd, PORTAL);
    expect(m.payment?.items).toEqual([{ name: "PayPal: pagos@sdtechsystems.dev", detail: "" }]);
    expect(m.facts.map((f) => f.label)).toEqual(["Válida hasta"]);
  });

  it("receipt model titles FAC- and REC- documents as RECIBO DE PAGO", () => {
    for (const n of ["FAC-0001", "REC-0001"]) {
      const m = receiptDocModel(invoice(n), DEFAULT_SETTINGS, PORTAL);
      expect(m.title).toBe("RECIBO DE PAGO");
      expect(m.number).toBe(n);
      expect(m.kind).toBe("receipt");
    }
  });

  it("receipt model lists payments with their method name, the balance and the verification code", () => {
    const m = receiptDocModel(invoice("FAC-0001"), DEFAULT_SETTINGS, PORTAL);
    expect(m.issuedOn).toBe("2026-11-26");
    expect(m.totals).toEqual([
      { label: "Total", amount: 920000, tone: "grand" },
      { label: "Pago Bre-B · 25 de noviembre de 2026", amount: 385000, tone: "minus" },
      { label: "Saldo", amount: 535000, tone: "balance" },
    ]);
    expect(m.facts).toEqual([{ label: "Proyecto", value: "Web Jen Essence" }]);
    expect(m.footer).toMatchObject({ qrUrl: PORTAL, verifyCode: "ABCDEFGHJK", verifyUrl: "clientes.sdtechsystems.dev/verificar/ABCDEFGHJK" });
    expect(m.company.taxNote).toBe("No responsable de IVA");
    expect(m.smallPrint).toBeNull();
  });
});

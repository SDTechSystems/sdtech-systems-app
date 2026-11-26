import { describe, expect, it } from "vitest";
import { defaultReceiptPayments, lineInvalid, linesTotal, newLinesTotal, pendingToBill, receiptLines, shortcutLines, toLineInputs, type EditorLine } from "../src/lib/doc-lines";
import type { ChangeRequest, Collection, Invoice, Payment, PaymentPlan, PaymentSummary, Quote } from "../shared/types";

const plan = (p: Partial<PaymentPlan>): PaymentPlan => ({ id: "p1", projectId: "pr", label: "Pago", amount: 450000, dueDate: "2026-12-05", status: "pending", paidAt: null, paidAmount: 0, ...p });
const summary = (s: Partial<PaymentSummary> = {}): PaymentSummary => ({ currency: "COP", baseTotal: 0, changesTotal: 0, total: 0, paid: 0, balance: 0, plans: [], payments: [], ...s });
const collection = (c: Partial<Collection>): Collection => ({ id: "c1", number: "CC-0001", status: "pending", total: 0, paid: 0, planIds: [], paymentIds: [], lines: [], ...c }) as Collection;
const line = (l: Partial<EditorLine>): EditorLine => ({ key: "k", source: "free", title: "Ronda", detail: "", quantity: "1", price: "", locked: false, ...l });
const quote = { items: [{ id: "i1", title: "Logo", detail: "2 propuestas", quantity: 1, unitPrice: 400000, catalogItemId: null }] } as Quote;
const approved = (amount: number, description = "Ronda extra"): ChangeRequest => ({ id: description, kind: "cost", status: "approved", amount, description }) as ChangeRequest;
const base = { quote: null, changes: [], advancePercent: 50 };

describe("doc lines", () => {
  it("pendingToBill subtracts what open collections already bill", () => {
    const s = summary({ total: 450000, baseTotal: 450000, balance: 450000 });
    const open = [collection({ total: 225000, status: "pending" }), collection({ total: 100000, paid: 100000, status: "paid" }), collection({ total: 50000, status: "voided" })];
    expect(pendingToBill(s, open)).toBe(225000);
    expect(pendingToBill(s, [collection({ total: 300000, paid: 100000, status: "partial" })])).toBe(250000);
    expect(pendingToBill(s, [collection({ total: 900000, status: "pending" })])).toBe(0);
  });

  it("shortcuts include one locked line per unpaid promise with its remaining amount", () => {
    const s = summary({
      plans: [plan({ id: "a", label: "Anticipo", amount: 400000, paidAmount: 150000 }), plan({ id: "b", label: "Saldo", status: "paid", paidAmount: 450000 }), plan({ id: "c", label: "Cuota 2", amount: 200000, status: "overdue" })],
    });
    const plans = shortcutLines({ ...base, summary: s, collections: [] }).filter((x) => x.lines[0].source === "plan");
    expect(plans.map((p) => p.lines[0])).toEqual([
      expect.objectContaining({ source: "plan", planId: "a", title: "Anticipo", quantity: "1", price: "250.000", locked: true }),
      expect.objectContaining({ source: "plan", planId: "c", title: "Cuota 2", price: "200.000", locked: true }),
    ]);
    // Una promesa que ya cobra otra cuenta abierta no se ofrece (el servidor la rechazaría).
    const billed = shortcutLines({ ...base, summary: s, collections: [collection({ planIds: ["a"], total: 250000 })] });
    expect(billed.flatMap((x) => x.lines.map((l) => l.planId)).filter(Boolean)).toEqual(["c"]);
  });

  it("in a receipt, offers every promise at its full amount, paid or not", () => {
    const s = summary({ plans: [plan({ id: "a", amount: 400000, paidAmount: 400000, status: "paid" }), plan({ id: "b", amount: 200000, paidAmount: 50000 })] });
    const cuts = shortcutLines({ ...base, summary: s, collections: [collection({ planIds: ["b"], total: 150000 })], receipt: true });
    expect(cuts.map((x) => [x.key, x.lines[0].price])).toEqual([
      ["plan:a", "400.000"],
      ["plan:b", "200.000"],
    ]);
  });

  it("no balance or advance shortcut when the project has no total", () => {
    const keys = shortcutLines({ ...base, summary: summary({ plans: [plan({})] }), collections: [] }).map((x) => x.key);
    expect(keys).toEqual(["plan:p1"]);
    const withTotal = shortcutLines({ ...base, summary: summary({ total: 800000, baseTotal: 800000, balance: 800000 }), collections: [] });
    expect(withTotal.map((x) => [x.label, x.lines[0].price])).toEqual([
      ["Saldo pendiente", "800.000"],
      ["Anticipo 50 %", "400.000"],
    ]);
  });

  it("offers the quote items and the approved cost changes", () => {
    const s = summary({ total: 550000, baseTotal: 400000, changesTotal: 150000, balance: 0, paid: 550000 });
    const cuts = shortcutLines({ ...base, summary: s, collections: [], quote, changes: [approved(150000), approved(-20000, "Descuento"), { ...approved(90000, "Pendiente"), status: "pending" }] });
    expect(cuts.map((x) => x.label)).toEqual(["Anticipo 50 %", "Ítems de la cotización", "Cambios aprobados"]);
    expect(cuts[1].lines).toEqual([expect.objectContaining({ source: "quote", title: "Logo", detail: "2 propuestas", quantity: "1", price: "400.000", locked: false })]);
    expect(cuts[2].lines).toEqual([expect.objectContaining({ source: "change", title: "Cambio aprobado: Ronda extra", price: "150.000" })]);
  });

  it("newLinesTotal counts only catalog and free lines", () => {
    const lines = [
      line({ source: "plan", price: "450.000", locked: true }),
      line({ source: "catalog", quantity: "2", price: "100.000" }),
      line({ source: "free", price: "50.000" }),
      line({ source: "quote", price: "300.000" }),
      line({ source: "free", price: "" }),
    ];
    expect(newLinesTotal(lines, "COP")).toBe(250000);
    expect(linesTotal(lines, "COP")).toBe(1000000);
    expect(newLinesTotal([line({ price: "12,50" })], "USD")).toBe(1250);
  });

  it("validates lines and turns them into the API input", () => {
    expect(lineInvalid(line({ price: "" }), "COP")).toBe(true);
    expect(lineInvalid(line({ title: " ", price: "1" }), "COP")).toBe(true);
    expect(lineInvalid(line({ quantity: "0", price: "1" }), "COP")).toBe(true);
    expect(lineInvalid(line({ price: "0" }), "COP")).toBe(false);
    expect(
      toLineInputs([line({ source: "plan", planId: "p1", title: "Pago", price: "450.000", locked: true }), line({ source: "catalog", title: " Kit ", detail: "x", quantity: "2", price: "100.000" })], "COP"),
    ).toEqual([
      { source: "plan", planId: "p1", title: "Pago", detail: "", quantity: 1, unitPrice: 450000 },
      { source: "catalog", title: "Kit", detail: "x", quantity: 2, unitPrice: 100000 },
    ]);
  });

  it("builds a receipt from the quote and changes, or from the project total", () => {
    const s = summary({ total: 550000, baseTotal: 400000, changesTotal: 150000 });
    expect(receiptLines({ summary: s, quote, changes: [approved(150000)], projectTitle: "Jen Essence" }).map((l) => [l.title, l.price])).toEqual([
      ["Logo", "400.000"],
      ["Cambio aprobado: Ronda extra", "150.000"],
    ]);
    expect(receiptLines({ summary: summary({ total: 450000, baseTotal: 450000 }), quote: null, changes: [], projectTitle: "Jen Essence" }).map((l) => [l.title, l.price])).toEqual([["Jen Essence", "450.000"]]);
    expect(receiptLines({ summary: summary(), quote: null, changes: [], projectTitle: "Jen Essence" })).toEqual([]);
  });

  it("preselects the payments no other live receipt covers", () => {
    const payments = [{ id: "x" }, { id: "y" }, { id: "z" }] as Payment[];
    const receipts = [{ voided: false, paymentIds: ["x"] }, { voided: true, paymentIds: ["y"] }] as Invoice[];
    expect(defaultReceiptPayments(payments, receipts, null)).toEqual(["y", "z"]);
    expect(defaultReceiptPayments(payments, receipts, collection({ paymentIds: ["x", "z"] }))).toEqual(["z"]);
  });
});

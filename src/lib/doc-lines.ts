import { parseMoneyInput } from "../../shared/money";
import type { ChangeRequest, Collection, CollectionLineInput, CollectionLineSource, Currency, Invoice, Payment, PaymentSummary, Quote } from "../../shared/types";
import { priceText } from "./money-input";

/** Una línea del editor de cuenta de cobro / recibo, tal como se escribe (cantidad y valor en texto). */
export interface EditorLine {
  key: string;
  source: CollectionLineSource;
  planId?: string;
  title: string;
  detail: string;
  quantity: string;
  price: string;
  /** Valor del catálogo que se sugiere como placeholder. */
  suggested?: string;
  /** Las de promesa: el valor se cambia en Pagos, no aquí. */
  locked: boolean;
}

/** Atajo del editor: una píldora que agrega una o varias líneas (los ítems de la cotización van juntos). */
export interface Shortcut {
  key: string;
  label: string;
  lines: EditorLine[];
}

/** Solo `catalog` y `free` son trabajo nuevo, lo único que «Sumar al total del proyecto» agrega. */
const NEW_WORK: CollectionLineSource[] = ["catalog", "free"];

const isOpen = (c: Collection) => c.status === "pending" || c.status === "partial";

/** Saldo del proyecto menos lo que ya cobran las cuentas abiertas, para no cobrar dos veces lo mismo. */
export function pendingToBill(summary: PaymentSummary, collections: Collection[]): number {
  const billed = collections.filter(isOpen).reduce((s, c) => s + c.total - c.paid, 0);
  return Math.max(0, summary.balance - billed);
}

const line = (key: string, source: CollectionLineSource, title: string, amount: number, currency: Currency, extra: Partial<EditorLine> = {}): EditorLine => ({
  key,
  source,
  title,
  detail: "",
  quantity: "1",
  price: priceText(amount, currency),
  locked: false,
  ...extra,
});

const quoteLines = (quote: Quote | null, currency: Currency): EditorLine[] =>
  (quote?.items ?? []).map((i, n) => line(`quote#${n}`, "quote", i.title, i.unitPrice, currency, { detail: i.detail, quantity: String(i.quantity) }));

const changeLines = (changes: ChangeRequest[], currency: Currency): EditorLine[] =>
  changes
    // Una línea no puede ser negativa: los cambios que restan no se ofrecen como línea.
    .filter((c) => c.kind === "cost" && c.status === "approved" && (c.amount ?? 0) > 0)
    .map((c, n) => line(`change#${n}`, "change", `Cambio aprobado: ${c.description}`, c.amount!, currency));

/**
 * Las píldoras del editor. En una cuenta de cobro, cada promesa sin pagar entra por lo que le falta; en un
 * recibo (`receipt`), cualquier promesa entra por su valor completo, pagada o no, como la cobra el servidor.
 */
export function shortcutLines(input: { summary: PaymentSummary; collections: Collection[]; quote: Quote | null; changes: ChangeRequest[]; advancePercent: number; receipt?: boolean }): Shortcut[] {
  const { summary, collections, quote, changes, advancePercent, receipt = false } = input;
  const cur = summary.currency;
  const out: Shortcut[] = [];
  const hasTotal = summary.total > 0;
  const pending = pendingToBill(summary, collections);
  if (hasTotal && pending > 0) out.push({ key: "balance", label: "Saldo pendiente", lines: [line("balance", "balance", "Saldo pendiente", pending, cur)] });
  if (hasTotal && advancePercent > 0) {
    const label = `Anticipo ${advancePercent} %`;
    out.push({ key: "advance", label, lines: [line("advance", "advance", label, Math.round((summary.total * advancePercent) / 100), cur)] });
  }
  // Una promesa que ya cobra otra cuenta abierta no se ofrece: el servidor la rechazaría.
  const billed = new Set(collections.filter(isOpen).flatMap((c) => c.planIds));
  for (const p of summary.plans) {
    const value = receipt ? p.amount : p.amount - p.paidAmount;
    if (!receipt && (p.status === "paid" || value <= 0 || billed.has(p.id))) continue;
    const key = `plan:${p.id}`;
    out.push({ key, label: p.label, lines: [line(key, "plan", p.label, value, cur, { planId: p.id, locked: true })] });
  }
  const fromQuote = quoteLines(quote, cur);
  if (fromQuote.length) out.push({ key: "quote", label: "Ítems de la cotización", lines: fromQuote });
  const fromChanges = changeLines(changes, cur);
  if (fromChanges.length) out.push({ key: "change", label: "Cambios aprobados", lines: fromChanges });
  return out;
}

/** El atajo del que salió una línea (`quote#2` → `quote`). */
export const shortcutOf = (l: EditorLine): string => l.key.split("#")[0];

export const parseQuantity = (q: string): number | null => (/^\s*\d+\s*$/.test(q) && Number.parseInt(q, 10) >= 1 ? Number.parseInt(q, 10) : null);

const lineValue = (l: EditorLine, currency: Currency): number => {
  const q = parseQuantity(l.quantity);
  const p = parseMoneyInput(l.price, currency);
  return q !== null && p !== null ? q * p : 0;
};

/** Total de todas las líneas que ya tienen cantidad y valor. */
export const linesTotal = (lines: EditorLine[], currency: Currency): number => lines.reduce((s, l) => s + lineValue(l, currency), 0);

/** Lo que suman las líneas de trabajo nuevo (catálogo y libres). */
export const newLinesTotal = (lines: EditorLine[], currency: Currency): number => linesTotal(lines.filter((l) => NEW_WORK.includes(l.source)), currency);

/** ¿Le falta algo a la línea? (título; y cantidad y valor si no es de promesa). */
export const lineInvalid = (l: EditorLine, currency: Currency): boolean =>
  !l.title.trim() || (!l.locked && (parseQuantity(l.quantity) === null || parseMoneyInput(l.price, currency) === null));

/** Las líneas como las recibe la API. Úsese después de `lineInvalid`. */
export const toLineInputs = (lines: EditorLine[], currency: Currency): CollectionLineInput[] =>
  lines.map((l) => ({
    source: l.source,
    ...(l.planId ? { planId: l.planId } : {}),
    title: l.title.trim(),
    detail: l.detail.trim(),
    quantity: parseQuantity(l.quantity) ?? 1,
    unitPrice: parseMoneyInput(l.price, currency) ?? 0,
  }));

/** Recibo sin cuenta de cobro: ítems de la cotización más cambios aprobados, o el total del proyecto. */
export function receiptLines(input: { summary: PaymentSummary; quote: Quote | null; changes: ChangeRequest[]; projectTitle: string }): EditorLine[] {
  const { summary, quote, changes, projectTitle } = input;
  const cur = summary.currency;
  const fromQuote = quoteLines(quote, cur);
  const base = fromQuote.length ? fromQuote : summary.baseTotal > 0 ? [line("total", "free", projectTitle, summary.baseTotal, cur)] : [];
  return [...base, ...changeLines(changes, cur)];
}

/** Recibo de una cuenta de cobro: sus mismas líneas. */
export const collectionLines = (c: Collection): EditorLine[] =>
  c.lines.map((l, n) => line(`cc#${n}`, "free", l.title, l.unitPrice, c.currency, { detail: l.detail, quantity: String(l.quantity) }));

/** Pagos marcados por defecto en el recibo: los que no muestra otro recibo no anulado (de la cuenta, o del proyecto). */
export function defaultReceiptPayments(payments: Payment[], receipts: Invoice[], collection: Collection | null): string[] {
  const covered = new Set(receipts.filter((r) => !r.voided).flatMap((r) => r.paymentIds));
  const pool = collection ? collection.paymentIds : payments.map((p) => p.id);
  return pool.filter((id) => !covered.has(id));
}

import type { Invoice } from "../../shared/types";

interface Row {
  id: string;
  number: string;
  project_id: string;
  client_id: string;
  issued_at: string;
  currency: Invoice["currency"];
  snapshot: string;
  total: number;
  paid: number;
  balance: number;
  verify_code: string;
  voided_at: string | null;
}

const COLUMNS = "id, number, project_id, client_id, issued_at, currency, snapshot, total, paid, balance, verify_code, voided_at";

const toInvoice = (r: Row): Invoice => {
  const snap = JSON.parse(r.snapshot) as Pick<Invoice, "lines" | "payments" | "projectTitle" | "client">;
  return {
    id: r.id,
    number: r.number,
    projectId: r.project_id,
    clientId: r.client_id,
    issuedAt: r.issued_at,
    currency: r.currency,
    total: r.total,
    paid: r.paid,
    balance: r.balance,
    verifyCode: r.verify_code,
    voided: !!r.voided_at,
    ...snap,
  };
};

export async function listInvoices(db: D1Database, filter: { projectId?: string; clientId?: string }): Promise<Invoice[]> {
  const where = filter.projectId ? "project_id = ?" : "client_id = ?";
  const { results } = await db.prepare(`SELECT ${COLUMNS} FROM invoices WHERE ${where} ORDER BY issued_at DESC`).bind(filter.projectId ?? filter.clientId).all<Row>();
  return results.map(toInvoice);
}

export async function findInvoice(db: D1Database, by: "id" | "number" | "verify_code", value: string): Promise<Invoice | null> {
  const r = await db.prepare(`SELECT ${COLUMNS} FROM invoices WHERE ${by} = ?`).bind(value).first<Row>();
  return r ? toInvoice(r) : null;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** 10 caracteres sin I, O, 0 ni 1 (fáciles de dictar o copiar). */
export function newVerifyCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

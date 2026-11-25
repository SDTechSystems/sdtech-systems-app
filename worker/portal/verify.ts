import { dayOf, formatLongDate } from "../../shared/dates";
import { formatMoney } from "../../shared/money";
import { findInvoice } from "../invoices/repo";
import { esc, page } from "./html";

const CSS = `body{min-height:100vh;display:grid;place-items:center;padding:24px;text-align:center}main{animation:arrive .7s ease-out both;max-width:420px}img{width:min(240px,65vw);margin:auto}
.card{margin-top:26px;background:linear-gradient(180deg,rgba(12,32,58,.95),rgba(9,24,45,.95));border:1px solid #24406a;border-radius:18px;padding:22px}
.status{display:inline-flex;align-items:center;gap:8px;font:.75rem "SD Mono",monospace;letter-spacing:.08em;border-radius:999px;padding:7px 12px;margin-bottom:14px}
.ok{background:#11362a}.ok::before,.bad::before{content:"";width:8px;height:8px;border-radius:50%}.ok::before{background:#34d399}.bad{background:#3a1d26}.bad::before{background:#fb7185}
dl{display:grid;grid-template-columns:auto 1fr;gap:8px 14px;text-align:left;margin:0}dt{color:var(--muted);font-size:.85rem}dd{margin:0;font-weight:700}p{color:var(--muted)}`;

/** Nombre y la inicial del apellido: "María Gómez" → "María G." */
const shortName = (name: string) => {
  const [first, second] = name.trim().split(/\s+/);
  return second ? `${first} ${second[0]}.` : first;
};

export async function renderVerify(db: D1Database, code: string): Promise<Response> {
  const inv = /^[A-Z0-9]{10}$/.test(code) ? await findInvoice(db, "verify_code", code) : null;
  if (!inv) {
    return page("Verificación de factura", `<main><img src="/brand/logo-white.svg" alt="SD Tech Systems"><div class="card"><span class="status bad">NO ENCONTRADA</span><p>No encontramos esta factura. Revisa el código o escríbenos.</p></div></main>`, { css: CSS, status: 404 });
  }
  const body = `<main><img src="/brand/logo-white.svg" alt="SD Tech Systems"><p class="eyebrow" style="margin-top:22px">Verificación de factura</p>
<div class="card"><span class="status ${inv.voided ? "bad" : "ok"}">${inv.voided ? "Anulada" : "Válida"}</span>
<dl><dt>Factura</dt><dd>${esc(inv.number)}</dd><dt>Emitida</dt><dd>${esc(formatLongDate(dayOf(inv.issuedAt)))}</dd><dt>Cliente</dt><dd>${esc(shortName(inv.client.name))}</dd><dt>Total</dt><dd>${esc(formatMoney(inv.total, inv.currency))}</dd></dl></div>
<p>Emitida por SD Tech Systems · sdtechsystems.dev</p></main>`;
  return page(`${inv.number} · Verificación`, body, { css: CSS });
}

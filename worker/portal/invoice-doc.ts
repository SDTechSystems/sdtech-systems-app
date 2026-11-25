import { dayOf, formatLongDate } from "../../shared/dates";
import { formatMoney } from "../../shared/money";
import type { Invoice, Settings } from "../../shared/types";
import { brandLogo, esc, page, qrSvg } from "./html";

const METHOD: Record<string, string> = { breb: "Bre-B", nequi: "Nequi", bancolombia: "Bancolombia", efectivo: "Efectivo" };

const CSS = `
body{background:var(--ink)}
.sheet{color:#0B1B33;--line:#DCE5EF;--soft:#5B6B80;--white:#F1F5FA;max-width:820px;margin:20px auto 40px;background:#fff;padding:40px 44px;box-shadow:0 30px 60px rgba(0,0,0,.45);border-radius:14px;animation:arrive .7s ease-out both;position:relative;overflow:hidden}
.top{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:3px solid var(--navy);padding-bottom:18px}
.top img{width:230px;height:auto}.company{text-align:right;font-size:.85rem;color:var(--soft)}
.title{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin:22px 0 6px}
.title h1{margin:0;font-size:1.35rem;color:var(--navy);letter-spacing:.04em}.title .num{font-weight:700;color:var(--blue);font-size:1.1rem}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:14px 0 22px}
.box{background:var(--white);border-radius:10px;padding:12px 14px;font-size:.9rem}
.box b{display:block;color:var(--navy);margin-bottom:4px;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase}
table{width:100%;border-collapse:collapse;font-size:.92rem}
th{background:var(--navy);color:#fff;text-align:left;padding:9px 10px;font-size:.78rem;letter-spacing:.05em;text-transform:uppercase}
th.n,td.n{text-align:right;white-space:nowrap}
td{padding:10px;border-bottom:1px solid var(--line);vertical-align:top}td .detail{color:var(--soft);font-size:.86rem;white-space:pre-wrap;margin-top:2px}
.totals{margin:14px 0 0 auto;width:min(360px,100%);font-size:.95rem}
.totals div{display:flex;justify-content:space-between;gap:16px;padding:6px 0}
.totals .grand{border-top:2px solid var(--navy);font-weight:700;font-size:1.15rem;color:var(--navy)}
.totals .pay{color:var(--soft);font-size:.88rem}.totals .bal{font-weight:700;color:var(--blue);font-size:1.05rem;border-top:1px solid var(--line)}
.foot{display:flex;gap:16px;align-items:center;margin-top:26px;border-top:1px solid var(--line);padding-top:16px}
.foot .qr{width:110px;flex:none}.foot .qr svg{width:100%;height:auto;display:block}
.foot p{margin:0;font-size:.86rem;color:var(--soft)}.foot code{font:600 .9rem "SD Mono",monospace;color:var(--navy);letter-spacing:.08em}
.void{position:absolute;top:44%;left:50%;transform:translate(-50%,-50%) rotate(-18deg);font:700 5rem "SD Sans",sans-serif;color:rgba(220,38,38,.18);letter-spacing:.1em;pointer-events:none}
.tools{max-width:820px;margin:16px auto 0;display:flex;gap:10px;justify-content:flex-end;padding:0 12px}
.tools a,.tools button{font:inherit;font-size:.9rem;border:1px solid var(--line);border-radius:999px;padding:11px 18px;cursor:pointer;text-decoration:none;color:var(--white);background:transparent}
.tools button{background:var(--navy);border-color:#3a5f95;font-weight:700}
@media (max-width:640px){.sheet{margin:0;border-radius:0;padding:22px 16px}.top{flex-direction:column}.company{text-align:left}.meta{grid-template-columns:1fr}.top img{width:190px}.void{font-size:3rem}}
@media print{body{background:#fff}.tools{display:none}.sheet{box-shadow:none;margin:0;max-width:none;padding:0;animation:none}@page{margin:14mm}}
`;

export function renderInvoiceDocument(inv: Invoice, settings: Settings, portalUrl: string): Response {
  const m = (n: number) => esc(formatMoney(n, inv.currency));
  const c = inv.client;
  const clientLines = [c.company, c.document ? `Documento: ${c.document}` : null, c.city, c.phone ? `+${c.phone}` : null, c.email].filter(Boolean) as string[];
  const verifyUrl = `clientes.sdtechsystems.dev/verificar/${inv.verifyCode}`;
  const body = `<div class="tools"><a href="${esc(portalUrl)}">← Volver</a><button onclick="window.print()">Guardar PDF</button></div>
<article class="sheet">${inv.voided ? `<div class="void">ANULADA</div>` : ""}
<div class="top">${brandLogo("color", settings.company.name)}<div class="company"><strong style="color:var(--navy)">${esc(settings.company.name)}</strong><br>${esc(settings.company.phone)}<br>${esc(settings.company.email)}<br>${esc(settings.company.website)}</div></div>
<div class="title"><h1>FACTURA</h1><span class="num">${esc(inv.number)}</span></div>
<div class="meta"><div class="box"><b>Cliente</b>${esc(c.name)}${clientLines.map((l) => `<br>${esc(l)}`).join("")}</div>
<div class="box"><b>Proyecto</b>${esc(inv.projectTitle)}<br>Emitida: ${esc(formatLongDate(dayOf(inv.issuedAt)))}</div></div>
<table><thead><tr><th>Descripción</th><th class="n">Cant.</th><th class="n">Valor unitario</th><th class="n">Total</th></tr></thead><tbody>
${inv.lines.map((l) => `<tr><td><strong>${esc(l.title)}</strong>${l.detail ? `<div class="detail">${esc(l.detail)}</div>` : ""}</td><td class="n">${l.quantity}</td><td class="n">${m(l.unitPrice)}</td><td class="n">${m(l.total)}</td></tr>`).join("")}
</tbody></table>
<div class="totals"><div class="grand"><span>Total</span><span>${m(inv.total)}</span></div>
${inv.payments.map((p) => `<div class="pay"><span>Pago ${esc(METHOD[p.method] ?? p.method)} · ${esc(formatLongDate(p.paidOn))}</span><span>− ${m(p.amount)}</span></div>`).join("")}
<div class="bal"><span>Saldo</span><span>${m(Math.max(inv.balance, 0))}</span></div></div>
<div class="foot"><div class="qr">${qrSvg(portalUrl)}</div><p>Escanea para ver tu proyecto, tus servicios y tus pagos.<br><br>Código de verificación: <code>${esc(inv.verifyCode)}</code><br>${esc(verifyUrl)}</p></div>
</article>`;
  return page(`${inv.number} · ${settings.company.name}`, body, { css: CSS });
}

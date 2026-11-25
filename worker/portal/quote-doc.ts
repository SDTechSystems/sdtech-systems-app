import { dayOf, formatLongDate } from "../../shared/dates";
import { formatMoney } from "../../shared/money";
import type { Quote, Settings } from "../../shared/types";
import { brandLogo, esc, page, qrSvg } from "./html";

export interface QuoteDocData {
  quote: Quote;
  client: { name: string; company: string | null; document: string | null; city: string | null; phone: string | null; email: string | null };
  settings: Settings;
  portalUrl: string;
}

const CSS = `
body{background:var(--ink)}
.sheet{color:#0B1B33;--line:#DCE5EF;--soft:#5B6B80;--white:#F1F5FA}
.sheet{max-width:820px;margin:20px auto 40px;background:#fff;padding:40px 44px;box-shadow:0 30px 60px rgba(0,0,0,.45);border-radius:14px;animation:arrive .7s ease-out both}
.top{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:3px solid var(--navy);padding-bottom:18px}
.top img{width:230px;height:auto}
.company{text-align:right;font-size:.85rem;color:var(--soft)}
.title{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin:22px 0 6px}
.title h1{margin:0;font-size:1.35rem;color:var(--navy);letter-spacing:.04em}
.title .num{font-weight:700;color:var(--blue);font-size:1.1rem}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:14px 0 22px}
.box{background:var(--white);border-radius:10px;padding:12px 14px;font-size:.9rem}
.box b{display:block;color:var(--navy);margin-bottom:4px;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase}
table{width:100%;border-collapse:collapse;font-size:.92rem}
th{background:var(--navy);color:#fff;text-align:left;padding:9px 10px;font-size:.78rem;letter-spacing:.05em;text-transform:uppercase}
th.n,td.n{text-align:right;white-space:nowrap}
td{padding:10px;border-bottom:1px solid var(--line);vertical-align:top}
td .detail{color:var(--soft);font-size:.86rem;white-space:pre-wrap;margin-top:2px}
.totals{margin:14px 0 0 auto;width:min(340px,100%);font-size:.95rem}
.totals div{display:flex;justify-content:space-between;padding:6px 0}
.totals .grand{border-top:2px solid var(--navy);font-weight:700;font-size:1.15rem;color:var(--navy)}
.totals .adv{color:var(--blue);font-weight:700}
.pay{margin-top:22px;border:2px solid var(--cyan);border-radius:12px;padding:12px 16px;font-weight:700;color:var(--navy)}
h2{font-size:.95rem;color:var(--navy);margin:24px 0 8px;letter-spacing:.04em;text-transform:uppercase}
ol{margin:0;padding-left:20px;font-size:.86rem;color:#33445C}ol li{margin-bottom:4px}
.notes{font-size:.9rem;white-space:pre-wrap}
.third{font-size:.82rem;color:var(--soft);margin-top:10px}
.foot{display:flex;gap:16px;align-items:center;margin-top:26px;border-top:1px solid var(--line);padding-top:16px}
.foot .qr{width:110px;flex:none}.foot .qr svg{width:100%;height:auto;display:block}
.foot p{margin:0;font-size:.86rem;color:var(--soft)}
.tools{max-width:820px;margin:16px auto 0;display:flex;gap:10px;justify-content:flex-end;padding:0 12px}
.tools a,.tools button{font:inherit;font-size:.9rem;border:1px solid var(--line);border-radius:999px;padding:11px 18px;cursor:pointer;text-decoration:none;color:var(--white);background:transparent;transition:border-color .2s}
.tools button{background:var(--navy);border-color:#3a5f95;font-weight:700}.tools a:hover{border-color:var(--white)}.tools button:hover{border-color:var(--cyan)}
@media (max-width:640px){.sheet{margin:0;border-radius:0;padding:22px 16px}.top{flex-direction:column}.company{text-align:left}.meta{grid-template-columns:1fr}.top img{width:190px}}
@media print{body{background:#fff}.sheet{animation:none}.tools{display:none}.sheet{box-shadow:none;margin:0;max-width:none;padding:0}@page{margin:14mm}}
`;

export function renderQuoteDocument(d: QuoteDocData): Response {
  const { quote: q, client: c, settings: s } = d;
  const money = (n: number) => esc(formatMoney(n, q.currency));
  const pay =
    q.currency === "USD"
      ? esc(s.payment.usdText || "Datos de pago en dólares: te los enviamos por chat.")
      : `Pago: Llave Bre-B ${esc(s.payment.brebKey)} · ${esc(s.payment.bank)}`;
  const clientLines = [c.company, c.document ? `Documento: ${c.document}` : null, c.city, c.phone ? `+${c.phone}` : null, c.email].filter(Boolean) as string[];
  const conditions = q.conditions.split("\n").map((l) => l.trim()).filter(Boolean);
  const body = `<div class="tools"><a href="${esc(d.portalUrl)}">← Volver</a><button onclick="window.print()">Guardar PDF</button></div>
<article class="sheet">
<div class="top">${brandLogo("color", s.company.name)}<div class="company"><strong style="color:var(--navy)">${esc(s.company.name)}</strong><br>${esc(s.company.phone)}<br>${esc(s.company.email)}<br>${esc(s.company.website)}</div></div>
<div class="title"><h1>COTIZACIÓN</h1><span class="num">${esc(q.number)}</span></div>
<div class="meta"><div class="box"><b>Cliente</b>${esc(c.name)}${clientLines.map((l) => `<br>${esc(l)}`).join("")}</div>
<div class="box"><b>Fechas</b>Emitida: ${q.issuedAt ? esc(formatLongDate(dayOf(q.issuedAt))) : "—"}<br>Válida hasta: ${q.validUntil ? esc(formatLongDate(q.validUntil)) : "—"}</div></div>
<table><thead><tr><th>Descripción</th><th class="n">Cant.</th><th class="n">Valor unitario</th><th class="n">Total</th></tr></thead><tbody>
${q.items.map((i) => `<tr><td><strong>${esc(i.title)}</strong>${i.detail ? `<div class="detail">${esc(i.detail)}</div>` : ""}</td><td class="n">${i.quantity}</td><td class="n">${money(i.unitPrice)}</td><td class="n">${money(i.quantity * i.unitPrice)}</td></tr>`).join("")}
</tbody></table>
<div class="totals"><div class="grand"><span>Total</span><span>${money(q.total)}</span></div>${q.advancePercent > 0 ? `<div class="adv"><span>Anticipo requerido (${q.advancePercent}%)</span><span>${money(q.advanceAmount)}</span></div>` : ""}</div>
<div class="pay">${pay}</div>
${q.notes ? `<h2>Notas</h2><div class="notes">${esc(q.notes)}</div>` : ""}
${conditions.length ? `<h2>Condiciones</h2><ol>${conditions.map((l) => `<li>${esc(l)}</li>`).join("")}</ol>` : ""}
<p class="third">Los costos de terceros (dominio, hosting, plataformas) pueden variar según el proveedor y la tasa de cambio.</p>
<div class="foot"><div class="qr">${qrSvg(d.portalUrl)}</div><p>Escanea el código o entra a tu página de seguimiento para aprobar esta cotización y ver el avance de tu proyecto.</p></div>
</article>`;
  return page(`${q.number} · ${s.company.name}`, body, { css: CSS });
}

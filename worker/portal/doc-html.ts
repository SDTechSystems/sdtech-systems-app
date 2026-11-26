import { formatMoney } from "../../shared/money";
import { companyLines, docFacts, voidMark, webLinks, type DocModel } from "../../shared/docs/model";
import { brandLogo, esc, page, qrSvg } from "./html";

/** Hoja blanca del documento (cotización, cuenta de cobro, recibo). En ≤ 640 px la tabla pasa a filas apiladas. */
const CSS = `
body{background:var(--ink)}
.sheet{color:#0B1B33;--line:#DCE5EF;--soft:#5B6B80;--white:#F1F5FA;max-width:820px;margin:20px auto 40px;background:#fff;padding:40px 44px;box-shadow:0 30px 60px rgba(0,0,0,.45);border-radius:14px;animation:arrive .7s ease-out both;position:relative;overflow:hidden}
.top{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:3px solid var(--navy);padding-bottom:18px}
.top img{width:230px;height:auto}.company{text-align:right;font-size:.85rem;color:var(--soft)}.company strong{color:var(--navy)}
.title{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin:22px 0 6px}
.title h1{margin:0;font-size:1.35rem;color:var(--navy);letter-spacing:.04em}.title .num{font-weight:700;color:var(--blue);font-size:1.1rem}
.meta{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin:14px 0 22px}
.box{background:var(--white);border-radius:10px;padding:12px 14px;font-size:.9rem;overflow-wrap:anywhere}
.box b{display:block;color:var(--navy);margin-bottom:4px;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase}.box b.from{margin-top:10px}
.intro{margin:0 0 20px;font-size:.95rem}.intro p{margin:0}.intro .amount{margin-top:4px;color:var(--soft)}.intro .amount strong{color:var(--navy);font-size:1.25rem;margin-right:6px}
.doc-table{width:100%;border-collapse:collapse;font-size:.92rem}
.doc-table th{background:var(--navy);color:#fff;text-align:left;padding:9px 10px;font-size:.78rem;letter-spacing:.05em;text-transform:uppercase}
.doc-table th.n,.doc-table td.n{text-align:right;white-space:nowrap}
.doc-table td{padding:10px;border-bottom:1px solid var(--line);vertical-align:top}.doc-table td.desc{overflow-wrap:anywhere}
.doc-table .detail{color:var(--soft);font-size:.86rem;white-space:pre-wrap;margin-top:2px}
.totals{margin:14px 0 0 auto;width:min(360px,100%);font-size:.95rem}
.totals div{display:flex;justify-content:space-between;gap:16px;padding:6px 0}.totals span:last-child{white-space:nowrap}
.totals .grand{border-top:2px solid var(--navy);font-weight:700;font-size:1.15rem;color:var(--navy)}
.totals .minus{color:var(--soft);font-size:.88rem}.totals .bal{font-weight:700;color:var(--blue);font-size:1.05rem;border-top:1px solid var(--line)}
.pay{margin-top:22px;border:2px solid var(--cyan);border-radius:12px;padding:12px 16px;overflow-wrap:anywhere}
.pay b{display:block;color:var(--navy);font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;margin-bottom:2px}
.pay ul{list-style:none;margin:0;padding:0;color:var(--navy)}.pay li strong{font-weight:700}
.links{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
.links a{display:inline-block;background:var(--navy);color:#fff;border-radius:999px;padding:10px 18px;font-weight:700;font-size:.9rem;text-decoration:none;overflow-wrap:anywhere}
h2{font-size:.95rem;color:var(--navy);margin:24px 0 8px;letter-spacing:.04em;text-transform:uppercase}
ol{margin:0;padding-left:20px;font-size:.86rem;color:#33445C}ol li{margin-bottom:4px}
.notes{font-size:.9rem;white-space:pre-wrap;overflow-wrap:anywhere}
.small-print{font-size:.82rem;color:var(--soft);margin:10px 0 0}
.thanks{margin:22px 0 0;font-weight:700;color:var(--navy)}
.foot{display:flex;gap:16px;align-items:center;margin-top:26px;border-top:1px solid var(--line);padding-top:16px}
.foot .qr{width:110px;flex:none}.foot .qr svg{width:100%;height:auto;display:block}
.foot p{margin:0;font-size:.86rem;color:var(--soft);overflow-wrap:anywhere}.foot p+p{margin-top:8px}.foot code{font:600 .9rem "SD Mono",monospace;color:var(--navy);letter-spacing:.08em}
.foot .tax{font-weight:700;color:var(--navy)}
.void{position:absolute;top:44%;left:50%;transform:translate(-50%,-50%) rotate(-18deg);font:700 5rem "SD Sans",sans-serif;color:rgba(220,38,38,.18);letter-spacing:.1em;pointer-events:none}
.tools{max-width:820px;margin:16px auto 0;display:flex;gap:10px;justify-content:flex-end;padding:0 12px}
.tools a,.tools button{font:inherit;font-size:.9rem;border:1px solid var(--line);border-radius:999px;padding:11px 18px;cursor:pointer;text-decoration:none;color:var(--white);background:transparent;transition:border-color .2s}
.tools button{background:var(--navy);border-color:#3a5f95;font-weight:700}.tools a:hover{border-color:var(--white)}.tools button:hover{border-color:var(--cyan)}
@media (max-width:640px){.doc-table thead{display:none}
.doc-table,.doc-table tbody,.doc-table tr,.doc-table td{display:block;width:100%}
.doc-table tr{border-bottom:1px solid var(--line);padding:10px 0}
.doc-table td{border:0;padding:2px 0}.doc-table td.desc{padding-bottom:6px}
.doc-table td.n{display:flex;justify-content:space-between;gap:12px;text-align:right}
.doc-table td.n::before{content:attr(data-label);color:var(--soft);font-size:.82rem;text-align:left}
.sheet{margin:0;border-radius:0;padding:22px 16px}.top{flex-direction:column}.company{text-align:left}.meta{grid-template-columns:minmax(0,1fr)}.top img{width:190px}.void{font-size:3rem}
.foot{align-items:flex-start}.foot .qr{width:88px}}
@media print{body{background:#fff}.tools{display:none}.sheet{box-shadow:none;margin:0;max-width:none;padding:0;animation:none}.links a::after{content:" · " attr(href);font-weight:400}@page{margin:14mm}}
`;

/**
 * «Descargar PDF»: trae /pdf/portal.js solo al oprimir el botón y arma el mismo PDF del panel
 * con el modelo de #doc-model. Si el módulo no carga, queda la impresión del navegador.
 */
const PDF_SCRIPT = `document.getElementById("download-pdf").addEventListener("click",async e=>{const b=e.currentTarget;if(b.disabled)return;const t=b.textContent;b.disabled=true;b.textContent="Generando PDF…";try{const m=await import("/pdf/portal.js");await m.downloadPdf()}catch(err){window.print()}finally{b.disabled=false;b.textContent=t}});`;

/** La página del documento en el portal. El orden de bloques es el mismo del PDF. */
export function renderDocHtml(model: DocModel, opts: { backUrl: string; pdf: boolean }): Response {
  const m = model;
  const money = (n: number) => esc(formatMoney(n, m.currency));
  const c = m.company;
  const facts = docFacts(m);
  const button = opts.pdf
    ? `<button type="button" id="download-pdf">Descargar PDF</button>`
    : `<button type="button" onclick="window.print()">Guardar PDF</button>`;
  const total = (t: DocModel["totals"][number]) => {
    const cls = { grand: "grand", minus: "minus", balance: "bal", plain: "" }[t.tone];
    return `<div${cls ? ` class="${cls}"` : ""}><span>${esc(t.label)}</span><span>${t.tone === "minus" ? "− " : ""}${money(t.amount)}</span></div>`;
  };
  const links = webLinks(m);
  const verify = m.footer.verifyCode
    ? `<p>Código de verificación: <code>${esc(m.footer.verifyCode)}</code>${m.footer.verifyUrl ? `<br>${esc(m.footer.verifyUrl)}` : ""}</p>`
    : "";

  const body = `<div class="tools"><a href="${esc(opts.backUrl)}">← Volver</a>${button}</div>
<article class="sheet">${m.voided ? `<div class="void">${voidMark(m)}</div>` : ""}
<div class="top">${brandLogo("color", c.name)}<div class="company"><strong>${esc(c.name)}</strong>${companyLines(c).map((l) => `<br>${esc(l)}`).join("")}</div></div>
<div class="title"><h1>${esc(m.title)}</h1><span class="num">${esc(m.number)}</span></div>
<div class="meta"><div class="box"><b>Para</b>${esc(m.party.name)}${m.party.lines.map((l) => `<br>${esc(l)}`).join("")}${m.from ? `<b class="from">De</b>${esc(m.from)}` : ""}</div>
<div class="box"><b>Detalles</b>${facts.map((f) => `${esc(f.label)}: ${esc(f.value)}`).join("<br>") || "—"}</div></div>
${m.intro ? `<div class="intro"><p>${esc(m.intro.text)}</p><p class="amount"><strong>${money(m.intro.amount)}</strong>(${esc(m.intro.words)})</p></div>` : ""}
<table class="doc-table"><thead><tr><th>Descripción</th><th class="n">Cant.</th><th class="n">Valor unitario</th><th class="n">Total</th></tr></thead><tbody>
${m.lines.map((l) => `<tr><td class="desc"><strong>${esc(l.title)}</strong>${l.detail ? `<div class="detail">${esc(l.detail)}</div>` : ""}</td><td class="n" data-label="Cant.">${l.quantity}</td><td class="n" data-label="Valor unitario">${money(l.unitPrice)}</td><td class="n" data-label="Total">${money(l.total)}</td></tr>`).join("")}
</tbody></table>
<div class="totals">${m.totals.map(total).join("")}</div>
${m.payment ? `<div class="pay"><b>${esc(m.payment.title)}</b><ul>${m.payment.items.map((i) => `<li><strong>${esc(i.name)}</strong>${i.detail ? `: ${esc(i.detail)}` : ""}</li>`).join("")}</ul></div>` : ""}
${links.length ? `<div class="links">${links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("")}</div>` : ""}
${m.note ? `<h2>Nota</h2><div class="notes">${esc(m.note)}</div>` : ""}
${m.conditions.length ? `<h2>Condiciones</h2><ol>${m.conditions.map((l) => `<li>${esc(l)}</li>`).join("")}</ol>` : ""}
${m.smallPrint ? `<p class="small-print">${esc(m.smallPrint)}</p>` : ""}
${m.thanks ? `<p class="thanks">${esc(m.thanks)}</p>` : ""}
<div class="foot"><div class="qr">${qrSvg(m.footer.qrUrl)}</div><div><p>${esc(m.footer.qrCaption)}</p>${verify}${c.taxNote ? `<p class="tax">${esc(c.taxNote)}</p>` : ""}</div></div>
</article>
<script type="application/json" id="doc-model">${JSON.stringify(m).replace(/</g, "\\u003c")}</script>`;
  return page(`${m.number} · ${c.name}`, body, { css: CSS, script: opts.pdf ? PDF_SCRIPT : undefined });
}

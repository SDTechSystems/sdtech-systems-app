import { dayOf, formatLongDate } from "../../shared/dates";
import { formatMoney } from "../../shared/money";
import { waLink } from "../../shared/phone";
import type { PaymentSummary, Project, Quote, Settings } from "../../shared/types";
import { esc, page } from "./html";

export interface PortalData {
  token: string;
  client: { id: string; name: string };
  quotes: Quote[];
  projects: Project[];
  payments: Record<string, PaymentSummary>;
  settings: Settings;
}

const QUOTE_STATUS: Record<string, [string, string]> = {
  sent: ["Pendiente de aprobación", "pending"],
  approved: ["Aprobada", "ok"],
  rejected: ["No aprobada", "off"],
  expired: ["Vencida", "off"],
};
const PROJECT_STATUS: Record<string, string> = { active: "En curso", paused: "En pausa", delivered: "Entregado", cancelled: "Cancelado" };
const PHASE_ICON: Record<string, string> = { done: "✓", in_progress: "●", pending: "○" };

const CSS = `
header{position:sticky;top:0;z-index:5;background:rgba(7,17,31,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--line);padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px}
header img{height:32px;width:auto;display:block}header span{font:.625rem "SD Mono",monospace;letter-spacing:.1em;color:var(--muted)}
main{max-width:760px;margin:0 auto;padding:34px 18px 56px}
h1{font-size:clamp(2.4rem,9vw,3.6rem);line-height:1.02;letter-spacing:-.045em;margin:14px 0 14px;font-weight:700}
h1 em{font-style:normal;color:var(--cyan)}
h2{font:.6875rem "SD Mono",monospace;letter-spacing:.12em;text-transform:uppercase;margin:40px 0 14px;color:var(--white)}
h2::before{content:attr(data-n) " / ";color:var(--cyan)}
.lead{color:var(--soft);margin:0;max-width:46ch}
.card{background:linear-gradient(180deg,rgba(12,32,58,.95),rgba(9,24,45,.95));border:1px solid #24406a;border-radius:18px;padding:18px;margin-bottom:14px;transition:transform .45s cubic-bezier(.2,.7,.2,1),border-color .25s}
@media(hover:hover) and (pointer:fine){.card:hover{transform:translateY(-3px);border-color:#3a5f95}}
.card strong{font-size:1.15rem;letter-spacing:-.02em}
.row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.muted{color:var(--soft);font-size:.9rem}
.badge{display:inline-flex;align-items:center;gap:6px;font:.625rem "SD Mono",monospace;letter-spacing:.04em;border-radius:999px;padding:6px 10px;background:#123647;color:var(--white);white-space:nowrap}
.badge::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--cyan)}
.badge.pending{background:#3b3022}.badge.pending::before{background:#f4c174}
.badge.ok{background:#11362a}.badge.ok::before{background:#34d399}
.badge.off{background:#1b2a40}.badge.off::before{background:var(--muted)}
.amount{font-weight:700;font-size:1.35rem;letter-spacing:-.02em}
.bar{height:8px;background:#12294a;border-radius:99px;overflow:hidden;margin:14px 0 6px}.bar>span{display:block;height:100%;background:linear-gradient(90deg,var(--blue),var(--cyan));border-radius:99px;transform-origin:left;animation:grow 1s .3s cubic-bezier(.2,.7,.2,1) both}
@keyframes grow{from{transform:scaleX(0)}to{transform:none}}
ul.phases{list-style:none;padding:0;margin:14px 0 0}ul.phases li{padding:8px 0;border-top:1px solid var(--line)}
ul.phases li.done{color:var(--soft)}ul.phases li.in_progress{font-weight:700;color:var(--white)}
ul.phases li .ico{display:inline-block;width:1.5em;color:var(--cyan)}
ul.phases li.in_progress .ico{animation:caret 1.6s ease-in-out infinite}
ul.phases ul{list-style:none;padding-left:1.6em;margin:4px 0 0;font-weight:400}
.note{display:block;font-weight:400;color:var(--soft);font-size:.9rem;margin-left:1.5em}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--line);border-radius:999px;padding:12px 20px;font:inherit;font-size:.9rem;cursor:pointer;text-decoration:none;color:var(--white);background:transparent;transition:border-color .2s,transform .25s cubic-bezier(.34,1.56,.64,1)}
.btn:hover{border-color:var(--white)}.btn:active{transform:scale(.98)}
.btn.primary{background:var(--navy);border-color:#3a5f95;font-weight:700}.btn.primary:hover{border-color:var(--cyan)}
.btn.ghost{border-color:transparent;color:var(--soft);text-decoration:underline;padding:12px 6px}
.btn.link{background:#0f2542}
form{margin-top:16px;border-top:1px solid var(--line);padding-top:16px}
label{display:block;font:.625rem "SD Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--soft);margin:12px 0 6px}
input,textarea{width:100%;font:inherit;color:var(--white);border:1px solid var(--line);border-radius:12px;padding:12px;background:#0a1729}
input:focus,textarea:focus{border-color:var(--cyan);outline:none}
.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}
.msg{margin-top:8px;font-size:.9rem;color:#fb7185}
.quote-note{background:#0a1729;border:1px solid var(--line);border-radius:12px;padding:12px;margin-top:12px;font-size:.92rem;white-space:pre-wrap}
.pay{margin-top:16px;border-top:1px solid var(--line);padding-top:14px}
.pay h3{font:.625rem "SD Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--soft);margin:0 0 10px;font-weight:400}
.sum{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center}
.sum div{background:#0a1729;border:1px solid var(--line);border-radius:12px;padding:10px 4px}.sum span{display:block;font:.6rem "SD Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--soft)}.sum b{font-size:.95rem;white-space:nowrap}
.plans{list-style:none;padding:0;margin:12px 0 0}.plans li{display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px dashed var(--line);font-size:.92rem}
.plans .st{font-size:.8rem;color:var(--soft)}.plans .overdue{color:#fb7185;font-weight:700}.plans .paid{color:#34d399}
.key{margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border:1px solid var(--cyan);background:rgba(0,189,232,.08);border-radius:14px;padding:12px 14px;font-weight:700;color:var(--white)}
footer{text-align:center;color:var(--soft);font-size:.85rem;margin-top:48px;border-top:1px solid var(--line);padding-top:22px}
footer .wa{display:inline-flex;align-items:center;gap:8px;margin-bottom:12px;background:#0f5c34;border:1px solid #1b8a4c;color:#fff;border-radius:999px;padding:11px 18px;text-decoration:none}
`;

const SCRIPT = `
document.querySelectorAll("[data-copy]").forEach(function(b){
  b.addEventListener("click",function(){
    navigator.clipboard.writeText(b.dataset.copy).then(function(){b.textContent="¡Copiada!";setTimeout(function(){b.textContent="Copiar llave"},2000)});
  });
});
document.querySelectorAll("form[data-action]").forEach(function(f){
  f.addEventListener("submit",async function(e){
    e.preventDefault();
    var btn=e.submitter, action=btn&&btn.value||"approve", msg=f.querySelector(".msg");
    var data={name:(f.elements.name||{}).value||"",comment:(f.elements.comment||{}).value||""};
    if(action==="approve"&&data.name.trim().length<2){msg.textContent="Escribe tu nombre para aprobar.";return}
    if(action==="reject"&&!confirm("¿Seguro que no quieres aprobar esta cotización?"))return;
    btn.disabled=true;msg.textContent="";
    try{
      var r=await fetch(f.dataset.action+"/"+action,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});
      if(r.ok){location.reload();return}
      var j=await r.json().catch(function(){return{}});
      msg.textContent=j.error==="not_approvable"?"Esta cotización ya no se puede aprobar. Escríbenos por WhatsApp.":"No se pudo guardar. Intenta de nuevo.";
    }catch(err){msg.textContent="Sin conexión. Intenta de nuevo."}
    btn.disabled=false;
  });
});`;

function phaseList(p: Project): string {
  const top = p.phases.filter((f) => !f.parentId);
  return `<ul class="phases">${top
    .map((f) => {
      const rounds = p.phases.filter((r) => r.parentId === f.id);
      const roundsHtml = rounds.length
        ? `<ul>${rounds.map((r) => `<li class="${r.status}"><span class="ico">${PHASE_ICON[r.status]}</span>${esc(r.name)}${r.clientNote ? `<span class="note">${esc(r.clientNote)}</span>` : ""}</li>`).join("")}</ul>`
        : "";
      return `<li class="${f.status}"><span class="ico">${PHASE_ICON[f.status]}</span>${esc(f.name)}${f.dueDate && f.status !== "done" ? ` <span class="muted">· ${esc(formatLongDate(f.dueDate))}</span>` : ""}${f.clientNote ? `<span class="note">${esc(f.clientNote)}</span>` : ""}${roundsHtml}</li>`;
    })
    .join("")}</ul>`;
}

function paymentsBlock(pay: PaymentSummary, settings: Settings): string {
  const m = (n: number) => esc(formatMoney(n, pay.currency));
  const open = pay.plans.some((pl) => pl.status !== "paid");
  const plans = pay.plans
    .map((pl) => {
      const st =
        pl.status === "paid"
          ? `<span class="st paid">Pagado</span>`
          : pl.status === "overdue"
            ? `<span class="st overdue">Venció el ${esc(formatLongDate(pl.dueDate))}</span>`
            : `<span class="st">Vence el ${esc(formatLongDate(pl.dueDate))}</span>`;
      const partial = pl.status !== "paid" && pl.paidAmount > 0 ? ` <span class="st">(abonado ${m(pl.paidAmount)})</span>` : "";
      return `<li><span>${esc(pl.label)} · ${m(pl.amount)}${partial}</span>${st}</li>`;
    })
    .join("");
  const key =
    open && pay.currency === "COP"
      ? `<div class="key"><span>Llave Bre-B ${esc(settings.payment.brebKey)} · ${esc(settings.payment.bank)}</span><button class="btn link" type="button" data-copy="${esc(settings.payment.brebKey)}">Copiar llave</button></div>`
      : "";
  return `<div class="pay"><h3>Pagos</h3><div class="sum"><div><span>Total</span><b>${m(pay.total)}</b></div><div><span>Pagado</span><b>${m(pay.paid)}</b></div><div><span>Saldo</span><b>${m(Math.max(pay.balance, 0))}</b></div></div>${plans ? `<ul class="plans">${plans}</ul>` : ""}${key}</div>`;
}

function projectCard(p: Project, pay: PaymentSummary | undefined, settings: Settings): string {
  return `<div class="card"><div class="row"><div><strong>${esc(p.title)}</strong><div class="muted">${p.dueDate ? `Entrega estimada: ${esc(formatLongDate(p.dueDate))}` : "Fecha de entrega por definir"}</div></div><span class="badge${p.status === "delivered" ? " ok" : p.status === "active" ? "" : " off"}">${PROJECT_STATUS[p.status]}</span></div>
<div class="bar" role="progressbar" aria-valuenow="${p.progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p.progress}%"></span></div><div class="muted">${p.progress}% completado</div>${phaseList(p)}${pay && pay.total > 0 ? paymentsBlock(pay, settings) : ""}</div>`;
}

function quoteCard(q: Quote, base: string): string {
  const [label, cls] = QUOTE_STATUS[q.status] ?? [q.status, ""];
  let extra = "";
  if (q.status === "sent") {
    extra = `<p class="muted">Válida hasta el ${esc(formatLongDate(q.validUntil!))}. Anticipo para iniciar (${q.advancePercent}%): <strong>${esc(formatMoney(q.advanceAmount, q.currency))}</strong></p>
<form data-action="/api/portal/${esc(base)}/quotes/${esc(q.id)}"><label for="n-${esc(q.id)}">Tu nombre</label><input id="n-${esc(q.id)}" name="name" autocomplete="name" maxlength="80" required>
<label for="c-${esc(q.id)}">Comentario (opcional)</label><textarea id="c-${esc(q.id)}" name="comment" rows="2" maxlength="1000"></textarea>
<div class="actions"><button class="btn primary" name="action" value="approve">Aprobar cotización</button><button class="btn ghost" name="action" value="reject" formnovalidate>No me interesa</button></div><div class="msg" role="alert"></div></form>`;
  } else if (q.status === "approved") {
    const who = q.approvedBy === "client" && q.approvedName ? ` por ${esc(q.approvedName)}` : "";
    extra = `<p class="muted">Aprobada${who} el ${esc(formatLongDate(dayOf(q.approvedAt!)))}.</p>${q.clientComment ? `<div class="quote-note">${esc(q.clientComment)}</div>` : ""}`;
  } else if (q.status === "expired") {
    extra = `<p class="muted">Venció el ${esc(formatLongDate(q.validUntil!))}. Escríbenos si quieres actualizarla.</p>`;
  } else if (q.clientComment) {
    extra = `<div class="quote-note">${esc(q.clientComment)}</div>`;
  }
  return `<div class="card"><div class="row"><div><strong>${esc(q.number)}</strong><div class="muted">${esc(q.items[0]?.title ?? "")}${q.items.length > 1 ? ` y ${q.items.length - 1} más` : ""}</div></div><span class="badge ${cls}">${label}</span></div>
<div class="row" style="margin-top:8px;align-items:center"><span class="amount">${esc(formatMoney(q.total, q.currency))}</span><a class="btn link" href="/c/${esc(base)}/cotizacion/${esc(q.number)}">Ver cotización</a></div>${extra}</div>`;
}

export function renderPortal(d: PortalData): Response {
  const first = d.client.name.split(" ")[0];
  const company = d.settings.company;
  const phoneDigits = company.phone.replace(/\D/g, "");
  const sections = [
    d.projects.length ? { title: "Tus proyectos", html: d.projects.map((p) => projectCard(p, d.payments[p.id], d.settings)).join("") } : null,
    d.quotes.length ? { title: "Tus cotizaciones", html: d.quotes.map((q) => quoteCard(q, d.token)).join("") } : null,
  ].filter((s): s is { title: string; html: string } => !!s);
  const body = `<header><img src="/brand/logo-white.svg" alt="SD Tech Systems"><span>SEGUIMIENTO</span></header><main class="arrive">
<p class="eyebrow">Tu página de seguimiento</p>
<h1>Hola, <em class="caret">${esc(first)}</em></h1><p class="lead">Aquí ves tus cotizaciones y el avance de tus proyectos con ${esc(company.name)}.</p>
${sections.map((s, i) => `<h2 data-n="${String(i + 1).padStart(2, "0")}">${s.title}</h2><div class="stagger">${s.html}</div>`).join("")}
${!d.projects.length && !d.quotes.length ? `<div class="card"><p class="lead">Todavía no hay nada por aquí. Te avisaremos cuando tengamos tu cotización.</p></div>` : ""}
<footer><a class="wa" href="${esc(waLink(phoneDigits, `Hola, soy ${d.client.name}. `))}">¿Dudas? Escríbenos por WhatsApp</a><br><a href="https://${esc(company.website)}">${esc(company.website)}</a><br><span>Este enlace es personal; no lo compartas.</span></footer>
</main>`;
  return page(`${company.name} · ${d.client.name}`, body, { css: CSS, script: SCRIPT });
}

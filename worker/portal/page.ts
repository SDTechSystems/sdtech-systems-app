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
header{background:var(--ink);padding:14px 18px}header img{height:34px;width:auto;display:block}
main{max-width:720px;margin:0 auto;padding:20px 16px 48px}
h1{font-size:1.5rem;margin:8px 0 4px}h2{font-size:1.1rem;margin:28px 0 12px}
.lead{color:var(--soft);margin:0}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:14px}
.row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.muted{color:var(--soft);font-size:.9rem}
.badge{display:inline-block;font-size:.78rem;font-weight:700;border-radius:999px;padding:3px 10px;background:#E6EEF8;color:var(--navy)}
.badge.pending{background:#FFF4D6;color:#7A5300}.badge.ok{background:#DDF6E8;color:#11613A}.badge.off{background:#EEF1F5;color:#5B6B80}
.amount{font-weight:700;font-size:1.15rem}
.bar{height:10px;background:#E6EEF8;border-radius:99px;overflow:hidden;margin:10px 0 4px}.bar>span{display:block;height:100%;background:linear-gradient(90deg,var(--blue),var(--cyan))}
ul.phases{list-style:none;padding:0;margin:12px 0 0}ul.phases li{padding:6px 0;border-top:1px solid var(--line)}
ul.phases li.done{color:var(--soft)}ul.phases li.in_progress{font-weight:700;color:var(--navy)}
ul.phases li .ico{display:inline-block;width:1.4em;color:var(--blue)}
ul.phases ul{list-style:none;padding-left:1.6em;margin:4px 0 0;font-weight:400}
.note{display:block;font-weight:400;color:var(--soft);font-size:.9rem;margin-left:1.4em}
.btn{display:inline-block;border:0;border-radius:12px;padding:12px 18px;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}
.btn.primary{background:var(--navy);color:var(--white)}.btn.ghost{background:transparent;color:var(--soft);text-decoration:underline;padding:12px 4px}
.btn.link{background:#E6EEF8;color:var(--navy)}
form{margin-top:14px;border-top:1px solid var(--line);padding-top:14px}
label{display:block;font-size:.9rem;font-weight:700;margin:10px 0 4px}
input,textarea{width:100%;font:inherit;border:1px solid var(--line);border-radius:10px;padding:10px;background:#fff}
.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}
.msg{margin-top:8px;font-size:.9rem;color:#B42318}
.quote-note{background:var(--white);border-radius:10px;padding:10px;margin-top:10px;font-size:.92rem;white-space:pre-wrap}
.pay{margin-top:14px;border-top:1px solid var(--line);padding-top:12px}
.pay h3{font-size:.95rem;margin:0 0 8px}
.sum{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center}
.sum div{background:var(--white);border-radius:10px;padding:8px 4px}.sum span{display:block;font-size:.75rem;color:var(--soft)}.sum b{font-size:.95rem}
.plans{list-style:none;padding:0;margin:10px 0 0}.plans li{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px dashed var(--line);font-size:.92rem}
.plans .st{font-size:.8rem;color:var(--soft)}.plans .overdue{color:#B42318;font-weight:700}.plans .paid{color:#11613A}
.key{margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border:2px solid var(--cyan);border-radius:12px;padding:10px 12px;font-weight:700;color:var(--navy)}
footer{text-align:center;color:var(--soft);font-size:.9rem;margin-top:36px}
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
  return `<div class="card"><div class="row"><div><strong>${esc(p.title)}</strong><div class="muted">${p.dueDate ? `Entrega estimada: ${esc(formatLongDate(p.dueDate))}` : "Fecha de entrega por definir"}</div></div><span class="badge">${PROJECT_STATUS[p.status]}</span></div>
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
  const body = `<header><img src="/brand/logo-white.svg" alt="SD Tech Systems"></header><main>
<h1>Hola, ${esc(first)} 👋</h1><p class="lead">Aquí ves tus cotizaciones y el avance de tus proyectos con ${esc(company.name)}.</p>
${d.projects.length ? `<h2>Tus proyectos</h2>${d.projects.map((p) => projectCard(p, d.payments[p.id], d.settings)).join("")}` : ""}
${d.quotes.length ? `<h2>Tus cotizaciones</h2>${d.quotes.map((q) => quoteCard(q, d.token)).join("")}` : ""}
${!d.projects.length && !d.quotes.length ? `<div class="card"><p class="lead">Todavía no hay nada por aquí. Te avisaremos cuando tengamos tu cotización.</p></div>` : ""}
<footer>¿Dudas? <a href="${esc(waLink(phoneDigits, `Hola, soy ${d.client.name}. `))}">Escríbenos por WhatsApp</a> · <a href="https://${esc(company.website)}">${esc(company.website)}</a><br><span>Este enlace es personal; no lo compartas.</span></footer>
</main>`;
  return page(`${company.name} · ${d.client.name}`, body, { css: CSS, script: SCRIPT });
}

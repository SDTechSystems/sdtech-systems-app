import qrcode from "qrcode-generator";

export const PORTAL_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapa todo texto que viene de la base de datos o del cliente. */
export const esc = (s: string | null | undefined): string => String(s ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

export function qrSvg(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

export const BASE_CSS = `
@font-face{font-family:"SD Sans";src:url(/fonts/DejaVuSans.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"SD Sans";src:url(/fonts/DejaVuSans-Bold.woff2) format("woff2");font-weight:700;font-display:swap}
@font-face{font-family:"SD Mono";src:url(/fonts/DejaVuSansMono.woff2) format("woff2");font-weight:400;font-display:swap}
:root{--navy:#061C45;--cyan:#00BDE8;--ink:#07111F;--blue:#2563EB;--white:#F4F8FC;--muted:#A7B9CD;--line:#2c405b;--text:#F4F8FC;--soft:#A7B9CD;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--ink);color:var(--text);font-family:"SD Sans",system-ui,sans-serif;line-height:1.55;-webkit-text-size-adjust:100%;font-synthesis:none}
a{color:var(--cyan)}
a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--blue);outline-offset:4px}
.eyebrow{font:.6875rem "SD Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--white)}
.eyebrow::before{content:">_";color:var(--cyan);margin-right:.75em;letter-spacing:0}
.caret::after{content:"_";color:var(--cyan);margin-left:.04em;animation:caret 1.1s step-end infinite}
.arrive{animation:arrive .65s ease-out both}
.stagger>*{animation:arrive .55s ease-out both;animation-delay:80ms}
.stagger>*:nth-child(2){animation-delay:140ms}.stagger>*:nth-child(3){animation-delay:200ms}.stagger>*:nth-child(n+4){animation-delay:260ms}
@keyframes arrive{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes caret{0%,100%{opacity:1}50%{opacity:0}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
@media print{.caret::after{content:none}}
`;

export function page(title: string, body: string, opts: { css?: string; script?: string; status?: number } = {}): Response {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${esc(title)}</title><link rel="icon" href="/favicon.ico"><style>${BASE_CSS}${opts.css ?? ""}</style></head><body>${body}${opts.script ? `<script>${opts.script}</script>` : ""}</body></html>`;
  return new Response(html, { status: opts.status ?? 200, headers: PORTAL_HEADERS });
}

const SIMPLE_CSS = `body{min-height:100vh;display:grid;place-items:center;text-align:center;padding:24px}main{animation:arrive .7s ease-out both}img{width:min(280px,70vw);height:auto;margin:auto}.eyebrow{display:block;margin-top:28px}p{color:var(--muted);max-width:34ch;margin:18px auto 0}`;

export function simplePage(message: string, status = 200): Response {
  return page(
    "SD Tech Systems · Seguimiento",
    `<main><img src="/brand/logo-white.svg" alt="SD Tech Systems"><span class="eyebrow">Seguimiento de clientes</span><p>${message}</p><p><a href="https://sdtechsystems.dev">sdtechsystems.dev</a></p></main>`,
    { css: SIMPLE_CSS, status },
  );
}

export const homePage = (): Response => simplePage("Página de seguimiento de clientes de SD Tech Systems. Abre el enlace que te enviamos para ver tu proyecto.");

export const invalidLinkPage = (): Response => simplePage("Este enlace no es válido. Escríbenos por WhatsApp y te enviamos uno nuevo.", 404);

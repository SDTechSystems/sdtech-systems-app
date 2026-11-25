export const PORTAL_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "no-referrer",
};

/** Página temporal del portal de clientes (el portal real llega en la etapa 2). */
export function renderPortalPlaceholder(): Response {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>SD Tech Systems · Seguimiento</title><link rel="icon" href="/brand/favicon-32.png"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07111F;color:#E6EEF6;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;padding:24px}img{width:min(280px,70vw);height:auto}p{color:#A7B9CD;max-width:32ch;margin:20px auto 0;line-height:1.5}a{color:#00BDE8}</style></head><body><main><img src="/brand/logo-horizontal.png" alt="SD Tech Systems"><p>Página de seguimiento de clientes. Muy pronto vas a ver aquí el avance de tu proyecto.</p><p><a href="https://sdtechsystems.dev">sdtechsystems.dev</a></p></main></body></html>`;
  return new Response(html, { status: 200, headers: PORTAL_HEADERS });
}

/**
 * En el celular, mantiene el campo que se está escribiendo con aire sobre el teclado:
 * cuando se acerca al borde, la pantalla baja un poco (suave), sin esperar a que se tape
 * y sin centrarlo de golpe.
 */

/** Cuánto hay que desplazar (px, + baja la página) para dejar el campo en zona cómoda. */
export function scrollDeltaFor(rect: { top: number; bottom: number }, viewportHeight: number, opts: { top?: number; minBottom?: number } = {}): number {
  const topMargin = opts.top ?? 16;
  const bottomMargin = Math.max(opts.minBottom ?? 120, Math.round(viewportHeight * 0.25));
  const limit = viewportHeight - bottomMargin;
  if (rect.bottom > limit) return Math.round(rect.bottom - limit);
  if (rect.top < topMargin) return Math.round(rect.top - topMargin);
  return 0;
}

const FIELDS = "input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea, select, [contenteditable=true]";

function scrollParent(el: Element): Element {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement ?? document.documentElement;
}

function stickyHeaderHeight(container: Element): number {
  // La barra superior del panel en celular mide ~57 px; dentro de diálogos no hay barra.
  return container === document.scrollingElement ? 72 : 16;
}

function keepVisible(el: Element) {
  const vv = window.visualViewport;
  const height = vv ? vv.height : window.innerHeight;
  const offsetTop = vv ? vv.offsetTop : 0;
  const container = scrollParent(el);
  const r = el.getBoundingClientRect();
  const delta = scrollDeltaFor({ top: r.top - offsetTop, bottom: r.bottom - offsetTop }, height, { top: stickyHeaderHeight(container) });
  if (delta !== 0) container.scrollBy({ top: delta, behavior: "smooth" });
}

const isTouch = () => window.matchMedia?.("(pointer: coarse)").matches;

export function installKeyboardScroll(): void {
  if (typeof window === "undefined" || !isTouch()) return;
  let timer: number | undefined;
  const schedule = (el: Element | null, wait: number) => {
    if (!el || !el.matches(FIELDS)) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => keepVisible(el), wait);
  };
  // Espera a que el teclado termine de abrir antes de medir.
  document.addEventListener("focusin", (e) => schedule(e.target as Element, 280));
  // Un textarea que crece mientras escribes también se mantiene a la vista.
  document.addEventListener("input", (e) => schedule(e.target as Element, 60));
  window.visualViewport?.addEventListener("resize", () => schedule(document.activeElement, 120));
}

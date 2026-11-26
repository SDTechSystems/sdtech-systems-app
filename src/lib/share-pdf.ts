import { downloadBlob } from "../pdf/download";
import { openWhatsApp } from "./whatsapp";

const PDF = "application/pdf";

/**
 * Qué pasó con el PDF:
 * - `shared`: salió por el menú de compartir (o Juan lo cerró);
 * - `downloaded`: se descargó y se abrió WhatsApp; sin teléfono, `copied` dice si el mensaje quedó en el portapapeles;
 * - `retry`: el navegador negó el menú porque el PDF tardó en armarse (Safari pide un toque reciente);
 *   `share()` lo vuelve a intentar desde un toque nuevo, y si aun así falla, descarga y abre WhatsApp.
 */
export type ShareResult = { status: "shared" } | { status: "downloaded"; copied: boolean | null } | { status: "retry"; share: () => Promise<ShareResult> };

type ShareOpts = { blob: Blob; fileName: string; text: string; phone: string | null; tab?: Window | null };

/** Si el navegador puede mandar archivos al menú de compartir (celulares, sobre todo). */
export const canShareFiles = (): boolean => {
  try {
    return !!navigator.canShare?.({ files: [new File([], "x.pdf", { type: PDF })] });
  } catch {
    return false;
  }
};

const errorName = (e: unknown) => (e as { name?: string } | null)?.name;

async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Descarga el PDF y abre WhatsApp con el mensaje; sin teléfono, copia el mensaje. */
async function downloadAndOpen(opts: ShareOpts): Promise<ShareResult> {
  downloadBlob(opts.blob, opts.fileName);
  if (opts.phone) {
    openWhatsApp(opts.phone, opts.text, opts.tab ?? null);
    return { status: "downloaded", copied: null };
  }
  opts.tab?.close();
  return { status: "downloaded", copied: await copyText(opts.text) };
}

/** El menú de compartir con el archivo. `null` si el navegador lo negó por falta de un toque reciente. */
async function openShareSheet(file: File, text: string): Promise<ShareResult | null> {
  try {
    await navigator.share({ files: [file], text });
  } catch (e) {
    if (errorName(e) === "NotAllowedError") return null;
    if (errorName(e) !== "AbortError") throw e;
  }
  return { status: "shared" };
}

/**
 * Envía el PDF: con el menú de compartir si el navegador puede mandar archivos (Juan elige WhatsApp
 * y el chat); si no, lo descarga y abre WhatsApp con el mensaje. Cancelar el menú no es un error.
 */
export async function sharePdf(opts: ShareOpts): Promise<ShareResult> {
  const file = new File([opts.blob], opts.fileName, { type: PDF });
  if (!navigator.canShare?.({ files: [file] })) return downloadAndOpen(opts);
  const shared = await openShareSheet(file, opts.text);
  if (shared) return shared;
  const again = { ...opts, tab: null };
  return { status: "retry", share: async () => (await openShareSheet(file, opts.text)) ?? downloadAndOpen(again) };
}

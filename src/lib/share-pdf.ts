import { downloadBlob } from "../pdf/download";
import { openWhatsApp } from "./whatsapp";

const PDF = "application/pdf";

/** Si el navegador puede mandar archivos al menú de compartir (celulares, sobre todo). */
export const canShareFiles = (): boolean => {
  try {
    return !!navigator.canShare?.({ files: [new File([], "x.pdf", { type: PDF })] });
  } catch {
    return false;
  }
};

/**
 * Envía el PDF: con el menú de compartir si el navegador puede mandar archivos (Juan elige WhatsApp
 * y el chat); si no, lo descarga y abre WhatsApp con el mensaje para arrastrar el archivo.
 * Si el navegador niega el menú porque el PDF tardó en armarse (Safari pide un toque reciente),
 * también descarga y abre WhatsApp. Cancelar el menú no es un error.
 */
export async function sharePdf(opts: { blob: Blob; fileName: string; text: string; phone: string | null; tab?: Window | null }): Promise<"shared" | "downloaded"> {
  const file = new File([opts.blob], opts.fileName, { type: PDF });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: opts.text });
      return "shared";
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      if (name === "AbortError") return "shared";
      if (name !== "NotAllowedError") throw e;
    }
  }
  downloadBlob(opts.blob, opts.fileName);
  openWhatsApp(opts.phone, opts.text, opts.tab ?? null);
  return "downloaded";
}

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatLongDate } from "../../shared/dates";
import { collectionDocModel } from "../../shared/docs/collection";
import type { DocClient, DocModel } from "../../shared/docs/model";
import { quoteDocModel } from "../../shared/docs/quote";
import { receiptDocModel } from "../../shared/docs/receipt";
import { formatMoney } from "../../shared/money";
import { fillTemplate } from "../../shared/templates";
import type { Collection, Invoice, Quote, Settings } from "../../shared/types";
import { saveDocToDrive } from "@/lib/drive-upload";
import { driveReady, useGoogleStatus } from "@/lib/google";
import { errorMessage, firstName, quoteWhatsAppText } from "@/lib/labels";
import { getPortalUrl } from "@/lib/quote-actions";
import { canShareFiles, sharePdf, type ShareResult } from "@/lib/share-pdf";
import { useSettingsQuery } from "@/lib/useSettings";
import { logReminder } from "@/lib/whatsapp";
import { downloadBlob } from "./download";

/** Un documento del panel con lo que hace falta para armar su PDF. */
export type PdfDoc = { kind: "collection"; doc: Collection } | { kind: "receipt"; doc: Invoice } | { kind: "quote"; doc: Quote; client: DocClient };

/** El mismo modelo que usa la página del portal para ese documento. */
export function pdfDocModel(d: PdfDoc, settings: Settings, portalUrl: string): DocModel {
  if (d.kind === "collection") return collectionDocModel(d.doc, settings, portalUrl);
  if (d.kind === "receipt") return receiptDocModel(d.doc, settings, portalUrl);
  return quoteDocModel(d.doc, d.client, settings, portalUrl);
}

/** El mensaje que acompaña el PDF, de la plantilla de Ajustes («collection», «receipt» o «quote»). */
export function pdfDocText(d: PdfDoc, settings: Settings, portalUrl: string): string {
  if (d.kind === "quote") return quoteWhatsAppText(d.doc, d.client.name, portalUrl, settings.templates.quote);
  const c = d.doc;
  const vars = { nombre: firstName(c.client.name), numero: c.number, monto: formatMoney(c.total, c.currency) };
  if (d.kind === "receipt") return fillTemplate(settings.templates.receipt, { ...vars, link: `${portalUrl}/recibo/${c.number}` });
  return fillTemplate(settings.templates.collection, { ...vars, fecha: d.doc.dueDate ? formatLongDate(d.doc.dueDate) : "", link: `${portalUrl}/cobro/${c.number}` });
}

async function buildPdf(d: PdfDoc, settings: Settings) {
  // La librería de PDF se carga solo aquí, para no hacer más pesado el panel.
  const [portalUrl, { renderPdf, pdfFileName }] = await Promise.all([getPortalUrl(d.doc.clientId), import("./render")]);
  const model = pdfDocModel(d, settings, portalUrl);
  return { blob: await renderPdf(model), fileName: pdfFileName(model), text: pdfDocText(d, settings, portalUrl) };
}

/**
 * «Enviar»: arma el PDF y lo comparte (menú del celular) o lo descarga y abre WhatsApp.
 * Sin menú de compartir, la pestaña de WhatsApp se abre antes de esperar, porque los navegadores
 * bloquean ventanas abiertas después de un await.
 */
export async function sendDocPdf(d: PdfDoc, settings: Settings, phone: string | null): Promise<ShareResult> {
  const tab = phone && !canShareFiles() ? window.open("about:blank", "_blank") : null;
  try {
    const pdf = await buildPdf(d, settings);
    const result = await sharePdf({ ...pdf, phone, tab });
    if (d.kind === "quote") void logReminder("quote", d.doc.id, "quote");
    else void logReminder("project", d.doc.projectId, d.kind);
    return result;
  } catch (e) {
    tab?.close();
    throw e;
  }
}

/** «Descargar PDF»: solo descarga. */
export async function downloadDocPdf(d: PdfDoc, settings: Settings): Promise<void> {
  const { blob, fileName } = await buildPdf(d, settings);
  downloadBlob(blob, fileName);
}

/** Arma el PDF y lo guarda en la carpeta de Drive del documento (reemplaza el que ya estaba). */
export async function saveDocPdfToDrive(d: PdfDoc, settings: Settings): Promise<void> {
  const portalUrl = await getPortalUrl(d.doc.clientId);
  await saveDocToDrive({ type: d.kind, id: d.doc.id }, pdfDocModel(d, settings, portalUrl));
}

/** Guarda el PDF en Drive sin hacer esperar a nadie; si falla, un aviso con «Reintentar». */
export function saveDocInBackground(d: PdfDoc, settings: Settings): void {
  const run = () => {
    saveDocPdfToDrive(d, settings).catch((e) =>
      toast.error(`No pudimos guardar ${d.doc.number} en Drive`, { description: errorMessage(e), duration: 30_000, action: { label: "Reintentar", onClick: run } }),
    );
  };
  run();
}

/** Guardado automático en Drive después de emitir o enviar; no hace nada si Drive no está conectado. */
export function useDriveAutoSave(): (d: PdfDoc) => void {
  const settings = useSettingsQuery().data?.settings;
  const drive = driveReady(useGoogleStatus().data);
  return (d) => {
    if (settings && drive) saveDocInBackground(d, settings);
  };
}

/** El aviso después de «Enviar». En el celular no se habla de arrastrar el archivo. */
export function sendNotice(result: ShareResult, onPhone: boolean): string | null {
  if (result.status === "shared") return null;
  if (result.status === "retry") return "Listo el PDF: toca Compartir para enviarlo por WhatsApp.";
  if (result.copied === null) return onPhone ? "Descargamos el PDF y abrimos WhatsApp: adjúntalo desde tus archivos." : "PDF descargado: arrástralo al chat de WhatsApp.";
  return result.copied ? "PDF descargado. El cliente no tiene WhatsApp: copiamos el mensaje." : "PDF descargado. El cliente no tiene WhatsApp y no pudimos copiar el mensaje.";
}

const onPhone = () => !!window.matchMedia?.("(pointer: coarse)").matches;

const whenIdle = (fn: () => void) => {
  if ("requestIdleCallback" in window) window.requestIdleCallback(fn, { timeout: 4000 });
  else setTimeout(fn, 1500);
};

let warm: "no" | "loading" | "done" = "no";

/** Precarga la librería de PDF y las fuentes una vez por sesión, cuando el navegador está libre. */
export function warmPdf(load: () => Promise<void> = async () => (await import("./render")).preloadPdf(), schedule: (fn: () => void) => void = whenIdle): void {
  if (warm !== "no") return;
  warm = "loading";
  schedule(() => {
    load().then(
      () => (warm = "done"),
      () => (warm = "no"),
    );
  });
}

/** Muestra el aviso de «Enviar»; si el navegador pidió un toque nuevo, con el botón «Compartir». */
function notify(result: ShareResult): void {
  const message = sendNotice(result, onPhone());
  if (!message) return;
  if (result.status !== "retry") {
    toast.success(message);
    return;
  }
  toast(message, {
    duration: 30_000,
    action: {
      label: "Compartir",
      onClick: () => {
        result.share().then(notify, (e) => toast.error(errorMessage(e)));
      },
    },
  });
}

/**
 * Los botones de PDF de un documento. `busy` es «send:<id>» o «download:<id>» mientras se arma;
 * `saving` tiene los ids que se están guardando en Drive (no bloquea los otros botones).
 */
export function useDocPdf() {
  const settings = useSettingsQuery().data?.settings;
  const drive = driveReady(useGoogleStatus().data);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState<string[]>([]);
  useEffect(() => warmPdf(), []);
  const run = async (key: string, job: () => Promise<void>) => {
    setBusy(key);
    try {
      await job();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return {
    ready: !!settings,
    busy,
    send: (d: PdfDoc, phone: string | null) => settings && run(`send:${d.doc.id}`, async () => notify(await sendDocPdf(d, settings, phone))),
    download: (d: PdfDoc) => settings && run(`download:${d.doc.id}`, () => downloadDocPdf(d, settings)),
    /** «Guardar en Drive» se muestra solo con Drive conectado. */
    drive,
    saving,
    saveToDrive: async (d: PdfDoc) => {
      if (!settings) return;
      const id = d.doc.id;
      setSaving((s) => [...s, id]);
      try {
        await saveDocPdfToDrive(d, settings);
        toast.success(`${d.doc.number} guardado en Drive`);
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setSaving((s) => s.filter((x) => x !== id));
      }
    },
  };
}

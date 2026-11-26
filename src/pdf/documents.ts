import { useState } from "react";
import { toast } from "sonner";
import { formatLongDate } from "../../shared/dates";
import { collectionDocModel } from "../../shared/docs/collection";
import type { DocClient, DocModel } from "../../shared/docs/model";
import { quoteDocModel } from "../../shared/docs/quote";
import { receiptDocModel } from "../../shared/docs/receipt";
import { formatMoney } from "../../shared/money";
import { fillTemplate } from "../../shared/templates";
import type { Collection, Invoice, Quote, Settings } from "../../shared/types";
import { errorMessage, firstName, quoteWhatsAppText } from "@/lib/labels";
import { getPortalUrl } from "@/lib/quote-actions";
import { canShareFiles, sharePdf } from "@/lib/share-pdf";
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
export async function sendDocPdf(d: PdfDoc, settings: Settings, phone: string | null): Promise<"shared" | "downloaded"> {
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

/** Los dos botones de PDF de un documento. `busy` es «send:<id>» o «download:<id>» mientras se arma. */
export function useDocPdf() {
  const settings = useSettingsQuery().data?.settings;
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, job: () => Promise<string | null>) => {
    setBusy(key);
    try {
      const message = await job();
      if (message) toast.success(message);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return {
    ready: !!settings,
    busy,
    send: (d: PdfDoc, phone: string | null) =>
      settings &&
      run(`send:${d.doc.id}`, async () => {
        const result = await sendDocPdf(d, settings, phone);
        if (result === "shared") return null;
        return phone ? "PDF descargado: arrástralo al chat de WhatsApp." : "PDF descargado. El cliente no tiene WhatsApp: copiamos el mensaje.";
      }),
    download: (d: PdfDoc) =>
      settings &&
      run(`download:${d.doc.id}`, async () => {
        await downloadDocPdf(d, settings);
        return null;
      }),
  };
}

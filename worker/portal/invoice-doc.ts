import { receiptDocModel } from "../../shared/docs/receipt";
import type { Invoice, Settings } from "../../shared/types";
import { renderDocHtml } from "./doc-html";

/** Recibo de pago (antes «factura»); /factura/FAC-… sigue funcionando. */
export function renderInvoiceDocument(inv: Invoice, settings: Settings, portalUrl: string): Response {
  return renderDocHtml(receiptDocModel(inv, settings, portalUrl), { backUrl: portalUrl, pdf: false });
}

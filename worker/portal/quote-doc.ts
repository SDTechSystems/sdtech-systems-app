import { quoteDocModel } from "../../shared/docs/quote";
import type { DocClient } from "../../shared/docs/model";
import type { Quote, Settings } from "../../shared/types";
import { renderDocHtml } from "./doc-html";

export interface QuoteDocData {
  quote: Quote;
  client: DocClient;
  settings: Settings;
  portalUrl: string;
}

export function renderQuoteDocument(d: QuoteDocData): Response {
  return renderDocHtml(quoteDocModel(d.quote, d.client, d.settings, d.portalUrl), { backUrl: d.portalUrl, pdf: true });
}

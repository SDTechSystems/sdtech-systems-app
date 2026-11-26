import { collectionDocModel } from "../../shared/docs/collection";
import type { Collection, Settings } from "../../shared/types";
import { renderDocHtml } from "./doc-html";

/** Cuenta de cobro en el portal: /c/<token>/cobro/CC-0001. */
export function renderCollectionDocument(c: Collection, settings: Settings, portalUrl: string): Response {
  return renderDocHtml(collectionDocModel(c, settings, portalUrl), { backUrl: portalUrl, pdf: true });
}

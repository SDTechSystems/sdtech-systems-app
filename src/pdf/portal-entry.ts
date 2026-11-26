import type { DocModel } from "../../shared/docs/model";
import { downloadBlob } from "./download";
import { pdfFileName, renderPdf } from "./render";

/**
 * Paquete del portal (/pdf/portal.js). La página del documento lo carga con `import()` al oprimir
 * «Descargar PDF»: lee el modelo de #doc-model y descarga el mismo PDF que arma el panel.
 */
export async function downloadPdf(): Promise<void> {
  const model = JSON.parse(document.getElementById("doc-model")?.textContent ?? "null") as DocModel | null;
  if (!model) throw new Error("doc_model_missing");
  downloadBlob(await renderPdf(model), pdfFileName(model));
}

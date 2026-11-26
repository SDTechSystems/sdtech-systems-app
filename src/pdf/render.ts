import { createElement, type ReactElement } from "react";
import { pdf, type DocumentProps } from "@react-pdf/renderer";
import type { DocModel } from "../../shared/docs/model";
import { DocumentPdf } from "./DocumentPdf";

/**
 * Arma el PDF del documento. El panel lo carga con `import()` y el portal lo trae en /pdf/portal.js,
 * así que la librería de PDF nunca entra al paquete principal.
 */
export const renderPdf = (model: DocModel, assetsBase = ""): Promise<Blob> => pdf(createElement(DocumentPdf, { model, assetsBase }) as ReactElement<DocumentProps>).toBlob();

/** «CC-0003.pdf». */
export const pdfFileName = (model: DocModel): string => `${model.number}.pdf`;

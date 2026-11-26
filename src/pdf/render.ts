import { createElement, type ReactElement } from "react";
import { Font, pdf, type DocumentProps } from "@react-pdf/renderer";
import type { DocModel } from "../../shared/docs/model";
import { DocumentPdf } from "./DocumentPdf";
import { registerFonts } from "./fonts";

/**
 * Arma el PDF del documento. El panel lo carga con `import()` y el portal lo trae en /pdf/portal.js,
 * así que la librería de PDF nunca entra al paquete principal.
 */
export const renderPdf = (model: DocModel, assetsBase = ""): Promise<Blob> => pdf(createElement(DocumentPdf, { model, assetsBase }) as ReactElement<DocumentProps>).toBlob();

/** «CC-0003.pdf». */
export const pdfFileName = (model: DocModel): string => `${model.number}.pdf`;

/**
 * Deja listas las fuentes (y el logo en la caché del navegador) antes del primer «Enviar», para que
 * el PDF salga rápido y el celular no pierda el toque antes de abrir el menú de compartir.
 */
export async function preloadPdf(assetsBase = ""): Promise<void> {
  registerFonts(assetsBase);
  await Promise.all([
    Font.load({ fontFamily: "SD Sans", fontWeight: 400 }),
    Font.load({ fontFamily: "SD Sans", fontWeight: 700 }),
    Font.load({ fontFamily: "SD Mono" }),
    fetch(`${assetsBase}/brand/logo-color.png`).then((r) => r.blob()),
  ]);
}

import path from "path";
import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { extractText, getDocumentProxy } from "unpdf";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocModel } from "../shared/docs/model";
import { DocumentPdf } from "../src/pdf/DocumentPdf";
import { pdfFileName } from "../src/pdf/render";

const PUBLIC_DIR = path.resolve(__dirname, "../public");

const base: DocModel = {
  kind: "collection",
  title: "CUENTA DE COBRO",
  number: "CC-0003",
  issuedOn: "2026-11-26",
  currency: "COP",
  voided: false,
  company: { name: "SD Tech Systems", nit: "901.234.567-8", phone: "+57 305 814 7293", email: "contacto@sdtechsystems.dev", website: "sdtechsystems.dev", taxNote: "No responsable de IVA" },
  party: { name: "Jennifer", lines: ["Jen Essence", "Medellín"] },
  from: "SD Tech Systems · NIT 901.234.567-8",
  intro: { text: "Por los servicios prestados, el valor a pagar es:", amount: 450000, words: "cuatrocientos cincuenta mil pesos" },
  lines: [{ title: "Kit de marca estándar", detail: "2 propuestas, logo y versiones", quantity: 1, unitPrice: 450000, total: 450000 }],
  totals: [{ label: "Total", amount: 450000, tone: "grand" }],
  facts: [{ label: "Fecha acordada de pago", value: "5 de diciembre de 2026" }],
  payment: {
    title: "Medios de pago",
    items: [
      { name: "Bre-B", detail: "3058147293 · Davibank" },
      { name: "Nequi", detail: "" },
    ],
  },
  links: [{ label: "Pagar en línea", url: "https://bold.co/pay/x" }],
  note: "Nota de prueba",
  conditions: ["Condición uno"],
  thanks: "Gracias por confiar en SD Tech Systems.",
  smallPrint: null,
  footer: { qrUrl: "https://clientes.sdtechsystems.dev/c/abc", qrCaption: "Escanea para ver tu página.", verifyCode: null, verifyUrl: null },
};

/** Una cuenta de cobro con `n` líneas; la primera trae un detalle de `detailLength` caracteres. */
function bigModel(n: number, detailLength: number): DocModel {
  const words = "Diseño de piezas gráficas para redes sociales con ajustes incluidos ";
  const long = words.repeat(Math.ceil(detailLength / words.length)).slice(0, detailLength);
  const lines = Array.from({ length: n }, (_, i) => ({
    title: `Servicio ${i + 1}`,
    detail: i === 0 ? long : `Detalle corto del servicio ${i + 1}`,
    quantity: 1,
    unitPrice: 10000,
    total: 10000,
  }));
  const total = n * 10000;
  return { ...base, lines, totals: [{ label: "Total", amount: total, tone: "grand" }], intro: { ...base.intro!, amount: total } };
}

/** El texto de cada hoja, sin saltos ni espacios repetidos. */
async function pageTexts(buf: Buffer): Promise<string[]> {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: false });
  return text.map((t) => t.replace(/\s+/g, " "));
}

/** Una cuenta con `before` líneas cortas y luego una línea con el detalle dado (termina en «FIN-DEL-DETALLE»). */
const withLongRow = (before: number, detail: string): DocModel => {
  const short = bigModel(before, 10).lines.map((l) => ({ ...l, detail: "Corto" }));
  return { ...base, lines: [...short, { title: "Servicio largo", detail: `${detail}FIN-DEL-DETALLE`, quantity: 1, unitPrice: 1000, total: 1000 }] };
};
const words = (n: number) => "Diseño de piezas gráficas para redes sociales con ajustes incluidos ".repeat(60).slice(0, n);

const pages = (buf: Buffer) => (buf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
const render = (model: DocModel) => renderToBuffer(createElement(DocumentPdf, { model, assetsBase: PUBLIC_DIR }) as ReactElement<DocumentProps>);

describe("PDF document", () => {
  // react-pdf avisa por consola cuando algo no cabe o falta una fuente: la salida debe quedar limpia.
  const warn = vi.spyOn(console, "warn");
  const error = vi.spyOn(console, "error");
  beforeEach(() => {
    warn.mockClear();
    error.mockClear();
  });
  afterEach(() => {
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("renders a 60-line collection with a 2,000-character detail into several pages", async () => {
    const buf = await render(bigModel(60, 2000));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pages(buf)).toBeGreaterThan(1);
  }, 30_000);

  it("renders a one-line receipt into a single page", async () => {
    const receipt: DocModel = {
      ...base,
      kind: "receipt",
      title: "RECIBO DE PAGO",
      number: "REC-0007",
      from: null,
      intro: null,
      payment: null,
      links: [],
      note: null,
      conditions: [],
      thanks: null,
      totals: [
        { label: "Total", amount: 450000, tone: "grand" },
        { label: "Pago Nequi · 26 de noviembre de 2026", amount: 450000, tone: "minus" },
      ],
      footer: { ...base.footer, verifyCode: "AB12CD34", verifyUrl: "clientes.sdtechsystems.dev/verificar/AB12CD34" },
    };
    expect(pages(await render(receipt))).toBe(1);
  }, 30_000);

  it("renders a voided quote with long unbroken words without failing", async () => {
    const quote: DocModel = {
      ...base,
      kind: "quote",
      title: "COTIZACIÓN",
      number: "COT-0012",
      voided: true,
      smallPrint: "Los costos de terceros pueden variar.",
      lines: [{ title: "x".repeat(120), detail: "https://example.com/" + "a".repeat(300), quantity: 3, unitPrice: 1234567, total: 3703701 }],
      links: [{ label: "Tu entrega", url: "https://drive.google.com/" + "b".repeat(200) }],
    };
    expect(pages(await render(quote))).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it("prints the page count in the footer and the running header on later pages", async () => {
    const texts = await pageTexts(await render(bigModel(60, 2000)));
    const n = texts.length;
    expect(n).toBeGreaterThan(2);
    texts.forEach((t, i) => expect(t).toContain(`CC-0003 · SD Tech Systems Página ${i + 1} de ${n}`));
    expect(texts[0]).toContain("SD Tech Systems NIT 901.234.567-8");
    expect(texts[0]).not.toContain("CUENTA DE COBRO · CC-0003");
    for (const t of texts.slice(1)) expect(t).toContain("CUENTA DE COBRO · CC-0003");
    for (const t of texts.slice(1)) expect(t).toContain("DESCRIPCIÓN CANT. VALOR UNITARIO TOTAL");
  }, 30_000);

  it("moves a 2,000-character detail row whole to the next page instead of splitting it", async () => {
    const detail = words(2000 - "FIN-DEL-DETALLE".length);
    const texts = await pageTexts(await render(withLongRow(12, detail)));
    const at = texts.findIndex((t) => t.includes("Servicio largo"));
    expect(at).toBeGreaterThan(0);
    expect(texts[at]).toContain("FIN-DEL-DETALLE");
    expect(texts[at]).toContain(detail.slice(0, 40));
  }, 30_000);

  it("lets an over-long legacy detail flow across pages without losing text", async () => {
    for (const detail of [words(4000) + words(2000), "a\n".repeat(900), "W".repeat(1990)]) {
      const texts = await pageTexts(await render(withLongRow(3, detail)));
      expect(texts.join(" ")).toContain("FIN-DEL-DETALLE");
    }
  }, 60_000);

  it("names the file after the document number", () => {
    expect(pdfFileName(base)).toBe("CC-0003.pdf");
    expect(pdfFileName({ ...base, number: "REC-0007" })).toBe("REC-0007.pdf");
  });
});

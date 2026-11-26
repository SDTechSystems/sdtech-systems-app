import type { Currency, Invoice, Settings } from "../types";

/**
 * Un solo modelo para cotización, cuenta de cobro y recibo. Lo dibujan el HTML del
 * portal (worker/portal/doc-html.ts) y el PDF, siempre con el mismo orden de bloques:
 * logo+empresa → título+número → Para/De+facts → intro → tabla → totales → pago →
 * links → nota → condiciones → letra pequeña → gracias → pie (QR, verificación, leyenda fiscal).
 */
export type DocKind = "quote" | "collection" | "receipt";

/** Dominio del portal de clientes; ahí vive la verificación pública (worker/portal/verify.ts). */
export const PORTAL_HOST = "clientes.sdtechsystems.dev";
export const VERIFY_PATH = "verificar";
/** «clientes.sdtechsystems.dev/verificar/CODIGO», como se imprime en el pie del recibo. */
export const verifyUrl = (code: string): string => `${PORTAL_HOST}/${VERIFY_PATH}/${code}`;

export interface DocLine {
  title: string;
  detail: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export type DocClient = Invoice["client"];

export interface DocModel {
  kind: DocKind;
  title: string;
  number: string;
  /** YYYY-MM-DD (día en Bogotá); vacío si aún no se emitió. */
  issuedOn: string;
  currency: Currency;
  voided: boolean;
  company: { name: string; nit: string; phone: string; email: string; website: string; taxNote: string };
  /** «Para:» (el cliente). */
  party: { name: string; lines: string[] };
  /** «De: SD Tech Systems · NIT …» (solo cuenta de cobro). */
  from: string | null;
  /** Bloque «el valor a pagar es» con el valor en letras. */
  intro: { text: string; amount: number; words: string } | null;
  lines: DocLine[];
  totals: { label: string; amount: number; tone: "grand" | "minus" | "balance" | "plain" }[];
  facts: { label: string; value: string }[];
  payment: { title: string; items: { name: string; detail: string }[] } | null;
  links: { label: string; url: string }[];
  note: string | null;
  conditions: string[];
  thanks: string | null;
  /** Letra pequeña fija del tipo de documento (en la cotización, la nota de costos de terceros). */
  smallPrint: string | null;
  footer: { qrUrl: string; qrCaption: string; verifyCode: string | null; verifyUrl: string | null };
}

export const docCompany = (s: Settings): DocModel["company"] => {
  const { name, nit, phone, email, website, taxNote } = s.company;
  return { name, nit, phone, email, website, taxNote };
};

export const docParty = (c: DocClient): DocModel["party"] => ({
  name: c.name,
  lines: [c.company, c.document ? `Documento: ${c.document}` : null, c.city, c.phone ? `+${c.phone}` : null, c.email].filter((l): l is string => !!l),
});

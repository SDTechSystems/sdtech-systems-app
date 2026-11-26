import { expect, it, vi } from "vitest";
import { collectionDocModel } from "../shared/docs/collection";
import { DEFAULT_TEMPLATES } from "../shared/templates";
import type { Collection, Invoice, Settings } from "../shared/types";
import { pdfDocModel, pdfDocText } from "../src/pdf/documents";

// Solo lo que leen los modelos y las plantillas (worker/settings no compila con los tipos del navegador).
const DEFAULT_SETTINGS = {
  company: { name: "SD Tech Systems", phone: "+57 305 814 7293", email: "contacto@sdtechsystems.dev", website: "sdtechsystems.dev", nit: "", taxNote: "No responsable de IVA" },
  payment: { brebKey: "3058147293", bank: "Davibank", usdText: "", methods: [] },
  templates: DEFAULT_TEMPLATES,
} as unknown as Settings;
const PORTAL = "https://clientes.sdtechsystems.dev/c/abc";
const client = { name: "Jennifer Ruiz", company: "Jen Essence", document: null, city: "Medellín", phone: "573058147293", email: null };
const collection = {
  id: "col1",
  number: "CC-0003",
  projectId: "p1",
  clientId: "c1",
  projectTitle: "Kit de marca",
  issuedAt: "2026-11-26T15:00:00.000Z",
  currency: "COP",
  total: 450000,
  dueDate: "2026-12-05",
  planIds: [],
  paymentIds: [],
  paid: 0,
  status: "pending",
  lines: [],
  includeDelivery: false,
  deliveryUrl: null,
  paymentUrl: null,
  note: null,
  client,
  methods: [],
  driveFileId: null,
} as Collection;
const receipt = {
  id: "inv1",
  number: "REC-0007",
  projectId: "p1",
  clientId: "c1",
  issuedAt: "2026-11-26T15:00:00.000Z",
  currency: "COP",
  total: 450000,
  paid: 450000,
  balance: 0,
  verifyCode: "AB12CD34",
  voided: false,
  projectTitle: "Kit de marca",
  lines: [],
  payments: [],
  paymentIds: [],
  projectBalance: 0,
  collectionId: null,
  collectionNumber: null,
  client,
} as Invoice;

it("builds the panel's PDF from the same model as the portal page", () => {
  expect(pdfDocModel({ kind: "collection", doc: collection }, DEFAULT_SETTINGS, PORTAL)).toEqual(collectionDocModel(collection, DEFAULT_SETTINGS, PORTAL));
  expect(pdfDocModel({ kind: "receipt", doc: receipt }, DEFAULT_SETTINGS, PORTAL).number).toBe("REC-0007");
});

it("fills the collection and receipt messages with a link to the document page", () => {
  expect(pdfDocText({ kind: "collection", doc: collection }, DEFAULT_SETTINGS, PORTAL)).toBe(
    "Hola Jennifer, te comparto la cuenta de cobro CC-0003 por $ 450.000. También la puedes ver en tu página: https://clientes.sdtechsystems.dev/c/abc/cobro/CC-0003",
  );
  expect(pdfDocText({ kind: "receipt", doc: receipt }, DEFAULT_SETTINGS, PORTAL)).toBe(
    "Hola Jennifer, te comparto el recibo de pago REC-0007 por $ 450.000. ¡Gracias por tu pago! También lo puedes ver en tu página: https://clientes.sdtechsystems.dev/c/abc/recibo/REC-0007",
  );
});

it("offers the agreed date to a custom collection template", () => {
  const settings = { ...DEFAULT_SETTINGS, templates: { ...DEFAULT_SETTINGS.templates, collection: "{numero} vence el {fecha}" } };
  expect(pdfDocText({ kind: "collection", doc: collection }, settings, PORTAL)).toBe("CC-0003 vence el 5 de diciembre de 2026");
  expect(pdfDocText({ kind: "collection", doc: { ...collection, dueDate: null } }, settings, PORTAL)).toBe("CC-0003 vence el ");
});

it("tells Juan what happened after Enviar, without asking to drag a file on a phone", async () => {
  const { sendNotice } = await import("../src/pdf/documents");
  const retry = { status: "retry" as const, share: async () => ({ status: "shared" as const }) };
  expect(sendNotice({ status: "shared" }, false)).toBeNull();
  expect(sendNotice(retry, true)).toBe("Listo el PDF: toca Compartir para enviarlo por WhatsApp.");
  expect(sendNotice({ status: "downloaded", copied: null }, false)).toBe("PDF descargado: arrástralo al chat de WhatsApp.");
  const onPhone = sendNotice({ status: "downloaded", copied: null }, true);
  expect(onPhone).toBe("Descargamos el PDF y abrimos WhatsApp: adjúntalo desde tus archivos.");
  expect(onPhone).not.toMatch(/arrastr/);
  expect(sendNotice({ status: "downloaded", copied: true }, false)).toBe("PDF descargado. El cliente no tiene WhatsApp: copiamos el mensaje.");
  expect(sendNotice({ status: "downloaded", copied: false }, true)).toBe("PDF descargado. El cliente no tiene WhatsApp y no pudimos copiar el mensaje.");
});

it("warms the PDF library and fonts once per session, when the browser is idle", async () => {
  const { warmPdf } = await import("../src/pdf/documents");
  const load = vi.fn(async () => undefined);
  const later: (() => void)[] = [];
  const schedule = (fn: () => void) => later.push(fn);
  warmPdf(load, schedule);
  warmPdf(load, schedule);
  expect(load).not.toHaveBeenCalled();
  later.forEach((fn) => fn());
  await Promise.resolve();
  expect(load).toHaveBeenCalledOnce();
  warmPdf(load, schedule);
  expect(later).toHaveLength(1);
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";

const openWhatsApp = vi.fn((_phone: string | null, _text: string, _tab?: Window | null) => true);
vi.mock("../src/lib/whatsapp", () => ({ openWhatsApp }));

const { sharePdf } = await import("../src/lib/share-pdf");

const blob = new Blob(["%PDF-1.3"], { type: "application/pdf" });
const opts = { blob, fileName: "CC-0003.pdf", text: "Hola Jennifer, te comparto la cuenta de cobro CC-0003", phone: "573058147293" };
const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };

beforeEach(() => {
  openWhatsApp.mockClear();
  anchor.click.mockClear();
  anchor.download = "";
  vi.stubGlobal("document", { createElement: vi.fn(() => anchor), body: { append: vi.fn() } });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
  vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const domError = (name: string) => Object.assign(new Error(name), { name });

it("uses the share sheet when files can be shared", async () => {
  const share = vi.fn(async (_data: ShareData) => undefined);
  vi.stubGlobal("navigator", { canShare: () => true, share });
  expect(await sharePdf(opts)).toBe("shared");
  const data = share.mock.calls[0][0];
  expect(data.files![0].name).toBe("CC-0003.pdf");
  expect(data.files![0].type).toBe("application/pdf");
  expect(data.text).toBe(opts.text);
  expect(anchor.click).not.toHaveBeenCalled();
  expect(openWhatsApp).not.toHaveBeenCalled();
});

it("downloads and opens WhatsApp when files cannot be shared", async () => {
  vi.stubGlobal("navigator", {});
  const tab = {} as Window;
  expect(await sharePdf({ ...opts, tab })).toBe("downloaded");
  expect(anchor.download).toBe("CC-0003.pdf");
  expect(anchor.click).toHaveBeenCalledOnce();
  expect(openWhatsApp).toHaveBeenCalledWith("573058147293", opts.text, tab);
});

it("treats a cancelled share sheet as done", async () => {
  vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn(async () => Promise.reject(domError("AbortError"))) });
  expect(await sharePdf(opts)).toBe("shared");
  expect(anchor.click).not.toHaveBeenCalled();
  expect(openWhatsApp).not.toHaveBeenCalled();
});

it("falls back to download and WhatsApp when the browser refuses to share after the PDF was generated", async () => {
  vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn(async () => Promise.reject(domError("NotAllowedError"))) });
  expect(await sharePdf(opts)).toBe("downloaded");
  expect(anchor.click).toHaveBeenCalledOnce();
  expect(openWhatsApp).toHaveBeenCalledWith("573058147293", opts.text, null);
});

it("lets any other share failure through", async () => {
  vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn(async () => Promise.reject(domError("DataError"))) });
  await expect(sharePdf(opts)).rejects.toThrow("DataError");
});

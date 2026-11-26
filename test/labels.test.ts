import { expect, it } from "vitest";
import { formatBytes, quoteWhatsAppText } from "../src/lib/labels";
import type { Quote } from "../shared/types";

it("writes the WhatsApp message for a quote", () => {
  const q = { number: "COT-0007", total: 650000, currency: "COP", validUntil: "2026-12-25" } as Quote;
  expect(quoteWhatsAppText(q, "María Gómez", "https://clientes.sdtechsystems.dev/c/abc")).toBe(
    "Hola María, te comparto la cotización COT-0007 por $ 650.000. Puedes verla y aprobarla aquí: https://clientes.sdtechsystems.dev/c/abc. Es válida hasta el 25 de diciembre de 2026.",
  );
});

it("prints signed amounts for cost changes", async () => {
  const { signedMoney } = await import("../src/lib/labels");
  expect(signedMoney(150000, "COP")).toBe("+ $ 150.000");
  expect(signedMoney(-120000, "COP")).toBe("− $ 120.000");
});

it("writes file sizes the Colombian way", () => {
  expect(formatBytes(900)).toBe("900 B");
  expect(formatBytes(1536)).toBe("1,5 KB");
  expect(formatBytes(248 * 1024 * 1024)).toBe("248 MB");
  expect(formatBytes(1.2 * 1024 ** 3)).toBe("1,2 GB");
});

it("explains an interrupted Drive upload by its real cause", async () => {
  const { errorMessage } = await import("../src/lib/labels");
  const { ApiError } = await import("../src/lib/api");
  const { DriveUploadInterrupted } = await import("../src/lib/drive-upload");
  const session = { uploadUrl: "https://www.googleapis.com/upload/drive/v3/files?upload_id=x", offset: 0 };
  expect(errorMessage(new DriveUploadInterrupted(new ApiError(409, "drive_not_connected"), session))).toBe("Reconecta Google para usar Drive");
  expect(errorMessage(new DriveUploadInterrupted(new TypeError("Failed to fetch"), session))).toBe("No se pudo conectar. Revisa tu internet.");
});

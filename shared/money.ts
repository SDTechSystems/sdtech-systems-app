export type Currency = "COP" | "USD";

const groupThousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** COP en pesos enteros; USD en centavos. */
export function formatMoney(amount: number, currency: Currency): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(Math.round(amount));
  if (currency === "USD") {
    const cents = String(abs % 100).padStart(2, "0");
    return `${sign}US$ ${groupThousands(Math.floor(abs / 100))},${cents}`;
  }
  return `${sign}$ ${groupThousands(abs)}`;
}

/** Lee lo que Juan escribe en un campo de precio. Devuelve null si no es un monto válido. */
export function parseMoneyInput(text: string, currency: Currency): number | null {
  const raw = text.trim();
  if (!raw || raw.includes("-")) return null;
  if (currency === "COP") {
    const digits = raw.replace(/\D/g, "");
    return digits ? Number(digits) : null;
  }
  let cleaned = raw.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    const m = cleaned.match(/^(.*)\.(\d{1,2})$/);
    cleaned = m ? `${m[1].replace(/\./g, "")}.${m[2]}` : cleaned.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** 150000 → "+ $ 150.000"; -120000 → "− $ 120.000" (signo menos tipográfico). */
export const signedMoney = (amount: number, currency: Currency): string => `${amount < 0 ? "−" : "+"} ${formatMoney(Math.abs(amount), currency)}`;

import type { Currency } from "./money";

const UNITS = [
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
  "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];
const TENS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const HUNDREDS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

/** 0–999 en palabras ("uno" sin apocopar). */
function belowThousand(n: number): string {
  if (n === 100) return "cien";
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts = h ? [HUNDREDS[h]] : [];
  if (rest) parts.push(rest < 30 ? UNITS[rest] : TENS[Math.floor(rest / 10)] + (rest % 10 ? ` y ${UNITS[rest % 10]}` : ""));
  return parts.join(" ");
}

/** «uno» → «un» delante de un sustantivo (mil, millones, pesos): «veintiún mil», «treinta y un pesos». */
const apocope = (words: string): string => words.replace(/uno$/, "un").replace(/veintiun$/, "veintiún");

/** 0–999.999 en palabras, sin apocopar al final. */
function belowMillion(n: number): string {
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (thousands) parts.push(thousands === 1 ? "mil" : `${apocope(belowThousand(thousands))} mil`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/** Entero ≥ 0 en palabras, listo para ir delante de un sustantivo («un millón de», «veintiún»). */
function countWords(n: number): string {
  if (n === 0) return "cero";
  const millions = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? "un millón" : `${apocope(belowMillion(millions))} millones`);
  if (rest) parts.push(apocope(belowMillion(rest)));
  // «un millón de pesos», pero «un millón doscientos mil pesos».
  return parts.join(" ") + (millions && !rest ? " de" : "");
}

const counted = (n: number, one: string, many: string): string => (n === 1 ? `un ${one}` : `${countWords(n)} ${many}`);

/** Valor en letras para documentos: COP en pesos; USD en centavos («ciento veinte dólares con cincuenta centavos»). */
export function amountInWords(amount: number, currency: Currency): string {
  const abs = Math.abs(Math.round(amount));
  const sign = amount < 0 && abs > 0 ? "menos " : "";
  if (currency === "COP") return sign + counted(abs, "peso", "pesos");
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  return sign + counted(dollars, "dólar", "dólares") + (cents ? ` con ${counted(cents, "centavo", "centavos")}` : "");
}

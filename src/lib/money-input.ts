import { formatMoney } from "../../shared/money";
import type { Currency } from "../../shared/types";

/** Monto como se escribe en una casilla de valor: sin el símbolo de la moneda. */
export const priceText = (n: number, c: Currency) => formatMoney(n, c).replace(/^US\$ |^\$ /, "");

/** Deja el teléfono solo con dígitos e indicativo (por defecto Colombia, 57). */
export function normalizePhone(input: string, defaultCountry = "57"): string | null {
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  if (input.trim().startsWith("+")) return digits;
  if (digits.length === 10 && digits.startsWith("3")) return defaultCountry + digits;
  return digits;
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

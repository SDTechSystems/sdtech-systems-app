/** Texto de búsqueda: minúsculas y sin tildes, para que "maria" encuentre "María". */
export function searchKey(...parts: (string | null | undefined)[]): string {
  return parts
    .filter((p): p is string => !!p && p.trim() !== "")
    .map((p) => p.trim())
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

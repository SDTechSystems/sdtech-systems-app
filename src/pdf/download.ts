/** Descarga un archivo generado en el navegador. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  // Safari necesita el enlace vivo un momento después del clic.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

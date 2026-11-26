import { Font } from "@react-pdf/renderer";

/** Palabras más largas que esto (enlaces, códigos) se pueden partir en cualquier letra, sin guion, como `overflow-wrap:anywhere`. */
const LONG_WORD = 24;

let registeredBase: string | null = null;

/**
 * Registra «SD Sans» (normal y negrita) y «SD Mono» desde `${assetsBase}/fonts/*.ttf`.
 * En el navegador `assetsBase` es el origen (""); en las pruebas, la ruta de `public/`.
 * No se separan sílabas (los patrones de la librería son del inglés): solo se parten palabras muy largas.
 */
export function registerFonts(assetsBase: string): void {
  if (registeredBase === assetsBase) return;
  if (registeredBase !== null) Font.clear();
  registeredBase = assetsBase;
  const font = (file: string) => `${assetsBase}/fonts/${file}`;
  Font.register({
    family: "SD Sans",
    fonts: [
      { src: font("DejaVuSans.ttf"), fontWeight: 400 },
      { src: font("DejaVuSans-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({ family: "SD Mono", src: font("DejaVuSansMono.ttf") });
  Font.registerHyphenationCallback((word) => (word.length > LONG_WORD ? Array.from(word, (string) => ({ string, hyphen: null })) : [word]));
}

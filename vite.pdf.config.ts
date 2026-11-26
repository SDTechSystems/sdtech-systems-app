import { defineConfig } from "vite";
import path from "path";

/**
 * El PDF del portal de clientes: un módulo aparte, servido como archivo estático en /pdf/portal.js
 * y cargado solo al oprimir «Descargar PDF». Se compila después del panel, en la misma carpeta dist.
 */
export default defineConfig({
  publicDir: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  esbuild: { jsx: "automatic" },
  build: {
    target: "es2022",
    outDir: "dist/pdf",
    emptyOutDir: false,
    copyPublicDir: false,
    minify: "esbuild",
    lib: { entry: path.resolve(__dirname, "src/pdf/portal-entry.ts"), formats: ["es"], fileName: () => "portal.js" },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});

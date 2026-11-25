import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: { host: "::", port: 8080 },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["brand/favicon-32.png", "brand/symbol.png"],
      manifest: {
        name: "SD Tech Systems",
        short_name: "SD Tech",
        description: "Clientes, cotizaciones, proyectos y cobros de SD Tech Systems.",
        start_url: "/",
        display: "standalone",
        background_color: "#07111F",
        theme_color: "#07111F",
        orientation: "any",
        icons: [{ src: "/brand/symbol.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,webp}"],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  build: { target: "es2022" },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});

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
      // El panel está detrás de Cloudflare Access: el manifest debe pedirse con la cookie de sesión.
      useCredentials: true,
      includeAssets: ["favicon.ico", "brand/icon-32.png", "brand/icon-512.png"],
      manifest: {
        name: "SD Tech Systems",
        short_name: "SD Tech",
        description: "Clientes, cotizaciones, proyectos y cobros de SD Tech Systems.",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#07111F",
        theme_color: "#07111F",
        orientation: "any",
        icons: [
          { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/brand/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any" },
          { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
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

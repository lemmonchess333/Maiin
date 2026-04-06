import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const isCapacitor = process.env.CAPACITOR_BUILD === "true";

export default defineConfig({
  base: isCapacitor ? "/" : "/Maiin/",
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.1.0'),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: "esbuild",
    sourcemap: false,
    // Performance budget: warn if any chunk exceeds this limit (KB)
    // maplibre (~1MB) and barcode (~416KB) are already lazy-loaded in their own chunks
    chunkSizeWarningLimit: 1100,

    // Inline assets smaller than 4KB, keep larger ones as separate files
    assetsInlineLimit: 4096,

    rollupOptions: {
      output: {
        manualChunks: {
          "firebase-auth": ["firebase/app", "firebase/auth"],
          "firebase-db": ["firebase/firestore", "firebase/storage"],
          charts: ["recharts"],
          vendor: ["react", "react-dom", "react-router-dom"],
          maplibre: ["maplibre-gl"],
          motion: ["framer-motion"],
          "date-fns": ["date-fns"],
          barcode: ["@zxing/browser"],
          "body-highlighter": ["react-body-highlighter"],
          stripe: ["@stripe/stripe-js"],
        },
      },
    },
  },
});
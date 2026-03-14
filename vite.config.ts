import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  base: "/Maiin/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: "esbuild",
    sourcemap: true,
    chunkSizeWarningLimit: 600,

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
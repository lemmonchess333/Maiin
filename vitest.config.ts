import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    "import.meta.env.VITE_FIREBASE_API_KEY": JSON.stringify("test-api-key"),
    "import.meta.env.VITE_FIREBASE_AUTH_DOMAIN": JSON.stringify("test.firebaseapp.com"),
    "import.meta.env.VITE_FIREBASE_PROJECT_ID": JSON.stringify("test-project"),
    "import.meta.env.VITE_FIREBASE_STORAGE_BUCKET": JSON.stringify("test.appspot.com"),
    "import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID": JSON.stringify("000000000000"),
    "import.meta.env.VITE_FIREBASE_APP_ID": JSON.stringify("1:000:web:000"),
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    exclude: ["e2e/**", "node_modules/**", ".claude/**"],
  },
});

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // WARNING: Changing appId requires updating APPLE_PRODUCT_IDS in
  // src/lib/purchaseProvider.ts and re-registering in App Store Connect.
  appId: "com.tropos.app",
  appName: "Tropos",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      // 2000ms → 500ms. The full-opaque splash should be gone as
      // soon as the web layer has something to paint. A 2s hard
      // wait made the app feel sluggish on cold start — iOS users
      // expect apps to feel instantly alive.
      launchShowDuration: 500,
      launchAutoHide: true,
      backgroundColor: "#7C6EF6",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#7C6EF6",
    },
    // Native OAuth sign-in (src/lib/nativeAuth.ts). skipNativeAuth keeps the
    // plugin from signing into the native Firebase SDK — we only want the
    // credential, which auth.tsx completes via signInWithCredential on the
    // JS SDK (the single source of auth state the app reads). providers
    // limits the native sheets to the ones we use.
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ["google.com", "apple.com"],
    },
  },
  ios: {
    contentInset: "automatic",
    scheme: "Tropos",
  },
  android: {
    backgroundColor: "#7C6EF6",
  },
};

export default config;

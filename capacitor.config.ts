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
      // The app's dark page background, not the brand purple. The splash
      // hands straight over to the first web frame, which paints
      // `--background` (public/init.js applies `.dark` before paint unless
      // the user explicitly chose light), so anything else is a flash.
      // Pinned against the token by coldStartChrome.test.ts.
      backgroundColor: "#111113",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashImmersive: true,
    },
    StatusBar: {
      // Capacitor's Style.Dark means LIGHT text for a dark background.
      style: "DARK",
      backgroundColor: "#111113",
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
  // Capacitor 8.4+ avoids the App Check Swift package identity collision.
  experimental: {
    ios: {
      spm: {
        packageOptions: { "@capacitor-firebase/app-check": { symlink: true } },
      },
    },
  },
  ios: {
    contentInset: "automatic",
    scheme: "Tropos",
  },
  android: {
    backgroundColor: "#111113",
  },
};

export default config;

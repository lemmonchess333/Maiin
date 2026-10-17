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
      // expect apps to feel instantly alive. The launch animation
      // (LaunchSplash, via src/lib/nativeLaunchImage.ts) hides it as
      // soon as the web layer is drawing the same frame, so its rise
      // starts in view; this timer is only the net for a web layer that
      // never mounts.
      launchShowDuration: 500,
      launchAutoHide: true,
      // The app's dark page background, not the brand purple. The splash
      // hands straight over to the first web frame, which paints
      // `--background` (public/init.js applies `.dark` before paint unless
      // the user explicitly chose light), so anything else is a flash.
      // Pinned against the token by coldStartChrome.test.ts.
      backgroundColor: "#0e0e11",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashImmersive: true,
    },
    StatusBar: {
      // Capacitor's Style.Dark means LIGHT text for a dark background.
      style: "DARK",
      backgroundColor: "#0e0e11",
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
  experimental: {
    ios: {
      spm: {
        // Package traits need Swift tools 6.1 (Xcode 16.3+); without this
        // the CLI refuses the traits below.
        swiftToolsVersion: "6.1",
        // Capacitor 8.4+ avoids the App Check Swift package identity
        // collision.
        packageOptions: { "@capacitor-firebase/app-check": { symlink: true } },
        // Nothing here tracks, so nothing links what tracking needs.
        // Analytics builds without Google's advertising-ID support, and
        // Authentication with the Google Sign-In SDK only: the Facebook SDK
        // it links by default is never used (providers above are Google and
        // Apple; Apple sign-in needs no third-party SDK). The App Tracking
        // Transparency calls the plugin compiles in either way are patched
        // out (patches/@capacitor-firebase+authentication+*.patch).
        packageTraits: {
          "@capacitor-firebase/analytics": ["AnalyticsWithoutAdIdSupport"],
          "@capacitor-firebase/authentication": ["Google"],
        },
      },
    },
  },
  ios: {
    contentInset: "automatic",
    scheme: "Tropos",
  },
  android: {
    backgroundColor: "#0e0e11",
  },
};

export default config;

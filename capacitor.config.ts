import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // WARNING: Changing appId requires updating APPLE_PRODUCT_IDS in
  // src/lib/purchaseProvider.ts and re-registering in App Store Connect.
  appId: "com.adaptivefit.app",
  appName: "Tropos",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#7C6EF6",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#7C6EF6",
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

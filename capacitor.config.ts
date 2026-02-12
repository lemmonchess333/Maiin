import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.adaptivefit.app",
  appName: "Adaptive Fitness",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#7c3aed",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#7c3aed",
    },
  },
  ios: {
    contentInset: "automatic",
    scheme: "Adaptive Fitness",
  },
  android: {
    backgroundColor: "#7c3aed",
  },
};

export default config;

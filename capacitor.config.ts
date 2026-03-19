import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.adaptivefit.app",
  appName: "Tropos",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#6358D4",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#6358D4",
    },
  },
  ios: {
    contentInset: "automatic",
    scheme: "Tropos",
  },
  android: {
    backgroundColor: "#6358D4",
  },
};

export default config;

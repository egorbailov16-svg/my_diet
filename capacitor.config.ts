import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.egorbailov.mydiet",
  appName: "My Diet",
  webDir: ".next",
  server: {
    androidScheme: "https",
  },
};

export default config;

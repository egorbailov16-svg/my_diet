import type { AppPlatformMode } from "@/lib/platform/types";
import { Capacitor } from "@capacitor/core";

export function getAppPlatformMode(): AppPlatformMode {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios") {
    return "ios-capacitor";
  }

  return "web";
}

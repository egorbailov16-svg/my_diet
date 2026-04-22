import { AppleHealthProvider } from "@/lib/health/apple-health-provider";
import type { HealthProvider } from "@/lib/health/provider";
import { UnavailableHealthProvider } from "@/lib/health/unavailable-provider";
import { getAppPlatformMode } from "@/lib/platform/runtime";

export function createHealthProvider(): HealthProvider {
  const mode = getAppPlatformMode();
  if (mode === "ios-capacitor") {
    return new AppleHealthProvider();
  }

  return new UnavailableHealthProvider();
}

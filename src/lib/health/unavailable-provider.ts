import type { HealthProvider } from "@/lib/health/provider";
import type { HealthPermissionsState, HealthSyncResult } from "@/lib/health/types";

export class UnavailableHealthProvider implements HealthProvider {
  id = "unavailable";

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async getPermissionsState(): Promise<HealthPermissionsState> {
    return "unavailable";
  }

  async requestPermissions(): Promise<HealthPermissionsState> {
    return "unavailable";
  }

  async getTodayActiveCalories(): Promise<HealthSyncResult> {
    throw new Error("Health provider unavailable");
  }
}

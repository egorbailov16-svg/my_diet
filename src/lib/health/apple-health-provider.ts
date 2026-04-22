import { AppleHealth } from "@/lib/health/apple-health-plugin";
import type { HealthProvider } from "@/lib/health/provider";
import type { HealthPermissionsState, HealthSyncResult } from "@/lib/health/types";

export class AppleHealthProvider implements HealthProvider {
  id = "apple-health";

  async isAvailable(): Promise<boolean> {
    try {
      const result = await AppleHealth.isAvailable();
      return result.available;
    } catch {
      return false;
    }
  }

  async getPermissionsState(): Promise<HealthPermissionsState> {
    try {
      const result = await AppleHealth.getPermissionsState();
      return result.state;
    } catch {
      return "unavailable";
    }
  }

  async requestPermissions(): Promise<HealthPermissionsState> {
    try {
      const result = await AppleHealth.requestPermissions();
      return result.state;
    } catch {
      return "unavailable";
    }
  }

  async getTodayActiveCalories(): Promise<HealthSyncResult> {
    const result = await AppleHealth.getTodayActiveCalories();
    return {
      activeKcal: Math.max(0, Math.round(result.activeKcal)),
      syncedAt: result.syncedAt,
      permissionsState: "granted",
    };
  }
}

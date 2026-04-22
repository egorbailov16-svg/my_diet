import type { HealthPermissionsState, HealthSyncResult } from "@/lib/health/types";

export interface HealthProvider {
  id: string;
  isAvailable(): Promise<boolean>;
  getPermissionsState(): Promise<HealthPermissionsState>;
  requestPermissions(): Promise<HealthPermissionsState>;
  getTodayActiveCalories(): Promise<HealthSyncResult>;
}

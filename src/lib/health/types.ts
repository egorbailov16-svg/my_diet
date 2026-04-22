export type HealthPermissionsState = "unknown" | "granted" | "denied" | "unavailable";
export type HealthSyncStatus = "idle" | "syncing" | "success" | "error" | "unavailable";

export type HealthSyncResult = {
  activeKcal: number;
  syncedAt: string;
  permissionsState: HealthPermissionsState;
};

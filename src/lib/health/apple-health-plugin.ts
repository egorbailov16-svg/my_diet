import { registerPlugin } from "@capacitor/core";

export type AppleHealthPlugin = {
  isAvailable(): Promise<{ available: boolean }>;
  getPermissionsState(): Promise<{ state: "unknown" | "granted" | "denied" | "unavailable" }>;
  requestPermissions(): Promise<{ state: "unknown" | "granted" | "denied" | "unavailable" }>;
  getTodayActiveCalories(): Promise<{ activeKcal: number; syncedAt: string }>;
};

export const AppleHealth = registerPlugin<AppleHealthPlugin>("AppleHealth");

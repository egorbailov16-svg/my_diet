"use client";

const ADMIN_UNLOCKED_KEY = "mydiet_admin_unlocked";

export function hashPin(pin: string): string {
  let hash = 0;
  for (let i = 0; i < pin.length; i += 1) {
    hash = (hash << 5) - hash + pin.charCodeAt(i);
    hash |= 0;
  }
  return `pin_${Math.abs(hash)}`;
}

export function isAdminUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ADMIN_UNLOCKED_KEY) === "1";
}

export function setAdminUnlocked(unlocked: boolean) {
  if (typeof window === "undefined") return;
  if (unlocked) {
    window.localStorage.setItem(ADMIN_UNLOCKED_KEY, "1");
  } else {
    window.localStorage.removeItem(ADMIN_UNLOCKED_KEY);
  }
}

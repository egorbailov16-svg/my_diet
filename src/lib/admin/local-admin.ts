"use client";

const ADMIN_UNLOCKED_KEY = "mydiet_admin_unlocked";
export const ADMIN_LOGIN = "admin";
export const ADMIN_PASSWORD = "admin";

export function validateAdminCredentials(login: string, password: string): boolean {
  return login === ADMIN_LOGIN && password === ADMIN_PASSWORD;
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

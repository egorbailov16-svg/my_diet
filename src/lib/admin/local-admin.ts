"use client";

import {
  ADMIN_ACCOUNT_LOGIN,
  ADMIN_ACCOUNT_PASSWORD,
  getActiveAccount,
  loginAccount,
  logoutAccount,
} from "@/lib/account/local-account";

export function validateAdminCredentials(login: string, password: string): boolean {
  return login.trim().toLowerCase() === ADMIN_ACCOUNT_LOGIN && password === ADMIN_ACCOUNT_PASSWORD;
}

export function isAdminUnlocked(): boolean {
  return getActiveAccount().isAdmin;
}

export function setAdminUnlocked(unlocked: boolean) {
  if (unlocked) {
    loginAccount(ADMIN_ACCOUNT_LOGIN, ADMIN_ACCOUNT_PASSWORD);
  } else {
    logoutAccount();
  }
}

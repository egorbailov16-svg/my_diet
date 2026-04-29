"use client";

import {
  ADMIN_ACCOUNT_LOGIN,
  getActiveAccount,
  logoutAccount,
  setActiveAccount,
} from "@/lib/account/local-account";

export function validateAdminCredentials(login: string, password: string): boolean {
  // Пароль администратора проверяется сервером в /api/account/login.
  // Здесь допускаем локальное включение режима только для уже активного admin-аккаунта.
  return login.trim().toLowerCase() === ADMIN_ACCOUNT_LOGIN && password.length > 0 && getActiveAccount().isAdmin;
}

export function isAdminUnlocked(): boolean {
  return getActiveAccount().isAdmin;
}

export function setAdminUnlocked(unlocked: boolean) {
  if (unlocked) {
    const account = getActiveAccount();
    if (account.username === ADMIN_ACCOUNT_LOGIN && account.isAdmin) {
      setActiveAccount(account);
    }
  } else {
    logoutAccount();
  }
}

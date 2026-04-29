"use client";

const ACTIVE_ACCOUNT_KEY = "mydiet_active_account_v1";

export const ADMIN_ACCOUNT_LOGIN = "admin";

export type ActiveAccount = {
  username: string;
  isAdmin: boolean;
};

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function getActiveAccount(): ActiveAccount {
  if (typeof window === "undefined") {
    return { username: "guest", isAdmin: false };
  }
  try {
    const raw = window.localStorage.getItem(ACTIVE_ACCOUNT_KEY);
    if (!raw) return { username: "guest", isAdmin: false };
    const parsed = JSON.parse(raw) as ActiveAccount;
    if (!parsed || typeof parsed.username !== "string") return { username: "guest", isAdmin: false };
    return {
      username: normalizeUsername(parsed.username) || "guest",
      isAdmin: Boolean(parsed.isAdmin),
    };
  } catch {
    return { username: "guest", isAdmin: false };
  }
}

export function getActiveAccountId(): string {
  return getActiveAccount().username;
}

export function setActiveAccount(account: ActiveAccount): ActiveAccount {
  const next: ActiveAccount = {
    username: normalizeUsername(account.username) || "guest",
    isAdmin: Boolean(account.isAdmin),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACTIVE_ACCOUNT_KEY, JSON.stringify(next));
  }
  return next;
}

export function logoutAccount() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
}


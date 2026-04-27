"use client";

const ACTIVE_ACCOUNT_KEY = "mydiet_active_account_v1";

export const ADMIN_ACCOUNT_LOGIN = "admin";
export const ADMIN_ACCOUNT_PASSWORD = "admin";

export const MANUAL_ACCOUNTS: ReadonlyArray<{
  username: string;
  password: string;
  isAdmin?: boolean;
}> = [
  { username: ADMIN_ACCOUNT_LOGIN, password: ADMIN_ACCOUNT_PASSWORD, isAdmin: true },
  // Add new users here manually:
  // { username: "anna", password: "anna123" },
];

export type ActiveAccount = {
  username: string;
  isAdmin: boolean;
};

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validateAccountCredentials(username: string, password: string): boolean {
  const normalized = normalizeUsername(username);
  if (!normalized || !password) return false;
  return MANUAL_ACCOUNTS.some((account) => normalizeUsername(account.username) === normalized && account.password === password);
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

export function loginAccount(username: string, password: string): ActiveAccount | null {
  const normalized = normalizeUsername(username);
  if (!normalized || !password) return null;
  const found = MANUAL_ACCOUNTS.find((account) => normalizeUsername(account.username) === normalized && account.password === password);
  if (!found) {
    return null;
  }
  const next: ActiveAccount = { username: normalized, isAdmin: Boolean(found.isAdmin) };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACTIVE_ACCOUNT_KEY, JSON.stringify(next));
  }
  return next;
}

export function logoutAccount() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
}


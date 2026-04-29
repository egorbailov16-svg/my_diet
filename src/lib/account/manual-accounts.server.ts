type ServerAccount = {
  username: string;
  password: string;
  isAdmin?: boolean;
};

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export const SERVER_MANUAL_ACCOUNTS: ReadonlyArray<ServerAccount> = [
  { username: "admin", password: "admin", isAdmin: true },
  { username: "Polina", password: "polya07" },
  { username: "George", password: "afentus1337" },
  { username: "George'sWife", password: "wife1337" },
  { username: "Nina", password: "nina1607" },
];

export function validateServerAccountCredentials(username: string, password: string): { username: string; isAdmin: boolean } | null {
  const normalized = normalizeUsername(username);
  if (!normalized || !password) return null;
  const found = SERVER_MANUAL_ACCOUNTS.find(
    (account) => normalizeUsername(account.username) === normalized && account.password === password,
  );
  if (!found) return null;
  return { username: normalizeUsername(found.username), isAdmin: Boolean(found.isAdmin) };
}

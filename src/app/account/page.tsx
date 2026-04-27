"use client";

import { forceSync } from "@/lib/data/cloud-sync";
import { getActiveAccount, loginAccount, logoutAccount, type ActiveAccount } from "@/lib/account/local-account";
import { useEffect, useState } from "react";

export default function AccountPage() {
  const [account, setAccount] = useState<ActiveAccount>({ username: "guest", isAdmin: false });
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    setAccount(getActiveAccount());
  }, []);

  async function refreshAfterAccountChange(next: ActiveAccount) {
    setAccount(next);
    setIsSyncing(true);
    try {
      await forceSync();
      setMessage(`Вход выполнен: ${next.username}${next.isAdmin ? " (админ)" : ""}`);
    } catch {
      setMessage("Вход выполнен, но синхронизация сейчас недоступна.");
    } finally {
      setIsSyncing(false);
      setTimeout(() => window.location.assign("/"), 200);
    }
  }

  async function onLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = loginAccount(login, password);
    if (!next) {
      setMessage("Неверные данные. Аккаунт должен быть заранее добавлен в MANUAL_ACCOUNTS.");
      return;
    }
    await refreshAfterAccountChange(next);
  }

  async function onLogout() {
    logoutAccount();
    await refreshAfterAccountChange({ username: "guest", isAdmin: false });
  }

  return (
    <section className="space-y-4 pb-2 text-neutral-100">
      <header className="space-y-2">
        <p className="screen-subtitle">Пользователь</p>
        <h1 className="screen-title">Аккаунт</h1>
      </header>

      <div className="app-card space-y-2 p-4">
        <p className="text-xs uppercase tracking-wide text-[#9db0c8]">Текущий аккаунт</p>
        <p className="text-sm text-[#e5edf8]">
          {account.username} {account.isAdmin ? "· администратор" : ""}
        </p>
        <p className="text-xs text-[#9db0c8]">
          Общие данные (продукты и блюда) обновляет только админ-аккаунт. Остальные данные у каждого аккаунта свои.
        </p>
        <p className="text-xs text-[#9db0c8]">
          Новые пользователи добавляются вручную в <code>src/lib/account/local-account.ts</code> в массиве <code>MANUAL_ACCOUNTS</code>.
        </p>
      </div>

      <form onSubmit={onLogin} className="app-card space-y-3 p-4">
        <p className="text-xs uppercase tracking-wide text-[#9db0c8]">Вход</p>
        <input
          type="text"
          value={login}
          onChange={(event) => setLogin(event.target.value)}
          placeholder="Логин"
          className="h-12 w-full rounded-2xl px-3 text-base outline-none"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Пароль"
          className="h-12 w-full rounded-2xl px-3 text-base outline-none"
          required
        />
        <button type="submit" disabled={isSyncing} className="h-12 w-full rounded-2xl accent-btn text-sm font-semibold disabled:opacity-50">
          {isSyncing ? "Синхронизирую..." : "Войти"}
        </button>
        <button type="button" onClick={onLogout} disabled={isSyncing} className="h-11 w-full rounded-2xl secondary-btn text-sm font-semibold disabled:opacity-50">
          Выйти
        </button>
        {message ? <p className="text-xs text-[#9db0c8]">{message}</p> : null}
      </form>
    </section>
  );
}


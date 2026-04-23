"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Сегодня" },
  { href: "/progress", label: "Отчет" },
  { href: "/recipes", label: "Добавить блюдо" },
  { href: "/foods", label: "Продукты" },
  { href: "/add-entry", label: "Добавить прием" },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 bg-transparent pb-2">
      <ul className="mx-auto flex max-w-[430px] gap-2 rounded-[26px] border border-[rgba(255,255,255,0.08)] bg-[#0a111be6] px-3 py-2 shadow-[0_10px_32px_rgba(0,0,0,0.45)] backdrop-blur">
        {navItems.map((item, index) => {
          const isActive = pathname === item.href;
          const isPrimaryCenter = index === 2;

          return (
            <li key={item.href} className={`flex-1 ${isPrimaryCenter ? "mt-[-18px]" : ""}`}>
              <Link
                href={item.href}
                className={[
                  "block h-11 rounded-2xl px-2 py-2 text-center text-[11px] font-semibold transition-all",
                  isPrimaryCenter ? "h-[54px] rounded-full pt-4" : "",
                  isActive
                    ? "accent-btn shadow-[0_0_20px_rgba(143,246,91,0.35)]"
                    : "bg-[#0d1520] text-[#9db0c8] hover:bg-[#121d2b]",
                ].join(" ")}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

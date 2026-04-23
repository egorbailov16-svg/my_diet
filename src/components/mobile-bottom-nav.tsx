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
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#1f2a3a] bg-[#05070be6] backdrop-blur">
      <ul className="mx-auto flex max-w-md snap-x gap-2 overflow-x-auto px-3 py-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;

          return (
            <li key={item.href} className="min-w-[88px] flex-1 snap-start">
              <Link
                href={item.href}
                className={[
                  "block h-11 rounded-lg px-2 py-2 text-center text-xs font-semibold transition-colors",
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

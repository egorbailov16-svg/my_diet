"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Сегодня" },
  { href: "/add-entry", label: "Добавить" },
  { href: "/foods", label: "Продукты" },
  { href: "/recipes", label: "Рецепты" },
  { href: "/progress", label: "Прогресс" },
  { href: "/settings", label: "Настройки" },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white/95 backdrop-blur">
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
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
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

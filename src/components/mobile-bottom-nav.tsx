"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartNoAxesColumn, Home, Plus, Salad, UtensilsCrossed } from "lucide-react";

const navItems = [
  { href: "/", label: "Сегодня", icon: Home },
  { href: "/progress", label: "Отчет", icon: ChartNoAxesColumn },
  { href: "/add-entry", label: "Добавить", icon: Plus, center: true },
  { href: "/foods", label: "Продукты", icon: Salad },
  { href: "/recipes", label: "Блюда", icon: UtensilsCrossed },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 bg-transparent px-3 pb-2">
      <ul className="mx-auto flex max-w-[430px] gap-1 rounded-[30px] border border-[rgba(255,255,255,0.12)] bg-[rgba(10,16,24,0.8)] px-2 py-2 shadow-[0_20px_42px_rgba(0,0,0,0.55)] backdrop-blur-xl">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          const isPrimaryCenter = item.center === true;

          return (
            <li key={item.href} className={`flex-1 ${isPrimaryCenter ? "mt-[-18px]" : ""}`}>
              <Link
                href={item.href}
                className={[
                  "group flex h-14 flex-col items-center justify-center rounded-2xl px-1 text-center text-[10px] font-semibold transition-all duration-200",
                  isPrimaryCenter ? "mx-auto h-[58px] w-[58px] rounded-full p-0" : "",
                  isActive
                    ? isPrimaryCenter
                      ? "accent-btn scale-[1.02] shadow-[0_0_0_1px_rgba(132,225,75,0.28),0_0_26px_rgba(132,225,75,0.45)]"
                      : "bg-[rgba(132,225,75,0.12)] text-[#8fff70]"
                    : isPrimaryCenter
                      ? "bg-[linear-gradient(180deg,#95f05f,#84e14b)] text-[#0a1208] shadow-[0_0_0_1px_rgba(132,225,75,0.32),0_0_24px_rgba(132,225,75,0.38)] hover:scale-[1.02]"
                      : "text-[#8d96a5] hover:bg-[#121a26]",
                ].join(" ")}
                aria-label={item.label}
              >
                <Icon size={isPrimaryCenter ? 22 : 19} strokeWidth={2.2} />
                {!isPrimaryCenter ? <span className="mt-1">{item.label}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

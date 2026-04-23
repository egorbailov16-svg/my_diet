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
    <nav className="fixed inset-x-0 bottom-0 z-50 bg-transparent px-3 pb-2.5">
      <ul className="mx-auto flex max-w-[430px] gap-0.5 rounded-[30px] border border-[rgba(255,255,255,0.11)] bg-[rgba(9,14,22,0.58)] px-2.5 py-2 shadow-[0_18px_40px_rgba(0,0,0,0.5)] backdrop-blur-[20px]">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          const isPrimaryCenter = item.center === true;

          return (
            <li key={item.href} className={`flex-1 ${isPrimaryCenter ? "mt-[-14px]" : ""}`}>
              <Link
                href={item.href}
                className={[
                  "group flex h-12 flex-col items-center justify-center rounded-2xl px-1 text-center text-[10px] font-semibold transition-all duration-200",
                  isPrimaryCenter ? "mx-auto h-[58px] w-[58px] rounded-full p-0" : "",
                  isActive
                    ? isPrimaryCenter
                      ? "accent-btn scale-[1.02] shadow-[0_0_0_1px_rgba(132,225,75,0.26),0_0_22px_rgba(132,225,75,0.36)]"
                      : "bg-[rgba(132,225,75,0.1)] text-[#8fff70]"
                    : isPrimaryCenter
                      ? "bg-[linear-gradient(180deg,#a5f66f,#89e751)] text-[#0a1208] shadow-[0_0_0_1px_rgba(132,225,75,0.28),0_0_22px_rgba(132,225,75,0.36)] hover:scale-[1.02]"
                      : "text-[#8d96a5] hover:bg-[#111a26]",
                ].join(" ")}
                aria-label={item.label}
              >
                <Icon size={isPrimaryCenter ? 21 : 18} strokeWidth={2.1} />
                {!isPrimaryCenter ? <span className="mt-0.5">{item.label}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

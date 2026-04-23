import type { Metadata, Viewport } from "next";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { SeedBootstrap } from "@/components/seed-bootstrap";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "My Diet",
  description: "Персональный трекер калорий и БЖУ",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "My Diet",
  },
};

export const viewport: Viewport = {
  themeColor: "#05070b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#05070b] text-neutral-100">
        <SeedBootstrap />
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-[#05070b]">
          <main className="flex-1 px-4 pb-28 pt-3">{children}</main>
          <MobileBottomNav />
        </div>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { AppTheme } from "@/components/theme-controls";
import "./globals.css";
import "./football-fonts.css";
import "./football.css";
import "../components/console.css";
import "./workspace.css";
import "./nusantara.css";

export const metadata: Metadata = {
  title: "Loka Portrait — Prospera Nusantara",
  description: "Abadikan momenmu dalam potret Nusantara bersama Taka Loka Initiative.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="antialiased"><AppTheme><AppShell>{children}</AppShell></AppTheme></body>
    </html>
  );
}

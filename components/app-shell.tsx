"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Monitor } from "lucide-react";
import { Brand } from "./brand";
import Link from "./document-link";
import { Button } from "./ui/button";
import { ThemeControls } from "./theme-controls";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/layar") return children;
  const operator = pathname === "/operator";

  return <div className="app-shell">
    <div className="app-workspace">
      <header className="app-topbar">
        <Brand />
        <div className="app-header-actions"><ThemeControls />{operator && <><Button asChild variant="outline" className="shell-screen-link"><Link href="/layar" target="_blank" rel="noopener noreferrer" aria-label="Buka layar acara (tab baru)"><Monitor aria-hidden="true" /><span>Layar acara</span><ArrowUpRight aria-hidden="true" /></Link></Button><div id="operator-account-menu" /></>}</div>
      </header>
      {children}
    </div>
  </div>;
}

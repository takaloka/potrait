"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "./ui/button";

export function AppTheme({ children }: { children: ReactNode }) {
  return <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>{children}</ThemeProvider>;
}

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function ThemeControls() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  useEffect(() => {
    if (theme === "system") setTheme("light");
  }, [theme, setTheme]);
  return <div className="theme-controls" role="group" aria-label="Tema tampilan">
    {([{ value: "light", label: "Tema terang", Icon: Sun }, { value: "dark", label: "Tema gelap", Icon: Moon }] as const).map(({ value, label, Icon }) =>
      <Button key={value} variant="ghost" size="icon" title={label} aria-label={label} aria-pressed={mounted && theme === value} onClick={() => setTheme(value)}><Icon size={17} aria-hidden="true" /></Button>
    )}
  </div>;
}

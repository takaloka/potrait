"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LogOut, UserRound } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { apiJson } from "@/lib/photobooth-client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";

type Access = { authenticated: boolean; configured: boolean; setupAllowed: boolean };
export default function OperatorAccess({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<Access | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    apiJson<Access>("/api/operator/session", { signal: controller.signal }).then(setAccess).catch(reason => {
      if (!controller.signal.aborted) setError(reason.message);
    });
    return () => controller.abort();
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setError("");
    try {
      await apiJson("/api/operator/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: access?.configured ? "login" : "setup", password: new FormData(form).get("password") }) });
      form.reset();
      setAccess({ authenticated: true, configured: true, setupAllowed: false });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Login belum berhasil."); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError("");
    try { await apiJson("/api/operator/session", { method: "DELETE" }); setAccess({ authenticated: false, configured: true, setupAllowed: false }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Belum bisa keluar."); }
    finally { setBusy(false); }
  }
  if (access?.authenticated) return <>
    {document.getElementById("operator-account-menu") && createPortal(
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="operator-avatar" aria-label="Menu akun operator"><UserRound aria-hidden="true" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="operator-account-dropdown">
          <DropdownMenuItem disabled={busy} onSelect={event => { event.preventDefault(); void logout(); }}><LogOut aria-hidden="true" />{busy ? "Keluar…" : "Keluar"}</DropdownMenuItem>
          {error && <p className="form-error" role="alert">{error}</p>}
        </DropdownMenuContent>
      </DropdownMenu>, document.getElementById("operator-account-menu")!)}
    {children}
  </>;
  return <main className="result-main"><Card className="result-loading">
    <h1>{!access ? "Memeriksa akses…" : access.configured ? "Masuk sebagai operator" : "Siapkan akun operator"}</h1>
    <p>{!access ? "" : access.configured ? "" : access.setupAllowed ? "Gunakan kata sandi minimal 12 karakter." : "Akun belum disiapkan. Lakukan penyiapan melalui server lokal."}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!access && error && <Button onClick={() => window.location.reload()}>Coba lagi</Button>}
    {(access?.configured || access?.setupAllowed) && <form className="operator-login" onSubmit={login}>
      <label htmlFor="operator-password">Kata sandi</label>
      <Input id="operator-password" name="password" type="password" autoComplete={access.configured ? "current-password" : "new-password"} minLength={12} maxLength={128} required disabled={busy} />
      <Button type="submit" disabled={busy}>{busy ? "Memproses…" : access.configured ? "Masuk" : "Buat akun operator"}</Button>
    </form>}
  </Card></main>;
}

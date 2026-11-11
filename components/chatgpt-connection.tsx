"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Connection = { connected: boolean; method: string; sharing: boolean; model: string | null; verified: boolean; imageUnsupported?: boolean; pending: { url: string; userCode: string; expiresAt: number; pollAfter: number } | null };
async function request(action?: string) {
  const response = await fetch("/api/operator/chatgpt", action ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) } : { cache: "no-store" });
  const body = await response.json() as Connection & { error?: string };
  if (!response.ok) throw new Error(body.error || "Koneksi ChatGPT belum tersedia.");
  return body;
}

export function ChatgptConnectionControl() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    request().then(value => {
      if (!mounted) return;
      setConnection(value);
      const params = new URLSearchParams(location.search);
      const callback = params.get("chatgpt");
      if (callback === "failed") setError(params.get("reason")?.slice(0, 300) || "Login ChatGPT belum berhasil. Coba hubungkan ulang.");
      if (callback === "check-needed") setError("Login selesai. Tekan Periksa akses untuk memeriksa model gambar.");
      if (callback) history.replaceState(null, "", location.pathname);
    }).catch(reason => { if (mounted) setError(reason.message); });
    return () => { mounted = false; };
  }, []);

  const pending = connection?.pending;
  useEffect(() => {
    if (!pending || busy) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        if (pending.expiresAt <= Date.now()) throw new Error("Kode login kedaluwarsa. Tekan Hubungkan Codex untuk kode baru.");
        const value = await request("poll");
        if (active) setConnection(value);
      } catch (reason) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Pemeriksaan login gagal. Hubungkan ulang.");
        setConnection(value => value ? { ...value, pending: null } : value);
      }
    }, Math.min(Math.max(1000, pending.pollAfter), Math.max(0, pending.expiresAt - Date.now())));
    return () => { active = false; clearTimeout(timer); };
  }, [pending, busy]);

  async function act(action: string) {
    setBusy(action); setError("");
    try {
      const value = await request(action);
      setConnection(value);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Koneksi belum berhasil."); }
    finally { setBusy(""); }
  }

  const status = !connection ? "Memuat koneksi…" : pending ? "Menunggu login Codex…" : !connection.connected ? "Belum terhubung" : connection.method !== "codex" ? "Koneksi lama. Hubungkan Codex untuk membuat potret." : connection.imageUnsupported ? "Akses gambar ditolak oleh layanan. Periksa akun Codex." : connection.verified ? `${connection.model} · Generasi gambar berhasil digunakan` : `${connection.model} · Terhubung, generasi belum diuji`;
  return <Card className="chatgpt-control" aria-label="Koneksi ChatGPT">
    <div className="chatgpt-control-row">
       <div><strong>ChatGPT · Codex</strong><p role="status">{status}</p></div>
      <div className="chatgpt-actions">
        {connection?.connected && !pending && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => void act("check")}>{busy === "check" ? "Memeriksa…" : "Periksa sesi"}</Button>}
        <Button variant="outline" size="sm" disabled={!!busy || !!pending} onClick={() => void act("connect")}>{busy === "connect" ? "Meminta kode…" : "Hubungkan Codex"}</Button>
        {pending && <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void act("cancel")}>Batalkan login</Button>}
        {connection?.connected && <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void act("disconnect")}>{busy === "disconnect" ? "Memutus…" : "Putuskan"}</Button>}
      </div>
    </div>
    {pending && <div className="codex-device-login">
      <p>Masukkan kode ini di halaman login Codex:</p>
      <strong className="codex-device-code" aria-label={`Kode login: ${pending.userCode}`}>{pending.userCode}</strong>
      <a href="https://auth.openai.com/codex/device" target="_blank" rel="noopener noreferrer">Buka login Codex ↗</a>
      <p role="status">Setelah login selesai, koneksi diperbarui otomatis.</p>
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </Card>;
}

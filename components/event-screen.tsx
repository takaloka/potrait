"use client";

import { useEffect, useRef, useState } from "react";
import { Expand, LoaderCircle, Pause, Play, RefreshCw, Shrink } from "lucide-react";
import type { Job, StateResponse } from "@/lib/photobooth-types";
import { JoinQr } from "./join-qr";
import { ScreenArtwork } from "./screen-artwork";

type ScreenAction = "heartbeat" | "claim" | "complete" | "release";
type ScreenResponse = StateResponse & { nextJobId?: string | null; queueCounts: { ready: number; processing: number } };

class ScreenError extends Error {
  code?: string;
  constructor(message: string, code?: string) { super(message); this.code = code; }
}

async function action(sessionId: string, command: ScreenAction, jobId?: string): Promise<ScreenResponse> {
  const response = await fetch("/api/screen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, action: command, ...(jobId ? { jobId } : {}) }), cache: "no-store" });
  const body = await response.json().catch(() => ({})) as { error?: string; code?: string };
  if (!response.ok) throw new ScreenError(response.status === 401 ? "Masuk sebagai operator di perangkat layar ini untuk mengaktifkan tayangan." : body.error || "Koneksi layar terputus. Menyambungkan kembali…", body.code);
  return body as ScreenResponse;
}

function portraitUrl(job: Job) {
  return job.resultUrl || job.originalUrl;
}

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => { image.onload = null; image.onerror = null; reject(new Error("Gambar belum selesai dimuat.")); }, 6500);
    image.onload = () => { clearTimeout(timer); resolve(); };
    image.onerror = () => { clearTimeout(timer); reject(new Error("Gambar belum dapat dimuat.")); };
    image.src = url;
  });
}

function getSessionId() {
  try {
    const stored = sessionStorage.getItem("loka-screen-session");
    if (stored) return stored;
    const id = crypto.randomUUID();
    sessionStorage.setItem("loka-screen-session", id);
    return id;
  } catch { return crypto.randomUUID(); }
}

export default function EventScreen() {
  const [data, setData] = useState<ScreenResponse | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState("");
  const [foreignLease, setForeignLease] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const [artworkRetry, setArtworkRetry] = useState(0);
  const [artworkError, setArtworkError] = useState("");
  const [viewportRatio, setViewportRatio] = useState(16 / 9);
  const stageRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<() => void>(() => {});
  const serverClock = useRef({ server: 0, monotonic: 0 });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0) setViewportRatio(entry.contentRect.width / entry.contentRect.height);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/`);
    const sessionId = getSessionId();
    const loaded = new Set<string>();
    const loading = new Set<string>();
    let stopped = false;
    let ownsLease = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout>;

    function acceptState(next: ScreenResponse) {
      setJoinUrl(`${window.location.origin}/`);
      serverClock.current = { server: next.serverNow, monotonic: performance.now() };
      setData(next);
    }

    function serverTime() {
      return serverClock.current.server + performance.now() - serverClock.current.monotonic;
    }

    const release = () => {
      if (ownsLease) navigator.sendBeacon("/api/screen", new Blob([JSON.stringify({ sessionId, action: "release" })], { type: "application/json" }));
    };
    window.addEventListener("pagehide", release);

    async function cycle() {
      if (running || stopped) return;
      running = true;
      try {
        let next = await action(sessionId, "heartbeat");
        if (stopped) return;
        ownsLease = next.screen.sessionId === sessionId;
        setForeignLease(false);
        setError("");
        acceptState(next);

        const mayReplace = !next.screen.currentJobId || (next.screen.endsAt !== null && serverTime() >= next.screen.endsAt);
        if (!next.settings.paused) {
          const candidate = next.jobs.find(job => job.id === next.nextJobId);
          if (candidate) {
            const url = portraitUrl(candidate);
            if (loaded.has(url) && mayReplace) {
              // Claim atomically finishes the previous portrait and starts the
              // next one only after its image is available in this browser.
              next = await action(sessionId, "claim", candidate.id);
              if (stopped) return;
              acceptState(next);
              setImageError("");
            } else if (!loaded.has(url) && !loading.has(url)) {
              // Loading does not block heartbeats or remove the current portrait.
              loading.add(url);
              void preloadImage(url).then(() => {
                loaded.add(url);
                if (!stopped) setImageError("");
              }).catch(() => {
                if (!stopped) setImageError("Potret berikutnya belum termuat. Potret ini tetap tampil sementara kami mencoba lagi.");
              }).finally(() => loading.delete(url));
            }
          }
        }
      } catch (reason) {
        if (stopped) return;
        if (reason instanceof ScreenError && reason.code === "SCREEN_BUSY") {
          ownsLease = false;
          setForeignLease(true);
          setError("");
          setImageError("");
        } else {
          setError(reason instanceof Error ? reason.message : "Koneksi layar terputus. Menyambungkan kembali…");
        }
        // Public presentation remains readable even when this device cannot
        // control the lease (including an expired operator session).
        try {
          const response = await fetch("/api/screen", { cache: "no-store" });
          if (response.ok && !stopped) acceptState(await response.json() as ScreenResponse);
        } catch { /* Keep the last successfully loaded presentation. */ }
      } finally {
        running = false;
        if (!stopped) timer = setTimeout(cycle, 1000);
      }
    }
    retryRef.current = () => { clearTimeout(timer); void cycle(); };
    void cycle();
    return () => { stopped = true; clearTimeout(timer); retryRef.current = () => {}; window.removeEventListener("pagehide", release); release(); };
  }, []);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await pageRef.current?.requestFullscreen();
    } catch { setError("Layar penuh belum didukung di jendela ini. Gunakan mode layar penuh browser."); }
  }

  const active = data?.screen.currentJobId ? data.jobs.find(job => job.id === data.screen.currentJobId && job.status === "displaying") : undefined;
  const lastShown = data?.jobs.filter(job => job.status === "done" && job.displayedAt && job.resultUrl).sort((a, b) => (b.displayedAt ?? 0) - (a.displayedAt ?? 0))[0];
  const portrait = active || lastShown;
  const name = portrait?.name || "Giliranmu berikutnya";
  const image = portrait ? portraitUrl(portrait) : "";
  const queuedCount = data?.queueCounts.ready ?? 0;
  const processingCount = data?.queueCounts.processing ?? 0;
  const connectionMessage = data?.settings.paused ? "Pergantian potret dijeda" : queuedCount ? `${queuedCount} potret siap tayang` : processingCount ? "Potret berikutnya sedang diproses" : "Pindai QR untuk ikut";

  return (
    <div ref={pageRef} className="screen-viewport" data-rotation={data?.settings.screenRotation ?? 0}>
    <main className={`nusantara-screen ${!portrait ? "is-empty" : ""} ${motionPaused ? "is-motion-paused" : ""}`}>
      <h1 className="sr-only">Prospera Nusantara — layar acara</h1>
      <div className="nusantara-stage" ref={stageRef}>
        {portrait && <ScreenArtwork name={name} image={image} theme={portrait.posterTheme} viewportRatio={viewportRatio} retry={artworkRetry} onError={setArtworkError} />}
        <header className="nusantara-screen-header"><span>Loka Portrait</span><div className="nusantara-screen-controls"><button type="button" aria-label={motionPaused ? "Aktifkan animasi" : "Jeda animasi"} aria-pressed={motionPaused} onClick={() => setMotionPaused(value => !value)}>{motionPaused ? <Play size={18} /> : <Pause size={18} />}</button><button type="button" aria-label={fullscreen ? "Keluar dari layar penuh" : "Tampilkan layar penuh"} onClick={() => void toggleFullscreen()}>{fullscreen ? <Shrink size={18} /> : <Expand size={18} />}</button></div></header>
        <aside className="nusantara-join" aria-label="Pindai QR untuk ikut membuat potret">
          <span className="nusantara-join-eyebrow">ABADIKAN MOMENMU</span><h2>Jadi bagian<br />ceritanya.</h2>
          <div className="nusantara-qr">{joinUrl ? <JoinQr url={joinUrl} size={240} /> : <LoaderCircle className="spin" aria-label="Menyiapkan QR" />}</div>
          <p>Pindai QR, lalu unggah fotomu.</p><span className="nusantara-status" role="status">{!data ? "Menghubungkan layar…" : connectionMessage}</span>
        </aside>
        <footer className="nusantara-screen-footer">TAKALOKA INITIATIVE</footer>
      </div>

      {data?.settings.paused && !foreignLease && <div className="screen-paused" role="status"><Pause size={15} /> Pergantian potret dijeda operator</div>}
      {(error || imageError || artworkError) && <div className="screen-error" role="alert"><span>{error || imageError || artworkError}</span><a href="/operator">Login operator</a><button type="button" onClick={() => { setArtworkRetry(value => value + 1); retryRef.current(); }}><RefreshCw size={14} />Sambungkan ulang</button></div>}
    </main>
    </div>
  );
}

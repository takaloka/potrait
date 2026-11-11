"use client";

import { useEffect, useRef, useState } from "react";
import Link from "./document-link";
import { ArrowRight, Check, CircleAlert, Copy, Download, ImageOff, LoaderCircle, RefreshCw, WifiOff, Radio } from "lucide-react";
import { FootballPoster } from "./football-poster";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError, apiJson } from "@/lib/photobooth-client";
import { downloadPoster } from "@/lib/poster-download";
import { posterTheme } from "@/lib/poster-themes";
import type { Job, PosterTheme } from "@/lib/photobooth-types";

type JobResult = { job: Job; position: number | null; screenConnected: boolean; mode: "demo" | "live" };
const headings: Record<Job["status"], string> = {
  queued: "Dalam antrean", processing: "Memproses foto", ready: "Menunggu tayang",
  displaying: "Sedang ditayangkan", done: "Menunggu giliran berikutnya", failed: "Pemrosesan gagal", skipped: "Penayangan dilewati",
};

export default function ParticipantResult({ id, initialTheme = null }: { id: string; initialTheme?: PosterTheme | null }) {
  const [data, setData] = useState<JobResult | null>(null);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState(false);
  const [revision, setRevision] = useState(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  useEffect(() => {
    const controller = new AbortController();
    // Capability stays in the URL fragment, never HTTP URLs, Referer or logs.
    const access = new URLSearchParams(window.location.hash.slice(1)).get("access") ?? "";
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      let delay = 2000;
      try {
        const next = await apiJson<JobResult>(`/api/jobs/${encodeURIComponent(id)}`, { headers: access ? { "X-Photo-Token": access } : {}, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
        if (controller.signal.aborted) return;
        setData(next);
        setUnavailable(false);
        setError("");
        if (["skipped", "failed"].includes(next.job.status)) delay = 10000;
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Status belum dapat diperbarui.");
        if (reason instanceof ApiError && [400, 401, 403, 404].includes(reason.status)) {
          setData(null);
          setUnavailable(true);
          return;
        }
        delay = 5000;
      }
      if (!controller.signal.aborted) timer = setTimeout(load, delay);
    }

    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [id, revision]);

  const job = data?.job;
  const processing = job?.status === "queued" || job?.status === "processing";
  const waiting = job?.status === "ready";
  const screenOffline = waiting && !data?.screenConnected;
  const animating = !error && (processing || (waiting && !screenOffline));

  async function download() {
    if (!job || busy) return;
    setBusy("download");
    setActionError("");
    try { await downloadPoster(job); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : "Unduhan belum berhasil."); }
    finally { setBusy(""); }
  }

  async function copy() {
    setActionError("");
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch { setActionError("Salin alamat halaman ini dari kolom alamat browser untuk menyimpan tautan hasil."); }
  }

  return <>
    <a className="skip-link" href="#hasil-potret">Langsung ke hasil potret</a>
    <main className="result-main result-workspace" id="hasil-potret" tabIndex={-1}>
      {!job && !unavailable ? <div className="result-grid">
        <section className="studio-intro" aria-label="Hasil foto">
          <header className="studio-panel-heading"><h1>Hasil foto</h1></header>
          <div className="studio-preview"><div className="studio-artwork">{initialTheme ? <FootballPoster name="" image="" theme={initialTheme} loading reveal /> : <div className="result-theme-placeholder" aria-label="Memuat tema potret"><LoaderCircle className="spin" aria-hidden="true" /></div>}</div></div>
          <div className="studio-panel-footer"><span>{initialTheme ? posterTheme(initialTheme).name : "Memuat tema"}</span><span>Menyiapkan potret</span></div>
        </section>
        <section className="result-copy" aria-label="Status dan tindakan potret"><Card className="result-detail">
          <header className="studio-panel-heading"><h2>Status foto</h2></header>
          <div className="result-controls"><div className="result-status" aria-live="polite" aria-atomic="true">
            <div className="result-status-heading">{error ? <WifiOff aria-hidden="true" /> : <LoaderCircle className="spin" aria-hidden="true" />}<strong>Memproses foto</strong></div>
            {!error && <div className="result-activity" aria-hidden="true"><span /></div>}
            <p>Hasil diperbarui otomatis.</p>
          </div>
          {error && <p className="connection-note" role="status">Status belum dapat diperbarui. Menghubungkan kembali otomatis.</p>}
          {actionError && <p className="form-error" role="alert">{actionError}</p>}
          <div className="result-actions">
            <Button variant="outline" onClick={copy}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "Tautan tersalin" : "Salin tautan"}</Button>
            <span className="sr-only" role="status">{copied ? "Tautan hasil berhasil disalin." : ""}</span>
            <Button variant="ghost" asChild><Link href="/">Unggah foto lain<ArrowRight aria-hidden="true" /></Link></Button>
          </div>
          </div>
        </Card></section>
      </div> : !job ? (
        <Card className="result-loading" role={error ? "alert" : "status"}>
          {unavailable ? <ImageOff size={30} aria-hidden="true" /> : error ? <CircleAlert size={30} aria-hidden="true" /> : <LoaderCircle className="spin" size={30} aria-hidden="true" />}
          <h1>{unavailable ? "Foto tidak dapat diakses" : error ? "Tidak dapat terhubung" : "Memuat hasil…"}</h1>
          {(unavailable || error) && <p>{error || "Gunakan tautan hasil lengkap, atau hubungi operator."}</p>}
          {unavailable ? <Button asChild><Link href="/">Unggah foto<ArrowRight aria-hidden="true" /></Link></Button> : error ? <Button onClick={() => { setError(""); setRevision(value => value + 1); }}><RefreshCw aria-hidden="true" />Coba lagi</Button> : null}
        </Card>
      ) : <>
        <div className="result-grid">
          <section className="studio-intro" aria-label="Hasil foto">
            <header className="studio-panel-heading"><h1>Hasil foto</h1><span>{job.name}</span></header>
            <div className="studio-preview"><div className="studio-artwork"><FootballPoster name={job.name} image={job.resultUrl || ""} theme={job.posterTheme} loading={!job.resultUrl} reveal sample={job.isSample} note="" /></div></div>
            <div className="studio-panel-footer"><span>{posterTheme(job.posterTheme).name}</span><span>{job.resultUrl ? "Poster" : job.status === "failed" ? "Potret belum tersedia" : "Menyiapkan potret"}</span></div>
          </section>
          <section className="result-copy" aria-label="Status dan tindakan potret">
            <Card className="result-detail">
              <header className="studio-panel-heading"><h2>Status foto</h2></header>
              <div className="result-controls">
              <div className="result-status" aria-live="polite" aria-atomic="true">
                <div className="result-status-heading">
                  {error ? <WifiOff aria-hidden="true" /> : animating ? <LoaderCircle className="spin" aria-hidden="true" /> : screenOffline ? <WifiOff aria-hidden="true" /> : job.status === "displaying" ? <Radio className="status-live" aria-hidden="true" /> : job.status === "failed" ? <CircleAlert aria-hidden="true" /> : <Check aria-hidden="true" />}
                  <strong>{screenOffline ? "Foto siap" : headings[job.status]}</strong>
                </div>
                {animating && <div className="result-activity" aria-hidden="true"><span /></div>}
                {processing && <p>Hasil diperbarui otomatis.</p>}
                {waiting && <p>{screenOffline ? "Layar acara belum tersambung. Foto sudah bisa diunduh; penayangan dimulai saat layar tersambung." : data.position ? `Antrean tayang #${data.position}` : "Giliran berikutnya"}</p>}
                {job.status === "failed" && <p>Hubungi operator untuk mengulang proses.</p>}
              </div>
              {error && <p className="connection-note" role="status">Koneksi terganggu. Status terakhir tetap ditampilkan; pembaruan dicoba otomatis.</p>}
              {actionError && <p className="form-error" role="alert">{actionError}</p>}
              <div className="result-actions">
                {job.resultUrl && <Button size="lg" onClick={download} disabled={!!busy}>{busy === "download" ? <LoaderCircle className="spin" aria-hidden="true" /> : <Download aria-hidden="true" />}Unduh poster</Button>}
                <Button variant="outline" onClick={copy}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "Tautan tersalin" : "Salin tautan"}</Button>
                <span className="sr-only" role="status">{copied ? "Tautan hasil berhasil disalin." : ""}</span>
                <Button variant="ghost" asChild><Link href="/">Unggah foto lain<ArrowRight aria-hidden="true" /></Link></Button>
              </div>
              </div>
            </Card>
          </section>
        </div>
      </>}
    </main>
  </>;
}

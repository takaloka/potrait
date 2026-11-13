"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, CheckCircle2, Pause, Play, Clock3, ExternalLink, LoaderCircle, RefreshCw, RotateCcw, Search, SkipForward, Users } from "lucide-react";
import type { Job, Settings, StateResponse } from "@/lib/photobooth-types";
import { POSTER_THEMES } from "@/lib/poster-themes";
import { Settings2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import Link from "./document-link";
import { ChatgptConnectionControl } from "./chatgpt-connection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

const labels: Record<Job["status"], string> = {
  queued: "Menunggu proses", processing: "Sedang dibuat", ready: "Siap tayang", displaying: "Sedang tampil", done: "Menunggu giliran", failed: "Perlu dicoba lagi", skipped: "Dilewati",
};

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || "Permintaan belum berhasil. Coba lagi.");
  return body as T;
}

function timeLabel(timestamp: number) {
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(timestamp));
}

export default function OperatorConsole() {
  const [data, setData] = useState<StateResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [themeDraft, setThemeDraft] = useState<Settings["themePolicy"] | null>(null);
  const [themeError, setThemeError] = useState("");
  const [displayDraft, setDisplayDraft] = useState<{ durationSeconds: string; replayLimit: string; screenRotation: Settings["screenRotation"] } | null>(null);
  const [displayError, setDisplayError] = useState("");
  const [busy, setBusy] = useState("");
  const [filter, updateFilter] = useState<"all" | "active" | "failed">("all");
  const [query, updateQuery] = useState("");
  const [page, setPage] = useState(1);
  function setFilter(value: "all" | "active" | "failed") { updateFilter(value); setPage(1); }
  function setQuery(value: string) { updateQuery(value); setPage(1); }
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(false);
  const requestSequence = useRef(0);
  const mutationLock = useRef(false);

  const refresh = useCallback(async (showError = true) => {
    const sequence = ++requestSequence.current;
    try {
      const next = await readResponse<StateResponse>(await fetch("/api/state", { cache: "no-store" }));
      if (mounted.current && sequence === requestSequence.current) {
        setData(next);
        if (showError) setError("");
      }
    } catch (reason) {
      if (mounted.current && showError) setError(reason instanceof Error ? reason.message : "Koneksi belum tersedia.");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    async function poll() {
      await refresh();
      if (!stopped) timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => { mounted.current = false; stopped = true; clearTimeout(timer); };
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function mutate(key: string, work: () => Promise<unknown>, success: string) {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusy(key);
    setError("");
    try {
      await work();
      await refresh(false);
      if (mounted.current) setNotice(success);
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : "Perubahan belum tersimpan.");
      if (mounted.current && key === "themePolicy") setThemeError(reason instanceof Error ? reason.message : "Tema belum tersimpan. Coba lagi.");
      if (mounted.current && key === "display") setDisplayError(reason instanceof Error ? reason.message : "Pengaturan belum tersimpan. Coba lagi.");
    } finally {
      mutationLock.current = false;
      if (mounted.current) setBusy("");
    }
  }

  function updateSetting(change: Partial<Settings>, key: string, message: string) {
    void mutate(key, async () => readResponse(await fetch("/api/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change),
    })), message);
  }

  function jobAction(job: Job, action: "retry" | "skip" | "requeue") {
    const messages = { retry: "Foto masuk kembali ke antrean proses.", skip: "Tayangan dilewati.", requeue: "Hasil masuk kembali ke antrean tayang." };
    void mutate(`${action}-${job.id}`, async () => readResponse(await fetch(`/api/jobs/${job.id}/action`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    })), messages[action]);
  }

  async function manualRefresh() {
    setRefreshing(true);
    try { await refresh(); } finally { if (mounted.current) setRefreshing(false); }
  }

  const jobs = data?.jobs ?? [];
  const processingCount = jobs.filter(job => job.status === "queued" || job.status === "processing").length;
  const readyCount = jobs.filter(job => job.status === "ready").length;
  const completedCount = jobs.filter(job => job.status === "done").length;
  const failedCount = jobs.filter(job => job.status === "failed").length;
  const visibleJobs = jobs.filter(job => {
    const matchesFilter = filter === "all" || (filter === "failed" ? job.status === "failed" : ["queued", "processing", "ready", "displaying"].includes(job.status));
    return (matchesFilter || (filter === "active" && job.status === "done")) && job.name.toLocaleLowerCase("id-ID").includes(query.toLocaleLowerCase("id-ID"));
  }).sort((a, b) => b.createdAt - a.createdAt);
  const pageCount = Math.max(1, Math.ceil(visibleJobs.length / 10));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * 10;
  const pageJobs = visibleJobs.slice(pageStart, pageStart + 10);
  if (page > pageCount) setPage(pageCount);

  async function confirmDelete() {
    if (!deleteTarget || mutationLock.current) return;
    mutationLock.current = true;
    setBusy(`delete-${deleteTarget.id}`);
    setDeleteError("");
    try {
      const result = await readResponse<{ mediaDeleted: boolean }>(await fetch(`/api/jobs/${deleteTarget.id}`, { method: "DELETE" }));
      ++requestSequence.current;
      setData(value => value ? { ...value, jobs: value.jobs.filter(job => job.id !== deleteTarget.id) } : value);
      setDeleteTarget(null);
      setNotice(result.mediaDeleted ? "Peserta dihapus." : "Peserta dihapus. Pembersihan berkas akan dicoba ulang otomatis.");
      await refresh(false);
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : "Peserta belum berhasil dihapus.");
    } finally {
      mutationLock.current = false;
      setBusy("");
    }
  }

  async function copyAccess(job: Job) {
    try {
      const result=await readResponse<{accessToken:string}>(await fetch(`/api/jobs/${job.id}/access`,{method:"POST"}));
      await navigator.clipboard.writeText(`${window.location.origin}/hasil/${job.id}#access=${result.accessToken}`);
      setNotice("Tautan hasil disalin. Berikan hanya kepada peserta pemilik foto.");
    } catch(reason){setError(reason instanceof Error?reason.message:"Tautan belum dapat disalin.");}
  }
  return (
    <>
        <main className="dashboard-main" id="dashboard-content" tabIndex={-1}>
          <h1 className="sr-only">Operator</h1>

          {error && <div className="form-error" role="alert"><span className="flex-1">{error}</span><Button variant="outline" size="sm" disabled={refreshing} onClick={() => void manualRefresh()}>Coba lagi</Button></div>}
          {notice && <div className="dashboard-notice" role="status"><CheckCircle2 size={17} aria-hidden="true" />{notice}</div>}

          <section className="metric-grid" aria-label="Ringkasan peserta">
            {[
              { label: "Total peserta", value: jobs.length, icon: Users, note: "Semua foto yang masuk" },
              { label: "Dalam proses", value: processingCount, icon: LoaderCircle, note: "Menunggu & disiapkan" },
              { label: "Siap tayang", value: readyCount, icon: Clock3, note: "Menunggu giliran layar" },
              { label: "Menunggu giliran", value: completedCount, icon: CheckCircle2, note: "Sudah melewati giliran" },
            ].map(metric => <Card className="metric-card" key={metric.label}><div className="metric-label"><span>{metric.label}</span><metric.icon size={16} aria-hidden="true" /></div><strong>{data ? metric.value : "—"}</strong></Card>)}
          </section>

          <Card className="event-controls event-controls-compact" role="region" aria-label="Pengaturan acara">
            <div className="event-control"><div><strong>Penerimaan foto</strong><p>{!data ? "Memuat pengaturan…" : data.settings.accepting ? "Terbuka untuk peserta" : "Ditutup sementara"}</p></div>
              <label className="switch-hit"><span className="sr-only">Buka penerimaan foto</span><Switch aria-label="Buka penerimaan foto" checked={data?.settings.accepting ?? false} disabled={!data || !!busy} onCheckedChange={accepting => updateSetting({ accepting }, "accepting", accepting ? "Penerimaan foto dibuka." : "Penerimaan foto ditutup.")} /></label>
            </div>
            <div className="event-control"><div><strong>Tayangan layar</strong><p>{!data ? "Memuat pengaturan…" : data.settings.paused ? "Pergantian dijeda" : "Berganti otomatis"}</p></div><div className="display-control-actions">
              <Button variant="outline" size="icon" aria-label="Atur tayangan layar" title="Atur tayangan layar" disabled={!data || !!busy} onClick={() => { if (data) { setDisplayError(""); setDisplayDraft({durationSeconds:String(data.settings.durationSeconds), replayLimit:String(data.settings.replayLimit ?? 10), screenRotation:data.settings.screenRotation ?? 0}); } }}><Settings2 aria-hidden="true" /></Button>
              <Button variant="outline" size="icon" aria-label={data?.settings.paused ? "Lanjutkan tayangan" : "Jeda tayangan"} title={data?.settings.paused ? "Lanjutkan tayangan" : "Jeda tayangan"} disabled={!data || !!busy} onClick={() => updateSetting({ paused: !data?.settings.paused }, "paused", data?.settings.paused ? "Tayangan dilanjutkan." : "Tayangan dijeda.")}>{busy === "paused" ? <LoaderCircle className="spin" aria-hidden="true" /> : data?.settings.paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</Button>
            </div></div>
            <div className="event-control"><div><strong>Tema acara</strong><p>{data ? POSTER_THEMES.find(theme => theme.id === data.settings.themePolicy.defaultTheme)?.name : "Memuat pengaturan…"}</p></div>
              <Button variant="outline" size="icon" aria-label="Atur tema acara" disabled={!data || !!busy} onClick={() => { if (data) { setThemeError(""); setThemeDraft({...data.settings.themePolicy, enabled:[...data.settings.themePolicy.enabled]}); } }}><Settings2 aria-hidden="true" /></Button>
            </div>
          </Card>

          <ChatgptConnectionControl />

          <Card className="queue-card" role="region" aria-labelledby="queue-title">
            <div className="queue-heading"><h2 id="queue-title">Antrean peserta <Badge variant="secondary">{data ? jobs.length : "—"}</Badge></h2><Button variant="outline" size="icon" aria-label="Perbarui antrean" disabled={refreshing} onClick={() => void manualRefresh()}><RefreshCw className={refreshing ? "spin" : ""} aria-hidden="true" /></Button></div>
            <div className="queue-toolbar">
              <div className="queue-filters" role="group" aria-label="Filter antrean">
                <Button size="sm" variant={filter === "all" ? "secondary" : "ghost"} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Semua</Button>
                <Button size="sm" variant={filter === "active" ? "secondary" : "ghost"} aria-pressed={filter === "active"} onClick={() => setFilter("active")}>Aktif</Button>
                <Button size="sm" variant={filter === "failed" ? "secondary" : "ghost"} aria-pressed={filter === "failed"} onClick={() => setFilter("failed")}>Perlu perhatian{failedCount > 0 && <span>({failedCount})</span>}</Button>
              </div>
              <label className="queue-search"><span className="sr-only">Cari nama peserta</span><Search size={16} aria-hidden="true" /><Input type="search" placeholder="Cari nama peserta…" value={query} onChange={event => setQuery(event.target.value)} /></label>
            </div>

            {!data ? <div className="queue-empty" role="status"><div className="empty-icon"><LoaderCircle className="spin" size={24} /></div><h3>{error ? "Data belum tersedia" : "Menyiapkan dashboard…"}</h3><p>{error ? "Periksa koneksi dan coba perbarui antrean." : "Mengambil status peserta dan layar acara."}</p></div>
              : visibleJobs.length === 0 ? <div className="queue-empty"><div className="empty-icon"><Users size={24} aria-hidden="true" /></div><h3>{jobs.length === 0 ? "Belum ada peserta" : "Peserta tidak ditemukan"}</h3><Button variant="outline" asChild={jobs.length === 0} onClick={jobs.length ? () => { setQuery(""); setFilter("all"); } : undefined}>{jobs.length === 0 ? <Link href="/layar">Buka layar QR<ArrowUpRight aria-hidden="true" /></Link> : "Reset pencarian"}</Button></div>
              : <Table className="queue-table">
                <TableHeader><TableRow><TableHead scope="col">Peserta</TableHead><TableHead scope="col">Status</TableHead><TableHead scope="col">Masuk · WIB</TableHead><TableHead scope="col" className="text-right">Tindakan</TableHead></TableRow></TableHeader>
                <TableBody>{pageJobs.map(job => <TableRow key={job.id}>
                  <TableCell><div className="queue-person">{job.resultUrl && <img src={job.resultUrl} alt="" loading="lazy" />}<div><strong>{job.name}</strong><small>{job.isSample ? "Foto contoh" : job.mode === "demo" ? "Foto peserta" : "Potret AI"}</small>{job.error && <span className="queue-row-error">{job.error}</span>}</div></div></TableCell>
                  <TableCell><Badge className="status-pill" data-status={job.status}><i aria-hidden="true" />{labels[job.status]}</Badge></TableCell>
                  <TableCell className="queue-time">{timeLabel(job.createdAt)} WIB</TableCell>
                  <TableCell><div className="queue-actions">
                    <Button asChild variant="ghost" size="icon" aria-label={`Lihat hasil ${job.name}`}><a href={`/hasil/${job.id}`}><ExternalLink aria-hidden="true" /></a></Button>
                    <Button variant="ghost" size="sm" onClick={() => void copyAccess(job)}>Salin tautan</Button>
                    <Button variant="ghost" size="icon" aria-label={`Hapus peserta ${job.name}`} title={job.status === "displaying" ? "Lewati tayangan dahulu" : `Hapus ${job.name}`} disabled={!!busy || job.status === "displaying"} onClick={() => { setDeleteError(""); setDeleteTarget(job); }}><Trash2 aria-hidden="true" /></Button>
                    {job.status === "failed" && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => jobAction(job, "retry")}><RotateCcw aria-hidden="true" />Coba lagi</Button>}
                    {job.status === "skipped" && job.resultUrl && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => jobAction(job, "requeue")}><RotateCcw aria-hidden="true" />Ikutkan lagi</Button>}
                    {["queued", "processing", "ready", "displaying", "done"].includes(job.status) && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => jobAction(job, "skip")}><SkipForward aria-hidden="true" />Lewati</Button>}
                  </div></TableCell>
                </TableRow>)}</TableBody>
              </Table>}
            <div className="queue-footer"><span>{visibleJobs.length ? pageStart + 1 : 0}–{Math.min(pageStart + 10, visibleJobs.length)} dari {visibleJobs.length} peserta</span><nav className="flex items-center gap-2" aria-label="Halaman antrean"><Button variant="outline" size="icon" aria-label="Halaman sebelumnya" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft aria-hidden="true" /></Button><span aria-live="polite">{currentPage} / {pageCount}</span><Button variant="outline" size="icon" aria-label="Halaman berikutnya" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight aria-hidden="true" /></Button></nav></div>
          </Card>
          <footer className="dashboard-footer"><span>Loka Portrait · Taka Loka Initiative</span><span>Waktu ditampilkan dalam WIB</span></footer>
        </main>
        <Dialog open={!!displayDraft} onOpenChange={open => { if (!open && busy !== "display") setDisplayDraft(null); }}>
          <DialogContent className="theme-settings-dialog" showCloseButton={busy !== "display"}>
            <DialogHeader><DialogTitle>Tayangan layar</DialogTitle><DialogDescription>Atur durasi, jumlah foto, dan arah layar TV.</DialogDescription></DialogHeader>
            {displayDraft && <form onSubmit={event => {
              event.preventDefault();
              const durationSeconds = Number(displayDraft.durationSeconds), replayLimit = Number(displayDraft.replayLimit);
              if (!Number.isInteger(durationSeconds) || durationSeconds < 5 || durationSeconds > 60 || !Number.isInteger(replayLimit) || replayLimit < 1 || replayLimit > 1000) { setDisplayError("Isi durasi 5 sampai 60 detik dan jumlah 1 sampai 1000 orang."); return; }
              setDisplayError("");
              void mutate("display", async () => {
                const next = await readResponse<StateResponse>(await fetch("/api/settings", {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({durationSeconds, replayLimit, screenRotation:displayDraft.screenRotation})}));
                if (mounted.current) { ++requestSequence.current; setData(next); setDisplayDraft(null); }
              }, "Pengaturan tayangan diperbarui.");
            }}>
              <fieldset className="display-settings-fields" disabled={!!busy}>
                <legend className="sr-only">Pengaturan tayangan</legend>
                <div><label htmlFor="slide-duration">Durasi tiap foto (detik)</label><Input id="slide-duration" type="number" min={5} max={60} step={1} required value={displayDraft.durationSeconds} onChange={event => setDisplayDraft({...displayDraft, durationSeconds:event.target.value})} aria-describedby="slide-duration-hint" /><p id="slide-duration-hint">5 sampai 60 detik per foto.</p></div>
                <div><label htmlFor="replay-limit">Jumlah orang dalam putaran</label><Input id="replay-limit" type="number" min={1} max={1000} step={1} required value={displayDraft.replayLimit} onChange={event => setDisplayDraft({...displayDraft, replayLimit:event.target.value})} aria-describedby="replay-limit-hint" /><p id="replay-limit-hint">Foto baru tampil dulu. Setelah itu, ulangi foto orang terbaru sesuai jumlah ini.</p></div>
                <fieldset className="display-orientation"><legend>Arah layar TV</legend>{([{value:0,label:"Landscape",note:"Mendatar, tanpa rotasi"},{value:90,label:"Portrait kanan",note:"Tegak, putar ke kanan"},{value:270,label:"Portrait kiri",note:"Tegak, putar ke kiri"}] as const).map(option => <label key={option.value}><input type="radio" name="screenRotation" value={option.value} checked={displayDraft.screenRotation === option.value} onChange={() => setDisplayDraft({...displayDraft, screenRotation:option.value})} /><span><strong>{option.label}</strong><small>{option.note}</small></span></label>)}</fieldset>
              </fieldset>
              {displayError && <p className="form-error" role="alert">{displayError}</p>}
              <DialogFooter><Button type="button" variant="outline" disabled={busy === "display"} onClick={() => setDisplayDraft(null)}>Batal</Button><Button type="submit" disabled={!!busy}>{busy === "display" ? "Menyimpan…" : "Simpan"}</Button></DialogFooter>
            </form>}
          </DialogContent>
        </Dialog>
        <Dialog open={!!themeDraft} onOpenChange={open => { if (!open && busy !== "themePolicy") setThemeDraft(null); }}>
          <DialogContent className="theme-settings-dialog" showCloseButton={busy !== "themePolicy"}>
            <DialogHeader><DialogTitle>Tema acara</DialogTitle><DialogDescription>Aktifkan tema yang tersedia untuk peserta, lalu pilih tema default.</DialogDescription></DialogHeader>
            {themeDraft && <fieldset className="theme-settings-list" disabled={!!busy}>
              <legend className="sr-only">Ketersediaan dan tema default</legend>
              {POSTER_THEMES.map(theme => {
                const enabled = themeDraft.enabled.includes(theme.id);
                return <div className="theme-settings-row" key={theme.id}>
                  <div><strong>{theme.name}</strong><small>{enabled ? "Tersedia untuk peserta" : "Terkunci untuk peserta"}</small></div>
                  <div className="theme-settings-actions">
                    <label><input type="radio" name="defaultTheme" aria-label={`Jadikan ${theme.name} tema default`} checked={themeDraft.defaultTheme === theme.id} disabled={!enabled || !!busy} onChange={() => setThemeDraft({...themeDraft, defaultTheme:theme.id})} /> Default</label>
                    <Switch aria-label={`Aktifkan ${theme.name}`} checked={enabled} disabled={!!busy || (enabled && themeDraft.enabled.length === 1)} onCheckedChange={checked => {
                      const themes = checked ? [...themeDraft.enabled, theme.id] : themeDraft.enabled.filter(id => id !== theme.id);
                      setThemeDraft({enabled:themes, defaultTheme:themes.includes(themeDraft.defaultTheme) ? themeDraft.defaultTheme : themes[0]});
                    }} />
                  </div>
                </div>;
              })}
            </fieldset>}
            <p className="theme-settings-hint">Minimal satu tema aktif. Tema default otomatis terpilih untuk peserta baru.</p>
            {themeError && <p className="form-error" role="alert">{themeError}</p>}
            <DialogFooter><Button variant="outline" disabled={busy === "themePolicy"} onClick={() => setThemeDraft(null)}>Batal</Button><Button disabled={!!busy || !themeDraft} onClick={() => {
              setThemeError("");
              void mutate("themePolicy", async () => {
                const next = await readResponse<StateResponse>(await fetch("/api/settings", {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({themePolicy:themeDraft})}));
                if (mounted.current) { ++requestSequence.current; setData(next); setThemeDraft(null); }
              }, "Tema acara diperbarui.");
            }}>{busy === "themePolicy" ? "Menyimpan…" : "Simpan"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open && !busy) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Hapus {deleteTarget?.name}?</AlertDialogTitle><AlertDialogDescription>Data peserta dan fotonya akan dihapus permanen.</AlertDialogDescription></AlertDialogHeader>
            {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
            <AlertDialogFooter><AlertDialogCancel disabled={!!busy}>Batal</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={!!busy} onClick={event => { event.preventDefault(); void confirmDelete(); }}>{busy ? "Menghapus…" : "Hapus peserta"}</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import {
  ArrowUpRight,
  Camera,
  CircleAlert,
  LoaderCircle,
  Upload,
  X,
  Music2,
  AtSign,
} from "lucide-react";
import { FootballPoster } from "./football-poster";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiJson } from "@/lib/photobooth-client";
import type { Job, PortraitStyle, PosterTheme, StateResponse } from "@/lib/photobooth-types";
import { ThemePicker } from "./theme-picker";
import { posterTheme as themeInfo } from "@/lib/poster-themes";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function InstagramIcon({size = 24, strokeWidth = 1.7}: {size?: number; strokeWidth?: number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Foto belum terkirim. Periksa koneksi, lalu coba lagi.";
}

export default function ParticipantForm() {
  const [state, setState] = useState<Pick<StateResponse, "settings" | "mode" | "aiConfigured"> | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [name, setName] = useState("");
  const [portraitStyle, setPortraitStyle] = useState<PortraitStyle | "">("");
  const [posterTheme, setPosterTheme] = useState<PosterTheme>("nusantara");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [followOpen, setFollowOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const followConfirmedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const selectedThemeRef = useRef<PosterTheme | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    async function refresh() {
      try {
        const next = await apiJson<Pick<StateResponse, "settings" | "mode" | "aiConfigured">>("/api/event", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!active) return;
        setState(next);
        if (!submittingRef.current && (!selectedThemeRef.current || !next.settings.themePolicy.enabled.includes(selectedThemeRef.current))) {
          selectedThemeRef.current = next.settings.themePolicy.defaultTheme;
          setPosterTheme(next.settings.themePolicy.defaultTheme);
          setPortraitStyle("");
          requestIdRef.current = null;
        }
        setConnectionError("");
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setConnectionError(
          `Status acara belum diperbarui. ${errorMessage(error)}`,
        );
      } finally {
        if (active) timer = setTimeout(refresh, 5000);
      }
    }

    void refresh();
    return () => {
      active = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!photoUrl) return;
    return () => URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  function changeDraft() {
    requestIdRef.current = null;
    setFormError("");
  }

  function selectPhoto(file: File | undefined) {
    if (!file || submittingRef.current) return;
    if (!PHOTO_TYPES.has(file.type)) {
      setFormError("Gunakan foto JPG, PNG, atau WebP. Format HEIC belum didukung.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size === 0 || file.size > MAX_PHOTO_BYTES) {
      setFormError(file.size === 0 ? "Berkas foto kosong. Pilih foto lain." : "Ukuran foto maksimal 8 MB. Pilih foto yang lebih kecil.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    changeDraft();
    setPhoto(file);
    setPhotoUrl(URL.createObjectURL(file));
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    selectPhoto(event.currentTarget.files?.[0]);
    // The draft owns the File; reset the picker so the same file can be retried.
    event.currentTarget.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (submittingRef.current) return;
    if (event.dataTransfer.files.length > 1) {
      setFormError("Pilih satu foto diri untuk setiap pengiriman.");
      return;
    }
    selectPhoto(event.dataTransfer.files[0]);
  }

  function removePhoto() {
    if (submittingRef.current) return;
    changeDraft();
    setPhoto(null);
    setPhotoUrl("");
    if (inputRef.current) inputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    inputRef.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    const followConfirmed = followConfirmedRef.current;
    followConfirmedRef.current = false;
    const cleanName = name.trim();
    if (!cleanName) {
      setFormError("Isi nama panggilan yang ingin ditampilkan.");
      return;
    }
    if ([...cleanName].length > 32) {
      setFormError("Nama panggilan maksimal 32 karakter.");
      return;
    }
    if (!photo) {
      setFormError("Pilih foto terlebih dahulu.");
      inputRef.current?.focus();
      return;
    }
    if (!portraitStyle) {
      setFormError("Pilih gaya potret terlebih dahulu.");
      return;
    }
    if (!state) {
      setFormError("Status acara belum tersedia. Tunggu koneksi tersambung, lalu coba lagi.");
      return;
    }
    if (!state.settings.accepting) {
      setFormError("Penerimaan foto sedang ditutup. Silakan coba lagi nanti.");
      return;
    }
    if (state.mode === "live" && !state.aiConfigured) {
      setFormError("Pemrosesan foto belum tersedia. Hubungi operator.");
      return;
    }

    if (!followConfirmed) {
      setFormError("");
      setFollowOpen(true);
      return;
    }

    submittingRef.current = true;
    setBusy(true);
    setFormError("");
    let navigating = false;
    try {
      // Keep this ID after a failed network response: repeating the same request
      // must return its original job rather than processing the photo twice.
      requestIdRef.current ??= crypto.randomUUID();
      const payload = new FormData();
      payload.set("name", cleanName);
      payload.set("sample", "false");
      payload.set("portraitStyle", portraitStyle);
      payload.set("posterTheme", posterTheme);
      payload.set("requestId", requestIdRef.current);
      payload.set("consent", "true");
      if (photo) payload.set("image", photo);

      const response = await apiJson<{ job: Job; accessToken: string }>("/api/jobs", {
        method: "POST",
        body: payload,
      });
      navigating = true;
      window.location.assign(`/hasil/${encodeURIComponent(response.job.id)}#access=${response.accessToken}`);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      if (!navigating) {
        submittingRef.current = false;
        setBusy(false);
      }
    }
  }

   const previewUrl = photoUrl;
  const accepting = state?.settings.accepting;
  const aiUnavailable = state?.mode === "live" && !state.aiConfigured;

  return (
    <>
      <a className="skip-link" href="#form-foto">Langsung ke formulir foto</a>

      <main className="participant-main" id="konten-utama">
        <div className="participant-grid participant-theme-grid">
          <ThemePicker value={posterTheme} policy={state?.settings.themePolicy} disabled={busy || !state} onChange={theme => { changeDraft(); selectedThemeRef.current = theme; setPosterTheme(theme); setPortraitStyle(""); }} />
          <section className="studio-intro" aria-labelledby="portrait-heading">
            <header className="studio-panel-heading"><h1 id="portrait-heading">Pratinjau</h1></header>
            <div className="studio-preview">
              <div className="studio-artwork"><FootballPoster name={name.trim() || "NAMA KAMU"} image={photoUrl} theme={posterTheme} note="" /></div>
            </div>
            <div className="studio-panel-footer"><span>{themeInfo(posterTheme).name}</span><span>{photoUrl ? "Pratinjau bingkai · Foto asli" : "Foto akan muncul setelah diunggah"}</span></div>
          </section>

          <Card className="join-panel" id="form-foto" role="region" tabIndex={-1} aria-labelledby="join-heading">
            <header className="studio-panel-heading"><h2 id="join-heading">Foto kamu</h2><Camera size={18} aria-hidden="true" /></header>

            <form ref={formRef} onSubmit={submit} aria-busy={busy}>
              <label className="field-label" htmlFor="participant-name">
                <span>Nama panggilan</span>
                <span className="field-note">Maks. 32 karakter</span>
              </label>
              <Input
                className="name-input"
                id="participant-name"
                name="name"
                autoComplete="nickname"
                placeholder="Nama yang akan tampil di layar"
                maxLength={32}
                required
                disabled={busy}
                value={name}
                onChange={(event) => {
                  changeDraft();
                  setName(event.target.value);
                }}
              />

              <fieldset className="portrait-style-picker" disabled={busy}>
                <legend className="field-label">Gaya potret</legend>
                <div className="portrait-style-options">
                  {(posterTheme === "kolase" ? ([{ value: "batik", label: "Batik santai" }, { value: "kebaya-kasual", label: "Kebaya kasual" }, { value: "retro-festival", label: "Retro festival" }] as const) : ([{ value: "beskap", label: "Beskap" }, { value: "kebaya", label: "Kebaya" }, { value: "jas", label: "Jas vintage" }] as const)).map(style => <label className="portrait-style-option" key={style.value}>
                    <input type="radio" name="portraitStyle" value={style.value} checked={portraitStyle === style.value} required onChange={() => { changeDraft(); setPortraitStyle(style.value); }} />
                    <span>{style.label}</span>
                  </label>)}
                </div>
              </fieldset>

              <label className="field-label photo-label" htmlFor="participant-photo">
                <span>Foto</span>
                <span className="field-note">Satu orang, wajah jelas</span>
              </label>
              <div
                className={`photo-drop ${previewUrl ? "has-photo" : ""} ${dragging ? "is-dragging" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!busy) setDragging(true);
                }}
                onDragLeave={(event) => {
                  const nextTarget = event.relatedTarget;
                  if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setDragging(false);
                }}
                onDrop={handleDrop}
              >
                <input
                  ref={inputRef}
                  type="file"
                  id="participant-photo"
                  name="image"
                  accept="image/jpeg,image/png,image/webp"
                  aria-describedby="photo-hint"
                  aria-label={previewUrl ? "Ganti foto diri" : "Pilih foto diri"}
                  disabled={busy}
                  onChange={handlePhotoChange}
                />

                {previewUrl ? (
                  <>
                    <img
                      className="upload-preview"
                      src={previewUrl}
                      alt="Pratinjau foto yang dipilih"
                      onError={() => {
                        setFormError("Foto belum dapat dibaca. Pilih foto lain.");
                        setPhoto(null);
                        setPhotoUrl("");
                        requestIdRef.current = null;
                      }}
                    />
                    <div className="upload-overlay"><Camera size={16} aria-hidden="true" /><span>Ganti foto</span></div>
                    <Button className="remove-photo" variant="outline" size="icon" type="button" onClick={removePhoto} disabled={busy} aria-label="Hapus foto yang dipilih"><X size={17} aria-hidden="true" /></Button>
                  </>
                ) : (
                  <>
                    <span className="upload-icon"><Upload size={25} strokeWidth={1.6} aria-hidden="true" /></span>
                    <span className="upload-help"><strong>Pilih atau tarik foto ke sini</strong><span>Gunakan foto terang, dengan wajah terlihat.</span></span>
                  </>
                )}
              </div>
              <Button className="camera-button" variant="outline" type="button" disabled={busy} aria-describedby="photo-hint" onClick={() => cameraInputRef.current?.click()}>
                <Camera size={18} aria-hidden="true" />
                Ambil foto
              </Button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="user"
                hidden
                disabled={busy}
                onChange={handlePhotoChange}
              />
              <p className="file-hint" id="photo-hint">JPG, PNG, atau WebP · maksimal 8 MB{photo ? ` · ${(photo.size / 1024 / 1024).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB terpilih` : ""}</p>

              {formError && <p className="form-error" role="alert"><CircleAlert size={17} aria-hidden="true" /><span>{formError}</span></p>}
              {connectionError && <p className="connection-note" role="status"><CircleAlert size={16} aria-hidden="true" /><span>{connectionError}</span></p>}
              {accepting === false && <p className="closed-note" role="status">Penerimaan foto sedang ditutup. Formulirmu tetap tersimpan di halaman ini.</p>}
              {aiUnavailable && <p className="closed-note" role="status">Pemrosesan foto belum tersedia. Hubungi operator.</p>}

              <label className="photo-consent"><input type="checkbox" required disabled={busy} /><span>Saya setuju foto diproses AI dan ditayangkan.</span></label>
              <Button className="submit-button" size="lg" type="submit" disabled={busy || !state || accepting === false || aiUnavailable}>
                {busy ? <><LoaderCircle className="spin" size={19} aria-hidden="true" /><span>Mengirim…</span></> : <><span>Kirim foto</span><ArrowUpRight size={21} aria-hidden="true" /></>}
              </Button>
            </form>
          </Card>
        </div>

      </main>

      <Dialog open={followOpen} onOpenChange={setFollowOpen}>
        <DialogContent className="social-follow-dialog">
          <DialogHeader><DialogTitle>Ikuti cerita Takaloka</DialogTitle><DialogDescription>Temukan cerita, karya, dan acara berikutnya. Ikuti Takaloka di media sosial sebelum melanjutkan potretmu.</DialogDescription></DialogHeader>
          <nav className="social-follow-links" aria-label="Media sosial Takaloka">
            {[
              {name:"Instagram", href:"https://www.instagram.com/takaloka.in/", icon:InstagramIcon},
              {name:"TikTok", href:"https://www.tiktok.com/@takaloka.in", icon:Music2},
              {name:"Threads", href:"https://www.threads.com/@takaloka.in", icon:AtSign},
            ].map(social => <a key={social.name} href={social.href} target="_blank" rel="noopener noreferrer" aria-label={`${social.name} Takaloka (tab baru)`}><social.icon size={24} strokeWidth={1.7} aria-hidden="true" /><span>{social.name}</span><ArrowUpRight size={14} aria-hidden="true" /></a>)}
          </nav>
          <p className="social-follow-note">Tautan dibuka di tab baru. Foto dan isianmu tetap ada di sini.</p>
          <DialogFooter><Button className="social-follow-continue" type="button" disabled={busy} onClick={() => {
            if (submittingRef.current) return;
            setFollowOpen(false);
            followConfirmedRef.current = true;
            formRef.current?.requestSubmit();
            followConfirmedRef.current = false;
          }}>Sudah follow, lanjutkan<ArrowUpRight size={17} aria-hidden="true" /></Button></DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}

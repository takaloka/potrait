import type { Job } from "./photobooth-types";
import { NUSANTARA_ASSETS, type NusantaraAsset } from "./nusantara-art";
import { posterSvg } from "./poster-themes";
import { kolaseSourceAssets, kolaseSourceFont } from "./kolase-display-assets";

async function embeddedImage(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Berkas poster belum termuat. Coba lagi.");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Berkas foto belum dapat dibaca."));
    reader.readAsDataURL(blob);
  });
}

export async function renderPosterBlob(job: Pick<Job, "name" | "resultUrl" | "originalUrl"> & Partial<Pick<Job, "posterTheme">>): Promise<Blob> {
  const keys = job.posterTheme === "kolase" ? [] : NUSANTARA_ASSETS;
  const kolase = job.posterTheme === "kolase" ? [...Object.values(kolaseSourceAssets),kolaseSourceFont] : [];
  const [image, ...layers] = await Promise.all([
    embeddedImage(job.resultUrl || job.originalUrl),
    ...keys.map(key => embeddedImage(`/art/nusantara/${key}.png`)),
    ...kolase.map(url => embeddedImage(url)),
  ]);
  const assets = Object.fromEntries(keys.map((key, index) => [key, layers[index]])) as Partial<Record<NusantaraAsset, string>>;
  let svg = posterSvg({ name: job.name, image, assets, theme: job.posterTheme, containPortrait: (job.resultUrl || job.originalUrl).includes("persibo-player-v2") });
  kolase.forEach((url,index) => { svg=svg.replaceAll(url,layers[keys.length+index]); });
  const source = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image(); img.src = source; await img.decode();
    const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 1500;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Perangkat ini belum dapat membuat poster.");
    context.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Poster belum bisa diunduh. Coba lagi.");
    return blob;
  } finally { URL.revokeObjectURL(source); }
}

export async function downloadPoster(job: Job) {
  const blob = await renderPosterBlob(job);
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url;
  link.download = `${job.posterTheme || "nusantara"}-${job.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "peserta"}.png`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

import { memo, useEffect, useId, useState } from "react";
import { posterSvg } from "@/lib/poster-themes";
import type { PosterTheme } from "@/lib/photobooth-types";

type FootballPosterProps = {
  name: string;
  image: string;
  note?: string;
  hero?: boolean;
  sample?: boolean;
  loading?: boolean;
  reveal?: boolean;
  theme?: PosterTheme;
};

// Retain the existing entry point for Studio and participant-result consumers.
export const FootballPoster = memo(function FootballPoster({ name, image, loading = false, reveal = false, theme = "nusantara" }: FootballPosterProps) {
  const id = useId();
  const [decoded, setDecoded] = useState("");
  const [failed, setFailed] = useState("");
  useEffect(() => {
    if (!reveal || loading || !image) return;
    let active = true;
    const photo = new Image();
    photo.onload = async () => {
      try {
        await photo.decode();
        if (active) setDecoded(image);
      } catch { if (active) setFailed(image); }
    };
    photo.onerror = () => { if (active) setFailed(image); };
    photo.src = image;
    return () => { active = false; photo.onload = null; photo.onerror = null; };
  }, [image, loading, reveal]);
  const waiting = loading || (reveal && (!image || decoded !== image));
  return <div className="portrait-preview" aria-busy={waiting && !(image && failed === image)}>
    <div className="nusantara-poster" dangerouslySetInnerHTML={{ __html: posterSvg({ name, image: waiting ? "" : image, id, theme, portraitLoading: waiting, portraitReveal: reveal && !waiting }) }} />
    {reveal && image && failed === image && <p className="connection-note" role="status">Gambar belum dapat dimuat. Muat ulang halaman untuk mencoba lagi.</p>}
  </div>;
});

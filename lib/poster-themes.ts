import type { PosterTheme } from "./photobooth-types";
import { nusantaraSvg, type NusantaraArtwork } from "./nusantara-art";
import { kolaseSvg } from "./kolase-art";

export const POSTER_THEMES = [
  { id: "nusantara", name: "Jendela Nusantara", description: "Jendela kayu, bunga & awan" },
  { id: "kolase", name: "Kolase Rakyat", description: "Kertas sobek & cetak rakyat" },
] as const;

export function posterTheme(theme?: string) {
  return POSTER_THEMES.find(item => item.id === theme) ?? POSTER_THEMES[0];
}

export function posterSvg(artwork: NusantaraArtwork & { theme?: PosterTheme }) {
  return artwork.theme === "kolase" ? kolaseSvg(artwork) : nusantaraSvg(artwork);
}

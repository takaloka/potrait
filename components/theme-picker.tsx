import { useId } from "react";
import { LockKeyhole } from "lucide-react";
import type { PosterTheme, Settings } from "@/lib/photobooth-types";
import { POSTER_THEMES, posterSvg } from "@/lib/poster-themes";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ThemePicker({ value, onChange, disabled, policy }: { value: PosterTheme; onChange: (value: PosterTheme) => void; disabled?: boolean; policy?: Settings["themePolicy"] }) {
  const id = useId();
  const defaultTheme = POSTER_THEMES.find(theme => theme.id === policy?.defaultTheme);
  return <aside className="theme-library" aria-label="Pilihan tema poster">
    <header className="studio-panel-heading"><h2>Pilih tema</h2></header>
    <fieldset className="theme-options" disabled={disabled}>
      <legend className="sr-only">Tema poster</legend>
      {POSTER_THEMES.map(theme => policy && !policy.enabled.includes(theme.id) ? <Dialog key={theme.id}>
        <DialogTrigger asChild><button type="button" className="theme-option is-locked" disabled={disabled}>
          <span className="theme-thumbnail" aria-hidden="true" dangerouslySetInnerHTML={{ __html: posterSvg({ name: "", image: "", theme: theme.id, id: `${id}-${theme.id}` }) }} />
          <span className="theme-option-copy"><strong>{theme.name}</strong><small>Tidak tersedia di acara ini</small></span>
          <LockKeyhole className="theme-lock" size={15} aria-hidden="true" />
        </button></DialogTrigger>
        <DialogContent><DialogHeader><DialogTitle>Tema belum tersedia</DialogTitle><DialogDescription>{theme.name} tidak tersedia di acara ini. Gunakan tema {defaultTheme?.name} untuk membuat potretmu.</DialogDescription></DialogHeader>
          <DialogFooter><DialogClose asChild><Button disabled={disabled} onClick={() => onChange(policy.defaultTheme)}>Pakai {defaultTheme?.name}</Button></DialogClose></DialogFooter>
        </DialogContent>
      </Dialog> : <label key={theme.id} className={`theme-option ${value === theme.id ? "is-selected" : ""}`}>
        <input type="radio" name="posterTheme" value={theme.id} checked={value === theme.id} onChange={() => onChange(theme.id)} />
        <span className="theme-thumbnail" aria-hidden="true" dangerouslySetInnerHTML={{ __html: posterSvg({ name: "", image: "", theme: theme.id, id: `${id}-${theme.id}` }) }} />
        <span className="theme-option-copy"><strong>{theme.name}</strong><small>{theme.description}</small></span>
      </label>)}
    </fieldset>
  </aside>;
}

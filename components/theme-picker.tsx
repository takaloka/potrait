import { useId } from "react";
import type { PosterTheme } from "@/lib/photobooth-types";
import { POSTER_THEMES, posterSvg } from "@/lib/poster-themes";

export function ThemePicker({ value, onChange, disabled }: { value: PosterTheme; onChange: (value: PosterTheme) => void; disabled?: boolean }) {
  const id = useId();
  return <aside className="theme-library" aria-label="Pilihan tema poster">
    <header className="studio-panel-heading"><h2>Pilih tema</h2></header>
    <fieldset className="theme-options" disabled={disabled}>
      <legend className="sr-only">Tema poster</legend>
      {POSTER_THEMES.map(theme => <label key={theme.id} className={`theme-option ${value === theme.id ? "is-selected" : ""}`}>
        <input type="radio" name="posterTheme" value={theme.id} checked={value === theme.id} onChange={() => onChange(theme.id)} />
        <span className="theme-thumbnail" aria-hidden="true" dangerouslySetInnerHTML={{ __html: posterSvg({ name: "", image: "", theme: theme.id, id: `${id}-${theme.id}` }) }} />
        <span className="theme-option-copy"><strong>{theme.name}</strong><small>{theme.description}</small></span>
      </label>)}
    </fieldset>
  </aside>;
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { posterSvg } from "@/lib/poster-themes";
import type { PosterTheme } from "@/lib/photobooth-types";
import { kolaseLandscapeSvg } from "@/lib/kolase-landscape";

const SVG = "http://www.w3.org/2000/svg";

export function ScreenArtwork({ image, name, viewportRatio, retry, onError, theme = "nusantara" }: {
  image: string; name: string; viewportRatio: number; retry: number; onError: (message: string) => void; theme?: PosterTheme;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [displayedTheme, setDisplayedTheme] = useState(theme);
  // Same-theme portraits retain decorations; a new theme waits for its photo to decode.
  const artwork = useMemo(() => ({ __html: displayedTheme === "kolase" ? kolaseLandscapeSvg(viewportRatio) : posterSvg({ name: "", image: "", landscape: true, id: "display", viewportRatio, liveSlots: true, theme: displayedTheme }) }), [viewportRatio, displayedTheme]);

  useEffect(() => {
    const element = root.current;
    const slot = element?.querySelector<SVGSVGElement>("[data-portrait-slot]");
    const label = element?.querySelector<SVGTextElement>("[data-portrait-name]");
    if (!element || !slot || !label) return;
    let stale = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function replacePortrait() {
      if (image) {
        const ready = new Image(); ready.src = image;
        await Promise.race([ready.decode(), new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("image timeout")), 10000);
        })]);
        clearTimeout(timeout);
      }
      if (stale || !slot || !label || !element) return;
      if (theme !== displayedTheme) { setDisplayedTheme(theme); return; }
      const previous = [...slot.querySelectorAll<SVGImageElement>("image")];
      if (previous.length === 1 && previous[0].getAttribute("href") === image) {
        updateLabel();
        return;
      }
      // Capture in-flight opacity before cancellation so a quick second switch
      // continues from the current blend rather than snapping back to opaque.
      const opacity = previous.map(node => getComputedStyle(node).opacity);
      previous.forEach((node, index) => {
        node.style.opacity = opacity[index];
        node.getAnimations().forEach(animation => animation.cancel());
      });
      const incoming = image ? document.createElementNS(SVG, "image") : null;
      if (incoming) {
        incoming.setAttribute("href", image);
        incoming.setAttribute("width", String(slot.viewBox.baseVal.width));
        incoming.setAttribute("height", String(slot.viewBox.baseVal.height));
        incoming.setAttribute("preserveAspectRatio", image.includes("persibo-player-v2") ? "xMidYMax meet" : "xMidYMin slice");
        incoming.style.opacity = "0";
        slot.appendChild(incoming);
      }
      updateLabel();
      onError("");
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const options: KeyframeAnimationOptions = { duration: reduced ? 0 : 1200, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" };
      const animations = previous.map((node, index) => node.animate([{ opacity: opacity[index] }, { opacity: 0 }], options));
      if (incoming) animations.push(incoming.animate([{ opacity: 0 }, { opacity: 1 }], options));
      void Promise.all(animations.map(animation => animation.finished)).then(() => {
        previous.forEach(node => node.remove());
        if (incoming) incoming.style.opacity = "1";
        animations.forEach(animation => animation.cancel());
      }).catch(() => { /* A newer transition now owns these layers. */ });
    }

    function updateLabel() {
      if (!label || !element) return;
      label.textContent = name;
      const doelo = displayedTheme === "bojonegoro-doelo";
      label.setAttribute("font-size", String(doelo ? 38 : name.length > 38 ? 34 : name.length > 22 ? 44 : 62));
      if (name.length > (doelo ? 26 : 38)) { label.setAttribute("textLength", doelo ? "690" : "640"); label.setAttribute("lengthAdjust", "spacingAndGlyphs"); }
      else { label.removeAttribute("textLength"); label.removeAttribute("lengthAdjust"); }
      element.querySelector("svg")?.setAttribute("aria-label", `Potret ${name}`);
    }

    void replacePortrait().catch(() => {
      clearTimeout(timeout);
      if (!stale) onError("Foto berikutnya belum termuat. Foto sebelumnya tetap ditampilkan.");
    });
    return () => { stale = true; clearTimeout(timeout); };
  }, [image, name, viewportRatio, retry, onError, theme, displayedTheme]);

  return <div ref={root} className="nusantara-landscape" data-theme={displayedTheme} dangerouslySetInnerHTML={artwork} />;
}

import type { NusantaraArtwork } from "./nusantara-art";

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

/** Reference-inspired stamp print; TV intentionally retains its simple wood frame. */
export function bojonegoroSvg({ name, image, landscape = false, id = "doelo", viewportRatio = 9 / 16, liveSlots = false, portraitLoading = false, portraitReveal = false, containPortrait = false }: NusantaraArtwork) {
  const prefix = `doelo-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const safeName = escapeXml(name);
  const fit = containPortrait ? "xMidYMid meet" : "xMidYMin slice";
  const photo = (width: number, height: number) => image && !portraitLoading ? `<image${portraitReveal ? ' class="portrait-image-reveal"' : ""} href="${escapeXml(image)}" width="${width}" height="${height}" preserveAspectRatio="${fit}"/>` : "";

  if (!landscape) {
    // Circular cut-outs form a true scalloped edge, not a decorative stroke.
    const horizontal = Array.from({ length: 11 }, (_, i) => 110 + i * 98);
    const vertical = Array.from({ length: 15 }, (_, i) => 105 + i * (1290 / 14));
    const scallops = [
      ...horizontal.flatMap(x => [105, 1395].map(y => `<circle cx="${x}" cy="${y}" r="25"/>`)),
      ...vertical.flatMap(y => [110, 1090].map(x => `<circle cx="${x}" cy="${y}" r="25"/>`)),
    ].join("");
    const arch = "M180 1180V590A420 420 0 0 1 1020 590V1180Z";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500" role="img" aria-label="${escapeXml(`Bojonegoro Doelo — ${name || "potretmu"}`)}">
      <defs>
        <mask id="${prefix}-stamp" maskUnits="userSpaceOnUse" x="0" y="0" width="1200" height="1500"><rect x="110" y="105" width="980" height="1290" fill="white"/><g fill="black">${scallops}</g></mask>
        <clipPath id="${prefix}-arch"><path d="${arch}"/></clipPath>
      </defs>
      <rect width="1200" height="1500" fill="#ad191d"/>
      <rect x="110" y="105" width="980" height="1290" fill="#faf0dc" mask="url(#${prefix}-stamp)"/>
      <path d="${arch}" fill="#22583f"/>
      <g clip-path="url(#${prefix}-arch)"><svg x="180" y="170" width="840" height="1010" viewBox="0 0 840 1010" overflow="hidden">${photo(840, 1010)}</svg></g>
      ${!image || portraitLoading ? `<text x="600" y="760" text-anchor="middle" font-family="Georgia,serif" font-size="25" letter-spacing="3" fill="#e8ddc4">${portraitLoading ? "Menyiapkan potret…" : "POTRETMU DI SINI"}</text>` : ""}
      <text x="600" y="1267" text-anchor="middle" font-family="Georgia,serif" font-size="${name.length > 22 ? 48 : 64}" fill="#22583f" ${name.length > 26 ? 'textLength="800" lengthAdjust="spacingAndGlyphs"' : ""}>${safeName}</text>
      <text x="600" y="1330" text-anchor="middle" font-family="Georgia,serif" font-size="28" letter-spacing="2" fill="#ad191d">Genetik Bodjonegoro Doeloe</text>
    </svg>`;
  }

  const ratio = Number.isFinite(viewportRatio) && viewportRatio > 0 ? viewportRatio : 9 / 16;
  const width = 1080, height = width / ratio;
  const inset = 24, photoWidth = width - inset * 2, photoHeight = height - inset * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(`Bojonegoro Doelo — ${name}`)}">
    <defs>
      <linearGradient id="${prefix}-wood"><stop stop-color="#39271e"/><stop offset=".35" stop-color="#72513a"/><stop offset=".65" stop-color="#503727"/><stop offset="1" stop-color="#2d2019"/></linearGradient>
      <linearGradient id="${prefix}-shade" x2="0" y2="1"><stop stop-color="#21180f" stop-opacity="0"/><stop offset="1" stop-color="#21180f" stop-opacity=".72"/></linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#${prefix}-wood)"/>
    <rect x="17" y="17" width="${photoWidth + 14}" height="${photoHeight + 14}" fill="none" stroke="#8d7150" stroke-width="2"/>
    <svg ${liveSlots ? 'data-portrait-slot=""' : ""} x="${inset}" y="${inset}" width="${photoWidth}" height="${photoHeight}" viewBox="0 0 ${photoWidth} ${photoHeight}" overflow="hidden"><rect width="${photoWidth}" height="${photoHeight}" fill="#d8c9b3"/>${photo(photoWidth, photoHeight)}</svg>
    <rect x="${inset}" y="${Math.max(inset, height - 270)}" width="${photoWidth}" height="${Math.min(246, photoHeight)}" fill="url(#${prefix}-shade)"/>
    <text ${liveSlots ? 'data-portrait-name=""' : ""} x="62" y="${height - 62}" dominant-baseline="text-after-edge" font-family="Georgia,serif" font-size="38" fill="#fff6e7" ${name.length > 26 ? 'textLength="690" lengthAdjust="spacingAndGlyphs"' : ""}>${safeName}</text>
  </svg>`;
}

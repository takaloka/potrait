import type { NusantaraArtwork } from "./nusantara-art";
import { kolaseSourceAssets, kolaseSourceFont } from "./kolase-display-assets";

const xml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Portrait composition using the same original cutouts as the event screen. */
export function kolaseSvg({ name, image, id = "kolase", liveSlots = false, portraitLoading = false, portraitReveal = false, containPortrait = false }: NusantaraArtwork) {
  const prefix = `${id.replace(/[^a-zA-Z0-9_-]/g, "")}-kolase`;
  const art = (key: keyof typeof kolaseSourceAssets, x: number, y: number, width: number, height: number) => `<image data-ornament="${key}" href="${kolaseSourceAssets[key]}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`;
  const title = (text: string, y: number, angle: number) => `<text x="600" y="${y}" transform="rotate(${angle} 600 ${y})" text-anchor="middle" font-family="KolaseCut" font-size="96" fill="#c49a32" stroke="#f3ecd9" stroke-width="22" stroke-linejoin="bevel" paint-order="stroke">${text}</text>`;
  const photo = portraitLoading
    ? `<rect class="portrait-water-flow" y="-30" width="650" height="900" fill="url(#${prefix}-waiting)"/>`
    : image ? `<image ${portraitReveal ? 'class="portrait-image-reveal"' : ""} href="${xml(image)}" width="650" height="840" preserveAspectRatio="${containPortrait ? "xMidYMax meet" : "xMidYMin slice"}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500" role="img" aria-label="${xml(`Potret ${name || "Kolase Rakyat"}`)}">
<defs>
 <style>@font-face{font-family:KolaseCut;src:url(${kolaseSourceFont}) format('truetype')}</style>
 <pattern id="${prefix}-grain" width="44" height="270" patternUnits="userSpaceOnUse"><image href="${kolaseSourceAssets['green-swatch']}" width="44" height="270" preserveAspectRatio="none"/></pattern>
 <pattern id="${prefix}-orange" width="260" height="46" patternUnits="userSpaceOnUse"><image href="${kolaseSourceAssets['orange-swatch']}" width="260" height="46" preserveAspectRatio="none"/></pattern>
 <pattern id="${prefix}-waiting" width="60" height="30" patternUnits="userSpaceOnUse"><rect width="60" height="30" fill="#b5b0a1"/><path d="M-15 30 15 0 M15 30 45 0 M45 30 75 0" stroke="#f4ecd9" stroke-width="3" opacity=".18"/></pattern>
</defs>
<rect width="1200" height="1500" fill="url(#${prefix}-grain)"/>
<path d="M35 60 1166 35 1151 1454 50 1470Z" fill="url(#${prefix}-orange)"/>
${art('pennants',-10,300,650,171)}
<g data-cable-side="right" transform="translate(1200 0) scale(-1 1)">${art('pennants',-10,300,650,171)}</g>
${art('bird',990,20,200,176)}
<text x="600" y="116" text-anchor="middle" fill="#fff4dd" font-family="Arial,sans-serif" font-size="24" letter-spacing="4">LOKA PORTRAIT</text>
${title('PROSPERA',220,-3)}${title('NUSANTARA',328,2)}
${art('star-top',20,240,144,144)}
${art('star-right',1065,365,120,166)}
<path d="M253 373 310 381 365 370 422 379 480 371 540 380 597 371 653 379 712 370 770 379 830 372 890 380 948 372 943 445 951 520 943 595 950 670 942 745 950 820 942 895 951 970 943 1045 950 1120 943 1195 950 1251 890 1245 830 1253 770 1246 710 1254 650 1247 590 1253 530 1245 470 1254 410 1246 350 1252 290 1244 250 1252 257 1170 249 1090 257 1010 249 930 257 850 249 770 257 690 249 610 257 530 249 450Z" fill="#f4ecd9"/>
<rect x="275" y="395" width="650" height="840" fill="url(#${prefix}-waiting)"/>
<svg ${liveSlots ? 'data-portrait-slot=""' : ""} x="275" y="395" width="650" height="840" viewBox="0 0 650 840" overflow="hidden">${photo}</svg>
${art('hat',23,665,215,140)}
${art('lantern',5,1000,230,330)}
${art('cactus',977,1015,215,337)}
${art('star-left',1040,775,110,127)}
${art('scrap',100,870,35,42)}
<text ${liveSlots ? 'data-portrait-name=""' : ""} x="600" y="1340" text-anchor="middle" font-family="KolaseCut" font-size="${name.length > 22 ? 44 : 62}" fill="#fff4dd" ${name.length > 38 ? 'textLength="860" lengthAdjust="spacingAndGlyphs"' : ""}>${xml(name)}</text>
<text x="600" y="1395" text-anchor="middle" fill="#fff4dd" font-family="Arial,sans-serif" font-size="23">Rayakan warna ceritamu.</text>
<text x="600" y="1460" text-anchor="middle" fill="#fff4dd" font-family="Arial,sans-serif" font-size="17" letter-spacing="3">TAKALOKA INITIATIVE</text>
</svg>`;
}

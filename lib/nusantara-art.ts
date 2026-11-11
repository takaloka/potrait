export const NUSANTARA_ASSETS = ["window", "cloud", "top-left", "top-right", "bottom-left", "bottom-right"] as const;
export type NusantaraAsset = typeof NUSANTARA_ASSETS[number];
export type NusantaraArtwork = {
  name: string;
  image: string;
  landscape?: boolean;
  id?: string;
  assets?: Partial<Record<NusantaraAsset, string>>;
  containPortrait?: boolean;
  viewportRatio?: number;
  liveSlots?: boolean;
  portraitLoading?: boolean;
  portraitReveal?: boolean;
};

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

/** Shared geometry: browser preview and PNG export use the exact same SVG. */
export function nusantaraSvg({ name, image, landscape = false, id = "nusantara", assets = {}, containPortrait = image.includes("persibo-player-v2"), viewportRatio = 16 / 9, liveSlots = false, portraitLoading = false, portraitReveal = false }: NusantaraArtwork) {
  const prefix = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const ratio = Number.isFinite(viewportRatio) && viewportRatio > 0 ? viewportRatio : 16 / 9;
  const width = landscape ? Math.max(1920, 1080 * ratio) : 1200;
  const height = landscape ? width / ratio : 1500;
  const verticalOffset = (height - 1080) / 2;
  const heroHeight = Math.min(height * .915, width * .62);
  const heroWidth = heroHeight * .6;
  const heroX = (width - heroWidth) / 2;
  const heroY = (height * .939 - heroHeight) / 2;
  const asset = (key: NusantaraAsset) => escapeXml(assets[key] ?? `/art/nusantara/${key}.png`);
  const art = (key: NusantaraAsset, x: number, y: number, w: number, h: number, motion = "") => `<g${motion ? ` class="${motion}"` : ""}><image href="${asset(key)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/></g>`;
  const window = (x: number, y: number, w: number, h: number, portrait = false) => {
    const px = x + w * .202, py = y + h * .321, pw = w * .596, ph = h * .644;
    const content = portraitLoading ? `<rect class="portrait-water-flow" x="0" y="-30" width="${pw}" height="${ph + 60}" fill="url(#${prefix}-waves)"/>` : image ? `<image${portraitReveal ? ' class="portrait-image-reveal"' : ""} href="${escapeXml(image)}" width="${pw}" height="${ph}" preserveAspectRatio="${containPortrait ? "xMidYMax meet" : "xMidYMin slice"}"/>` : "";
    return `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="url(#${prefix}-waves)"/>${portrait && (image || liveSlots || portraitLoading) ? `<svg ${liveSlots ? 'data-portrait-slot=""' : ""} x="${px}" y="${py}" width="${pw}" height="${ph}" viewBox="0 0 ${pw} ${ph}" overflow="hidden">${content}</svg>` : ""}${art("window", x, y, w, h)}`;
  };
  const safeName = escapeXml(name);
  const fontSize = name.length > 38 ? 34 : name.length > 22 ? 44 : 62;
  const defs = `<defs>
    <pattern id="${prefix}-stripes" width="134" height="100" patternUnits="userSpaceOnUse"><rect width="134" height="100" fill="#B64D3D"/><rect width="67" height="100" fill="#A64032"/></pattern>
    <pattern id="${prefix}-waves" width="60" height="30" patternUnits="userSpaceOnUse"><rect width="60" height="30" fill="#54b8b0"/><g fill="none" stroke="#bee3d2" stroke-width="1.5" opacity=".7"><path d="M0 30A30 30 0 0 1 60 30M5 30A25 25 0 0 1 55 30M10 30A20 20 0 0 1 50 30M15 30A15 15 0 0 1 45 30M20 30A10 10 0 0 1 40 30M25 30A5 5 0 0 1 35 30"/></g></pattern>
    <filter id="${prefix}-paper"><feTurbulence type="fractalNoise" baseFrequency=".65" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".11"/></feComponentTransfer><feBlend in="SourceGraphic" mode="soft-light"/></filter>
  </defs>`;
  const background = `<rect width="${width}" height="${height}" fill="url(#${prefix}-stripes)"/><rect width="${width}" height="${height}" fill="#fff" opacity=".07" filter="url(#${prefix}-paper)"/>`;
  const content = landscape ? `
    ${window(-370, 50 + verticalOffset, 460, 767)}${window(heroX, heroY, heroWidth, heroHeight, true)}${window(width - 90, 50 + verticalOffset, 460, 767)}
    ${art("top-left", -130, -100, 470, 429, "flora-sway flora-sway-a")}
    ${art("bottom-left", width - 150, height / 2 - 120, 210, 333, "flora-sway flora-sway-b")}
    ${art("top-right", heroX - heroWidth * .292, heroY + heroHeight * .294, heroWidth * .547, heroHeight * .242, "flora-sway flora-sway-c")}
    ${art("cloud", heroX - heroWidth * .311, heroY + heroHeight * .617, heroWidth * .585, heroHeight * .118, "cloud-drift")}
    ${art("cloud", heroX + heroWidth * .755, heroY + heroHeight * .650, heroWidth * .689, heroHeight * .138, "cloud-drift cloud-drift-b")}
    ${art("bottom-right", -105, height - 190, 300, 335, "flora-sway flora-sway-b")}
    ${art("bottom-right", width - 190, height - 180, 310, 346, "flora-sway flora-sway-a")}
    <g fill="#fff8e8" text-anchor="middle"><text x="${width * .18}" y="${height * .43}" font-family="Georgia,serif" font-size="56">Prospera</text><text x="${width * .18}" y="${height * .49}" font-family="Georgia,serif" font-size="56">Nusantara</text><text x="${width * .18}" y="${height * .54}" font-family="Arial,sans-serif" font-size="20">Semangat dalam harmoni.</text><text ${liveSlots ? 'data-portrait-name=""' : ""} x="${width / 2}" y="${height * .974}" font-family="Georgia,serif" font-size="${Math.min(fontSize, height * .045)}" ${name.length > 38 ? 'textLength="640" lengthAdjust="spacingAndGlyphs"' : ""}>${safeName}</text></g>
  ` : `
    ${window(-340, 155, 600, 1000)}${window(300, 155, 600, 1000, true)}${window(940, 155, 600, 1000)}
    ${art("top-left", -135, -165, 710, 644, "flora-sway flora-sway-a")}
    ${art("top-right", -70, 385, 485, 357, "flora-sway flora-sway-c")}
    ${art("cloud", 120, 645, 360, 120, "cloud-drift")}
    ${art("top-right", 785, 490, 320, 235, "flora-sway flora-sway-b")}
    ${art("cloud", 780, 745, 410, 137, "cloud-drift cloud-drift-b")}
    ${art("bottom-left", 1000, 440, 310, 489, "flora-sway flora-sway-b")}
    ${art("bottom-right", -205, 815, 420, 469, "flora-sway flora-sway-a")}
    ${art("bottom-left", 985, 850, 310, 489, "flora-sway flora-sway-c")}
    ${art("bottom-right", 815, 1270, 515, 575, "flora-sway flora-sway-b")}
    <g fill="#fff8e8" text-anchor="middle"><text x="600" y="96" font-family="Georgia,serif" font-style="italic" font-size="38">Loka Portrait</text><text x="600" y="1230" font-family="Georgia,serif" font-size="76">Prospera Nusantara</text><text x="600" y="1308" font-family="Georgia,serif" font-size="${fontSize}" ${name.length > 38 ? 'textLength="880" lengthAdjust="spacingAndGlyphs"' : ""}>${safeName}</text><text x="600" y="1360" font-family="Arial,sans-serif" font-size="24">Semangat dalam harmoni Nusantara</text></g>
    <text x="66" y="1440" fill="#fff8e8" font-family="Arial,sans-serif" font-size="18" letter-spacing="3">LOKA PORTRAIT · TAKALOKA INITIATIVE</text>
  `;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(`Potret ${name || "Nusantara"}`)}">${defs}${background}${content}</svg>`;
}

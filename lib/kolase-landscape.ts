import { kolaseLandscapeTemplate } from "./kolase-display-template";

/** Expand the paper canvas to the viewport; keep portrait geometry undistorted. */
export function kolaseLandscapeSvg(viewportRatio: number) {
  const ratio = Number.isFinite(viewportRatio) && viewportRatio > 0 ? viewportRatio : 16 / 9;
  const width = Math.max(1920, 1080 * ratio);
  const height = Math.max(1080, 1920 / ratio);
  const x = (1920 - width) / 2;
  const y = (1080 - height) / 2;
  return kolaseLandscapeTemplate
    .replace('viewBox="0 0 1920 1080"', `viewBox="${x} ${y} ${width} ${height}"`)
    .replace('<rect width="1920" height="1080" fill="url(#green)"/>', `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#green)"/>`)
    .replaceAll('x="-10" y="-10" width="1050" height="277" preserveAspectRatio="xMidYMid meet"', `x="${x - 10}" y="${y - 10}" width="${1050 - x}" height="${277 - y}" preserveAspectRatio="none"`)
    .replace('M54 69 1866 40 1840 1029 78 1048Z', `M${x + 54} ${y + 69} ${x + width - 54} ${y + 40} ${x + width - 80} ${y + height - 51} ${x + 78} ${y + height - 32}Z`);
}

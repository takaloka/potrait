import { readFile, writeFile } from 'node:fs/promises';
import QRCode from 'qrcode';
import sharp from 'sharp';

const folder = new URL('../public/art/kolase-reference/', import.meta.url);
const image = async name => {
  let buffer=await readFile(new URL(`${name}.png`, folder));
  if(name.endsWith('swatch')) {
    const {width,height}=await sharp(buffer).metadata();
    const right=await sharp(buffer).flop().toBuffer();
    const bottom=await sharp(buffer).flip().toBuffer();
    const opposite=await sharp(buffer).flip().flop().toBuffer();
    buffer=await sharp({create:{width:width*2,height:height*2,channels:4,background:'#00000000'}}).composite([{input:buffer,left:0,top:0},{input:right,left:width,top:0},{input:bottom,left:0,top:height},{input:opposite,left:width,top:height}]).png().toBuffer();
  }
  return 'data:image/png;base64,'+buffer.toString('base64');
};
const names = ['bird','hat','lantern','cactus','star-left','star-right','star-top','pennants','scrap','green-swatch','orange-swatch'];
const assets = Object.fromEntries(await Promise.all(names.map(async name => [name, await image(name)])));
const font = (await readFile(new URL('../public/fonts/nordestino-reconstructed-regular.ttf', import.meta.url))).toString('base64');
await writeFile(new URL('../lib/kolase-source-assets.ts',import.meta.url), `// Generated source cutouts and mirrored paper swatches; embedded for PNG export.\nexport const kolaseSourceAssets = ${JSON.stringify(assets)};\nexport const kolaseSourceFont = ${JSON.stringify(font)};\n`);
const qr = await QRCode.toDataURL('http://127.0.0.1:8787/', { width: 300, margin: 4, color: { dark: '#172016', light: '#ffffff' } });
const art = (name,x,y,w,h) => `<g data-ornament="${name}"><image href="${assets[name]}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/></g>`;
const title = (text,x,y,angle) => `<g transform="rotate(${angle} ${x} ${y})"><text x="${x}" y="${y}" font-family="Nordestino" font-size="92" text-anchor="middle" fill="#c49a32" stroke="#f3ecd9" stroke-width="24" stroke-linejoin="bevel" paint-order="stroke">${text}</text><text x="${x}" y="${y}" font-family="Nordestino" font-size="92" text-anchor="middle" fill="url(#mustard)">${text}</text></g>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
<defs>
 <style>@font-face{font-family:Nordestino;src:url(data:font/ttf;base64,${font}) format('truetype')}</style>
 <pattern id="green" width="44" height="270" patternUnits="userSpaceOnUse"><image href="${assets['green-swatch']}" width="44" height="270" preserveAspectRatio="none"/></pattern>
 <pattern id="orange" width="260" height="46" patternUnits="userSpaceOnUse"><image href="${assets['orange-swatch']}" width="260" height="46" preserveAspectRatio="none"/></pattern>
 <pattern id="mustard" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#c49a32"/><path d="M1 1h1M4 4h1" stroke="#9e7728" opacity=".3"/></pattern>
 <filter id="paper"><feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".13"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter>
</defs>
<rect width="1920" height="1080" fill="url(#green)"/>
<path d="M54 69 1866 40 1840 1029 78 1048Z" fill="url(#orange)"/>
${art('pennants',-10,-10,1050,277)}
<g data-cable-side="right" transform="translate(1920 0) scale(-1 1)">${art('pennants',-10,-10,1050,277)}</g>
${art('bird',1600,35,258,227)}
${art('star-top',20,280,158,157)}
${art('star-right',1775,290,125,173)}
<text x="375" y="277" text-anchor="middle" fill="#fff4dd" font-family="Arial,sans-serif" font-size="25" letter-spacing="4">LOKA PORTRAIT</text>
${title('PROSPERA',365,405,-4)}
${title('NUSANTARA',365,516,2)}
<text x="365" y="583" text-anchor="middle" fill="#fff4dd" font-family="Arial,sans-serif" font-size="23">Rayakan warna ceritamu.</text>
${art('hat',250,655,230,150)}
${art('lantern',60,748,195,280)}
${art('star-left',525,825,115,132)}
<g data-layer="photo-paper">
 <path d="M702 105 746 113 781 101 837 108 879 99 928 109 976 101 1020 110 1072 98 1125 107 1180 100 1240 111 1283 104 1288 160 1282 215 1291 267 1283 323 1290 375 1282 431 1293 485 1285 541 1291 598 1283 657 1290 715 1281 771 1289 830 1282 889 1290 935 1233 941 1181 934 1128 945 1070 936 1013 943 958 936 904 945 848 937 789 945 739 935 696 942 703 888 694 832 702 775 694 718 704 662 696 607 702 549 694 493 703 437 695 380 703 325 696 270 704 216 695 160Z" fill="#f4ecd9"/>
 <rect x="721" y="132" width="539" height="786" fill="#b5b0a1"/>
 <rect x="721" y="132" width="539" height="786" fill="#b5b0a1" filter="url(#paper)"/>
 <text x="990" y="507" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" letter-spacing="4" fill="#595a50">FOTO PESERTA</text>
 <text x="990" y="548" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#66675b">Area foto — tidak tertutup ornamen</text>
</g>
<text x="990" y="1001" text-anchor="middle" font-family="Nordestino" font-size="61" fill="#fff4dd">NAMA PESERTA</text>
<g data-layer="join-qr">
 <text x="1558" y="313" text-anchor="middle" fill="#fff4dd" font-family="Arial,sans-serif" font-size="18" letter-spacing="3">ABADIKAN MOMENMU</text>
 <text x="1558" y="373" text-anchor="middle" fill="#fff4dd" font-family="Nordestino" font-size="43">JADI BAGIAN</text>
 <text x="1558" y="420" text-anchor="middle" fill="#fff4dd" font-family="Nordestino" font-size="43">CERITANYA.</text>
 <image href="${qr}" x="1418" y="460" width="280" height="280"/>
 <text x="1558" y="789" text-anchor="middle" fill="#fff4dd" font-family="Arial,sans-serif" font-size="21">Pindai QR, lalu unggah fotomu.</text>
</g>
${art('cactus',1732,758,184,288)}
${art('scrap',1365,865,32,39)}
${art('scrap',1680,850,27,33)}
<text x="300" y="1023" font-family="Arial,sans-serif" font-size="16" letter-spacing="2" fill="#fff4dd">TAKALOKA INITIATIVE</text>
</svg>`;
await writeFile(new URL('../docs/previews/kolase-landscape-source.svg',import.meta.url),svg);
// Shared static geometry for the live screen; its existing React QR and decoded
// portrait crossfade own the dynamic content. Motion reuses Nusantara classes.
const screen = svg
  .replace(/<g data-layer="join-qr">[\s\S]*?<\/g>/, '')
  .replace(/<text x="375"[\s\S]*?<\/text>/, '')
  .replace(/<text x="300"[\s\S]*?<\/text>/, '')
  .replace(/<text x="990" y="507"[\s\S]*?<\/text>\s*<text x="990" y="548"[\s\S]*?<\/text>/, '<svg data-portrait-slot="" x="721" y="132" width="539" height="786" viewBox="0 0 539 786" overflow="hidden"></svg>')
  .replace('<text x="990" y="1001"', '<text data-portrait-name="" x="990" y="1001"')
  .replace('>NAMA PESERTA</text>', '></text>')
  .replace(/data-ornament="([^"]+)"/g, (_, name) => `data-ornament="${name}" class="${name === 'bird' ? 'cloud-drift' : name === 'hat' || name === 'scrap' ? '' : 'flora-sway'} kolase-${name}"`);
await writeFile(new URL('../lib/kolase-landscape-template.ts',import.meta.url), `// Generated by scripts/preview-kolase-landscape.mjs from the approved source composition.\nexport const kolaseLandscapeTemplate = ${JSON.stringify(screen)};\n`);
const motion = `
[data-ornament] { transform-box:fill-box; transform-origin:center; }
[data-ornament="pennants"] { transform-origin:50% 0%; animation:flags 6.8s ease-in-out infinite; }
[data-ornament="bird"] { animation:bird 7.6s ease-in-out infinite; }
[data-ornament="lantern"] { transform-origin:50% 8%; animation:lamp 8.4s ease-in-out infinite; }
[data-ornament="cactus"] { transform-origin:50% 100%; animation:cactus 9.2s ease-in-out infinite; }
[data-ornament^="star-"] { animation:star 11s ease-in-out infinite; }
[data-ornament="star-right"] { animation-duration:13s; animation-delay:-4s; }
[data-ornament="star-left"] { animation-duration:9s; animation-delay:-2s; }
@keyframes flags { 0%,100% { transform:skewX(-.7deg); } 50% { transform:skewX(.7deg); } }
@keyframes bird { 0%,100% { transform:translateY(0) rotate(-1deg); } 50% { transform:translateY(9px) rotate(1deg); } }
@keyframes lamp { 0%,100% { transform:rotate(-1.6deg); } 50% { transform:rotate(1.6deg); } }
@keyframes cactus { 0%,100% { transform:rotate(-.6deg); } 50% { transform:rotate(.6deg); } }
@keyframes star { 0%,100% { transform:rotate(-3deg); } 50% { transform:rotate(3deg); } }
.paused [data-ornament] { animation-play-state:paused; }
@media (prefers-reduced-motion:reduce) { [data-ornament] { animation:none; } }
`;
const html = `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kolase Rakyat — Preview Gerak</title><style>
*{box-sizing:border-box}body{margin:0;background:#181b17;color:#f4ecd9;font:14px Arial,sans-serif}main{min-height:100svh;display:grid;place-content:center}svg{display:block;width:100vw;height:auto;max-height:calc(100svh - 64px)}footer{display:flex;gap:16px;align-items:center;justify-content:center;min-height:64px;padding:10px}button{font:inherit;color:inherit;background:transparent;border:1px solid #b5b0a1;padding:10px 16px;border-radius:20px;cursor:pointer}button:focus-visible{outline:2px solid white;outline-offset:3px}footer span{color:#b5b0a1}${motion}</style><main>${svg}<footer><button type="button" aria-pressed="false">Jeda gerak</button><span>Preview komposisi · QR lokal</span></footer></main><script>document.querySelector('button').onclick=function(){const paused=document.body.classList.toggle('paused');this.setAttribute('aria-pressed',String(paused));this.textContent=paused?'Lanjutkan gerak':'Jeda gerak';};</script></html>`;
await writeFile(new URL('../docs/previews/kolase-landscape-motion.html',import.meta.url),html);
console.log('Static landscape SVG composed from extracted source assets. QR is loopback preview only.');

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

// Source-image extraction only: no generated or redrawn ornament pixels.
const source = '/Users/aaa/Downloads/cb7ad9f8394355a5fe7ad0728bf3c448.jpg';
const out = new URL('../public/art/kolase-reference/', import.meta.url);
const previews = new URL('../docs/previews/', import.meta.url);
await mkdir(out, { recursive: true });
await mkdir(previews, { recursive: true });
const assets = [
  { name: 'bird', label: 'Burung', box: [520, 0, 216, 190], mode: 'paper' },
  { name: 'hat', label: 'Topi', box: [130, 440, 230, 150], mode: 'paper' },
  { name: 'lantern', label: 'Lampu minyak', box: [12, 630, 202, 290], mode: 'paper' },
  { name: 'cactus', label: 'Kaktus', box: [520, 610, 198, 310], mode: 'paper' },
  { name: 'star-left', label: 'Bintang kiri', box: [0, 422, 139, 160], mode: 'ink' },
  { name: 'star-right', label: 'Bintang kanan', box: [611, 255, 125, 173], mode: 'ink' },
  { name: 'pennants', label: 'Bendera + tali', box: [0, 0, 562, 148], mode: 'ink' },
  { name: 'star-top', label: 'Bintang atas', box: [0, 65, 148, 147], mode: 'ink' },
  { name: 'scrap', label: 'Potongan hitam', box: [224, 158, 43, 52], mode: 'ink' },
  { name: 'green-swatch', label: 'Sampel tekstur hijau', box: [714, 440, 22, 135], mode: 'swatch' },
  { name: 'orange-swatch', label: 'Sampel tekstur jingga', box: [355, 576, 130, 23], mode: 'swatch' },
];

function paperAlpha(data, width, height) {
  // Flood only the exterior up to the off-white paper boundary. This retains
  // enclosed black hatching, unlike removing all dark/non-white pixels.
  const exterior = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  const rawPaper = Uint8Array.from({length:width*height},(_,i) => {
    const r=data[i*3], g=data[i*3+1], b=data[i*3+2];
    return Math.min(r,g,b)>140 && Math.max(r,g,b)-Math.min(r,g,b)<64 ? 1 : 0;
  });
  // Close tiny JPEG breaks in the white paper rim before filling its interior.
  const morph=(input,dilate)=>Uint8Array.from(input,(_,i)=>{const x=i%width,y=Math.floor(i/width);let value=dilate?0:1;for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const xx=Math.max(0,Math.min(width-1,x+dx)),yy=Math.max(0,Math.min(height-1,y+dy));if(dilate)value|=input[yy*width+xx];else value&=input[yy*width+xx];}return value;});
  const closed=morph(morph(rawPaper,true),false);
  const paper = i => closed[i];
  const visit = i => { if (!exterior[i] && !paper(i)) { exterior[i]=1; queue[tail++]=i; } };
  for(let x=0;x<width;x++){visit(x);visit((height-1)*width+x);}
  for(let y=0;y<height;y++){visit(y*width);visit(y*width+width-1);}
  while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);if(x)visit(i-1);if(x<width-1)visit(i+1);if(y)visit(i-width);if(y<height-1)visit(i+width);}
  const alpha = Uint8Array.from(exterior, x=>x?0:255);
  // Discard isolated JPEG flecks; keep only the largest connected cutout.
  const seen=new Uint8Array(alpha.length);let largest=[];
  for(let start=0;start<alpha.length;start++){
    if(!alpha[start]||seen[start])continue;
    const component=[start];seen[start]=1;
    for(let j=0;j<component.length;j++){const i=component[j],x=i%width,y=Math.floor(i/width);for(const n of [x?i-1:-1,x<width-1?i+1:-1,y?i-width:-1,y<height-1?i+width:-1])if(n>=0&&alpha[n]&&!seen[n]){seen[n]=1;component.push(n);}}
    if(component.length>largest.length)largest=component;
  }
  alpha.fill(0);for(const i of largest)alpha[i]=255;
  return alpha;
}

for(const asset of assets){
  const [left,top,width,height]=asset.box;
  const data=await sharp(source).extract({left,top,width,height}).removeAlpha().raw().toBuffer();
  const alpha=asset.mode==='paper'?paperAlpha(data,width,height):asset.mode==='swatch'?new Uint8Array(width*height).fill(255):Uint8Array.from({length:width*height},(_,i)=>{
    const r=data[i*3],g=data[i*3+1],b=data[i*3+2];
    const x=i%width,y=Math.floor(i/width);
    if(asset.name==='pennants' && ((x<190 && y>35+x*.4) || (x>520 && y<65))) return 0;
    return Math.max(r,g,b)<70?Math.round(255*Math.max(0,Math.min(1,(70-Math.max(r,g,b))/25))):0;
  });
  if(asset.mode==='paper')for(let i=0;i<alpha.length;i++){const r=data[i*3],g=data[i*3+1],b=data[i*3+2];if(Math.max(r,g,b)>110 && Math.max(r,g,b)-Math.min(r,g,b)>65)alpha[i]=0;}
  if(asset.mode==='ink'){
    const seen=new Uint8Array(alpha.length);let largest=[];const groups=[];
    for(let start=0;start<alpha.length;start++){if(!alpha[start]||seen[start])continue;const group=[start];seen[start]=1;for(let j=0;j<group.length;j++){const i=group[j],x=i%width,y=Math.floor(i/width);for(const n of [x?i-1:-1,x<width-1?i+1:-1,y?i-width:-1,y<height-1?i+width:-1])if(n>=0&&alpha[n]&&!seen[n]){seen[n]=1;group.push(n);}}groups.push(group);if(group.length>largest.length)largest=group;}
    const keep=new Set(asset.name==='pennants'?groups.filter(g=>g.length>35).flat():largest);
    for(let i=0;i<alpha.length;i++)if(!keep.has(i))alpha[i]=0;
  }
  const rgba=Buffer.alloc(width*height*4);
  for(let i=0;i<alpha.length;i++){rgba[i*4]=data[i*3];rgba[i*4+1]=data[i*3+1];rgba[i*4+2]=data[i*3+2];rgba[i*4+3]=alpha[i];}
  const png=await sharp(rgba,{raw:{width,height,channels:4}}).png().toBuffer();
  await writeFile(new URL(`${asset.name}.png`,out),png);
  asset.data='data:image/png;base64,'+png.toString('base64');
}

const cells=assets.map((a,i)=>{
  const x=24+(i%4)*290,y=98+Math.floor(i/4)*350;
  return `<g><rect x="${x}" y="${y}" width="270" height="300" fill="url(#checks)" rx="8"/><image href="${a.data}" x="${x+15}" y="${y+15}" width="240" height="270" preserveAspectRatio="xMidYMid meet"/><text x="${x}" y="${y+328}" font-size="18">${a.label}</text></g>`;
}).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1180"><defs><pattern id="checks" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#dce1e3"/><path d="M0 0h12v12H0zM12 12h12v12H12z" fill="#c8d0d4"/></pattern></defs><rect width="1200" height="1180" fill="#f8f7f3"/><g font-family="Arial,sans-serif" fill="#202523"><text x="24" y="42" font-size="25" font-weight="bold">Ekstraksi ornamen dari referensi asli</text><text x="24" y="72" font-size="16">Ornamen transparan + sampel tekstur · resolusi mengikuti gambar asli 736 × 920</text>${cells}</g></svg>`;
await sharp(Buffer.from(svg)).png().toFile(new URL('kolase-reference-assets.png',previews).pathname);
await writeFile(new URL('manifest.json',out),JSON.stringify({source,sourceSize:[736,920],method:'source crop; paper-boundary exterior flood or dark-ink matte; no generative redraw',assets:assets.map(({data,...a})=>a)},null,2));
console.log('Extracted 9 source ornaments, 2 texture swatches and contact sheet. Visual edge review required.');

import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
import QRCode from 'qrcode';
const root=new URL('../docs/previews/bengawan/',import.meta.url);
const out=new URL('v2/',root);
await mkdir(new URL('assets/',out),{recursive:true});
const dest=name=>new URL(`assets/${name}.png`,out).pathname;
// A restrained warm paper/charcoal duotone, with deterministic print breakup.
async function printAsset(name,input){
 const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(let p=0;p<data.length;p+=4){
  const l=(data[p]*.2126+data[p+1]*.7152+data[p+2]*.0722)/255;
  const noise=(((p*1664525+1013904223)>>>8)%101/100-.5)*.10;
  const v=Math.max(0,Math.min(1,(l-.18)*1.55+noise));
  const q=Math.round(v*7)/7;
  for(let c=0;c<3;c++) data[p+c]=Math.round([30,31,27][c]+q*([236,226,191][c]-[30,31,27][c]));
 }
 await sharp(data,{raw:info}).png().toFile(dest(name));
}
for(const name of ['boat','pottery','rice','reeds']) await printAsset(name,new URL(`assets/${name}.png`,root).pathname);
const src=new URL('assets/gapura.png',root).pathname;
const meta=await sharp(src).metadata();
const xs=[0,Math.round(meta.width*.229),Math.round(meta.width*.771),meta.width];
const ys=[0,Math.round(meta.height*.255),Math.round(meta.height*.955),meta.height];
const dx=[0,92,602,694],dy=[0,155,835,880];
const pieces=[];
for(let y=0;y<3;y++)for(let x=0;x<3;x++)pieces.push({input:await sharp(src).extract({left:xs[x],top:ys[y],width:xs[x+1]-xs[x],height:ys[y+1]-ys[y]}).resize(dx[x+1]-dx[x],dy[y+1]-dy[y],{fit:'fill'}).png().toBuffer(),left:dx[x],top:dy[y]});
await printAsset('gateway',await sharp({create:{width:694,height:880,channels:4,background:'#00000000'}}).composite(pieces).png().toBuffer());
const C={maroon:'#65132f',red:'#dd442b',orange:'#ee8c23',green:'#8fae36',cream:'#ece2bf',ink:'#242720'};
const rect=(x,y,w,h,fill)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
const ray=(cx,cy,r,color,count=24)=>Array.from({length:count},(_,i)=>{const a=i*Math.PI*2/count,b=a+.07;return `<path d="M${cx} ${cy}L${cx+Math.cos(a)*r} ${cy+Math.sin(a)*r}L${cx+Math.cos(b)*r} ${cy+Math.sin(b)*r}Z" fill="${color}"/>`;}).join('');
const defs=`<defs>
 <pattern id="zig" width="42" height="28" patternUnits="userSpaceOnUse">${rect(0,0,42,28,C.cream)}<path d="M-21 0L0 22 21 0 42 22 63 0" stroke="${C.ink}" stroke-width="8" fill="none"/></pattern>
 <pattern id="weave" width="64" height="64" patternUnits="userSpaceOnUse">${rect(0,0,64,64,C.orange)}<path d="M4 0V28M10 0V28M16 0V28M22 0V28M28 0V28M36 36V64M42 36V64M48 36V64M54 36V64M60 36V64M32 4H64M32 10H64M32 16H64M32 22H64M32 28H64M0 36H28M0 42H28M0 48H28M0 54H28M0 60H28" stroke="${C.red}" stroke-width="3"/></pattern>
 <pattern id="water" width="140" height="28" patternUnits="userSpaceOnUse">${rect(0,0,140,28,C.cream)}<path d="M-70 7Q-35 -10 0 7T70 7T140 7T210 7M-70 21Q-35 4 0 21T70 21T140 21T210 21" stroke="${C.ink}" stroke-width="4" fill="none"/></pattern>
 <pattern id="tri" width="52" height="40" patternUnits="userSpaceOnUse">${rect(0,0,52,40,C.red)}<path d="M4 4L46 20 4 36Z" fill="${C.maroon}"/></pattern>
 <pattern id="brick" width="72" height="36" patternUnits="userSpaceOnUse">${rect(0,0,72,36,C.maroon)}<path d="M0 0H72M0 18H72M36 0V18M0 18V36M72 18V36" stroke="${C.red}" stroke-width="4"/></pattern>
 <filter id="paper"><feTurbulence baseFrequency=".7" numOctaves="3" seed="17"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".13"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter>
 </defs>`;
let b=rect(0,0,1920,1080,C.maroon);
b+=rect(0,0,210,320,C.red)+rect(210,0,48,330,'url(#zig)')+rect(258,0,310,238,C.green)+rect(568,0,190,180,C.orange);
b+=ray(650,110,140,C.maroon,20)+rect(258,238,310,58,'url(#tri)');
b+=rect(0,320,172,250,C.orange)+ray(70,437,160,C.maroon,20)+rect(0,570,580,80,'url(#weave)');
b+=rect(0,650,585,300,'url(#water)')+rect(0,950,264,88,C.green)+rect(264,950,320,88,'url(#tri)');
b+=rect(580,700,120,338,'url(#zig)')+rect(605,0,210,1080,'url(#weave)');
b+=rect(1235,0,165,1080,'url(#brick)')+rect(1400,0,340,300,C.orange)+ray(1570,145,215,C.maroon,28);
b+=rect(1740,0,180,200,C.green)+rect(1740,200,180,100,'url(#zig)')+rect(1370,300,550,55,'url(#tri)');
b+=rect(1820,355,100,465,'url(#weave)')+rect(1320,355,65,465,'url(#zig)');
b+=rect(1320,820,300,218,C.green)+`<svg x="1620" y="820" width="300" height="218" overflow="hidden">${rect(0,0,300,218,C.red)}${ray(180,110,175,C.orange,24)}</svg>`;
b+=`<path d="M725 32L1150 32 1150 74 1285 74 1255 180 1327 230 1290 370 1340 440 1280 660 1320 800 1252 975 1128 1028 795 1015 720 950 675 830 720 710 655 625 700 500 642 390 705 305 660 190Z" fill="${C.maroon}"/>`;
b+=`<path d="M150 300L558 286 607 340 694 367 658 513 555 552 235 578 176 532 116 536 140 437 104 390Z" fill="${C.maroon}"/>`;
b+=rect(0,1038,1920,42,C.cream);
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${defs}<g filter="url(#paper)">${b}</g></svg>`)).png().toFile(dest('background'));
await QRCode.toFile(dest('qr'),'http://127.0.0.1:8787/',{width:300,margin:4,color:{dark:C.ink,light:C.cream}});
const img=(id,x,y,width,height,extra={})=>({id,type:'image',src:`assets/${id}.png`,x,y,width,height,...extra});
const txt=(id,text,x,y,width,height,size,extra={})=>({id,type:'text',text,x,y,width,height,size,color:C.cream,font:'/System/Library/Fonts/Supplemental/Impact.ttf',overflow:'error',...extra});
const regular='/Users/aaa/.local/share/gilvy/src/gilvy/fonts/Poppins-Regular.ttf';
const layers=[img('background',960,540,1920,1080),
 img('reeds',104,175,240,370,{keyframes:{rotation:[[0,-1],[3,1],[6,-1]]}}),
 img('rice',408,130,300,220),img('pottery',1572,157,310,270),
 img('boat',300,780,548,290,{keyframes:{rotation:[[0,-1.2],[3,1.2],[6,-1.2]],x:[[0,292],[3,304],[6,292]],y:[[0,778],[3,784],[6,778]]}}),
 {id:'photo',type:'rect',x:985,y:575,width:512,height:682,fill:'#d6ccb0',radius:0},
 img('gateway',985,520,694,880),
 txt('photo-label','FOTO PESERTA',985,560,450,55,34,{color:C.ink}),
 txt('photo-note','Foto tetap berwarna',985,607,450,40,20,{color:C.ink,font:regular}),
 txt('brand','LOKA PORTRAIT',398,331,430,36,21,{letter_spacing:3,color:C.green}),
 txt('title','BENGAWAN\nPERADABAN',400,424,470,168,67,{line_height:1.03}),
 txt('tag','Jejak sungai, cerita kita.',401,532,460,40,20,{font:regular}),
 txt('name','NAMA PESERTA',985,993,520,45,32),
 txt('join','JADI BAGIAN\nCERITANYA.',1600,420,415,112,42,{line_height:1.03}),
 img('qr',1600,620,256,256),txt('scan','Pindai QR, unggah fotomu.',1600,783,430,35,19,{font:regular}),
 txt('river-tag','SUNGAI\nMENGHIDUPI',1455,917,260,105,35,{color:C.ink,line_height:1.02}),
 txt('heritage','JEJAK\nPERADABAN',1780,930,270,110,35,{line_height:1.02}),
 {id:'river-caption-paper',type:'rect',x:292,y:994,width:438,height:39,fill:C.cream,radius:0},
 txt('bottom-left','BENGAWAN · NADI KEHIDUPAN',292,994,430,35,21,{color:C.ink}),
 txt('footer','TAKALOKA INITIATIVE',960,1059,700,32,20,{color:C.ink,letter_spacing:4})];
await writeFile(new URL('bengawan-v2.json',out),JSON.stringify({style:'product',size:[1920,1080],fps:30,duration:6,samples:1,shutter:0,audio:null,background:{base:C.maroon},layers},null,2));
console.log('Bengawan v2: duotone assets, reframed gateway, irregular patchwork composition.');

import sharp from 'sharp';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import QRCode from 'qrcode';
const out=new URL('../docs/previews/bengawan/',import.meta.url);
await mkdir(new URL('assets/',out),{recursive:true});
const save=async(name,svg)=>sharp(Buffer.from(svg)).png().toFile(new URL(`assets/${name}.png`,out).pathname);
const sheet=await sharp(new URL('objects-source.png',out).pathname).metadata();
const w=Math.floor(sheet.width/2),h=Math.floor(sheet.height/2);
for(const [i,name] of ['boat','pottery','rice','reeds'].entries()){
 const {data,info}=await sharp(new URL('objects-source.png',out).pathname).extract({left:(i%2)*w,top:Math.floor(i/2)*h,width:w,height:h}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 // The explicitly white asset-sheet surface is matted; colored engraving stays intact.
 for(let p=0;p<data.length;p+=4){const min=Math.min(data[p],data[p+1],data[p+2]);data[p+3]=Math.round(255*Math.min(1,Math.max(0,(250-min)/22)));}
 await sharp(data,{raw:info}).trim({background:'#00000000',threshold:5}).png().toFile(new URL(`assets/${name}.png`,out).pathname);
}
await sharp(new URL('gapura-source.png',out).pathname).png().toFile(new URL('assets/gapura.png',out).pathname);
const svg=(body,width=1920,height=1080)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
const defs=`<defs><pattern id="weave" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#e8d9aa"/><path d="M0 0L20 20 40 0M0 12L20 32 40 12M0 24L20 44 40 24" fill="none" stroke="#292c20" stroke-width="6"/></pattern><pattern id="brick" width="80" height="40" patternUnits="userSpaceOnUse"><rect width="80" height="40" fill="#c64b2b"/><path d="M0 0H80M0 20H80M40 0V20M0 20V40M80 20V40" stroke="#e7ad62" stroke-width="2"/></pattern><pattern id="lines" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#d8952e"/><path d="M0 0L40 40M-20 0L20 40M20 0L60 40" stroke="#752039" stroke-width="5"/></pattern><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".10"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter></defs>`;
const panels=`<rect width="1920" height="1080" fill="#681d36"/><rect x="0" y="0" width="290" height="160" fill="#c64b2b"/><rect x="290" y="0" width="310" height="160" fill="#829144"/><rect x="0" y="160" width="54" height="370" fill="url(#weave)"/><rect x="54" y="160" width="546" height="370" fill="#681d36"/><rect x="0" y="530" width="600" height="300" fill="#d8952e"/><rect x="0" y="830" width="600" height="200" fill="#829144"/><rect x="0" y="1030" width="600" height="50" fill="url(#weave)"/><rect x="600" y="0" width="64" height="1080" fill="url(#brick)"/><rect x="1290" y="0" width="60" height="1080" fill="url(#weave)"/><rect x="1350" y="0" width="320" height="180" fill="#c64b2b"/><rect x="1670" y="0" width="250" height="180" fill="#829144"/><rect x="1350" y="180" width="570" height="550" fill="#681d36"/><rect x="1350" y="730" width="420" height="300" fill="#d8952e"/><rect x="1770" y="730" width="150" height="300" fill="url(#lines)"/><rect x="1350" y="1030" width="570" height="50" fill="#c64b2b"/>`;
const rays=Array.from({length:18},(_,i)=>`<path d="M150 90L${150+Math.cos(i*Math.PI/9)*130} ${90+Math.sin(i*Math.PI/9)*130}" stroke="#d8952e" stroke-width="10"/>`).join('');
await save('background',svg(defs+`<g filter="url(#grain)">${panels}<svg width="290" height="160">${rays}</svg></g>`));
const waves=Array.from({length:10},(_,i)=>`<path d="M-40 ${15+i*17} Q70 ${-20+i*17} 180 ${15+i*17} T400 ${15+i*17} T640 ${15+i*17}" fill="none" stroke="#eee0b2" stroke-width="3"/>`).join('');
await save('river',svg(waves,660,190));
await QRCode.toFile(new URL('assets/qr.png',out).pathname,'http://127.0.0.1:8787/',{width:300,margin:4,color:{dark:'#3a2330',light:'#f5ebcb'}});
const image=(id,src,x,y,width,height,extra={})=>({id,type:'image',src:`assets/${src}.png`,x,y,width,height,...extra});
const text=(id,value,x,y,width,height,size,extra={})=>({id,type:'text',text:value,x,y,width,height,size,color:'#f0dfac',font:'/System/Library/Fonts/Supplemental/Impact.ttf',overflow:'error',...extra});
const layers=[
 image('patchwork','background',960,540,1920,1080),
 image('rice','rice',448,90,225,150),
 image('river','river',300,899,660,190,{keyframes:{x:[[0,280],[3,310,'linear'],[6,280,'linear']]}}),
 image('boat','boat',302,682,515,260,{keyframes:{rotation:[[0,-1.2],[3,1.2],[6,-1.2]],y:[[0,677],[3,685],[6,677]],x:[[0,295],[3,308],[6,295]]}}),
 image('pottery','pottery',1557,883,345,270),
 image('reeds','reeds',1795,118,224,232,{keyframes:{rotation:[[0,-1.5],[3,1.5],[6,-1.5]]}}),
 {id:'photo',type:'rect',x:960,y:635,width:438,height:704,fill:'#c7b994',radius:0},
 text('photo-label','FOTO PESERTA',960,617,400,65,34,{color:'#635647'}),
 text('photo-sub','Bingkai gapura bata',960,663,400,45,19,{font:'/Users/aaa/.local/share/gilvy/src/gilvy/fonts/Poppins-Regular.ttf',color:'#635647'}),
 image('gateway','gapura',960,530,800,1000),
 text('brand','LOKA PORTRAIT',325,213,500,45,23,{letter_spacing:3}),
 text('headline','BENGAWAN\nPERADABAN',325,340,520,210,80,{line_height:1.05}),
 text('tagline','Jejak sungai, cerita kita.',325,478,500,40,23,{font:'/Users/aaa/.local/share/gilvy/src/gilvy/fonts/Poppins-Regular.ttf'}),
 text('name','NAMA PESERTA',960,1044,550,52,34),
 text('join','JADI BAGIAN\nCERITANYA.',1625,285,490,120,47,{line_height:1.05}),
 image('qr','qr',1625,489,274,274),
 text('join-help','Pindai QR, unggah fotomu.',1625,666,510,45,22,{font:'/Users/aaa/.local/share/gilvy/src/gilvy/fonts/Poppins-Regular.ttf'}),
 {id:'footer-panel',type:'rect',x:300,y:1055,width:600,height:50,fill:'#681d36',radius:0},
 text('footer','TAKALOKA INITIATIVE',300,1057,540,32,18,{letter_spacing:3}),
 text('river-label','BENGAWAN · NADI KEHIDUPAN',300,991,550,35,20,{letter_spacing:1}),
];
await writeFile(new URL('bengawan-motion.json',out),JSON.stringify({style:'product',size:[1920,1080],fps:30,duration:6,samples:1,shutter:0,audio:null,background:{base:'#681d36'},layers},null,2));
// Image-episode inventory is used only for the collage asset manifest/preflight.
await writeFile(new URL('asset-inventory.json',out),JSON.stringify({name:'bengawan-assets',style:'history-story',audio_mode:'silent',scenes:[{id:'assets',type:'image',composition:'collage',min:6,caption:['Bengawan Peradaban'],camera:{from:{scale:1},to:{scale:1}},layers:['background','gapura','boat','pottery','rice','reeds','river','qr'].map(name=>({id:name,role:name==='background'?'background':'subject',src:`assets/${name}.png`,alpha:['background','qr'].includes(name)?'opaque':'transparent',depth:0,placement:{x:540,y:960,width:name==='background'?1920:800,height:name==='background'?1080:1000},prompt:`Isolated ${name}; authored illustration, not historical evidence.`}))}]}));
console.log('Prepared cropped assets, native landscape composition and Gilvy asset inventory.');

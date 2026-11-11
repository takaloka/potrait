import sharp from 'sharp';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const base=new URL('../docs/previews/bengawan/',import.meta.url);
const out=new URL('v3/',base);
await mkdir(out,{recursive:true});
const spec=JSON.parse(await readFile(new URL('v2/bengawan-v2.json',base),'utf8'));
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
<defs><pattern id="weave" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="32" fill="#d58b32"/><path d="M3 0V13M8 0V13M13 0V13M19 19V32M24 19V32M29 19V32M19 3H32M19 8H32M19 13H32M0 19H13M0 24H13M0 29H13" stroke="#651d32" stroke-width="2"/></pattern></defs>
<rect width="1920" height="1080" fill="#651d32"/>
<rect x="0" y="0" width="1920" height="12" fill="#d58b32"/>
<rect x="0" y="930" width="540" height="150" fill="#7c8e40"/>
<rect x="1380" y="930" width="540" height="150" fill="#c65a32"/>
<rect x="1780" y="930" width="140" height="150" fill="url(#weave)"/>
${Array.from({length:5},(_,i)=>`<path d="M-30 ${958+i*22}Q70 ${930+i*22} 170 ${958+i*22}T370 ${958+i*22}T570 ${958+i*22}" stroke="#e8dcad" stroke-width="2" fill="none" opacity=".65"/>`).join('')}
<path d="M90 580H490M1430 754H1830" stroke="#c69556" stroke-width="1" opacity=".45"/>
</svg>`;
await sharp(Buffer.from(svg)).png().toFile(new URL('background.png',out).pathname);
const keep=['background','rice','boat','pottery','photo','gateway','photo-label','photo-note','brand','title','tag','name','join','qr','scan','footer'];
spec.layers=spec.layers.filter(l=>keep.includes(l.id));
for(const l of spec.layers){
 if(l.src)l.src=new URL(l.src,new URL('v2/',base)).pathname;
 delete l.keyframes;
}
const set=(id,props)=>Object.assign(spec.layers.find(l=>l.id===id),props);
set('background',{src:new URL('background.png',out).pathname});
set('gateway',{x:960,y:503,width:660,height:837});
set('photo',{x:960,y:555,width:487,height:649});
set('photo-label',{x:960,y:540,size:30});
set('photo-note',{x:960,y:584,size:18});
set('brand',{x:300,y:325,width:480,color:'#e9d9af',size:20});
set('title',{x:300,y:433,width:520,height:170,size:66});
set('tag',{x:300,y:550,width:480,size:20});
set('rice',{x:300,y:175,width:175,height:145});
set('boat',{x:294,y:830,width:470,height:249,keyframes:{rotation:[[0,-.6],[3,.6],[6,-.6]],y:[[0,828],[3,832],[6,828]]}});
set('pottery',{x:1600,y:893,width:245,height:213});
set('name',{x:960,y:965,width:540,size:30});
set('join',{x:1615,y:333,width:460,height:100,size:38});
set('qr',{x:1615,y:532,width:272,height:272});
set('scan',{x:1615,y:706,width:470,size:20});
set('footer',{x:960,y:1042,width:700,color:'#e9d9af',size:17,letter_spacing:3});
await writeFile(new URL('bengawan-v3.json',out),JSON.stringify(spec,null,2));
console.log('Built clean v3 proof: maroon field, three ornament groups, two edge motifs.');

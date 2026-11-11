import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
import QRCode from 'qrcode';
const base=new URL('../docs/previews/bengawan/',import.meta.url),out=new URL('v5/',base);
await mkdir(new URL('assets/',out),{recursive:true});
const dst=n=>new URL(`assets/${n}.png`,out).pathname;
const svg=(w,h,body)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`);
const cream='#f3e8cd',red='#862f2b',green='#285744';
await sharp(svg(1920,1080,`<rect width="1920" height="1080" fill="${red}"/><path d="M100 700H470M1440 780H1800" stroke="${cream}" opacity=".25"/>`)).png().toFile(dst('background'));
let holes='';
for(let x=20;x<720;x+=40)holes+=`<circle cx="${x}" cy="0" r="10" fill="black"/><circle cx="${x}" cy="970" r="10" fill="black"/>`;
for(let y=25;y<970;y+=40)holes+=`<circle cx="0" cy="${y}" r="10" fill="black"/><circle cx="720" cy="${y}" r="10" fill="black"/>`;
await sharp(svg(720,970,`<defs><mask id="edge"><rect width="720" height="970" fill="white"/>${holes}</mask></defs><rect width="720" height="970" fill="${cream}" mask="url(#edge)"/>`)).png().toFile(dst('paper'));
const arch=svg(600,735,'<path d="M0 735V300A300 300 0 0 1 600 300V735Z" fill="white"/>');
await sharp(new URL('v4/portrait-example.png',base).pathname).resize(600,735,{fit:'cover',position:'centre'}).composite([{input:arch,blend:'dest-in'}]).png().toFile(dst('photo'));
await sharp(new URL('assets/boat.png',base).pathname).greyscale().png().toFile(dst('boat'));
const gap=new URL('assets/gapura.png',base).pathname,gm=await sharp(gap).metadata();
await sharp(gap).extract({left:Math.round(gm.width*.04),top:0,width:Math.round(gm.width*.92),height:Math.round(gm.height*.255)}).greyscale().png().toFile(dst('brick'));
const rice=new URL('v4/rice-whole.png',base).pathname;
await sharp(rice).greyscale().png().toFile(dst('rice-left'));
await sharp(rice).greyscale().flop().png().toFile(dst('rice-right'));
await sharp(svg(620,70,Array.from({length:3},(_,i)=>`<path d="M0 ${16+i*17}Q75 ${i*17} 150 ${16+i*17}T300 ${16+i*17}T450 ${16+i*17}T620 ${16+i*17}" fill="none" stroke="#878787" stroke-width="2"/>`).join(''))).png().toFile(dst('river'));
await sharp(svg(180,180,`<g fill="none" stroke="${red}" opacity=".7"><circle cx="90" cy="90" r="72" stroke-width="2"/><circle cx="90" cy="90" r="64"/><path d="M36 86H144M36 112H144"/></g><g fill="${red}" font-family="Georgia" text-anchor="middle" opacity=".8"><text x="90" y="72" font-size="19">BENGAWAN</text><text x="90" y="104" font-size="14">JAWA • NUSANTARA</text><text x="90" y="135" font-size="12">KARTU POS</text></g>`)).png().toFile(dst('postmark'));
await QRCode.toFile(dst('qr'),'http://127.0.0.1:8787/',{width:280,margin:4,color:{dark:green,light:cream}});
const image=(id,x,y,width,height,extra={})=>({id,type:'image',src:`assets/${id}.png`,x,y,width,height,...extra});
const text=(id,value,x,y,width,height,size,extra={})=>({id,type:'text',text:value,x,y,width,height,size,font:'/System/Library/Fonts/Supplemental/Georgia.ttf',color:cream,overflow:'error',...extra});
const layers=[image('background',960,540,1920,1080),image('paper',960,540,720,970),image('photo',960,482.5,600,735),
 image('river',960,870,620,70),image('boat',802,839,300,159),image('brick',1150,845,230,94),
 image('rice-left',639,902,145,235),image('rice-right',1281,902,145,235),
 text('brand','LOKA PORTRAIT',290,340,490,35,19,{letter_spacing:3}),
 text('title','Bengawan\nPeradaban',290,461,520,190,61,{line_height:1.1}),
 text('tag','Sepotong cerita\ndari tepian sungai.',290,625,470,75,23,{line_height:1.35,font:'/System/Library/Fonts/Supplemental/Georgia Italic.ttf'}),
 text('name','NAMA PESERTA',935,931,440,45,27,{color:green}),
 text('edition','KENANGAN DARI BENGAWAN',935,974,450,30,12,{color:red,letter_spacing:2}),
 image('postmark',1189,959,125,125,{rotation:-13}),
 text('join','Kirim potretmu,\nsimpan ceritanya.',1610,365,460,100,30,{line_height:1.25}),image('qr',1610,565,258,258),
 text('scan','Pindai untuk ikut berfoto',1610,740,470,40,20),
 text('footer','TAKALOKA INITIATIVE',1610,1000,520,35,15,{letter_spacing:2})];
await writeFile(new URL('bengawan-v5.json',out),JSON.stringify({style:'product',size:[1920,1080],fps:30,duration:6,samples:1,shutter:0,audio:null,background:{base:red},layers},null,2));
console.log('Prepared stamp concept with fictional example portrait; static composition for review.');

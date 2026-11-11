"use client";
import {useEffect,useState} from "react";
import QRCode from "qrcode";
export function JoinQr({url,size=168}:{url:string;size?:number}){const [src,setSrc]=useState("");useEffect(()=>{let active=true;if(!url)return;QRCode.toDataURL(url,{width:size*2,margin:3,errorCorrectionLevel:"M",color:{dark:"#14251d",light:"#ffffff"}}).then(data=>{if(active)setSrc(data)}).catch(()=>{if(active)setSrc("")});return()=>{active=false}},[url,size]);return <div className="join-qr" style={{width:size,height:size}}>{src?<img src={src} width={size} height={size} alt="Pindai kode QR untuk membuka halaman kirim foto"/>:<span aria-live="polite">Menyiapkan QR…</span>}</div>;}

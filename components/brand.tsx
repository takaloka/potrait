"use client";

import { Aperture } from "lucide-react";
import Link from "./document-link";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Loka Portrait, beranda">
      <span className="brand-symbol"><Aperture size={22} strokeWidth={1.8} aria-hidden="true" /></span>
      <span><span className="brand-name">loka<span>portrait</span></span><small>TAKALOKA INITIATIVE</small></span>
    </Link>
  );
}

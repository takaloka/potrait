# Catatan Aset dan Kode Pihak Ketiga

## Gap izin yang harus diselesaikan sebelum distribusi publik

- `public/art/kolase-reference/*`, `public/art/kolase-display/*` dan turunannya di `lib/kolase-source-assets.ts`: potongan referensi visual; bukti izin penggunaan/distribusi belum tersedia dalam proyek. Versi display mengekstrak bytes master yang sama untuk mengurangi ukuran JavaScript, bukan karya baru atau izin baru.
- `public/fonts/nordestino-reconstructed-regular.ttf` dan versi embed: rekonstruksi font referensi; lisensi/izin belum diverifikasi. Nama rekonstruksi tidak memberikan hak penggunaan.
- Preview Bengawan di `docs/previews` adalah eksplorasi desain, bukan tema aplikasi; tidak disertakan dalam arsip source release.

Pemilik perlu menyediakan izin tertulis yang mencakup penggunaan dan distribusi, atau mengganti aset terkait dengan karya orisinal/berlisensi jelas. Perbaikan kode dan hasil tes tidak menutup gap izin tersebut. Jangan menandai aset ini berlisensi hanya karena tersedia di internet.

Lisensi masing-masing aset dan kode tetap berlaku. Dokumen ini tidak memberikan lisensi baru untuk seluruh proyek atau mengganti ketentuan pihak ketiga.

## Font

| File proyek | Asal | Lisensi yang disertakan |
| --- | --- | --- |
| `public/fonts/loka-slab-bold.ttf` | DejaVu Serif Condensed Bold | [DEJAVU-LICENSE.txt](public/fonts/DEJAVU-LICENSE.txt), termasuk ketentuan Bitstream Vera dan perubahan DejaVu. |
| `public/fonts/loka-condensed-bold.otf` | Nimbus Sans Narrow Bold, URW Base35 | [NIMBUS-LICENSE.txt](public/fonts/NIMBUS-LICENSE.txt), AGPL-3 dengan Font exception sebagaimana tertulis dalam berkas tersebut. |

Nama file proyek digunakan untuk pengorganisasian aset. Nama family dalam CSS tidak mengganti lisensi font.

Sumber upstream:

- DejaVu: <https://dejavu-fonts.github.io/>
- URW Base35 / Nimbus: <https://github.com/ArtifexSoftware/urw-base35-fonts>

Pertahankan pemberitahuan hak cipta, teks lisensi, dan keterangan asal ketika membagikan salinan. Font Nimbus tidak dicakup lisensi MIT; periksa ketentuan berkas lisensinya untuk penggunaan atau distribusi lebih lanjut.

## Kode vendored

| File | Pemberitahuan |
| --- | --- |
| `scripts/vite/sites-vite-plugin.ts` | MIT, Copyright 2026 OpenAI. Teks lengkap: [sites-vite-plugin.LICENSE](scripts/vite/sites-vite-plugin.LICENSE). |
| `vendor/shadcn-tailwind-4.13.0.css` | MIT, Copyright 2023 shadcn. Teks lengkap: [shadcn-tailwind-4.13.0.LICENSE.md](vendor/shadcn-tailwind-4.13.0.LICENSE.md). |

Dependensi npm memiliki lisensi masing-masing. Versinya tercatat dalam `package.json` dan `package-lock.json`; pemberitahuan tersedia dalam paket asal setelah instalasi.

## Gambar contoh dan screenshot

- `public/samples/before.jpg` dan `after.jpg` menggambarkan Arga, orang fiktif yang dibuat dengan AI. Proses dan batasnya dicatat di [provenance.json](public/samples/provenance.json).
- `public/samples/persibo-player-v2.png` adalah contoh pemain dari tokoh fiktif yang sama. Catatan: [persibo-player-v2.provenance.json](public/samples/persibo-player-v2.provenance.json).
- Screenshot di `docs/` menunjukkan prototipe dengan contoh fiktif. Contoh ini tidak membuktikan kemampuan menjaga identitas peserta pada integrasi AI langsung.
- Referensi poster pengguna dipakai sebagai arah visual; file referensi asli tidak didistribusikan dalam repository ini.

Nama Persibo digunakan dalam konsep imajinasi suporter. Sampel jersey tidak memuat lambang klub atau sponsor; proyek tidak menyatakan afiliasi maupun dukungan resmi.

## Lisensi proyek

Snapshot ini tidak menambahkan lisensi menyeluruh seperti MIT atau Apache untuk kode dan aset milik proyek. Ketentuan penggunaan lebih lanjut atas bagian milik proyek dapat ditetapkan pemilik secara terpisah. Lisensi pihak ketiga di atas tetap harus dipertahankan.

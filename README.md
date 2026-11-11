# Loka Portrait

Photobooth interaktif Taka Loka Initiative. Peserta memindai QR, memilih tema/gaya, menyetujui pemrosesan foto, lalu mengikuti hasil sampai tampil di layar acara.

**Rotasi default 10 detik.** Foto tetap terlihat sampai pengganti siap dan selesai dimuat. Foto, nama, bingkai dan QR stabil; dekorasi bergerak. Hasil tersimpan dipakai ulang untuk tayangan dan unduhan.

Tema aplikasi: **Jendela Nusantara** dan **Kolase Rakyat**. Bengawan Peradaban masih berupa proof desain terpisah.

## Lihat demonya

- [Halaman peserta](https://loka-portrait-yuda.muhamadyudapradana.chatgpt.site/)
- [Layar acara](https://loka-portrait-yuda.muhamadyudapradana.chatgpt.site/layar)

Tautan demo di atas berasal dari versi historis; perubahan lokal tidak otomatis memperbaruinya. Status terbaru dan batas verifikasi ada di [status rilis](docs/release-status.md).

## Fitur dan status

| Bagian | Status saat snapshot |
| --- | --- |
| Formulir nama dan foto | Consent wajib, normalisasi gambar, kuota acara/jaringan. Contoh nonaktif secara default. |
| Antrean peserta | Tersimpan di database; hasil siap ditayangkan bergantian. |
| Layar acara | QR, satu sesi layar aktif, login operator diperlukan untuk kontrol. |
| Desain | Dua tema dengan gaya potret yang mengikuti pilihan peserta. |
| Unduh poster | PNG dengan nama peserta dan bingkai acara. |
| Operator | Buka/tutup penerimaan, jeda pergantian, dan tindakan antrean. |
| AI untuk foto pribadi | Codex atau BFL sesuai konfigurasi operator; diproses tick mandiri. Demo memakai salinan foto yang dinormalisasi. |
| Contoh pemain Arga | Tokoh fiktif dengan visual yang sudah disiapkan, bukan generasi baru setiap pengiriman. |

Provider diuji dengan fixture; pengujian ini tidak membuktikan kapasitas/biaya produksi. Folder kerja lokal berisi state privat: distribusikan hanya arsip allowlist, bukan ZIP workspace.

**Deployment publik belum diverifikasi.** Hosting/secrets, izin aset, audit dependensi dan uji staging masih harus diselesaikan. [Panduan deployment](docs/deployment.md) adalah panduan operasional terbaru.

## Menjalankan di komputer sendiri

Gunakan **Node.js 22.13.0 atau lebih baru** dan npm. Ambil source melalui GitHub **Code → Download ZIP** atau clone repository, lalu buka terminal di folder proyek.

```bash
npm ci
npm test
npm run build
npm start
```

`npm start` menerapkan seluruh migrasi lokal, menyimpan backup sebelum upgrade, lalu menjalankan Worker dan backend Node. Hentikan server sebelum build ulang; jangan hapus `.wrangler` bila ingin mempertahankan peserta/OAuth.

Buka `http://127.0.0.1:8787`. Buat akun melalui `/operator`; login juga di perangkat layar. Mode demo tidak memerlukan kunci AI.

## Halaman aplikasi

| Route | Kegunaan |
| --- | --- |
| `/` | Mengirim foto dan nama peserta. |
| `/hasil/[id]#access=…` | Status, pratinjau, unduh; tautan lengkap diperlukan bagi peserta. |
| `/layar` | Tampilan monitor/proyektor acara. |
| `/operator` | Pengaturan acara dan antrean. |
| `/privasi` | Pemrosesan, penayangan, retensi dan penghapusan. |

## Teknologi dan susunan kode

React/Vinext dan TypeScript menangani aplikasi. Cloudflare Workers menjalankan server, D1 menyimpan antrean/pengaturan, dan R2 menyimpan foto. Tampilan poster dibuat dengan komponen web; unduhan PNG dirender melalui canvas.

| Folder/file | Isi |
| --- | --- |
| `app/` | Halaman dan endpoint API. |
| `components/` | Formulir, hasil peserta, layar acara, dan operator. |
| `lib/photobooth-server.ts` | Status peserta, antrean, pengaturan, dan sesi layar. |
| `lib/ai-provider.ts` | Adapter AI, dinonaktifkan secara bawaan. |
| `lib/poster-download.ts` | Pembuatan poster PNG. |
| `db/` dan `drizzle/` | Schema dan migrasi database. |
| `public/samples/` | Gambar fiktif dan catatan asal-usulnya. |
| `tests/` | Pemeriksaan kontrak API dan provider. |
| `docs/` | Panduan dan bukti pengujian snapshot. |

## Pemeriksaan kode

Setelah dependensi terpasang:

```bash
npm run typecheck
npm run lint
npm test
```

Pengujian provider memakai respons tiruan; pengujian offline memakai SQLite dan penyimpanan gambar dalam memori. Keduanya tidak memanggil AI berbayar. Catatan pengujian sumber versi 2 ada di [QA versi 2](docs/QA-v2.md). Pada penyiapan snapshot, build dan inisialisasi database lokal juga berhasil; rincian batas pengujian ada di panduan memulai.

## Aset dan lisensi

Font, komponen, serta kode pihak ketiga mengikuti lisensinya masing-masing. Lihat [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Snapshot ini tidak menetapkan lisensi baru untuk seluruh proyek.

Konsep visual merupakan imajinasi suporter. Sampel tidak memakai lambang klub atau sponsor dan tidak menyatakan afiliasi resmi.

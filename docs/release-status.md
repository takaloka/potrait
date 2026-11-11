# Status perbaikan audit — 11 November 2026

**Hardening inti sudah diterapkan dan diuji lokal. Belum GO untuk publish publik.** Hosting/secrets aktual, izin aset dan verifikasi operasional produksi belum tersedia. Tidak ada deployment publik yang dilakukan.

## Temuan audit dan hasil perbaikan

| Temuan | Implementasi / bukti | Status |
|---|---|---|
| R01 akses foto asli/detail | Detail memerlukan capability fragment/header atau operator; original operator-only; expiry media; endpoint pemulihan tautan operator. Regression route aktual. | Terverifikasi pada fixture lokal |
| R02 admission/biaya | Batas atomik event/antrean, batas per IP/jam, retry manual memotong budget, sample nonaktif default. | Terverifikasi lokal; kapasitas event belum diukur |
| R03 driver polling | `processJobs()` dipanggil cron Worker / tick lokal terautentikasi; polling status tidak memanggil provider. D1 CAS/lease, acceptance ambigu tidak diulang otomatis. | Fixture concurrent processing lolos; failover/soak produksi belum diuji |
| R04 distribusi state | Ignore rules, arsip allowlist, backup privat; runtime/DB/OAuth tidak termasuk daftar distribusi. | Kontrol packaging tersedia; jangan ZIP workspace |
| R05 BFL workerd | `redirect:manual`, response 3xx ditolak. Submit/poll/download diuji actual workerd dengan upstream loopback. | Terverifikasi lokal |
| R06 refresh contention | Transient error kembali queued dengan jeda lima detik; tidak gagal permanen. | Terverifikasi lokal |
| R07 kontrol layar | POST screen memerlukan sesi operator; GET publik menyembunyikan lease. UI memberi tautan login. | Route fixture + browser anonymous smoke |
| R08 upload | Stream byte limit, Sharp decode/pixel cap/orientasi/metadata stripping/re-encode, service fail-closed. | Fixture backend Node dan upload lolos |
| R09 deployment/bootstrap | Template D1/R2/assets/cron, operator hash-only bootstrap, migrasi berurutan/backup, panduan deployment. | Build + Wrangler dry-run lolos; resource/HTTPS/secrets dan bootstrap remote belum dijalankan |
| R10 lifecycle/disclosure | Consent wajib, halaman privasi, expiry tujuh hari default untuk data baru, tombstone cleanup/retry, legacy data dipertahankan. | Fixture consent/expiry/storage failure lolos; kebijakan penyedia dan kontak operator tetap harus ditetapkan penyelenggara |
| R11 tests/CI | Harness auth diperbaiki, kontrak rotasi 10 detik diperbarui, `npm test`, workflow CI ditambahkan. | 21/21 suite lokal lolos; workflow remote belum dijalankan |
| R12 provenance | Gap cutout Kolase/font rekonstruksi dicatat eksplisit di notices. | **Belum selesai: perlu bukti izin atau penggantian aset** |

Hasil demo lama yang sebelumnya memakai URL original mendapat salinan result dengan bytes yang sama; tidak digenerasi AI ulang. Akses endpoint original tetap terlindungi. Operator bisa menyalin tautan lengkap untuk peserta lama. Migrasi tidak menghapus peserta/OAuth; perbandingan dengan backup privat mengonfirmasi record dan hasil lama tetap sama sebelum startup worker.

## Verifikasi terakhir

- `npm test`: **21/21 suite PASS**, termasuk 33 assertion hardening, auth, API, BFL/Codex workerd, Sharp, migrasi, slideshow, penghapusan, legacy preservation dan byte-equivalence artwork. Seluruh provider otomatis memakai fixture.
- `npm run typecheck`: PASS.
- `npm run lint`: 0 error, **8 warning** (gambar, navigasi dokumen yang dipakai karena keterbatasan Vinext, unused pada tooling/test historis).
- `npm run build`: PASS. Aset Kolase dikeluarkan dari JavaScript dan memakai URL berbasis hash; bytes/geometry identik dengan master. Chunk `poster-themes`: 1.032.385 → **9.635 byte**; `event-screen`: 1.296.641 → **38.820 byte**. Ini ukuran JS, bukan pengukuran LCP; gambar tetap harus diunduh ketika tema digunakan.
- `wrangler deploy --dry-run --config wrangler.production.jsonc`: PASS konfigurasi/packaging; tidak menerapkan resource atau menghubungi provider AI.
- Fresh D1 terisolasi: `0000` sampai `0006` terpasang dan startup berlanjut; upgrade fixture: data lama/backup/idempotency PASS.
- Browser una: form menampilkan consent wajib; `/privasi` menampilkan retensi 7 hari; `/layar` anonymous menampilkan login operator. Tidak dilakukan upload AI berbayar/browser E2E lengkap pada sesi ini.
- Exporter asli diuji melalui browser una dengan foto fiktif: kedua tema menghasilkan PNG **1200×1500**; Nusantara 3.038.322 byte dan Kolase 2.270.074 byte. Hasil dirender dan diperiksa visual. Aset/font disematkan kembali saat ekspor, tidak hilang setelah dipisahkan dari JS. Bukti `loka-export-proof.png` di folder log lokal.
- Audit dependensi dicoba kembali dengan timeout pendek: tetap timeout. **Tidak ada klaim bebas CVE.**

Log lokal: `/private/var/folders/9k/zgmpxlms40529k533yssmfsh0000gn/T/opencode/loka-hardening-*.log`.

## Sisa pekerjaan / batas rilis

1. Provision domain/HTTPS Node, D1/R2, secrets dan akun staging; uji bootstrap remote, cron, QR ponsel, unduh PNG, restart/load/soak dan restore backup di sana. Tidak bisa dianggap selesai oleh dry-run.
2. Pemilik menyelesaikan izin cutout/font Kolase atau menyetujui aset pengganti. Source archive bukan izin distribusi aset.
3. Selesaikan dependency audit ketika registry dapat dijangkau.
4. P2: layar kini mengambil current/next/last lewat query terbatas + agregasi jumlah; inline artwork sudah dipisahkan. Operator masih memakai pagination client pada antrean event yang dibatasi budget (default 200). Jika menaikkan budget hingga ribuan peserta, pagination server dan pengukuran mobile/load perlu dilakukan sebelum acara tersebut.
5. Bengawan tetap proof, belum tema aplikasi. Scope aplikasi saat ini dua tema; integrasi tema ketiga belum dikerjakan sebagai bagian hardening ini.

Rujukan operasional terbaru: [deployment.md](deployment.md). Audit awal di `qa/2026-11-11-release-audit.md` merupakan bukti kondisi sebelum patch; script reproduksi di sana bukan suite regresi pascaperbaikan.

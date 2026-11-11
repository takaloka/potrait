# Deployment Loka Portrait

Produksi aktif memakai VPS native Node + SQLite di https://potrait.takaloka.in. Lihat [runbook VPS](deployment-vps.md) untuk konfigurasi aktual, operasi, dan rollback. Cloudflare di bawah merupakan target alternatif.

## Local

Node 22.13+ diperlukan. Jalankan `npm ci`, `npm test`, `npm run build`, lalu `npm start`. Server ada di `http://127.0.0.1:8787`. Start menjalankan semua migrasi yang belum ada, backend gambar loopback, dan tick antrean setiap dua detik. Hentikan server sebelum build/migrasi. Migrasi upgrade menyimpan backup privat di `.wrangler/backups`; jangan bagikan folder ini.

Buat akun melalui `/operator` pada localhost. Login operator di perangkat yang membuka `/layar`; cookie berlaku delapan jam. Untuk tautan peserta lama tanpa fragment akses, operator memilih **Salin tautan** pada baris peserta. Foto yang sudah tersimpan tidak digenerasi ulang untuk unduh atau slideshow.

## Cloudflare Workers / staging (alternatif)

1. Buat D1 dan R2 baru di akun Cloudflare. Isi `database_id`, `database_name`, dan `bucket_name` di `wrangler.production.jsonc`. Jangan upload DB/OAuth lokal.
2. Deploy `server/codex-image-backend.mjs` beserta package dependencies pada host Node dengan TLS reverse proxy. Bind Node ke loopback di belakang proxy; atur `CODEX_BACKEND_KEY` acak minimal 32 karakter melalui secret manager. Service harus restart otomatis dan mempunyai batas body/timeout upstream yang sesuai (edit maksimal 180 detik). Endpoint normalisasi juga diperlukan untuk mode BFL/demo.
3. Simpan secret Worker dengan `npx wrangler secret put CODEX_BACKEND_URL --config wrangler.production.jsonc` dan `CODEX_BACKEND_KEY` (nilai kunci sama dengan Node). URL harus HTTPS origin tanpa path. Jangan taruh credential dalam file konfigurasi atau argumen command line.
4. Jalankan `npm run build`, lalu `npx wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc`. Migrasi bersifat additive; backup D1 lewat fasilitas Cloudflare sebelum upgrade.
5. Buat akun operator lokal melalui UI, lalu `node scripts/bootstrap-production.mjs --production`. Script hanya memindahkan salt/hash password operator ke D1 target; tidak menyalin sesi, OAuth, foto, atau peserta. `INSERT OR IGNORE` tidak mengganti akun target yang sudah ada. Gunakan password unik untuk event tersebut.
6. Jalankan `npx wrangler deploy --config wrangler.production.jsonc`. Konfigurasi memakai artefak build tanpa bundling ulang, assets, bindings, observability, dan cron satu menit. Konfigurasi template belum membuktikan deployment produksi berhasil.
7. Login `/operator` di HTTPS staging dan hubungkan Codex di sana. Untuk BFL, simpan `BFL_API_KEY` dengan secret put dan ubah `AI_MODE` ke `live`. Jangan mulai menerima peserta sebelum normalisasi/provider siap.

## Batas operasional

Default: 200 admission/percobaan per database acara, maksimum 30 queued/processing, 20 unggahan per IP per jam, retensi tujuh hari untuk data baru. `EVENT_JOB_LIMIT`, `MAX_QUEUED_JOBS`, `UPLOADS_PER_HOUR`, `RETENTION_DAYS` dapat ditetapkan di vars. Banyak peserta pada Wi-Fi yang sama berbagi IP: sesuaikan berdasarkan kapasitas acara, bukan menghilangkan batas. Penghapusan peserta tidak mengembalikan kuota; retry manual mengonsumsi satu percobaan tambahan. Gunakan database acara baru untuk anggaran baru.

Cron memproses maksimal dua job per tick dengan CAS/lease D1. Request hasil tidak mengirim generasi AI. Penerimaan provider yang tidak diketahui tidak diulang otomatis; operator harus memeriksa sebelum retry karena mungkin tetap ditagih. Jadwal satu menit berarti antrean tidak menjanjikan respons dua detik di produksi. Timeout proses dipulihkan pada tick berikutnya setelah lease kedaluwarsa.

Hasil ditayangkan publik, endpoint result-image dapat diakses pengunjung. Token fragment melindungi detail/status peserta, bukan menjadikan hasil tayangan rahasia. Original memerlukan cookie operator. Persetujuan peserta harus mencerminkan kenyataan ini.

## Pemeriksaan sebelum acara

- Verifikasi TLS, autentikasi backend, cron/tick, login operator di layar, QR melalui ponsel, unggah → hasil → PNG → slideshow.
- Uji restart, provider timeout, refresh contention, Wi-Fi bersama, antrean sesuai kapasitas, dan pemulihan backup di **staging**. Test otomatis memakai fixture, bukan provider berbayar.
- Pantau queue age, kegagalan provider dan `media_cleanup_pending` lewat observability. Pastikan alarm/penanggung jawab operasional; log tidak boleh berisi token/foto.
- Untuk rollback aplikasi, simpan artefak versi sebelumnya; jangan membatalkan migrasi dengan menghapus data. Restore D1/R2 hanya dari backup teruji dan satu titik waktu yang konsisten.
- Selesaikan izin aset di `THIRD_PARTY_NOTICES.md` serta audit dependensi online. Belum ada persetujuan hak aset otomatis dari kode ini.

## Distribusi kode

Gunakan `node scripts/package-source.mjs`, jangan ZIP workspace. Arsip berasal dari allowlist; runtime, DB, OAuth, logs, screenshot QA dan preview tidak disertakan. Izin aset tetap perlu diselesaikan sebelum distribusi publik. Jangan masukkan backup ke repository.

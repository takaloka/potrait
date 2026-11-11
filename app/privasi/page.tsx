import { env } from "cloudflare:workers";
import Link from "@/components/document-link";

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const value = Number((env as unknown as { RETENTION_DAYS?: string }).RETENTION_DAYS);
  const days = Number.isInteger(value) && value > 0 && value <= 90 ? value : 7;
  return (
    <main style={{ maxWidth: 720, margin: "48px auto", padding: 24 }}>
      <h1>Foto dan privasi peserta</h1>
      <p>Foto dan nama digunakan untuk membuat potret AI, menyediakan unduhan, dan menayangkan hasil di layar acara. Foto dikirim ke penyedia AI yang diaktifkan operator (OpenAI/Codex atau BFL); hasil AI dapat berbeda dari wajah asli.</p>
      <p>Foto asli hanya tersedia untuk operator. Hasil yang ditayangkan dapat dilihat dan disimpan pengunjung. Tautan hasil lengkap memberikan akses ke status dan unduhan—jangan membagikannya jika ingin tetap pribadi.</p>
      <p>Unggahan baru disimpan paling lama {days} hari di aplikasi, kemudian akses ditutup dan berkas dihapus oleh proses latar belakang. Ketentuan retensi penyedia AI mengikuti layanan penyedia. Salinan yang sudah diunduh pengunjung tidak dapat ditarik kembali.</p>
      <p>Untuk penghapusan lebih awal atau masalah foto, hubungi operator di lokasi acara dan tunjukkan tautan hasil. Operator dapat melewati tayangan dan menghapus foto. Data sebelum pembaruan kebijakan ini ditinjau operator, bukan dihapus otomatis tanpa pemberitahuan.</p>
      <p>Gunakan foto milik sendiri atau yang sudah mendapatkan izin. Untuk anak, minta persetujuan orang tua/wali.</p>
      <Link href="/">Kembali ke formulir</Link>
    </main>
  );
}

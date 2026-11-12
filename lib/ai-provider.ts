/**
 * Server-only BFL adapter. No request is made unless AI_MODE=live and a key exists.
 * Protocol verified against https://api.bfl.ai/openapi.json (10 Nov 2026) and
 * https://help.bfl.ai/articles/8446125349-quickstart-guide.
 * Generation costs and portrait fidelity must be measured before event use.
 */
import type { PortraitStyle } from "./photobooth-types";

export interface AiEnvironment {
  AI_MODE?: string;
  BFL_API_KEY?: string;
  BFL_MODEL?: string;
}

export interface AiConfig {
  mode: "demo" | "live";
  configured: boolean;
  apiKey: string;
  model: "flux-2-pro" | "flux-kontext-pro";
}

export class AiProviderError extends Error {
  constructor(message: string, public readonly transient = false) {
    super(message);
    this.name = "AiProviderError";
  }
}

export function getAiConfig(environment: AiEnvironment): AiConfig {
  const apiKey = environment.BFL_API_KEY?.trim() ?? "";
  return {
    mode: environment.AI_MODE === "live" ? "live" : "demo",
    configured: apiKey.length > 0,
    apiKey,
    model: environment.BFL_MODEL === "flux-kontext-pro" ? "flux-kontext-pro" : "flux-2-pro",
  };
}

function allowedBflUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !(url.hostname === "bfl.ai" || url.hostname.endsWith(".bfl.ai"))) {
    throw new AiProviderError("Alamat hasil AI tidak dikenali. Hubungi operator.");
  }
  return url;
}

function base64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  return btoa(chunks.join(""));
}

export function portraitPrompt(style: PortraitStyle | "legacy" = "legacy", theme?: string): string {
  const legacyPrompt = [
    "Edit the provided portrait into an expressive vintage-inspired football player portrait for the fan-made concept Pemain Inti Persibo Bojonegoro Masa Depan.",
    "Preserve the same person's recognizable facial features, natural skin tone, hairstyle, head covering if present, and age appearance.",
    "Change their clothing to a modest orange football jersey with black collar and sleeve accents, with no badges, brand marks or sponsor logos.",
    "One person only, waist-up portrait, proud and expressive celebratory pose, both arms naturally posed and both real hands visible with anatomically correct fingers.",
    "Keep the face and hands photorealistic and sharply recognizable, with warm nostalgic sports photography lighting, restrained film grain, and a simple warm off-white background for poster compositing.",
    "This is an imagined future-player fan concept; do not imply official team membership, selection, sponsorship or endorsement.",
    "Do not add words, logos, lettering, watermarks, extra people, extra limbs or extra fingers. Do not remove a head covering or change facial identity.",
  ].join(" ");
  const outfits: Record<PortraitStyle, string> = {
    batik: "Dress the person in a relaxed Indonesian batik shirt with a modest collar, natural cotton fabric and expressive earthy orange, olive and cream batik motifs. No formal beskap, waistcoat or necktie.",
    "kebaya-kasual": "Dress the person in a simple casual Indonesian kebaya, fully opaque inner lining, light cotton fabric and understated embroidery in warm terracotta or cream, paired with a batik kain. Modest relaxed styling, not ceremonial or formal bridal clothing.",
    "retro-festival": "Dress the person in a relaxed retro festival shirt with a modest open collar over an opaque inner shirt, playful vintage botanical or geometric print in mustard, olive and rust. No suit, necktie, costume props or added headgear.",
    beskap: "Dress the person in an elegant dark Javanese beskap with a high closed collar, subtle woven fabric and traditional front buttons, with a batik kain visible at the lap. No business tie, no kebaya, no headgear added.",
    kebaya: "Dress the person in a modest classic Indonesian kebaya with a fully opaque inner lining, delicate embroidery and a batik kain visible at the lap. Preserve any existing hijab or other head covering, covering the neck and chest appropriately; never remove it or invent exposed hair beneath it.",
    jas: "Dress the person in a tailored early twentieth-century dark formal suit with a waistcoat, ivory shirt and restrained classic necktie. Natural woven wool texture, elegant vintage tailoring. No beskap, no kebaya, no headgear added.",
  };
  if (style !== "legacy" && !Object.hasOwn(outfits, style)) throw new AiProviderError("Gaya potret tidak dikenal.");
  if (style === "batik" || style === "kebaya-kasual" || style === "retro-festival") return [
    "Transform the single person in the uploaded photograph into a photorealistic Indonesian folk-festival portrait for Kolase Rakyat. Use the upload as the identity reference, not the clothing or pose template.",
    "Preserve the person's recognizable facial features, facial proportions, apparent age, natural skin tone and texture, hairstyle, expression and identity-defining eyeglasses. Never replace the face with a generic model, beautify or de-age it.",
    outfits[style],
    "Follow the selected clothing regardless of gender. Preserve any existing hijab or religious head covering and its modest coverage; never remove it, expose hair beneath it or add one that is absent.",
    "One person only, standing in a relaxed, lively three-quarter pose facing the camera, shoulders at ease, hands naturally visible near the waist with anatomically correct fingers. Frame from above the head to mid-thigh, keeping head, shoulders and hands inside the frame. No formal seated studio pose or ornate chair.",
    "Warm full-color analog festival photography, soft natural daylight, restrained fine printed-paper grain and an uncluttered warm cream backdrop. Keep facial detail sharp and photorealistic; no sepia monochrome, woodcut illustration, heavy halftone over the face or plastic skin.",
    "Blend face, neck, hair and clothing seamlessly with consistent light and natural body proportions. No pasted-on face, extra people, extra limbs or fingers. No words, logos, watermark, decorative frame or collage ornaments; the application adds those separately.",
  ].join(" ");
  const prompt = style === "legacy" ? legacyPrompt : [
    "Transform the single person in the supplied ordinary photograph into a photorealistic vintage Indonesian studio portrait. Use the uploaded photograph as the identity reference, not as a pose or clothing template.",
    "Preserve the person's recognizable facial features, facial proportions, apparent age, natural skin texture, hairstyle, eyeglasses if present, and expression. Do not replace the face with a generic face, beautify, de-age or change identity.",
    outfits[style],
    "Use the selected outfit exactly; do not choose clothing by guessing the person's gender. Preserve any religious head covering and do not introduce one that is absent.",
    "One person only, seated naturally at a slight three-quarter angle on a dark carved wooden chair, face toward camera, relaxed shoulders, hands resting naturally together at the lap with anatomically correct fingers. Frame from above the head through the lap, keeping the head, shoulders and hands fully visible.",
    "Blend the jaw, neck, hair, skin and clothing seamlessly, with consistent lighting and believable body proportions. No pasted-on head, abrupt skin-tone boundaries or extra limbs. Remove watches and other contemporary accessories except identity-defining eyeglasses.",
    "Restrained warm sepia silver-gelatin photographic treatment, fine subtle film grain, soft directional studio lighting, a simple warm taupe painted backdrop and natural realistic facial detail. No heavy scratches, damage or artificial plastic skin.",
    "No words, logos, watermarks, decorative frame, flowers or poster graphics; those are composed by the application separately.",
  ].join(" ");
  return theme === "bojonegoro-doelo" ? prompt.replace("dark carved wooden chair", "plain uncarved wooden studio chair") + " This is Bojonegoro Doelo: an understated early twentieth-century Javanese studio photograph, not a decorative poster. Use a plain softly lit taupe backdrop, restrained faded warm tones and no scene ornaments. Keep face, shoulders and hands centered within the middle 55 percent of the image width so a tall portrait display can crop the sides. Preserve the subject's identity, ancestry and natural skin tone; change only styling, clothing and lighting." : prompt;
}

export async function submitAiPortrait(config: AiConfig, photo: Uint8Array, style: PortraitStyle | "legacy" = "legacy", theme?: string): Promise<{ id: string; pollingUrl: string }> {
  if (config.mode !== "live" || !config.configured) throw new AiProviderError("AI belum terhubung. Operator perlu mengatur akses API sebelum mode AI digunakan.");
  const prompt = portraitPrompt(style, theme);
  const vintage = style !== "legacy";
  const body = config.model === "flux-kontext-pro"
    ? { prompt, input_image: base64(photo), aspect_ratio: vintage ? "4:5" : "3:4", output_format: "jpeg", safety_tolerance: 2, prompt_upsampling: false }
    : { prompt, input_image: base64(photo), width: 768, height: vintage ? 960 : 1024, output_format: "jpeg", safety_tolerance: 2 };
  let response: Response;
  try {
    response = await fetch(`https://api.bfl.ai/v1/${config.model}`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-key": config.apiKey, Accept: "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(25000), redirect: "manual",
    });
  } catch {
    // Never automatically resubmit a request with an uncertain acceptance state.
    throw new AiProviderError("Status permintaan AI belum terkonfirmasi. Operator perlu memeriksa layanan sebelum mencoba ulang.");
  }
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? "Akses AI belum valid. Operator perlu memeriksa kunci API."
      : response.status === 402 ? "Saldo layanan AI tidak mencukupi. Hubungi operator."
      : response.status === 429 ? "Layanan AI sedang penuh. Coba lagi setelah beberapa saat."
      : "Layanan AI belum dapat menerima foto ini. Coba foto lain atau hubungi operator.";
    throw new AiProviderError(message);
  }
  const data = await response.json() as { id?: unknown; polling_url?: unknown };
  if (typeof data.id !== "string" || typeof data.polling_url !== "string") {
    throw new AiProviderError("Layanan AI mengirim jawaban yang belum lengkap. Hubungi operator.");
  }
  allowedBflUrl(data.polling_url);
  return { id: data.id, pollingUrl: data.polling_url };
}

export type AiPollResult = { status: "pending" } | { status: "ready"; bytes: Uint8Array; contentType: string };

export async function pollAiPortrait(pollingUrl: string): Promise<AiPollResult> {
  const url = allowedBflUrl(pollingUrl);
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(12000) });
  } catch {
    throw new AiProviderError("Koneksi ke layanan AI terputus sementara.", true);
  }
  if (response.status === 429 || response.status >= 500) throw new AiProviderError("Layanan AI sedang sibuk.", true);
  if (!response.ok) throw new AiProviderError("Status hasil AI tidak dapat ditemukan. Hubungi operator.");
  const data = await response.json() as { status?: string; result?: { sample?: unknown } };
  if (["Pending", "Reasoning", "Generating"].includes(data.status ?? "")) return { status: "pending" };
  if (data.status === "Request Moderated" || data.status === "Content Moderated") {
    throw new AiProviderError("Foto tidak dapat diproses oleh layanan AI. Gunakan foto diri lain yang sesuai.");
  }
  if (data.status !== "Ready" || typeof data.result?.sample !== "string") {
    throw new AiProviderError("AI belum berhasil membuat potret. Coba foto lain atau hubungi operator.");
  }
  const resultUrl = allowedBflUrl(data.result.sample);
  const image = await fetch(resultUrl, { redirect: "manual", signal: AbortSignal.timeout(20000) });
  if (!image.ok) throw new AiProviderError("Gambar hasil AI belum dapat diambil.", true);
  const expected = Number(image.headers.get("content-length") ?? 0);
  if (expected > 12 * 1024 * 1024) throw new AiProviderError("Ukuran hasil AI melebihi batas prototipe.");
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (bytes.length > 12 * 1024 * 1024 || bytes.length < 16) throw new AiProviderError("Berkas hasil AI tidak valid.");
  return { status: "ready", bytes, contentType: image.headers.get("content-type")?.split(";")[0] ?? "image/jpeg" };
}

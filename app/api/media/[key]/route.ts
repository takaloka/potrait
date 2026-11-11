import { apiError, getMedia } from "@/lib/photobooth-server";
import { requireOperator } from "@/lib/operator-auth";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  try { const { key } = await context.params; if (key.includes("-original.")) await requireOperator(request); return await getMedia(key); } catch (error) { return apiError(error); }
}

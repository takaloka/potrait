import { apiError, assertSameOrigin, jsonResponse, readJson, updateSettings } from "@/lib/photobooth-server";
import { requireOperator } from "@/lib/operator-auth";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request) {
  try { await requireOperator(request); assertSameOrigin(request); return jsonResponse(await updateSettings(await readJson(request))); } catch (error) { return apiError(error); }
}

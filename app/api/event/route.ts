import { apiError, getEventConfig, jsonResponse } from "@/lib/photobooth-server";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return jsonResponse(await getEventConfig()); } catch (error) { return apiError(error); }
}

import { apiError, getState, jsonResponse } from "@/lib/photobooth-server";
import { requireOperator } from "@/lib/operator-auth";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { await requireOperator(request); return jsonResponse(await getState()); } catch (error) { return apiError(error); }
}

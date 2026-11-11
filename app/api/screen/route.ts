import { actOnScreen, apiError, assertSameOrigin, getState, jsonResponse, readJson, screenPresentation } from "@/lib/photobooth-server";
import { requireOperator } from "@/lib/operator-auth";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return jsonResponse(screenPresentation(await getState(false,true))); } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    await requireOperator(request);
    assertSameOrigin(request);
    const payload = await readJson(request);
    return jsonResponse(screenPresentation(await actOnScreen(payload,true), payload.sessionId));
  } catch (error) { return apiError(error); }
}

import { apiError, assertSameOrigin, chatgptConnection, jsonResponse, readJson } from "@/lib/photobooth-server";
import { requireOperator } from "@/lib/operator-auth";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { await requireOperator(request); return jsonResponse(await chatgptConnection().status()); } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    await requireOperator(request);
    assertSameOrigin(request);
    const { action } = await readJson(request);
    if (action === "connect") return jsonResponse(await chatgptConnection().beginCodex());
    if (action === "poll") return jsonResponse(await chatgptConnection().pollCodex());
    if (action === "cancel") return jsonResponse(await chatgptConnection().cancelCodex());
    if (action === "check") return jsonResponse(await chatgptConnection().check());
    if (action === "probe-image") return jsonResponse(await chatgptConnection().probeImageAccess());
    if (action === "disconnect") return jsonResponse(await chatgptConnection().disconnect());
    return jsonResponse({ error: "Tindakan tidak dikenal." }, 400);
  } catch (error) { return apiError(error); }
}

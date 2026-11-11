import { actOnJob, apiError, assertSameOrigin, jsonResponse, readJson } from "@/lib/photobooth-server";
import { requireOperator } from "@/lib/operator-auth";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireOperator(request);
    assertSameOrigin(request);
    const { id } = await context.params;
    const payload = await readJson(request);
    return jsonResponse({ job: await actOnJob(id, payload.action) });
  } catch (error) { return apiError(error); }
}

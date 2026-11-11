import { apiError, assertSameOrigin, authorizeJob, deleteJob, getJob, jsonResponse } from "@/lib/photobooth-server";
import { operatorSignedIn, requireOperator } from "@/lib/operator-auth";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; if (!await operatorSignedIn(request)) await authorizeJob(request,id); return jsonResponse(await getJob(id)); } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireOperator(request);
    assertSameOrigin(request);
    const { id } = await context.params;
    return jsonResponse(await deleteJob(id));
  } catch (error) { return apiError(error); }
}

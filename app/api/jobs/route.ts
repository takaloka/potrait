import { apiError, createJob, jsonResponse, participantToken } from "@/lib/photobooth-server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try { const job = await createJob(request); return jsonResponse({ job, accessToken: await participantToken(job.id) }, 201); } catch (error) { return apiError(error); }
}

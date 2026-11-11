import { authStatus, signIn, signOut } from "@/lib/operator-auth";
import { apiError, jsonResponse } from "@/lib/photobooth-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return jsonResponse(await authStatus(request)); } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try { const response = jsonResponse({ authenticated: true }); response.headers.set("Set-Cookie", await signIn(request)); return response; } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request) {
  try { const response = jsonResponse({ authenticated: false }); response.headers.set("Set-Cookie", await signOut(request)); return response; } catch (error) { return apiError(error); }
}

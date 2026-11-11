import { env } from "cloudflare:workers";
import { apiError, jsonResponse, processJobs } from "@/lib/photobooth-server";
export async function POST(request: Request) {
  const key=(env as unknown as {CODEX_BACKEND_KEY?:string}).CODEX_BACKEND_KEY;
  const supplied=request.headers.get("authorization") ?? "";
  const expected=`Bearer ${key}`;
  let diff=supplied.length^expected.length;
  for(let i=0;i<expected.length;i++) diff|=(supplied.charCodeAt(i)||0)^expected.charCodeAt(i);
  if(!key || diff) return jsonResponse({error:"Worker authentication required"},401);
  try { await processJobs(); return jsonResponse({ok:true}); } catch(error){return apiError(error);}
}

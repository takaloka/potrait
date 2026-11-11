import { chatgptConnection } from "@/lib/photobooth-server";
import { ChatgptError } from "@/lib/chatgpt-connection";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookie = request.headers.get("cookie")?.split(";").map(item => item.trim()).find(item => item.startsWith("loka_chatgpt_oauth="))?.slice("loka_chatgpt_oauth=".length) ?? "";
  let status = "connected";
  let reason = "";
  try {
    await chatgptConnection().complete(url, cookie);
    try { await chatgptConnection().check(); } catch { status = "check-needed"; }
  } catch (error) {
    status = "failed";
    // ChatgptError messages are application-authored; never expose raw provider
    // error_description, token responses, callback URLs or unexpected exceptions.
    reason = error instanceof ChatgptError ? error.message : "Callback ChatGPT gagal diproses. Periksa log server.";
    console.warn("ChatGPT callback failed", error instanceof ChatgptError ? error.message : "Unexpected callback error");
  }
  const params = new URLSearchParams({ chatgpt: status });
  if (reason) params.set("reason", reason);
  return new Response(null, { status: 303, headers: {
    Location: `/operator?${params}`,
    "Set-Cookie": `loka_chatgpt_oauth=; Path=/auth/callback; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol === "https:" ? "; Secure" : ""}`,
    "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
  } });
}

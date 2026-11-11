import {apiError, assertSameOrigin, jsonResponse, participantToken} from "@/lib/photobooth-server";
import {requireOperator} from "@/lib/operator-auth";
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  try {
    await requireOperator(request); assertSameOrigin(request);
    const {id}=await context.params;
    return jsonResponse({accessToken:await participantToken(id)});
  } catch(error){return apiError(error);}
}

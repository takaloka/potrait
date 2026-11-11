import ParticipantResult from "@/components/participant-result";
import { getJobTheme } from "@/lib/photobooth-server";
export const metadata={title:"Potretmu — Loka Portrait"};
export const dynamic = "force-dynamic";
export default async function ResultPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const initialTheme = await getJobTheme(id).catch(() => null);
  return <ParticipantResult key={id} id={id} initialTheme={initialTheme}/>;
}

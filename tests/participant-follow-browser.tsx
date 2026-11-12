import React from 'react';
import {createRoot} from 'react-dom/client';
import ParticipantForm from '../components/participant-form';
import '../app/globals.css';
import '../app/workspace.css';
let uploads=0;
Object.assign(window,{followProof:()=>({uploads})});
window.fetch=async input=>{
  if(String(input)==='/api/jobs') { uploads++; return Response.json({error:'Fixture: upload received; no generation performed.'},{status:503}); }
  return Response.json({settings:{accepting:true,themePolicy:{enabled:['bojonegoro-doelo'],defaultTheme:'bojonegoro-doelo'}},mode:'demo',aiConfigured:true});
};
createRoot(document.getElementById('root')!).render(<ParticipantForm />);

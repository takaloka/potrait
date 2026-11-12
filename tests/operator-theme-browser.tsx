import React from 'react';
import {createRoot} from 'react-dom/client';
import OperatorConsole from '../components/operator-console';
import '../app/globals.css';
import '../app/workspace.css';

const state = {settings:{accepting:true,paused:false,eventName:'Fixture',theme:'Loka Studio',durationSeconds:10,themePolicy:{enabled:['bojonegoro-doelo'],defaultTheme:'bojonegoro-doelo'}},jobs:[],mode:'demo',aiConfigured:false,screen:{connected:false}};
let saves = 0;
Object.assign(window,{themeProof:()=>({saves,policy:state.settings.themePolicy}),failThemeSave:false});
window.fetch = async (input, init) => {
  if (String(input) === '/api/settings') {
    if ((window as unknown as {failThemeSave:boolean}).failThemeSave) return Response.json({error:'Uji koneksi gagal. Coba lagi.'},{status:503});
    saves++; Object.assign(state.settings,JSON.parse(String(init?.body))); return Response.json(state);
  }
  if (String(input) === '/api/state') return Response.json(state);
  return Response.json({configured:false,connected:false});
};
createRoot(document.getElementById('root')!).render(<OperatorConsole />);

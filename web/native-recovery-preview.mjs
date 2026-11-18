// Read-only: native committed history is authoritative; never fall back to a mirror.
export function readNativeRecoveryRoot(bridge){
 const unavailable=()=>{throw Error('Current saved history could not be read. Keep a private export; recovery inspection has not changed it.');};
 if(typeof bridge?.workspaceState!=='function')return unavailable();
 let envelope,root;try{
  envelope=JSON.parse(bridge.workspaceState());
  if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||envelope.unavailable||typeof envelope.state!=='string'||!envelope.state)return unavailable();
  root=JSON.parse(envelope.state,(_key,value)=>{if(typeof value==='number'&&!Number.isFinite(value))return unavailable();return value;});
 }catch{return unavailable();}
 const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
 if(!plain(root)||!Array.isArray(root.events)||!Array.isArray(root.recent)||root.recent.some(value=>typeof value!=='string')||!plain(root.settings)||root.events.some(event=>!plain(event)||typeof event.id!=='string'||!event.id)||new Set(root.events.map(event=>event.id)).size!==root.events.length)return unavailable();
 return {encoded:envelope.state,root};
}

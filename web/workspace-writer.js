/* One browser writer for the current synchronous workspace. No polling or stealing. */
(function(root){
 'use strict';
 root.WorkspaceWriter=function({acquired,changed}){
  let mode='waiting',generation=0,controller=null,release=null;
  const notify=value=>{mode=value;changed(value);};
  function stop(){generation++;controller?.abort();release?.();controller=null;release=null;notify('waiting');}
  function start(){
   const current=++generation;controller=new AbortController();notify('waiting');
   if(!navigator.locks?.request){notify('unavailable');return;}
   try{
    navigator.locks.request('stock-assistant-workspace-writer',{mode:'exclusive',signal:controller.signal},async()=>{
     if(current!==generation)return;
     const held=new Promise(resolve=>{release=resolve;});
     try{acquired();notify('owned');await held;}
     catch{if(current===generation)notify('unreadable');}
     finally{if(current===generation){release=null;if(mode==='owned')notify('waiting');}}
    }).catch(()=>{if(current===generation)notify('unavailable');});
   }catch{notify('unavailable');}
  }
  root.addEventListener('pagehide',stop);
  root.addEventListener('pageshow',event=>{if(event.persisted)start();});
  start();
  return {writable:()=>mode==='owned',mode:()=>mode,stale:()=>notify('stale')};
 };
})(window);

(function(root){
 'use strict';
 class WriteError extends Error{constructor(code,message){super(message);this.code=code;}}
 const stale=()=>new WriteError('stale','Saved history changed. Refresh saved history, then retry. Your draft has not been saved.');
 root.NativeWorkspaceWriter=function({bridge,expected}){
  let snapshot=expected,blocked=false;
  if(typeof bridge?.compareWorkspace!=='function'||typeof bridge?.workspaceState!=='function'||expected!==null&&typeof expected!=='string')throw new WriteError('bridge','Safe native saving is unavailable. Keep a private backup.');
  function save(encoded){
   if(blocked)throw stale();
   if(typeof encoded!=='string'||!encoded)throw new WriteError('schema','This change could not be encoded safely.');
   let result;try{result=bridge.compareWorkspace(snapshot??'',encoded);}catch{throw new WriteError('storage','Storage is unavailable. This change has not been saved.');}
   if(result===0){blocked=true;throw stale();}
   if(result!==1)throw new WriteError('storage','Storage is full or unavailable. This change has not been saved.');
   snapshot=encoded;return true;
  }
  function adopt(encoded){
   let current;try{const result=JSON.parse(bridge.workspaceState());if(result?.unavailable||typeof result?.state!=='string')throw Error();current=result.state;}catch{throw new WriteError('storage','Saved history could not be read. Keep a private backup.');}
   if(typeof encoded!=='string'||current!==encoded){blocked=true;throw stale();}
   snapshot=encoded;blocked=false;return true;
  }
  return {save,adopt,stale:()=>blocked};
 };
})(typeof globalThis!=='undefined'?globalThis:this);

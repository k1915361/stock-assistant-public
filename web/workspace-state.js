'use strict';
// Saved workspace: loading, saving and the commit path for events, recent searches and settings. The state is held by one store. Read it through `state`; change it only with workspace.setState.
const workspace = StoreCore.createStore({events:[], recent:[], settings:{}});
// `state` reads the current workspace. A write to it throws, so a change that skips workspace.setState fails loudly.
Object.defineProperty(window, 'state', {get: () => workspace.getState(), set() { throw Error('Change the workspace with workspace.setState.'); }, configurable: true});
let unreadableState=null,stateReadFailed=false,expectedBrowserState=null,expectedNativeState=null,nativeWriter=null,workspaceRootReady=!!native,workspaceCommitBusy=false,workspaceRootFailure='';
function decodeWorkspace(encoded){
 const stored=JSON.parse(encoded===null?'{}':encoded);
 if(!stored||typeof stored!=='object'||Array.isArray(stored)||stored.events!==undefined&&(!Array.isArray(stored.events)||stored.events.some(e=>!e||typeof e!=='object'))||stored.recent!==undefined&&(!Array.isArray(stored.recent)||stored.recent.some(q=>typeof q!=='string'))||stored.settings!==undefined&&(!stored.settings||typeof stored.settings!=='object'||Array.isArray(stored.settings))||stored.retailerCache!==undefined&&(!Array.isArray(stored.retailerCache)||stored.retailerCache.some(e=>!e||typeof e!=='object')))throw Error('Invalid saved workspace');
 return {events:[],recent:[],settings:{},...stored};
}
try {
  const committed=native?.workspaceState?JSON.parse(native.workspaceState()):null;
  if(committed?.unavailable)throw Error('Saved workspace unavailable');
  if(native)expectedNativeState=committed?.state??null;
  unreadableState=committed?.state!==null&&committed?.state!==undefined?committed.state:localStorage.getItem('stock-pilot-v1');expectedBrowserState=unreadableState;
  workspace.setState(decodeWorkspace(unreadableState));unreadableState=null;
}catch {stateReadFailed=true;$('status').textContent='Saved data could not be read. Writes are paused to protect it. Export a recovery backup in Settings.';}
workspace.setState(current=>({...current,settings:WorkflowCore.settings(current.settings)}));
document.documentElement.dataset.highContrast=state.settings.highContrastBorders?'true':'false';
if(native&&!stateReadFailed)try{nativeWriter=NativeWorkspaceWriter({bridge:native,expected:expectedNativeState});}catch{stateReadFailed=true;$('status').textContent='Safe native saving is unavailable. Keep a private backup.';}
function nativeSaveError(message){
 $('status').textContent=message;
 if(overlayOpen()){let warning=$('workspace-save-error');if(!warning){warning=document.createElement('p');warning.id='workspace-save-error';warning.setAttribute('role','alert');overlayContent().append(warning);}warning.textContent=message;
  if(nativeWriter?.stale()&&!$('reload-native-workspace')){const button=document.createElement('button');button.id='reload-native-workspace';button.textContent='Refresh saved history';button.onclick=()=>window.reloadNativeWorkspace();overlayContent().append(button);}
 }
}
window.reloadNativeWorkspace=async()=>{
 try{if(!native||!nativeWriter)throw Error('Safe native refresh is unavailable. Keep a private backup.');const result=JSON.parse(native.workspaceState());if(result.unavailable||typeof result.state!=='string')throw Error('Saved history could not be read. Keep a private backup.');const latest=decodeWorkspace(result.state);latest.settings=WorkflowCore.settings(latest.settings);nativeWriter.adopt(result.state);workspace.setState(latest);unreadableState=null;stateReadFailed=false;try{localStorage.setItem('stock-pilot-v1',result.state);}catch{}let message='Saved history refreshed. Your open draft is kept; retry saving.';if(baseCatalogue)try{await loadLocal();}catch{message='Saved history refreshed. Some plan data could not load; your draft is kept.';}if(nativeWriter.stale())throw Error('Saved history changed during refresh. Your draft is kept; refresh again before saving.');$('status').textContent=message;if($('workspace-save-error'))$('workspace-save-error').textContent=message;if($('reload-native-workspace'))$('reload-native-workspace').remove();return true;}
 catch(error){nativeSaveError(error.message);return false;}
};
function refreshBrowserWorkspace(){
  const encoded=localStorage.getItem('stock-pilot-v1');
  try{const latest=decodeWorkspace(encoded);latest.settings=WorkflowCore.settings(latest.settings);workspace.setState(latest);expectedBrowserState=encoded;unreadableState=null;stateReadFailed=false;}
  catch(error){stateReadFailed=true;unreadableState=encoded;throw error;}
}
const browserWriter=native?null:window.WorkspaceWriter?.({
 acquired:refreshBrowserWorkspace,
 changed(mode){
  const notice=$('workspace-status');if(!notice)return;
  notice.hidden=mode==='owned';
  notice.textContent=mode==='waiting'?'Another Stock Assistant window may be open. Close it to save changes here. Searches still work.':mode==='stale'?'Saved data changed outside this window. Reload before saving; export a backup if needed.':mode==='unreadable'?'Saved data could not be read. Writes are paused; export a recovery backup in Settings.':mode==='unavailable'?'Safe saving is unavailable in this browser. Use a current browser over HTTPS. Searches and backup export still work.':'';
  if(mode==='owned'){workspaceRootReady=false;if(window.LocalPlatform&&baseCatalogue)loadLocal().catch(()=>{$('status').textContent='Workspace recovery is waiting. Existing data is retained.';});}
 }
});
if(!native)window.addEventListener('storage',change=>{
 if(change.key!==null&&change.key!=='stock-pilot-v1')return;
 if(browserWriter?.writable()){
  if(localStorage.getItem('stock-pilot-v1')!==expectedBrowserState)browserWriter.stale();
 }else if(browserWriter?.mode()==='waiting'){
  try{refreshBrowserWorkspace();if(window.LocalPlatform&&baseCatalogue)loadLocal().catch(()=>{});}catch{$('workspace-status').textContent='Saved data could not be read. Writes are paused; export a recovery backup in Settings.';}
 }
});
function save() {
  if(stateReadFailed){$('status').textContent='Saved data could not be read. Writes are paused to protect it. Export a recovery backup in Settings.';return false;}
  if(!native&&!browserWriter?.writable()){
   const notice=$('workspace-status'),reason=notice?.textContent||'Safe saving is unavailable. Reload in a current browser.';
   if(overlayOpen()){
    let warning=$('workspace-save-error');if(!warning){warning=document.createElement('p');warning.id='workspace-save-error';warning.className='muted';warning.setAttribute('role','alert');overlayContent().append(warning);}
    warning.textContent='This change has not been saved. '+reason;
   }else if(!notice||notice.hidden)$('status').textContent=reason;
   return false;
  }
  if(!native&&(!workspaceRootReady||workspaceCommitBusy)){$('status').textContent=workspaceRootFailure||'Workspace recovery or an update is still saving. This change has not been saved; retry shortly.';return false;}
  const encoded=JSON.stringify(state);
  if(native?.saveWorkspace){
    try{if(!nativeWriter)throw Error('Safe native saving is unavailable. Keep a private backup.');nativeWriter.save(encoded);}catch(error){nativeSaveError(error.message);return false;}
    // Native committed state is authoritative. Retain a compatibility mirror;
    // a mirror quota failure must not undo an already durable native save.
    try{localStorage.setItem('stock-pilot-v1',encoded);}catch{}return true;
  }
  try{
   // Detect non-cooperating older app versions or external storage changes.
   if(localStorage.getItem('stock-pilot-v1')!==expectedBrowserState){browserWriter.stale();$('status').textContent=$('workspace-status').textContent;return false;}
   localStorage.setItem('stock-pilot-v1',encoded);expectedBrowserState=encoded;return true;
  }catch{$('status').textContent='Storage is full or unavailable. This change has not been saved. Export a backup before continuing.';return false;}
}
// Platform commit seam; no enrollment or sending. Only the owned browser can
// commit a root, and ordinary synchronous saves cannot interrupt its transaction.
window.workspaceRootAccess={
 owned:()=>!native&&browserWriter?.writable()&&workspaceRootReady&&!stateReadFailed,
 pause(recovery=false){if(recovery&&!native&&!browserWriter?.writable())return ()=>{};if(native||!browserWriter?.writable()||stateReadFailed&&!recovery)throw Error('Workspace saving unavailable');if(workspaceCommitBusy)return null;workspaceCommitBusy=true;return ()=>{workspaceCommitBusy=false;};},
 apply(encoded,before){
  const latest=decodeWorkspace(encoded);latest.settings=WorkflowCore.settings(latest.settings);if(native){if(!nativeWriter)throw Error('Safe native saving is unavailable');nativeWriter.adopt(encoded);}workspace.setState(latest);expectedBrowserState=before;unreadableState=null;stateReadFailed=false;
  if(native)try{localStorage.setItem('stock-pilot-v1',encoded);}catch{}
  if(browserWriter?.writable())try{localStorage.setItem('stock-pilot-v1',encoded);expectedBrowserState=encoded;}catch{/* Journal stays authoritative; a later ordinary save may repair the mirror. */}
 }
};
function currentWorkspace(){const value=typeof window.currentWorkspaceContext==='function'?window.currentWorkspaceContext():null;return value==null?null:CaptureCore.identity(value);}
function visibleEvents(){try{return CaptureCore.visible(state.events,currentWorkspace());}catch{return [];}}
function sameProductCode(left,right){return !!left&&!!right&&StockCore.canonical(left)===StockCore.canonical(right);}
window.visibleWorkspaceEvents=visibleEvents;
function event(data) {const previous = workspace.getState();let workspaceContext;try{workspaceContext=Object.hasOwn(data,'workspaceContext')?data.workspaceContext:data.photoInfo?.captureScope?CaptureCore.identity(data.photoInfo.captureScope):currentWorkspace();if(workspaceContext!==null&&workspaceContext!==undefined)workspaceContext=CaptureCore.identity(workspaceContext);}catch{$('status').textContent='Original workspace could not be read. This change has not been saved.';return false;}workspace.setState(StockCore.appendEvent(previous, {id:crypto.randomUUID(), at:new Date().toISOString(), worker:'Me', ...data,...(workspaceContext?{workspaceContext}:{})})); if (!save()) {workspace.setState(previous); return false;} return true;}
window.saveShelfBatch=(draft,labels)=>{
 try{
  if(JSON.stringify(draft.workspaceContext)!==JSON.stringify(currentWorkspace()))throw Error('Original workspace changed.');
  const batchId=draft.batchId||draft.id;
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(draft.id)||!/^[a-zA-Z0-9_-]{1,80}$/.test(batchId)||!labels.length||labels.length>64||ShelfCore.symbols(labels.map(l=>({text:l.barcode,box:l.box}))).length!==labels.length)throw Error('Invalid shelf labels.');
  if(visibleEvents().some(e=>e.id===batchId&&e.kind==='shelf-photo'))return true;
  const previous=workspace.getState(),at=new Date().toISOString(),photo='local-photo:'+draft.id,thumbnail='local-thumb:'+draft.id,owned=draft.workspaceContext?{workspaceContext:draft.workspaceContext}:{};
  const entries=[{id:batchId,at,kind:'shelf-photo',labels,width:draft.width,height:draft.height,photo,thumbnail,source:'image-import',capturedAt:null,...owned}];
  const existing=ProductCore.records(visibleEvents());
  for(const label of labels){const key=StockCore.canonical(label.barcode),old=existing.find(p=>StockCore.canonical(p.barcode)===key);entries.push({id:batchId+'-label-'+key,at,kind:'shelf-label',product:label.barcode,productName:label.name,box:label.box,batchId,photo,thumbnail,...owned},{...old,id:batchId+'-product-'+key,at,kind:'product',barcode:label.barcode,product:label.barcode,name:label.name,productName:label.name,nameSource:label.nameSource,nameDocuments:label.nameDocuments,price:label.price,currency:old?.currency||label.currency,description:old?.description||label.description,rawText:old?.rawText||label.rawText,labelPhoto:photo,labelEvent:batchId+'-label-'+key,source:'shelf-label',...owned});}
  workspace.setState({...previous,events:ProductCore.merge(previous.events,entries)});if(!save()){workspace.setState(previous);return false;}return true;
 }catch(error){$('status').textContent=error.message;return false;}
};
function updateSettings(changes){const previous=workspace.getState();workspace.setState({...previous,settings:{...previous.settings,...changes}});if(save())return true;workspace.setState(previous);return false;}

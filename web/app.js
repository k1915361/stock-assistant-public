'use strict';
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const native = window.Native || null;
let catalogue, baseCatalogue, documents, currentProduct, lastMatches = [], renderCounter = 0, timer = null, placementIndex=0, appHistoryReady=false, appHistoryMaxIndex=0, shownQuery='', pendingLookup=null, catalogueLoading=false;
let state = {events:[], recent:[], settings:{}};
const initialWelcomeHTML=$('results').innerHTML;
// The query last shown, not the box: a draft typed but not searched must not become a history entry.
// Internal pages (app:...) use one container. Dialogs remain only for the menu, confirms and photo viewing.
let currentPageRoute=null,currentPageOptions=null,pageReturn=false;
const DIALOG_VARIANTS=['menu-popup','confirm','viewer'];
// Pages Back can rebuild from their address. Pages that need an item or plan return to the screen beneath them instead.
const restorePages={'app:history':options=>openRecent(options),'app:urls':options=>openUrlsPage(options),'app:pins':options=>window.openPinnedLookups(options),'app:shortcuts':options=>openShortcutSheet(options),'app:plans':options=>showStoredPlans(options),'app:presets':options=>window.openWorkflowPresets(options),'app:restored-data':options=>restoredDataStatus(options),'app:account':options=>AccountUI.open(options),'app:scan-photo':options=>ImageTest.open(options),'app:shelf-labels':options=>ShelfLabels.open(options)};
function pageOpen(){return !!currentPageRoute;}
function settingsOpen(){return document.body.classList.contains('settings-open');}
function overlayOpen(){return $('modal').open||pageOpen()||settingsOpen();}
function overlayContent(){return pageOpen()?$('page-content'):settingsOpen()?$('settings-content'):$('modal-content');}
function overlayMessage(text){
  if(!overlayOpen()){$('status').textContent=text;return;}
  const content=overlayContent();
  let node=content.querySelector('[data-overlay-message]');
  if(!node){node=document.createElement('p');node.className='overlay-message';node.dataset.overlayMessage='';node.setAttribute('role','status');content.prepend(node);}
  node.textContent=text;
}
// Runs the page's onClose once, then empties it. Plan previews are released with the page.
function clearPageContent(){
  const onClose=currentPageOptions?.onClose;currentPageOptions=null;
  if(onClose)onClose();
  const content=$('page-content');
  for(const view of planViews.keys())if(content.contains(view))releasePlanView(view);
  content.replaceChildren();
}
// Shows an app: address in the page container. A new address adds one history entry, so Back returns to the screen beneath it. A refresh of the same address, or a restored entry, adds none.
function openPage(url,html,options={}){
  const route=AppUI.resolve(url);
  if(!route)throw Error('Unknown app address: '+url);
  if($('modal').open)$('modal').close();
  if(!options.keepRecovery)window.LocalPlatform?.cancelRestoreRecovery?.();
  pauseTimer();
  // The control that opened the first page gets focus back when the stack closes, so keyboard users are not dropped at the top.
  const wasOpen=pageOpen(),sameRoute=wasOpen&&currentPageRoute===route.url,opener=wasOpen?currentPageOptions?.opener:document.activeElement;
  if(wasOpen)clearPageContent();
  currentPageRoute=route.url;currentPageOptions={onClose:options.onClose||null,opener};
  $('page-title').textContent=options.title||route.title;
  $('page-address').textContent=route.url;
  $('page-content').innerHTML=html;
  $('page-back').onclick=()=>window.stockAssistantBack();
  $('app-page').hidden=false;window.scrollTo(0,0);
  document.body.classList.add('page-open');
  if(!options.restoring&&!sameRoute){if(options.replace&&wasOpen)refreshAppSnapshot();else recordAppScreen(route.url);}
  AppUI.hydrateIcons($('app-page'));resolvePhotos();
  $('page-title').focus({preventScroll:true});
  return $('page-content');
}
// Removes the page without moving through history, for a screen that replaces it in place.
function hidePage({resume=true}={}){
  if(!pageOpen())return;
  const opener=currentPageOptions?.opener;
  clearPageContent();currentPageRoute=null;
  $('app-page').hidden=true;document.body.classList.remove('page-open');
  window.LocalPlatform?.cancelRestoreRecovery?.();
  if(resume)resumeTimer();
  if(opener?.isConnected)opener.focus({preventScroll:true});
}
// Back leaves a page through history, so the screen beneath it is shown again. The promise resolves once the page has gone.
let leavingPage=null;
function closeOverlay(){
  if(!pageOpen())return Promise.resolve(false);
  if(history.state?.stockAssistant&&Number(history.state.index)>0&&history.length>1){
    pageReturn=true;
    return new Promise(resolve=>{
      leavingPage=resolve;history.back();
      // If the browser never reports the move, close the page anyway so Back cannot stall.
      setTimeout(()=>{if(leavingPage===resolve){leavingPage=null;pageReturn=false;hidePage();resolve(false);}},600);
    });
  }
  hidePage();return Promise.resolve(true);
}
// Leaves an open dialog or page before another screen starts. Await it before anything that adds a history entry.
function leaveOverlay(){if($('modal').open){$('modal').close();return Promise.resolve(true);}return closeOverlay();}
// A search shows its results on the main screen, so an open page, Settings or What’s new is closed first and the results replace it.
function leaveScreensForSearch(){if(pageOpen())hidePage({resume:false});if(settingsOpen())leaveSettingsPage();if(document.body.classList.contains('whats-new-open'))leaveWhatsNewPage();}
const routeOpeners={'app:history':()=>openRecent(),'app:urls':()=>openUrlsPage(),'app:settings':()=>openSettings(),'app:whats-new':()=>showWhatsNew(),'app:pins':()=>window.openPinnedLookups(),'app:presets':()=>window.openWorkflowPresets(),'app:plans':()=>showStoredPlans(),'app:restored-data':()=>restoredDataStatus(),'app:shortcuts':()=>openShortcutSheet(),'app:account':()=>AccountUI.open(),'app:scan-photo':()=>ImageTest.open(),'app:shelf-labels':()=>ShelfLabels.open(),'app:store-prices':()=>window.RetailerUI?.settings(),'app:last-seen-map':()=>LocationMap.open(visibleEvents())};
// Chrome-style app: addresses. Routes without an opener need an item or plan, so they explain how to reach them.
function openRoute(address){
  const route=AppUI.resolve(address);
  if(!route){overlayMessage('Unknown address. Try app:history, app:settings or app:urls.');return false;}
  const opener=routeOpeners[route.url];
  if(!opener){overlayMessage(route.title+' opens from an item or another screen. Search for the item first.');return false;}
  opener();return true;
}
function renderAppRouteSuggestions(list,query){
  const routes=AppUI.routes.filter(route=>route.url.startsWith(query.toLowerCase())&&routeOpeners[route.url]);
  list.innerHTML=routes.map(route=>`<button type="button" role="option" class="search-suggestion" data-app-route="${escapeHTML(route.url)}" data-icon="link"><strong>${escapeHTML(route.title)}</strong><span>${escapeHTML(route.url)} · ${escapeHTML(route.summary)}</span></button>`).join('')||'<p class="muted search-empty">No app address starts with this text. Try app:history or app:urls.</p>';
  list.querySelectorAll('[data-app-route]').forEach(button=>button.onclick=()=>{hideSearchAssist();openRoute(button.dataset.appRoute);});
}
function openUrlsPage(options={}){
  openPage('app:urls',`<p class="muted">Every address this app can open, like Chrome's internal pages. Type one in the search box to open it.</p><div class="url-list">${AppUI.routes.map(route=>`<article class="card url-row"><strong>${escapeHTML(route.title)}</strong><code class="code">${escapeHTML(route.url)}</code><p class="muted">${escapeHTML(route.summary)}</p>${routeOpeners[route.url]?`<button type="button" data-open-route="${escapeHTML(route.url)}" data-icon="link">Open ${escapeHTML(route.title)}</button>`:'<p class="muted">Opens from an item or another screen.</p>'}</article>`).join('')}</div>`,options);
  $('page-content').querySelectorAll('[data-open-route]').forEach(button=>button.onclick=()=>openRoute(button.dataset.openRoute));
}
// Hydrates icons on buttons that any screen adds later, from the one icon registry in app-ui.js.
if(document.body)AppUI.hydrateIcons(document.body);
if(typeof MutationObserver==='function'&&document.body)new MutationObserver(()=>AppUI.hydrateIcons(document.body)).observe(document.body,{childList:true,subtree:true});
function visibleScreen(){return {query:shownQuery,selectedBarcode:currentProduct?.barcode||'',placementIndex,scrollY:window.scrollY,page:pageOpen()&&restorePages[currentPageRoute]?currentPageRoute:document.body.classList.contains('whats-new-open')?'whats-new':document.body.classList.contains('settings-open')?'settings':'main'};}
function canGoBack(){return !!(history.state?.stockAssistant&&Number(history.state.index)>0);}
function updateAppBack(){const button=$('app-back'),enabled=canGoBack();button.hidden=!enabled;button.disabled=!enabled;}
function canGoForward(){return !!(history.state?.stockAssistant&&Number(history.state.index)<appHistoryMaxIndex);}
// While the page is still blank, refresh=false keeps the entry's saved screen. refresh=true records the screen now shown.
function initializeAppHistory(refresh=false){const current=history.state?.stockAssistant?history.state:null,index=current?Number(current.index)||0:0,snapshot=current?.snapshot&&!refresh?current.snapshot:visibleScreen();appHistoryMaxIndex=Math.max(index,Number(current?.maxIndex)||0);history.replaceState({stockAssistant:true,index,maxIndex:appHistoryMaxIndex,snapshot},'',location.href);appHistoryReady=true;updateAppBack();}
function recordAppScreen(route=''){if(!appHistoryReady)initializeAppHistory();const index=history.state?.stockAssistant?Number(history.state.index||0)+1:1;appHistoryMaxIndex=index;history.pushState({stockAssistant:true,index,maxIndex:index,snapshot:visibleScreen(),route},'','#stock-'+index+'-'+Date.now());updateAppBack();}
function restoreAppScreen(snapshot){if(!snapshot)return;const returning=pageReturn;pageReturn=false;hidePage({resume:false});if(snapshot.page==='settings'){document.body.classList.remove('whats-new-open');$('whats-new-screen').hidden=true;document.body.classList.add('settings-open');$('settings-screen').hidden=false;updateAppBack();return;}if(snapshot.page==='whats-new'){document.body.classList.remove('settings-open');$('settings-screen').hidden=true;document.body.classList.add('whats-new-open');$('whats-new-screen').hidden=false;renderWhatsNew();updateAppBack();return;}leaveWhatsNewPage();leaveSettingsPage();if(restorePages[snapshot.page]){restorePages[snapshot.page]({restoring:true});updateAppBack();return;}if(returning&&snapshot.page==='main'){resumeTimer();updateAppBack();return;}const query=String(snapshot.query||'');if(query)lookup(query,false,true,true);else{document.body.classList.remove('has-results');currentProduct=null;lastMatches=[];placementIndex=0;$('query').value='';shownQuery='';$('results').innerHTML=initialWelcomeHTML;$('status').textContent='';const previous=state;state={...state,lastQuery:''};if(!save())state=previous;}if(snapshot.selectedBarcode){const selected=StockCore.group(lastMatches).find(group=>group.barcode===snapshot.selectedBarcode);if(selected){showProduct(selected);if(Number.isInteger(snapshot.placementIndex)&&snapshot.placementIndex>0&&snapshot.placementIndex<currentProduct.placements.length){placementIndex=snapshot.placementIndex;showPlacement();}}}window.requestAnimationFrame(()=>window.scrollTo(0,Math.max(0,Number(snapshot.scrollY)||0)));updateAppBack();}
function refreshAppSnapshot(){if(history.state?.stockAssistant)history.replaceState({...history.state,snapshot:visibleScreen()},'',location.href);}
// Runs once the catalogue and saved state are ready. A search typed before the catalogue loaded runs now; otherwise the last search is restored unless a screen already shows.
function startupScreen(){const waiting=pendingLookup;pendingLookup=null;if(waiting)lookup(waiting.query,waiting.scanned,waiting.refresh,waiting.restoring);else if(state.lastQuery&&!document.body.classList.contains('has-results'))lookup(state.lastQuery,false,true,true);initializeAppHistory(true);}
window.addEventListener('popstate',event=>{if(event.state?.stockAssistant){appHistoryMaxIndex=Math.max(appHistoryMaxIndex,Number(event.state.maxIndex)||0);history.replaceState({...event.state,maxIndex:appHistoryMaxIndex},'',location.href);if(!pageReturn)cancelTimer();restoreAppScreen(event.state.snapshot);if(leavingPage){const done=leavingPage;leavingPage=null;done(true);}}updateAppBack();});
window.stockAssistantBack=()=>{if($('modal')?.open){$('modal').close();return true;}if(pageOpen()){closeOverlay();return true;}if(document.body.classList.contains('settings-open')||document.body.classList.contains('whats-new-open')){if(history.state?.stockAssistant&&Number(history.state.index)>0&&history.length>1)history.back();else{leaveWhatsNewPage();leaveSettingsPage();}return true;}if(history.state?.stockAssistant&&Number(history.state.index)>0&&history.length>1){cancelTimer();history.back();return true;}return false;};
document.addEventListener('click',event=>{if(event.target.closest('#app-back'))window.stockAssistantBack();const example=event.target.closest('[data-query]');if(example)lookup(example.dataset.query);});
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
  state=decodeWorkspace(unreadableState);unreadableState=null;
}catch {stateReadFailed=true;$('status').textContent='Saved data could not be read. Writes are paused to protect it. Export a recovery backup in Settings.';}
state.settings=WorkflowCore.settings(state.settings);
document.documentElement.dataset.highContrast=state.settings.highContrastBorders?'true':'false';
if(native&&!stateReadFailed)try{nativeWriter=NativeWorkspaceWriter({bridge:native,expected:expectedNativeState});}catch{stateReadFailed=true;$('status').textContent='Safe native saving is unavailable. Keep a private backup.';}
function nativeSaveError(message){
 $('status').textContent=message;
 if(overlayOpen()){let warning=$('workspace-save-error');if(!warning){warning=document.createElement('p');warning.id='workspace-save-error';warning.setAttribute('role','alert');overlayContent().append(warning);}warning.textContent=message;
  if(nativeWriter?.stale()&&!$('reload-native-workspace')){const button=document.createElement('button');button.id='reload-native-workspace';button.textContent='Refresh saved history';button.onclick=()=>window.reloadNativeWorkspace();overlayContent().append(button);}
 }
}
window.reloadNativeWorkspace=async()=>{
 try{if(!native||!nativeWriter)throw Error('Safe native refresh is unavailable. Keep a private backup.');const result=JSON.parse(native.workspaceState());if(result.unavailable||typeof result.state!=='string')throw Error('Saved history could not be read. Keep a private backup.');const latest=decodeWorkspace(result.state);latest.settings=WorkflowCore.settings(latest.settings);nativeWriter.adopt(result.state);state=latest;unreadableState=null;stateReadFailed=false;try{localStorage.setItem('stock-pilot-v1',result.state);}catch{}let message='Saved history refreshed. Your open draft is kept; retry saving.';if(baseCatalogue)try{await loadLocal();}catch{message='Saved history refreshed. Some plan data could not load; your draft is kept.';}if(nativeWriter.stale())throw Error('Saved history changed during refresh. Your draft is kept; refresh again before saving.');$('status').textContent=message;if($('workspace-save-error'))$('workspace-save-error').textContent=message;if($('reload-native-workspace'))$('reload-native-workspace').remove();return true;}
 catch(error){nativeSaveError(error.message);return false;}
};
function refreshBrowserWorkspace(){
  const encoded=localStorage.getItem('stock-pilot-v1');
  try{const latest=decodeWorkspace(encoded);latest.settings=WorkflowCore.settings(latest.settings);state=latest;expectedBrowserState=encoded;unreadableState=null;stateReadFailed=false;}
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
  const latest=decodeWorkspace(encoded);latest.settings=WorkflowCore.settings(latest.settings);if(native){if(!nativeWriter)throw Error('Safe native saving is unavailable');nativeWriter.adopt(encoded);}state=latest;expectedBrowserState=before;unreadableState=null;stateReadFailed=false;
  if(native)try{localStorage.setItem('stock-pilot-v1',encoded);}catch{}
  if(browserWriter?.writable())try{localStorage.setItem('stock-pilot-v1',encoded);expectedBrowserState=encoded;}catch{/* Journal stays authoritative; a later ordinary save may repair the mirror. */}
 }
};
function currentWorkspace(){const value=typeof window.currentWorkspaceContext==='function'?window.currentWorkspaceContext():null;return value==null?null:CaptureCore.identity(value);}
function visibleEvents(){try{return CaptureCore.visible(state.events,currentWorkspace());}catch{return [];}}
function sameProductCode(left,right){return !!left&&!!right&&StockCore.canonical(left)===StockCore.canonical(right);}
window.visibleWorkspaceEvents=visibleEvents;
function event(data) {const previous = state;let workspaceContext;try{workspaceContext=Object.hasOwn(data,'workspaceContext')?data.workspaceContext:data.photoInfo?.captureScope?CaptureCore.identity(data.photoInfo.captureScope):currentWorkspace();if(workspaceContext!==null&&workspaceContext!==undefined)workspaceContext=CaptureCore.identity(workspaceContext);}catch{$('status').textContent='Original workspace could not be read. This change has not been saved.';return false;}state = StockCore.appendEvent(state, {id:crypto.randomUUID(), at:new Date().toISOString(), worker:'Me', ...data,...(workspaceContext?{workspaceContext}:{})}); if (!save()) {state = previous; return false;} return true;}
window.saveShelfBatch=(draft,labels)=>{
 try{
  if(JSON.stringify(draft.workspaceContext)!==JSON.stringify(currentWorkspace()))throw Error('Original workspace changed.');
  const batchId=draft.batchId||draft.id;
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(draft.id)||!/^[a-zA-Z0-9_-]{1,80}$/.test(batchId)||!labels.length||labels.length>64||ShelfCore.symbols(labels.map(l=>({text:l.barcode,box:l.box}))).length!==labels.length)throw Error('Invalid shelf labels.');
  if(visibleEvents().some(e=>e.id===batchId&&e.kind==='shelf-photo'))return true;
  const previous=state,at=new Date().toISOString(),photo='local-photo:'+draft.id,thumbnail='local-thumb:'+draft.id,owned=draft.workspaceContext?{workspaceContext:draft.workspaceContext}:{};
  const entries=[{id:batchId,at,kind:'shelf-photo',labels,width:draft.width,height:draft.height,photo,thumbnail,source:'image-import',capturedAt:null,...owned}];
  const existing=ProductCore.records(visibleEvents());
  for(const label of labels){const key=StockCore.canonical(label.barcode),old=existing.find(p=>StockCore.canonical(p.barcode)===key);entries.push({id:batchId+'-label-'+key,at,kind:'shelf-label',product:label.barcode,productName:label.name,box:label.box,batchId,photo,thumbnail,...owned},{...old,id:batchId+'-product-'+key,at,kind:'product',barcode:label.barcode,product:label.barcode,name:label.name,productName:label.name,nameSource:label.nameSource,nameDocuments:label.nameDocuments,price:label.price,currency:old?.currency||label.currency,description:old?.description||label.description,rawText:old?.rawText||label.rawText,labelPhoto:photo,labelEvent:batchId+'-label-'+key,source:'shelf-label',...owned});}
  state={...state,events:ProductCore.merge(state.events,entries)};if(!save()){state=previous;return false;}return true;
 }catch(error){$('status').textContent=error.message;return false;}
};
function updateSettings(changes){const previous=state.settings;state.settings={...previous,...changes};if(save())return true;state.settings=previous;return false;}
function date(value) {return new Date(value).toLocaleString('en-GB', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
function locationSummary(p){return [p.fixture,p.bay,p.position&&p.position.length<=3?'Position '+p.position:''].filter(Boolean).join(' · ');}
function placementHeading(p,doc,product){const title=String(p.heading||p.title||'').trim(),normal=value=>String(value||'').toLocaleLowerCase('en-GB').replace(/[^\p{L}\p{N}]+/gu,' ').trim(),location=normal([p.bay,p.fixture].filter(Boolean).join(' ')),item=normal(product?.name),cleanTitle=title&&normal(title)!==item&&!(location&&normal(title).includes(location)&&item&&normal(title).includes(item));return [p.season,cleanTitle?title:WorkflowCore.planSourceName(doc?.name)].filter(Boolean).join(' · ');}
function placementChoiceLabel(p){
  const doc=documents.get(p.doc);
  const source=WorkflowCore.planSourceName(doc?.name,p.heading||p.title||'Unnamed plan');
  const page=p.diagramPage||p.page;
  return [p.season,source,locationSummary(p),page?'PDF '+page:''].filter(Boolean).join(' · ');
}
const planViews=new Map();
function releasePlanView(view){const entry=planViews.get(view);if(entry){URL.revokeObjectURL(entry.url);planViews.delete(view);}}
function releaseDetachedPlanViews(){for(const [view,entry] of planViews)if(!entry.pending&&!view.isConnected)releasePlanView(view);}
if(typeof MutationObserver==='function'&&document.body)new MutationObserver(releaseDetachedPlanViews).observe(document.body,{childList:true,subtree:true});
function browserPlanView(data,focus=null){
  const bounds=WorkflowCore.union(focus?[focus]:[])||[0,0,1,1],width=data.width,height=data.height;
  const x=bounds[0]*width,y=bounds[1]*height,w=(bounds[2]-bounds[0])*width,h=(bounds[3]-bounds[1])*height;
  const view=document.createElement('div');view.className='plan-preview';view.style.aspectRatio=w+'/'+h;
  view.style.maxWidth=`calc(${w/h} * (100svh - 215px))`;view.tabIndex=0;view.setAttribute('role','button');
  const label=focus?'Zoomed display area':'Full original plan page';
  view.setAttribute('aria-label',label+(data.markers.length?'. Matching position marked in yellow and red.':'. Marker unavailable; use the position number and surrounding products.')+' Open full page.');
  const image=document.createElement('img'),url=URL.createObjectURL(data.blob);
  planViews.set(view,{url,pending:true});image.src=url;image.alt=label;image.style.width=100/(bounds[2]-bounds[0])+'%';image.style.left=-bounds[0]/(bounds[2]-bounds[0])*100+'%';image.style.top=-bounds[1]/(bounds[3]-bounds[1])*100+'%';
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`${x} ${y} ${w} ${h}`);svg.setAttribute('aria-hidden','true');
  const shapes=[];
  for(const b of data.codeBoxes){if(!WorkflowCore.union([b]))continue;shapes.push(`<rect x="${b[0]*width-7}" y="${b[1]*height-5}" width="${(b[2]-b[0])*width+14}" height="${(b[3]-b[1])*height+10}" fill="#008ceb44" stroke="#0073cd" stroke-width="3"/>`);}
  for(const b of data.markers){if(!WorkflowCore.union([b]))continue;
   const cx=(b[0]+b[2])*width/2,cy=(b[1]+b[3])*height/2,r=Math.max(12,Math.max((b[2]-b[0])*width,(b[3]-b[1])*height)/2+7);
   for(let ring=0;ring<3;ring++)for(const [color,stroke] of [['#111',8],['#fff',5],[ring===1?'#e1232d':'#ffd300',3]])shapes.push(`<circle cx="${cx}" cy="${cy}" r="${r+ring*9}" fill="none" stroke="${color}" stroke-width="${stroke}"/>`);
   for(const [color,stroke] of [['#111',10],['#fff',7],['#ffd300',4]])shapes.push(`<path d="M${cx+68} ${cy-68} L${cx+24} ${cy-24} M${cx+47} ${cy-29} L${cx+24} ${cy-24} L${cx+29} ${cy-47}" fill="none" stroke="${color}" stroke-width="${stroke}"/>`);
  }
  svg.innerHTML=shapes.join('');view.append(image,svg);return {view,image};
}
async function showBrowserPlan(request,data){
  const node=document.querySelector(`[data-request="${CSS.escape(request)}"]`);if(!node)return;
  const dialog=node.closest('dialog');if(dialog&&!dialog.open)return;
  node.dataset.hasMarkers=String(data.markers.length>0);
  if(data.markers.length){const verification=node.closest('.placement-card')?.querySelector('.verification');if(verification)verification.textContent=verification.textContent.replace(' · Position marker unavailable','');}
  const focus=node.dataset.focus?JSON.parse(node.dataset.focus):null,presentation=browserPlanView(data,focus);
  if(node.dataset.fullPage==='true'){
   presentation.view.classList.add('original-preview');presentation.view.removeAttribute('role');presentation.view.removeAttribute('tabindex');presentation.view.setAttribute('aria-label','Full original page');
  }else{
   const open=()=>{const job=node.planJob;fullPlan(job.doc,job.page,job.codeBoxes,job.markers,job.positions,data);};
   presentation.view.onclick=open;presentation.view.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};
  }
  try{await presentation.image.decode();if(!node.isConnected||node.dataset.request!==request){releasePlanView(presentation.view);return;}node.replaceChildren(presentation.view);planViews.get(presentation.view).pending=false;releaseDetachedPlanViews();}
  catch{if(node.isConnected&&node.dataset.request===request)node.innerHTML='<p>Source image could not be loaded.</p>';releasePlanView(presentation.view);}
}
const suppliedPhotos={};
const autoScanner=WorkflowCore.scheduler(startScan,{now:()=>Date.now(),setTimeout:(callback,ms)=>setTimeout(callback,ms),clearTimeout:id=>clearTimeout(id)});
let scanCycle=false,scanTick=null,cameraActive=false,missedScans=0;
function updateCountdown(){const seconds=autoScanner.seconds();const label=seconds===null?'Next scan':`Next scan · ${seconds}s`;$('next-scan').title=label;$('next-scan').setAttribute('aria-label',label);$('scan-countdown').textContent=seconds===null?'':`${seconds}s`;$('scan-countdown').hidden=seconds===null;clearTimeout(scanTick);if(seconds!==null)scanTick=setTimeout(updateCountdown,1000);}
function pauseTimer(){autoScanner.pause();updateCountdown();}
function resumeTimer(){if(scanCycle&&!cameraActive&&!document.hidden&&!overlayOpen()&&!document.body.classList.contains('settings-open')&&!document.body.classList.contains('whats-new-open')){autoScanner.resume();updateCountdown();}}
function openModal(html,keepRecovery=false,variant='') {if(!DIALOG_VARIANTS.includes(variant))throw Error('Use openPage for app screens. Dialogs are limited to '+DIALOG_VARIANTS.join(', ')+'.');if(!keepRecovery)window.LocalPlatform?.cancelRestoreRecovery?.();$('modal-content').ontouchstart=null;$('modal-content').ontouchend=null;pauseTimer(); $('modal-content').innerHTML=html;$('modal').className=variant;$('modal').onclick=variant?event=>{if(event.target===$('modal'))$('modal').close();}:null;const title=$('modal-content').querySelector('h2');if(title){title.id=title.id||'modal-title';$('modal').setAttribute('aria-labelledby',title.id);}else $('modal').removeAttribute('aria-labelledby'); if($('modal').open)$('close-modal').focus();else $('modal').showModal();$('modal').scrollTop=0;}
function cancelTimer(){scanCycle=false;autoScanner.stop();updateCountdown();}
function armTimer(){scanCycle=true;autoScanner.arm(Number(state.settings.autoScan));if(document.hidden||overlayOpen())autoScanner.pause();updateCountdown();}
async function startScan(){missedScans=0;await openScanner();}
// Opens the camera for the next barcode. A retry after a miss calls this directly, so the count of misses is kept.
async function openScanner(){cancelTimer();cameraActive=true;await leaveOverlay(); if(native) native.scan(); else if(window.LocalPlatform)LocalPlatform.scan();else $('status').textContent='Camera tools are loading. You can still search by barcode or name.';}
function storedPlanSummary(){
  const plans=catalogue?.documents||[],products=catalogue?.products||[];
  const demoId='i9319a4ec63432ebf221d319a';
  return {plans,codes:new Set(products.map(p=>p.barcode)).size,onlyDemo:plans.length>0&&plans.every(d=>d.id===demoId)};
}
async function showStoredPlans(options={}){
  const {plans,codes}=storedPlanSummary(),stored=await window.LocalPlatform?.listStoredPlans?.()||[],entries=new Map(stored.map(plan=>[plan.id,plan]));
  for(const doc of plans)if(!entries.has(doc.id))entries.set(doc.id,{id:doc.id,name:doc.name,pages:doc.pages,codeCount:new Set(catalogue.products.filter(p=>p.doc===doc.id).map(p=>p.barcode)).size,archivedAt:null,bundled:!!window.BundlePlans?.isKnown(doc)});
  const rows=[...entries.values()];
  openPage('app:plans',`<p class="muted">Stored ${native?'on this device':'in this browser'}.</p><p>${plans.length} active plans · ${codes.toLocaleString('en-GB')} searchable codes</p><p class="muted">Archive keeps a PDF on this device but removes it from search. Delete removes the imported PDF and its extracted codes; saved notes and observations remain.</p>${native?'':'<p class="muted">Android and each web browser keep separate files. Import the Android workspace ZIP to use the same plans here.</p>'}${rows.map(plan=>{const name=escapeHTML(plan.name),count=Number(plan.codeCount)||0,archived=!!plan.archivedAt;return `<article class="card stored-plan" data-plan-id="${escapeHTML(plan.id)}"><strong>${name}</strong><br><span class="muted">${Number(plan.pages)||0} pages · ${count.toLocaleString('en-GB')} searchable codes${count?'':' · No codes extracted; this plan may need OCR.'}${archived?' · Archived · excluded from search':plan.bundled?' · Included with app':' · Available offline'}</span>${plan.bundled?'<p class="muted">Included plans are managed by the offline-plan setting.</p>':`<div class="actions"><button type="button" data-plan-archive aria-label="${archived?'Restore':'Archive'} ${name}" data-icon="archive">${archived?'Restore':'Archive'}</button><button type="button" data-plan-delete class="danger" aria-label="Delete ${name}" data-icon="trash">Delete…</button></div>`}</article>`;}).join('')||'<p>No plans imported yet.</p>'}<button id="stored-import" class="primary" data-icon="upload">Import plans / workspace ZIP</button>`,options);
  $('stored-import').onclick=()=>{leaveOverlay();$('import-plans').click();};
  document.querySelectorAll('[data-plan-archive]').forEach(button=>button.onclick=async()=>{const card=button.closest('[data-plan-id]'),id=card?.dataset.planId,restore=button.textContent==='Restore';button.disabled=true;try{await (restore?LocalPlatform.restoreImportedPlan(id):LocalPlatform.archiveImportedPlan(id));$('status').textContent=restore?'PDF restored to offline search.':'PDF archived on this device and removed from search.';await showStoredPlans();}catch(error){$('status').textContent=error.message;button.disabled=false;}});
  document.querySelectorAll('[data-plan-delete]').forEach(button=>button.onclick=()=>{const card=button.closest('[data-plan-id]'),plan=rows.find(item=>item.id===card?.dataset.planId);if(plan)confirmStoredPlanDelete(plan.id,plan.name);});
}
// The one confirmation dialog. A page passes its markup and wires its own buttons once the dialog is open.
function confirmDialog(html){openModal(html,false,'confirm');}
function confirmStoredPlanDelete(id,name){
  const references=state.events.filter(item=>item.doc===id).length,history=references?` ${references} saved observation${references===1?'':'s'} referring to this PDF will stay on the device, but the original plan page will no longer be available.`:' Saved notes, photos, and other observations are left unchanged.';
  confirmDialog(`<h2>Delete this imported PDF?</h2><p><strong>${escapeHTML(name)}</strong></p><p>This permanently removes the PDF file and extracted search codes from this device.${history}</p><p>You can keep the PDF or restore it from a backup later.</p><div class="actions"><button id="keep-plan" type="button" data-icon="check">Keep PDF</button><button id="confirm-delete-plan" type="button" class="danger" data-icon="trash">Delete PDF and codes</button></div>`);
  $('keep-plan').onclick=()=>showStoredPlans();
  $('confirm-delete-plan').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{await LocalPlatform.deleteImportedPlan(id);$('status').textContent='Imported PDF and extracted codes deleted. Saved observations were kept.';await showStoredPlans();}catch(error){$('status').textContent=error.message;button.disabled=false;}};
}
function searchableQuery(value){const text=String(value||'').trim();return window.RetailerUI?.barcodeForPayload(text)||text;}
async function copyUnmatchedBarcode(){
  const barcode=String(currentProduct?.barcode||'');if(!barcode)return;
  if(native?.copyClipboardText){native.copyClipboardText(barcode);return;}
  try{
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(barcode);
    else{
      const field=document.createElement('textarea');field.value=barcode;field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();
      const copied=document.execCommand('copy');field.remove();if(!copied)throw Error('Clipboard unavailable');
    }
    $('status').textContent='Barcode copied.';
  }catch{$('status').textContent='Copy unavailable. Press and hold the barcode to select it.';}
}
window.onClipboardTextCopied=()=>{$('status').textContent='Barcode copied.';};
window.onClipboardTextCopyError=message=>{$('status').textContent=message||'Copy unavailable. Press and hold the barcode to select it.';};
function lookup(query, scanned=false, refresh=false, restoring=false) {
  if (!catalogue||catalogueLoading) {pendingLookup={query,scanned,refresh,restoring};$('status').textContent='Plans are still loading. Your search will run when they are ready.';return;}
  const searchQuery=searchableQuery(query);
  if(!refresh)cancelTimer();
  if(native) native.stopCamera();
  document.body.classList.add('has-results');
  $('query').value=searchQuery;shownQuery=searchQuery;
  const searchResult=StockCore.searchDetailed([...ProductCore.records(visibleEvents()),...catalogue.products,...RetailerCore.products(state.retailerCache,RetailerCore.links(visibleEvents()))],searchQuery);
  lastMatches=searchResult.matches;
  const groups=StockCore.group(lastMatches);
  const placementCount=groups.reduce((count,g)=>count+g.placements.length,0);
  const resultSummary=`${searchResult.similar?'Similar names · ':''}${groups.length} product${groups.length===1?'':'s'} · ${placementCount} plan placement${placementCount===1?'':'s'}`;
  $('status').textContent=groups.length ? '' : 'No match in these imported plans. This does not mean zero stock.';
  if(searchQuery.trim()) {const previous=state;state={...state,lastQuery:searchQuery,...(restoring?{}:{recent:[searchQuery,...state.recent.filter(q=>q!==searchQuery)].slice(0,25)})};if(!save())state=previous;}
  if(groups.length===1&&!searchResult.similar) showProduct(groups[0],null,scanned,resultSummary);
  else if(groups.length) {
    currentProduct=null;
    $('results').innerHTML='<p>'+(searchResult.similar?'Similar names found. Choose the correct item and colour.':'Choose the exact product or variant.')+'</p>'+groups.slice(0,100).map((g,i)=>`<button class="variant" data-group="${i}" data-icon="label"><strong>${escapeHTML(g.name)}</strong><span class="code">${escapeHTML(g.barcode)}</span></button>`).join('')+(groups.length>100?'<p>Narrow your search to see more results.</p>':'')+`<p class="result-summary">${escapeHTML(resultSummary)}</p>`;
    document.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>{showProduct(groups[Number(b.dataset.group)],null,scanned);recordAppScreen();});
  } else {
    currentProduct={barcode:(!/^https?:/i.test(searchQuery)&&(scanned||/^\d{6,14}$/.test(searchQuery)))?searchQuery:'',name:searchQuery,placements:[]};
    const available=storedPlanSummary();
    const sourceHelp=window.BundlePlans?.available()&&!BundlePlans.enabled()?'Kingston plans are switched off by your saved preference. Re-enable them in Settings to search them again.':available.onlyDemo?'Only the test plan is stored here. Import your real plans to search your store.':available.plans.length?`Searched ${available.plans.length} stored plans · ${available.codes.toLocaleString('en-GB')} codes. The relevant plan may be missing or have no searchable text.`:'No plans are stored here. Import your PDFs or Android workspace ZIP.';
    $('results').innerHTML=`<div class="empty"><h2>Not found ${native?'on this device':'in this browser'}</h2>${currentProduct.barcode?`<div class="unmatched-barcode"><div><span class="muted">Scanned barcode</span><br><code id="unmatched-code" class="code" tabindex="0">${escapeHTML(currentProduct.barcode)}</code></div><button id="copy-unmatched-code" type="button" class="quiet" aria-label="Copy barcode" data-icon="copy">Copy barcode</button></div>`:''}<p>${sourceHelp}</p>${native?'':'<p class="muted">Plans in the Android app are not automatically copied to this browser.</p>'}<div class="actions"><button id="unknown-import" class="primary" data-icon="page">Import plans / workspace ZIP</button><button id="unknown-plans" data-icon="list">See stored plans</button></div><details${scanned?' open':''}><summary>${scanned?'Optional item details / label capture':'Record an item / read a label'}</summary><div class="actions"><button id="unknown-label" data-icon="label">Read a label photo</button><button id="unknown-product" data-icon="edit">Enter item details</button><button id="unknown-photo" data-icon="photo">Location photo</button></div>${/^https?:/.test(query)?'<p>Paste the page text, name or barcode into item details.</p>':''}</details></div>`;
    $('unknown-import').onclick=()=>$('import-plans').click();$('unknown-plans').onclick=()=>showStoredPlans();
    if(currentProduct.barcode)$('copy-unmatched-code').onclick=copyUnmatchedBarcode;
    $('unknown-photo').onclick=addPhoto;
    $('unknown-product').onclick=()=>productForm();$('unknown-label').onclick=readLabel;
    renderObservations();
  }
  if(scanned) armTimer();
  if(!refresh&&!restoring)recordAppScreen();
  return groups.length>0;
}
const positionRequests=new Map();
const browserPosition=LocationCore.browserCollector(navigator.geolocation);
function cancelPosition(){if(native)native.cancelLocation();else browserPosition.cancel();}
function capturePosition(context){
  if(!state.settings?.scanPosition)return;
  if(!Object.hasOwn(context,'workspaceContext')){try{context={...context,workspaceContext:currentWorkspace()};}catch{return;}}
  const request=crypto.randomUUID(),startedAt=Date.now();
  const timeout=setTimeout(()=>window.onScanLocation(request,JSON.stringify({status:'timeout',latencyMs:Date.now()-startedAt})),8000);
  positionRequests.set(request,{...context,startedAt,timeout});
  if(native)native.captureLocation(request);else browserPosition.capture(raw=>window.onScanLocation(request,JSON.stringify(raw)));
}
window.onScanLocation=(request,encoded)=>{
  const context=positionRequests.get(request);if(!context)return;
  positionRequests.delete(request);clearTimeout(context.timeout);
  let raw;try{raw=JSON.parse(encoded);}catch{raw={status:'invalid'};}
  const fix=LocationCore.normalize(raw,Date.now(),Date.parse(context.capturedAt));
  // The item and capture timestamp come from this request, never the current search result.
  event({kind:'phone-position',product:context.product||'',productName:context.productName||'',query:context.query||'',photoEvent:context.photoEvent||'',trigger:context.trigger,capturedAt:context.capturedAt,requestStartedAt:new Date(context.startedAt).toISOString(),fix,workspaceContext:context.workspaceContext});
};
window.onLocationPermission=message=>{if($('position-help'))$('position-help').textContent=message;};
window.onBarcode = (code,source='lookup',capturedAt=Date.now()) => {
  cameraActive=false;
  const found=lookup(code,source==='camera');
  if(source!=='camera'){missedScans=0;return;}
  if(found===true)missedScans=0;
  // Each camera scan captures the position, including a scan that is tried again.
  capturePosition({product:currentProduct?.barcode||'',productName:currentProduct?.name||'',query:code,trigger:'barcode-scan',capturedAt:new Date(Number(capturedAt)).toISOString()});
  // A camera scan with no product is scanned again, up to SEARCH_MISS_ATTEMPTS scans in all. The count is kept until a product is found.
  if(found===false){
    missedScans+=1;
    if(SteadyReadCore.retryAfterMiss(missedScans)){$('status').textContent=`Not found. Scanning again, attempt ${missedScans+1} of ${SteadyReadCore.SEARCH_MISS_ATTEMPTS}.`;openScanner();return;}
    $('status').textContent=`Not found after ${missedScans} scans. Check the barcode, or search by name.`;
  }
};
function positionDetails(e){
  if(!e.fix){const linked=state.events.find(item=>item.kind==='phone-position'&&item.photoEvent===e.id);if(linked)e=linked;}
  if(!e.fix)return '';
  const f=e.fix,coordinates=typeof f.latitude==='number'?`<p>Latitude ${f.latitude.toFixed(6)} · Longitude ${f.longitude.toFixed(6)}</p>`:'';
  return `<p>${escapeHTML(LocationCore.describe(f))}</p>${coordinates}<p class="muted">Capture: ${escapeHTML(e.trigger||'capture')} · ${date(e.capturedAt||e.at)}. The reading measures the phone's position; it does not establish the item's shelf, warehouse section or floor.</p><p class="source">Source: ${escapeHTML(f.source)} · permission: ${escapeHTML(f.permission)} · request ${Math.round(f.latencyMs)} ms${f.ageMs!==undefined?` · reading age ${Math.round(f.ageMs)} ms`:''}${f.measurementAt?' · measured '+date(f.measurementAt):''}${f.captureOffsetMs!==null&&f.captureOffsetMs!==undefined?' · '+Math.round(f.captureOffsetMs)+' ms from capture':''}${f.horizontalAccuracyMetres?' · reported accuracy '+f.horizontalAccuracyMetres.toFixed(1)+' m':''}</p>`;
}
window.onCameraOpened=()=>{cameraActive=true;pauseTimer();};
window.onCameraClosed=()=>{cameraActive=false;resumeTimer();};
window.onCameraMessage = message => {$('status').textContent=message;};
function showProduct(product,selected=null,scanned=false,resultSummary='') {
  currentProduct=product;
  resultSummary=resultSummary||`1 product · ${product.placements.length} plan placement${product.placements.length===1?'':'s'}`;
  placementIndex=selected?Math.max(0,product.placements.findIndex(p=>p.doc===selected.doc&&p.page===selected.page&&p.position===selected.position)):0;
  $('results').innerHTML=`<article class="card product-card"><h1>${escapeHTML(product.name)}</h1><p class="code">${escapeHTML(product.barcode)}${product.price?' · Label price '+escapeHTML((product.currency||'')+product.price):''}</p><div id="latest-location"></div><div id="retailer-summary" class="retailer-summary"></div></article><section id="placements" aria-label="Plan placements"></section><details id="secondary-actions" open><summary>${scanned?'Optional item details, label photo and history':'Photo, item details, location notes and history'}</summary>${scanned?'<p class="muted">Read a shelf-label photo to suggest its printed price and text. Review the suggestions and save them to this item on this device.</p>':''}<div class="actions"><button id="add-photo" aria-label="Add location photo" data-icon="photo">Photo</button><button id="add-note" aria-label="Record location" data-icon="location">Location note</button><button id="edit-product" data-icon="edit">${scanned?'Add item details / read label':'Item details / read label'}</button><button id="product-history" aria-label="Item history" data-icon="history">Item history</button></div>${product.description?'<p>'+escapeHTML(product.description)+'</p>':''}</details><section id="observations" aria-label="Worker observations"></section>`;
  $('add-photo').onclick=addPhoto;
  $('add-note').onclick=()=>locationForm();
  $('edit-product').onclick=()=>productForm(product);
  $('product-history').onclick=()=>showHistory(visibleEvents().filter(e=>sameProductCode(e.product,product.barcode) || (!product.barcode && e.productName===product.name)));
  renderObservations();
  window.ShelfLabels?.show(product);
  $('results').insertAdjacentHTML('beforeend',`<p class="result-summary">${escapeHTML(resultSummary)}</p>`);
  showPlacement();
  window.scrollTo(0,0);
  window.RetailerUI?.render();
}
function showPlacement(){
  const product=currentProduct,p=product.placements[placementIndex];
  const placements=$('placements');
  placements.replaceChildren();
  if(p){
    const doc=documents.get(p.doc), mark=StockCore.markFor({events:visibleEvents()},p.doc);
    const card=document.createElement('article');card.className='card placement-card';
    card.innerHTML=`<div class="plan-heading">${escapeHTML(placementHeading(p,doc,product))}</div><p class="plan-location">${escapeHTML(locationSummary(p))}</p>${mark==='outdated'?`<p class="warning">${AppUI.iconMarkup('warning')}Reported outdated · check observations</p>`:''}${product.placements.length>1?`<div class="placement-switch"><button id="previous-placement" aria-label="Previous placement" ${placementIndex===0?'disabled':''} data-icon="previous"></button><label class="sr-only" for="placement-choice">Choose plan location</label><select id="placement-choice">${product.placements.map((item,i)=>`<option value="${i}" ${i===placementIndex?'selected':''}>${i+1}/${product.placements.length} · ${escapeHTML(placementChoiceLabel(item))}</option>`).join('')}</select><button id="next-placement" aria-label="Next placement" ${placementIndex===product.placements.length-1?'disabled':''} data-icon="next"></button></div>`:''}<div class="plan-frame" id="plan-0" aria-label="Matching display area"><p>Opening local plan…</p></div><p class="verification">${mark==='outdated'?'Reported outdated':'Floor layout unverified'}${p.markers.length?'':' · Position marker unavailable'} · ${escapeHTML(p.title)} · PDF ${p.diagramPage}</p><p class="source plan-source-name"><strong>Source plan:</strong> ${escapeHTML(WorkflowCore.planSourceName(doc.name,p.heading||p.title))}</p><details class="plan-details" open><summary>More source details, product text and plan history</summary><p>${escapeHTML(p.rowText||p.name)}${p.status?' · Plan status: '+escapeHTML(p.status):''}${p.fill?' · Plan fill: '+escapeHTML(p.fill)+' (not a stock count)':''}</p>${p.sourceBarcode?`<p class="source identifier-note">Source prints ${escapeHTML(p.sourceBarcode)} · matched UPC ${escapeHTML(p.barcode)}. Leading zero restored from recorded manufacturer evidence.</p>`:''}<p class="source">${escapeHTML(doc.name)} · PDF page ${p.page}${p.printed?' · '+escapeHTML(p.printed):''}<br>${doc.sourceUpdated?'Source updated '+escapeHTML(doc.sourceUpdated):'Source update date unknown · Added '+escapeHTML(doc.added)}</p><p class="muted">Yellow/red rings and arrows: candidate position markers. Blue box: matching barcode. Planned placement, not verified stock.</p><div class="actions"><button class="table" data-icon="page">Product list page</button><button class="history" data-icon="history">Plan history</button></div></details>${planCommentFeedHTML(visibleEvents(),p.doc,mark==='outdated')}`;
    if(p.position)card.querySelector('.plan-location').innerHTML=`<span class="position-cue">Find number <strong>${escapeHTML(p.position)}</strong></span> <span>${escapeHTML([p.fixture,p.bay].filter(Boolean).join(' · '))}</span>`;
    placements.append(card);
    bindPlanComposer($('plan-comment-feed'),p.doc);
    const focus=WorkflowCore.focus(p.images||[],p.markers||[]);
    if(focus){card.querySelector('.plan-heading').insertAdjacentHTML('afterend','<button class="quiet zoom-toggle" id="toggle-zoom" data-icon="search">'+(state.settings.planZoom?'Full page':'Zoom display')+'</button>');$('toggle-zoom').onclick=()=>{if(updateSettings({planZoom:!state.settings.planZoom}))showPlacement();};}
    renderPlan(p.doc,p.diagramPage,p.diagramPage===p.page?p.codeBoxes:[],p.markers,'plan-0',state.settings.planZoom?focus:null,[p.position]);
    if($('placement-choice')){
      const change=index=>{placementIndex=index;showPlacement();refreshAppSnapshot();window.scrollTo(0,0);};
      $('placement-choice').onchange=e=>change(Number(e.target.value));
      $('previous-placement').onclick=()=>change(placementIndex-1);$('next-placement').onclick=()=>change(placementIndex+1);
      let touchX;card.ontouchstart=e=>{touchX=e.changedTouches[0].clientX;};card.ontouchend=e=>{const delta=e.changedTouches[0].clientX-touchX;if(Math.abs(delta)>90){const next=placementIndex+(delta<0?1:-1);if(next>=0&&next<product.placements.length)change(next);}};
    }
    card.querySelector('.table').onclick=()=>fullPlan(p.doc,p.page,p.codeBoxes,[],p.diagramPage===p.page?[p.position]:[]);    card.querySelector('.history').onclick=()=>showHistory(visibleEvents().filter(e=>e.doc===p.doc),p.doc);
  }else{placements.innerHTML='<p class="muted">No plan needed. Add a location photo or section note when you find this item.</p>';}
  const reference=suppliedPhotos[product.barcode];
  if(reference){const card=document.createElement('article');card.className='card';card.innerHTML=`<h2>Display reference photo</h2><img class="location-photo" src="${escapeHTML(reference.file)}" alt="${escapeHTML(reference.caption)}"><p>${escapeHTML(reference.caption)}</p><p class="muted">Capture date unknown. This supplied reference is not a current warehouse sighting.</p>`;placements.append(card);}
}
function renderPlan(doc,page,codeBoxes,markers,target,focus=null,positions=[]){
  const request=String(++renderCounter);const node=$(target);node.dataset.request=request;
  if(focus)node.dataset.focus=JSON.stringify(focus);else delete node.dataset.focus;
  node.dataset.hasMarkers=String(markers.length>0);
  const job={doc,page,codeBoxes,positions,markers:[...new Map(markers.map(b=>[b.join(','),b])).values()]};
  node.planJob=job;
  if(!native){const render=()=>LocalPlatform.render(job).then(url=>window.onPlanRendered(request,url)).catch(error=>window.onPlanRendered(request,'',error.message||'PDF could not be rendered'));if(window.LocalPlatform)render();else window.addEventListener('local-platform-ready',render,{once:true});}
  else if(doc.startsWith('i')&&window.LocalPlatform)LocalPlatform.render(job).then(url=>window.onPlanRendered(request,url)).catch(()=>window.onPlanRendered(request,'','Imported PDF could not be rendered'));
  else if(native) native.renderPlan(JSON.stringify({...job,request}));
  else fetch('/preview-render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(job)}).then(r=>{if(!r.ok)throw Error();return r.blob();}).then(blob=>window.onPlanRendered(request,URL.createObjectURL(blob))).catch(()=>{node.innerHTML='<p>Plan rendering is available in the APK or through the preview server.</p>';});
}
window.onPlanRendered=(request,url,error)=>{
  if(url&&typeof url==='object'&&url.blob){void showBrowserPlan(request,url);return;}
  const node=document.querySelector(`[data-request="${CSS.escape(request)}"]`);if(!node)return;
  if(error){node.innerHTML=`<p>${escapeHTML(error)}. Other results remain available.</p>`;return;}
  const image=document.createElement('img');image.alt=node.dataset.focus?'Zoomed display area, with surrounding products. Matching position marked by high-contrast yellow and red rings and an arrow.':'Full original plan page. Matching position marked by high-contrast yellow and red rings and an arrow; matching barcode boxed in blue.';if(node.dataset.hasMarkers!=='true')image.alt=(node.dataset.focus?'Zoomed display area.':'Full original plan page.')+' Position marker unavailable; use surrounding products and the plan position text.';image.tabIndex=0;image.setAttribute('role','button');image.onclick=()=>{const job=node.planJob;fullPlan(job.doc,job.page,job.codeBoxes,job.markers,job.positions,url);};image.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();image.click();}};
  if(node.dataset.fullPage==='true'){image.removeAttribute('role');image.removeAttribute('tabindex');image.onclick=null;image.onkeydown=null;image.className='full-plan';}
  const source=new Image();source.onload=()=>{
    if(!node.isConnected||node.dataset.request!==request)return;
    const bounds=node.dataset.focus?JSON.parse(node.dataset.focus):null;
    if(bounds){const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round((bounds[2]-bounds[0])*source.naturalWidth));canvas.height=Math.max(1,Math.round((bounds[3]-bounds[1])*source.naturalHeight));canvas.getContext('2d').drawImage(source,bounds[0]*source.naturalWidth,bounds[1]*source.naturalHeight,canvas.width,canvas.height,0,0,canvas.width,canvas.height);image.src=canvas.toDataURL('image/png');}else image.src=url;
    node.replaceChildren(image);
  };source.onerror=()=>{if(node.isConnected&&node.dataset.request===request)node.innerHTML='<p>Source image could not be loaded.</p>';};source.src=url;
};
function fullPlan(doc,page,codeBoxes,markers,positions=[],preview=null){
 const source=documents.get(doc),total=source?.pages;
 if(!Number.isInteger(total)||!Number.isInteger(page)||page<1||page>total)return;
 // Snapshot the selected item's own page associations. Coordinates never cross pages.
 const matches=(currentProduct?.placements||[]).filter(p=>p.doc===doc),matchPage=page;
 const original={codeBoxes,markers,positions},product=currentProduct;
 const cue=[product?.name,product?.barcode].filter(Boolean).join(' · ');
 const numbers=[...new Set(matches.map(p=>p.position).filter(Boolean))];
 openPage('app:plan-page','<p class="source">'+escapeHTML(source.name)+'</p><p class="source" id="pdf-search">'+escapeHTML(cue)+(numbers.length?' · Find number '+escapeHTML(numbers.join(', ')):'')+'</p><form id="pdf-navigation" class="pdf-navigation"><button type="button" id="pdf-previous" aria-label="Previous PDF page" data-icon="previous"></button><label class="sr-only" for="pdf-page">PDF page</label><input type="number" inputmode="numeric" id="pdf-page" min="1" max="'+total+'" step="1" required><span>of '+total+'</span><button type="submit" id="pdf-go" data-icon="next">Go</button><button type="button" id="pdf-next" aria-label="Next PDF page" data-icon="next"></button></form><button class="quiet" id="pdf-match" data-icon="search">Match page '+matchPage+'</button><p class="source" id="pdf-highlight-note" role="status"></p><div class="plan-frame" id="full-plan" data-full-page="true" aria-label="Full original plan page"></div>',{title:'Source plan page '+page+' of '+total});
 let showing=page;
 const display=(number,initial=null)=>{
  if(!Number.isInteger(number)||number<1||number>total)return;
  showing=number;$('pdf-page').value=number;$('page-title').textContent='Source plan page '+number+' of '+total;
  $('pdf-previous').disabled=number===1;$('pdf-next').disabled=number===total;$('pdf-match').disabled=number===matchPage;
  const boxes=[],rings=[],labels=[];
  if(number===matchPage){boxes.push(...original.codeBoxes);rings.push(...original.markers);labels.push(...original.positions);}
  for(const p of matches){if(p.page===number)boxes.push(...p.codeBoxes);if(p.diagramPage===number){rings.push(...p.markers);if(p.position)labels.push(p.position);}}
  const unique=values=>[...new Map(values.map(b=>[b.join(','),b])).values()];
  const job={doc,page:number,codeBoxes:unique(boxes),markers:unique(rings),positions:[...new Set(labels.filter(Boolean))]};
  $('pdf-highlight-note').textContent=job.codeBoxes.length||job.markers.length||job.positions.length?'Search highlights retained · Pinch to zoom.':'Search retained · No recorded highlights here.';
  const node=$('full-plan');node.replaceChildren();node.dataset.page=number;node.innerHTML='<p>Opening local page…</p>';
  if(initial){const request=String(++renderCounter);node.dataset.request=request;node.planJob=job;node.dataset.hasMarkers=String(job.markers.length>0);window.onPlanRendered(request,initial);}
  else renderPlan(doc,number,job.codeBoxes,job.markers,'full-plan',null,job.positions);
 };
 $('pdf-previous').onclick=()=>display(showing-1);$('pdf-next').onclick=()=>display(showing+1);$('pdf-match').onclick=()=>display(matchPage);
 $('pdf-navigation').onsubmit=e=>{e.preventDefault();display($('pdf-page').valueAsNumber);};
 display(page,preview);
}
function observations(){return visibleEvents().filter(e=>e.kind==='location' && (currentProduct.barcode?sameProductCode(e.product,currentProduct.barcode):e.productName===currentProduct.name)).sort((a,b)=>new Date(a.at).getTime()-new Date(b.at).getTime());}
function planCommentFeedHTML(events,doc,outdated=false){
  const comments=(events||[]).filter(e=>e.doc===doc&&(e.kind==='plan-comment'||e.kind==='plan-mark')).slice(-5).reverse();
  const list=comments.length?`<ol class="comment-list">${comments.map(e=>`<li class="plan-comment"><span class="comment-avatar" aria-hidden="true">${escapeHTML(String(e.worker||'W').trim().charAt(0).toUpperCase())}</span><div><p class="comment-meta"><strong>${escapeHTML(e.worker||'Worker')}</strong> · ${date(e.at)}</p>${e.kind==='plan-mark'?`<p class="comment-kind">${e.mark==='outdated'?'Marked outdated':'Outdated mark cleared'}</p>`:''}<p class="comment-body">${escapeHTML(e.note||(e.kind==='plan-mark'?'No note added.':'No comment text.'))}</p></div></li>`).join('')}</ol>`:'<p class="muted plan-comment-empty">No comments yet. Be the first to comment on this plan.</p>';
  const markButton=outdated?'<button type="button" id="plan-mark" data-icon="info">Clear outdated mark</button>':'<button type="button" id="plan-mark" data-icon="warning">Mark outdated</button>';
  return `<section class="plan-comment-feed" id="plan-comment-feed" aria-label="Plan comments"><h3>Comments <span class="muted">· saved on this device, not synced</span></h3><form class="comment-composer" id="plan-composer"><label class="sr-only" for="plan-comment-text">Comment on this plan</label><textarea id="plan-comment-text" maxlength="2000" placeholder="Add a comment about this plan…"></textarea><div class="comment-actions">${markButton}<button type="submit" class="primary" data-icon="send">Post</button></div></form>${list}</section>`;
}
// The composer posts a local comment or toggles the outdated mark. A comment redraws only the feed; a mark redraws the placement card, which shows the mark.
function bindPlanComposer(feed,doc){
  const text=feed.querySelector('#plan-comment-text');
  feed.querySelector('#plan-composer').onsubmit=e=>{e.preventDefault();const note=text.value.trim();if(!note){text.focus();return;}if(event({kind:'plan-comment',doc,note}))refreshPlanComments(doc);};
  feed.querySelector('#plan-mark').onclick=()=>{const outdated=StockCore.markFor({events:visibleEvents()},doc)==='outdated';if(event({kind:'plan-mark',doc,mark:outdated?'unverified':'outdated',note:text.value.trim()}))showPlacement();};
}
function refreshPlanComments(doc){
  const feed=$('plan-comment-feed');if(!feed)return;
  feed.outerHTML=planCommentFeedHTML(visibleEvents(),doc,StockCore.markFor({events:visibleEvents()},doc)==='outdated');
  bindPlanComposer($('plan-comment-feed'),doc);
}
function renderObservations(){
  let node=$('observations');if(!node){node=document.createElement('section');node.id='observations';$('results').append(node);}
  const seenPhotos=new Set();
  const items=observations().slice().reverse().filter(e=>{if(e.photo){if(seenPhotos.has(e.photo))return false;seenPhotos.add(e.photo);}return true;});
  node.innerHTML=items.length?'<h2>Worker observations</h2>'+items.slice(0,5).map(e=>`<article class="card"><span class="badge">${escapeHTML(e.area || 'Area not recorded')} · local only</span><div class="answer">${escapeHTML(e.section || 'Section not recorded')}</div><p>${escapeHTML(e.note || (e.photo?'Location photo recorded':'No extra details'))}</p><p class="muted">${e.action==='proposed'?'Suggested placement — awaiting manager decision':e.action==='not-here'?'Not found at this spot':'Last seen'} · ${date(e.at)} · ${escapeHTML(e.worker)}</p>${e.photo?`<img class="location-photo" src="${/^local-/.test(e.thumbnail||e.photo)?'':escapeHTML(e.thumbnail||e.photo)}" ${/^local-/.test(e.thumbnail||e.photo)?`data-local-photo="${escapeHTML(e.thumbnail||e.photo)}"`:''} data-full-photo="${escapeHTML(e.photo)}" loading="lazy" tabindex="0" role="button" alt="Worker location photo of ${escapeHTML(e.productName)}, including any captured surrounding items">`:''}</article>`).join(''):'';
  resolvePhotos();
  if($('latest-location')){const latest=items[0];if(!latest){$('latest-location').innerHTML='';return;}const place=[latest.area,latest.section].filter(Boolean).join(' · '),note=String(latest.note||'').trim(),detail=place||(note?'Note: '+note:latest.photo?'Location photo recorded':'No location details recorded');$('latest-location').innerHTML=`<p class="latest-location">${latest.action==='proposed'?'Suggested · awaiting manager':latest.action==='not-here'?'Not found at this spot':'Last seen'}: <strong class="${!place&&note?'location-note-preview':''}"${!place&&note?` title="${escapeHTML(detail)}"`:''}>${escapeHTML(detail)}</strong> <small>${date(latest.at)}</small></p>`;}
}
window.photoCaptureContext=(purpose='location')=>{const target={product:currentProduct?.barcode||'',productName:currentProduct?.name||''};if(typeof window.captureScopeForPhoto==='function')target.captureScope=window.captureScopeForPhoto(target,purpose);return CaptureCore.context(target,purpose);};
async function addPhoto(){let context;try{context=window.photoCaptureContext();}catch(error){overlayMessage(error.message);return;}pauseTimer();cameraActive=true;await leaveOverlay();if(native?.beginPhoto)native.beginPhoto(JSON.stringify(context),false);else if(native)native.takePhoto();else if(window.LocalPlatform)LocalPlatform.takePhoto(context);else $('status').textContent='Camera tools are loading.';}
async function readLabel(context=null){try{if(!context||typeof context.product!=='string')context=window.photoCaptureContext('label');else{context={...context};if(typeof window.captureScopeForPhoto==='function'&&!context.captureScope)context.captureScope=window.captureScopeForPhoto(context,'label');context=CaptureCore.context(context,'label');}}catch(error){overlayMessage(error.message);return;}pauseTimer();cameraActive=true;await leaveOverlay();if(native?.beginPhoto)native.beginPhoto(JSON.stringify(context),true);else if(native)native.captureLabel();else if(window.LocalPlatform)LocalPlatform.takeLabelPhoto(context);else $('status').textContent='Camera tools are loading.';}
function productForm(draft=currentProduct||{},options={}){
  const originalWorkspace=Object.hasOwn(draft,'workspaceContext')?draft.workspaceContext:currentWorkspace();
  const known=ProductCore.records(visibleEvents()).find(p=>StockCore.canonical(p.barcode)===StockCore.canonical(draft.barcode||''));draft={...known,...draft};
  if(/^\d+$/.test(draft.name||'')||draft.name?.startsWith('Product code '))draft={...draft,name:''};
  openPage('app:item-details',`<p class="muted">A barcode and name are enough. Read a shelf-label photo to suggest its printed price, name and text offline. Review or edit those suggestions, then choose Save item to store the confirmed details with this barcode on this device. A label price is not live retailer stock.</p><button id="read-label" data-icon="label">Read label photo</button><div class="field"><label for="item-code">Barcode / item identifier</label><input id="item-code" maxlength="128" value="${escapeHTML(draft.barcode||'')}"></div><div class="field"><label for="item-name">Name</label><input id="item-name" maxlength="500" value="${escapeHTML(draft.name||'')}"></div><div class="field"><label for="item-price">Label price (optional)</label><input id="item-price" inputmode="decimal" value="${escapeHTML(draft.price||'')}"></div><div class="field"><label for="item-currency">Currency</label><input id="item-currency" value="${escapeHTML(draft.currency||'£')}" maxlength="10"></div><div class="field"><label for="item-description">Description / other details</label><textarea id="item-description">${escapeHTML(draft.description||'')}</textarea></div><div class="field"><label for="item-text">All captured / pasted text</label><textarea id="item-text" maxlength="30000">${escapeHTML(draft.rawText||'')}</textarea><button id="parse-item-text" data-icon="edit">Fill from this text</button></div><button id="save-product" class="primary" data-icon="check">Save item</button>`,options);
  $('read-label').onclick=()=>readLabel({product:$('item-code').value.trim(),productName:$('item-name').value.trim()});
  $('parse-item-text').onclick=()=>{const parsed=ProductCore.extract($('item-text').value,$('item-code').value.trim());for(const [id,key] of [['item-code','barcode'],['item-name','name'],['item-price','price'],['item-currency','currency'],['item-description','description']])if(parsed[key])$(id).value=parsed[key];};
  $('save-product').onclick=()=>{
    const barcode=$('item-code').value.trim(),name=$('item-name').value.trim();if(!barcode||!name){overlayMessage('Enter the item identifier and name.');(!barcode?$('item-code'):$('item-name')).focus();return;}
    if(event({kind:'product',barcode,name,product:barcode,productName:name,price:$('item-price').value.trim(),currency:$('item-currency').value.trim(),description:$('item-description').value.trim(),rawText:$('item-text').value,labelPhoto:draft.labelPhoto||'',labelEvent:draft.labelEvent||'',source:draft.source||'manual',ocrConfidence:draft.ocrConfidence??null,workspaceContext:originalWorkspace})){ leaveOverlay().then(()=>{lookup(barcode,false,true);$('status').textContent='Item saved locally. Add a location photo or note when useful.';}); }
  };
}
let labelAttempt=0;
function samePhotoObservation(previous,kind,target,url,info){return previous.kind===kind&&previous.product===target&&(previous.photo===url||info.captureId&&previous.photoInfo?.captureId===info.captureId&&previous.photoInfo?.photo===info.photo);}
window.onOCRProgress=message=>{if($('ocr-progress'))$('ocr-progress').textContent=message;};
window.onLabelPhoto=async(url,thumbnail='',encoded='{}')=>{
  cameraActive=false;
  let info={};try{info=JSON.parse(encoded);}catch{}
  const target=typeof info.product==='string'?{barcode:info.product,name:info.productName||''}:currentProduct;
  const draft={...target,labelPhoto:url,labelEvent:info.captureId||crypto.randomUUID(),source:'label-photo',workspaceContext:info.captureScope?CaptureCore.identity(info.captureScope):null};
  const previous=state.events.find(e=>e.id===draft.labelEvent);if(previous)return samePhotoObservation(previous,'label-photo',draft.barcode||'',url,info);
  const attempt=++labelAttempt;
  if(!event({id:draft.labelEvent,kind:'label-photo',at:new Date(info.capturedAt||Date.now()).toISOString(),product:draft.barcode||'',productName:draft.name||'',photo:url,thumbnail,photoInfo:info,workspaceContext:info.captureScope?CaptureCore.identity(info.captureScope):null}))return false;
  if(info.recovery)return true;
  capturePosition({product:draft.barcode,productName:draft.name,trigger:'label-photo',photoEvent:draft.labelEvent,capturedAt:new Date(info.capturedAt||Date.now()).toISOString()});
  let reading=true;
  openPage('app:read-label','<p id="ocr-progress" role="status">Loading offline recognition tools.</p><p class="muted">The photo stays local. You can enter details instead while keeping the photo.</p><button id="skip-ocr" data-icon="edit">Enter manually</button>',{onClose:()=>{if(reading){labelAttempt++;window.LocalPlatform?.cancelOCR();}}});
  $('skip-ocr').onclick=()=>{reading=false;labelAttempt++;LocalPlatform.cancelOCR();productForm(draft,{replace:true});};
  try{const result=await LocalPlatform.recognizePhoto(url);reading=false;if(attempt===labelAttempt)productForm({...draft,...ProductCore.extract(result.text,draft.barcode),ocrConfidence:result.confidence},{replace:true});}
  catch{reading=false;if(attempt===labelAttempt){productForm(draft,{replace:true});overlayMessage('Label text could not be read. The photo is retained; enter the details manually.');}}
  return true;
};
window.photoQuality=()=>state.settings?.photoQuality||'balanced';
async function resolvePhotos(){if(!window.LocalPlatform)return;for(const image of document.querySelectorAll('img[data-local-photo]')){const reference=image.dataset.localPhoto;try{image.src=await LocalPlatform.photoUrl(reference);}catch{image.alt+=' · file unavailable';}}}
window.onPhoto=(url,thumbnail='',encoded='{}')=>{
  cameraActive=false;
  let photoInfo={};try{photoInfo=JSON.parse(encoded);}catch{}
  const target=typeof photoInfo.product==='string'?{barcode:photoInfo.product,name:photoInfo.productName||''}:currentProduct;
  if(!target||!target.barcode&&!target.name){$('status').textContent='Search for an item before attaching a photo.';return false;}
  const photoEvent=photoInfo.captureId||crypto.randomUUID(),previous=state.events.find(e=>e.id===photoEvent);if(previous)return samePhotoObservation(previous,'location',target.barcode,url,photoInfo);
  if(event({id:photoEvent,kind:'location',at:new Date(photoInfo.capturedAt||Date.now()).toISOString(),product:target.barcode,productName:target.name,photo:url,thumbnail,photoInfo,section:'',area:'',note:'',action:'seen',workspaceContext:photoInfo.captureScope?CaptureCore.identity(photoInfo.captureScope):null})){
    if(!photoInfo.recovery)capturePosition({product:target.barcode,productName:target.name,trigger:'location-photo',photoEvent,capturedAt:new Date(photoInfo.capturedAt||Date.now()).toISOString()});
    if(currentProduct)renderObservations();$('status').textContent='Photo saved for '+target.name+'. Add a section or landmark if useful.';if(!photoInfo.recovery)locationForm(url,true,target);
    return true;
  }
  return false;
};
function nativePendingPhotos(){if(!native?.pendingPhotos)return {records:[]};try{return JSON.parse(native.pendingPhotos());}catch{return {unavailable:true,records:[]};}}
function pendingPhotoEvents(records){return records.map(r=>({id:r.id,kind:r.purpose==='label'?'label-photo':'location',product:r.product,productName:r.productName,at:new Date(r.capturedAt).toISOString(),worker:'Me',photo:'https://appassets.androidplatform.net/photos/'+r.photo,thumbnail:'https://appassets.androidplatform.net/photos/'+r.thumbnail,photoInfo:{...r,captureId:r.id,recovery:true},...(r.purpose==='label'?{}:{section:'',area:'',note:'',action:'seen'})}));}
window.onCaptureTicket=async(record,live=false)=>{
 const ticketContext=CaptureCore.context(record,record.purpose);let active;try{active=currentWorkspace();}catch{return false;}
 const original=ticketContext.captureScope?CaptureCore.identity(ticketContext.captureScope):null;
 if(!CaptureCore.sameIdentity(original,active))return false;
 if(ticketContext.captureScope?.mode==='shared')return typeof window.onSharedCaptureReady==='function'?await window.onSharedCaptureReady(record):false;
 const info={...record,captureId:record.captureId||record.id,recovery:!live||!CaptureCore.sameIdentity(original,active)};
 return await (record.purpose==='label'?window.onLabelPhoto:window.onPhoto)(record.photoUrl||record.photo,record.thumbnailUrl||record.thumbnail,JSON.stringify(info));
};
window.onPhotoHandoff=async(encoded,live=false)=>{
  const record=typeof encoded==='string'?JSON.parse(encoded):encoded,origin='https://appassets.androidplatform.net/photos/';
  if(typeof record.product!=='string'||typeof record.productName!=='string'||!['label','location'].includes(record.purpose)||!/^[-a-f0-9]{36}$/.test(record.id)||record.photo!==record.id+'.jpg'||record.thumbnail!==record.id+'-thumb.jpg')throw Error('Capture ownership could not be read.');
  const accepted=await window.onCaptureTicket({...record,captureId:record.id,photoUrl:origin+record.photo,thumbnailUrl:origin+record.thumbnail},live);
  if(!accepted)return false;
  // The native side also verifies the committed event before removing a ticket.
  return native.acknowledgePhoto(record.id);
};
let nativePhotoRecovery=null;
window.onNativePhotosReady=(liveId='')=>{
  if(!native?.pendingPhotos||nativePhotoRecovery)return nativePhotoRecovery;
  nativePhotoRecovery=(async()=>{const pending=nativePendingPhotos();if(pending.unavailable){$('status').textContent='Photo recovery is unavailable. Existing photos are retained; export a backup in Settings.';return;}
    let recovered=0;for(const record of pending.records){try{if(await window.onPhotoHandoff(record,record.id===liveId))recovered++;else $('status').textContent='Photos retained for their original items and workspace. Retry there in Settings or export a backup.';}catch{$('status').textContent='A photo is waiting to save. It is retained; retry in Settings or export a backup.';}}
    if(recovered&&!liveId)$('status').textContent=recovered+' photo'+(recovered===1?'':'s')+' recovered for their original items. See Saved label photos or search the item.';
  })();nativePhotoRecovery.finally(()=>{nativePhotoRecovery=null;});return nativePhotoRecovery;
};
function locationForm(photo='',alreadySaved=false,targetProduct=currentProduct){
  const originalPhoto=photo?state.events.find(event=>event.photo===photo):null;
  const originalWorkspace=originalPhoto?originalPhoto.workspaceContext||null:currentWorkspace();
  openPage('app:location-note',`<p>${escapeHTML(targetProduct.name)} · ${escapeHTML(targetProduct.barcode)}</p><p class="muted">${alreadySaved?'These details are optional. The photo is already retained.':'Record what you actually observed. Suggestions are separate from placements approved by your manager.'}</p><div class="field"><label for="area">Area</label><select id="area"><option value="">Not recorded</option><option>Warehouse</option><option>Shop floor</option><option>Cart / trolley / tote</option></select></div><div class="field"><label for="section">Section or landmark</label><input id="section" placeholder="e.g. Dining, beside white dinner sets"></div><div class="field"><label for="location-note">Observation</label><textarea id="location-note" placeholder="Nearby items, shelf, missing label…"></textarea></div><div class="field"><label for="action">What happened?</label><select id="action"><option value="seen">Found / last seen here</option><option value="not-here">Not found at this spot</option><option value="proposed">Suggested placement — awaiting manager decision</option></select></div><button id="save-location" class="primary" data-icon="check">Save details</button>`);
  $('save-location').onclick=()=>{if(event({kind:'location',product:targetProduct.barcode,productName:targetProduct.name,photo,...(photo?(()=>{const original=state.events.find(e=>e.photo===photo);return {thumbnail:original?.thumbnail,photoInfo:original?.photoInfo};})():{}),area:$('area').value,section:$('section').value.trim(),note:$('location-note').value.trim(),action:$('action').value,workspaceContext:originalWorkspace})){ leaveOverlay();renderObservations();$('status').textContent='Observation saved locally. Coworker sync is not connected.'; }};
}
function showHistory(events,doc='',title=''){
  const route=doc?'app:plan-history':'app:item-history';
  const ordered=events.slice().reverse();let index=0;
  function draw(){
    const e=ordered[index];openPage(route,`${e?`<div class="history-note"><p>${escapeHTML(e.worker)} · ${date(e.at)}</p><h3>${escapeHTML(e.kind==='phone-position'?'Phone position experiment':e.mark || e.action || e.kind)}</h3><p>${escapeHTML(e.note || e.section || e.productName || e.query || 'No extra details')}</p>${positionDetails(e)}${e.photo?`<img class="location-photo" src="${/^local-/.test(e.photo)?'':escapeHTML(e.photo)}" ${/^local-/.test(e.photo)?`data-local-photo="${escapeHTML(e.photo)}"`:''} alt="Previous worker location photo">`:''}</div><div class="history-controls"><button id="previous" ${index===ordered.length-1?'disabled':''} data-icon="previous">Older</button><span>${index+1} of ${ordered.length}</span><button id="newer" ${index===0?'disabled':''} data-icon="next">Newer</button></div>${doc&&e.kind==='plan-mark'?'<button id="restore" data-icon="upload">Restore this mark as a new change</button>':''}`:'<p>No recorded history yet.</p>'}`,{title:title||undefined});
    if(e){$('previous').onclick=()=>{index++;draw();};$('newer').onclick=()=>{index--;draw();};let touchX; const card=overlayContent();card.ontouchstart=t=>{touchX=t.changedTouches[0].clientX;};card.ontouchend=t=>{const dx=t.changedTouches[0].clientX-touchX;if(Math.abs(dx)>75){index=Math.max(0,Math.min(ordered.length-1,index+(dx<0?1:-1)));draw();}};if($('restore'))$('restore').onclick=()=>{if(event({kind:'plan-mark',doc,mark:e.mark,note:'Restored from history '+e.id})){ leaveOverlay().then(()=>showProduct(currentProduct)); }};}
  }draw();resolvePhotos();
}
function installSearchAssistUI(){
  const header=document.querySelector?.('header'),query=$('query'),scan=$('next-scan');
  if(!header||!query||!scan)return;
  query.setAttribute('role','combobox');query.setAttribute('aria-autocomplete','list');query.setAttribute('aria-controls','search-suggestions');query.setAttribute('aria-expanded','false');
  const panel=document.createElement('div');panel.id='search-assist';panel.className='search-assist';panel.hidden=true;
  panel.innerHTML='<div class="search-actions" aria-label="Search tools"><button id="paste-search-text" type="button" aria-label="Paste barcode, QR text or item name" data-icon="paste"><span>Paste text</span></button><button id="paste-search-image" type="button" aria-label="Paste an image of a barcode or QR code" data-icon="paste"><span>Paste image</span></button><button id="upload-search-image" type="button" aria-label="Upload an image of a barcode or QR code" data-icon="upload"><span>Upload image</span></button></div><div id="search-suggestions" role="listbox" aria-label="Item suggestions"></div>';
  header.insertBefore(panel,scan);
}
installSearchAssistUI();
$('search-form').onsubmit=e=>{e.preventDefault();hideSearchAssist();$('query').blur();if(/^app:/i.test($('query').value.trim())){openRoute($('query').value.trim());return;}leaveScreensForSearch();lookup($('query').value);};
$('query').onfocus=()=>{cancelTimer();if(native)native.stopCamera();showSearchAssist();};
$('query').oninput=()=>{window.clearTimeout(searchAssistTimer);searchAssistTimer=window.setTimeout(renderSearchSuggestions,180);};
$('query').onkeydown=e=>{
  if(e.key==='ArrowDown'){const first=$('search-suggestions')?.querySelector('[data-search-suggestion],[data-search-recent],[data-app-route]');if(first){e.preventDefault();first.focus();}}
  if(e.key==='Escape'&&!$('search-assist').hidden){e.preventDefault();hideSearchAssist();}
};
let searchAssistTimer=0;
function showSearchAssist(){const panel=$('search-assist');if(!panel)return;panel.hidden=false;$('query').setAttribute('aria-expanded','true');renderSearchSuggestions();}
function hideSearchAssist(){const panel=$('search-assist');if(!panel)return;panel.hidden=true;$('query').setAttribute('aria-expanded','false');window.clearTimeout(searchAssistTimer);}
function searchProducts(){return [...ProductCore.records(visibleEvents()),...(catalogue?.products||[]),...RetailerCore.products(state.retailerCache,RetailerCore.links(visibleEvents()))];}
function recentSearchLabel(value){const query=String(value||'').trim();if(!query)return '';const result=StockCore.searchDetailed(searchProducts(),searchableQuery(query)),groups=StockCore.group(result.matches);return !result.similar&&groups.length===1?groups[0].name:query;}
function renderSearchSuggestions(){
  const list=$('search-suggestions');if(!list||$('search-assist').hidden)return;
  const query=$('query').value.trim(),searchQuery=searchableQuery(query),recent=state.recent.filter(item=>!query||item.toLocaleLowerCase().includes(query.toLocaleLowerCase())||recentSearchLabel(item).toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0,query?2:5);
  if(/^app:/i.test(query)){renderAppRouteSuggestions(list,query);return;}
  const groups=query.length>=2&&catalogue?StockCore.group(StockCore.searchDetailed(searchProducts(),searchQuery).matches).slice(0,6):[];
  let html=groups.map((item,index)=>{
    const placements=item.placements.length,price=item.price?` · Label ${escapeHTML((item.currency||'')+item.price)}`:'',retailer=window.RetailerUI?.searchSummary(item)||'';
    return `<button type="button" role="option" class="search-suggestion" data-search-suggestion="${index}" data-icon="search"><strong>${escapeHTML(item.name)}</strong><span>${escapeHTML(item.barcode)} · ${placements} plan ${placements===1?'location':'locations'}${price}</span>${retailer?`<small>${escapeHTML(retailer)}</small>`:''}</button>`;
  }).join('');
  if(recent.length)html+=`<p class="search-section-label">${query?'Recent searches':'Recent'}</p>`+recent.map((item,index)=>`<button type="button" class="search-recent" data-search-recent="${index}" title="Search ${escapeHTML(item)}" data-icon="history">${escapeHTML(recentSearchLabel(item))}</button>`).join('');
  if(!html)html=query?( /^https?:\/\//i.test(query)?'<p class="muted search-empty">This QR link is not linked to a saved item yet. Search its product name or barcode first.</p>':'<p class="muted search-empty">No local suggestions. Press Find to search all saved plans.</p>'):'<p class="muted search-empty">Search a barcode or product name. Images and clipboard text stay on this device.</p>';
  list.innerHTML=html;
  list.onkeydown=event=>{const options=[...list.querySelectorAll('[data-search-suggestion],[data-search-recent],[data-app-route]')],index=options.indexOf(document.activeElement);if(event.key==='ArrowDown'&&index>=0){event.preventDefault();options[Math.min(index+1,options.length-1)]?.focus();}else if(event.key==='ArrowUp'&&index>=0){event.preventDefault();if(index===0)$('query').focus();else options[index-1]?.focus();}else if(event.key==='Escape'&&index>=0){event.preventDefault();hideSearchAssist();$('query').focus();}};
  list.querySelectorAll('[data-search-suggestion]').forEach(button=>button.onclick=()=>{const item=groups[Number(button.dataset.searchSuggestion)];if(item){hideSearchAssist();lookup(item.barcode);}});
  list.querySelectorAll('[data-search-recent]').forEach(button=>button.onclick=()=>{const item=recent[Number(button.dataset.searchRecent)];if(item){hideSearchAssist();lookup(item);}});
}
function acceptClipboardText(value){const input=$('query'),text=String(value||'').replace(/\0/g,'').trim().slice(0,4096);if(!text){$('status').textContent='The clipboard has no text. Copy a barcode, QR value or product name first.';return;}input.value=text;input.focus();showSearchAssist();renderSearchSuggestions();$('status').textContent='Clipboard text added. Check it, then press Find.';}
window.onClipboardText=acceptClipboardText;
window.onClipboardTextError=message=>{$('status').textContent=message||'Clipboard text unavailable. Tap the search field and use Paste.';$('query').focus();};
async function pasteSearchText(){if(native?.pasteClipboardText){native.pasteClipboardText();return;}try{if(!navigator.clipboard?.readText)throw Error('Clipboard access is unavailable here. Tap the search field and use Paste.');acceptClipboardText(await navigator.clipboard.readText());}catch(error){window.onClipboardTextError(error.message);}}
async function pasteSearchImage(){if(native?.pasteScanImage){hideSearchAssist();native.pasteScanImage();return;}try{if(!navigator.clipboard?.read)throw Error('Image clipboard access is unavailable here. Use Upload image instead.');for(const item of await navigator.clipboard.read()){const type=item.types.find(value=>value.startsWith('image/'));if(type){hideSearchAssist();await window.ImageTest.scan(await item.getType(type));return;}}throw Error('No copied image found. Choose Upload image instead.');}catch(error){showSearchAssist();$('query').focus();$('status').textContent=error.message||'Image clipboard unavailable. Use Upload image instead.';}}
$('paste-search-text').onclick=()=>void pasteSearchText();
$('paste-search-image').onclick=()=>void pasteSearchImage();
$('upload-search-image').onclick=()=>{hideSearchAssist();if(native)native.chooseScanImage();else $('scan-image-file').click();};
document.addEventListener('pointerdown',event=>{if(!$('search-assist').hidden&&!event.target.closest('#search-form,#search-assist'))hideSearchAssist();});
document.addEventListener('paste',event=>{if($('search-assist').hidden||native)return;const item=[...(event.clipboardData?.items||[])].find(value=>value.kind==='file'&&value.type.startsWith('image/'));if(item){event.preventDefault();hideSearchAssist();void window.ImageTest?.scan(item.getAsFile());}});
$('scan').onclick=$('next-scan').onclick=startScan;
let revealedMenuTile=null;
function hideMenuLabel(tile=revealedMenuTile){
  if(!tile)return;
  tile.classList.remove('is-label-visible');
  const tiles=tile.closest('.menu-tiles');if(tiles)tiles.classList.toggle('has-revealed-label',!!tiles.querySelector('.menu-tile.is-label-visible'));
  if(revealedMenuTile===tile)revealedMenuTile=null;
}
const menuPress=WorkflowCore.longPress({show:tile=>{if(revealedMenuTile&&revealedMenuTile!==tile)hideMenuLabel();tile.classList.add('is-label-visible');tile.closest('.menu-tiles')?.classList.add('has-revealed-label');revealedMenuTile=tile;},hide:hideMenuLabel},{setTimeout:(callback,ms)=>setTimeout(callback,ms),clearTimeout:id=>clearTimeout(id)});
$('modal').addEventListener('pointerdown',event=>{
  const tile=event.target.closest('.menu-tile');
  if(!tile||!$('modal').open)return;
  menuPress.start(tile,event.pointerId,event.clientX,event.clientY);
});
document.addEventListener('pointermove',event=>{
  menuPress.move(event.pointerId,event.clientX,event.clientY);
});
document.addEventListener('pointerup',event=>menuPress.end(event.pointerId));
document.addEventListener('pointercancel',event=>menuPress.end(event.pointerId,{cancelled:true}));
document.addEventListener('click',event=>{
  const tile=event.target.closest('.menu-tile');
  if(!tile||!menuPress.consumeClick(tile))return;
  event.preventDefault();
  event.stopImmediatePropagation();
},true);
$('app-menu').onclick=()=>{
  openModal(AppMenu.markup({item:!!currentProduct,build:currentBuildMarkup(),escape:escapeHTML}),false,'menu-popup');
  // A chooser has no selected item; offer retry tools without acting on a prior result.
  if(currentProduct){
    $('quick-map').onclick=()=>LocationMap.open(visibleEvents(),currentProduct.barcode);
    $('quick-retailer').onclick=()=>RetailerUI.details();
    $('quick-product').onclick=()=>productForm();
    $('quick-photo').onclick=addPhoto;
    $('quick-note').onclick=()=>locationForm();
    $('quick-history').onclick=()=>showHistory(visibleEvents().filter(e=>sameProductCode(e.product,currentProduct.barcode)));
  }
  $('quick-pins').onclick=()=>window.openPinnedLookups();
  $('quick-bookmark').onclick=()=>window.toggleBookmark();
  $('quick-refresh').onclick=()=>window.refreshApp();
  renderBookmarkTile();
  $('quick-forward').disabled=!canGoForward();
  $('quick-forward').onclick=()=>{if(canGoForward()){$('modal').close();history.forward();}};
  $('quick-back').disabled=!canGoBack();
  $('quick-back').onclick=()=>{if(canGoBack()){$('modal').close();window.stockAssistantBack();}};
  $('quick-whats-new').onclick=showWhatsNew;
  $('quick-image').onclick=()=>ImageTest.open();
  $('quick-shelf').onclick=()=>ShelfLabels.open();
  $('quick-recent').onclick=()=>openRecent();
  $('quick-urls').onclick=()=>openUrlsPage();
  $('quick-search').onclick=()=>{$('modal').close();document.body.classList.remove('has-results');$('query').focus();};
  $('settings').onclick=openSettings;
};
$('close-modal').onclick=()=>$('modal').close();
function currentBuildLabel(){const entry=Array.isArray(window.RELEASE_NOTES)?window.RELEASE_NOTES[0]:null;return entry?`Stock Assistant pilot ${entry.version} · ${entry.date}${entry.time?' · '+entry.time:''}`:'Stock Assistant pilot';}
function currentBuildMarkup(){return AppUI.iconMarkup('calendar','version-icon')+'<span>'+currentBuildLabel()+'</span>';}
function renderWhatsNew(){
  const entries=Array.isArray(window.RELEASE_NOTES)?window.RELEASE_NOTES:[];
  $('whats-new-content').innerHTML='<h1 class="release-page-title">'+AppUI.iconMarkup('sparkle','information-icon')+'What’s new</h1><p class="muted">Recent Stock Assistant updates · available offline.</p>'+entries.map(entry=>'<article class="release-note-item"><h2>Version '+escapeHTML(entry.version)+'</h2><p class="muted">'+escapeHTML(entry.date)+(entry.time?' · '+escapeHTML(entry.time):'')+'</p><ul>'+entry.changes.map(change=>'<li>'+escapeHTML(change)+'</li>').join('')+'</ul></article>').join('')+(entries.length?'':'<p>Update notes are not available in this build.</p>')+'<p class="muted release-note-footer">No network connection is needed to read these notes.</p>';
}
function enterWhatsNewPage(){if(pageOpen())hidePage({resume:false});pauseTimer();if($('modal')?.open)$('modal').close();document.body.classList.remove('settings-open');$('settings-screen').hidden=true;renderWhatsNew();document.body.classList.add('whats-new-open');$('whats-new-screen').hidden=false;window.scrollTo(0,0);recordAppScreen();$('whats-new-back').onclick=()=>window.stockAssistantBack();$('whats-new-back').focus();}
function leaveWhatsNewPage(){if(!$('whats-new-screen'))return;document.body.classList.remove('whats-new-open');$('whats-new-screen').hidden=true;}
function showWhatsNew(){enterWhatsNewPage();}
function openRecent(options={}){openPage('app:history',state.recent.length?'<p class="muted">Tap a search to open it again.</p>'+state.recent.map((q,i)=>`<button class="variant" data-recent="${i}" title="Search ${escapeHTML(q)}" data-icon="history">${escapeHTML(recentSearchLabel(q))}</button>`).join(''):'<p>No recent searches yet.</p>',options);document.querySelectorAll('[data-recent]').forEach(b=>b.onclick=()=>{leaveOverlay().then(()=>lookup(state.recent[Number(b.dataset.recent)],false,true));});}
async function restoredDataStatus(options={}){
 try{const records=await LocalPlatform.restoreReviews();openPage('app:restored-data','<p>'+(native?'Inspect retained original records against a snapshot of saved history. Native approval is not ready; keep a private export. Your history and photo queue stay unchanged.':'Choose which local records to recover. Shared updates keep their original ownership and wait for verified account recovery. Original backup evidence stays saved.')+'</p>'+records.map((record,index)=>`<article class="card"><p>${record.unreadable?'Unreadable evidence retained':`${record.events} observation${record.events===1?'':'s'} · ${record.photos} pending capture${record.photos===1?'':'s'}${record.nativeTickets?' · '+record.nativeTickets+' native ticket files':''}${record.sharing?' · shared-update evidence':''}`} · held</p>${record.unreadable?'':`<button data-recovery-review="${index}" data-icon="page">${native?'Inspect restored records':'Review local recovery'}</button>`}</article>`).join('')+(records.length?'':'<p>No restored data is waiting for review.</p>'),options);document.querySelectorAll('[data-recovery-review]').forEach(button=>button.onclick=()=>restoreRecoveryPreview(records[Number(button.dataset.recoveryReview)].id));}
 catch{$('status').textContent='Restored evidence could not be read. Keep your original ZIP; no review data has been removed.';}
}
async function restoreRecoveryPreview(id,offset=0){
 try{
  const preview=await LocalPlatform.previewRestoreRecovery(id,offset);
  if(!LocalPlatform.restorePreviewCurrent(preview.token))return false;
  openPage('app:recovery','<p>'+(preview.readOnly?'Read-only inspection. These original records remain saved for private export. Native recovery approval is not ready. Refresh to compare current saved history; shared and other-worker evidence stays held.':'Only selected records are recovered on this device. Original dates and ownership stay the same. Existing saved answers stay current. Different saved versions and shared updates stay in the backup.')+'</p>'+preview.candidates.map((candidate,index)=>{
   const item=candidate.event||{},allowed=!preview.readOnly&&['ready','existing'].includes(candidate.status),titles={'plan-mark':'Plan status','plan-comment':'Plan comment','phone-position':'Recorded phone position','retailer-link':'Official product link','label-photo':'Label photo','location':'Location observation','product':'Item details'},title=item.productName||item.name||item.product||item.barcode||candidate.documentName||titles[item.kind]||'Record kept for review',photo=item.thumbnail||item.photo||item.labelPhoto;
   return `<article class="card">${allowed?`<label class="recovery-choice"><input type="checkbox" data-recovery-key="${escapeHTML(candidate.key)}" data-original-id="${escapeHTML(item.id)}"> ${escapeHTML(title)}</label>`:`<strong>${escapeHTML(title)}</strong>`}<p class="muted">${escapeHTML(titles[item.kind]||'')}${item.at?' · '+escapeHTML(date(item.at)):''} · ${candidate.status==='existing'?'Already saved':candidate.status==='ready'?(preview.readOnly?'Retained local record':'Available to recover'):escapeHTML(candidate.reason)}</p>${item.area||item.section?`<p>${escapeHTML([item.area,item.section].filter(Boolean).join(' · '))}</p>`:''}${item.mark?`<p>Imported status: ${escapeHTML(item.mark)}</p>`:''}${candidate.status==='conflict'&&candidate.existing?.mark?`<p>Saved status: ${escapeHTML(candidate.existing.mark)}</p>`:''}${item.note?`<p>Imported: ${escapeHTML(item.note)}</p>`:''}${candidate.status==='conflict'&&candidate.existing?.note?`<p>Saved: ${escapeHTML(candidate.existing.note)}</p>`:''}${photo?`<img class="location-photo recovery-photo" data-local-photo="${escapeHTML(photo)}" alt="Original photo for ${escapeHTML(title)}">`:''}</article>`;
  }).join('')+`<p>${Math.min(offset+1,preview.total)}–${Math.min(offset+25,preview.total)} of ${preview.total}</p><p id="recovery-result" role="status"></p>${preview.readOnly?'':'<button id="recover-selected" class="primary" data-icon="check">Recover selected to this device</button>'}<button id="recovery-refresh" data-icon="refresh">Refresh preview</button>${offset?'<button id="recovery-previous" data-icon="previous">Previous records</button>':''}${offset+25<preview.total?'<button id="recovery-next" data-icon="next">More records</button>':''}`,{keepRecovery:true,title:preview.readOnly?'Inspect restored records':'Choose local recovery'});
  document.querySelectorAll('[data-recovery-key]').forEach(box=>box.onchange=()=>{if(box.checked)document.querySelectorAll('[data-recovery-key]').forEach(other=>{if(other!==box&&other.dataset.originalId===box.dataset.originalId)other.checked=false;});});resolvePhotos();
  $('recovery-refresh').onclick=()=>restoreRecoveryPreview(id,offset);if($('recovery-previous'))$('recovery-previous').onclick=()=>restoreRecoveryPreview(id,Math.max(0,offset-25));if($('recovery-next'))$('recovery-next').onclick=()=>restoreRecoveryPreview(id,offset+25);
  if($('recover-selected'))$('recover-selected').onclick=async()=>{const button=$('recover-selected'),message=$('recovery-result'),keys=[...document.querySelectorAll('[data-recovery-key]:checked')].map(box=>box.dataset.recoveryKey);button.disabled=true;try{const result=await LocalPlatform.recoverSelectedRestore(preview.token,keys);if(message.isConnected&&await restoreRecoveryPreview(id,offset))$('recovery-result').textContent=result.recovered+' recovered · '+result.existing+' already saved. Original evidence is kept.';if(currentProduct)renderObservations();}catch(error){if(message.isConnected)message.textContent=error.message;}finally{if(button.isConnected)button.disabled=false;}};
  return true;
 }catch(error){$('status').textContent=error.message;return false;}
}
let settingsOpener=null;
function enterSettingsPage(html){settingsOpener=document.activeElement;if(pageOpen())hidePage({resume:false});document.body.classList.remove('whats-new-open');$('whats-new-screen').hidden=true;pauseTimer();$('settings-content').innerHTML=html;document.body.classList.add('settings-open');$('settings-screen').hidden=false;window.scrollTo(0,0);recordAppScreen();$('settings-back').onclick=()=>window.stockAssistantBack();$('settings-back').focus();}
function leaveSettingsPage(){if(!$('settings-screen'))return;const hadFocus=$('settings-screen').contains(document.activeElement);document.body.classList.remove('settings-open');$('settings-screen').hidden=true;resumeTimer();if(hadFocus){const target=[settingsOpener,$('app-menu')].find(el=>el&&el!==document.body&&el.isConnected&&el.getClientRects().length);target?.focus();}settingsOpener=null;}
const openSettings=()=>{
  if($('modal').open)$('modal').close();
  if(pageOpen())hidePage({resume:false});
  enterSettingsPage(`
<label for="settings-search">Search settings</label><input id="settings-search" type="search" placeholder="Try GPS, timer, photos or plans" autocomplete="off"><div id="settings-search-results" role="list" aria-live="polite"></div>
<section class="settings-group"><h3>Appearance</h3><label for="high-contrast-borders">Border contrast</label><select id="high-contrast-borders"><option value="off">Standard · subtle borders</option><option value="on">High contrast · stronger borders</option></select><p>Light or dark colours follow your device. This only changes border strength.</p>${native?.setRotationAllowed?'<label for="auto-rotate">Screen rotation</label><select id="auto-rotate"><option value="off">Portrait only · recommended</option><option value="on">Rotate with the phone</option></select><p>Portrait keeps scanning and results steady. Rotate lets the screen turn to landscape when you turn the phone.</p>':''}</section>
<section class="settings-group"><h3>Scanning</h3><label for="auto-scan">Start the next scan</label><select id="auto-scan"><option value="0">When I tap Next scan</option><option value="15">After 15 seconds</option><option value="30">After 30 seconds</option><option value="60">After 60 seconds</option></select><p>Editing or leaving the app pauses the timer.</p><button id="settings-image" data-icon="photo">Scan a photo / try a sample</button></section>
<section class="settings-group"><h3>Photos</h3><label for="photo-quality">Photo storage</label><select id="photo-quality"><option value="balanced">Balanced · up to 1600 px / 320 KB</option><option value="compact">Smaller files · up to 1280 px / 200 KB</option><option value="detail">More detail · up to 2048 px / 600 KB</option></select><p>New photos are compressed with a small preview. Sizes are targets; originals are not retained.</p></section>
<section class="settings-group"><h3>Location</h3><label for="scan-position">Save phone position</label><select id="scan-position"><option value="off">Off</option><option value="on">After scans and location photos</option></select><p id="position-help" class="muted">Uses foreground permission. Saved coordinates include accuracy and time. Indoor GPS may be imprecise and does not confirm a shelf.</p><div class="actions"><button id="position-map" data-icon="map">Last-seen map</button><button id="position-history" data-icon="history">Position history</button></div></section>
<section class="settings-group"><h3>Plans and backups</h3><div class="actions"><button id="settings-plans" data-icon="page">Stored plans</button><button id="settings-import" data-icon="upload">Import plans or backup</button><button id="export" data-icon="download">Export backup</button><button id="retailer-settings" data-icon="store">Dunelm store and prices</button></div><p>Import PDFs or a workspace ZIP. Data stays on this device. Keep exports private: they can include photos and GPS positions.</p></section>
<section class="settings-group"><h3>Help</h3><button id="settings-whats-new" data-icon="sparkle">What’s new</button><p>Read recent app updates. Notes are saved on this device.</p></section><div id="settings-offline"></div><details class="settings-group" open><summary>Recovery and saved photos</summary><div id="settings-recovery-tools"></div></details><details class="settings-group"><summary>Account and other options</summary><button id="settings-account" data-icon="account">Account and membership</button><p><a href="delete-account.html">Privacy and data deletion</a></p></details><div id="settings-ready-update"></div><p class="source settings-version">${currentBuildMarkup()}</p>`);
  const settingsGroups=[...document.querySelectorAll('#settings-content .settings-group')];
  const settingsGroupIcons={Appearance:'appearance',Scanning:'barcode',Photos:'image',Location:'location','Plans and backups':'page',Help:'help','Recovery and saved photos':'list','Account and other options':'account','Offline plans':'page'};
  const settingsIcon=name=>AppUI.iconMarkup(settingsGroupIcons[name]||'info','settings-group-icon');
  settingsGroups.forEach((group,index)=>{group.id='settings-group-'+index;const heading=group.querySelector('h3,summary');if(heading){heading.classList.add('settings-heading');heading.insertAdjacentHTML('afterbegin',settingsIcon(heading.textContent.trim()));}});

  const settingSearch=[
    {name:'Border contrast',terms:'high contrast appearance theme accessibility borders stronger outline dark black subtle',group:0,target:'high-contrast-borders'},
    {name:'Screen rotation',terms:'rotate rotation landscape portrait orientation turn screen auto',group:0,target:'auto-rotate'},
    {name:'Automatic next scan',terms:'auto scan timer countdown seconds delay',group:1,target:'auto-scan'},
    {name:'Scan a photo or try a sample',terms:'camera image barcode testing demo',group:1,target:'settings-image'},
    {name:'Photo storage and compression',terms:'photo image size compression quality smaller optimise storage',group:2,target:'photo-quality'},
    {name:'Save phone position',terms:'gps location coordinate accuracy after scan privacy',group:3,target:'scan-position'},
    {name:'Last-seen map',terms:'gps map where item located',group:3,target:'position-map'},
    {name:'Position history',terms:'gps location previous records observations',group:3,target:'position-history'},
    {name:'Stored plans · archive or delete a PDF',terms:'pdf files documents offline downloaded data archive remove outdated wrong duplicate plan',group:4,target:'settings-plans'},
    {name:'Import plans or backup',terms:'pdf zip add winter seasonal workspace upload',group:4,target:'settings-import'},
    {name:'Export backup',terms:'save data copy export photos history gps',group:4,target:'export'},
    {name:'Dunelm store and prices',terms:'retailer stock price shop click collect',group:4,target:'retailer-settings'},
    {name:'What’s new',terms:'version release update changes history',group:5,target:'settings-whats-new'},
    {name:'Account and membership',terms:'sign in google login paid subscription',group:7,target:'settings-account'}
  ];
  const settingsSearch=$('settings-search'),settingsSearchResults=$('settings-search-results');
  const renderSettingSearch=()=>{
    const terms=settingsSearch.value.toLocaleLowerCase('en-GB').trim().split(/\s+/).filter(Boolean);
    if(!terms.length){settingsSearchResults.innerHTML='';settingsGroups.forEach(group=>group.hidden=false);return;}
    const hits=settingSearch.filter(item=>$(item.target)&&terms.every(term=>(item.name+' '+item.terms).toLocaleLowerCase('en-GB').includes(term)));
    settingsGroups.forEach(group=>group.hidden=true);
    settingsSearchResults.innerHTML=hits.length?hits.map(item=>`<button class="setting-search-hit" type="button" data-setting-target="${item.target}" data-setting-group="${item.group}" data-icon="search">${item.name}<small>${settingsGroups[item.group]?.querySelector('h3,summary')?.textContent||'Account'}</small></button>`).join(''):'<p class="muted">No matching setting. Try GPS, timer, photo size or plans.</p>';
  };
  settingsSearch.oninput=renderSettingSearch;
  $('settings-whats-new').onclick=showWhatsNew;
  settingsSearchResults.onclick=event=>{
    const hit=event.target.closest('[data-setting-target]');if(!hit)return;
    const group=settingsGroups[Number(hit.dataset.settingGroup)];if(group){group.hidden=false;if(group instanceof HTMLDetailsElement)group.open=true;}
    const target=$(hit.dataset.settingTarget);if(!target)return;
    settingsSearch.value='';renderSettingSearch();target.scrollIntoView({block:'nearest'});target.focus();
  };
  settingsSearchResults.onkeydown=event=>{if(event.key==='Escape'&&settingsSearch.value){event.preventDefault();settingsSearch.value='';renderSettingSearch();settingsSearch.focus();}};
  $('high-contrast-borders').value=state.settings.highContrastBorders?'on':'off';$('high-contrast-borders').onchange=()=>{const enabled=$('high-contrast-borders').value==='on';if(!updateSettings({highContrastBorders:enabled})){$('high-contrast-borders').value=state.settings.highContrastBorders?'on':'off';return;}document.documentElement.dataset.highContrast=enabled?'true':'false';};
  if(native?.setRotationAllowed){$('auto-rotate').value=native.rotationAllowed()?'on':'off';$('auto-rotate').onchange=()=>native.setRotationAllowed($('auto-rotate').value==='on');}
  if(stateReadFailed)$('settings-content').insertAdjacentHTML('afterbegin','<p role="alert">Saved data is unreadable. Changes are paused to protect it. Export a recovery backup with the original data for repair. Keep this backup private.</p>');
  if(window.LocalPlatform?.restoreReviews){
   $('settings-recovery-tools').insertAdjacentHTML('beforeend','<button id="restored-data-status" data-icon="info">Restored data status</button>');
   $('restored-data-status').onclick=restoredDataStatus;
  }
  if(!native&&window.LocalPlatform?.pendingPhotos){
   $('settings-recovery-tools').insertAdjacentHTML('beforeend','<h3>Photo recovery</h3><p id="web-photo-recovery">Checking retained photos…</p><button id="retry-web-photos" data-icon="refresh">Retry photo recovery</button>');
   const info=$('web-photo-recovery');LocalPlatform.pendingPhotos().then(result=>{if(info.isConnected)info.textContent=result.records.length+' completed photos waiting for their original item/workspace. '+(result.invalid?'Unreadable records are kept for review.':'');}).catch(()=>{if(info.isConnected)info.textContent='Recovery is unavailable. Tickets and files are retained; export a backup.';});
   $('retry-web-photos').onclick=async()=>{const result=await LocalPlatform.recoverPhotos();if(info.isConnected)info.textContent=result.recovered+' photos recovered. Original ownership is kept; remaining photos need their original workspace or storage space.';};
  }
  if(nativeWriter?.stale()){$('settings-content').insertAdjacentHTML('beforeend','<button id="reload-native-workspace" data-icon="refresh">Refresh saved history</button>');$('reload-native-workspace').onclick=()=>window.reloadNativeWorkspace();}
  if(native?.pendingPhotos){const pending=nativePendingPhotos();$('settings-recovery-tools').insertAdjacentHTML('beforeend','<h3>Photo recovery</h3><p>'+ (pending.unavailable?'Recovery could not be read. Existing photos and tickets are retained; export a private backup.':pending.records.length+' completed photos waiting to save. Recovery keeps the original item and capture time.')+'</p><button id="retry-photos" data-icon="refresh">Retry photo recovery</button><button id="saved-labels" data-icon="bookmarks">Saved label photos</button>');$('retry-photos').onclick=()=>window.onNativePhotosReady();$('saved-labels').onclick=()=>{const labels=visibleEvents().filter(e=>e.kind==='label-photo').slice().reverse();openPage('app:label-photos',''+labels.map((e,i)=>`<article class="card"><p>${escapeHTML(e.productName||e.product||'Item not yet identified')} · ${date(e.at)}</p><img class="location-photo" src="${/^local-/.test(e.thumbnail||e.photo)?'':escapeHTML(e.thumbnail||e.photo)}" ${/^local-/.test(e.thumbnail||e.photo)?`data-local-photo="${escapeHTML(e.thumbnail||e.photo)}"`:''} alt="Saved label photo for ${escapeHTML(e.productName||e.product||'an unidentified item')}"><button data-label-review="${i}" data-icon="label">Review item details</button></article>`).join('')+(labels.length?'':'<p>No saved label photos.</p>'));resolvePhotos();document.querySelectorAll('[data-label-review]').forEach(b=>b.onclick=()=>{const e=labels[Number(b.dataset.labelReview)];productForm({barcode:e.product,name:e.productName,labelPhoto:e.photo,labelEvent:e.id,source:'label-photo'});});};}
  $('photo-quality').value=state.settings?.photoQuality||'balanced';$('photo-quality').onchange=()=>{if(!updateSettings({photoQuality:$('photo-quality').value})){$('photo-quality').value=window.photoQuality();return;}if(native)native.photoProfile(state.settings.photoQuality);};
  $('settings-image').onclick=()=>ImageTest.open();$('auto-scan').value=String(state.settings.autoScan);$('auto-scan').onchange=()=>{if(!updateSettings({autoScan:Number($('auto-scan').value)})){$('auto-scan').value=String(state.settings.autoScan);return;}if(scanCycle){armTimer();pauseTimer();}};
  $('scan-position').value=state.settings?.scanPosition?'on':'off';$('scan-position').onchange=()=>{
    const previous=state.settings;state.settings={...state.settings,scanPosition:$('scan-position').value==='on'};
    if(!save()){state.settings=previous;$('scan-position').value=previous?.scanPosition?'on':'off';return;}
    if(native)native.locationEnabled(state.settings.scanPosition,true);if(!state.settings.scanPosition)cancelPosition();
  };
  $('position-map').onclick=()=>LocationMap.open(visibleEvents());$('retailer-settings').onclick=()=>RetailerUI.settings();
  $('position-history').onclick=()=>showHistory(visibleEvents().filter(e=>e.kind==='phone-position'),'','Position history');
  $('export').onclick=()=>{if(!window.LocalPlatform)return;const job=native?LocalPlatform.nativeBackup(state):LocalPlatform.backup(state);job.catch(()=>{$('status').textContent='Backup could not be created. Existing data is unchanged.';});};
  if(pendingWebUpdate){$('settings-ready-update').insertAdjacentHTML('beforeend','<button id="apply-web-update" data-icon="download">Apply ready app update</button>');$('apply-web-update').onclick=applyWebUpdate;}
  if(window.BundlePlans?.available())setupBundleSettings();
  document.querySelectorAll('#settings-offline .settings-group h3').forEach(heading=>{heading.classList.add('settings-heading');heading.insertAdjacentHTML('afterbegin',settingsIcon(heading.textContent.trim()));});

  $('settings-account').onclick=()=>AccountUI.open();$('settings-plans').onclick=()=>showStoredPlans();
  $('settings-import').onclick=()=>{$('modal').close();$('import-plans').click();};
};
$('modal').addEventListener('close',()=>{menuPress.cancel();if(revealedMenuTile)hideMenuLabel();window.LocalPlatform?.cancelRestoreRecovery?.();for(const view of planViews.keys())if($('modal').contains(view))releasePlanView(view);resumeTimer();});
const scrollTopButton=$('scroll-top');
function updateScrollTopButton(){const visible=window.scrollY>100;scrollTopButton.hidden=!visible;document.body.classList.toggle('has-scroll-top',visible);}
window.addEventListener('scroll',updateScrollTopButton,{passive:true});
scrollTopButton.onclick=()=>window.scrollTo({top:0,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
updateScrollTopButton();
document.addEventListener('visibilitychange',()=>{if(document.hidden){pauseTimer();cancelPosition();if(native)native.stopCamera();}else resumeTimer();});
window.onSharedText=text=>lookup(text);
window.onBackupResult=message=>{$('status').textContent=message;};
window.workspaceBackupSnapshot=pending=>{
  // A waiting window exports the latest committed history, not its startup copy.
  if(!native&&browserWriter?.mode()==='waiting')try{refreshBrowserWorkspace();}catch{}
  const photos=pendingPhotoEvents(nativePendingPhotos().records);
  // Avoid sorting/copying the whole history when there is nothing to reconcile.
  const recovered=pending.length?pending.reduce(RestoreCore.mergeWorkspace,state):state;
  const external=!native&&browserWriter?.mode()==='stale'?localStorage.getItem('stock-pilot-v1'):null;
  return {state:photos.length?RestoreCore.mergeWorkspace(recovered,{events:photos}):recovered,...(unreadableState!==null?{recoveryOriginalState:unreadableState}:external!==null?{recoveryOriginalState:external}:{})};
};
window.onWorkspaceRestored=async restored=>{const previous=state;state=RestoreCore.mergeWorkspace(state,restored);if(!save()){state=previous;throw Error('Observation storage unavailable.');}};
window.onLocalCatalogue=async data=>{
  if(!baseCatalogue)return;
  const previous=currentProduct,selected=previous?.placements[placementIndex],scroll=window.scrollY;
  catalogue=window.BundlePlans?BundlePlans.merge(baseCatalogue,data):{documents:[...baseCatalogue.documents,...data.documents],products:[...baseCatalogue.products,...data.products]};documents=new Map(catalogue.documents.map(d=>[d.id,d]));
  $('counts').textContent=`${catalogue.documents.length} plans · ${new Set(catalogue.products.map(p=>p.barcode)).size.toLocaleString('en-GB')} codes`;
  if(previous&&$('query').value){
    const refreshed=StockCore.searchDetailed([...ProductCore.records(visibleEvents()),...catalogue.products,...RetailerCore.products(state.retailerCache,RetailerCore.links(visibleEvents()))],$('query').value),groups=StockCore.group(refreshed.matches);
    const updated=groups.find(p=>previous.barcode?p.barcode===previous.barcode:p.name===previous.name);
    if(updated){lastMatches=refreshed.matches;$('status').textContent='';showProduct(updated,selected);window.scrollTo(0,scroll);}else lookup($('query').value,false,true);
  }
};
async function loadLocal(){if(window.LocalPlatform&&baseCatalogue){
 if(!native){try{await LocalPlatform.recoverWorkspaceRoot();workspaceRootReady=true;workspaceRootFailure='';if(browserWriter?.writable())$('workspace-status').hidden=true;}catch{workspaceRootReady=false;try{unreadableState=localStorage.getItem('stock-pilot-v1');}catch{}workspaceRootFailure='Committed workspace recovery needs review. Writes are paused; export a recovery backup in Settings.';$('status').textContent=workspaceRootFailure;$('workspace-status').hidden=false;$('workspace-status').textContent=workspaceRootFailure;}}
 if((native||browserWriter?.writable())&&workspaceRootReady)try{await LocalPlatform.recoverWorkspace();}catch{$('status').textContent='Workspace recovery is waiting for storage. Existing history and restored files are retained; free space and reopen.';}
 if(!native&&browserWriter?.writable()&&workspaceRootReady)try{const result=await LocalPlatform.recoverPhotos();if(result&&result.records.length>result.recovered)$('status').textContent='Photos are retained for their original items and are waiting to save. Retry in Settings or export a backup.';}catch{$('status').textContent='Photo recovery is waiting; original tickets and files are retained.';}
 if(window.BundlePlans?.available()&&!BundlePlans.enabled())await LocalPlatform.removeBundledPlans();await window.onLocalCatalogue(await LocalPlatform.catalogue());resolvePhotos();
}}
window.addEventListener('local-platform-ready',()=>loadLocal().catch(()=>{$('status').textContent='Browser storage unavailable. Existing bundled plans remain searchable.';}));
$('import-plans').onclick=()=>{if(native)native.importPlans();else $('plan-files').click();};
$('plan-files').onchange=async e=>{try{await LocalPlatform.importFiles([...e.target.files]);}catch(error){$('status').textContent=error.message;}finally{e.target.value='';}};
let importQueue=Promise.resolve();
window.onImportURL=(name,url)=>{importQueue=importQueue.then(async()=>{try{const response=await fetch(url);if(!response.ok)throw Error('Selected file unavailable');await LocalPlatform.importFiles([new File([await response.blob()],name)]);}catch(error){$('status').textContent=error.message;}finally{native.importDone(url.split('/').at(-1));}});};
BundlePlans.catalogue().then(async data=>{
  baseCatalogue=data;catalogue=data;catalogueLoading=true;documents=new Map(data.documents.map(d=>[d.id,d]));
  // Before the first await: a search typed while loading then becomes a new entry and never overwrites this base entry.
  initializeAppHistory();
  // Lookups stay paused until imported plans are merged; otherwise a search typed now sees only the bundled set.
  // A storage failure must not strand a search typed during loading: the bundled plans still answer it, and the queued lookup runs below.
  try{await window.onLocalCatalogue({documents:[],products:[]});await loadLocal();}
  catch{$('status').textContent='Browser storage unavailable. Existing bundled plans remain searchable.';}
  finally{catalogueLoading=false;}
  if(BundlePlans.available()&&!BundlePlans.enabled()){await BundlePlans.purge();await window.LocalPlatform?.removeBundledPlans();}
  startupScreen();
  if(native){native.photoProfile(window.photoQuality());native.locationEnabled(!!state.settings?.scanPosition,false);native.ready(catalogue.products.length>0);}
}).catch(()=>{$('status').textContent='The bundled catalogue could not be loaded. Restart the app; existing observations remain saved.';});
let pendingWebUpdate=null,webUpdateApplying=false;
function applyWebUpdate(){if(!pendingWebUpdate||!save())return;webUpdateApplying=true;if(pendingWebUpdate.state==='activated')location.reload();else pendingWebUpdate.postMessage({type:'ACTIVATE'});}
if(!native&&'serviceWorker' in navigator){
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(webUpdateApplying)location.reload();});
 navigator.serviceWorker.register('../sw.js').then(registration=>{
  registration.update();const notify=worker=>{if(worker?.state==='installed'&&navigator.serviceWorker.controller){pendingWebUpdate=worker;$('status').textContent='Update ready. Open Settings to apply it; local plans and history stay saved.';}};
  if(registration.waiting)notify(registration.waiting);registration.addEventListener('updatefound',()=>{const installing=registration.installing;installing?.addEventListener('statechange',()=>notify(installing));});
 }).catch(()=>{});
}


document.addEventListener('click',async e=>{const image=e.target.closest('[data-full-photo]');if(image){const url=await (window.LocalPlatform?.photoUrl(image.dataset.fullPhoto)||image.dataset.fullPhoto);openModal(`<img class="full-plan" src="${escapeHTML(url)}" alt="Full location evidence photo">`,false,'viewer');}});
document.addEventListener('keydown',e=>{if(e.target.matches('[data-full-photo]')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.target.click();}});
// Lists only the keys the app handles: ? here, Escape for dialogs and Settings search, Enter in search and on plans/photos, and Tab.
function openShortcutSheet(options={}){openPage('app:shortcuts','<dl class="shortcut-sheet"><dt><kbd>?</kbd></dt><dd>Show this list. Works when no text field or dialog is open.</dd><dt><kbd>Esc</kbd></dt><dd>Close the open dialog or page. In Settings search, clear the search first.</dd><dt><kbd>Enter</kbd></dt><dd>Find the typed barcode or name in the search box, or open the focused plan or photo.</dd><dt><kbd>Tab</kbd></dt><dd>Move between controls. Shift+Tab moves back.</dd></dl>',options);}
document.addEventListener('keydown',e=>{if(e.key!=='?'||e.ctrlKey||e.metaKey||e.altKey||overlayOpen()||e.target.closest?.('input,textarea,select,[contenteditable]'))return;e.preventDefault();openShortcutSheet();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&pageOpen()&&!$('modal').open&&!e.target.closest?.('input,textarea,select,[contenteditable]')){e.preventDefault();closeOverlay();}});

function setupBundleSettings(){
  const enabled=BundlePlans.enabled();
  $('settings-offline').insertAdjacentHTML('beforeend',`<section class="settings-group"><h3>Offline plans</h3><p id="bundle-readiness" class="muted" role="status">Checking saved files…</p><p id="bundle-storage" class="muted"></p><button id="bundle-protect" hidden data-icon="lock">Protect saved files from automatic clearing</button><h3>Temporary Kingston plans</h3><p id="bundle-help" class="muted">${enabled?'Kingston plans are enabled. Opened PDFs are saved for offline use.':'Kingston plans are off. This browser will keep them off after updates.'}</p><button id="bundle-toggle" data-icon="sliders"${enabled?' data-tone="danger"':''}>${enabled?'Remove Kingston plans and keep them off':'Re-enable Kingston plans'}</button>${enabled?'<button id="bundle-offline" data-icon="download">Save missing plans for offline use</button>':''}</section>`);
  $('bundle-readiness').insertAdjacentHTML('afterend','<button id="bundle-app-save" hidden data-icon="download">Restore missing app files for offline opening</button>');
  const readiness=$('bundle-readiness'),storage=$('bundle-storage'),protect=$('bundle-protect'),download=$('bundle-offline'),appSave=$('bundle-app-save');let downloading=false,refresh=0;
  async function check(){
    const attempt=++refresh;
    try{
      const info=await BundlePlans.offlineStatus();if(!readiness.isConnected||attempt!==refresh)return;
      const app=info.app.ready?'App files saved for offline opening.':info.app.status==='not-installed'?'App files are not installed offline yet.':info.app.status==='incomplete'?'Some app files are missing. Restore them with a connection.':'App offline opening could not be confirmed yet.';
      appSave.hidden=info.app.status!=='incomplete';
      readiness.textContent=app+' '+(info.enabled?`${info.saved} of ${info.total} Kingston plans saved. ${info.catalogueSaved?'Item search saved.':'Item search not saved offline yet.'}`:'Kingston plans are off.');
      storage.textContent=info.persistence==='granted'?'Storage protection granted. Clearing site data still removes saved files; keep a workspace backup.':info.persistence==='not-granted'?'Storage protection is not granted. This browser may clear saved files; keep a workspace backup.':info.persistence==='unavailable'?'This browser does not offer storage protection. Keep a workspace backup.':'Storage protection could not be checked. Keep a workspace backup.';
      protect.hidden=!['not-granted','unknown'].includes(info.persistence);
      if(download&&!downloading){const remaining=STOCK_BUNDLE.documents.filter(d=>info.missing.includes(d.id)).reduce((sum,d)=>sum+(d.bytes||0),0);download.disabled=!info.enabled||(info.saved===info.total&&info.catalogueSaved);download.textContent=download.disabled&&info.enabled?'All Kingston plans and item search saved':`Save missing plans for offline use${remaining?' · about '+Math.ceil(remaining/1048576)+' MB':''}`;}
    }catch{if(readiness.isConnected&&attempt===refresh){readiness.textContent='Saved files could not be checked. Existing work is kept; retry by reopening Settings.';}}
  }
  protect.onclick=async()=>{protect.disabled=true;await BundlePlans.requestPersistence();await check();if(protect.isConnected)protect.disabled=false;};
  appSave.onclick=async()=>{appSave.disabled=true;const result=await BundlePlans.saveApp();if(appSave.isConnected){$('bundle-help').textContent=result.ready?'Missing app files saved.':'App files could not all be saved. Existing files are kept; retry with a connection.';appSave.disabled=false;}await check();};
  const changed=()=>{if(readiness.isConnected)void check();};navigator.serviceWorker?.addEventListener('controllerchange',changed);
  $('modal').addEventListener('close',()=>navigator.serviceWorker?.removeEventListener('controllerchange',changed),{once:true});
  $('bundle-toggle').onclick=async()=>{
    $('bundle-toggle').disabled=true;
    try{await BundlePlans.setEnabled(!enabled);baseCatalogue=await BundlePlans.catalogue();currentProduct=null;await loadLocal();$('results').innerHTML='';document.body.classList.remove('has-results');$('status').textContent=enabled?'Kingston plans removed and kept off in this browser. Your photos, notes and other plans are retained.':'Kingston plans enabled.';$('modal').close();}
    catch(error){$('bundle-help').textContent=error.message+(!BundlePlans.enabled()?' Kingston plans are kept off; removal will be retried when you reopen the app.':'');$('bundle-toggle').disabled=false;}
  };
  if(download)download.onclick=async()=>{downloading=true;download.disabled=true;$('bundle-help').textContent='Saving missing plans. Files already saved are kept.';try{await BundlePlans.downloadAll((done,total)=>{if(download.isConnected)download.textContent=`Saving plans · ${done}/${total}`;});if(download.isConnected)$('bundle-help').textContent='Download finished. Saved files are checked below.';}catch(error){if(download.isConnected)$('bundle-help').textContent=error.name==='QuotaExceededError'?'Not enough browser storage. Saved files are kept. Export a backup before making space.':error.message;}finally{downloading=false;await check();}};
  void check();
}
window.openAccountModal=(html,options={})=>openPage('app:account',html,options);
window.openWorkflowPresets=(options={})=>{
  if(!AccountUI.has('workflow-presets')){AccountUI.open();return;}
  const presets=Array.isArray(state.settings.workflowPresets)?state.settings.workflowPresets:[];
  openPage('app:presets',`<p class="muted">Keep different scan timers and photo settings for different jobs. Your ordinary settings stay available without membership.</p><label for="preset-name">Name for current settings</label><input id="preset-name" maxlength="40" placeholder="e.g. Warehouse"><button id="preset-save" data-icon="check">Save current settings</button><p id="preset-help" role="status"></p>${presets.map((p,i)=>`<div class="actions"><button data-preset="${i}" data-icon="sliders">${escapeHTML(p.name)}</button><button data-preset-delete="${i}" data-icon="trash">Remove</button></div>`).join('')}`,options);
  $('preset-save').onclick=()=>{if(!AccountUI.has('workflow-presets'))return AccountUI.open();const name=$('preset-name').value.trim();if(!name){$('preset-help').textContent='Enter a name.';return;}if(presets.length>=10){$('preset-help').textContent='You can save up to 10 presets.';return;}const previous=state.settings,s=state.settings;state.settings={...s,workflowPresets:[...presets,{name,autoScan:s.autoScan,scanPosition:s.scanPosition,planZoom:s.planZoom,photoQuality:s.photoQuality||'balanced'}]};if(save())window.openWorkflowPresets();else state.settings=previous;};
  document.querySelectorAll('[data-preset]').forEach(button=>button.onclick=()=>{if(!AccountUI.has('workflow-presets'))return AccountUI.open();const previous=state.settings,p=presets[Number(button.dataset.preset)];state.settings={...state.settings,autoScan:[0,15,30,60].includes(p.autoScan)?p.autoScan:60,scanPosition:p.scanPosition===true,planZoom:p.planZoom!==false,photoQuality:['balanced','compact','detail'].includes(p.photoQuality)?p.photoQuality:'balanced'};if(save()){leaveOverlay().then(()=>{cancelTimer();$('status').textContent='Workflow preset applied: '+p.name;});}else state.settings=previous;});
  document.querySelectorAll('[data-preset-delete]').forEach(button=>button.onclick=()=>{if(!AccountUI.has('workflow-presets'))return AccountUI.open();const previous=state.settings;state.settings={...state.settings,workflowPresets:presets.filter((_,i)=>i!==Number(button.dataset.presetDelete))};if(save())window.openWorkflowPresets();else state.settings=previous;});
};

// Bookmarks are the pinned-lookups list, keyed by the item's barcode (or the typed query when it has none).
function bookmarkKey(){return currentProduct?(currentProduct.barcode||$('query').value):'';}
// Like Chrome's star, the bookmark control shows whether the open item is saved. With no open item it is unavailable.
function renderBookmarkTile(){
  const tile=$('quick-bookmark');if(!tile)return;
  const key=bookmarkKey(),saved=!!key&&BookmarkCore.isBookmarked(state.pinnedLookups,key);
  const label=saved?'Remove bookmark':'Bookmark';
  tile.disabled=!key;tile.setAttribute('aria-pressed',String(saved));tile.setAttribute('aria-label',label);tile.querySelector('.menu-tile-label').textContent=label;
  tile.title=key?label:'Open an item to bookmark it';
}
// The star adds or removes a bookmark and leaves the menu open. Bookmarks are free for everyone, with or without membership.
window.toggleBookmark=async()=>{
  if(!currentProduct)return;
  const result=BookmarkCore.toggle(Array.isArray(state.pinnedLookups)?state.pinnedLookups:[],{query:bookmarkKey(),name:currentProduct.name||bookmarkKey()}),status=$('menu-status');
  if(result.saved===null){if(status)status.textContent=`You can bookmark up to ${BookmarkCore.LIMIT} items. Remove an old bookmark first.`;return;}
  const previous=state;state={...state,pinnedLookups:result.bookmarks};if(!save()){state=previous;return;}
  if(status)status.textContent=result.saved?'Bookmarked.':'Bookmark removed.';
  renderBookmarkTile();
};
// Chrome's refresh reloads the page. Here the web app starts again from the records saved on this device, which clears anything stuck in memory. It cannot repair a fault in the app's own code.
window.refreshApp=()=>{
  if(workspaceCommitBusy){$('menu-status').textContent='Saving is still running. Try again in a moment.';return;}
  if(pageOpen()||settingsOpen()||document.body.classList.contains('whats-new-open')){
    confirmDialog('<h2>Refresh the app?</h2><p>Saved records stay on this device. Anything typed on this screen and not saved is lost.</p><div class="actions"><button id="confirm-refresh" type="button" data-icon="refresh">Refresh</button><button id="cancel-refresh" type="button" data-icon="close">Cancel</button></div>');
    $('confirm-refresh').onclick=()=>location.reload();
    $('cancel-refresh').onclick=()=>$('modal').close();
    return;
  }
  location.reload();
};
window.openPinnedLookups=(options={})=>{
  const pins=Array.isArray(state.pinnedLookups)?state.pinnedLookups:[];
  openPage('app:pins',`<p class="muted">Open common items without typing or scanning. Locations come from your currently enabled plans.</p>${pins.map((p,i)=>`<div class="actions"><button data-pin="${i}" data-icon="pin">${escapeHTML(p.name)}</button><button data-unpin="${i}" data-icon="close">Remove</button></div>`).join('')||'<p>Open an item, then tap Bookmark in the ⋮ menu.</p>'}`,options);
  document.querySelectorAll('[data-pin]').forEach(button=>button.onclick=()=>{leaveOverlay().then(()=>lookup(pins[Number(button.dataset.pin)].query,false,true));});
  document.querySelectorAll('[data-unpin]').forEach(button=>button.onclick=()=>{const previous=state;state={...state,pinnedLookups:pins.filter((_,i)=>i!==Number(button.dataset.unpin))};if(save())window.openPinnedLookups();else state=previous;});
};

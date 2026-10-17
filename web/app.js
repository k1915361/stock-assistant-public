'use strict';
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const native = window.Native || null;
let catalogue, baseCatalogue, documents, currentProduct, lastMatches = [], renderCounter = 0, timer = null, placementIndex=0;
let state = {events:[], recent:[], settings:{}};
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
if(native&&!stateReadFailed)try{nativeWriter=NativeWorkspaceWriter({bridge:native,expected:expectedNativeState});}catch{stateReadFailed=true;$('status').textContent='Safe native saving is unavailable. Keep a private backup.';}
function nativeSaveError(message){
 $('status').textContent=message;
 if($('modal').open){let warning=$('workspace-save-error');if(!warning){warning=document.createElement('p');warning.id='workspace-save-error';warning.setAttribute('role','alert');$('modal-content').append(warning);}warning.textContent=message;
  if(nativeWriter?.stale()&&!$('reload-native-workspace')){const button=document.createElement('button');button.id='reload-native-workspace';button.textContent='Refresh saved history';button.onclick=()=>window.reloadNativeWorkspace();$('modal-content').append(button);}
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
   if($('modal').open){
    let warning=$('workspace-save-error');if(!warning){warning=document.createElement('p');warning.id='workspace-save-error';warning.className='muted';warning.setAttribute('role','alert');$('modal-content').append(warning);}
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
  const open=()=>{
   openModal('<p>Full original page. Pinch to zoom.</p><div id="browser-full-plan"></div>');
   const full=browserPlanView(data);full.view.classList.add('original-preview');full.view.removeAttribute('role');full.view.removeAttribute('tabindex');full.view.setAttribute('aria-label','Full original page');$('browser-full-plan').append(full.view);planViews.get(full.view).pending=false;
  };
  presentation.view.onclick=open;presentation.view.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};
  try{await presentation.image.decode();if(!node.isConnected||node.dataset.request!==request){releasePlanView(presentation.view);return;}node.replaceChildren(presentation.view);planViews.get(presentation.view).pending=false;releaseDetachedPlanViews();}
  catch{if(node.isConnected&&node.dataset.request===request)node.innerHTML='<p>Source image could not be loaded.</p>';releasePlanView(presentation.view);}
}
const suppliedPhotos={};
const autoScanner=WorkflowCore.scheduler(startScan,{now:()=>Date.now(),setTimeout:(callback,ms)=>setTimeout(callback,ms),clearTimeout:id=>clearTimeout(id)});
let scanCycle=false,scanTick=null,cameraActive=false;
function updateCountdown(){const seconds=autoScanner.seconds();$('next-scan').textContent=seconds===null?'Next scan':`Next scan · ${seconds}s`;clearTimeout(scanTick);if(seconds!==null)scanTick=setTimeout(updateCountdown,1000);}
function pauseTimer(){autoScanner.pause();updateCountdown();}
function resumeTimer(){if(scanCycle&&!cameraActive&&!document.hidden&&!$('modal').open){autoScanner.resume();updateCountdown();}}
function openModal(html,keepRecovery=false) {if(!keepRecovery)window.LocalPlatform?.cancelRestoreRecovery?.();$('modal-content').ontouchstart=null;$('modal-content').ontouchend=null;pauseTimer(); $('modal-content').innerHTML=html;const title=$('modal-content').querySelector('h2');if(title){title.id=title.id||'modal-title';$('modal').setAttribute('aria-labelledby',title.id);}else $('modal').removeAttribute('aria-labelledby'); $('modal').showModal();$('modal').scrollTop=0;}
function cancelTimer(){scanCycle=false;autoScanner.stop();updateCountdown();}
function armTimer(){scanCycle=true;autoScanner.arm(Number(state.settings.autoScan));if(document.hidden||$('modal').open)autoScanner.pause();updateCountdown();}
function startScan(){cancelTimer();cameraActive=true; $('modal').close(); if(native) native.scan(); else if(window.LocalPlatform)LocalPlatform.scan();else $('status').textContent='Camera tools are loading. You can still search by barcode or name.';}
function storedPlanSummary(){
  const plans=catalogue?.documents||[],products=catalogue?.products||[];
  const demoId='i9319a4ec63432ebf221d319a';
  return {plans,codes:new Set(products.map(p=>p.barcode)).size,onlyDemo:plans.length>0&&plans.every(d=>d.id===demoId)};
}
function showStoredPlans(){
  const {plans,codes}=storedPlanSummary();
  openModal(`<h2>Plans stored ${native?'on this device':'in this browser'}</h2><p>${plans.length} plans · ${codes.toLocaleString('en-GB')} searchable codes</p>${native?'':'<p class="muted">Android and each web browser keep separate files. Import the Android workspace ZIP to use the same plans here.</p>'}${plans.map(d=>{const count=new Set(catalogue.products.filter(p=>p.doc===d.id).map(p=>p.barcode)).size;return `<p><strong>${escapeHTML(d.name)}</strong><br><span class="muted">${Number(d.pages)||0} pages · ${count.toLocaleString('en-GB')} searchable codes${count?'':' · No codes extracted; this plan may need OCR.'}</span></p>`;}).join('')||'<p>No plans imported yet.</p>'}<button id="stored-import" class="primary">Import plans / workspace ZIP</button>`);
  $('stored-import').onclick=()=>{$('modal').close();$('import-plans').click();};
}
function lookup(query, scanned=false, refresh=false) {
  if (!catalogue) return;
  if(!refresh)cancelTimer();
  if(native) native.stopCamera();
  document.body.classList.add('has-results');
  $('query').value=query;
  const searchResult=StockCore.searchDetailed([...ProductCore.records(visibleEvents()),...catalogue.products,...RetailerCore.products(state.retailerCache,RetailerCore.links(visibleEvents()))],query);
  lastMatches=searchResult.matches;
  const groups=StockCore.group(lastMatches);
  const placementCount=groups.reduce((count,g)=>count+g.placements.length,0);
  $('status').textContent=groups.length ? `${searchResult.similar?'Similar names · ':''}${groups.length} product${groups.length===1?'':'s'} · ${placementCount} plan placement${placementCount===1?'':'s'}` : 'No match in these imported plans. This does not mean zero stock.';
  if(query.trim()) {const previous=state;state={...state,lastQuery:query,recent:[query,...state.recent.filter(q=>q!==query)].slice(0,25)};if(!save())state=previous;}
  if(groups.length===1&&!searchResult.similar) showProduct(groups[0]);
  else if(groups.length) {
    currentProduct=null;
    $('results').innerHTML='<p>'+(searchResult.similar?'Similar names found. Choose the correct item and colour.':'Choose the exact product or variant.')+'</p>'+groups.slice(0,100).map((g,i)=>`<button class="variant" data-group="${i}"><strong>${escapeHTML(g.name)}</strong><span class="code">${escapeHTML(g.barcode)}</span> <span class="badge">${g.placements.length} placement${g.placements.length===1?'':'s'}</span></button>`).join('')+(groups.length>100?'<p>Narrow your search to see more results.</p>':'');
    document.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>showProduct(groups[Number(b.dataset.group)]));
  } else {
    currentProduct={barcode:(!/^https?:/i.test(query.trim())&&(scanned||/^\d{6,14}$/.test(query.trim())))?query.trim():'',name:query,placements:[]};
    const available=storedPlanSummary();
    const sourceHelp=window.BundlePlans?.available()&&!BundlePlans.enabled()?'Kingston plans are switched off by your saved preference. Re-enable them in Settings to search them again.':available.onlyDemo?'Only the test plan is stored here. Import your real plans to search your store.':available.plans.length?`Searched ${available.plans.length} stored plans · ${available.codes.toLocaleString('en-GB')} codes. The relevant plan may be missing or have no searchable text.`:'No plans are stored here. Import your PDFs or Android workspace ZIP.';
    $('results').innerHTML=`<div class="empty"><h2>Not found ${native?'on this device':'in this browser'}</h2><p>${sourceHelp}</p>${native?'':'<p class="muted">Plans in the Android app are not automatically copied to this browser.</p>'}<div class="actions"><button id="unknown-import" class="primary">Import plans / workspace ZIP</button><button id="unknown-plans">See stored plans</button></div><details><summary>Record an item / read a label</summary><div class="actions"><button id="unknown-label">Read a label photo</button><button id="unknown-product">Enter item details</button><button id="unknown-photo">Location photo</button></div>${/^https?:/.test(query)?'<p>Paste the page text, name or barcode into item details.</p>':''}</details></div>`;
    $('unknown-import').onclick=()=>$('import-plans').click();$('unknown-plans').onclick=showStoredPlans;
    $('unknown-photo').onclick=addPhoto;
    $('unknown-product').onclick=()=>productForm();$('unknown-label').onclick=readLabel;
    renderObservations();
  }
  if(scanned) armTimer();
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
  cameraActive=false;lookup(code,source==='camera');
  if(source==='camera')capturePosition({product:currentProduct?.barcode||'',productName:currentProduct?.name||'',query:code,trigger:'barcode-scan',capturedAt:new Date(Number(capturedAt)).toISOString()});
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
function showProduct(product,selected=null) {
  currentProduct=product;
  placementIndex=selected?Math.max(0,product.placements.findIndex(p=>p.doc===selected.doc&&p.page===selected.page&&p.position===selected.position)):0;
  $('results').innerHTML=`<article class="card product-card"><h1>${escapeHTML(product.name)}</h1><p class="code">${escapeHTML(product.barcode)}${product.price?' · Label price '+escapeHTML((product.currency||'')+product.price):''}</p><div id="latest-location"></div><div id="retailer-summary" class="retailer-summary"></div></article><section id="placements" aria-label="Plan placements"></section><details id="secondary-actions"><summary>Photo, item details, location notes and history</summary><div class="actions"><button id="add-photo" aria-label="Add location photo">Photo</button><button id="add-note" aria-label="Record location">Location note</button><button id="edit-product">Item details / read label</button><button id="product-history" aria-label="Location history">History</button></div>${product.description?'<p>'+escapeHTML(product.description)+'</p>':''}</details><section id="observations" aria-label="Worker observations"></section>`;
  $('add-photo').onclick=addPhoto;
  $('add-note').onclick=()=>locationForm();
  $('edit-product').onclick=()=>productForm(product);
  $('product-history').onclick=()=>showHistory(visibleEvents().filter(e=>sameProductCode(e.product,product.barcode) || (!product.barcode && e.productName===product.name)));
  renderObservations();
  window.ShelfLabels?.show(product);
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
    card.innerHTML=`<div class="plan-heading">${escapeHTML([p.season,p.heading||p.title||doc.name].filter(Boolean).join(' · '))}</div><p class="plan-location">${escapeHTML(locationSummary(p))}</p>${mark==='outdated'?'<p class="warning">Reported outdated · check observations</p>':''}${product.placements.length>1?`<div class="placement-switch"><button id="previous-placement" aria-label="Previous placement" ${placementIndex===0?'disabled':''}>‹</button><label class="sr-only" for="placement-choice">Choose placement</label><select id="placement-choice">${product.placements.map((item,i)=>`<option value="${i}" ${i===placementIndex?'selected':''}>${i+1}/${product.placements.length} · ${escapeHTML(locationSummary(item)||item.title)}</option>`).join('')}</select><button id="next-placement" aria-label="Next placement" ${placementIndex===product.placements.length-1?'disabled':''}>›</button></div>`:''}<div class="plan-frame" id="plan-0" aria-label="Matching display area"><p>Opening local plan…</p></div><p class="verification">${mark==='outdated'?'Reported outdated':'Floor layout unverified'}${p.markers.length?'':' · Position marker unavailable'} · ${escapeHTML(p.title)} · PDF ${p.diagramPage}</p><details class="plan-details"><summary>Full source, product text and plan history</summary><p>${escapeHTML(p.rowText||p.name)}${p.status?' · Plan status: '+escapeHTML(p.status):''}${p.fill?' · Plan fill: '+escapeHTML(p.fill)+' (not a stock count)':''}</p>${p.sourceBarcode?`<p class="source identifier-note">Source prints ${escapeHTML(p.sourceBarcode)} · matched UPC ${escapeHTML(p.barcode)}. Leading zero restored from recorded manufacturer evidence.</p>`:''}<p class="source">${escapeHTML(doc.name)} · PDF page ${p.page}${p.printed?' · '+escapeHTML(p.printed):''}<br>${doc.sourceUpdated?'Source updated '+escapeHTML(doc.sourceUpdated):'Source update date unknown · Added '+escapeHTML(doc.added)}</p><p class="muted">Yellow/red rings and arrows: candidate position markers. Blue box: matching barcode. Planned placement, not verified stock.</p><div class="actions"><button class="table">Product list page</button><button class="comment">Comment / mark plan</button><button class="history">Plan history</button></div></details>`;
    if(p.position)card.querySelector('.plan-location').innerHTML=`<span class="position-cue">Find number <strong>${escapeHTML(p.position)}</strong></span> <span>${escapeHTML([p.fixture,p.bay].filter(Boolean).join(' · '))}</span>`;
    placements.append(card);
    const focus=WorkflowCore.focus(p.images||[],p.markers||[]);
    if(focus){card.querySelector('.plan-heading').insertAdjacentHTML('afterend','<button class="quiet zoom-toggle" id="toggle-zoom">'+(state.settings.planZoom?'Full page':'Zoom display')+'</button>');$('toggle-zoom').onclick=()=>{if(updateSettings({planZoom:!state.settings.planZoom}))showPlacement();};}
    renderPlan(p.doc,p.diagramPage,p.diagramPage===p.page?p.codeBoxes:[],p.markers,'plan-0',state.settings.planZoom?focus:null,[p.position]);
    if($('placement-choice')){
      const change=index=>{placementIndex=index;showPlacement();window.scrollTo(0,0);};
      $('placement-choice').onchange=e=>change(Number(e.target.value));
      $('previous-placement').onclick=()=>change(placementIndex-1);$('next-placement').onclick=()=>change(placementIndex+1);
      let touchX;card.ontouchstart=e=>{touchX=e.changedTouches[0].clientX;};card.ontouchend=e=>{const delta=e.changedTouches[0].clientX-touchX;if(Math.abs(delta)>90){const next=placementIndex+(delta<0?1:-1);if(next>=0&&next<product.placements.length)change(next);}};
    }
    card.querySelector('.table').onclick=()=>fullPlan(p.doc,p.page,p.codeBoxes,[]);
    card.querySelector('.comment').onclick=()=>planForm(p.doc);
    card.querySelector('.history').onclick=()=>showHistory(visibleEvents().filter(e=>e.doc===p.doc),p.doc);
  }else{placements.innerHTML='<p class="muted">No plan needed. Add a location photo or section note when you find this item.</p>';}
  const reference=suppliedPhotos[product.barcode];
  if(reference){const card=document.createElement('article');card.className='card';card.innerHTML=`<h2>Display reference photo</h2><img class="location-photo" src="${escapeHTML(reference.file)}" alt="${escapeHTML(reference.caption)}"><p>${escapeHTML(reference.caption)}</p><p class="muted">Capture date unknown. This supplied reference is not a current warehouse sighting.</p>`;placements.append(card);}
}
function renderPlan(doc,page,codeBoxes,markers,target,focus=null,positions=[]){
  const request=String(++renderCounter);const node=$(target);node.dataset.request=request;
  if(focus)node.dataset.focus=JSON.stringify(focus);else delete node.dataset.focus;
  node.dataset.hasMarkers=String(markers.length>0);
  const job={doc,page,codeBoxes,positions,markers:[...new Map(markers.map(b=>[b.join(','),b])).values()]};
  if(!native){const render=()=>LocalPlatform.render(job).then(url=>window.onPlanRendered(request,url)).catch(error=>window.onPlanRendered(request,'',error.message||'PDF could not be rendered'));if(window.LocalPlatform)render();else window.addEventListener('local-platform-ready',render,{once:true});}
  else if(doc.startsWith('i')&&window.LocalPlatform)LocalPlatform.render(job).then(url=>window.onPlanRendered(request,url)).catch(()=>window.onPlanRendered(request,'','Imported PDF could not be rendered'));
  else if(native) native.renderPlan(JSON.stringify({...job,request}));
  else fetch('/preview-render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(job)}).then(r=>{if(!r.ok)throw Error();return r.blob();}).then(blob=>window.onPlanRendered(request,URL.createObjectURL(blob))).catch(()=>{node.innerHTML='<p>Plan rendering is available in the APK or through the preview server.</p>';});
}
window.onPlanRendered=(request,url,error)=>{
  if(url&&typeof url==='object'&&url.blob){void showBrowserPlan(request,url);return;}
  const node=document.querySelector(`[data-request="${CSS.escape(request)}"]`);if(!node)return;
  if(error){node.innerHTML=`<p>${escapeHTML(error)}. Other results remain available.</p>`;return;}
  const image=document.createElement('img');image.alt=node.dataset.focus?'Zoomed display area, with surrounding products. Matching position marked by high-contrast yellow and red rings and an arrow.':'Full original plan page. Matching position marked by high-contrast yellow and red rings and an arrow; matching barcode boxed in blue.';if(node.dataset.hasMarkers!=='true')image.alt=(node.dataset.focus?'Zoomed display area.':'Full original plan page.')+' Position marker unavailable; use surrounding products and the plan position text.';image.tabIndex=0;image.setAttribute('role','button');image.onclick=()=>openModal(`<p>Full original page. Pinch to zoom.</p><img class="full-plan" src="${escapeHTML(url)}" alt="Original matching plan page enlarged">`);image.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();image.click();}};
  const source=new Image();source.onload=()=>{
    if(!node.isConnected||node.dataset.request!==request)return;
    const bounds=node.dataset.focus?JSON.parse(node.dataset.focus):null;
    if(bounds){const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round((bounds[2]-bounds[0])*source.naturalWidth));canvas.height=Math.max(1,Math.round((bounds[3]-bounds[1])*source.naturalHeight));canvas.getContext('2d').drawImage(source,bounds[0]*source.naturalWidth,bounds[1]*source.naturalHeight,canvas.width,canvas.height,0,0,canvas.width,canvas.height);image.src=canvas.toDataURL('image/png');}else image.src=url;
    node.replaceChildren(image);
  };source.onerror=()=>{node.innerHTML='<p>Source image could not be loaded.</p>';};source.src=url;
};
function fullPlan(doc,page,codeBoxes,markers){openModal('<h2>Source plan page '+page+'</h2><div class="plan-frame" id="full-plan">Opening…</div>');renderPlan(doc,page,codeBoxes,markers,'full-plan');}
function observations(){return visibleEvents().filter(e=>e.kind==='location' && (currentProduct.barcode?sameProductCode(e.product,currentProduct.barcode):e.productName===currentProduct.name)).sort((a,b)=>new Date(a.at).getTime()-new Date(b.at).getTime());}
function renderObservations(){
  let node=$('observations');if(!node){node=document.createElement('section');node.id='observations';$('results').append(node);}
  const seenPhotos=new Set();
  const items=observations().slice().reverse().filter(e=>{if(e.photo){if(seenPhotos.has(e.photo))return false;seenPhotos.add(e.photo);}return true;});
  node.innerHTML=items.length?'<h2>Worker observations</h2>'+items.slice(0,5).map(e=>`<article class="card"><span class="badge">${escapeHTML(e.area || 'Area not recorded')} · local only</span><div class="answer">${escapeHTML(e.section || 'Section not recorded')}</div><p>${escapeHTML(e.note || (e.photo?'Location photo recorded':'No extra details'))}</p><p class="muted">${e.action==='proposed'?'Suggested placement — awaiting manager decision':e.action==='not-here'?'Not found at this spot':'Last seen'} · ${date(e.at)} · ${escapeHTML(e.worker)}</p>${e.photo?`<img class="location-photo" src="${/^local-/.test(e.thumbnail||e.photo)?'':escapeHTML(e.thumbnail||e.photo)}" ${/^local-/.test(e.thumbnail||e.photo)?`data-local-photo="${escapeHTML(e.thumbnail||e.photo)}"`:''} data-full-photo="${escapeHTML(e.photo)}" loading="lazy" tabindex="0" role="button" alt="Worker location photo of ${escapeHTML(e.productName)}, including any captured surrounding items">`:''}</article>`).join(''):'';
  resolvePhotos();
  if($('latest-location')){const latest=items[0];$('latest-location').innerHTML=latest?`<p class="latest-location">${latest.action==='proposed'?'Suggested · awaiting manager':latest.action==='not-here'?'Not found at this spot':'Last seen'}: <strong>${escapeHTML([latest.area,latest.section].filter(Boolean).join(' · ')||'See photo below')}</strong> <small>${date(latest.at)}</small></p>`:'';}
}
window.photoCaptureContext=(purpose='location')=>{const target={product:currentProduct?.barcode||'',productName:currentProduct?.name||''};if(typeof window.captureScopeForPhoto==='function')target.captureScope=window.captureScopeForPhoto(target,purpose);return CaptureCore.context(target,purpose);};
function addPhoto(){let context;try{context=window.photoCaptureContext();}catch(error){$('status').textContent=error.message;return;}pauseTimer();cameraActive=true;$('modal').close();if(native?.beginPhoto)native.beginPhoto(JSON.stringify(context),false);else if(native)native.takePhoto();else if(window.LocalPlatform)LocalPlatform.takePhoto(context);else $('status').textContent='Camera tools are loading.';}
function readLabel(context=null){try{if(!context||typeof context.product!=='string')context=window.photoCaptureContext('label');else{context={...context};if(typeof window.captureScopeForPhoto==='function'&&!context.captureScope)context.captureScope=window.captureScopeForPhoto(context,'label');context=CaptureCore.context(context,'label');}}catch(error){$('status').textContent=error.message;return;}pauseTimer();cameraActive=true;$('modal').close();if(native?.beginPhoto)native.beginPhoto(JSON.stringify(context),true);else if(native)native.captureLabel();else if(window.LocalPlatform)LocalPlatform.takeLabelPhoto(context);else $('status').textContent='Camera tools are loading.';}
function productForm(draft=currentProduct||{}){
  const originalWorkspace=Object.hasOwn(draft,'workspaceContext')?draft.workspaceContext:currentWorkspace();
  const known=ProductCore.records(visibleEvents()).find(p=>StockCore.canonical(p.barcode)===StockCore.canonical(draft.barcode||''));draft={...known,...draft};
  if(/^\d+$/.test(draft.name||'')||draft.name?.startsWith('Product code '))draft={...draft,name:''};
  openModal(`<h2>Item details</h2><p class="muted">A barcode and name are enough. Read a close-up label photo, paste any text, or type details. Check extracted values before saving; prices describe the label, not live retailer stock.</p><button id="read-label">Read label photo</button><div class="field"><label for="item-code">Barcode / item identifier</label><input id="item-code" maxlength="128" value="${escapeHTML(draft.barcode||'')}"></div><div class="field"><label for="item-name">Name</label><input id="item-name" maxlength="500" value="${escapeHTML(draft.name||'')}"></div><div class="field"><label for="item-price">Label price (optional)</label><input id="item-price" inputmode="decimal" value="${escapeHTML(draft.price||'')}"></div><div class="field"><label for="item-currency">Currency</label><input id="item-currency" value="${escapeHTML(draft.currency||'£')}" maxlength="10"></div><div class="field"><label for="item-description">Description / other details</label><textarea id="item-description">${escapeHTML(draft.description||'')}</textarea></div><div class="field"><label for="item-text">All captured / pasted text</label><textarea id="item-text" maxlength="30000">${escapeHTML(draft.rawText||'')}</textarea><button id="parse-item-text">Fill from this text</button></div><button id="save-product" class="primary">Save item</button>`);
  $('read-label').onclick=()=>readLabel({product:$('item-code').value.trim(),productName:$('item-name').value.trim()});
  $('parse-item-text').onclick=()=>{const parsed=ProductCore.extract($('item-text').value,$('item-code').value.trim());for(const [id,key] of [['item-code','barcode'],['item-name','name'],['item-price','price'],['item-currency','currency'],['item-description','description']])if(parsed[key])$(id).value=parsed[key];};
  $('save-product').onclick=()=>{
    const barcode=$('item-code').value.trim(),name=$('item-name').value.trim();if(!barcode||!name){$('status').textContent='Enter the item identifier and name.';(!barcode?$('item-code'):$('item-name')).focus();return;}
    if(event({kind:'product',barcode,name,product:barcode,productName:name,price:$('item-price').value.trim(),currency:$('item-currency').value.trim(),description:$('item-description').value.trim(),rawText:$('item-text').value,labelPhoto:draft.labelPhoto||'',labelEvent:draft.labelEvent||'',source:draft.source||'manual',ocrConfidence:draft.ocrConfidence??null,workspaceContext:originalWorkspace})){ $('modal').close();lookup(barcode,false,true);$('status').textContent='Item saved locally. Add a location photo or note when useful.'; }
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
  openModal('<h2>Reading label on this device…</h2><p id="ocr-progress" role="status">Loading offline recognition tools.</p><p class="muted">The photo stays local. You can enter details instead while keeping the photo.</p><button id="skip-ocr">Enter manually</button>');
  $('skip-ocr').onclick=()=>{labelAttempt++;LocalPlatform.cancelOCR();productForm(draft);};
  try{const result=await LocalPlatform.recognizePhoto(url);if(attempt===labelAttempt)productForm({...draft,...ProductCore.extract(result.text,draft.barcode),ocrConfidence:result.confidence});}
  catch{if(attempt===labelAttempt){productForm(draft);$('status').textContent='Label text could not be read. The photo is retained; enter the details manually.';}}
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
  openModal(`<h2>${alreadySaved?'Photo saved':'Record location'}</h2><p>${escapeHTML(targetProduct.name)} · ${escapeHTML(targetProduct.barcode)}</p><p class="muted">${alreadySaved?'These details are optional. The photo is already retained.':'Record what you actually observed. Suggestions are separate from placements approved by your manager.'}</p><div class="field"><label for="area">Area</label><select id="area"><option value="">Not recorded</option><option>Warehouse</option><option>Shop floor</option><option>Cart / trolley / tote</option></select></div><div class="field"><label for="section">Section or landmark</label><input id="section" placeholder="e.g. Dining, beside white dinner sets"></div><div class="field"><label for="location-note">Observation</label><textarea id="location-note" placeholder="Nearby items, shelf, missing label…"></textarea></div><div class="field"><label for="action">What happened?</label><select id="action"><option value="seen">Found / last seen here</option><option value="not-here">Not found at this spot</option><option value="proposed">Suggested placement — awaiting manager decision</option></select></div><button id="save-location" class="primary">Save details</button>`);
  $('save-location').onclick=()=>{if(event({kind:'location',product:targetProduct.barcode,productName:targetProduct.name,photo,...(photo?(()=>{const original=state.events.find(e=>e.photo===photo);return {thumbnail:original?.thumbnail,photoInfo:original?.photoInfo};})():{}),area:$('area').value,section:$('section').value.trim(),note:$('location-note').value.trim(),action:$('action').value,workspaceContext:originalWorkspace})){ $('modal').close();renderObservations();$('status').textContent='Observation saved locally. Coworker sync is not connected.'; }};
}
function planForm(doc){
  openModal(`<h2>Comment / mark plan</h2><p class="source">${escapeHTML(documents.get(doc).name)}</p><label for="plan-note">Comment (optional)</label><textarea id="plan-note" placeholder="What differs from the display?"></textarea><div class="actions"><button id="outdated">Mark outdated</button><button id="unverified">Clear outdated mark</button><button id="comment-only">Save comment</button></div><p class="muted">All changes retain history. Clearing a mark does not verify that the layout is installed.</p>`);
  ['outdated','unverified','comment-only'].forEach(mark=>$(mark).onclick=()=>{const note=$('plan-note').value.trim(); if(mark==='comment-only'&&!note){$('plan-note').focus();return;} if(event({kind:mark==='comment-only'?'plan-comment':'plan-mark',doc,mark:mark==='comment-only'?undefined:mark,note})){ $('modal').close();showProduct(currentProduct); }});
}
function showHistory(events,doc=''){
  const ordered=events.slice().reverse();let index=0;
  function draw(){
    const e=ordered[index];openModal(`<h2>History</h2>${e?`<div class="history-note"><p>${escapeHTML(e.worker)} · ${date(e.at)}</p><h3>${escapeHTML(e.kind==='phone-position'?'Phone position experiment':e.mark || e.action || e.kind)}</h3><p>${escapeHTML(e.note || e.section || e.productName || e.query || 'No extra details')}</p>${positionDetails(e)}${e.photo?`<img class="location-photo" src="${/^local-/.test(e.photo)?'':escapeHTML(e.photo)}" ${/^local-/.test(e.photo)?`data-local-photo="${escapeHTML(e.photo)}"`:''} alt="Previous worker location photo">`:''}</div><div class="history-controls"><button id="previous" ${index===ordered.length-1?'disabled':''}>Older</button><span>${index+1} of ${ordered.length}</span><button id="newer" ${index===0?'disabled':''}>Newer</button></div>${doc&&e.kind==='plan-mark'?'<button id="restore">Restore this mark as a new change</button>':''}`:'<p>No recorded history yet.</p>'}`);
    if(e){$('previous').onclick=()=>{index++;draw();};$('newer').onclick=()=>{index--;draw();};let touchX; const card=$('modal-content');card.ontouchstart=t=>{touchX=t.changedTouches[0].clientX;};card.ontouchend=t=>{const dx=t.changedTouches[0].clientX-touchX;if(Math.abs(dx)>75){index=Math.max(0,Math.min(ordered.length-1,index+(dx<0?1:-1)));draw();}};if($('restore'))$('restore').onclick=()=>{if(event({kind:'plan-mark',doc,mark:e.mark,note:'Restored from history '+e.id})){ $('modal').close();showProduct(currentProduct); }};}
  }draw();resolvePhotos();
}
$('search-form').onsubmit=e=>{e.preventDefault();$('query').blur();lookup($('query').value);};
$('query').onfocus=()=>{cancelTimer();if(native)native.stopCamera();};
$('scan').onclick=$('next-scan').onclick=startScan;
$('more').onclick=()=>{if(!currentProduct){$('settings').click();return;}openModal('<h2>Item actions</h2><div class="action-grid"><button id="quick-product">Item details / read label</button><button id="quick-photo">Photo</button><button id="quick-note">Location note</button><button id="quick-history">History</button><button id="quick-map">Last-seen GPS map</button><button id="quick-retailer">Official price / stock</button><button id="quick-search">Search another item by name / barcode</button><button id="quick-image">Scan a photo</button><button id="quick-shelf">Read shelf labels</button><button id="quick-pin">Pin this lookup · membership</button><button id="quick-pins">Pinned lookups · membership</button></div>');$('quick-pin').onclick=()=>window.pinCurrentLookup();$('quick-pins').onclick=()=>window.openPinnedLookups();$('quick-image').onclick=()=>ImageTest.open();$('quick-shelf').onclick=()=>ShelfLabels.open();$('quick-map').onclick=()=>LocationMap.open(visibleEvents(),currentProduct.barcode);$('quick-retailer').onclick=()=>RetailerUI.details();$('quick-product').onclick=()=>productForm();$('quick-photo').onclick=addPhoto;$('quick-note').onclick=()=>locationForm();$('quick-history').onclick=()=>showHistory(visibleEvents().filter(e=>sameProductCode(e.product,currentProduct.barcode)));$('quick-search').onclick=()=>{$('modal').close();document.body.classList.remove('has-results');$('query').focus();};};
$('close-modal').onclick=()=>{if($('ocr-progress')){labelAttempt++;window.LocalPlatform?.cancelOCR();}$('modal').close();};
$('recent').onclick=()=>{openModal('<h2>Recent searches</h2>'+state.recent.map((q,i)=>`<button class="variant" data-recent="${i}">${escapeHTML(q)}</button>`).join(''));document.querySelectorAll('[data-recent]').forEach(b=>b.onclick=()=>{$('modal').close();lookup(state.recent[Number(b.dataset.recent)]);});};
async function restoredDataStatus(){
 try{const records=await LocalPlatform.restoreReviews();openModal('<h2>Restored data</h2><p>'+(native?'Inspect retained original records against a snapshot of saved history. Native approval is not ready; keep a private export. Your history and photo queue stay unchanged.':'Choose which local records to recover. Shared updates keep their original ownership and wait for verified account recovery. Original backup evidence stays saved.')+'</p>'+records.map((record,index)=>`<article class="card"><p>${record.unreadable?'Unreadable evidence retained':`${record.events} observation${record.events===1?'':'s'} · ${record.photos} pending capture${record.photos===1?'':'s'}${record.nativeTickets?' · '+record.nativeTickets+' native ticket files':''}${record.sharing?' · shared-update evidence':''}`} · held</p>${record.unreadable?'':`<button data-recovery-review="${index}">${native?'Inspect restored records':'Review local recovery'}</button>`}</article>`).join('')+(records.length?'':'<p>No restored data is waiting for review.</p>'));document.querySelectorAll('[data-recovery-review]').forEach(button=>button.onclick=()=>restoreRecoveryPreview(records[Number(button.dataset.recoveryReview)].id));}
 catch{$('status').textContent='Restored evidence could not be read. Keep your original ZIP; no review data has been removed.';}
}
async function restoreRecoveryPreview(id,offset=0){
 try{
  const preview=await LocalPlatform.previewRestoreRecovery(id,offset);
  if(!LocalPlatform.restorePreviewCurrent(preview.token))return false;
  openModal('<h2>'+(preview.readOnly?'Inspect restored records':'Choose local recovery')+'</h2><p>'+(preview.readOnly?'Read-only inspection. These original records remain saved for private export. Native recovery approval is not ready. Refresh to compare current saved history; shared and other-worker evidence stays held.':'Only selected records are recovered on this device. Original dates and ownership stay the same. Existing saved answers stay current. Different saved versions and shared updates stay in the backup.')+'</p>'+preview.candidates.map((candidate,index)=>{
   const item=candidate.event||{},allowed=!preview.readOnly&&['ready','existing'].includes(candidate.status),titles={'plan-mark':'Plan status','plan-comment':'Plan comment','phone-position':'Recorded phone position','retailer-link':'Official product link','label-photo':'Label photo','location':'Location observation','product':'Item details'},title=item.productName||item.name||item.product||item.barcode||candidate.documentName||titles[item.kind]||'Record kept for review',photo=item.thumbnail||item.photo||item.labelPhoto;
   return `<article class="card">${allowed?`<label class="recovery-choice"><input type="checkbox" data-recovery-key="${escapeHTML(candidate.key)}" data-original-id="${escapeHTML(item.id)}"> ${escapeHTML(title)}</label>`:`<strong>${escapeHTML(title)}</strong>`}<p class="muted">${escapeHTML(titles[item.kind]||'')}${item.at?' · '+escapeHTML(date(item.at)):''} · ${candidate.status==='existing'?'Already saved':candidate.status==='ready'?(preview.readOnly?'Retained local record':'Available to recover'):escapeHTML(candidate.reason)}</p>${item.area||item.section?`<p>${escapeHTML([item.area,item.section].filter(Boolean).join(' · '))}</p>`:''}${item.mark?`<p>Imported status: ${escapeHTML(item.mark)}</p>`:''}${candidate.status==='conflict'&&candidate.existing?.mark?`<p>Saved status: ${escapeHTML(candidate.existing.mark)}</p>`:''}${item.note?`<p>Imported: ${escapeHTML(item.note)}</p>`:''}${candidate.status==='conflict'&&candidate.existing?.note?`<p>Saved: ${escapeHTML(candidate.existing.note)}</p>`:''}${photo?`<img class="location-photo recovery-photo" data-local-photo="${escapeHTML(photo)}" alt="Original photo for ${escapeHTML(title)}">`:''}</article>`;
  }).join('')+`<p>${Math.min(offset+1,preview.total)}–${Math.min(offset+25,preview.total)} of ${preview.total}</p><p id="recovery-result" role="status"></p>${preview.readOnly?'':'<button id="recover-selected" class="primary">Recover selected to this device</button>'}<button id="recovery-refresh">Refresh preview</button>${offset?'<button id="recovery-previous">Previous records</button>':''}${offset+25<preview.total?'<button id="recovery-next">More records</button>':''}`,true);
  document.querySelectorAll('[data-recovery-key]').forEach(box=>box.onchange=()=>{if(box.checked)document.querySelectorAll('[data-recovery-key]').forEach(other=>{if(other!==box&&other.dataset.originalId===box.dataset.originalId)other.checked=false;});});resolvePhotos();
  $('recovery-refresh').onclick=()=>restoreRecoveryPreview(id,offset);if($('recovery-previous'))$('recovery-previous').onclick=()=>restoreRecoveryPreview(id,Math.max(0,offset-25));if($('recovery-next'))$('recovery-next').onclick=()=>restoreRecoveryPreview(id,offset+25);
  if($('recover-selected'))$('recover-selected').onclick=async()=>{const button=$('recover-selected'),message=$('recovery-result'),keys=[...document.querySelectorAll('[data-recovery-key]:checked')].map(box=>box.dataset.recoveryKey);button.disabled=true;try{const result=await LocalPlatform.recoverSelectedRestore(preview.token,keys);if(message.isConnected&&await restoreRecoveryPreview(id,offset))$('recovery-result').textContent=result.recovered+' recovered · '+result.existing+' already saved. Original evidence is kept.';if(currentProduct)renderObservations();}catch(error){if(message.isConnected)message.textContent=error.message;}finally{if(button.isConnected)button.disabled=false;}};
  return true;
 }catch(error){$('status').textContent=error.message;return false;}
}
$('settings').onclick=()=>{
  openModal(`<h2>Settings</h2>
<section class="settings-group"><h3>Scanning</h3><label for="auto-scan">Start the next scan</label><select id="auto-scan"><option value="0">When I tap Next scan</option><option value="15">After 15 seconds</option><option value="30">After 30 seconds</option><option value="60">After 60 seconds</option></select><p>Editing or leaving the app pauses the timer.</p><button id="settings-image">Scan a photo / try a sample</button></section>
<section class="settings-group"><h3>Photos</h3><label for="photo-quality">Photo storage</label><select id="photo-quality"><option value="balanced">Balanced · up to 1600 px / 320 KB</option><option value="compact">Smaller files · up to 1280 px / 200 KB</option><option value="detail">More detail · up to 2048 px / 600 KB</option></select><p>New photos are compressed with a small preview. Sizes are targets; originals are not retained.</p></section>
<section class="settings-group"><h3>Location</h3><label for="scan-position">Save phone position</label><select id="scan-position"><option value="off">Off</option><option value="on">After scans and location photos</option></select><p id="position-help" class="muted">Uses foreground permission. Saved coordinates include accuracy and time. Indoor GPS may be imprecise and does not confirm a shelf.</p><div class="actions"><button id="position-map">Last-seen map</button><button id="position-history">Position history</button></div></section>
<section class="settings-group"><h3>Plans and backups</h3><div class="actions"><button id="settings-plans">Stored plans</button><button id="settings-import">Import plans or backup</button><button id="export">Export backup</button><button id="retailer-settings">Dunelm store and prices</button></div><p>Import PDFs or a workspace ZIP. Data stays on this device. Keep exports private: they can include photos and GPS positions.</p></section>
<div id="settings-offline"></div><details class="settings-group"><summary>Recovery and saved photos</summary><div id="settings-recovery-tools"></div></details><details class="settings-group"><summary>Account and other options</summary><button id="settings-account">Account and membership</button></details><div id="settings-ready-update"></div><p class="source">Stock Assistant pilot 0.29 · prepared 17 October 2026</p>`);
  if(stateReadFailed)$('modal-content').insertAdjacentHTML('afterbegin','<p role="alert">Saved data is unreadable. Changes are paused to protect it. Export a recovery backup with the original data for repair. Keep this backup private.</p>');
  if(window.LocalPlatform?.restoreReviews){
   $('settings-recovery-tools').insertAdjacentHTML('beforeend','<button id="restored-data-status">Restored data status</button>');
   $('restored-data-status').onclick=restoredDataStatus;
  }
  if(!native&&window.LocalPlatform?.pendingPhotos){
   $('settings-recovery-tools').insertAdjacentHTML('beforeend','<h3>Photo recovery</h3><p id="web-photo-recovery">Checking retained photos…</p><button id="retry-web-photos">Retry photo recovery</button>');
   const info=$('web-photo-recovery');LocalPlatform.pendingPhotos().then(result=>{if(info.isConnected)info.textContent=result.records.length+' completed photos waiting for their original item/workspace. '+(result.invalid?'Unreadable records are kept for review.':'');}).catch(()=>{if(info.isConnected)info.textContent='Recovery is unavailable. Tickets and files are retained; export a backup.';});
   $('retry-web-photos').onclick=async()=>{const result=await LocalPlatform.recoverPhotos();if(info.isConnected)info.textContent=result.recovered+' photos recovered. Original ownership is kept; remaining photos need their original workspace or storage space.';};
  }
  if(nativeWriter?.stale()){$('modal-content').insertAdjacentHTML('beforeend','<button id="reload-native-workspace">Refresh saved history</button>');$('reload-native-workspace').onclick=()=>window.reloadNativeWorkspace();}
  if(native?.pendingPhotos){const pending=nativePendingPhotos();$('settings-recovery-tools').insertAdjacentHTML('beforeend','<h3>Photo recovery</h3><p>'+ (pending.unavailable?'Recovery could not be read. Existing photos and tickets are retained; export a private backup.':pending.records.length+' completed photos waiting to save. Recovery keeps the original item and capture time.')+'</p><button id="retry-photos">Retry photo recovery</button><button id="saved-labels">Saved label photos</button>');$('retry-photos').onclick=()=>window.onNativePhotosReady();$('saved-labels').onclick=()=>{const labels=visibleEvents().filter(e=>e.kind==='label-photo').slice().reverse();openModal('<h2>Saved label photos</h2>'+labels.map((e,i)=>`<article class="card"><p>${escapeHTML(e.productName||e.product||'Item not yet identified')} · ${date(e.at)}</p><img class="location-photo" src="${/^local-/.test(e.thumbnail||e.photo)?'':escapeHTML(e.thumbnail||e.photo)}" ${/^local-/.test(e.thumbnail||e.photo)?`data-local-photo="${escapeHTML(e.thumbnail||e.photo)}"`:''} alt="Saved label photo for ${escapeHTML(e.productName||e.product||'an unidentified item')}"><button data-label-review="${i}">Review item details</button></article>`).join('')+(labels.length?'':'<p>No saved label photos.</p>'));resolvePhotos();document.querySelectorAll('[data-label-review]').forEach(b=>b.onclick=()=>{const e=labels[Number(b.dataset.labelReview)];productForm({barcode:e.product,name:e.productName,labelPhoto:e.photo,labelEvent:e.id,source:'label-photo'});});};}
  $('photo-quality').value=state.settings?.photoQuality||'balanced';$('photo-quality').onchange=()=>{if(!updateSettings({photoQuality:$('photo-quality').value})){$('photo-quality').value=window.photoQuality();return;}if(native)native.photoProfile(state.settings.photoQuality);};
  $('settings-image').onclick=()=>ImageTest.open();$('auto-scan').value=String(state.settings.autoScan);$('auto-scan').onchange=()=>{if(!updateSettings({autoScan:Number($('auto-scan').value)})){$('auto-scan').value=String(state.settings.autoScan);return;}if(scanCycle){armTimer();pauseTimer();}};
  $('scan-position').value=state.settings?.scanPosition?'on':'off';$('scan-position').onchange=()=>{
    const previous=state.settings;state.settings={...state.settings,scanPosition:$('scan-position').value==='on'};
    if(!save()){state.settings=previous;$('scan-position').value=previous?.scanPosition?'on':'off';return;}
    if(native)native.locationEnabled(state.settings.scanPosition,true);if(!state.settings.scanPosition)cancelPosition();
  };
  $('position-map').onclick=()=>LocationMap.open(visibleEvents());$('retailer-settings').onclick=()=>RetailerUI.settings();
  $('position-history').onclick=()=>showHistory(visibleEvents().filter(e=>e.kind==='phone-position'));
  $('export').onclick=()=>{if(!window.LocalPlatform)return;const job=native?LocalPlatform.nativeBackup(state):LocalPlatform.backup(state);job.catch(()=>{$('status').textContent='Backup could not be created. Existing data is unchanged.';});};
  if(pendingWebUpdate){$('settings-ready-update').insertAdjacentHTML('beforeend','<button id="apply-web-update">Apply ready app update</button>');$('apply-web-update').onclick=applyWebUpdate;}
  if(window.BundlePlans?.available())setupBundleSettings();
  $('settings-account').onclick=()=>AccountUI.open();$('settings-plans').onclick=showStoredPlans;
  $('settings-import').onclick=()=>{$('modal').close();$('import-plans').click();};
};
document.querySelectorAll('[data-query]').forEach(b=>b.onclick=()=>lookup(b.dataset.query));
$('modal').addEventListener('close',()=>{window.LocalPlatform?.cancelRestoreRecovery?.();for(const view of planViews.keys())if($('modal').contains(view))releasePlanView(view);if($('ocr-progress')){labelAttempt++;window.LocalPlatform?.cancelOCR();}resumeTimer();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pauseTimer();cancelPosition();if(native)native.stopCamera();}else resumeTimer();});
window.onSharedText=text=>lookup(text);
window.onBackupResult=message=>{$('status').textContent=message;};
function mergeWorkspace(existing,restored){return {...existing,retailerCache:RetailerCore.merge(existing.retailerCache,restored.retailerCache),events:ProductCore.merge(existing.events,restored.events),recent:[...new Set([...existing.recent,...(restored.recent||[])])].slice(0,25)};}
window.workspaceBackupSnapshot=pending=>{
  // A waiting window exports the latest committed history, not its startup copy.
  if(!native&&browserWriter?.mode()==='waiting')try{refreshBrowserWorkspace();}catch{}
  const photos=pendingPhotoEvents(nativePendingPhotos().records);
  // Avoid sorting/copying the whole history when there is nothing to reconcile.
  const recovered=pending.length?pending.reduce(mergeWorkspace,state):state;
  const external=!native&&browserWriter?.mode()==='stale'?localStorage.getItem('stock-pilot-v1'):null;
  return {state:photos.length?mergeWorkspace(recovered,{events:photos}):recovered,...(unreadableState!==null?{recoveryOriginalState:unreadableState}:external!==null?{recoveryOriginalState:external}:{})};
};
window.onWorkspaceRestored=async restored=>{const previous=state;state=mergeWorkspace(state,restored);if(!save()){state=previous;throw Error('Observation storage unavailable.');}};
window.onLocalCatalogue=async data=>{
  if(!baseCatalogue)return;
  const previous=currentProduct,selected=previous?.placements[placementIndex],scroll=window.scrollY;
  catalogue=window.BundlePlans?BundlePlans.merge(baseCatalogue,data):{documents:[...baseCatalogue.documents,...data.documents],products:[...baseCatalogue.products,...data.products]};documents=new Map(catalogue.documents.map(d=>[d.id,d]));
  $('counts').textContent=`${catalogue.documents.length} plans · ${new Set(catalogue.products.map(p=>p.barcode)).size.toLocaleString('en-GB')} codes`;
  if(previous&&$('query').value){
    const refreshed=StockCore.searchDetailed([...ProductCore.records(visibleEvents()),...catalogue.products,...RetailerCore.products(state.retailerCache,RetailerCore.links(visibleEvents()))],$('query').value),groups=StockCore.group(refreshed.matches);
    const updated=groups.find(p=>previous.barcode?p.barcode===previous.barcode:p.name===previous.name);
    if(updated){lastMatches=refreshed.matches;const placements=groups.reduce((count,g)=>count+g.placements.length,0);$('status').textContent=`${refreshed.similar?'Similar names · ':''}${groups.length} product${groups.length===1?'':'s'} · ${placements} plan placement${placements===1?'':'s'}`;showProduct(updated,selected);window.scrollTo(0,scroll);}else lookup($('query').value,false,true);
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
  baseCatalogue=data;catalogue=data;documents=new Map(data.documents.map(d=>[d.id,d]));
  await window.onLocalCatalogue({documents:[],products:[]});await loadLocal();
  if(BundlePlans.available()&&!BundlePlans.enabled()){await BundlePlans.purge();await window.LocalPlatform?.removeBundledPlans();}
  if(state.lastQuery)lookup(state.lastQuery);
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


document.addEventListener('click',async e=>{const image=e.target.closest('[data-full-photo]');if(image){const url=await (window.LocalPlatform?.photoUrl(image.dataset.fullPhoto)||image.dataset.fullPhoto);openModal(`<img class="full-plan" src="${escapeHTML(url)}" alt="Full location evidence photo">`);}});
document.addEventListener('keydown',e=>{if(e.target.matches('[data-full-photo]')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.target.click();}});

function setupBundleSettings(){
  const enabled=BundlePlans.enabled();
  $('settings-offline').insertAdjacentHTML('beforeend',`<section class="settings-group"><h3>Offline plans</h3><p id="bundle-readiness" class="muted" role="status">Checking saved files…</p><p id="bundle-storage" class="muted"></p><button id="bundle-protect" hidden>Protect saved files from automatic clearing</button><h3>Temporary Kingston plans</h3><p id="bundle-help" class="muted">${enabled?'Kingston plans are enabled. Opened PDFs are saved for offline use.':'Kingston plans are off. This browser will keep them off after updates.'}</p><button id="bundle-toggle">${enabled?'Remove Kingston plans and keep them off':'Re-enable Kingston plans'}</button>${enabled?'<button id="bundle-offline">Save missing plans for offline use</button>':''}</section>`);
  $('bundle-readiness').insertAdjacentHTML('afterend','<button id="bundle-app-save" hidden>Restore missing app files for offline opening</button>');
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
window.openAccountModal=html=>openModal(html);
window.openWorkflowPresets=()=>{
  if(!AccountUI.has('workflow-presets')){AccountUI.open();return;}
  const presets=Array.isArray(state.settings.workflowPresets)?state.settings.workflowPresets:[];
  openModal(`<h2>Saved workflow presets</h2><p class="muted">Keep different scan timers and photo settings for different jobs. Your ordinary settings stay available without membership.</p><label for="preset-name">Name for current settings</label><input id="preset-name" maxlength="40" placeholder="e.g. Warehouse"><button id="preset-save">Save current settings</button><p id="preset-help" role="status"></p>${presets.map((p,i)=>`<div class="actions"><button data-preset="${i}">${escapeHTML(p.name)}</button><button data-preset-delete="${i}">Remove</button></div>`).join('')}`);
  $('preset-save').onclick=()=>{if(!AccountUI.has('workflow-presets'))return AccountUI.open();const name=$('preset-name').value.trim();if(!name){$('preset-help').textContent='Enter a name.';return;}if(presets.length>=10){$('preset-help').textContent='You can save up to 10 presets.';return;}const previous=state.settings,s=state.settings;state.settings={...s,workflowPresets:[...presets,{name,autoScan:s.autoScan,scanPosition:s.scanPosition,planZoom:s.planZoom,photoQuality:s.photoQuality||'balanced'}]};if(save())window.openWorkflowPresets();else state.settings=previous;};
  document.querySelectorAll('[data-preset]').forEach(button=>button.onclick=()=>{if(!AccountUI.has('workflow-presets'))return AccountUI.open();const previous=state.settings,p=presets[Number(button.dataset.preset)];state.settings={...state.settings,autoScan:[0,15,30,60].includes(p.autoScan)?p.autoScan:60,scanPosition:p.scanPosition===true,planZoom:p.planZoom!==false,photoQuality:['balanced','compact','detail'].includes(p.photoQuality)?p.photoQuality:'balanced'};if(save()){$('modal').close();cancelTimer();$('status').textContent='Workflow preset applied: '+p.name;}else state.settings=previous;});
  document.querySelectorAll('[data-preset-delete]').forEach(button=>button.onclick=()=>{if(!AccountUI.has('workflow-presets'))return AccountUI.open();const previous=state.settings;state.settings={...state.settings,workflowPresets:presets.filter((_,i)=>i!==Number(button.dataset.presetDelete))};if(save())window.openWorkflowPresets();else state.settings=previous;});
};

window.pinCurrentLookup=async()=>{
  await AccountUI.refresh();if(!AccountUI.has('pinned-lookups'))return AccountUI.open();
  if(!currentProduct)return;
  const query=currentProduct.barcode||$('query').value,name=currentProduct.name||query,pins=Array.isArray(state.pinnedLookups)?state.pinnedLookups:[];
  if(!pins.some(p=>p.query===query)){if(pins.length>=20){$('status').textContent='You can pin up to 20 items. Remove an old pin first.';return;}const previous=state;state={...state,pinnedLookups:[...pins,{query,name}]};if(!save()){state=previous;return;}}
  window.openPinnedLookups();
};
window.openPinnedLookups=async()=>{
  await AccountUI.refresh();if(!AccountUI.has('pinned-lookups'))return AccountUI.open();
  const pins=Array.isArray(state.pinnedLookups)?state.pinnedLookups:[];
  openModal(`<h2>Pinned item lookups</h2><p class="muted">Open common items without typing or scanning. Locations come from your currently enabled plans.</p>${pins.map((p,i)=>`<div class="actions"><button data-pin="${i}">${escapeHTML(p.name)}</button><button data-unpin="${i}">Unpin</button></div>`).join('')||'<p>Open an item, then choose More → Pin this lookup.</p>'}`);
  document.querySelectorAll('[data-pin]').forEach(button=>button.onclick=()=>{if(!AccountUI.has('pinned-lookups'))return AccountUI.open();$('modal').close();lookup(pins[Number(button.dataset.pin)].query);});
  document.querySelectorAll('[data-unpin]').forEach(button=>button.onclick=()=>{if(!AccountUI.has('pinned-lookups'))return AccountUI.open();const previous=state;state={...state,pinnedLookups:pins.filter((_,i)=>i!==Number(button.dataset.unpin))};if(save())window.openPinnedLookups();else state=previous;});
};

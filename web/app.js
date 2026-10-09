'use strict';
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const native = window.Native || null;
let catalogue, baseCatalogue, documents, currentProduct, lastMatches = [], renderCounter = 0, timer = null, placementIndex=0;
let state = {events:[], recent:[], settings:{}};
try { state = {...state, ...JSON.parse(localStorage.getItem('stock-pilot-v1') || '{}')}; }
catch { $('status').textContent = 'Saved data could not be read. Existing data has not been overwritten.'; }
state.settings=WorkflowCore.settings(state.settings);
function save() { try {localStorage.setItem('stock-pilot-v1', JSON.stringify(state)); return true;} catch { $('status').textContent = 'Storage is full or unavailable. This change has not been saved. Export a backup before continuing.'; return false;} }
function event(data) {const previous = state; state = StockCore.appendEvent(state, {id:crypto.randomUUID(), at:new Date().toISOString(), worker:'Me', ...data}); if (!save()) {state = previous; return false;} return true;}
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
function openModal(html) {$('modal-content').ontouchstart=null;$('modal-content').ontouchend=null;pauseTimer(); $('modal-content').innerHTML=html; $('modal').showModal();$('modal').scrollTop=0;}
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
  const searchResult=StockCore.searchDetailed([...ProductCore.records(state.events),...catalogue.products,...RetailerCore.products(state.retailerCache)],query);
  lastMatches=searchResult.matches;
  const groups=StockCore.group(lastMatches);
  const placementCount=groups.reduce((count,g)=>count+g.placements.length,0);
  $('status').textContent=groups.length ? `${searchResult.similar?'Similar names · ':''}${groups.length} product${groups.length===1?'':'s'} · ${placementCount} plan placement${placementCount===1?'':'s'}` : 'No match in these imported plans. This does not mean zero stock.';
  if(query.trim()) {state.lastQuery=query;state.recent=[query,...state.recent.filter(q=>q!==query)].slice(0,25);save();}
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
  event({kind:'phone-position',product:context.product||'',productName:context.productName||'',query:context.query||'',photoEvent:context.photoEvent||'',trigger:context.trigger,capturedAt:context.capturedAt,requestStartedAt:new Date(context.startedAt).toISOString(),fix});
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
  $('product-history').onclick=()=>showHistory(state.events.filter(e=>e.product===product.barcode || (!product.barcode && e.productName===product.name)));
  renderObservations();
  showPlacement();
  window.scrollTo(0,0);
  window.RetailerUI?.render();
}
function showPlacement(){
  const product=currentProduct,p=product.placements[placementIndex];
  const placements=$('placements');
  placements.replaceChildren();
  if(p){
    const doc=documents.get(p.doc), mark=StockCore.markFor(state,p.doc);
    const card=document.createElement('article');card.className='card placement-card';
    card.innerHTML=`<div class="plan-heading">${escapeHTML([p.season,p.heading||p.title||doc.name].filter(Boolean).join(' · '))}</div><p class="plan-location">${escapeHTML(locationSummary(p))}</p>${mark==='outdated'?'<p class="warning">Reported outdated · check observations</p>':''}${product.placements.length>1?`<div class="placement-switch"><button id="previous-placement" aria-label="Previous placement" ${placementIndex===0?'disabled':''}>‹</button><label class="sr-only" for="placement-choice">Choose placement</label><select id="placement-choice">${product.placements.map((item,i)=>`<option value="${i}" ${i===placementIndex?'selected':''}>${i+1}/${product.placements.length} · ${escapeHTML(locationSummary(item)||item.title)}</option>`).join('')}</select><button id="next-placement" aria-label="Next placement" ${placementIndex===product.placements.length-1?'disabled':''}>›</button></div>`:''}<div class="plan-frame" id="plan-0" aria-label="Matching display area"><p>Opening local plan…</p></div><p class="verification">${mark==='outdated'?'Reported outdated':'Floor layout unverified'}${p.markers.length?'':' · Position marker unavailable'} · ${escapeHTML(p.title)} · PDF ${p.diagramPage}</p><details class="plan-details"><summary>Full source, product text and plan history</summary><p>${escapeHTML(p.rowText||p.name)}${p.status?' · Plan status: '+escapeHTML(p.status):''}${p.fill?' · Plan fill: '+escapeHTML(p.fill)+' (not a stock count)':''}</p><p class="source">${escapeHTML(doc.name)} · PDF page ${p.page}${p.printed?' · '+escapeHTML(p.printed):''}<br>${doc.sourceUpdated?'Source updated '+escapeHTML(doc.sourceUpdated):'Source update date unknown · Added '+escapeHTML(doc.added)}</p><p class="muted">Yellow/red rings and arrows: candidate position markers. Blue box: matching barcode. Planned placement, not verified stock.</p><div class="actions"><button class="table">Product list page</button><button class="comment">Comment / mark plan</button><button class="history">Plan history</button></div></details>`;
    if(p.position)card.querySelector('.plan-location').innerHTML=`<span class="position-cue">Find number <strong>${escapeHTML(p.position)}</strong></span> <span>${escapeHTML([p.fixture,p.bay].filter(Boolean).join(' · '))}</span>`;
    placements.append(card);
    const focus=WorkflowCore.focus(p.images||[],p.markers||[]);
    if(focus){card.querySelector('.plan-heading').insertAdjacentHTML('afterend','<button class="quiet zoom-toggle" id="toggle-zoom">'+(state.settings.planZoom?'Full page':'Zoom display')+'</button>');$('toggle-zoom').onclick=()=>{state.settings.planZoom=!state.settings.planZoom;save();showPlacement();};}
    renderPlan(p.doc,p.diagramPage,p.diagramPage===p.page?p.codeBoxes:[],p.markers,'plan-0',state.settings.planZoom?focus:null,[p.position]);
    if($('placement-choice')){
      const change=index=>{placementIndex=index;showPlacement();window.scrollTo(0,0);};
      $('placement-choice').onchange=e=>change(Number(e.target.value));
      $('previous-placement').onclick=()=>change(placementIndex-1);$('next-placement').onclick=()=>change(placementIndex+1);
      let touchX;card.ontouchstart=e=>{touchX=e.changedTouches[0].clientX;};card.ontouchend=e=>{const delta=e.changedTouches[0].clientX-touchX;if(Math.abs(delta)>90){const next=placementIndex+(delta<0?1:-1);if(next>=0&&next<product.placements.length)change(next);}};
    }
    card.querySelector('.table').onclick=()=>fullPlan(p.doc,p.page,p.codeBoxes,[]);
    card.querySelector('.comment').onclick=()=>planForm(p.doc);
    card.querySelector('.history').onclick=()=>showHistory(state.events.filter(e=>e.doc===p.doc),p.doc);
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
function observations(){return state.events.filter(e=>e.kind==='location' && (currentProduct.barcode?e.product===currentProduct.barcode:e.productName===currentProduct.name));}
function renderObservations(){
  let node=$('observations');if(!node){node=document.createElement('section');node.id='observations';$('results').append(node);}
  const seenPhotos=new Set();
  const items=observations().slice().reverse().filter(e=>{if(e.photo){if(seenPhotos.has(e.photo))return false;seenPhotos.add(e.photo);}return true;});
  node.innerHTML=items.length?'<h2>Worker observations</h2>'+items.slice(0,5).map(e=>`<article class="card"><span class="badge">${escapeHTML(e.area || 'Area not recorded')} · local only</span><div class="answer">${escapeHTML(e.section || 'Section not recorded')}</div><p>${escapeHTML(e.note || (e.photo?'Location photo recorded':'No extra details'))}</p><p class="muted">${e.action==='proposed'?'Suggested placement — awaiting manager decision':e.action==='not-here'?'Not found at this spot':'Last seen'} · ${date(e.at)} · ${escapeHTML(e.worker)}</p>${e.photo?`<img class="location-photo" src="${/^local-/.test(e.thumbnail||e.photo)?'':escapeHTML(e.thumbnail||e.photo)}" ${/^local-/.test(e.thumbnail||e.photo)?`data-local-photo="${escapeHTML(e.thumbnail||e.photo)}"`:''} data-full-photo="${escapeHTML(e.photo)}" loading="lazy" tabindex="0" role="button" alt="Worker location photo of ${escapeHTML(e.productName)}, including any captured surrounding items">`:''}</article>`).join(''):'';
  resolvePhotos();
  if($('latest-location')){const latest=items[0];$('latest-location').innerHTML=latest?`<p class="latest-location">${latest.action==='proposed'?'Suggested · awaiting manager':latest.action==='not-here'?'Not found at this spot':'Last seen'}: <strong>${escapeHTML([latest.area,latest.section].filter(Boolean).join(' · ')||'See photo below')}</strong> <small>${date(latest.at)}</small></p>`:'';}
}
function addPhoto(){pauseTimer();cameraActive=true;$('modal').close();if(native)native.takePhoto();else if(window.LocalPlatform)LocalPlatform.takePhoto();else $('status').textContent='Camera tools are loading.';}
function readLabel(){pauseTimer();cameraActive=true;$('modal').close();if(native)native.captureLabel();else if(window.LocalPlatform)LocalPlatform.takeLabelPhoto();else $('status').textContent='Camera tools are loading.';}
function productForm(draft=currentProduct||{}){
  const known=ProductCore.records(state.events).find(p=>StockCore.canonical(p.barcode)===StockCore.canonical(draft.barcode||''));draft={...known,...draft};
  if(/^\d+$/.test(draft.name||'')||draft.name?.startsWith('Product code '))draft={...draft,name:''};
  openModal(`<h2>Item details</h2><p class="muted">A barcode and name are enough. Read a close-up label photo, paste any text, or type details. Check extracted values before saving; prices describe the label, not live retailer stock.</p><button id="read-label">Read label photo</button><div class="field"><label for="item-code">Barcode / item identifier</label><input id="item-code" maxlength="128" value="${escapeHTML(draft.barcode||'')}"></div><div class="field"><label for="item-name">Name</label><input id="item-name" maxlength="500" value="${escapeHTML(draft.name||'')}"></div><div class="field"><label for="item-price">Label price (optional)</label><input id="item-price" inputmode="decimal" value="${escapeHTML(draft.price||'')}"></div><div class="field"><label for="item-currency">Currency</label><input id="item-currency" value="${escapeHTML(draft.currency||'£')}" maxlength="10"></div><div class="field"><label for="item-description">Description / other details</label><textarea id="item-description">${escapeHTML(draft.description||'')}</textarea></div><div class="field"><label for="item-text">All captured / pasted text</label><textarea id="item-text" maxlength="30000">${escapeHTML(draft.rawText||'')}</textarea><button id="parse-item-text">Fill from this text</button></div><button id="save-product" class="primary">Save item</button>`);
  $('read-label').onclick=readLabel;
  $('parse-item-text').onclick=()=>{const parsed=ProductCore.extract($('item-text').value,$('item-code').value.trim());for(const [id,key] of [['item-code','barcode'],['item-name','name'],['item-price','price'],['item-currency','currency'],['item-description','description']])if(parsed[key])$(id).value=parsed[key];};
  $('save-product').onclick=()=>{
    const barcode=$('item-code').value.trim(),name=$('item-name').value.trim();if(!barcode||!name){$('status').textContent='Enter the item identifier and name.';(!barcode?$('item-code'):$('item-name')).focus();return;}
    if(event({kind:'product',barcode,name,product:barcode,productName:name,price:$('item-price').value.trim(),currency:$('item-currency').value.trim(),description:$('item-description').value.trim(),rawText:$('item-text').value,labelPhoto:draft.labelPhoto||'',labelEvent:draft.labelEvent||'',source:draft.source||'manual',ocrConfidence:draft.ocrConfidence??null})){ $('modal').close();lookup(barcode,false,true);$('status').textContent='Item saved locally. Add a location photo or note when useful.'; }
  };
}
let labelAttempt=0;
window.onOCRProgress=message=>{if($('ocr-progress'))$('ocr-progress').textContent=message;};
window.onLabelPhoto=async(url,thumbnail='',encoded='{}')=>{
  cameraActive=false;
  const attempt=++labelAttempt,draft={...currentProduct,labelPhoto:url,labelEvent:crypto.randomUUID(),source:'label-photo'};
  let info={};try{info=JSON.parse(encoded);}catch{}
  event({id:draft.labelEvent,kind:'label-photo',product:draft.barcode||'',productName:draft.name||'',photo:url,thumbnail,photoInfo:info});
  capturePosition({product:draft.barcode,productName:draft.name,trigger:'label-photo',photoEvent:draft.labelEvent,capturedAt:new Date(info.capturedAt||Date.now()).toISOString()});
  openModal('<h2>Reading label on this device…</h2><p id="ocr-progress" role="status">Loading offline recognition tools.</p><p class="muted">The photo stays local. You can enter details instead while keeping the photo.</p><button id="skip-ocr">Enter manually</button>');
  $('skip-ocr').onclick=()=>{labelAttempt++;LocalPlatform.cancelOCR();productForm(draft);};
  try{const result=await LocalPlatform.recognizePhoto(url);if(attempt===labelAttempt)productForm({...draft,...ProductCore.extract(result.text,draft.barcode),ocrConfidence:result.confidence});}
  catch{if(attempt===labelAttempt){productForm(draft);$('status').textContent='Label text could not be read. The photo is retained; enter the details manually.';}}
};
window.photoQuality=()=>state.settings?.photoQuality||'balanced';
async function resolvePhotos(){if(!window.LocalPlatform)return;for(const image of document.querySelectorAll('img[data-local-photo]')){const reference=image.dataset.localPhoto;try{image.src=await LocalPlatform.photoUrl(reference);}catch{image.alt+=' · file unavailable';}}}
window.onPhoto=(url,thumbnail='',encoded='{}')=>{
  cameraActive=false;
  if(!currentProduct){$('status').textContent='Search for an item before attaching a photo.';return;}
  let photoInfo={};try{photoInfo=JSON.parse(encoded);}catch{}
  const photoEvent=crypto.randomUUID();
  if(event({id:photoEvent,kind:'location',product:currentProduct.barcode,productName:currentProduct.name,photo:url,thumbnail,photoInfo,section:'',area:'',note:'',action:'seen'})){
    capturePosition({product:currentProduct.barcode,productName:currentProduct.name,trigger:'location-photo',photoEvent,capturedAt:new Date(photoInfo.capturedAt||Date.now()).toISOString()});
    renderObservations();$('status').textContent='Photo saved on this phone. Add a section or landmark if useful.';locationForm(url,true);
  }
};
function locationForm(photo='',alreadySaved=false){
  openModal(`<h2>${alreadySaved?'Photo saved':'Record location'}</h2><p class="muted">${alreadySaved?'These details are optional. The photo is already retained.':'Record what you actually observed. Suggestions are separate from placements approved by your manager.'}</p><div class="field"><label for="area">Area</label><select id="area"><option value="">Not recorded</option><option>Warehouse</option><option>Shop floor</option><option>Cart / trolley / tote</option></select></div><div class="field"><label for="section">Section or landmark</label><input id="section" placeholder="e.g. Dining, beside white dinner sets"></div><div class="field"><label for="location-note">Observation</label><textarea id="location-note" placeholder="Nearby items, shelf, missing label…"></textarea></div><div class="field"><label for="action">What happened?</label><select id="action"><option value="seen">Found / last seen here</option><option value="not-here">Not found at this spot</option><option value="proposed">Suggested placement — awaiting manager decision</option></select></div><button id="save-location" class="primary">Save details</button>`);
  $('save-location').onclick=()=>{if(event({kind:'location',product:currentProduct.barcode,productName:currentProduct.name,photo,...(photo?(()=>{const original=state.events.find(e=>e.photo===photo);return {thumbnail:original?.thumbnail,photoInfo:original?.photoInfo};})():{}),area:$('area').value,section:$('section').value.trim(),note:$('location-note').value.trim(),action:$('action').value})){ $('modal').close();renderObservations();$('status').textContent='Observation saved locally. Coworker sync is not connected.'; }};
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
$('more').onclick=()=>{if(!currentProduct){$('settings').click();return;}openModal('<h2>Item actions</h2><div class="actions"><button id="quick-product">Item details / read label</button><button id="quick-photo">Photo</button><button id="quick-note">Location note</button><button id="quick-history">History</button><button id="quick-map">Last-seen GPS map</button><button id="quick-retailer">Official price / stock</button><button id="quick-search">Search another item by name / barcode</button><button id="quick-image">Scan from image / test</button><button id="quick-pin">Pin this lookup · membership</button><button id="quick-pins">Pinned lookups · membership</button></div>');$('quick-pin').onclick=()=>window.pinCurrentLookup();$('quick-pins').onclick=()=>window.openPinnedLookups();$('quick-image').onclick=()=>ImageTest.open();$('quick-map').onclick=()=>LocationMap.open(state.events,currentProduct.barcode);$('quick-retailer').onclick=()=>RetailerUI.details();$('quick-product').onclick=()=>productForm();$('quick-photo').onclick=addPhoto;$('quick-note').onclick=()=>locationForm();$('quick-history').onclick=()=>showHistory(state.events.filter(e=>e.product===currentProduct.barcode));$('quick-search').onclick=()=>{$('modal').close();document.body.classList.remove('has-results');$('query').focus();};};
$('close-modal').onclick=()=>{if($('ocr-progress')){labelAttempt++;window.LocalPlatform?.cancelOCR();}$('modal').close();};
$('recent').onclick=()=>{openModal('<h2>Recent searches</h2>'+state.recent.map((q,i)=>`<button class="variant" data-recent="${i}">${escapeHTML(q)}</button>`).join(''));document.querySelectorAll('[data-recent]').forEach(b=>b.onclick=()=>{$('modal').close();lookup(state.recent[Number(b.dataset.recent)]);});};
$('settings').onclick=()=>{
  openModal(`<h2>Pilot settings</h2><label for="auto-scan">Automatically start the next scan</label><select id="auto-scan"><option value="0">Off — Next scan button</option><option value="15">After 15 seconds</option><option value="30">After 30 seconds</option><option value="60">After 60 seconds</option></select><p class="muted">The camera closes after a match. Inspecting or scrolling the result keeps the timer running. Editing and hidden screens pause it. No cloud account, ads or payment service is connected.</p><button id="settings-image">Scan from image / test</button><button id="export">Export workspace with plans and photos</button><p class="muted">Keep a backup before uninstalling or clearing app data. This pilot saves to this phone only. Backups include any recorded coordinates; keep them private.</p><p>Stock Assistant pilot 0.10 · prepared 9 October 2026</p>`);
  $('modal-content').insertAdjacentHTML('beforeend','<label for="photo-quality">Location photo storage</label><select id="photo-quality"><option value="balanced">Balanced · up to 1600 px, aim 320 KB</option><option value="compact">Compact · up to 1280 px, aim 200 KB</option><option value="detail">More detail · up to 2048 px, aim 600 KB</option></select><p class="muted">New coworker photos only. A small preview is also saved. Targets are soft to preserve useful detail; originals are not retained. Supplied plans and reference photos are unchanged. Ads and optional £1/month ad-free membership are planned, not active.</p>');
  $('photo-quality').value=state.settings?.photoQuality||'balanced';$('photo-quality').onchange=()=>{state.settings={...state.settings,photoQuality:$('photo-quality').value};save();if(native)native.photoProfile(state.settings.photoQuality);};
  $('settings-image').onclick=()=>ImageTest.open();$('auto-scan').value=String(state.settings.autoScan);$('auto-scan').onchange=()=>{state.settings={...state.settings,autoScan:Number($('auto-scan').value)};save();if(scanCycle){armTimer();pauseTimer();}};
  $('modal-content').insertAdjacentHTML('beforeend','<label for="scan-position">GPS / phone position experiment</label><select id="scan-position"><option value="off">Off</option><option value="on">Record after camera scans and location photos</option></select><p id="position-help" class="muted">Optional foreground location permission. Each capture tries for up to 6 seconds while your result remains usable. Coordinates, accuracy and timestamps stay on this device, separately from JPEG metadata. A phone reading does not confirm an item\'s shelf. Recording is on by default when permission permits. It does not provide indoor navigation.</p><button id="position-history">Phone position history</button><button id="position-map">GPS map with accuracy circles</button><button id="retailer-settings">Dunelm store and daily cache</button>');
  $('scan-position').value=state.settings?.scanPosition?'on':'off';$('scan-position').onchange=()=>{
    const previous=state.settings;state.settings={...state.settings,scanPosition:$('scan-position').value==='on'};
    if(!save()){state.settings=previous;$('scan-position').value=previous?.scanPosition?'on':'off';return;}
    if(native)native.locationEnabled(state.settings.scanPosition,true);if(!state.settings.scanPosition)cancelPosition();
  };
  $('position-map').onclick=()=>LocationMap.open(state.events);$('retailer-settings').onclick=()=>RetailerUI.settings();
  $('position-history').onclick=()=>showHistory(state.events.filter(e=>e.kind==='phone-position'));
  $('export').onclick=()=>{if(!window.LocalPlatform)return;const job=native?LocalPlatform.nativeBackup(state):LocalPlatform.backup(state);job.catch(()=>{$('status').textContent='Backup could not be created. Existing data is unchanged.';});};
  if(pendingWebUpdate){$('modal-content').insertAdjacentHTML('beforeend','<button id="apply-web-update">Apply ready app update</button>');$('apply-web-update').onclick=applyWebUpdate;}
  if(window.BundlePlans?.available())setupBundleSettings();
  $('modal-content').insertAdjacentHTML('beforeend','<button id="settings-account">Account and £1 membership</button>');$('settings-account').onclick=()=>AccountUI.open();
  $('modal-content').insertAdjacentHTML('beforeend','<button id="settings-plans">See stored plans</button>');$('settings-plans').onclick=showStoredPlans;
  $('modal-content').insertAdjacentHTML('beforeend','<button id="settings-import">Import plans / workspace ZIP</button><p class="muted">Import other store plans or an Android workspace ZIP. Imported files stay on this device. The temporary web release also offers Kingston plans; you can remove them and keep them off in Settings.</p>');$('settings-import').onclick=()=>{$('modal').close();$('import-plans').click();};
};
document.querySelectorAll('[data-query]').forEach(b=>b.onclick=()=>lookup(b.dataset.query));
$('modal').addEventListener('close',()=>{for(const view of planViews.keys())if($('modal').contains(view))releasePlanView(view);if($('ocr-progress')){labelAttempt++;window.LocalPlatform?.cancelOCR();}resumeTimer();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pauseTimer();cancelPosition();if(native)native.stopCamera();}else resumeTimer();});
window.onSharedText=text=>lookup(text);
window.onBackupResult=message=>{$('status').textContent=message;};
window.onWorkspaceRestored=async restored=>{const previous=state;state={...state,retailerCache:RetailerCore.merge(state.retailerCache,restored.retailerCache),events:ProductCore.merge(state.events,restored.events),recent:[...new Set([...state.recent,...(restored.recent||[])])].slice(0,25)};if(!save()){state=previous;throw Error('Observation storage unavailable.');}await loadLocal();};
window.onLocalCatalogue=async data=>{
  if(!baseCatalogue)return;
  const previous=currentProduct,selected=previous?.placements[placementIndex],scroll=window.scrollY;
  catalogue=window.BundlePlans?BundlePlans.merge(baseCatalogue,data):{documents:[...baseCatalogue.documents,...data.documents],products:[...baseCatalogue.products,...data.products]};documents=new Map(catalogue.documents.map(d=>[d.id,d]));
  $('counts').textContent=`${catalogue.documents.length} plans · ${new Set(catalogue.products.map(p=>p.barcode)).size.toLocaleString('en-GB')} codes`;
  if(previous&&$('query').value){
    const refreshed=StockCore.searchDetailed([...ProductCore.records(state.events),...catalogue.products,...RetailerCore.products(state.retailerCache)],$('query').value),groups=StockCore.group(refreshed.matches);
    const updated=groups.find(p=>previous.barcode?p.barcode===previous.barcode:p.name===previous.name);
    if(updated){lastMatches=refreshed.matches;const placements=groups.reduce((count,g)=>count+g.placements.length,0);$('status').textContent=`${refreshed.similar?'Similar names · ':''}${groups.length} product${groups.length===1?'':'s'} · ${placements} plan placement${placements===1?'':'s'}`;showProduct(updated,selected);window.scrollTo(0,scroll);}else lookup($('query').value,false,true);
  }
};
async function loadLocal(){if(window.LocalPlatform&&baseCatalogue){if(window.BundlePlans?.available()&&!BundlePlans.enabled())await LocalPlatform.removeBundledPlans();await window.onLocalCatalogue(await LocalPlatform.catalogue());resolvePhotos();}}
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
  $('modal-content').insertAdjacentHTML('beforeend',`<h3>Temporary Kingston plans</h3><p id="bundle-help" class="muted">${enabled?'Kingston plans are enabled. Opened PDFs are saved for offline use.':'Kingston plans are off. This browser will keep them off after updates.'}</p><button id="bundle-toggle">${enabled?'Remove Kingston plans and keep them off':'Re-enable Kingston plans'}</button>${enabled?'<button id="bundle-offline">Download all Kingston plans for offline use · about 147 MB</button>':''}`);
  $('bundle-toggle').onclick=async()=>{
    $('bundle-toggle').disabled=true;
    try{await BundlePlans.setEnabled(!enabled);baseCatalogue=await BundlePlans.catalogue();currentProduct=null;await loadLocal();$('results').innerHTML='';document.body.classList.remove('has-results');$('status').textContent=enabled?'Kingston plans removed and kept off in this browser. Your photos, notes and other plans are retained.':'Kingston plans enabled.';$('modal').close();}
    catch(error){$('bundle-help').textContent=error.message+(!BundlePlans.enabled()?' Kingston plans are kept off; removal will be retried when you reopen the app.':'');$('bundle-toggle').disabled=false;}
  };
  if($('bundle-offline'))$('bundle-offline').onclick=async()=>{const button=$('bundle-offline');button.disabled=true;try{await BundlePlans.downloadAll((done,total)=>{button.textContent=`Saving plans · ${done}/${total}`;});button.textContent='All Kingston plans saved for offline use';}catch(error){button.textContent=error.message;button.disabled=false;}};
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

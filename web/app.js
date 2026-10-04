'use strict';
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const native = window.Native || null;
let catalogue, baseCatalogue, documents, currentProduct, lastMatches = [], renderCounter = 0, timer = null, placementIndex=0;
let state = {events:[], recent:[], settings:{autoScan:0}};
try { state = {...state, ...JSON.parse(localStorage.getItem('stock-pilot-v1') || '{}')}; }
catch { $('status').textContent = 'Saved data could not be read. Existing data has not been overwritten.'; }
function save() { try {localStorage.setItem('stock-pilot-v1', JSON.stringify(state)); return true;} catch { $('status').textContent = 'Storage is full or unavailable. This change has not been saved. Export a backup before continuing.'; return false;} }
function event(data) {const previous = state; state = StockCore.appendEvent(state, {id:crypto.randomUUID(), at:new Date().toISOString(), worker:'Me', ...data}); if (!save()) {state = previous; return false;} return true;}
function date(value) {return new Date(value).toLocaleString('en-GB', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
function locationSummary(p){return [p.fixture,p.bay,p.position&&p.position.length<=3?'Position '+p.position:''].filter(Boolean).join(' · ');}
const suppliedPhotos={};
function openModal(html) {cancelTimer(); $('modal-content').innerHTML=html; $('modal').showModal();}
function cancelTimer(){clearTimeout(timer); timer=null;}
function armTimer(){cancelTimer(); const seconds = Number(state.settings?.autoScan || 0); if (seconds > 0) timer = setTimeout(startScan, seconds*1000);}
function startScan(){cancelTimer(); $('modal').close(); if(native) native.scan(); else if(window.LocalPlatform)LocalPlatform.scan();else $('status').textContent='Camera tools are loading. You can still search by barcode or name.';}
function lookup(query, scanned=false) {
  if (!catalogue) return;
  cancelTimer();
  if(native) native.stopCamera();
  document.body.classList.add('has-results');
  $('query').value=query;
  lastMatches=StockCore.search(catalogue.products,query);
  const groups=StockCore.group(lastMatches);
  $('status').textContent=groups.length ? `${groups.length} product${groups.length===1?'':'s'} · ${lastMatches.length} plan placement${lastMatches.length===1?'':'s'}` : 'No match in these imported plans. This does not mean zero stock.';
  if(query.trim()) {state.lastQuery=query;state.recent=[query,...state.recent.filter(q=>q!==query)].slice(0,25);save();}
  if(groups.length===1) showProduct(groups[0]);
  else if(groups.length) {
    currentProduct=null;
    $('results').innerHTML='<p>Choose the exact product or variant.</p>'+groups.slice(0,100).map((g,i)=>`<button class="variant" data-group="${i}"><strong>${escapeHTML(g.name)}</strong><span class="code">${escapeHTML(g.barcode)}</span> <span class="badge">${g.placements.length} placement${g.placements.length===1?'':'s'}</span></button>`).join('')+(groups.length>100?'<p>Narrow your search to see more results.</p>':'');
    document.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>showProduct(groups[Number(b.dataset.group)]));
  } else {
    currentProduct={barcode:/^\d{12,13}$/.test(query.trim())?query.trim():'',name:query,placements:[]};
    $('results').innerHTML=`<div class="empty"><h2>No plan match</h2><p>Keep this reference and record where you find it. Try a product name, packaging barcode, or nearby label.</p>${/^https?:/.test(query)?'<p>This product page has no recognised barcode in its URL. Paste its product name or barcode; automatic page extraction is not connected yet.</p>':''}<button id="unknown-photo">Add location photo</button></div>`;
    $('unknown-photo').onclick=addPhoto;
    renderObservations();
  }
  if(scanned && groups.length===1) armTimer();
}
window.onBarcode = code => lookup(code,true);
window.onCameraMessage = message => {$('status').textContent=message;};
function showProduct(product) {
  currentProduct=product;
  placementIndex=0;
  $('results').innerHTML=`<article class="card product-card"><h1>${escapeHTML(product.name)}</h1><p class="code">${escapeHTML(product.barcode)}</p><div id="latest-location"></div></article><section id="placements" aria-label="Plan placements"></section><details id="secondary-actions"><summary>Photo, location notes and history</summary><div class="actions"><button id="add-photo" aria-label="Add location photo">Photo</button><button id="add-note" aria-label="Record location">Location note</button><button id="product-history" aria-label="Location history">History</button></div></details><section id="observations" aria-label="Worker observations"></section>`;
  $('add-photo').onclick=addPhoto;
  $('add-note').onclick=()=>locationForm();
  $('product-history').onclick=()=>showHistory(state.events.filter(e=>e.product===product.barcode || (!product.barcode && e.productName===product.name)));
  renderObservations();
  showPlacement();
  window.scrollTo(0,0);
}
function showPlacement(){
  const product=currentProduct,p=product.placements[placementIndex];
  const placements=$('placements');
  placements.replaceChildren();
  if(p){
    const doc=documents.get(p.doc), mark=StockCore.markFor(state,p.doc);
    const card=document.createElement('article');card.className='card placement-card';
    card.innerHTML=`<div class="answer">${escapeHTML(locationSummary(p) || 'Matching source page')}</div>${mark==='outdated'?'<p class="warning">Reported outdated · check observations</p>':''}${product.placements.length>1?`<div class="placement-switch"><button id="previous-placement" aria-label="Previous placement" ${placementIndex===0?'disabled':''}>‹</button><label class="sr-only" for="placement-choice">Choose placement</label><select id="placement-choice">${product.placements.map((item,i)=>`<option value="${i}" ${i===placementIndex?'selected':''}>${i+1}/${product.placements.length} · ${escapeHTML(locationSummary(item)||item.title)}</option>`).join('')}</select><button id="next-placement" aria-label="Next placement" ${placementIndex===product.placements.length-1?'disabled':''}>›</button></div>`:''}<div class="plan-frame" id="plan-0" aria-label="Full matching plan page"><p>Opening local plan…</p></div><p class="verification">${mark==='outdated'?'Reported outdated':'Floor layout unverified'} · ${escapeHTML(p.title)} · PDF ${p.diagramPage}</p><details class="plan-details"><summary>Source, product list and plan history</summary><p class="source">${escapeHTML(doc.name)} · PDF page ${p.page}${p.printed?' · '+escapeHTML(p.printed):''}<br>${doc.sourceUpdated?'Source updated '+escapeHTML(doc.sourceUpdated):'Source update date unknown · Added '+escapeHTML(doc.added)}</p><p class="muted">Orange circles: candidate position markers. Blue box: matching barcode. Planned placement, not verified stock.</p><div class="actions"><button class="table">Product list page</button><button class="comment">Comment / mark plan</button><button class="history">Plan history</button></div></details>`;
    placements.append(card);
    renderPlan(p.doc,p.diagramPage,p.diagramPage===p.page?p.codeBoxes:[],p.markers,'plan-0');
    if($('placement-choice')){
      const change=index=>{placementIndex=index;showPlacement();window.scrollTo(0,0);};
      $('placement-choice').onchange=e=>change(Number(e.target.value));
      $('previous-placement').onclick=()=>change(placementIndex-1);$('next-placement').onclick=()=>change(placementIndex+1);
      let touchX;card.ontouchstart=e=>{touchX=e.changedTouches[0].clientX;};card.ontouchend=e=>{const delta=e.changedTouches[0].clientX-touchX;if(Math.abs(delta)>90){const next=placementIndex+(delta<0?1:-1);if(next>=0&&next<product.placements.length)change(next);}};
    }
    card.querySelector('.table').onclick=()=>fullPlan(p.doc,p.page,p.codeBoxes,[]);
    card.querySelector('.comment').onclick=()=>planForm(p.doc);
    card.querySelector('.history').onclick=()=>showHistory(state.events.filter(e=>e.doc===p.doc),p.doc);
  }
  const reference=suppliedPhotos[product.barcode];
  if(reference){const card=document.createElement('article');card.className='card';card.innerHTML=`<h2>Display reference photo</h2><img class="location-photo" src="${escapeHTML(reference.file)}" alt="${escapeHTML(reference.caption)}"><p>${escapeHTML(reference.caption)}</p><p class="muted">Capture date unknown. This supplied reference is not a current warehouse sighting.</p>`;placements.append(card);}
}
function renderPlan(doc,page,codeBoxes,markers,target){
  const request=String(++renderCounter);const node=$(target);node.dataset.request=request;
  const job={doc,page,codeBoxes,markers};
  if(doc.startsWith('i')&&window.LocalPlatform)LocalPlatform.render(job).then(url=>window.onPlanRendered(request,url)).catch(()=>window.onPlanRendered(request,'','Imported PDF could not be rendered'));
  else if(native) native.renderPlan(JSON.stringify({...job,request}));
  else fetch('/preview-render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(job)}).then(r=>{if(!r.ok)throw Error();return r.blob();}).then(blob=>window.onPlanRendered(request,URL.createObjectURL(blob))).catch(()=>{node.innerHTML='<p>Plan rendering is available in the APK or through the preview server.</p>';});
}
window.onPlanRendered=(request,url,error)=>{
  const node=document.querySelector(`[data-request="${CSS.escape(request)}"]`); if(!node)return;
  if(error){node.innerHTML=`<p>${escapeHTML(error)}. Other results remain available.</p>`;return;}
  const image=document.createElement('img');image.alt='Full original plan page, with all edges visible. Matching barcode highlighted in blue; candidate position markers circled in orange.';image.tabIndex=0;image.setAttribute('role','button');image.onclick=()=>openModal(`<p>Full original page. Pinch to zoom.</p><img class="full-plan" src="${escapeHTML(url)}" alt="Original matching plan page enlarged">`);image.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();image.click();}};
  image.src=url;node.replaceChildren(image);
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
function addPhoto(){if(native)native.takePhoto();else if(window.LocalPlatform)LocalPlatform.takePhoto();else $('status').textContent='Camera tools are loading.';}
window.photoQuality=()=>state.settings?.photoQuality||'balanced';
async function resolvePhotos(){if(!window.LocalPlatform)return;for(const image of document.querySelectorAll('img[data-local-photo]')){const reference=image.dataset.localPhoto;try{image.src=await LocalPlatform.photoUrl(reference);}catch{image.alt+=' · file unavailable';}}}
window.onPhoto=(url,thumbnail='',encoded='{}')=>{
  if(!currentProduct){$('status').textContent='Search for an item before attaching a photo.';return;}
  let photoInfo={};try{photoInfo=JSON.parse(encoded);}catch{}
  if(event({kind:'location',product:currentProduct.barcode,productName:currentProduct.name,photo:url,thumbnail,photoInfo,section:'',area:'',note:'',action:'seen'})){
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
    const e=ordered[index];openModal(`<h2>History</h2>${e?`<div class="history-note"><p>${escapeHTML(e.worker)} · ${date(e.at)}</p><h3>${escapeHTML(e.mark || e.action || e.kind)}</h3><p>${escapeHTML(e.note || e.section || 'No extra details')}</p>${e.photo?`<img class="location-photo" src="${/^local-/.test(e.photo)?'':escapeHTML(e.photo)}" ${/^local-/.test(e.photo)?`data-local-photo="${escapeHTML(e.photo)}"`:''} alt="Previous worker location photo">`:''}</div><div class="history-controls"><button id="previous" ${index===ordered.length-1?'disabled':''}>Older</button><span>${index+1} of ${ordered.length}</span><button id="newer" ${index===0?'disabled':''}>Newer</button></div>${doc&&e.kind==='plan-mark'?'<button id="restore">Restore this mark as a new change</button>':''}`:'<p>No recorded history yet.</p>'}`);
    if(e){$('previous').onclick=()=>{index++;draw();};$('newer').onclick=()=>{index--;draw();};let touchX; const card=$('modal-content');card.ontouchstart=t=>{touchX=t.changedTouches[0].clientX;};card.ontouchend=t=>{const dx=t.changedTouches[0].clientX-touchX;if(Math.abs(dx)>75){index=Math.max(0,Math.min(ordered.length-1,index+(dx<0?1:-1)));draw();}};if($('restore'))$('restore').onclick=()=>{if(event({kind:'plan-mark',doc,mark:e.mark,note:'Restored from history '+e.id})){ $('modal').close();showProduct(currentProduct); }};}
  }draw();resolvePhotos();
}
$('search-form').onsubmit=e=>{e.preventDefault();$('query').blur();lookup($('query').value);};
$('query').onfocus=()=>{cancelTimer();if(native)native.stopCamera();};
$('scan').onclick=$('next-scan').onclick=startScan;
$('more').onclick=()=>{if(!currentProduct){$('settings').click();return;}openModal('<h2>Item actions</h2><div class="actions"><button id="quick-photo">Photo</button><button id="quick-note">Location note</button><button id="quick-history">History</button><button id="quick-search">Search another item</button></div>');$('quick-photo').onclick=addPhoto;$('quick-note').onclick=()=>locationForm();$('quick-history').onclick=()=>showHistory(state.events.filter(e=>e.product===currentProduct.barcode));$('quick-search').onclick=()=>{$('modal').close();document.body.classList.remove('has-results');$('query').focus();};};
$('close-modal').onclick=()=>$('modal').close();
$('recent').onclick=()=>{openModal('<h2>Recent searches</h2>'+state.recent.map((q,i)=>`<button class="variant" data-recent="${i}">${escapeHTML(q)}</button>`).join(''));document.querySelectorAll('[data-recent]').forEach(b=>b.onclick=()=>{$('modal').close();lookup(state.recent[Number(b.dataset.recent)]);});};
$('settings').onclick=()=>{
  openModal(`<h2>Pilot settings</h2><label for="auto-scan">Automatically start the next scan</label><select id="auto-scan"><option value="0">Off — Next scan button</option><option value="15">After 15 seconds</option><option value="30">After 30 seconds</option><option value="60">After 60 seconds</option></select><p class="muted">The camera closes after a match. Touching the result cancels the timer. No cloud account, ads or payment service is connected.</p><button id="export">Export local observations and photos</button><p class="muted">Keep a backup before uninstalling or clearing app data. This pilot saves to this phone only.</p><p>Android pilot 0.1 · prepared 4 October 2026</p>`);
  $('modal-content').insertAdjacentHTML('beforeend','<label for="photo-quality">Location photo storage</label><select id="photo-quality"><option value="balanced">Balanced · up to 1600 px, aim 320 KB</option><option value="compact">Compact · up to 1280 px, aim 200 KB</option><option value="detail">More detail · up to 2048 px, aim 600 KB</option></select><p class="muted">New coworker photos only. A small preview is also saved. Targets are soft to preserve useful detail; originals are not retained. Supplied plans and reference photos are unchanged. Ads and optional £1/month ad-free membership are planned, not active.</p>');
  $('photo-quality').value=state.settings?.photoQuality||'balanced';$('photo-quality').onchange=()=>{state.settings={...state.settings,photoQuality:$('photo-quality').value};save();if(native)native.photoProfile(state.settings.photoQuality);};
  $('auto-scan').value=String(state.settings?.autoScan||0);$('auto-scan').onchange=()=>{state.settings={...state.settings,autoScan:Number($('auto-scan').value)};save();};
  $('export').onclick=()=>{if(native)native.exportBackup(JSON.stringify(state));else if(window.LocalPlatform)LocalPlatform.backup(state).catch(()=>{$('status').textContent='Backup could not be created. Existing data is unchanged.';});};
  $('modal-content').insertAdjacentHTML('beforeend','<button id="settings-import">Import PDF / ZIP plans</button>');$('settings-import').onclick=()=>{$('modal').close();$('import-plans').click();};
};
document.querySelectorAll('[data-query]').forEach(b=>b.onclick=()=>lookup(b.dataset.query));
document.addEventListener('pointerdown',cancelTimer,{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelTimer();if(native)native.stopCamera();}});
window.onSharedText=text=>lookup(text);
window.onBackupResult=message=>{$('status').textContent=message;};
window.onLocalCatalogue=async data=>{
  if(!baseCatalogue)return;
  catalogue={documents:[...baseCatalogue.documents,...data.documents],products:[...baseCatalogue.products,...data.products]};documents=new Map(catalogue.documents.map(d=>[d.id,d]));
  $('counts').textContent=`${catalogue.documents.length} plans · ${new Set(catalogue.products.map(p=>p.barcode)).size.toLocaleString('en-GB')} codes`;
  if(currentProduct&&$('query').value)lookup($('query').value);
};
async function loadLocal(){if(window.LocalPlatform&&baseCatalogue){await window.onLocalCatalogue(await LocalPlatform.catalogue());resolvePhotos();}}
window.addEventListener('local-platform-ready',()=>loadLocal().catch(()=>{$('status').textContent='Browser storage unavailable. Existing bundled plans remain searchable.';}));
$('import-plans').onclick=()=>{if(native)native.importPlans();else $('plan-files').click();};
$('plan-files').onchange=async e=>{try{await LocalPlatform.importFiles([...e.target.files]);}catch(error){$('status').textContent=error.message;}finally{e.target.value='';}};
let importQueue=Promise.resolve();
window.onImportURL=(name,url)=>{importQueue=importQueue.then(async()=>{try{const response=await fetch(url);if(!response.ok)throw Error('Selected file unavailable');await LocalPlatform.importFiles([new File([await response.blob()],name)]);}catch(error){$('status').textContent=error.message;}finally{native.importDone(url.split('/').at(-1));}});};
fetch('../catalogue/catalogue.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(async data=>{
  baseCatalogue=data;catalogue=data;documents=new Map(data.documents.map(d=>[d.id,d]));
  await window.onLocalCatalogue({documents:[],products:[]});await loadLocal();
  if(state.lastQuery)lookup(state.lastQuery);
  if(native){native.photoProfile(window.photoQuality());native.ready(catalogue.products.length>0);}
}).catch(()=>{$('status').textContent='The bundled catalogue could not be loaded. Restart the app; existing observations remain saved.';});
if(!native&&'serviceWorker' in navigator)navigator.serviceWorker.register('../sw.js').then(registration=>{registration.update();const notify=worker=>{if(worker?.state==='installed'&&navigator.serviceWorker.controller){$('status').textContent='Update ready. It will load the next time you reopen the app; your local data stays saved.';}};registration.addEventListener('updatefound',()=>registration.installing?.addEventListener('statechange',()=>notify(registration.installing)));}).catch(()=>{});

document.addEventListener('click',async e=>{const image=e.target.closest('[data-full-photo]');if(image){const url=await (window.LocalPlatform?.photoUrl(image.dataset.fullPhoto)||image.dataset.fullPhoto);openModal(`<img class="full-plan" src="${escapeHTML(url)}" alt="Full location evidence photo">`);}});
document.addEventListener('keydown',e=>{if(e.target.matches('[data-full-photo]')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.target.click();}});

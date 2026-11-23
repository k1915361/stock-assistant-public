'use strict';
// Rendering and search: the results, product and placement views, stored plans, copying a barcode, and the startup order. Loaded last among the app scripts.
function date(value) {return new Date(value).toLocaleString('en-GB', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
function locationSummary(p){return [p.fixture,p.bay,p.position&&p.position.length<=3?'Position '+p.position:''].filter(Boolean).join(' · ');}
function placementHeading(p,doc,product){const title=String(p.heading||p.title||'').trim(),normal=value=>String(value||'').toLocaleLowerCase('en-GB').replace(/[^\p{L}\p{N}]+/gu,' ').trim(),location=normal([p.bay,p.fixture].filter(Boolean).join(' ')),item=normal(product?.name),cleanTitle=title&&normal(title)!==item&&!(location&&normal(title).includes(location)&&item&&normal(title).includes(item));return [p.season,cleanTitle?title:WorkflowCore.planSourceName(doc?.name)].filter(Boolean).join(' · ');}
function placementChoiceLabel(p){
  const doc=documents.get(p.doc);
  const source=WorkflowCore.planSourceName(doc?.name,p.heading||p.title||'Unnamed plan');
  const page=p.diagramPage||p.page;
  return [p.season,source,locationSummary(p),page?'PDF '+page:''].filter(Boolean).join(' · ');
}
const suppliedPhotos={};
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
  if(searchQuery.trim()) {const previous=workspace.getState();workspace.setState({...previous,lastQuery:searchQuery,...(restoring?{}:{recent:[searchQuery,...previous.recent.filter(q=>q!==searchQuery)].slice(0,25)})});if(!save())workspace.setState(previous);}
  if(groups.length===1&&!searchResult.similar) showProduct(groups[0],null,scanned,resultSummary);
  else if(groups.length) {
    currentProduct=null;
    $('results').innerHTML='<p>'+(searchResult.similar?'Similar names found. Choose the correct item and colour.':'Choose the exact product or variant.')+'</p>'+groups.slice(0,100).map((g,i)=>`<button class="variant" data-group="${i}" data-icon="label"><strong>${escapeHTML(g.name)}</strong><span class="code">${escapeHTML(g.barcode)}</span></button>`).join('')+(groups.length>100?'<p>Narrow your search to see more results.</p>':'')+`<p class="result-summary">${escapeHTML(resultSummary)}</p>`;
    document.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>{showProduct(groups[Number(b.dataset.group)],null,scanned);recordAppScreen();});
  } else {
    currentProduct={barcode:(!/^https?:/i.test(searchQuery)&&(scanned||/^\d{6,14}$/.test(searchQuery)))?searchQuery:'',name:searchQuery,placements:[]};
    const available=storedPlanSummary();
    const sourceHelp=window.BundlePlans?.available()&&!BundlePlans.enabled()?window.PlanPack.text.searchOff:available.onlyDemo?'Only the test plan is stored here. Import your real plans to search your store.':available.plans.length?`Searched ${available.plans.length} stored plans · ${available.codes.toLocaleString('en-GB')} codes. The relevant plan may be missing or have no searchable text.`:'No plans are stored here. Import your PDFs or Android workspace ZIP.';
    $('results').innerHTML=`<div class="empty"><h2>Not found ${native?'on this device':'in this browser'}</h2>${currentProduct.barcode?`<div class="unmatched-barcode"><div><span class="muted">Scanned barcode</span><br><code id="unmatched-code" class="code" tabindex="0">${escapeHTML(currentProduct.barcode)}</code></div><button id="copy-unmatched-code" type="button" class="quiet" aria-label="Copy barcode" data-icon="copy">Copy barcode</button></div>`:''}<p>${escapeHTML(sourceHelp)}</p>${native?'':'<p class="muted">Plans in the Android app are not automatically copied to this browser.</p>'}<div class="actions"><button id="unknown-import" class="primary" data-icon="page">Import plans / workspace ZIP</button><button id="unknown-plans" data-icon="list">See stored plans</button></div><details${scanned?' open':''}><summary>${scanned?'Optional item details / label capture':'Record an item / read a label'}</summary><div class="actions"><button id="unknown-label" data-icon="label">Read a label photo</button><button id="unknown-product" data-icon="edit">Enter item details</button><button id="unknown-photo" data-icon="photo">Location photo</button></div>${/^https?:/.test(query)?'<p>Paste the page text, name or barcode into item details.</p>':''}</details></div>`;
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
  recordEvent({kind:'phone-position',product:context.product||'',productName:context.productName||'',query:context.query||'',photoEvent:context.photoEvent||'',trigger:context.trigger,capturedAt:context.capturedAt,requestStartedAt:new Date(context.startedAt).toISOString(),fix,workspaceContext:context.workspaceContext});
};
window.onLocationPermission=message=>{if($('position-help'))$('position-help').textContent=message;};
window.onBarcode = (code,source='lookup',capturedAt=Date.now()) => {
  cameraActive=false;
  const found=lookup(code,source==='camera');
  if(source!=='camera'){missedScan={code:null,count:0};return;}
  if(found===true)missedScan={code:null,count:0};
  // Each camera scan captures the position, including a scan that is tried again.
  capturePosition({product:currentProduct?.barcode||'',productName:currentProduct?.name||'',query:code,trigger:'barcode-scan',capturedAt:new Date(Number(capturedAt)).toISOString()});
  // A camera scan with no product is scanned again, up to SEARCH_MISS_ATTEMPTS scans of this barcode. The message shows in the camera panel, which covers the page, and in the status line.
  if(found===false){
    missedScan=SteadyReadCore.recordMiss(missedScan,code);
    const message=SteadyReadCore.missMessage(missedScan.count);
    $('status').textContent=message;
    if(SteadyReadCore.retryAfterMiss(missedScan.count)){openScanner(message);return;}
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
  $('results').innerHTML=`<article class="card product-card"><h1>${escapeHTML(product.name)}</h1><p class="code">${escapeHTML(product.barcode)}${product.price?' · Label price '+escapeHTML((product.currency||'')+product.price):''}</p><div id="latest-location"></div></article><section id="placements" aria-label="Plan placements"></section><details id="secondary-actions" open><summary>${scanned?'Optional item details, label photo and history':'Photo, item details, location notes and history'}</summary>${scanned?'<p class="muted">Read a shelf-label photo to suggest its printed price and text. Review the suggestions and save them to this item on this device.</p>':''}<div class="actions"><button id="add-photo" aria-label="Add location photo" data-icon="photo">Photo</button><button id="add-note" aria-label="Record location" data-icon="location">Location note</button><button id="edit-product" data-icon="edit">${scanned?'Add item details / read label':'Item details / read label'}</button><button id="product-history" aria-label="Item history" data-icon="history">Item history</button></div>${product.description?'<p>'+escapeHTML(product.description)+'</p>':''}</details><section id="observations" aria-label="Worker observations"></section><section id="official-page" class="official-page" aria-labelledby="official-page-title"><h2 id="official-page-title">Official product page</h2><div id="retailer-summary" class="retailer-summary"></div></section>`;
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
// The placement's plan preview can page through the other pages of its PDF, as the native plan page does. The item's own page keeps its boxes, rings and zoom; other pages show the whole page.
let placementPreview={key:'',page:0};
function placementPreviewState(p,product){
  const key=[product.barcode,placementIndex,p.doc].join('|');
  if(placementPreview.key!==key)placementPreview={key,page:p.diagramPage};
  const page=placementPreview.page,onItemPage=page===p.diagramPage;
  return {key,page,onItemPage,job:{codeBoxes:onItemPage&&p.diagramPage===p.page?p.codeBoxes:[],markers:onItemPage?p.markers:[],positions:onItemPage?[p.position]:[]}};
}
function paintPlanPager(p,product){
  const pager=$('plan-pager');if(!pager)return;
  const total=documents.get(p.doc)?.pages,{page,onItemPage}=placementPreviewState(p,product);
  if(!Number.isInteger(total)||total<2){pager.hidden=true;pager.replaceChildren();return;}
  pager.hidden=false;
  pager.innerHTML=`<button type="button" id="plan-previous" class="quiet" aria-label="Previous plan page" data-icon="previous" ${page<=1?'disabled':''}></button><p id="plan-page-count" class="plan-page-count" aria-live="polite">Page ${escapeHTML(page)} of ${escapeHTML(total)}</p>${onItemPage?'':'<button type="button" id="plan-item-page" class="quiet" data-icon="home" aria-label="Go to the item on page '+p.diagramPage+'">Item page '+p.diagramPage+'</button>'}<button type="button" id="plan-next" class="quiet" aria-label="Next plan page" data-icon="next" ${page>=total?'disabled':''}></button>`;
  AppUI.hydrateIcons(pager);
  $('plan-previous').onclick=()=>turnPlanPage(p,product,total,page-1);
  $('plan-next').onclick=()=>turnPlanPage(p,product,total,page+1);
  if($('plan-item-page'))$('plan-item-page').onclick=()=>turnPlanPage(p,product,total,p.diagramPage);
}
// Turns the preview to another page of the same PDF. Only the plan frame and its pager change, so the comment box and the typed note stay as they were.
function turnPlanPage(p,product,total,number){
  if(!Number.isInteger(number)||number<1||number>total)return;
  placementPreview={key:placementPreviewState(p,product).key,page:number};
  const shown=placementPreviewState(p,product);
  renderPlan(p.doc,number,shown.job.codeBoxes,shown.job.markers,'plan-0',state.settings.planZoom&&shown.onItemPage?WorkflowCore.focus(p.images||[],p.markers||[]):null,shown.job.positions);
  paintPlanPager(p,product);
}
function showPlacement(){
  const product=currentProduct,p=product.placements[placementIndex];
  const placements=$('placements');
  placements.replaceChildren();
  if(p){
    const doc=documents.get(p.doc), mark=StockCore.markFor({events:visibleEvents()},p.doc);
    const card=document.createElement('article');card.className='card placement-card';
    card.innerHTML=`<div class="plan-heading">${escapeHTML(placementHeading(p,doc,product))}</div><p class="plan-location">${escapeHTML(locationSummary(p))}</p>${mark==='outdated'?`<p class="warning">${AppUI.iconMarkup('warning')}Reported outdated · check observations</p>`:''}${product.placements.length>1?`<div class="placement-switch"><button id="previous-placement" aria-label="Previous placement" ${placementIndex===0?'disabled':''} data-icon="previous"></button><label class="sr-only" for="placement-choice">Choose plan location</label><select id="placement-choice">${product.placements.map((item,i)=>`<option value="${i}" ${i===placementIndex?'selected':''}>${i+1}/${escapeHTML(product.placements.length)} ·${escapeHTML(placementChoiceLabel(item))}</option>`).join('')}</select><button id="next-placement" aria-label="Next placement" ${placementIndex===product.placements.length-1?'disabled':''} data-icon="next"></button></div>`:''}<div class="plan-frame" id="plan-0" aria-label="Matching display area"><p>Opening local plan…</p></div><nav id="plan-pager" class="plan-pager" aria-label="Plan pages" hidden></nav><p class="verification">${mark==='outdated'?'Reported outdated':'Floor layout unverified'}${p.markers.length?'':' · Position marker unavailable'} · ${escapeHTML(p.title)} · PDF ${escapeHTML(p.diagramPage)}</p><p class="source plan-source-name"><strong>Source plan:</strong> ${escapeHTML(WorkflowCore.planSourceName(doc.name,p.heading||p.title))}</p><details class="plan-details" open><summary>More source details, product text and plan history</summary><p>${escapeHTML(p.rowText||p.name)}${p.status?' · Plan status: '+escapeHTML(p.status):''}${p.fill?' · Plan fill: '+escapeHTML(p.fill)+' (not a stock count)':''}</p>${p.sourceBarcode?`<p class="source identifier-note">Source prints ${escapeHTML(p.sourceBarcode)} · matched UPC ${escapeHTML(p.barcode)}. Leading zero restored from recorded manufacturer evidence.</p>`:''}<p class="source">${escapeHTML(doc.name)} · PDF page ${escapeHTML(p.page)}${p.printed?' · '+escapeHTML(p.printed):''}<br>${doc.sourceUpdated?'Source updated '+escapeHTML(doc.sourceUpdated):'Source update date unknown · Added '+escapeHTML(doc.added)}</p><p class="muted">Yellow/red rings and arrows: candidate position markers. Blue box: matching barcode. Planned placement, not verified stock.</p><div class="actions"><button class="table" data-icon="page">Product list page</button><button class="history" data-icon="history">Plan history</button></div></details>${planCommentFeedHTML(visibleEvents(),p.doc,mark==='outdated')}`;
    if(p.position)card.querySelector('.plan-location').innerHTML=`<span class="position-cue">Find number <strong>${escapeHTML(p.position)}</strong></span> <span>${escapeHTML([p.fixture,p.bay].filter(Boolean).join(' · '))}</span>`;
    if(product.placements.length>1){
      const trail=document.createElement('section');trail.className='card find-trail';placements.append(trail);
      AutomationUI.mount(trail,{key:product.barcode,places:product.placements,label:placementChoiceLabel,shown:()=>placementIndex,show:index=>{placementIndex=index;showPlacement();refreshAppSnapshot();},record:(action,place)=>recordEvent({kind:'location',product:product.barcode,productName:product.name,area:'',section:locationSummary(place)||placementChoiceLabel(place),note:'',action})});
    }
    placements.append(card);
    bindPlanComposer($('plan-comment-feed'),p.doc);
    const focus=WorkflowCore.focus(p.images||[],p.markers||[]);
    if(focus){card.querySelector('.plan-heading').insertAdjacentHTML('afterend','<button class="quiet zoom-toggle" id="toggle-zoom" data-icon="search">'+(state.settings.planZoom?'Full page':'Zoom display')+'</button>');$('toggle-zoom').onclick=()=>{if(updateSettings({planZoom:!state.settings.planZoom}))showPlacement();};}
    const preview=placementPreviewState(p,product);
    renderPlan(p.doc,preview.page,preview.job.codeBoxes,preview.job.markers,'plan-0',state.settings.planZoom&&preview.onItemPage?focus:null,preview.job.positions);
    paintPlanPager(p,product);
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
// The zoom of a placement preview is remembered per plan page, and per whole page or zoomed display area.
function planViewKey(node){return [node.planJob?.doc,node.planJob?.page,node.dataset.focus?'focus':'full'].join('|');}
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
    if(node.id==='plan-0')PlanZoomUI.mount(node,image,planViewKey(node));
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
 openPage('app:plan-page','<p class="source">'+escapeHTML(source.name)+'</p><p class="source" id="pdf-search">'+escapeHTML(cue)+(numbers.length?' · Find number '+escapeHTML(numbers.join(', ')):'')+'</p><form id="pdf-navigation" class="pdf-navigation"><button type="button" id="pdf-first" aria-label="First PDF page" data-icon="first"></button><button type="button" id="pdf-previous" aria-label="Previous PDF page" data-icon="previous"></button><label class="sr-only" for="pdf-page">PDF page</label><input type="number" inputmode="numeric" id="pdf-page" min="1" max="'+total+'" step="1" required><span>of '+total+'</span><button type="submit" id="pdf-go" data-icon="next">Go</button><button type="button" id="pdf-next" aria-label="Next PDF page" data-icon="next"></button><button type="button" id="pdf-last" aria-label="Last PDF page" data-icon="last"></button></form><button class="quiet" id="pdf-match" data-icon="search">Match page '+matchPage+'</button><p class="source" id="pdf-highlight-note" role="status"></p><div class="plan-frame" id="full-plan" data-full-page="true" aria-label="Full original plan page"></div>',{title:'Source plan page '+page+' of '+total});
 let showing=page;
 const display=(number,initial=null)=>{
  if(!Number.isInteger(number)||number<1||number>total)return;
  showing=number;$('pdf-page').value=number;$('page-title').textContent='Source plan page '+number+' of '+total;
  $('pdf-first').disabled=number===1;$('pdf-previous').disabled=number===1;$('pdf-next').disabled=number===total;$('pdf-last').disabled=number===total;$('pdf-match').disabled=number===matchPage;
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
 $('pdf-first').onclick=()=>display(1);$('pdf-previous').onclick=()=>display(showing-1);$('pdf-next').onclick=()=>display(showing+1);$('pdf-last').onclick=()=>display(total);$('pdf-match').onclick=()=>display(matchPage);
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
  feed.querySelector('#plan-composer').onsubmit=e=>{e.preventDefault();const note=text.value.trim();if(!note){text.focus();return;}if(recordEvent({kind:'plan-comment',doc,note}))refreshPlanComments(doc);};
  feed.querySelector('#plan-mark').onclick=()=>{const outdated=StockCore.markFor({events:visibleEvents()},doc)==='outdated';if(recordEvent({kind:'plan-mark',doc,mark:outdated?'unverified':'outdated',note:text.value.trim()}))showPlacement();};
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
    if(recordEvent({kind:'product',barcode,name,product:barcode,productName:name,price:$('item-price').value.trim(),currency:$('item-currency').value.trim(),description:$('item-description').value.trim(),rawText:$('item-text').value,labelPhoto:draft.labelPhoto||'',labelEvent:draft.labelEvent||'',source:draft.source||'manual',ocrConfidence:draft.ocrConfidence??null,workspaceContext:originalWorkspace})){ leaveOverlay().then(()=>{lookup(barcode,false,true);$('status').textContent='Item saved locally. Add a location photo or note when useful.';}); }
  };
}
let labelAttempt=0;
function samePhotoObservation(previous,kind,target,url,info){return previous.kind===kind&&previous.product===target&&(previous.photo===url||info.captureId&&previous.photoInfo?.captureId===info.captureId&&previous.photoInfo?.photo===info.photo);}
window.onOCRProgress=message=>{if($('ocr-progress'))$('ocr-progress').textContent=message;};
window.onLabelPhoto=async(url,thumbnail='',encoded='{}')=>{
  cameraActive=false;
  let info={};try{info=JSON.parse(encoded);}catch(error){/* A damaged capture record is treated as having no details. */reportFailure('capture record',error);}
  const target=typeof info.product==='string'?{barcode:info.product,name:info.productName||''}:currentProduct;
  const draft={...target,labelPhoto:url,labelEvent:info.captureId||crypto.randomUUID(),source:'label-photo',workspaceContext:info.captureScope?CaptureCore.identity(info.captureScope):null};
  const previous=state.events.find(e=>e.id===draft.labelEvent);if(previous)return samePhotoObservation(previous,'label-photo',draft.barcode||'',url,info);
  const attempt=++labelAttempt;
  if(!recordEvent({id:draft.labelEvent,kind:'label-photo',at:new Date(info.capturedAt||Date.now()).toISOString(),product:draft.barcode||'',productName:draft.name||'',photo:url,thumbnail,photoInfo:info,workspaceContext:info.captureScope?CaptureCore.identity(info.captureScope):null}))return false;
  if(info.recovery)return true;
  capturePosition({product:draft.barcode,productName:draft.name,trigger:'label-photo',photoEvent:draft.labelEvent,capturedAt:new Date(info.capturedAt||Date.now()).toISOString()});
  let reading=true;
  openPage('app:read-label','<p id="ocr-progress" role="status">Loading offline recognition tools.</p><p class="muted">The photo stays local. You can enter details instead while keeping the photo.</p><button id="skip-ocr" data-icon="edit">Enter manually</button>',{onClose:()=>{if(reading){labelAttempt++;window.LocalPlatform?.cancelOCR();}}});
  $('skip-ocr').onclick=()=>{reading=false;labelAttempt++;LocalPlatform.cancelOCR();productForm(draft,{replace:true});};
  try{const result=await LocalPlatform.recognizePhoto(url);reading=false;if(attempt===labelAttempt)productForm({...draft,...ProductCore.extract(result.text,draft.barcode),ocrConfidence:result.confidence},{replace:true});}
  catch(error){reportFailure('label text recognition',error);reading=false;if(attempt===labelAttempt){productForm(draft,{replace:true});overlayMessage('Label text could not be read. The photo is retained; enter the details manually.');}}
  return true;
};
window.photoQuality=()=>state.settings?.photoQuality||'balanced';
async function resolvePhotos(){if(!window.LocalPlatform)return;for(const image of document.querySelectorAll('img[data-local-photo]')){const reference=image.dataset.localPhoto;try{image.src=await LocalPlatform.photoUrl(reference);}catch(error){reportFailure('saved photo',error);image.alt+=' · file unavailable';}}}
window.onPhoto=(url,thumbnail='',encoded='{}')=>{
  cameraActive=false;
  let photoInfo={};try{photoInfo=JSON.parse(encoded);}catch(error){/* A damaged capture record is treated as having no details. */reportFailure('capture record',error);}
  const target=typeof photoInfo.product==='string'?{barcode:photoInfo.product,name:photoInfo.productName||''}:currentProduct;
  if(!target||!target.barcode&&!target.name){$('status').textContent='Search for an item before attaching a photo.';return false;}
  const photoEvent=photoInfo.captureId||crypto.randomUUID(),previous=state.events.find(e=>e.id===photoEvent);if(previous)return samePhotoObservation(previous,'location',target.barcode,url,photoInfo);
  if(recordEvent({id:photoEvent,kind:'location',at:new Date(photoInfo.capturedAt||Date.now()).toISOString(),product:target.barcode,productName:target.name,photo:url,thumbnail,photoInfo,section:'',area:'',note:'',action:'seen',workspaceContext:photoInfo.captureScope?CaptureCore.identity(photoInfo.captureScope):null})){
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
  $('save-location').onclick=()=>{if(recordEvent({kind:'location',product:targetProduct.barcode,productName:targetProduct.name,photo,...(photo?(()=>{const original=state.events.find(e=>e.photo===photo);return {thumbnail:original?.thumbnail,photoInfo:original?.photoInfo};})():{}),area:$('area').value,section:$('section').value.trim(),note:$('location-note').value.trim(),action:$('action').value,workspaceContext:originalWorkspace})){ leaveOverlay();renderObservations();$('status').textContent='Observation saved locally. Coworker sync is not connected.'; }};
}
function showHistory(events,doc='',title=''){
  const route=doc?'app:plan-history':'app:item-history';
  const ordered=events.slice().reverse();let index=0;
  function draw(){
    const e=ordered[index];openPage(route,`${e?`<div class="history-note"><p>${escapeHTML(e.worker)} · ${date(e.at)}</p><h3>${escapeHTML(e.kind==='phone-position'?'Phone position experiment':e.mark || e.action || e.kind)}</h3><p>${escapeHTML(e.note || e.section || e.productName || e.query || 'No extra details')}</p>${positionDetails(e)}${e.photo?`<img class="location-photo" src="${/^local-/.test(e.photo)?'':escapeHTML(e.photo)}" ${/^local-/.test(e.photo)?`data-local-photo="${escapeHTML(e.photo)}"`:''} alt="Previous worker location photo">`:''}</div><div class="history-controls"><button id="previous" ${index===ordered.length-1?'disabled':''} data-icon="previous">Older</button><span>${index+1} of ${ordered.length}</span><button id="newer" ${index===0?'disabled':''} data-icon="next">Newer</button></div>${doc&&e.kind==='plan-mark'?'<button id="restore" data-icon="upload">Restore this mark as a new change</button>':''}`:'<p>No recorded history yet.</p>'}`,{title:title||undefined});
    if(e){$('previous').onclick=()=>{index++;draw();};$('newer').onclick=()=>{index--;draw();};let touchX; const card=overlayContent();card.ontouchstart=t=>{touchX=t.changedTouches[0].clientX;};card.ontouchend=t=>{const dx=t.changedTouches[0].clientX-touchX;if(Math.abs(dx)>75){index=Math.max(0,Math.min(ordered.length-1,index+(dx<0?1:-1)));draw();}};if($('restore'))$('restore').onclick=()=>{if(recordEvent({kind:'plan-mark',doc,mark:e.mark,note:'Restored from history '+e.id})){ leaveOverlay().then(()=>showProduct(currentProduct)); }};}
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
// The scan buttons are bound in scan-options-ui.js: a tap starts a scan, and a long press opens the scan options page.
// Navigation panel: the left-hand panel with the native drawer's destinations. Escape, the scrim, a choice or Back closes it, and focus returns to its toggle.
const navOpen=()=>document.body.classList.contains('nav-open');
// The destination the screen is showing is marked, as the native drawer marks its selected entry: a page's address, Settings, or Stock for the search screen.
function markNavCurrent(){
  const current=document.body.classList.contains('page-open')?($('page-address')?.textContent.trim()||''):document.body.classList.contains('settings-open')?'app:settings':'home';
  for(const row of document.querySelectorAll('#nav-panel [data-nav]')){
    if(row.dataset.nav===current)row.setAttribute('aria-current','page');else row.removeAttribute('aria-current');
  }
}
function openNavPanel(){
  if(navOpen())return;
  $('nav-version').textContent=currentBuildLabel();
  markNavCurrent();
  renderNavQuick();
  document.body.classList.add('nav-open');$('nav-toggle').setAttribute('aria-expanded','true');
  $('nav-close').focus({preventScroll:true});
}
function closeNavPanel({restoreFocus=true}={}){
  if(!navOpen())return false;
  document.body.classList.remove('nav-open');$('nav-toggle').setAttribute('aria-expanded','false');
  if(restoreFocus)$('nav-toggle').focus({preventScroll:true});
  return true;
}
$('nav-toggle').onclick=()=>navOpen()?closeNavPanel():openNavPanel();
$('nav-close').onclick=()=>closeNavPanel();
$('nav-scrim').onclick=()=>closeNavPanel({restoreFocus:false});
$('nav-panel').addEventListener('click',event=>{
  const choice=event.target.closest('[data-nav]');
  if(!choice)return;
  const destination=choice.dataset.nav;
  closeNavPanel({restoreFocus:false});
  if(destination==='home'){leaveScreensForSearch();window.scrollTo(0,0);$('query').focus();}
  else if(destination==='scan')void startScan();
  else openRoute(destination);
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&closeNavPanel())event.preventDefault();});
// While the panel is open, keyboard focus stays inside it. The toggle still works to close it.
document.addEventListener('focusin',event=>{if(navOpen()&&!$('nav-panel').contains(event.target)&&event.target!==$('nav-toggle'))$('nav-close').focus({preventScroll:true});});
// The edge swipe opens and closes the same panel. It does not start on a zoomed plan, or on a card whose sideways swipe changes placement.
NavSwipeUI.install({panel:$('nav-panel'),scrim:$('nav-scrim'),isOpen:navOpen,openPanel:openNavPanel,closePanel:()=>closeNavPanel({restoreFocus:false}),available:()=>$('nav-toggle').getClientRects().length>0,ignoreStart:target=>Boolean(target.closest?.('input,textarea,select,[contenteditable],.plan-zoomable[data-zoomed="true"],.placement-card:has(.placement-switch)'))});
// Holding a button must not select its text or open the system menu.
const holdGuard=event=>{const node=event.target.nodeType===1?event.target:event.target.parentElement;if(node?.closest('button'))event.preventDefault();};
document.addEventListener('selectstart',holdGuard);
document.addEventListener('contextmenu',holdGuard);
// The panel's rows for the open item and the Android page controls are drawn each time it opens, so they match the screen behind it.
function renderNavQuick(){
  $('nav-quick').innerHTML=AppMenu.markup({item:!!currentProduct,native:!!window.Native,escape:escapeHTML});
  // A row runs its action and closes the panel. Bookmark stays open, so its label can change in place.
  const choose=(id,action)=>{const row=$(id);if(row)row.onclick=()=>{closeNavPanel({restoreFocus:false});action();};};
  if(currentProduct){
    choose('quick-map',()=>LocationMap.open(visibleEvents(),currentProduct.barcode));
    choose('quick-product',()=>productForm());
    choose('quick-photo',addPhoto);
    choose('quick-note',()=>locationForm());
    choose('quick-history',()=>showHistory(visibleEvents().filter(e=>sameProductCode(e.product,currentProduct.barcode))));
    $('quick-bookmark').onclick=()=>window.toggleBookmark();
  }
  // The Android app has no browser buttons, so its panel keeps Back, Forward and Refresh. In a browser the browser's own buttons do these.
  if(window.Native){
    choose('quick-refresh',()=>window.refreshApp());
    $('quick-forward').disabled=!canGoForward();
    choose('quick-forward',()=>{if(canGoForward())history.forward();});
    $('quick-back').disabled=!canGoBack();
    choose('quick-back',()=>{if(canGoBack())window.stockAssistantBack();});
  }
  renderBookmarkTile();
}
$('close-modal').onclick=()=>$('modal').close();
function currentBuildLabel(){const entry=Array.isArray(window.RELEASE_NOTES)?window.RELEASE_NOTES[0]:null;return entry?`Stock Assistant pilot ${entry.version} · ${entry.date}${entry.time?' · '+entry.time:''}`:'Stock Assistant pilot';}
// The Settings footer shows the same build line with its calendar icon.
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
$('modal').addEventListener('close',()=>{window.LocalPlatform?.cancelRestoreRecovery?.();for(const view of planViews.keys())if($('modal').contains(view))releasePlanView(view);resumeTimer();});
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
  if(!native&&browserWriter?.mode()==='waiting')try{refreshBrowserWorkspace();}catch(error){/* refreshBrowserWorkspace has already recorded the unreadable copy, and the backup keeps it. */reportFailure('browser saved history for backup',error);}
  const photos=pendingPhotoEvents(nativePendingPhotos().records);
  // Avoid sorting/copying the whole history when there is nothing to reconcile.
  const recovered=pending.length?pending.reduce(RestoreCore.mergeWorkspace,state):state;
  const external=!native&&browserWriter?.mode()==='stale'?localStorage.getItem('stock-pilot-v1'):null;
  return {state:photos.length?RestoreCore.mergeWorkspace(recovered,{events:photos}):recovered,...(unreadableState!==null?{recoveryOriginalState:unreadableState}:external!==null?{recoveryOriginalState:external}:{})};
};
window.onWorkspaceRestored=async restored=>{const previous=workspace.getState();workspace.setState(RestoreCore.mergeWorkspace(previous,restored));if(!save()){workspace.setState(previous);throw Error('Observation storage unavailable.');}};
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
 if(!native){try{await LocalPlatform.recoverWorkspaceRoot();workspaceRootReady=true;workspaceRootFailure='';if(browserWriter?.writable())$('workspace-status').hidden=true;}catch(error){reportFailure('workspace root recovery',error);workspaceRootReady=false;try{unreadableState=localStorage.getItem('stock-pilot-v1');}catch(readError){/* Storage cannot be read here; the warning below still applies. */reportFailure('browser saved history read',readError);}workspaceRootFailure='Committed workspace recovery needs review. Writes are paused; export a recovery backup in Settings.';$('status').textContent=workspaceRootFailure;$('workspace-status').hidden=false;$('workspace-status').textContent=workspaceRootFailure;}}
 if((native||browserWriter?.writable())&&workspaceRootReady)try{await LocalPlatform.recoverWorkspace();}catch(error){reportFailure('workspace recovery',error);$('status').textContent='Workspace recovery is waiting for storage. Existing history and restored files are retained; free space and reopen.';}
 if(!native&&browserWriter?.writable()&&workspaceRootReady)try{const result=await LocalPlatform.recoverPhotos();if(result&&result.records.length>result.recovered)$('status').textContent='Photos are retained for their original items and are waiting to save. Retry in Settings or export a backup.';}catch(error){reportFailure('photo recovery',error);$('status').textContent='Photo recovery is waiting; original tickets and files are retained.';}
 if(window.BundlePlans?.available()&&!BundlePlans.enabled())await LocalPlatform.removeBundledPlans();await window.onLocalCatalogue(await LocalPlatform.catalogue());resolvePhotos();
}}
window.addEventListener('local-platform-ready',()=>loadLocal().catch(error=>{reportFailure('browser storage startup',error);$('status').textContent='Browser storage unavailable. Existing bundled plans remain searchable.';}));
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
 }).catch(error=>reportFailure('service worker registration',error));
}


document.addEventListener('click',async e=>{const image=e.target.closest('[data-full-photo]');if(image){const url=await (window.LocalPlatform?.photoUrl(image.dataset.fullPhoto)||image.dataset.fullPhoto);openModal(`<img class="full-plan" src="${escapeHTML(url)}" alt="Full location evidence photo">`,false,'viewer');}});
document.addEventListener('keydown',e=>{if(e.target.matches('[data-full-photo]')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.target.click();}});
// Lists only the keys the app handles: ? here, Escape for dialogs and Settings search, Enter in search and on plans/photos, and Tab.
function openShortcutSheet(options={}){openPage('app:shortcuts','<dl class="shortcut-sheet"><dt><kbd>?</kbd></dt><dd>Show this list. Works when no text field or dialog is open.</dd><dt><kbd>Esc</kbd></dt><dd>Close the open dialog or page. In Settings search, clear the search first.</dd><dt><kbd>Enter</kbd></dt><dd>Find the typed barcode or name in the search box, or open the focused plan or photo.</dd><dt><kbd>Tab</kbd></dt><dd>Move between controls. Shift+Tab moves back.</dd></dl>',options);}
document.addEventListener('keydown',e=>{if(e.key!=='?'||e.ctrlKey||e.metaKey||e.altKey||overlayOpen()||navOpen()||e.target.closest?.('input,textarea,select,[contenteditable]'))return;e.preventDefault();openShortcutSheet();});
// Escape closes one layer: the navigation panel, which already took the key (defaultPrevented), or else the page.
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.defaultPrevented&&pageOpen()&&!$('modal').open&&!e.target.closest?.('input,textarea,select,[contenteditable]')){e.preventDefault();closeOverlay();}});

function setupBundleSettings(){
  const enabled=BundlePlans.enabled(),T=window.PlanPack.text;
  $('settings-offline').insertAdjacentHTML('beforeend',`<section class="settings-group"><h3>Offline plans</h3><p id="bundle-readiness" class="muted" role="status">Checking saved files…</p><p id="bundle-storage" class="muted"></p><button id="bundle-protect" hidden data-icon="lock">Protect saved files from automatic clearing</button><h3>${T.settingsHeading}</h3><p id="bundle-help" class="muted">${enabled?T.enabledHelp:T.offHelp}</p><button id="bundle-toggle" data-icon="sliders"${enabled?' data-tone="danger"':''}>${enabled?T.removeAction:T.enableAction}</button>${enabled?'<button id="bundle-offline" data-icon="download">Save missing plans for offline use</button>':''}</section>`);
  $('bundle-readiness').insertAdjacentHTML('afterend','<button id="bundle-app-save" hidden data-icon="download">Restore missing app files for offline opening</button>');
  const readiness=$('bundle-readiness'),storage=$('bundle-storage'),protect=$('bundle-protect'),download=$('bundle-offline'),appSave=$('bundle-app-save');let downloading=false,refresh=0;
  async function check(){
    const attempt=++refresh;
    try{
      const info=await BundlePlans.offlineStatus();if(!readiness.isConnected||attempt!==refresh)return;
      const app=info.app.ready?'App files saved for offline opening.':info.app.status==='not-installed'?'App files are not installed offline yet.':info.app.status==='incomplete'?'Some app files are missing. Restore them with a connection.':'App offline opening could not be confirmed yet.';
      appSave.hidden=info.app.status!=='incomplete';
      readiness.textContent=app+' '+(info.enabled?`${T.savedCount(info.saved,info.total)} ${info.catalogueSaved?'Item search saved.':'Item search not saved offline yet.'}`:T.off);
      storage.textContent=info.persistence==='granted'?'Storage protection granted. Clearing site data still removes saved files; keep a workspace backup.':info.persistence==='not-granted'?'Storage protection is not granted. This browser may clear saved files; keep a workspace backup.':info.persistence==='unavailable'?'This browser does not offer storage protection. Keep a workspace backup.':'Storage protection could not be checked. Keep a workspace backup.';
      protect.hidden=!['not-granted','unknown'].includes(info.persistence);
      if(download&&!downloading){const remaining=STOCK_BUNDLE.documents.filter(d=>info.missing.includes(d.id)).reduce((sum,d)=>sum+(d.bytes||0),0);download.disabled=!info.enabled||(info.saved===info.total&&info.catalogueSaved);download.textContent=download.disabled&&info.enabled?T.allSaved:`Save missing plans for offline use${remaining?' · about '+Math.ceil(remaining/1048576)+' MB':''}`;}
    }catch{if(readiness.isConnected&&attempt===refresh){readiness.textContent='Saved files could not be checked. Existing work is kept; retry by reopening Settings.';}}
  }
  protect.onclick=async()=>{protect.disabled=true;await BundlePlans.requestPersistence();await check();if(protect.isConnected)protect.disabled=false;};
  appSave.onclick=async()=>{appSave.disabled=true;const result=await BundlePlans.saveApp();if(appSave.isConnected){$('bundle-help').textContent=result.ready?'Missing app files saved.':'App files could not all be saved. Existing files are kept; retry with a connection.';appSave.disabled=false;}await check();};
  const changed=()=>{if(readiness.isConnected)void check();};navigator.serviceWorker?.addEventListener('controllerchange',changed);
  $('modal').addEventListener('close',()=>navigator.serviceWorker?.removeEventListener('controllerchange',changed),{once:true});
  $('bundle-toggle').onclick=async()=>{
    $('bundle-toggle').disabled=true;
    try{await BundlePlans.setEnabled(!enabled);baseCatalogue=await BundlePlans.catalogue();currentProduct=null;await loadLocal();$('results').innerHTML='';document.body.classList.remove('has-results');$('status').textContent=enabled?T.removed:T.enabled;$('modal').close();}
    catch(error){$('bundle-help').textContent=error.message+(!BundlePlans.enabled()?' '+T.keptOff:'');$('bundle-toggle').disabled=false;}
  };
  if(download)download.onclick=async()=>{downloading=true;download.disabled=true;$('bundle-help').textContent='Saving missing plans. Files already saved are kept.';try{await BundlePlans.downloadAll((done,total)=>{if(download.isConnected)download.textContent=`Saving plans · ${done}/${total}`;});if(download.isConnected)$('bundle-help').textContent='Download finished. Saved files are checked below.';}catch(error){if(download.isConnected)$('bundle-help').textContent=error.name==='QuotaExceededError'?'Not enough browser storage. Saved files are kept. Export a backup before making space.':error.message;}finally{downloading=false;await check();}};
  void check();
}
window.openAccountModal=(html,options={})=>openPage('app:account',html,options);
window.openWorkflowPresets=(options={})=>{
  if(!AccountUI.has('workflow-presets')){AccountUI.open();return;}
  const presets=Array.isArray(state.settings.workflowPresets)?state.settings.workflowPresets:[];
  openPage('app:presets',`<p class="muted">Keep different scan timers and photo settings for different jobs. Your ordinary settings stay available without membership.</p><label for="preset-name">Name for current settings</label><input id="preset-name" maxlength="40" placeholder="e.g. Warehouse"><button id="preset-save" data-icon="check">Save current settings</button><p id="preset-help" role="status"></p>${presets.map((p,i)=>`<div class="actions"><button data-preset="${i}" data-icon="sliders">${escapeHTML(p.name)}</button><button data-preset-delete="${i}" data-icon="trash">Remove</button></div>`).join('')}`,options);
  $('preset-save').onclick=()=>{if(!AccountUI.has('workflow-presets'))return AccountUI.open();const name=$('preset-name').value.trim();if(!name){$('preset-help').textContent='Enter a name.';return;}if(presets.length>=10){$('preset-help').textContent='You can save up to 10 presets.';return;}const previous=workspace.getState(),s=previous.settings;workspace.setState({...previous,settings:{...s,workflowPresets:[...presets,{name,autoScan:s.autoScan,scanPosition:s.scanPosition,planZoom:s.planZoom,photoQuality:s.photoQuality||'balanced'}]}});if(save())window.openWorkflowPresets();else workspace.setState(previous);};
  document.querySelectorAll('[data-preset]').forEach(button=>button.onclick=()=>{if(!AccountUI.has('workflow-presets'))return AccountUI.open();const previous=workspace.getState(),p=presets[Number(button.dataset.preset)];workspace.setState({...previous,settings:{...previous.settings,autoScan:[0,15,30,60].includes(p.autoScan)?p.autoScan:60,scanPosition:p.scanPosition===true,planZoom:p.planZoom!==false,photoQuality:['balanced','compact','detail'].includes(p.photoQuality)?p.photoQuality:'balanced'}});if(save()){leaveOverlay().then(()=>{cancelTimer();$('status').textContent='Workflow preset applied: '+p.name;});}else workspace.setState(previous);});
  document.querySelectorAll('[data-preset-delete]').forEach(button=>button.onclick=()=>{if(!AccountUI.has('workflow-presets'))return AccountUI.open();const previous=workspace.getState();workspace.setState({...previous,settings:{...previous.settings,workflowPresets:presets.filter((_,i)=>i!==Number(button.dataset.presetDelete))}});if(save())window.openWorkflowPresets();else workspace.setState(previous);});
};

// Bookmarks are the pinned-lookups list, keyed by the item's barcode (or the typed query when it has none).
function bookmarkKey(){return currentProduct?(currentProduct.barcode||$('query').value):'';}
// Like Chrome's star, the bookmark control shows whether the open item is saved. With no open item it is unavailable.
function renderBookmarkTile(){
  const tile=$('quick-bookmark');if(!tile)return;
  const key=bookmarkKey(),saved=!!key&&BookmarkCore.isBookmarked(state.pinnedLookups,key);
  const label=saved?'Remove bookmark':'Bookmark';
  tile.disabled=!key;tile.setAttribute('aria-pressed',String(saved));tile.setAttribute('aria-label',label);tile.querySelector('span').textContent=label;
  tile.title=key?label:'Open an item to bookmark it';
}
// The star adds or removes a bookmark and leaves the menu open. Bookmarks are free for everyone, with or without membership.
window.toggleBookmark=async()=>{
  if(!currentProduct)return;
  const result=BookmarkCore.toggle(Array.isArray(state.pinnedLookups)?state.pinnedLookups:[],{query:bookmarkKey(),name:currentProduct.name||bookmarkKey()}),status=$('menu-status');
  if(result.saved===null){if(status)status.textContent=`You can bookmark up to ${BookmarkCore.LIMIT} items. Remove an old bookmark first.`;return;}
  const previous=workspace.getState();workspace.setState({...previous,pinnedLookups:result.bookmarks});if(!save()){workspace.setState(previous);return;}
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
  openPage('app:pins',`<p class="muted">Open common items without typing or scanning. Locations come from your currently enabled plans.</p>${pins.map((p,i)=>`<div class="actions"><button data-pin="${i}" data-icon="pin">${escapeHTML(p.name)}</button><button data-unpin="${i}" data-icon="close">Remove</button></div>`).join('')||'<p>Open an item, then open the menu and tap Bookmark.</p>'}`,options);
  document.querySelectorAll('[data-pin]').forEach(button=>button.onclick=()=>{leaveOverlay().then(()=>lookup(pins[Number(button.dataset.pin)].query,false,true));});
  document.querySelectorAll('[data-unpin]').forEach(button=>button.onclick=()=>{const previous=workspace.getState();workspace.setState({...previous,pinnedLookups:pins.filter((_,i)=>i!==Number(button.dataset.unpin))});if(save())window.openPinnedLookups();else workspace.setState(previous);});
};

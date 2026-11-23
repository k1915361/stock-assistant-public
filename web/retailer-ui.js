'use strict';
window.RetailerUI=(()=>{
  const pending=new Set();
  const config=RetailerConfig.defaults;
  const storeName=()=>state.settings.dunelmStore||config.defaultStore.name;
  const storeId=()=>RetailerCore.storeId(state.settings);
  // The official product list is the public sitemap list. The Android app downloads and caches it; the browser cannot read it.
  let productIndex=null,indexRequested=false,indexRequestedAt=0;
  const INDEX_RETRY_MS=10*60*1000;
  const matchedBarcodes=new Set(); // items already matched against the list this session, so a miss is not retried on every render
  const lookups=new Map();         // barcode -> last lookup result, which drives the official search links
  function currentLink(){return RetailerCore.links(state.events).find(e=>StockCore.canonical(e.barcode)===StockCore.canonical(currentProduct?.barcode));}
  function cached(){const link=currentLink();return (state.retailerCache||[]).find(e=>RetailerCore.key(e.barcode,e.store)===RetailerCore.key(currentProduct?.barcode,storeName())&&String(e.storeId||'')===storeId()&&(!link||RetailerCore.officialURL(e.url)===link.url));}
  // Dimensions, material and description show only when a cached result carries them. The Android parser does not supply them yet.
  function factsHTML(entry){return [['Dimensions',entry?.dimensions],['Material',entry?.material],['Description',entry?.description]].filter(([,value])=>typeof value==='string'&&value.trim()).map(([label,value])=>`<p><strong>${label}:</strong> ${escapeHTML(value.trim())}</p>`).join('');}
  function resultHTML(entry,link){
    if(!entry)return link?`<p class="muted">Checking the official ${escapeHTML(config.label)} page…</p>`:'';
    const price=typeof entry.price==='number'?RetailerCore.money(entry.price,entry.currency):'Price unavailable';
    return `<p><strong>${escapeHTML(price)}</strong> · ${escapeHTML(entry.officialStoreName||storeName())}: ${Number.isInteger(entry.stockCount)?entry.stockCount+' reported':'stock unknown'}</p><p class="muted">${escapeHTML(RetailerCore.collectionLine(entry))}${entry.checkedAt?' · '+(RetailerCore.stale(entry)?'price stale · ':'')+escapeHTML(date(entry.checkedAt)):' · not fetched'}</p><p class="muted">Price and stock are for the exact variant on the linked page.</p>`;
  }
  // One place for the status line's id, so the message text is set the same way from every path.
  const statusNode=()=>$('retailer-cache-status');
  function setStatus(text){const node=statusNode();if(node)node.textContent=text;}
  // What the lookup found for this item, in words, while no official page is linked.
  function lookupMessage(link){
    if(link)return '';
    if(!native)return 'Official page matching runs in the Android app. Official search links are below.';
    if(!productIndex)return indexRequested?`Loading the official ${config.label} product list…`:`The official ${config.label} product list is not loaded yet.`;
    const result=lookups.get(StockCore.canonical(currentProduct?.barcode||''));
    if(result?.status==='ambiguous')return `Several official pages match “${currentProduct?.name||'this item'}”. Choose one in the search links.`;
    if(result?.status==='none')return 'No official page matches this item name. Official search links are below.';
    return '';
  }
  // Official search links, most reliable first. Shown only while no official page is linked. A person opens them; the app never fetches them.
  function findHTML(link){
    if(link)return '';
    const result=lookups.get(StockCore.canonical(currentProduct?.barcode||''))||null;
    const items=RetailerLookup.fallbackLinks({barcode:currentProduct?.barcode||'',name:currentProduct?.name||''},result,config);
    if(!items.length)return '';
    return `<details id="retailer-find" class="retailer-find"><summary>Official search links</summary><ol>${items.map(item=>`<li>${item.kind==='possible-product'?`<button type="button" class="retailer-choose" data-icon="check" data-choose-page="${escapeHTML(item.url)}">${escapeHTML(item.label)}</button>`:`<a href="${escapeHTML(item.url)}" target="_blank" rel="noopener">${escapeHTML(item.label)}</a>`}</li>`).join('')}</ol><p class="muted">These pages are for you to open. The app does not fetch search pages.</p></details>`;
  }
  // The product list is downloaded once a week by the Android app. It is asked for only while an item still has no official page.
  function requestIndex(link){
    if(link||productIndex||!native||typeof native.loadRetailerIndex!=='function'||!currentProduct?.name)return;
    // A request that never answers is sent again after the retry interval; an answer or an error clears indexRequested at once.
    if(indexRequested&&Date.now()-indexRequestedAt<INDEX_RETRY_MS)return;
    indexRequested=true;indexRequestedAt=Date.now();
    native.loadRetailerIndex();
  }
  // Links the item to its official page when exactly one product in the list matches its name. Runs once per item and list.
  function autoLink(){
    const barcode=StockCore.canonical(currentProduct?.barcode||'');
    if(!barcode||!currentProduct?.name||currentLink()||!productIndex||matchedBarcodes.has(barcode))return false;
    matchedBarcodes.add(barcode);
    const result=RetailerLookup.match(currentProduct.name,productIndex,config);
    lookups.set(barcode,result);
    return result.status==='matched'&&attachPage(result.product.url,result.product.productId,'auto-name');
  }
  // The person chose one of the possible pages. It is linked the same way, and the record says it was chosen.
  function choosePage(url){
    const result=lookups.get(StockCore.canonical(currentProduct?.barcode||''));
    const candidate=result?.candidates?.find(item=>item.url===url);
    if(candidate&&attachPage(candidate.url,candidate.productId,'chosen'))render();
  }
  // Records the item's official page, for an automatic match or a page the person chose. The cached details follow the new page.
  function attachPage(url,productId,source){
    const target={barcode:currentProduct?.barcode,name:currentProduct?.name,store:storeName(),storeId:storeId()};
    if(!target.barcode||!RetailerCore.officialURL(url))return false;
    const previous=workspace.getState(),cache=previous.retailerCache||[],key=RetailerCore.key(target.barcode,target.store),old=cache.find(e=>RetailerCore.key(e.barcode,e.store)===key);
    // Cached details for another page or store are dropped in the same save as the new link, so the two never disagree.
    if(old&&(old.url!==url||String(old.storeId||'')!==target.storeId))workspace.setState({...previous,retailerCache:cache.filter(e=>RetailerCore.key(e.barcode,e.store)!==key)});
    if(recordEvent({kind:'retailer-link',product:target.barcode,productName:target.name,url,store:target.store,storeId:target.storeId,source,productId}))return true;
    workspace.setState(previous);
    return false;
  }
  function render(){
    const node=$('retailer-summary');if(!node)return;
    if(autoLink())return render();
    const entry=cached(),link=currentLink(),barcode=StockCore.canonical(currentProduct?.barcode||'');
    requestIndex(link);
    if(node.dataset.barcode!==barcode||node.dataset.linked!==String(!!link)||!$('retailer-result')){
      // Rebuild only when the item or the link state changes, so the status line keeps its message between refreshes.
      const message=node.dataset.barcode===barcode&&statusNode()?statusNode().textContent:'';
      node.dataset.barcode=barcode;node.dataset.linked=String(!!link);
      node.innerHTML=`<p id="retailer-lookup-status" class="muted">${escapeHTML(lookupMessage(link))}</p><p id="retailer-cache-status" role="status">${escapeHTML(message)}</p>${findHTML(link)}<div id="retailer-result"></div>`;
      node.querySelectorAll('[data-choose-page]').forEach(button=>{button.onclick=()=>choosePage(button.dataset.choosePage);});
    }
    $('retailer-lookup-status').textContent=lookupMessage(link);
    $('retailer-result').innerHTML=resultHTML(entry,link)+(entry?deliveryDetails(entry):'')+`<div id="retailer-retry-status">${retryStatus(entry)}</div>`+factsHTML(entry);
    // Keep the scanned barcode's own form, as the manual link path did, so the cache entry names the item the worker scanned.
    if(link&&RetailerCore.due(entry)){void refresh({...link,barcode:currentProduct.barcode,store:storeName(),storeId:storeId()});}
  }
  function searchSummary(product){
    const barcode=StockCore.canonical(product?.barcode||''),link=RetailerCore.links(state.events).find(item=>StockCore.canonical(item.barcode)===barcode);if(!link)return '';
    const selectedStore=storeName(),selectedId=RetailerCore.storeId(state.settings),entry=(state.retailerCache||[]).find(item=>RetailerCore.key(item.barcode,item.store)===RetailerCore.key(barcode,selectedStore)&&String(item.storeId||'')===selectedId&&RetailerCore.officialURL(item.url)===link.url);if(!entry)return '';
    const details=[config.label];if(typeof entry.price==='number'&&Number.isFinite(entry.price))details.push(RetailerCore.money(entry.price,entry.currency));
    if(Number.isInteger(entry.stockCount))details.push(`${entry.stockCount} reported for collection`);
    if(Number.isFinite(entry.collectionElapsedMs)&&entry.collectionElapsedMs>=0){const minutes=Math.ceil(entry.collectionElapsedMs/60000);details.push(minutes>=60?`Collect in ${Math.ceil(minutes/60)}h`:`Collect in ${minutes}m`);}
    details.push(RetailerCore.collectionLine(entry));
    const delivery=RetailerCore.deliveryLines(entry).filter(line=>!/: (not checked|availability unknown)$/.test(line));if(delivery.length)details.push(delivery.join(' · '));
    const stale=RetailerCore.stale(entry)||RetailerCore.availabilityStale(entry);if(stale)details.push('cached · may be out of date');return details.join(' · ');
  }
  function barcodeForPayload(value){
    const url=RetailerCore.officialURL(value);if(!url)return '';
    const barcodes=[...new Set(RetailerCore.links(state.events).filter(link=>link.url===url).map(link=>StockCore.canonical(link.barcode)).filter(Boolean))];
    return barcodes.length===1?barcodes[0]:'';
  }
  function retryStatus(entry){
    const errors=[['Product page / price',entry?.lastError],['Click & Collect',entry?.availabilityError],['Delivery',entry?.deliveryError]].filter(([,message])=>message);
    if(!errors.length)return '';
    const info=RetailerCore.retryInfo(entry),lastAttempt=info?`Last attempt: ${escapeHTML(date(info.attemptedAt))}.`:'Last attempt time is unavailable.';
    const retry=info&&!info.eligible?`Another attempt is eligible after ${escapeHTML(date(info.retryAt))}; retries are limited to once per item and store every 24 hours.`:'A retry is eligible now. Opening this item or Android’s daily job can start it; Android may defer background work.';
    return `<section class="card retailer-diagnostics"><h3>Refresh diagnostics</h3>${errors.map(([label,message])=>`<p><strong>${label}:</strong> ${escapeHTML(message)}</p>`).join('')}<p class="muted">${lastAttempt}</p><p class="muted">${retry}</p><p class="muted">Earlier successful values are kept with their original timestamps and shown as stale when appropriate.</p></section>`;
  }
  function deliveryDetails(entry){return `<h3>Delivery options</h3>${RetailerCore.deliveryLines(entry).map(line=>'<p>'+escapeHTML(line)+'</p>').join('')}<p class="muted">${entry?.deliveryCheckedAt?'Delivery checked '+escapeHTML(date(entry.deliveryCheckedAt))+(RetailerCore.deliveryStale(entry)?' · stale':''):'No successful delivery check yet'}. Estimates for this variant and one item; confirm your address, basket charges and final date on ${escapeHTML(config.label)}.</p>`;}
  // The context line and the welcome name the store's town. The bundled-plan examples belong to one town only, so they show only for that town.
  function showTown(){const town=RetailerCore.currentTown(state.settings);document.querySelectorAll('[data-current-town]').forEach(node=>{node.textContent=town;});document.querySelectorAll('[data-pack-examples]').forEach(node=>{node.hidden=!window.PlanPack.isPackTown(town);});}
  function receive(result){const previous=workspace.getState();workspace.setState({...previous,retailerCache:RetailerCore.merge(previous.retailerCache,[result])});if(!save()){workspace.setState(previous);setStatus('Storage unavailable. The new result was not saved; previous cached details are retained.');return;}render();if(StockCore.canonical(result.barcode||'')===StockCore.canonical(currentProduct?.barcode||''))setStatus(result.lastError||result.availabilityError||result.deliveryError||'Official result cached locally.');}
  async function refresh(link){const key=RetailerCore.key(link.barcode,link.store);if(pending.has(key))return;pending.add(key);
    try{
      if(native){native.refreshRetailer(JSON.stringify(link));return;}
      // Neither the product page nor the public collection API grants this
      // browser origin read access. Android performs the anonymous requests.
      const old=(state.retailerCache||[]).find(e=>RetailerCore.key(e.barcode,e.store)===key&&e.url===link.url&&String(e.storeId||'')===String(link.storeId||''));
      receive({...old,...link,lastAttemptAt:new Date().toISOString(),lastError:'Automatic official-site fetching is available in the Android app. This browser cannot read '+config.label+' across origins; import an Android workspace to view its cached results.',status:old?.status||'browser-blocked'});
    }finally{if(!native)pending.delete(key);}
  }
  function settings(){
    const otherStores=config.stores.filter(store=>store.name!==config.defaultStore.name).map(store=>`${store.name} ${store.id}`).join(', ');
    openPage('app:store-prices',`<label for="dunelm-store">Store label</label><input id="dunelm-store" value="${escapeHTML(storeName())}"><label for="dunelm-store-id">Official ${escapeHTML(config.label)} store ID</label><input id="dunelm-store-id" inputmode="numeric" maxlength="4" value="${escapeHTML(storeId())}"><p class="muted">${escapeHTML(config.defaultStore.name)} is ${escapeHTML(config.defaultStore.id)}. The official ID determines which store is checked; the result displays ${escapeHTML(config.label)}'s actual store name. Other stores: ${escapeHTML(otherStores)}. Leave blank for price only outside ${escapeHTML(config.defaultStore.name)}.</p><button id="save-dunelm-store" type="button" data-icon="check">Save store</button><p id="store-validation" role="status"></p><p class="muted">The Android app reads ${escapeHTML(config.label)}'s public product list and Click &amp; Collect service without an account. Store centre coordinates come from ${escapeHTML(config.label)}; your phone GPS is never sent. Collection availability, reported count and price have separate timestamps. A failed store check retains the previous result and its original timestamp.</p><p class="muted">Each item's official page is found from its name, using ${escapeHTML(config.label)}'s public product list, which the app downloads at most once a week. An item with no single match shows official search links to open. Search pages are never fetched automatically.</p><p>${RetailerCore.links(state.events).length} linked items · ${(state.retailerCache||[]).length} cached results. Workspace backups include these links and cached results.</p>`,{title:config.label+' daily cache'});
    $('save-dunelm-store').onclick=()=>{const name=$('dunelm-store').value.trim(),id=$('dunelm-store-id').value.trim();if(!name||name.length>120||(id&&!/^\d{4}$/.test(id))){$('store-validation').textContent='Enter a store label and a four-digit official ID, or leave the ID blank.';return;}if(!updateSettings({dunelmStore:name,dunelmStoreId:id})){$('store-validation').textContent='Storage unavailable. Store selection has not changed.';return;}leaveOverlay().then(()=>{showTown();render();});};
  }
  window.onRetailerResult=encoded=>{let result;try{result=typeof encoded==='string'?JSON.parse(encoded):encoded;}catch(error){/* An unreadable result is dropped; the pending request is cleared by onRetailerError or the next retry. */reportFailure('retailer result',error);return;}pending.delete(RetailerCore.key(result.barcode,result.store));receive(result);};
  window.onRetailerIndex=text=>{indexRequested=false;try{productIndex=RetailerLookup.parseIndex(text,config);}catch(error){reportFailure('official product list',error);return;}if(!productIndex.length){setStatus('The official product list has no product pages. Try again later.');return;}render();};
  window.onRetailerError=message=>{pending.clear();indexRequested=false;setStatus(message);};
  window.onRetailerResume=()=>{if(native){const previous=workspace.getState();try{workspace.setState({...previous,retailerCache:RetailerCore.merge(previous.retailerCache,JSON.parse(native.retailerCache()))});if(!save())workspace.setState(previous);}catch(error){workspace.setState(previous);reportFailure(config.label+' cache resume',error);}}render();};
  window.addEventListener('focus',()=>{window.onRetailerResume();showTown();});window.onRetailerResume();showTown();
  return {render,settings,refresh,searchSummary,barcodeForPayload,retryStatus,showTown};
})();

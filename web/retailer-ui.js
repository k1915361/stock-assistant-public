'use strict';
window.RetailerUI=(()=>{
  const pending=new Set();
  const storeName=()=>state.settings.dunelmStore||'Kingston';
  const storeId=()=>RetailerCore.storeId(state.settings);
  function currentLink(){return RetailerCore.links(state.events).find(e=>StockCore.canonical(e.barcode)===StockCore.canonical(currentProduct?.barcode));}
  function cached(){const link=currentLink();return (state.retailerCache||[]).find(e=>RetailerCore.key(e.barcode,e.store)===RetailerCore.key(currentProduct?.barcode,storeName())&&String(e.storeId||'')===storeId()&&(!link||RetailerCore.officialURL(e.url)===link.url));}
  function render(){
    const node=$('retailer-summary');if(!node)return;const entry=cached(),link=currentLink();
    if(!entry){node.innerHTML=link?'<button id="retailer-open" data-icon="store">Official price / stock · linked page</button>':'';}
    else{const price=typeof entry.price==='number'?RetailerCore.money(entry.price,entry.currency):'Price unavailable';node.innerHTML=`${escapeHTML(price)} · ${escapeHTML(entry.officialStoreName||storeName())}: ${Number.isInteger(entry.stockCount)?entry.stockCount+' reported':'stock unknown'} · ${escapeHTML(RetailerCore.collectionLine(entry))}${entry.checkedAt?' · '+(RetailerCore.stale(entry)?'price stale · ':'')+escapeHTML(date(entry.checkedAt)):' · not fetched'} <button id="retailer-open" data-icon="store">Details</button>`;}
    if($('retailer-open'))$('retailer-open').onclick=details;
    if(link&&RetailerCore.due(entry)){void refresh({...link,store:storeName(),storeId:storeId()});}
  }
  function searchSummary(product){
    const barcode=StockCore.canonical(product?.barcode||''),link=RetailerCore.links(state.events).find(item=>StockCore.canonical(item.barcode)===barcode);if(!link)return '';
    const selectedStore=storeName(),selectedId=RetailerCore.storeId(state.settings),entry=(state.retailerCache||[]).find(item=>RetailerCore.key(item.barcode,item.store)===RetailerCore.key(barcode,selectedStore)&&String(item.storeId||'')===selectedId&&RetailerCore.officialURL(item.url)===link.url);if(!entry)return '';
    const details=['Dunelm'];if(typeof entry.price==='number'&&Number.isFinite(entry.price))details.push(RetailerCore.money(entry.price,entry.currency));
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
  function deliveryDetails(entry){return `<h3>Delivery options</h3>${RetailerCore.deliveryLines(entry).map(line=>'<p>'+escapeHTML(line)+'</p>').join('')}<p class="muted">${entry?.deliveryCheckedAt?'Delivery checked '+escapeHTML(date(entry.deliveryCheckedAt))+(RetailerCore.deliveryStale(entry)?' · stale':''):'No successful delivery check yet'}. Estimates for this variant and one item; confirm your address, basket charges and final date on Dunelm.</p>`;}
  function receive(encoded){let result;try{result=typeof encoded==='string'?JSON.parse(encoded):encoded;}catch{return;}const previous=workspace.getState();workspace.setState({...previous,retailerCache:RetailerCore.merge(previous.retailerCache,[result])});if(!save()){workspace.setState(previous);if($('retailer-cache-status'))$('retailer-cache-status').textContent='Storage unavailable. The new result was not saved; previous cached details are retained.';return;}render();if($('retailer-delivery'))$('retailer-delivery').innerHTML=deliveryDetails(cached());if($('retailer-retry-status'))$('retailer-retry-status').innerHTML=retryStatus(cached());if($('retailer-cache-status'))$('retailer-cache-status').textContent=result.lastError||result.availabilityError||result.deliveryError||'Official result cached locally. Delivery options updated; reopen details for refreshed stock and price.';}
  async function refresh(link){const key=RetailerCore.key(link.barcode,link.store);if(pending.has(key))return;pending.add(key);
    try{
      if(native){native.refreshRetailer(JSON.stringify(link));return;}
      // Neither the product page nor the public collection API grants this
      // browser origin read access. Android performs the anonymous requests.
      const old=(state.retailerCache||[]).find(e=>RetailerCore.key(e.barcode,e.store)===key&&e.url===link.url&&String(e.storeId||'')===String(link.storeId||''));
      receive({...old,...link,lastAttemptAt:new Date().toISOString(),lastError:'Automatic official-site fetching is available in the Android app. This browser cannot read Dunelm across origins; import an Android workspace to view its cached results.',status:old?.status||'browser-blocked'});
    }finally{if(!native)pending.delete(key);}
  }
  function details(){
    const entry=cached(),link=currentLink(),target={barcode:currentProduct?.barcode,name:currentProduct?.name,store:storeName(),storeId:storeId()};
    openPage('app:store-prices',`<p>${escapeHTML(currentProduct?.name)} · ${escapeHTML(currentProduct?.barcode)}</p><p class="muted">Link the exact product and variant once. Prices and timestamps are cached locally; refresh is attempted at most once per 24 hours. Click & Collect is checked using the selected official store and exact variant. Reported collection stock may differ from the physical shelf count.</p><label for="retailer-url">Official product URL</label><input id="retailer-url" type="url" placeholder="https://www.dunelm.com/product/…" value="${escapeHTML(link?.url||'')}"><p class="muted">Use the product link with its defaultSkuId if present. Select the correct colour/capacity on Dunelm before copying the link. A saved link is filled in here automatically when you reopen this screen.</p><button id="link-retailer" data-icon="link">Save link and fetch</button><p><a href="https://www.dunelm.com/search?q=${encodeURIComponent(currentProduct?.barcode||currentProduct?.name||'')}" target="_blank" rel="noopener">Find item on official Dunelm site</a></p>${entry?`<p>${escapeHTML(entry.variant||entry.name||'')}</p><p>Price: ${typeof entry.price==='number'?escapeHTML(entry.currency)+' '+entry.price:'unavailable'}${typeof entry.wasPrice==='number'?' · was '+entry.wasPrice:''}</p><p>${escapeHTML(entry.officialStoreName||storeName())} reported collection stock count: ${Number.isInteger(entry.stockCount)?entry.stockCount:'not exposed'}${entry.storeId?' · store '+escapeHTML(entry.storeId):''}</p><p>${escapeHTML(RetailerCore.collectionLine(entry))}</p><p>${entry.availabilityCheckedAt?'Collection last successfully checked '+escapeHTML(date(entry.availabilityCheckedAt)):'No successful store collection check yet'}</p><p>${escapeHTML(entry.globalAvailability||'Online availability unknown')}</p><p>${entry.checkedAt?'Price last successfully checked '+escapeHTML(date(entry.checkedAt)):'No successful price check yet'}${RetailerCore.stale(entry)?' · stale':''}</p>`:''}<p id="retailer-cache-status" role="status">${escapeHTML(entry?.lastError||entry?.availabilityError||'')}</p><div id="retailer-retry-status">${retryStatus(entry)}</div><p class="muted">Store label: ${escapeHTML(storeName())} · official ID: ${escapeHTML(storeId()||'not selected')}. Change it in Settings → Dunelm store and daily cache. Android runs a daily background job when the system permits; timing can be deferred.</p>`,{title:'Official Dunelm lookup'});
    $('retailer-cache-status').insertAdjacentHTML('beforebegin',`<section id="retailer-delivery" aria-label="Delivery options">${deliveryDetails(entry)}</section>`);
    if(entry?.deliveryError&&!$('retailer-cache-status').textContent)$('retailer-cache-status').textContent=entry.deliveryError;
    $('link-retailer').onclick=()=>{
      const url=RetailerCore.officialURL($('retailer-url').value);if(!url){$('retailer-cache-status').textContent='Use an HTTPS www.dunelm.com/product/ link, with only an optional defaultSkuId parameter.';return;}
      if(!target.barcode){$('retailer-cache-status').textContent='Save an item barcode before linking its official page.';return;}
      if(recordEvent({kind:'retailer-link',product:target.barcode,productName:target.name,url,store:target.store,storeId:target.storeId})){
        const previous=workspace.getState(),cache=previous.retailerCache||[],old=cache.find(e=>RetailerCore.key(e.barcode,e.store)===RetailerCore.key(target.barcode,target.store));if(old?.url!==url||old?.storeId!==target.storeId)workspace.setState({...previous,retailerCache:cache.filter(e=>RetailerCore.key(e.barcode,e.store)!==RetailerCore.key(target.barcode,target.store))});if(!save()){workspace.setState(previous);$('retailer-cache-status').textContent='Link saved, but cached details could not be updated. A different variant will not be shown. Free storage and retry.';return;}
        $('retailer-cache-status').textContent='Link saved for '+target.name+'. Checking official page…';void refresh({barcode:target.barcode,url,store:target.store,storeId:target.storeId});
      }
    };
  }
  function settings(){
    openPage('app:store-prices',`<label for="dunelm-store">Store label</label><input id="dunelm-store" value="${escapeHTML(storeName())}"><label for="dunelm-store-id">Official Dunelm store ID</label><input id="dunelm-store-id" inputmode="numeric" maxlength="4" value="${escapeHTML(storeId())}"><p class="muted">Kingston is 0186. The official ID determines which store is checked; the result displays Dunelm's actual store name. Other nearby IDs: Colliers Wood 0115, Feltham 0151, Croydon 0335, Wandsworth 0189, Westfield White City 0163. Leave blank for price only outside Kingston.</p><button id="save-dunelm-store" data-icon="check">Save store</button><p id="store-validation" role="status"></p><p class="muted">The Android app reads Dunelm's public Click & Collect service without an account. Store centre coordinates come from Dunelm; your phone GPS is never sent. Collection availability, reported count and price have separate timestamps. A failed store check retains the previous result and its original timestamp.</p><p>${RetailerCore.links(state.events).length} linked items · ${(state.retailerCache||[]).length} cached results. Link an item's official page from the ⋮ menu → Official price / stock. Workspace backups include these links and cached results.</p>`,{title:'Dunelm daily cache'});
    $('save-dunelm-store').onclick=()=>{const name=$('dunelm-store').value.trim(),id=$('dunelm-store-id').value.trim();if(!name||name.length>120||(id&&!/^\d{4}$/.test(id))){$('store-validation').textContent='Enter a store label and a four-digit official ID, or leave the ID blank.';return;}if(!updateSettings({dunelmStore:name,dunelmStoreId:id})){$('store-validation').textContent='Storage unavailable. Store selection has not changed.';return;}leaveOverlay().then(()=>render());};
  }
  window.onRetailerResult=encoded=>{let e;try{e=JSON.parse(encoded);pending.delete(RetailerCore.key(e.barcode,e.store));}catch(error){/* An unreadable result is ignored by receive(), below. */reportFailure('retailer result',error);}receive(encoded);};
  window.onRetailerError=message=>{pending.clear();if($('retailer-cache-status'))$('retailer-cache-status').textContent=message;};
  window.onRetailerResume=()=>{if(native){const previous=workspace.getState();try{workspace.setState({...previous,retailerCache:RetailerCore.merge(previous.retailerCache,JSON.parse(native.retailerCache()))});if(!save())workspace.setState(previous);}catch(error){workspace.setState(previous);reportFailure('Dunelm cache resume',error);}}render();};
  window.addEventListener('focus',()=>window.onRetailerResume());window.onRetailerResume();
  return {render,details,settings,refresh,searchSummary,barcodeForPayload,retryStatus};
})();

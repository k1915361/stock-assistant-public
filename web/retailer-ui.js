'use strict';
window.RetailerUI=(()=>{
  const pending=new Set();
  const storeName=()=>state.settings.dunelmStore||'Kingston';
  const storeId=()=>RetailerCore.storeId(state.settings);
  function currentLink(){return RetailerCore.links(state.events).find(e=>StockCore.canonical(e.barcode)===StockCore.canonical(currentProduct?.barcode));}
  function cached(){const link=currentLink();return (state.retailerCache||[]).find(e=>RetailerCore.key(e.barcode,e.store)===RetailerCore.key(currentProduct?.barcode,storeName())&&String(e.storeId||'')===storeId()&&(!link||RetailerCore.officialURL(e.url)===link.url));}
  // The link field is open only while the item has no link. Once saved it folds away, so the result is the first thing a worker sees.
  function linkFormHTML(link){
    const search=encodeURIComponent(currentProduct?.barcode||currentProduct?.name||'');
    return `<details id="retailer-link" class="retailer-link"${link?'':' open'}><summary>Official Dunelm link</summary><label for="retailer-url">Official product URL</label><input id="retailer-url" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://www.dunelm.com/product/…" value="${escapeHTML(link?.url||'')}"><p class="muted">Paste the link for this exact variant (colour or capacity), with its defaultSkuId, so the price and stock match it. It saves when you paste or leave the field.</p><p><a href="https://www.dunelm.com/search?q=${search}" target="_blank" rel="noopener">Find item on official Dunelm site</a></p></details>`;
  }
  // Dimensions, material and description show only when a cached result carries them. The Android parser does not supply them yet.
  function factsHTML(entry){return [['Dimensions',entry?.dimensions],['Material',entry?.material],['Description',entry?.description]].filter(([,value])=>typeof value==='string'&&value.trim()).map(([label,value])=>`<p><strong>${label}:</strong> ${escapeHTML(value.trim())}</p>`).join('');}
  function resultHTML(entry,link){
    if(!entry)return link?'<p class="muted">Checking the official Dunelm page…</p>':`<p class="muted">Paste this item’s official Dunelm product link to see its price and Click & Collect stock for ${escapeHTML(storeName())}.</p>`;
    const price=typeof entry.price==='number'?RetailerCore.money(entry.price,entry.currency):'Price unavailable';
    return `<p><strong>${escapeHTML(price)}</strong> · ${escapeHTML(entry.officialStoreName||storeName())}: ${Number.isInteger(entry.stockCount)?entry.stockCount+' reported':'stock unknown'}</p><p class="muted">${escapeHTML(RetailerCore.collectionLine(entry))}${entry.checkedAt?' · '+(RetailerCore.stale(entry)?'price stale · ':'')+escapeHTML(date(entry.checkedAt)):' · not fetched'}</p>`;
  }
  // One place for the status line's id, so the message text is set the same way from every path.
  const statusNode=()=>$('retailer-cache-status');
  function setStatus(text){const node=statusNode();if(node)node.textContent=text;}
  function render(){
    const node=$('retailer-summary');if(!node)return;const entry=cached(),link=currentLink(),barcode=StockCore.canonical(currentProduct?.barcode||'');
    if(node.dataset.barcode!==barcode||node.dataset.linked!==String(!!link)||!$('retailer-url')){
      // Rebuild only when the item or the link state changes, so typing in the link field is not lost to a focus refresh.
      const message=node.dataset.barcode===barcode&&statusNode()?statusNode().textContent:'';
      node.dataset.barcode=barcode;node.dataset.linked=String(!!link);
      node.innerHTML=`${linkFormHTML(link)}<p id="retailer-cache-status" role="status">${escapeHTML(message)}</p><div id="retailer-result"></div>`;
      $('retailer-url').onchange=saveLink;
      $('retailer-url').addEventListener('input',event=>{if(event.inputType==='insertFromPaste')saveLink();});
    }
    $('retailer-result').innerHTML=resultHTML(entry,link)+(entry?deliveryDetails(entry):'')+`<div id="retailer-retry-status">${retryStatus(entry)}</div>`+factsHTML(entry);
    // Keep the scanned barcode's own form, as the manual link path did, so the cache entry names the item the worker scanned.
    if(link&&RetailerCore.due(entry)){void refresh({...link,barcode:currentProduct.barcode,store:storeName(),storeId:storeId()});}
  }
  // Runs on paste and on change, so no Save button is needed.
  function saveLink(){
    const input=$('retailer-url'),status=statusNode();if(!input||!status)return;
    const url=RetailerCore.officialURL(input.value);
    if(!url){status.textContent=input.value.trim()?'Use an HTTPS www.dunelm.com/product/ link, with only an optional defaultSkuId parameter.':'';return;}
    if(!currentProduct?.barcode){status.textContent='Save an item barcode before linking its official page.';return;}
    if(currentLink()?.url===url)return;
    const target={barcode:currentProduct.barcode,name:currentProduct.name,store:storeName(),storeId:storeId()};
    if(!recordEvent({kind:'retailer-link',product:target.barcode,productName:target.name,url,store:target.store,storeId:target.storeId}))return;
    const previous=workspace.getState(),cache=previous.retailerCache||[],key=RetailerCore.key(target.barcode,target.store),old=cache.find(e=>RetailerCore.key(e.barcode,e.store)===key);
    if(old?.url!==url||old?.storeId!==target.storeId)workspace.setState({...previous,retailerCache:cache.filter(e=>RetailerCore.key(e.barcode,e.store)!==key)});
    if(!save()){workspace.setState(previous);status.textContent='Link saved, but cached details could not be updated. A different variant will not be shown. Free storage and retry.';return;}
    status.textContent='Link saved for '+target.name+'. Checking official page…';
    render();
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
  function receive(encoded){let result;try{result=typeof encoded==='string'?JSON.parse(encoded):encoded;}catch{return;}const previous=workspace.getState();workspace.setState({...previous,retailerCache:RetailerCore.merge(previous.retailerCache,[result])});if(!save()){workspace.setState(previous);setStatus('Storage unavailable. The new result was not saved; previous cached details are retained.');return;}render();if(StockCore.canonical(result.barcode||'')===StockCore.canonical(currentProduct?.barcode||''))setStatus(result.lastError||result.availabilityError||result.deliveryError||'Official result cached locally.');}
  async function refresh(link){const key=RetailerCore.key(link.barcode,link.store);if(pending.has(key))return;pending.add(key);
    try{
      if(native){native.refreshRetailer(JSON.stringify(link));return;}
      // Neither the product page nor the public collection API grants this
      // browser origin read access. Android performs the anonymous requests.
      const old=(state.retailerCache||[]).find(e=>RetailerCore.key(e.barcode,e.store)===key&&e.url===link.url&&String(e.storeId||'')===String(link.storeId||''));
      receive({...old,...link,lastAttemptAt:new Date().toISOString(),lastError:'Automatic official-site fetching is available in the Android app. This browser cannot read Dunelm across origins; import an Android workspace to view its cached results.',status:old?.status||'browser-blocked'});
    }finally{if(!native)pending.delete(key);}
  }
  function settings(){
    openPage('app:store-prices',`<label for="dunelm-store">Store label</label><input id="dunelm-store" value="${escapeHTML(storeName())}"><label for="dunelm-store-id">Official Dunelm store ID</label><input id="dunelm-store-id" inputmode="numeric" maxlength="4" value="${escapeHTML(storeId())}"><p class="muted">Kingston is 0186. The official ID determines which store is checked; the result displays Dunelm's actual store name. Other nearby IDs: Colliers Wood 0115, Feltham 0151, Croydon 0335, Wandsworth 0189, Westfield White City 0163. Leave blank for price only outside Kingston.</p><button id="save-dunelm-store" data-icon="check">Save store</button><p id="store-validation" role="status"></p><p class="muted">The Android app reads Dunelm's public Click & Collect service without an account. Store centre coordinates come from Dunelm; your phone GPS is never sent. Collection availability, reported count and price have separate timestamps. A failed store check retains the previous result and its original timestamp.</p><p>${RetailerCore.links(state.events).length} linked items · ${(state.retailerCache||[]).length} cached results. Paste an item's official Dunelm link in its item result, above the plan preview. Workspace backups include these links and cached results.</p>`,{title:'Dunelm daily cache'});
    $('save-dunelm-store').onclick=()=>{const name=$('dunelm-store').value.trim(),id=$('dunelm-store-id').value.trim();if(!name||name.length>120||(id&&!/^\d{4}$/.test(id))){$('store-validation').textContent='Enter a store label and a four-digit official ID, or leave the ID blank.';return;}if(!updateSettings({dunelmStore:name,dunelmStoreId:id})){$('store-validation').textContent='Storage unavailable. Store selection has not changed.';return;}leaveOverlay().then(()=>render());};
  }
  window.onRetailerResult=encoded=>{let e;try{e=JSON.parse(encoded);pending.delete(RetailerCore.key(e.barcode,e.store));}catch(error){/* An unreadable result is ignored by receive(), below. */reportFailure('retailer result',error);}receive(encoded);};
  window.onRetailerError=message=>{pending.clear();setStatus(message);};
  window.onRetailerResume=()=>{if(native){const previous=workspace.getState();try{workspace.setState({...previous,retailerCache:RetailerCore.merge(previous.retailerCache,JSON.parse(native.retailerCache()))});if(!save())workspace.setState(previous);}catch(error){workspace.setState(previous);reportFailure('Dunelm cache resume',error);}}render();};
  window.addEventListener('focus',()=>window.onRetailerResume());window.onRetailerResume();
  return {render,settings,refresh,searchSummary,barcodeForPayload,retryStatus};
})();

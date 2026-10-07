'use strict';
window.RetailerUI=(()=>{
  const pending=new Set();
  const storeName=()=>state.settings.dunelmStore||'Kingston';
  function currentLink(){return RetailerCore.links(state.events).find(e=>StockCore.canonical(e.barcode)===StockCore.canonical(currentProduct?.barcode));}
  function cached(){return (state.retailerCache||[]).find(e=>RetailerCore.key(e.barcode,e.store)===RetailerCore.key(currentProduct?.barcode,storeName()));}
  function render(){
    const node=$('retailer-summary');if(!node)return;const entry=cached(),link=currentLink();
    if(!entry){node.innerHTML=link?'<button id="retailer-open">Official price / stock · linked page</button>':'';}
    else{const price=typeof entry.price==='number'?new Intl.NumberFormat('en-GB',{style:'currency',currency:entry.currency||'GBP'}).format(entry.price):'Price unavailable';node.innerHTML=`${escapeHTML(price)} · ${escapeHTML(storeName())} stock ${Number.isInteger(entry.stockCount)?entry.stockCount:'unknown'}${entry.checkedAt?' · '+(RetailerCore.stale(entry)?'stale · ':'')+escapeHTML(date(entry.checkedAt)):' · not fetched'} <button id="retailer-open">Details</button>`;}
    if($('retailer-open'))$('retailer-open').onclick=details;
    if(link&&RetailerCore.due(entry)){void refresh({...link,store:storeName()});}
  }
  function receive(encoded){let result;try{result=typeof encoded==='string'?JSON.parse(encoded):encoded;}catch{return;}state.retailerCache=RetailerCore.merge(state.retailerCache,[result]);save();render();if($('retailer-cache-status'))$('retailer-cache-status').textContent=result.lastError||'Official result cached locally.';}
  async function refresh(link){const key=RetailerCore.key(link.barcode,link.store);if(pending.has(key))return;pending.add(key);
    try{
      if(native){native.refreshRetailer(JSON.stringify(link));return;}
      // Dunelm currently grants CORS only to its own origin. No anonymous proxy,
      // credentials or private inventory endpoint are used to bypass that rule.
      const old=(state.retailerCache||[]).find(e=>RetailerCore.key(e.barcode,e.store)===key);
      receive({...old,...link,lastAttemptAt:new Date().toISOString(),lastError:'Automatic official-site fetching is available in the Android app. This browser cannot read Dunelm across origins; import an Android workspace to view its cached results.',status:old?.status||'browser-blocked'});
    }finally{if(!native)pending.delete(key);}
  }
  function details(){
    const entry=cached(),link=currentLink();
    openModal(`<h2>Official Dunelm lookup</h2><p>${escapeHTML(currentProduct?.name)} · ${escapeHTML(currentProduct?.barcode)}</p><p class="muted">Link the exact product and variant once. Prices and timestamps are cached locally; refresh is attempted at most once per 24 hours. A public page's online availability is separate from this store's stock count.</p><label for="retailer-url">Official product URL</label><input id="retailer-url" type="url" placeholder="https://www.dunelm.com/product/…" value="${escapeHTML(link?.url||'')}"><p class="muted">Use the product link with its defaultSkuId if present. Select the correct colour/capacity on Dunelm before copying the link.</p><button id="link-retailer">Save link and fetch</button><p><a href="https://www.dunelm.com/search?q=${encodeURIComponent(currentProduct?.barcode||currentProduct?.name||'')}" target="_blank" rel="noopener">Find item on official Dunelm site</a></p>${entry?`<p>${escapeHTML(entry.variant||entry.name||'')}</p><p>Price: ${typeof entry.price==='number'?escapeHTML(entry.currency)+' '+entry.price:'unavailable'}${typeof entry.wasPrice==='number'?' · was '+entry.wasPrice:''}</p><p>${escapeHTML(storeName())} stock count: ${Number.isInteger(entry.stockCount)?entry.stockCount:'not exposed'}</p><p>${escapeHTML(entry.storeAvailability||'Store availability unavailable')}</p><p>${escapeHTML(entry.globalAvailability||'Online availability unavailable')}</p><p>${entry.checkedAt?'Last successful check '+escapeHTML(date(entry.checkedAt)):'No successful check yet'}${RetailerCore.stale(entry)?' · stale':''}</p>`:''}<p id="retailer-cache-status" role="status">${escapeHTML(entry?.lastError||'')}</p><p class="muted">Store: ${escapeHTML(storeName())}. Change it in Settings → Dunelm store and daily cache. Android runs a daily background job when the system permits; timing can be deferred.</p>`);
    $('link-retailer').onclick=()=>{
      const url=RetailerCore.officialURL($('retailer-url').value);if(!url){$('retailer-cache-status').textContent='Use an HTTPS www.dunelm.com/product/ link, with only an optional defaultSkuId parameter.';return;}
      if(!currentProduct?.barcode){$('retailer-cache-status').textContent='Save an item barcode before linking its official page.';return;}
      if(event({kind:'retailer-link',product:currentProduct.barcode,productName:currentProduct.name,url,store:storeName()})){
        const old=cached();if(old?.url!==url)state.retailerCache=(state.retailerCache||[]).filter(e=>RetailerCore.key(e.barcode,e.store)!==RetailerCore.key(currentProduct.barcode,storeName()));save();
        $('retailer-cache-status').textContent='Link saved. Checking official page…';void refresh({barcode:currentProduct.barcode,url,store:storeName()});
      }
    };
  }
  function settings(){openModal(`<h2>Dunelm daily cache</h2><label for="dunelm-store">Current store name</label><input id="dunelm-store" value="${escapeHTML(storeName())}"><button id="save-dunelm-store">Save store</button><p class="muted">The store name labels and separates cached observations. It does not provide access to an internal stock API. Exact stock remains unknown until an official source exposes it for the selected store and variant.</p><p>${RetailerCore.links(state.events).length} linked items · ${(state.retailerCache||[]).length} cached results. Link an item's official page under More → Official price / stock. Workspace backups include these links and cached results.</p>`);$('save-dunelm-store').onclick=()=>{const name=$('dunelm-store').value.trim();if(!name||name.length>120)return;state.settings.dunelmStore=name;save();$('modal').close();render();};}
  window.onRetailerResult=encoded=>{let e;try{e=JSON.parse(encoded);pending.delete(RetailerCore.key(e.barcode,e.store));}catch{}receive(encoded);};
  window.onRetailerError=message=>{pending.clear();if($('retailer-cache-status'))$('retailer-cache-status').textContent=message;};
  window.onRetailerResume=()=>{if(native){try{state.retailerCache=RetailerCore.merge(state.retailerCache,JSON.parse(native.retailerCache()));save();}catch{}}render();};
  window.addEventListener('focus',()=>window.onRetailerResume());window.onRetailerResume();
  return {render,details,settings,refresh};
})();

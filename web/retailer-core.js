// @ts-check
(function(root){
  'use strict';
  const DAY=86400000;
  // One formatter per currency. Building an Intl.NumberFormat is slow, and the price lists format every row.
  const formatters=new Map();
  function money(amount,currency){const code=String(currency||'GBP');let format=formatters.get(code);if(!format){format=new Intl.NumberFormat('en-GB',{style:'currency',currency:code});formatters.set(code,format);}return format.format(amount);}
  // The retailer's host, product path and default store come from retailer-config.js, so another retailer changes only that file.
  const CONFIG=(root.RetailerConfig||(typeof require==='function'?require('./retailer-config.js'):null)).defaults;
  const HOST=new URL(CONFIG.origin).hostname;
  function officialURL(value){
    try{const u=new URL(String(value).trim());if(u.protocol!=='https:'||u.hostname!==HOST||u.port||u.username||u.password||!u.pathname.startsWith(CONFIG.productPath)||!/^[a-z0-9-]+$/i.test(u.pathname.slice(CONFIG.productPath.length)))return null;
      for(const key of u.searchParams.keys())if(key!=='defaultSkuId')return null;
      const sku=u.searchParams.get('defaultSkuId');if(sku&&!/^\d{1,15}$/.test(sku))return null;u.hash='';return u.href;
    }catch{return null;}
  }
  const canonical=value=>String(value||'').trim().replace(/^0(?=\d{12}$)/,'');
  const key=(barcode,store)=>canonical(barcode)+'|'+String(store||'').trim().toLowerCase();
  function storeId(settings){const id=String(settings?.dunelmStoreId||'').trim();return /^\d{4}$/.test(id)?id:String(settings?.dunelmStore||CONFIG.defaultStore.name).trim().toLowerCase()===CONFIG.defaultStore.name.toLowerCase()?CONFIG.defaultStore.id:'';}
  // The town the page names: the store label from Settings. Blank falls back to the default store's town.
  function currentTown(settings){return String(settings?.dunelmStore||'').trim()||CONFIG.defaultStore.name;}
  function links(events){const entries=new Map();for(const e of events||[])if(e.kind==='retailer-link'&&e.product&&officialURL(e.url))entries.set(canonical(e.product),{barcode:canonical(e.product),url:officialURL(e.url),store:e.store||CONFIG.defaultStore.name,storeId:e.storeId||''});return [...entries.values()];}
  function retryInfo(entry,now=Date.now()){const attemptedAt=Date.parse(entry?.lastAttemptAt||entry?.checkedAt);if(!Number.isFinite(attemptedAt))return null;const retryAt=attemptedAt+DAY;return {attemptedAt,retryAt,eligible:now>=retryAt};}
  function due(entry,now=Date.now()){const info=retryInfo(entry,now);return !info||info.eligible;}
  function merge(existing,incoming){const records=new Map((existing||[]).map(e=>[key(e.barcode,e.store),e]));for(const e of incoming||[])if(e&&e.barcode&&officialURL(e.url)){const old=records.get(key(e.barcode,e.store)),at=Date.parse(e.lastAttemptAt||e.checkedAt),before=Date.parse(old?.lastAttemptAt||old?.checkedAt);if(!old||!Number.isFinite(before)||(Number.isFinite(at)&&at>=before))records.set(key(e.barcode,e.store),e);}return [...records.values()];}
  function availabilityStale(entry,now=Date.now()){return !entry?.availabilityCheckedAt||!Number.isFinite(Date.parse(entry.availabilityCheckedAt))||now-Date.parse(entry.availabilityCheckedAt)>=DAY;}
  function deliveryStale(entry,now=Date.now()){return !entry?.deliveryCheckedAt||!Number.isFinite(Date.parse(entry.deliveryCheckedAt))||now-Date.parse(entry.deliveryCheckedAt)>=DAY;}
  function collectionLine(entry,now=Date.now()){
    if(!entry)return 'Click & Collect: not checked';
    const label=String(entry.storeAvailability||'').trim();
    if(entry.availabilityError){
      if(entry.availabilityCheckedAt&&label)return `Click & Collect: last check failed · last known ${label}${availabilityStale(entry,now)?' · stale':''}`;
      return 'Click & Collect: check failed';
    }
    if(!entry.availabilityCheckedAt)return `Click & Collect: ${label||'not checked'}`;
    return `Click & Collect: ${label||'availability unknown'}${availabilityStale(entry,now)?' · stale':''}`;
  }
  function deliveryLines(entry){return ['Standard','Express'].map(type=>{
    const option=(entry?.deliveryOptions||[]).find(o=>o.type===type),label=type==='Standard'?'Standard delivery':'Express delivery';
    if(!option)return label+': not checked';
    if(['unavailable','not-available','out-of-stock'].includes(option.available))return label+': not available';
    if(!['available','limited-stock'].includes(option.available))return label+': availability unknown';
    const price=typeof option.price==='number'&&Number.isFinite(option.price)&&option.price>=0?option.price===0?'Free':money(option.price,'GBP'):'cost not supplied';
    // A promised calendar date must not move backwards in a device's time zone.
    const iso=typeof option.date==='string'?option.date.match(/^\d{4}-\d{2}-\d{2}/)?.[0]:null,at=iso?new Date(iso+'T12:00:00Z'):null;
    const when=at&&Number.isFinite(at.getTime())?(String(option.onOrBy).toLowerCase()==='by'?'by ':'on ')+at.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'date not supplied';
    return `${label}: ${price} · ${when}`;
  });}
  function stale(entry,now=Date.now()){return !entry?.checkedAt||!Number.isFinite(Date.parse(entry.checkedAt))||now-Date.parse(entry.checkedAt)>=DAY;}
  function products(cache,linked=[]){const urls=new Map(linked.map(e=>[canonical(e.barcode),e.url]));return (cache||[]).filter(e=>e.name&&e.sku&&officialURL(e.url)&&(!urls.has(canonical(e.barcode))||officialURL(e.url)===urls.get(canonical(e.barcode)))).map(e=>({barcode:e.barcode,name:e.name,aliases:e.variant||'',source:'linked-official-page'}));}
  const api={DAY,money,officialURL,key,storeId,currentTown,links,retryInfo,due,merge,stale,availabilityStale,deliveryStale,deliveryLines,collectionLine,products};if(typeof module!=='undefined')module.exports=api;root.RetailerCore=api;
})(typeof window!=='undefined'?window:globalThis);

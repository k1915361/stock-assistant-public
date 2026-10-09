(function(root){
  'use strict';
  const DAY=86400000;
  function officialURL(value){
    try{const u=new URL(String(value).trim());if(u.protocol!=='https:'||u.hostname!=='www.dunelm.com'||u.port||u.username||u.password||!/^\/product\/[a-z0-9-]+$/i.test(u.pathname))return null;
      for(const key of u.searchParams.keys())if(key!=='defaultSkuId')return null;
      const sku=u.searchParams.get('defaultSkuId');if(sku&&!/^\d{1,15}$/.test(sku))return null;u.hash='';return u.href;
    }catch{return null;}
  }
  const canonical=value=>String(value||'').trim().replace(/^0(?=\d{12}$)/,'');
  const key=(barcode,store)=>canonical(barcode)+'|'+String(store||'').trim().toLowerCase();
  function storeId(settings){const id=String(settings?.dunelmStoreId||'').trim();return /^\d{4}$/.test(id)?id:String(settings?.dunelmStore||'Kingston').trim().toLowerCase()==='kingston'?'0186':'';}
  function links(events){const entries=new Map();for(const e of events||[])if(e.kind==='retailer-link'&&e.product&&officialURL(e.url))entries.set(canonical(e.product),{barcode:canonical(e.product),url:officialURL(e.url),store:e.store||'Kingston',storeId:e.storeId||''});return [...entries.values()];}
  function due(entry,now=Date.now()){const time=Date.parse(entry?.lastAttemptAt||entry?.checkedAt);return !Number.isFinite(time)||now-time>=DAY;}
  function merge(existing,incoming){const records=new Map((existing||[]).map(e=>[key(e.barcode,e.store),e]));for(const e of incoming||[])if(e&&e.barcode&&officialURL(e.url)){const old=records.get(key(e.barcode,e.store)),at=Date.parse(e.lastAttemptAt||e.checkedAt),before=Date.parse(old?.lastAttemptAt||old?.checkedAt);if(!old||!Number.isFinite(before)||(Number.isFinite(at)&&at>=before))records.set(key(e.barcode,e.store),e);}return [...records.values()];}
  function availabilityStale(entry,now=Date.now()){return !entry?.availabilityCheckedAt||!Number.isFinite(Date.parse(entry.availabilityCheckedAt))||now-Date.parse(entry.availabilityCheckedAt)>=DAY;}
  function deliveryStale(entry,now=Date.now()){return !entry?.deliveryCheckedAt||!Number.isFinite(Date.parse(entry.deliveryCheckedAt))||now-Date.parse(entry.deliveryCheckedAt)>=DAY;}
  function deliveryLines(entry){return ['Standard','Express'].map(type=>{
    const option=(entry?.deliveryOptions||[]).find(o=>o.type===type),label=type==='Standard'?'Standard delivery':'Express delivery';
    if(!option)return label+': not checked';
    if(['unavailable','not-available','out-of-stock'].includes(option.available))return label+': not available';
    if(!['available','limited-stock'].includes(option.available))return label+': availability unknown';
    const price=typeof option.price==='number'&&Number.isFinite(option.price)&&option.price>=0?option.price===0?'Free':new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(option.price):'cost not supplied';
    // A promised calendar date must not move backwards in a device's time zone.
    const iso=typeof option.date==='string'?option.date.match(/^\d{4}-\d{2}-\d{2}/)?.[0]:null,at=iso?new Date(iso+'T12:00:00Z'):null;
    const when=at&&Number.isFinite(at.getTime())?(String(option.onOrBy).toLowerCase()==='by'?'by ':'on ')+at.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'date not supplied';
    return `${label}: ${price} · ${when}`;
  });}
  function stale(entry,now=Date.now()){return !entry?.checkedAt||!Number.isFinite(Date.parse(entry.checkedAt))||now-Date.parse(entry.checkedAt)>=DAY;}
  function products(cache){return (cache||[]).filter(e=>e.name&&e.sku&&officialURL(e.url)).map(e=>({barcode:e.barcode,name:e.name,aliases:e.variant||'',source:'linked-official-page'}));}
  const api={DAY,officialURL,key,storeId,links,due,merge,stale,availabilityStale,deliveryStale,deliveryLines,products};if(typeof module!=='undefined')module.exports=api;root.RetailerCore=api;
})(typeof window!=='undefined'?window:globalThis);

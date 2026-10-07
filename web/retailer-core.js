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
  function links(events){const entries=new Map();for(const e of events||[])if(e.kind==='retailer-link'&&e.product&&officialURL(e.url))entries.set(canonical(e.product),{barcode:canonical(e.product),url:officialURL(e.url),store:e.store||'Kingston'});return [...entries.values()];}
  function due(entry,now=Date.now()){const time=Date.parse(entry?.lastAttemptAt||entry?.checkedAt);return !Number.isFinite(time)||now-time>=DAY;}
  function merge(existing,incoming){const records=new Map((existing||[]).map(e=>[key(e.barcode,e.store),e]));for(const e of incoming||[])if(e&&e.barcode&&officialURL(e.url)){const old=records.get(key(e.barcode,e.store));if(!old||Date.parse(e.lastAttemptAt||e.checkedAt)>=Date.parse(old.lastAttemptAt||old.checkedAt))records.set(key(e.barcode,e.store),e);}return [...records.values()];}
  function stale(entry,now=Date.now()){return !entry?.checkedAt||!Number.isFinite(Date.parse(entry.checkedAt))||now-Date.parse(entry.checkedAt)>=DAY;}
  function products(cache){return (cache||[]).filter(e=>e.name&&e.sku&&officialURL(e.url)).map(e=>({barcode:e.barcode,name:e.name,aliases:e.variant||'',source:'linked-official-page'}));}
  const api={DAY,officialURL,key,links,due,merge,stale,products};if(typeof module!=='undefined')module.exports=api;root.RetailerCore=api;
})(typeof window!=='undefined'?window:globalThis);

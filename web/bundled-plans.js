(function(root){
  'use strict';
  const KEY='stock-assistant-bundle-preferences',CACHE='stock-plans-dunelm-kingston';
  function excluded(storage){try{return JSON.parse(storage.getItem(KEY)||'{}').kingstonExcluded===true;}catch{return true;}}
  function known(document,config){return (config?.documents||[]).some(d=>document.id===d.id||document.id==='i'+d.sha256.slice(0,24)||document.sha256===d.sha256);}
  function merge(base,local,config){
    const duplicate=new Set(local.documents.filter(d=>base.documents.some(b=>b.id===d.id||b.sha256&&d.id==='i'+b.sha256.slice(0,24))).map(d=>d.id));
    return {documents:[...base.documents,...local.documents.filter(d=>!duplicate.has(d.id))],products:[...base.products,...local.products.filter(p=>!duplicate.has(p.doc))]};
  }
  const policy={KEY,CACHE,excluded,known,merge};
  if(typeof module==='object'&&module.exports){module.exports=policy;return;}
  const config=root.STOCK_BUNDLE,controllers=new Set();let generation=0;
  const available=()=>!!config&&!root.Native,enabled=()=>!available()||!excluded(localStorage);
  function allowed(){if(!enabled())throw Error('Kingston plans are disabled in this browser. Re-enable them in Settings to download again.');}
  async function request(url){
    const controller=new AbortController();controllers.add(controller);
    try{const response=await fetch(url,{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('Plan download failed');return response;}finally{controllers.delete(controller);}
  }
  async function cachedFile(path){
    allowed();const epoch=generation,resource=new URL('../catalogue/'+path,location.href);
    if(path==='catalogue.json')resource.searchParams.set('bundle',config.catalogueSha256||'0.9');
    const url=resource.href;
    const cache=await caches.open(CACHE),cached=await cache.match(url);
    if(cached&&path!=='catalogue.json')return cached;
    try{const response=await request(url);const bytes=await response.arrayBuffer();allowed();if(epoch!==generation)throw Error('Plan download cancelled');
      const expectedHash=path==='catalogue.json'?config.catalogueSha256:config.documents.find(d=>d.id+'.pdf'===path)?.sha256;
      if(path.endsWith('.pdf')&&!expectedHash)throw Error('Unknown bundled plan');
      if(expectedHash){const digest=await crypto.subtle.digest('SHA-256',bytes);if([...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')!==expectedHash)throw Error('Plan integrity check failed');}
      const saved=new Response(bytes,{headers:{'Content-Type':path.endsWith('.pdf')?'application/pdf':'application/json'}});await cache.put(url,saved.clone());if(!enabled()||epoch!==generation){await caches.delete(CACHE);throw Error('Plan download cancelled');}return saved;
    }catch(error){if(cached&&enabled()&&epoch===generation)return cached;throw error;}
  }
  async function catalogue(){
    if(!available()){const response=await fetch('../catalogue/catalogue.json');if(!response.ok)throw Error('Catalogue unavailable');return response.json();}
    if(!enabled())return {documents:[],products:[]};
    const result=await (await cachedFile('catalogue.json')).json();allowed();return result;
  }
  async function setEnabled(value){
    // Save the tombstone before deleting anything. It is deliberately outside
    // exported workspaces and the app's versioned asset cache.
    localStorage.setItem(KEY,JSON.stringify({kingstonExcluded:!value}));generation++;
    controllers.forEach(c=>c.abort());controllers.clear();
    if(!value){await purge();await root.LocalPlatform?.removeBundledPlans();}
    if(navigator.storage?.persist)try{await navigator.storage.persist();}catch{}
  }
  async function purge(){
    await caches.delete(CACHE);
    const prefix=new URL('../catalogue/',location.href).href;
    for(const name of await caches.keys())if(name.startsWith('stock-app-')){
      const cache=await caches.open(name);for(const request of await cache.keys())if(request.url.startsWith(prefix))await cache.delete(request);
    }
  }
  async function downloadAll(progress){allowed();for(let i=0;i<config.documents.length;i++){await cachedFile(config.documents[i].id+'.pdf');progress(i+1,config.documents.length);}if(navigator.storage?.persist)await navigator.storage.persist();}
  root.BundlePlans={...policy,available,enabled,catalogue,setEnabled,purge,downloadAll,pdf:async id=>(await cachedFile(id+'.pdf')).blob(),isKnown:d=>known(d,config),merge:(base,local)=>merge(base,local,config)};
})(typeof window==='object'?window:globalThis);

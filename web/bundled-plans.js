(function(root){
  'use strict';
  const KEY='stock-assistant-bundle-preferences',CACHE='stock-plans-dunelm-kingston';
  function excluded(storage){try{return JSON.parse(storage.getItem(KEY)||'{}').kingstonExcluded===true;}catch{return true;}}
  function known(document,config){return (config?.documents||[]).some(d=>document.id===d.id||document.id==='i'+d.sha256.slice(0,24)||document.sha256===d.sha256);}
  function merge(base,local,config){
    const duplicate=new Set(local.documents.filter(d=>base.documents.some(b=>b.id===d.id||b.sha256&&d.id==='i'+b.sha256.slice(0,24))).map(d=>d.id));
    return {documents:[...base.documents,...local.documents.filter(d=>!duplicate.has(d.id))],products:[...base.products,...local.products.filter(p=>!duplicate.has(p.doc))]};
  }
  // Products share their page image lists through imageSets. Catalogues without imageSets load unchanged.
  function expand(data){
    if(!Array.isArray(data.imageSets))return data;
    const {imageSets,...rest}=data;
    return {...rest,products:rest.products.map(({imageSet,...product})=>imageSet===undefined?product:{...product,images:imageSets[imageSet]})};
  }
  const policy={KEY,CACHE,excluded,known,merge,expand};
  if(typeof module==='object'&&module.exports){module.exports=policy;return;}
  const config=root.STOCK_BUNDLE,controllers=new Set();let generation=0;
  const available=()=>!!config&&!root.Native,enabled=()=>!excluded(localStorage);
  function allowed(){if(!enabled())throw Error(root.PlanPack.text.downloadDisabled);}
  const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  function resource(path){const url=new URL('../catalogue/'+path,location.href);if(path==='catalogue.json')url.searchParams.set('bundle',config.catalogueSha256||'0.9');return url.href;}
  function expected(path){return path==='catalogue.json'?config.catalogueSha256:config.documents.find(d=>d.id+'.pdf'===path)?.sha256;}
  function verifiedResponse(bytes,path,sha){return new Response(bytes,{headers:{'Content-Type':path.endsWith('.pdf')?'application/pdf':'application/json',...(sha?{'X-Stock-Source-Sha256':sha}:{})}});}
  async function savedFile(cache,path,epoch){
    const cached=await cache.match(resource(path));if(!cached)return null;
    const sha=expected(path),recorded=cached.headers.get('X-Stock-Source-Sha256');
    if(!sha||recorded===sha)return cached;
    if(recorded)return null; // A different source version is not an offline copy of this plan.
    // Existing 0.10 files were verified before saving but have no hash header.
    // Check them once locally; don't make an update re-download valid plans.
    const bytes=await cached.arrayBuffer();if(await hash(bytes)!==sha)return null;
    const verified=verifiedResponse(bytes,path,sha);
    if(enabled()&&epoch===generation)try{await cache.put(resource(path),verified.clone());}catch(error){/* Caching is best effort; the verified response is still returned. */reportFailure('plan cache write',error);} // A read remains usable if metadata promotion exceeds quota.
    return verified;
  }
  async function request(url){
    const controller=new AbortController();controllers.add(controller);
    try{const response=await fetch(url,{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('Plan download failed. Saved files are kept; retry when connected.');return await response.arrayBuffer();}finally{controllers.delete(controller);}
  }
  async function cachedFile(path){
    allowed();const epoch=generation,url=resource(path);
    const cache=await caches.open(CACHE),cached=await savedFile(cache,path,epoch);allowed();if(epoch!==generation)throw Error('Plan download cancelled');
    if(cached&&path!=='catalogue.json')return cached;
    try{const bytes=await request(url);allowed();if(epoch!==generation)throw Error('Plan download cancelled');
      const expectedHash=expected(path);
      if(path.endsWith('.pdf')&&!expectedHash)throw Error('Unknown bundled plan');
      if(expectedHash&&await hash(bytes)!==expectedHash)throw Error('Plan integrity check failed');
      const saved=verifiedResponse(bytes,path,expectedHash);await cache.put(url,saved.clone());if(!enabled()||epoch!==generation){await caches.delete(CACHE);throw Error('Plan download cancelled');}return saved;
    }catch(error){if(cached&&enabled()&&epoch===generation)return cached;throw error;}
  }
  // On Android the app's own catalogue lists the plan set; its document ids are what the switch removes. It is read only when there is something to remove.
  let shippedIds=null;
  async function loadKnown(){
    if(available()||shippedIds)return;
    const response=await fetch('../catalogue/catalogue.json');if(!response.ok)throw Error('Catalogue unavailable');
    shippedIds=new Set((await response.json()).documents.map(d=>d.id));
  }
  const knownShipped=document=>!!shippedIds?.has(document.id);
  async function catalogue(){
    if(!available()){if(!enabled())return {documents:[],products:[]};const response=await fetch('../catalogue/catalogue.json');if(!response.ok)throw Error('Catalogue unavailable');return policy.expand(await response.json());}
    if(!enabled())return {documents:[],products:[]};
    const result=policy.expand(await (await cachedFile('catalogue.json')).json());allowed();return result;
  }
  async function setEnabled(value){
    // Save the tombstone before deleting anything. It is deliberately outside
    // exported workspaces and the app's versioned asset cache.
    localStorage.setItem(KEY,JSON.stringify({kingstonExcluded:!value}));generation++;
    controllers.forEach(c=>c.abort());controllers.clear();
    if(!value){await purge();await root.LocalPlatform?.removeBundledPlans();}
    await requestPersistence();
  }
  async function purge(){
    await caches.delete(CACHE);
    const prefix=new URL('../catalogue/',location.href).href;
    for(const name of await caches.keys())if(name.startsWith('stock-app-')){
      const cache=await caches.open(name);for(const request of await cache.keys())if(request.url.startsWith(prefix))await cache.delete(request);
    }
  }
  // Storage protection and the offline app worker are checked by the shell. Without it, nothing is reported as saved.
  const shell=()=>root.LocalPlatform||{requestPersistence:async()=>'unavailable',persistenceStatus:async()=>'unavailable',appStatus:async()=>({ready:false,status:'not-installed'})};
  async function requestPersistence(){return shell().requestPersistence();}
  async function offlineStatus(){
    const epoch=generation,missing=[],total=config.documents.length;let saved=0,bytes=0,catalogueSaved=false;
    if(enabled()&&(await caches.keys()).includes(CACHE)){
      const cache=await caches.open(CACHE);catalogueSaved=!!await savedFile(cache,'catalogue.json',epoch);
      for(const doc of config.documents){if(await savedFile(cache,doc.id+'.pdf',epoch)){saved++;bytes+=doc.bytes||0;}else missing.push(doc.id);}
    }else missing.push(...config.documents.map(d=>d.id));
    const persistence=await shell().persistenceStatus();
    const app=await shell().appStatus();
    if(!enabled()||epoch!==generation)return {enabled:enabled(),saved:0,total,bytes:0,missing:config.documents.map(d=>d.id),catalogueSaved:false,persistence,app};
    return {enabled:true,saved,total,bytes,missing,catalogueSaved,persistence,app};
  }
  async function downloadAll(progress){allowed();await catalogue();for(let i=0;i<config.documents.length;i++){await cachedFile(config.documents[i].id+'.pdf');progress(i+1,config.documents.length);}return requestPersistence();}
  root.BundlePlans={...policy,available,enabled,catalogue,setEnabled,purge,downloadAll,offlineStatus,requestPersistence,saveApp:()=>shell().appStatus(true),pdf:async id=>(await cachedFile(id+'.pdf')).blob(),isKnown:d=>known(d,config)||knownShipped(d),loadKnown,merge:(base,local)=>merge(base,local,config)};
})(typeof window==='object'?window:globalThis);

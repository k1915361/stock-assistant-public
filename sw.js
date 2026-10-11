/* Build replaces these two tokens with the verified static asset inventory. */
const CACHE="stock-app-2b9dbd01c3bca335";
const ASSETS=["./.nojekyll", "./icon.svg", "./index.html", "./manifest.webmanifest", "./web/account-ui.js", "./web/app.js", "./web/bundle-config.js", "./web/bundled-plans.js", "./web/core.js", "./web/demo-plan.pdf", "./web/demo.js", "./web/image-test.js", "./web/import-core.js", "./web/index.html", "./web/local-platform.mjs", "./web/location-core.js", "./web/location-map.js", "./web/map-core.js", "./web/membership-core.js", "./web/monetization-config.js", "./web/plan-cache.mjs", "./web/product-core.js", "./web/retailer-core.js", "./web/retailer-ui.js", "./web/style.css", "./web/test-barcode.png", "./web/unzip-import.mjs", "./web/unzip-worker.mjs", "./web/vendor/leaflet.css", "./web/vendor/leaflet.js", "./web/vendor/ocr.mjs", "./web/vendor/ocr/eng.traineddata.gz", "./web/vendor/ocr/tesseract-core-lstm.wasm.js", "./web/vendor/ocr/tesseract-core-simd-lstm.wasm.js", "./web/vendor/ocr/tesseract-core-simd.wasm.js", "./web/vendor/ocr/tesseract-core.wasm.js", "./web/vendor/ocr/worker.min.js", "./web/vendor/pdf.mjs", "./web/vendor/pdf.worker.mjs", "./web/vendor/tools.mjs", "./web/vendor/zip.mjs", "./web/workflow-core.js", "./web/zip-export.mjs", "./web/zip-worker.mjs", "./web/style.css?build=a293d0ea7db0647b", "./web/vendor/leaflet.css?build=a293d0ea7db0647b", "./web/bundle-config.js?build=a293d0ea7db0647b", "./web/bundled-plans.js?build=a293d0ea7db0647b", "./web/monetization-config.js?build=a293d0ea7db0647b", "./web/membership-core.js?build=a293d0ea7db0647b", "./web/account-ui.js?build=a293d0ea7db0647b", "./web/core.js?build=a293d0ea7db0647b", "./web/import-core.js?build=a293d0ea7db0647b", "./web/location-core.js?build=a293d0ea7db0647b", "./web/workflow-core.js?build=a293d0ea7db0647b", "./web/product-core.js?build=a293d0ea7db0647b", "./web/vendor/leaflet.js?build=a293d0ea7db0647b", "./web/retailer-core.js?build=a293d0ea7db0647b", "./web/map-core.js?build=a293d0ea7db0647b", "./web/app.js?build=a293d0ea7db0647b", "./web/image-test.js?build=a293d0ea7db0647b", "./web/location-map.js?build=a293d0ea7db0647b", "./web/retailer-ui.js?build=a293d0ea7db0647b", "./web/local-platform.mjs?build=a293d0ea7db0647b", "./web/demo.js?build=a293d0ea7db0647b"];
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())
));
self.addEventListener('message',event=>{
  if(event.data?.type==='ACTIVATE')self.skipWaiting();
  if(['OFFLINE_STATUS','SAVE_OFFLINE_APP'].includes(event.data?.type)&&event.ports[0])event.waitUntil((async()=>{
    try{
      const saving=event.data.type==='SAVE_OFFLINE_APP',exists=(await caches.keys()).includes(CACHE);let saved=0;
      if(exists||saving){const cache=await caches.open(CACHE);for(const asset of ASSETS){const url=new URL(asset,self.registration.scope).href;if(await cache.match(url))saved++;else if(saving){await cache.add(url);saved++;}}}
      event.ports[0].postMessage({ready:saved===ASSETS.length,total:ASSETS.length,saved,status:saved===ASSETS.length?'saved':'incomplete'});
    }catch{event.ports[0].postMessage({ready:false,status:'unknown'});}
  })());
});
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('stock-app-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())
));
async function openPage(request){
  const controller=new AbortController();const deadline=setTimeout(()=>controller.abort(),4000);
  try{const response=await fetch(request,{cache:'no-store',signal:controller.signal});if(response.ok)return response;
    return await caches.match(request,{ignoreSearch:true})||response;
  }catch{return await caches.match(request,{ignoreSearch:true})||new Response('You are offline. Open the app once with a connection to save its files.',{status:503,headers:{'Content-Type':'text/plain'}});}
  finally{clearTimeout(deadline);}
}
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  // BundlePlans manages these in its separate cache after checking opt-out.
  // Update installation must never cache plans or bypass their removal policy.
  if(new URL(event.request.url).pathname.includes('/catalogue/'))return;
  // Fresh HTML points at this release's versioned scripts. Offline, use the
  // complete installed bundle. Imported plans/photos/history stay in IndexedDB.
  event.respondWith(event.request.mode==='navigate'?openPage(event.request):caches.match(event.request).then(cached=>cached||fetch(event.request)));
});

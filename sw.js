/* Build replaces these two tokens with the verified static asset inventory. */
const CACHE="stock-app-b40611ff8d8d0b6f";
const ASSETS=["./.nojekyll", "./delete-account.html", "./icon.svg", "./index.html", "./manifest.webmanifest", "./web/account-ui.js", "./web/app-routes.js", "./web/app-scan.js", "./web/app-shell.js", "./web/app-ui.js", "./web/app.js", "./web/apple-touch-icon.png", "./web/automation-core.js", "./web/automation-ui.js", "./web/bookmark-core.js", "./web/bundle-config.js", "./web/bundled-plans.js", "./web/capture-core.js", "./web/core.js", "./web/delete-account.html", "./web/demo-plan.pdf", "./web/demo.js", "./web/image-test.js", "./web/import-core.js", "./web/index.html", "./web/local-platform.mjs", "./web/location-core.js", "./web/location-map.js", "./web/map-core.js", "./web/membership-core.js", "./web/menu-ui.js", "./web/monetization-config.js", "./web/native-recovery-preview.mjs", "./web/native-restore-evidence.mjs", "./web/native-workspace-writer.js", "./web/nav-swipe-core.js", "./web/nav-swipe-ui.js", "./web/photo-handoff.mjs", "./web/plan-cache.mjs", "./web/plan-library-core.mjs", "./web/plan-views.js", "./web/plan-zoom-core.js", "./web/plan-zoom-ui.js", "./web/product-core.js", "./web/release-notes.js", "./web/restore-core.js", "./web/restore-recovery.mjs", "./web/restore-review.mjs", "./web/retailer-core.js", "./web/retailer-ui.js", "./web/shelf-core.js", "./web/shelf-labels.js", "./web/shelf-ocr.mjs", "./web/steady-read-core.js", "./web/store-core.js", "./web/style.css", "./web/test-barcode.png", "./web/unzip-import.mjs", "./web/unzip-worker.mjs", "./web/vendor/leaflet.css", "./web/vendor/leaflet.js", "./web/vendor/ocr.mjs", "./web/vendor/ocr/eng.traineddata.gz", "./web/vendor/ocr/tesseract-core-lstm.wasm.js", "./web/vendor/ocr/tesseract-core-simd-lstm.wasm.js", "./web/vendor/ocr/tesseract-core-simd.wasm.js", "./web/vendor/ocr/tesseract-core.wasm.js", "./web/vendor/ocr/worker.min.js", "./web/vendor/pdf.mjs", "./web/vendor/pdf.worker.mjs", "./web/vendor/shelf-reader.mjs", "./web/vendor/tools.mjs", "./web/vendor/zip.mjs", "./web/vendor/zxing_reader.wasm", "./web/workflow-core.js", "./web/workspace-journal.mjs", "./web/workspace-state.js", "./web/workspace-writer.js", "./web/zip-export.mjs", "./web/zip-worker.mjs", "./web/style.css?build=899d7a5055561c79", "./web/vendor/leaflet.css?build=899d7a5055561c79", "./web/bundle-config.js?build=899d7a5055561c79", "./web/bundled-plans.js?build=899d7a5055561c79", "./web/release-notes.js?build=899d7a5055561c79", "./web/monetization-config.js?build=899d7a5055561c79", "./web/membership-core.js?build=899d7a5055561c79", "./web/account-ui.js?build=899d7a5055561c79", "./web/core.js?build=899d7a5055561c79", "./web/import-core.js?build=899d7a5055561c79", "./web/location-core.js?build=899d7a5055561c79", "./web/workflow-core.js?build=899d7a5055561c79", "./web/product-core.js?build=899d7a5055561c79", "./web/vendor/leaflet.js?build=899d7a5055561c79", "./web/retailer-core.js?build=899d7a5055561c79", "./web/restore-core.js?build=899d7a5055561c79", "./web/map-core.js?build=899d7a5055561c79", "./web/capture-core.js?build=899d7a5055561c79", "./web/workspace-writer.js?build=899d7a5055561c79", "./web/native-workspace-writer.js?build=899d7a5055561c79", "./web/shelf-core.js?build=899d7a5055561c79", "./web/app-ui.js?build=899d7a5055561c79", "./web/menu-ui.js?build=899d7a5055561c79", "./web/bookmark-core.js?build=899d7a5055561c79", "./web/automation-core.js?build=899d7a5055561c79", "./web/automation-ui.js?build=899d7a5055561c79", "./web/nav-swipe-core.js?build=899d7a5055561c79", "./web/nav-swipe-ui.js?build=899d7a5055561c79", "./web/plan-zoom-core.js?build=899d7a5055561c79", "./web/plan-zoom-ui.js?build=899d7a5055561c79", "./web/store-core.js?build=899d7a5055561c79", "./web/app-shell.js?build=899d7a5055561c79", "./web/app-routes.js?build=899d7a5055561c79", "./web/workspace-state.js?build=899d7a5055561c79", "./web/plan-views.js?build=899d7a5055561c79", "./web/app-scan.js?build=899d7a5055561c79", "./web/app.js?build=899d7a5055561c79", "./web/shelf-labels.js?build=899d7a5055561c79", "./web/image-test.js?build=899d7a5055561c79", "./web/location-map.js?build=899d7a5055561c79", "./web/retailer-ui.js?build=899d7a5055561c79", "./web/steady-read-core.js?build=899d7a5055561c79", "./web/local-platform.mjs?build=899d7a5055561c79", "./web/demo.js?build=899d7a5055561c79"];
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

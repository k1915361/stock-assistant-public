import * as pdfjs from './vendor/pdf.mjs';
import {PlanCache} from './plan-cache.mjs';
import {BrowserMultiFormatReader,DecodeHintType,zipSync,unzipSync,strToU8} from './vendor/tools.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
const database=new Promise((resolve,reject)=>{const request=indexedDB.open('stock-assistant-local',1);request.onupgradeneeded=()=>request.result.createObjectStore('files',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
async function store(action,value){const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction('files',['put','delete'].includes(action)?'readwrite':'readonly');const table=tx.objectStore('files');const request=action==='put'?table.put(value):action==='delete'?table.delete(value):action==='all'?table.getAll():table.get(value);let result;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
async function storeBatch(records){
 const db=await database;
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('files','readwrite'),table=tx.objectStore('files');let failure;
  tx.oncomplete=()=>resolve();tx.onabort=()=>reject(failure||tx.error||Error('Workspace write aborted.'));tx.onerror=()=>{failure=failure||tx.error;};
  // No async work inside an active transaction: validate/build records first.
  const put=record=>{try{table.put(record);}catch(error){failure=error;tx.abort();}};
  try{for(const record of records){if(record.kind==='workspace-recovery')put(record);else{const request=table.get(record.id);request.onsuccess=()=>{if(!request.result)put(record);};}}}catch(error){failure=error;tx.abort();}
 });
}
let recoveryJob=null;
async function recoverWorkspace(){
 if(recoveryJob)return recoveryJob;
 recoveryJob=(async()=>{
  for(const record of await store('all'))if(record.kind==='workspace-recovery'){
   await window.onWorkspaceRestored(record.state);
   await store('delete',record.id);
  }
 })();
 try{await recoveryJob;}finally{recoveryJob=null;}
}
const urls=new Map();let cameraSession=null;
const status=message=>window.onCameraMessage?.(message);
function stop(session=cameraSession){
 if(!session||session.stopped)return;
 session.stopped=true;session.scanner?.stop();session.scanner=null;
 session.stream?.getTracks().forEach(track=>track.stop());session.stream=null;
 session.video.pause();session.video.srcObject=null;session.panel.remove();
 if(cameraSession===session){cameraSession=null;window.onCameraClosed?.();}
}
let ocrWorker=null,ocrEpoch=0;
function cancelOCR(){ocrEpoch++;ocrWorker?.terminate();ocrWorker=null;}
async function recognizePhoto(reference){
  cancelOCR();const epoch=ocrEpoch;let deadline;
  try{
    const {createWorker}=await import('./vendor/ocr.mjs');
    const pending=createWorker('eng',1,{workerPath:new URL('./vendor/ocr/worker.min.js',import.meta.url).href,corePath:new URL('./vendor/ocr/',import.meta.url).href,langPath:new URL('./vendor/ocr/',import.meta.url).href,workerBlobURL:false,cacheMethod:'none',logger:m=>window.onOCRProgress?.(`${m.status} · ${Math.round((m.progress||0)*100)}%`)});
    pending.then(worker=>{if(epoch!==ocrEpoch)worker.terminate();}).catch(()=>{});
    const expiry=new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('Recognition timed out')),45000);});
    const worker=await Promise.race([pending,expiry]);
    if(epoch!==ocrEpoch){await worker.terminate();throw Error('Recognition cancelled');}ocrWorker=worker;
    const response=await fetch(await photoUrl(reference));if(!response.ok)throw Error('Photo unavailable');
    const result=await Promise.race([worker.recognize(await response.blob()),expiry]);
    return {text:result.data.text,confidence:result.data.confidence};
  }finally{clearTimeout(deadline);if(epoch===ocrEpoch)cancelOCR();}
}
function pictureBounds(operators,viewport){
  const images=[],stack=[];let matrix=[1,0,0,1,0,0];
  const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
  for(let i=0;i<operators.fnArray.length;i++){
    const op=operators.fnArray[i],args=operators.argsArray[i];if(op===pdfjs.OPS.save)stack.push([...matrix]);else if(op===pdfjs.OPS.restore)matrix=stack.pop()||[1,0,0,1,0,0];else if(op===pdfjs.OPS.transform)matrix=multiply(matrix,args);
    else if([pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject].includes(op)){
      const points=[[0,0],[1,0],[0,1],[1,1]].map(([x,y])=>viewport.convertToViewportPoint(matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]));
      const box=[Math.min(...points.map(p=>p[0]))/viewport.width,Math.min(...points.map(p=>p[1]))/viewport.height,Math.max(...points.map(p=>p[0]))/viewport.width,Math.max(...points.map(p=>p[1]))/viewport.height];
      if(box[1]>.1&&box[3]<.9&&box[2]<.65)images.push(box);
    }
  }return images;
}
function drawMarkers(context,markers,width,height){
  for(const b of markers){const cx=(b[0]+b[2])*width/2,cy=(b[1]+b[3])*height/2,r=Math.max(12,Math.max((b[2]-b[0])*width,(b[3]-b[1])*height)/2+7);
    for(let ring=0;ring<3;ring++)for(const [color,line] of [['black',8],['white',5],[ring===1?'#e1232d':'#ffd300',3]]){context.strokeStyle=color;context.lineWidth=line;context.beginPath();context.arc(cx,cy,r+ring*9,0,Math.PI*2);context.stroke();}
    context.lineCap='round';for(const [color,line] of [['black',10],['white',7],['#ffd300',4]]){context.strokeStyle=color;context.lineWidth=line;context.beginPath();context.moveTo(cx+68,cy-68);context.lineTo(cx+24,cy-24);context.lineTo(cx+47,cy-29);context.moveTo(cx+24,cy-24);context.lineTo(cx+29,cy-47);context.stroke();}context.lineCap='butt';
  }
}
function cameraPanel(){
 stop();const panel=document.createElement('div');panel.id='browser-camera';panel.innerHTML='<p>Point at one barcode</p><video autoplay playsinline muted></video><div><button id="camera-cancel">Cancel</button><button id="camera-shutter" hidden>Use photo</button></div>';document.body.append(panel);
 const session={panel,video:panel.querySelector('video'),stream:null,scanner:null,stopped:false};cameraSession=session;
 panel.querySelector('#camera-cancel').onclick=()=>stop(session);return session;
}
async function camera(photo=false,label=false){
 if(!isSecureContext||!navigator.mediaDevices){window.onCameraClosed?.();status('Camera needs HTTPS and a supported browser. You can still type a barcode.');return;}
 const session=cameraPanel(),{panel,video}=session,current=()=>cameraSession===session&&!session.stopped;window.onCameraOpened?.();
 try {
   // Own the stream before decoder startup, so cancellation can release it even
   // while permission or video playback promises are still pending.
   const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:photo?2048:1920}},audio:false});
   if(!current()){stream.getTracks().forEach(track=>track.stop());return;}session.stream=stream;
   stream.getVideoTracks().forEach(track=>track.addEventListener('ended',()=>{if(current()){stop(session);status('Camera interrupted. Scan again, or search by barcode or product name.');}},{once:true}));
   if(photo){video.srcObject=stream;await video.play();if(!current())return;const shutter=panel.querySelector('#camera-shutter');shutter.hidden=false;panel.querySelector('p').textContent='Include the item and surrounding shelf or landmarks.';shutter.onclick=async()=>{if(!current())return;shutter.disabled=true;const capturedAt=Date.now();try{const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);const source=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));if(!current())return;stop(session);await addPhoto(source,capturedAt,label);}catch{if(current())shutter.disabled=false;if(current()||!cameraSession)status('Photo could not be saved. Export a backup if storage is full.');}};
   }else{const reader=new BrowserMultiFormatReader(new Map([[DecodeHintType.TRY_HARDER,true]]),{delayBetweenScanAttempts:150});const controls=await reader.decodeFromStream(stream,video,(result,error,controls)=>{if(result&&current()){session.scanner=controls;stop(session);window.onBarcode(result.getText(),'camera',Date.now());}});if(!current())controls.stop();else session.scanner=controls;}
 }catch{if(current()){stop(session);status('Camera unavailable or permission denied. Type a barcode or product name instead.');}}
}
async function scanImage(blob){
 if(!blob||!blob.type.startsWith('image/'))throw Error('Choose an image file.');
 if(blob.size>20*1024*1024)throw Error('Choose an image smaller than 20 MB.');
 const image=await createImageBitmap(blob,{imageOrientation:'from-image'});
 let url;
 try{
  if(image.width*image.height>50000000)throw Error('Choose a photo smaller than 50 megapixels.');
  const factor=Math.min(1,2400/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*factor));canvas.height=Math.max(1,Math.round(image.height*factor));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const data=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!data)throw Error('This image could not be read.');url=URL.createObjectURL(data);
  const reader=new BrowserMultiFormatReader(new Map([[DecodeHintType.TRY_HARDER,true]]));
  const result=await reader.decodeFromImageUrl(url);window.onImageBarcode(result.getText());return result.getText();
 }catch(error){if(error.message?.startsWith('Choose')||error.message==='This image could not be read.')throw error;throw Error('No readable barcode found. Try a closer photo with one complete barcode, or search by the item name.');}
 finally{image.close();if(url)URL.revokeObjectURL(url);}
}
async function compress(blob,profile='balanced'){
 const image=await createImageBitmap(blob,{imageOrientation:'from-image'}),edge=profile==='detail'?2048:profile==='compact'?1280:1600,target=profile==='detail'?600*1024:profile==='compact'?200*1024:320*1024;
 const scale=Math.min(1,edge/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();
 const encode=(c,q)=>new Promise((resolve,reject)=>c.toBlob(result=>result?resolve(result):reject(Error('Photo encode failed')),'image/jpeg',q));
 let quality=profile==='detail'?.88:profile==='compact'?.74:.82,photo=await encode(canvas,quality);while(photo.size>target&&quality>.60){quality=Math.max(.60,quality-.07);photo=await encode(canvas,quality);}
 if(photo.size>target&&Math.max(canvas.width,canvas.height)>1280){const reduced=document.createElement('canvas'),factor=1280/Math.max(canvas.width,canvas.height);reduced.width=Math.round(canvas.width*factor);reduced.height=Math.round(canvas.height*factor);reduced.getContext('2d').drawImage(canvas,0,0,reduced.width,reduced.height);canvas.width=reduced.width;canvas.height=reduced.height;canvas.getContext('2d').drawImage(reduced,0,0);photo=await encode(canvas,quality);}
 const thumb=document.createElement('canvas'),factor=Math.min(1,360/Math.max(canvas.width,canvas.height));thumb.width=Math.round(canvas.width*factor);thumb.height=Math.round(canvas.height*factor);thumb.getContext('2d').drawImage(canvas,0,0,thumb.width,thumb.height);
 return {blob:photo,thumbnail:await encode(thumb,.70),width:canvas.width,height:canvas.height,bytes:photo.size,originalBytes:blob.size};
}
async function addPhoto(blob,capturedAt=Date.now(),label=false){const saved=await compress(blob,label?'detail':window.photoQuality?.()||'balanced');const id='photo-'+crypto.randomUUID();await store('put',{id,kind:'photo',...saved});const accepted=await (label?window.onLabelPhoto:window.onPhoto)('local-photo:'+id,'local-thumb:'+id,JSON.stringify({width:saved.width,height:saved.height,bytes:saved.bytes,originalBytes:saved.originalBytes,capturedAt}));if(accepted===false)await store('delete',id);}
async function photoUrl(reference){if(!/^local-(photo|thumb):/.test(reference))return reference;if(urls.has(reference))return urls.get(reference);const record=await store('get',reference.split(':')[1]);if(!record)return '';const url=URL.createObjectURL(reference.startsWith('local-thumb:')?record.thumbnail:record.blob);urls.set(reference,url);return url;}
async function backupParts(state){
  const entries={},records=[],stored=await store('all');
  // Export pending recovery too, even when localStorage cannot accept its merge.
  const snapshot=window.workspaceBackupSnapshot?.(stored.filter(r=>r.kind==='workspace-recovery').map(r=>r.state))||{state};
  for(const record of stored){
    if(blocked(record))continue;
    const {blob,thumbnail,...metadata}=record;
    if(record.kind==='pdf'){metadata.file='files/'+record.id+'.pdf';entries[metadata.file]=new Uint8Array(await blob.arrayBuffer());}
    else if(record.kind==='photo'){metadata.file='files/'+record.id+'.jpg';metadata.thumbnailFile='files/'+record.id+'-thumb.jpg';entries[metadata.file]=new Uint8Array(await blob.arrayBuffer());entries[metadata.thumbnailFile]=new Uint8Array(await thumbnail.arrayBuffer());}else continue;
    records.push(metadata);
  }const pack={schema:1,...snapshot,records};entries['workspace.json']=strToU8(JSON.stringify(pack));return {entries,pack};
}
async function nativeBackup(state){
  const {entries,pack}=await backupParts(state);if(!window.Native.resetBackup())throw Error('Backup staging unavailable');
  for(const [path,bytes] of Object.entries(entries))if(path!=='workspace.json'){
    for(let offset=0;offset<bytes.length;offset+=196608){const chunk=bytes.subarray(offset,offset+196608);let binary='';for(let i=0;i<chunk.length;i+=8192)binary+=String.fromCharCode(...chunk.subarray(i,i+8192));if(!Native.stageBackupFile(path.split('/').at(-1),btoa(binary),offset>0))throw Error('Backup could not be staged');}
  }Native.exportBackup(JSON.stringify(pack));
}
async function backupBlob(state){const {entries}=await backupParts(state);return new Blob([zipSync(entries,{level:0})],{type:'application/zip'});}
async function restoreWorkspace(entries){
  const decode=name=>JSON.parse(new TextDecoder().decode(entries[name]));
  const pack=entries['workspace.json']?decode('workspace.json'):{schema:1,state:decode('observations.json'),records:[]};
  if(pack.schema!==1||!pack.state||!Array.isArray(pack.state.events)||pack.state.events.length>50000||!Array.isArray(pack.records)||pack.records.length>5000||pack.records.some(r=>!r||typeof r.id!=='string')||pack.state.recent!==undefined&&(!Array.isArray(pack.state.recent)||pack.state.recent.some(q=>typeof q!=='string'))||pack.state.retailerCache!==undefined&&!Array.isArray(pack.state.retailerCache))throw Error('Unsupported or oversized workspace backup.');
  const oldCatalogue=entries['catalogue.json']?decode('catalogue.json'):{documents:[],products:[]},mapping=new Map(),prepared=[];
  const sources=[...pack.records.filter(r=>r.kind==='pdf'),...(oldCatalogue.documents||[]).map(document=>({id:document.id,document,products:(oldCatalogue.products||[]).filter(p=>p.doc===document.id),file:'plans/'+document.id+'.pdf'}))];
  for(const record of sources){
    const bytes=entries[record.file];if(!bytes||bytes.length>100*1024*1024||!record.document||!Array.isArray(record.products))throw Error('Backup PDF missing or too large.');
    const digest=await crypto.subtle.digest('SHA-256',bytes),id='i'+[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('').slice(0,24);mapping.set(record.id,id);
    const products=record.products.filter(p=>p&&typeof p.barcode==='string'&&typeof p.name==='string'&&Number.isInteger(p.page)&&p.page>0).map(p=>({...p,doc:id,diagramPage:Number.isInteger(p.diagramPage)&&p.diagramPage>0?p.diagramPage:p.page,markers:Array.isArray(p.markers)?p.markers:[],codeBoxes:Array.isArray(p.codeBoxes)?p.codeBoxes:[],id:p.id?String(p.id).replace(record.id,id):undefined}));
    if(blocked({document:{...record.document,id}}))continue;
    if(!await store('get',id))prepared.push({id,kind:'pdf',blob:new Blob([bytes],{type:'application/pdf'}),document:{...record.document,id},products,importerVersion:2});
  }
  const photos=new Map();
  for(const record of pack.records.filter(r=>r.kind==='photo')){
    if(!entries[record.file]||!entries[record.thumbnailFile])throw Error('Backup photo or thumbnail missing. No restored files were saved.');
    const digest=await crypto.subtle.digest('SHA-256',entries[record.file]),id='photo-'+[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');if(!await store('get',id))prepared.push({...record,id,blob:new Blob([entries[record.file]],{type:'image/jpeg'}),thumbnail:new Blob([entries[record.thumbnailFile]],{type:'image/jpeg'})});photos.set('local-photo:'+record.id,'local-photo:'+id);photos.set('local-thumb:'+record.id,'local-thumb:'+id);
  }
  for(const [name,bytes] of Object.entries(entries))if(/^photos\/[a-zA-Z0-9_-]+\.jpg$/.test(name)&&!name.endsWith('-thumb.jpg')){
    const filename=name.split('/').at(-1),id='photo-'+filename.slice(0,-4);if(!await store('get',id))prepared.push({id,kind:'photo',blob:new Blob([bytes],{type:'image/jpeg'}),thumbnail:new Blob([entries[name.replace('.jpg','-thumb.jpg')]||bytes],{type:'image/jpeg'})});photos.set(filename,'local-photo:'+id);photos.set(filename.replace('.jpg','-thumb.jpg'),'local-thumb:'+id);
  }
  const reference=value=>{if(!value)return '';return photos.get(value)||photos.get(String(value).split('/').at(-1))||(/^local-(photo|thumb):/.test(value)?value:'');};
  const events=pack.state.events.filter(e=>e&&typeof e.id==='string'&&typeof e.kind==='string').map(e=>({...e,doc:mapping.get(e.doc)||e.doc,...(e.photo?{photo:reference(e.photo)}:{}),...(e.thumbnail?{thumbnail:reference(e.thumbnail)}:{}),...(e.labelPhoto?{labelPhoto:reference(e.labelPhoto)}:{})}));
  // Files and replayable state commit together. localStorage is a separate store;
  // keep this journal until that merge succeeds, including across app closure.
  prepared.push({id:'restore-'+crypto.randomUUID(),kind:'workspace-recovery',state:{...pack.state,events}});
  await storeBatch(prepared.filter(record=>record.kind!=='pdf'||!blocked(record)));
  try{await recoverWorkspace();}catch{throw Error('Restored files and history are retained for recovery. Free storage, then retry import or reopen the app.');}
  status('Workspace restored locally. Existing history was kept.');
}
const blocked=record=>window.BundlePlans?.available()&&!BundlePlans.enabled()&&BundlePlans.isKnown(record.document||{id:record.id});
async function removeBundledPlans(){window.LocalPlatform?.clearPlanCache?.();for(const record of await store('all'))if(record.kind==='pdf'&&window.BundlePlans?.isKnown(record.document||{id:record.id}))await store('delete',record.id);}
async function catalogue(){const records=(await store('all')).filter(r=>!blocked(r));return {documents:records.filter(r=>r.kind==='pdf').map(r=>r.document),products:records.filter(r=>r.kind==='pdf').flatMap(r=>r.products)};}
async function importPDF(blob,name){
 if(blob.size>100*1024*1024)throw Error('PDF exceeds 100 MB; split it before importing.');
 const bytes=new Uint8Array(await blob.arrayBuffer());const digest=await crypto.subtle.digest('SHA-256',bytes);const id='i'+[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('').slice(0,24);
 if(blocked({document:{id}}))throw Error('Kingston plans remain disabled. Re-enable them in Settings before importing.');
 const existing=await store('get',id);if(existing?.importerVersion===3){status(name+' is already imported.');return;}
 const loading=pdfjs.getDocument({data:bytes,isEvalSupported:false}),pdf=await loading.promise,products=[],pageCount=pdf.numPages;
 try{for(let page=1;page<=pageCount;page++){
   status('Importing '+name+' · page '+page+'/'+pdf.numPages);const source=await pdf.getPage(page),viewport=source.getViewport({scale:1}),content=await source.getTextContent();
   const items=pageItems(content,viewport);
   const pictures=pictureBounds(await source.getOperatorList(),viewport);const found=window.ImportCore.extract(items,id,page);found.forEach(p=>{p.title=p.title||name.replace(/\.pdf$/i,'');p.images=pictures;});products.push(...found);source.cleanup();
 }}finally{await loading.destroy();}
 if(blocked({document:{id}}))throw Error('Kingston plan import cancelled by your saved preference.');
 const document={id,name,pages:pageCount,added:existing?.document.added||new Date().toISOString().slice(0,10),sourceUpdated:null};await store('put',{id,kind:'pdf',blob,document,products,importerVersion:3});status(name+': '+products.length+' barcode placements saved locally.'+(products.length?'':' This may need OCR; image-only plans are not indexed yet.'));
}
async function importFiles(files){await recoverWorkspace();for(const file of files){
  if(/\.zip$/i.test(file.name)){
    if(file.size>200*1024*1024)throw Error('ZIP exceeds 200 MB. Import PDFs individually.');
    const bytes=new Uint8Array(await file.arrayBuffer());let expanded=0;
    const entries=unzipSync(bytes,{filter:entry=>{if(entry.originalSize>100*1024*1024)throw Error('An archive entry exceeds 100 MB.');expanded+=entry.originalSize;if(expanded>350*1024*1024)throw Error('Expanded archive exceeds 350 MB.');return /\.(?:pdf|json|jpg)$/i.test(entry.name)&&!entry.name.includes('..');}});
    if(entries['workspace.json']||entries['observations.json'])await restoreWorkspace(entries);
    else for(const [name,data] of Object.entries(entries))if(/\.pdf$/i.test(name))await importPDF(new Blob([data],{type:'application/pdf'}),name.split('/').at(-1));
  }else if(/\.pdf$/i.test(file.name))await importPDF(file,file.name);
}await window.onLocalCatalogue?.(await catalogue());}
const planCache=new PlanCache({
 allowed:id=>!blocked({id}),
 load:async id=>{
  let record=await store('get',id);if(blocked(record||{id}))throw Error('Kingston plans are disabled');
  if(!record&&window.BundlePlans?.available()&&BundlePlans.isKnown({id}))record={id,blob:await BundlePlans.pdf(id),products:[],bundled:true};
  if(!record)throw Error('PDF unavailable');
  const loading=pdfjs.getDocument({data:new Uint8Array(await record.blob.arrayBuffer()),isEvalSupported:false});
  try{return {pdf:await loading.promise,loading,record};}catch(error){await loading.destroy();throw error;}
 },
 dispose:document=>document.loading.destroy(),
 draw:async({pdf},number)=>{
  const page=await pdf.getPage(number),original=page.getViewport({scale:1}),viewport=page.getViewport({scale:1800/Math.max(original.width,original.height)});
  const canvas=document.createElement('canvas');canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height);
  try{await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Plan image could not be created');
   return {blob,width:canvas.width,height:canvas.height};
  }finally{canvas.width=canvas.height=0;page.cleanup();}
 }
});
async function render(job){
 const epoch=planCache.epoch;let markers=job.markers||[];
 // Existing catalogue markers need no PDF text extraction. Repair only missing positions.
 if(!markers.length&&job.positions?.some(Boolean))await planCache.withDocument(job.doc,async document=>{
  const {pdf}=document,record=document.record.bundled?document.record:await store('get',job.doc);if(!record||blocked(record))throw Error('Plan unavailable');
  const page=await pdf.getPage(job.page),items=pageItems(await page.getTextContent(),page.getViewport({scale:1}));
  markers=job.positions.flatMap(position=>window.ImportCore.diagramMarkers(items,position));
  if(!record.bundled){
   let changed=false;record.products=record.products.map(p=>{if(p.diagramPage!==job.page||p.markers?.length)return p;const repaired=window.ImportCore.diagramMarkers(items,p.position);if(!repaired.length)return p;changed=true;return {...p,markers:repaired};});
   if(changed){record.markerRepairedPages=[...new Set([...(record.markerRepairedPages||[]),job.page])];planCache.check(job.doc,epoch);
    await store('put',record);if(blocked(record)){await store('delete',record.id);throw Error('Plan rendering cancelled');}
    setTimeout(()=>catalogue().then(data=>window.onLocalCatalogue?.(data)).catch(()=>{}),0);
   }
  }
 });
 const image=await planCache.page(job);planCache.check(job.doc,epoch);
 return {...image,markers,codeBoxes:job.codeBoxes||[],positions:job.positions||[]};
}
function pageItems(content,viewport){
 return content.items.filter(i=>i.str).map(i=>{
  const x=i.transform[4],y=i.transform[5],height=Math.hypot(i.transform[2],i.transform[3]);
  const points=[[x,y],[x+i.width,y],[x,y+height],[x+i.width,y+height]].map(p=>viewport.convertToViewportPoint(...p)),xs=points.map(p=>p[0]/viewport.width),ys=points.map(p=>p[1]/viewport.height);
  return {text:i.str,box:[Math.max(0,Math.min(...xs)),Math.max(0,Math.min(...ys)),Math.min(1,Math.max(...xs)),Math.min(1,Math.max(...ys))]};
 });
}

async function backup(state){const blob=await backupBlob(state),a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='stock-assistant-workspace.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
window.LocalPlatform={recoverWorkspace,removeBundledPlans,catalogue,importFiles,render,clearPlanCache:()=>planCache.clear(),planCacheStats:()=>planCache.stats(),scan:()=>camera(false),scanImage,takePhoto:()=>camera(true),takeLabelPhoto:()=>camera(true,true),stop,photoUrl,compress,backup,backupBlob,nativeBackup,recognizePhoto,cancelOCR};
window.dispatchEvent(new Event('local-platform-ready'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
window.addEventListener('pagehide',()=>stop());

'use strict';
window.ShelfLabels=(()=>{
 let busy=false,active=null;
 const message=text=>{const node=$('shelf-status');if(node)node.textContent=text;else $('status').textContent=text;};
 const scope=()=>typeof currentWorkspace==='function'?currentWorkspace():null;
 const sameScope=draft=>JSON.stringify(draft.workspaceContext)===JSON.stringify(scope());
 function open(){cancelTimer();openModal('<h2>Read shelf labels</h2><p>One photo can record several nearby labels. Processing stays on this device. Use a close view with readable barcodes; a wide shelf photo may miss small or covered labels.</p><div class="actions"><button id="shelf-choose">Choose photo</button><button id="shelf-paste">Paste image</button><button id="shelf-saved">Saved shelf photos</button></div><p id="shelf-status" role="status"></p>');
  $('shelf-choose').onclick=()=>{if(native?.chooseShelfImage)native.chooseShelfImage();else if(native)message('Install the shelf-label update first.');else $('shelf-image-file').click();};
  $('shelf-paste').onclick=async()=>{try{const items=await navigator.clipboard.read();for(const item of items){const type=item.types.find(t=>t.startsWith('image/'));if(type){await read(await item.getType(type));return;}}message('No copied image found. Choose a photo.');}catch{message('Image pasting unavailable here. Choose a photo.');}};
  $('shelf-saved').onclick=async()=>{try{const rows=(await LocalPlatform.shelfDrafts()).filter(sameScope).reverse();openModal('<h2>Saved shelf photos</h2>'+rows.map((d,i)=>`<button data-shelf-draft="${i}">${d.labels.length} labels · ${escapeHTML(date(d.addedAt))} · ${d.status==='saved'?'saved':'review'}</button>`).join('')+(rows.length?'':'<p>No shelf photos saved yet.</p>'));document.querySelectorAll('[data-shelf-draft]').forEach(b=>b.onclick=()=>review(rows[Number(b.dataset.shelfDraft)]));}catch(error){message(error.message);}};
 }
 async function detect(canvas){
  if(native?.readShelfBarcodes){const encoded=canvas.toDataURL('image/jpeg',.95).split(',')[1],result=JSON.parse(native.readShelfBarcodes(encoded));if(result.error)throw Error(result.error);return result.symbols;}
  const reader=await import('./vendor/shelf-reader.mjs');reader.prepareZXingModule({overrides:{locateFile:path=>new URL('vendor/'+path,location.href).href}});
  const image=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height),found=await reader.readBarcodes(image,{tryHarder:true,tryRotate:true,tryInvert:true,maxNumberOfSymbols:64,minLineCount:2,formats:['EAN13','UPCA','EAN8','Code128','QRCode']});
  return found.filter(r=>r.isValid!==false&&r.text).map(r=>{const p=r.position,points=[p.topLeft,p.topRight,p.bottomLeft,p.bottomRight];return {text:r.text,format:r.format,box:[Math.max(0,Math.min(...points.map(q=>q.x)))/canvas.width,Math.max(0,Math.min(...points.map(q=>q.y)))/canvas.height,Math.min(canvas.width,Math.max(...points.map(q=>q.x)))/canvas.width,Math.min(canvas.height,Math.max(...points.map(q=>q.y)))/canvas.height]};});
 }
 async function read(blob){
  if(busy){message('A shelf photo is already being read.');return;}busy=true;const reviewOwner=$('shelf-status');let image,draft,originalScope;
  try{originalScope=scope();if(!window.LocalPlatform)throw Error('Image tools are loading.');if(blob.size>20*1024*1024)throw Error('Choose an image smaller than 20 MB.');cancelTimer();message('Saving shelf photo locally…');
   image=await createImageBitmap(blob,{imageOrientation:'from-image'});if(image.width*image.height>50000000)throw Error('Choose a photo smaller than 50 megapixels.');const factor=Math.min(1,2400/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*factor);canvas.height=Math.round(image.height*factor);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();image=null;
   const normalized=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!normalized)throw Error('Photo could not be prepared.');const saved=await LocalPlatform.saveShelfPhoto(normalized,originalScope,blob.size);draft={...saved.draft,photo:saved.photo,thumbnail:saved.thumbnail};active=draft;
   message('Reading all visible barcodes…');try{draft.symbols=await detect(canvas);}catch(error){draft.symbols=[];draft.warning=error.message+'; trying printed numbers.';}draft.labels=ShelfCore.symbols(draft.symbols);
   if(draft.labels.length<64){
    message('Reading printed barcode numbers where bars are too small…');
    try{const result=await LocalPlatform.recognizePhoto(normalized,'labels');draft.symbols.push(...ShelfCore.printed(result.lines,result.width,result.height));draft.labels=ShelfCore.symbols(draft.symbols);draft.warning=[draft.warning,result.warning].filter(Boolean).join(' ');}catch(error){draft.warning=[draft.warning,error.message].filter(Boolean).join(' ');}
   }
   draft.status='review';await LocalPlatform.saveShelfDraft(draft);
   if(draft.labels.length&&sameScope(draft)&&$('modal').open&&$('shelf-status')===reviewOwner){try{const result=await LocalPlatform.recognizePhoto(normalized,draft.labels);draft.labels=result.rows;draft.warning=[draft.warning,result.warning].filter(Boolean).join(' ');}catch(error){draft.warning=[draft.warning,error.message+'; barcodes and photo are retained.'].filter(Boolean).join(' ');}await LocalPlatform.saveShelfDraft(draft);}
   if(sameScope(draft)&&$('modal').open&&$('shelf-status')===reviewOwner)await review(draft);else $('status').textContent='Shelf photo retained in its original workspace. Use Saved shelf photos to review it.';
  }catch(error){message(error.message||'Photo reading failed. Saved evidence is retained.');}
  finally{image?.close();busy=false;$('shelf-image-file').value='';}
 }
 async function review(draft){
  if(!sameScope(draft)){message('Return to the original workspace to review this photo.');return;}active=draft;cancelTimer();const known=ProductCore.records(visibleEvents()),committed=visibleEvents().find(e=>e.id===(draft.batchId||draft.id)&&e.kind==='shelf-photo'),alreadySaved=!!committed;if(committed)draft={...draft,labels:committed.labels};
  const photo=await LocalPlatform.photoUrl(draft.photo||'local-photo:'+draft.id);
  openModal(`<h2>${draft.labels.length} labels from one photo</h2><p>Check every code, name and price before saving. Printed numbers are read by OCR and can be wrong even with a valid checksum. These describe the photo, not current stock or a confirmed shelf. QR payloads are retained as source data; they are not guessed as product barcodes.</p><img class="location-photo" src="${escapeHTML(photo)}" alt="Shelf photo used to read nearby labels"><p id="shelf-status" role="status">${escapeHTML(draft.warning||'')}</p><div id="shelf-rows">${draft.labels.map((l,i)=>{const old=alreadySaved?null:known.find(p=>StockCore.canonical(p.barcode)===StockCore.canonical(l.barcode)),disabled=alreadySaved?' disabled':'';return `<article class="card"><label><input type="checkbox" data-shelf-select="${i}" checked${disabled}> Save this label</label><label for="shelf-code-${i}">Barcode · ${l.barcodeSource==='printed-text'?'printed number; check carefully':l.barcodeSource?.startsWith('manual')?'manually entered':'decoded symbol'}</label><input id="shelf-code-${i}" inputmode="numeric" maxlength="13" value="${escapeHTML(l.barcode)}"${disabled}><label for="shelf-name-${i}">Name</label><input id="shelf-name-${i}" maxlength="500" value="${escapeHTML(old?.name||l.name||'')}"${disabled}><label for="shelf-price-${i}">Label price (optional)</label><input id="shelf-price-${i}" inputmode="decimal" maxlength="20" value="${escapeHTML(old?.price||l.price||'')}"${disabled}><details><summary>Extracted text</summary><p>${escapeHTML(l.rawText||'No reliable text read; the barcode is retained.')}</p></details></article>`;}).join('')}</div>${alreadySaved?'<p>Already saved. Search an item to edit its details.</p>':draft.labels.length?'<button id="shelf-save" class="primary">Save selected labels locally</button>':'<p>No readable product barcode found. The photo is retained. Try a closer image with complete labels.</p>'}<button id="shelf-new">Read another photo</button>`);
  $('shelf-new').onclick=open;
  if(!alreadySaved){const add=document.createElement('button');add.textContent='Add a missed label';add.onclick=()=>{
   if(draft.labels.length>=64){message('This photo already has 64 labels. Use another photo.');return;}
   for(const [i,l] of draft.labels.entries()){l.barcode=$('shelf-code-'+i).value.trim();l.name=$('shelf-name-'+i).value.trim();l.price=$('shelf-price-'+i).value.trim();}
   message('Tap the missed label in the photo, then enter its barcode and name.');const img=$('modal-content').querySelector('img');img.onclick=async e=>{
    img.onclick=null;img.onkeydown=null;const r=img.getBoundingClientRect(),scale=Math.min(r.width/img.naturalWidth,r.height/img.naturalHeight),w=img.naturalWidth*scale,h=img.naturalHeight*scale,x=Math.max(0,Math.min(.99,(e.clientX-r.left-(r.width-w)/2)/w)),y=Math.max(0,Math.min(.99,(e.clientY-r.top-(r.height-h)/2)/h));
    draft.labels.push({barcode:'',name:'',price:'',barcodeSource:'manual-position',box:[x,y,Math.min(1,x+.01),Math.min(1,y+.01)]});
    try{await LocalPlatform.saveShelfDraft(draft);await review(draft);}catch(error){message(error.message);}
   };img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','Mark a missed label. Tap its position, or press Enter to use an approximate image-centre position.');img.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();const r=img.getBoundingClientRect();img.onclick({clientX:r.left+r.width/2,clientY:r.top+r.height/2});}};img.focus();
  };$('shelf-new').before(add);}
  if($('shelf-save'))$('shelf-save').onclick=async()=>{
   if(!sameScope(draft)){message('Workspace changed. Nothing saved.');return;}const selected=draft.labels.filter((l,i)=>$(`shelf-rows`).querySelector(`[data-shelf-select="${i}"]`).checked).map(l=>{const i=draft.labels.indexOf(l),barcode=$('shelf-code-'+i).value.trim();return {...l,barcode,barcodeSource:barcode===l.barcode?l.barcodeSource:'manual-correction',name:$('shelf-name-'+i).value.trim()||'Product code '+barcode,price:$('shelf-price-'+i).value.trim()};});if(!selected.length){message('Select at least one label.');return;}if(selected.some(l=>!ImportCore.valid(l.barcode))||new Set(selected.map(l=>StockCore.canonical(l.barcode))).size!==selected.length){message('Each selected label needs a different valid 12- or 13-digit barcode.');return;}
   if(!window.saveShelfBatch(draft,selected)){message('Labels have not been saved. Photo and draft are retained; retry after fixing storage.');return;}
   draft.detectedLabels=draft.detectedLabels||draft.labels;draft.labels=selected;draft.status='saved';try{await LocalPlatform.saveShelfDraft(draft);}catch{/* committed history remains authoritative; repeated Save deduplicates IDs */}
   $('modal').close();lookup(selected[0].barcode,false,true);$('status').textContent=selected.length+' labels saved locally with their shared photo and image neighbours.';
  };
 }
 function show(product){
  const latest=visibleEvents().filter(e=>e.kind==='shelf-label'&&StockCore.canonical(e.product)===StockCore.canonical(product.barcode)).at(-1);if(!latest)return;
  const batch=visibleEvents().find(e=>e.kind==='shelf-photo'&&e.id===latest.batchId);if(!batch)return;const peers=ShelfCore.neighbours(batch.labels,product.barcode,batch.width,batch.height),container=$('latest-location');if(!container)return;
  const node=document.createElement('div');node.className='shelf-context';node.innerHTML=`<p class="muted">Same photo: ${peers.map(p=>escapeHTML(p.direction+': '+p.name)).join(' · ')||'No other readable label'} · saved ${escapeHTML(date(latest.at))}</p><details ${product.placements?.length?'':'open'}><summary>Shelf photo and labels</summary><img class="location-photo" data-local-photo="${escapeHTML(latest.photo)}" alt="Saved photo showing ${escapeHTML(latest.productName)} and nearby labels"><p class="muted">Image-relative context. Original capture time and exact shelf position are not verified.</p></details>`;container.append(node);resolvePhotos();
 }
 window.onShelfMessage=message;
 window.onShelfImage=async url=>{try{const response=await fetch(url);if(!response.ok)throw Error('Selected photo unavailable');await read(await response.blob());}catch(error){message(error.message);}finally{native?.shelfImportDone?.(url.split('/').at(-1));}};
 $('shelf-labels').onclick=open;$('shelf-image-file').onchange=e=>{const file=e.target.files?.[0];if(file)void read(file);};
 document.addEventListener('paste',e=>{if(!$('shelf-status'))return;const item=[...(e.clipboardData?.items||[])].find(v=>v.kind==='file'&&v.type.startsWith('image/'));if(item){e.preventDefault();void read(item.getAsFile());}});
 return {open,read,review,show,detect};
})();

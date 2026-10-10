'use strict';
window.ImageTest=(()=>{
  let busy=false;
  function message(value){const node=$('image-test-status');if(node)node.textContent=value;else $('status').textContent=value;}
  function open(){cancelTimer();openModal(`<h2>Scan from image / test</h2><p>Choose a saved barcode photo, or paste a copied image. Processing stays on this device. Test images do not save photos or GPS locations and do not start the camera.</p><div class="actions"><button id="choose-test-image">Choose image</button><button id="paste-test-image">Paste image</button></div><p id="image-test-status" role="status"></p><h3>Try without an item</h3><img class="test-barcode" src="test-barcode.png" alt="Synthetic test barcode 1234567890128. This is a demo item, not a shop product."><button id="sample-image">Test sample image and plan</button><p class="muted">Adds a synthetic blue towel plan locally, then reads this barcode image. You can also save the image to your phone and choose it above.</p><label for="test-name">Or find an item by name</label><form id="test-name-form"><div class="search-row"><input id="test-name" type="search" placeholder="e.g. food flsak blue"><button>Find</button></div></form><p class="muted">Words can be in any order. Small spelling mistakes show similar names for you to choose.</p>`);
    $('choose-test-image').onclick=()=>{if(native)native.chooseScanImage();else $('scan-image-file').click();};
    $('paste-test-image').onclick=async()=>{
      if(native){native.pasteScanImage();return;}
      try{if(!navigator.clipboard?.read)throw Error('Use Choose image, or paste into this window if your browser supports image pasting.');
        const items=await navigator.clipboard.read();for(const item of items){const type=item.types.find(t=>t.startsWith('image/'));if(type){await scan(await item.getType(type));return;}}throw Error('No copied image found. Choose a saved image instead.');
      }catch(error){message(error.message||'Image clipboard access unavailable. Choose a saved image instead.');}
    };
    $('sample-image').onclick=async()=>{if(busy)return;busy=true;message('Opening synthetic plan and reading sample image…');try{if(!window.LocalPlatform)throw Error('Image tools are loading. Try again shortly.');const response=await fetch('demo-plan.pdf');if(!response.ok)throw Error('Sample plan unavailable');await LocalPlatform.importFiles([new File([await response.blob()],'Synthetic demo plan.pdf')]);if(native)native.scanSampleImage();else {const image=await fetch('test-barcode.png');await LocalPlatform.scanImage(await image.blob());}}catch(error){message(error.message);}finally{busy=false;}};
    $('test-name-form').onsubmit=e=>{e.preventDefault();const value=$('test-name').value.trim();if(!value)return;$('modal').close();lookup(value);};
  }
  async function scan(blob){if(busy)return;busy=true;message('Reading barcode from image…');cancelTimer();try{if(!window.LocalPlatform)throw Error('Image tools are loading. Try again shortly.');await LocalPlatform.scanImage(blob);}catch(error){message(error.message);}finally{busy=false;$('scan-image-file').value='';}}
  $('image-test').onclick=open;
  $('scan-image-file').onchange=e=>{const file=e.target.files?.[0];if(file)void scan(file);};
  document.addEventListener('paste',e=>{if(!$('image-test-status'))return;const image=[...(e.clipboardData?.items||[])].find(item=>item.kind==='file'&&item.type.startsWith('image/'));if(image){e.preventDefault();void scan(image.getAsFile());}});
  window.onImageScanMessage=message;
  window.onImageBarcode=code=>{$('modal').close();window.onBarcode(code,'image');$('status').textContent+=' · Image test; no GPS recorded';};
  return {open,scan};
})();

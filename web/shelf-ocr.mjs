// Bounded still-photo OCR. Read printed digits; never repair a checksum by guessing.
export async function shelfText(worker,source,expiry){
 const image=await createImageBitmap(source,{imageOrientation:'from-image'}),lines=[],candidates=[],refinedPrices=new Set(),numbers=[];
 const flatten=data=>(data.blocks||[]).flatMap(b=>b.paragraphs||[]).flatMap(p=>p.lines||[]);
 const mapBox=(b,transform)=>{const points=[[b.x0,b.y0],[b.x1,b.y0],[b.x0,b.y1],[b.x1,b.y1]].map(transform);return {x0:Math.max(0,Math.min(...points.map(p=>p[0]))),y0:Math.max(0,Math.min(...points.map(p=>p[1]))),x1:Math.min(image.width,Math.max(...points.map(p=>p[0]))),y1:Math.min(image.height,Math.max(...points.map(p=>p[1])))};};
 const read=async canvas=>{const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));return (await Promise.race([worker.recognize(blob,{}, {text:true,blocks:true}),expiry])).data;};
 try{
  await worker.setParameters({tessedit_pageseg_mode:11});
  // Overlap so a complete label is not split at a tile boundary. No full-frame
  // background/packaging text is used to assign a product name or price.
  const tw=image.width*.34,th=image.height*.22;
  for(const y of [.312,.468,.624,.156,.78,0])for(const x of [0,.66,.22,.44]){
   await worker.setParameters({tessedit_pageseg_mode:11,tessedit_char_whitelist:''});
   const scale=Math.min(3,1600/tw),canvas=document.createElement('canvas');canvas.width=Math.round(tw*scale);canvas.height=Math.round(th*scale);
   canvas.getContext('2d').drawImage(image,x*image.width,y*image.height,tw,th,0,0,canvas.width,canvas.height);
   window.onShelfMessage?.('Reading small printed numbers…');const data=await read(canvas),transform=([px,py])=>[x*image.width+px/scale,y*image.height+py/scale];
   for(const l of flatten(data)){
    const line={text:l.text,confidence:l.confidence,bbox:mapBox(l.bbox,transform),words:(l.words||[]).map(w=>({text:w.text,confidence:w.confidence,bbox:mapBox(w.bbox,transform)}))};lines.push(line);
    for(const word of line.words)if(/\d{4,}/.test(word.text)&&word.bbox.y1-word.bbox.y0<image.height*.07){
     const b=word.bbox,cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2;
     if(!candidates.some(c=>Math.abs(c.cx-cx)<20&&Math.abs(c.cy-cy)<15))candidates.push({word,cx,cy});
    }
    for(const word of line.words)if(/[£$€]\s*\d/.test(word.text)){
     const b=word.bbox,cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2;
     if(!candidates.some(c=>c.price&&Math.abs(c.cx-cx)<30&&Math.abs(c.cy-cy)<20))candidates.push({word,cx,cy,price:true});
    }
   }
   // Resolve a visible label before spending the deadline on other parts of the
   // fixture. This retains useful codes even on a slow/memory-pressured device.
   for(const candidate of candidates.filter(c=>c.price&&!refinedPrices.has(c)).slice(0,16-refinedPrices.size)){refinedPrices.add(candidate);await refine(candidate.word,true);}
   const pending=[];
   for(const line of lines)for(const word of line.words)if(/\d{4,}/.test(word.text)&&!ImportCore.valid(word.text.trim())){
    const b=word.bbox,cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2;
    if(!numbers.some(c=>Math.abs(c.cx-cx)<20&&Math.abs(c.cy-cy)<15)&&numbers.length<24){numbers.push({word,cx,cy});pending.push(word);}
   }
   for(const word of pending)await refine(word,false);
  }
  // Tesseract's sparse pass often sees a partial number on a slightly angled
  // label. Re-read those pixels as one numeric line at three bounded angles.
  async function refine(word,price){
   const b=word.bbox,count=(word.text.match(/\d/g)||[]).length,w=Math.min(image.width*.2,Math.max(100,(b.x1-b.x0)*13/count)),h=Math.max(30,(b.y1-b.y0)*2.5);
   const left=Math.max(0,price?b.x0-60:b.x0-w*.4),top=Math.max(0,price?b.y0-105:(b.y0+b.y1-h)/2),cw=Math.min(image.width-left,price?270:(b.x1-b.x0)+w*1.2),ch=Math.min(image.height-top,price?85:h),scale=Math.min(5,1200/cw);
   await worker.setParameters({tessedit_pageseg_mode:price?11:7,tessedit_char_whitelist:'0123456789'});
   for(const angle of [0,4,-4]){
    const canvas=document.createElement('canvas');canvas.width=Math.round(cw*scale);canvas.height=Math.round(ch*scale);const ctx=canvas.getContext('2d'),r=angle*Math.PI/180;
    ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(r);ctx.drawImage(image,left,top,cw,ch,-canvas.width/2,-canvas.height/2,canvas.width,canvas.height);
    const data=await read(canvas),transform=([px,py])=>{const dx=px-canvas.width/2,dy=py-canvas.height/2;return [left+cw/2+(dx*Math.cos(r)+dy*Math.sin(r))/scale,top+ch/2+(-dx*Math.sin(r)+dy*Math.cos(r))/scale];};
    for(const l of flatten(data))lines.push({text:l.text,confidence:l.confidence,bbox:mapBox(l.bbox,transform),words:(l.words||[]).map(w=>({text:w.text,confidence:w.confidence,bbox:mapBox(w.bbox,transform)}))});
    if(ShelfCore.printed(flatten(data),canvas.width,canvas.height).length)break;
   }
  }
  return {text:lines.map(l=>l.text).join('\n'),lines,width:image.width,height:image.height};
 }catch(error){if(!lines.length)throw error;return {lines,width:image.width,height:image.height,warning:error.message+'; partial results retained.'};
 }finally{image.close();}
}

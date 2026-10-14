(function(root){
 'use strict';
 function symbols(found){
  const result=[];
  for(const value of [...(found||[])].sort((a,b)=>(a.box?.[1]??1)-(b.box?.[1]??1))){
   const text=String(value.text||''),b=value.box;
   if(!Array.isArray(b)||b.length!==4||!b.every(v=>Number.isFinite(v)&&v>=0&&v<=1)||b[2]<=b[0]||b[3]<b[1])continue;
   if(!root.ImportCore.valid(text))continue; // QR URLs and OCR digits are evidence, not GTIN mappings.
   if(result.some(r=>root.StockCore.canonical(r.barcode)===root.StockCore.canonical(text)))continue;
   result.push({barcode:text,box:b.slice(),format:String(value.format||'').slice(0,40),barcodeSource:value.source||'decoded',confidence:value.confidence??null});
  }
  return result.sort((a,b)=>a.box[1]-b.box[1]||a.box[0]-b.box[0]).slice(0,64);
 }
 function crop(label,all,width,height){
  const b=label.box,w=Math.max(b[2]-b[0],.025),h=Math.max(b[3]-b[1],8/height),cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;
  let left=Math.max(0,b[0]-w*(label.barcodeSource==='printed-text'?1.5:.4)),right=Math.min(1,b[0]+w*(label.barcodeSource==='printed-text'?1.6:3.2)),top=Math.max(0,b[1]-h*1.5),bottom=Math.min(1,b[3]+h*6);
  for(const other of all){if(other===label)continue;const q=other.box,x=(q[0]+q[2])/2,y=(q[1]+q[3])/2;
   if(Math.abs(y-cy)<Math.max(h*5,.04)){if(x<cx)left=Math.max(left,(x+cx)/2);else right=Math.min(right,(x+cx)/2);}
   if(Math.abs(x-cx)<w*2){if(y<cy)top=Math.max(top,(y+cy)/2);else bottom=Math.min(bottom,(y+cy)/2);}
  }
  return [left,top,Math.min(1,Math.max(right,b[2])),Math.min(1,Math.max(bottom,b[3]+1/height))];
 }
 function details(text,barcode){
  const rawText=String(text||'').slice(0,6000),lines=rawText.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
  const name=lines.find(v=>/[A-Za-z]{3}/.test(v)&&!/(scan to shop|dunelm\.com|more stock|barcode|coming soon)/i.test(v)&&!/^\s*[£$€]\s*\d/.test(v)&&!/^\d{1,2}[/.]\d{1,2}/.test(v))||'';
  const prices=[...rawText.matchAll(/([£$€])\s*(\d+(?:[.,]\d{2})?)(?!\d)/g)];
  return {barcode,name:name.slice(0,500),price:prices.length===1?prices[0][2].replace(',','.'):'',currency:prices.length===1?prices[0][1]:'',rawText,description:lines.filter(v=>v!==name).join(' ').slice(0,2000)};
 }
 function neighbours(labels,barcode,width=1,height=1){
  const target=labels.find(l=>root.StockCore.canonical(l.barcode)===root.StockCore.canonical(barcode));if(!target)return [];
  const cx=(target.box[0]+target.box[2])/2,cy=(target.box[1]+target.box[3])/2;
  return labels.filter(l=>l!==target).map(l=>{const dx=((l.box[0]+l.box[2])/2-cx)*width,dy=((l.box[1]+l.box[3])/2-cy)*height;return {barcode:l.barcode,name:l.name||l.barcode,distance:dx*dx+dy*dy,direction:Math.abs(dx)>Math.abs(dy)?dx<0?'image left':'image right':dy<0?'image above':'image below'};}).sort((a,b)=>a.distance-b.distance).slice(0,2);
 }
 function printed(lines,width,height){
  const found=[];
  for(const line of lines||[])for(const part of [...(line.words||[]),line]){
   const code=String(part.text||'').trim().replace(/[\s-]/g,'');if(!root.ImportCore.valid(code)||!part.bbox)continue;
   const b=part.bbox;found.push({text:code,source:'printed-text',format:'OCR GTIN',confidence:part.confidence??null,box:[Math.max(0,b.x0)/width,Math.max(0,b.y0)/height,Math.min(width,b.x1)/width,Math.min(height,b.y1)/height]});
  }return found;
 }
 const api={symbols,printed,crop,details,neighbours};
 if(typeof module!=='undefined'){root.ImportCore=require('./import-core.js');root.StockCore=require('./core.js');module.exports=api;}root.ShelfCore=api;
})(typeof window!=='undefined'?window:globalThis);

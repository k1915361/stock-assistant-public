(function(root){
 'use strict';
 function valid(code){if(!/^\d{12,13}$/.test(code))return false;let sum=0;for(let i=code.length-2,weight=3;i>=0;i--,weight=weight===3?1:3)sum+=Number(code[i])*weight;return (10-sum%10)%10===Number(code.at(-1));}
 function extract(items,doc,page){
   const text=items.map(i=>i.text).join(' '),products=[];
   const fixture=(text.match(/\b(?:DEMO|CUS|CSP|DIN|BAT|BED|STO|UTI|TIL)\s*\d+(?:-\d+)?\b/i)||[])[0]||'';
   const bay=(text.match(/\bBay\s+\d+\s+of\s+\d+/i)||[])[0]||'';
   for(const item of items){
     const codes=item.text.match(/(?<!\d)\d{12,13}(?!\d)/g)||[];
     for(const barcode of codes.filter(valid)){
       if(!/^(?:(?:EAN(?:-?13)?|UPC(?:-?A)?|Barcode)[:\s]*)?\d{12,13}$/i.test(item.text.trim()))continue;
       const cy=(item.box[1]+item.box[3])/2;
       const row=items.filter(i=>Math.abs((i.box[1]+i.box[3])/2-cy)<.007).sort((a,b)=>a.box[0]-b.box[0]);
       const position=(row.find(i=>/^\d{1,3}$/.test(i.text.trim())&&i.box[0]<item.box[0])||{}).text||'';
       const name=row.filter(i=>i!==item&&!/^\d+$/.test(i.text.trim())&&!/^[£\d.,]+$/.test(i.text.trim())).map(i=>i.text).join(' ').trim()||'Product '+barcode;
       const markers=position?items.filter(i=>i.text.trim()===position&&i.box[0]<.55&&i.box[1]<.82&&Math.abs((i.box[1]+i.box[3])/2-cy)>.01).map(i=>i.box):[];
       products.push({barcode,name,doc,page,diagramPage:page,position,fixture,bay,title:doc,printed:'',codeBoxes:[item.box],markers});
     }
   }
   return products;
 }
 const api={valid,extract};if(typeof module!=='undefined')module.exports=api;root.ImportCore=api;
})(typeof window!=='undefined'?window:globalThis);

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
       const name=row.filter(i=>i!==item&&i.box[0]<item.box[0]&&!/^\d+$/.test(i.text.trim())&&!/^[£\d.,]+$/.test(i.text.trim())).map(i=>i.text).join(' ').trim()||'Product '+barcode;
       const markers=position?items.filter(i=>i.text.trim()===position&&i.box[0]<.55&&i.box[1]<.82&&Math.abs((i.box[1]+i.box[3])/2-cy)>.01).map(i=>i.box):[];
       const extra=row.filter(i=>i.box[0]>item.box[2]).map(i=>i.text).join(' '),details=extra.match(/^(.*?)\s+(\d+)$/);
       products.push({barcode,name,doc,page,diagramPage:page,position,fixture,bay,...metadata(items),printed:'',rowText:row.map(i=>i.text).join(' '),status:details?details[1]:extra,fill:details?details[2]:'',codeBoxes:[item.box],markers});
     }
   }
   return products;
 }
 function metadata(items){
   const headings=items.filter(i=>i.box[1]<.12||i.box[1]>.9).sort((a,b)=>a.box[1]-b.box[1]||a.box[0]-b.box[0]).map(i=>i.text.trim()).filter(t=>t&&!/^(?:No|Description|Barcode|Status|Fill|Page\s+\d+|Bay\s+\d+\s+of\s+\d+|[A-Z]{2,5}\s*\d+(?:-\d+)?)$/i.test(t));
   const title=headings.join(' · '),match=title.match(/\b(Autumn|Winter|Spring|Summer|Halloween|Christmas)\s+(\d{2,4})\b/i);
   return {title,heading:title.replace(/\b(Autumn|Winter|Spring|Summer|Halloween|Christmas)\s+\d{2,4}\b/i,'').replace(/^\s*[·\s]+|[·\s]+$/g,''),season:match?match[1]+' '+(match[2].length===2?'20'+match[2]:match[2]):''};
 }
 const api={valid,extract,metadata};if(typeof module!=='undefined')module.exports=api;root.ImportCore=api;
})(typeof window!=='undefined'?window:globalThis);

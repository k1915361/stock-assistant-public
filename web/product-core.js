(function(root){
 'use strict';
 function extract(text,barcode=''){
   const rawText=String(text).slice(0,30000),lines=rawText.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
   const codes=(rawText.match(/(?<!\d)\d{12,13}(?!\d)/g)||[]).filter(code=>root.ImportCore.valid(code));
   const price=(rawText.match(/([£$€])\s*(\d+(?:[.,]\d{2})?)/)||[]);
   const name=lines.find(line=>!/^\d+$/.test(line)&&!/^\s*[£$€]\s*\d/.test(line)&&!/^scan\s+to\s+shop/i.test(line)&&!/^barcode\b/i.test(line))||'';
   return {barcode:barcode||codes[0]||'',name,price:price[2]?.replace(',','.')||'',currency:price[1]||'',description:lines.filter(l=>l!==name).join(' '),rawText};
 }
 function records(events){const map=new Map();for(const e of events||[])if(e.kind==='product'&&e.barcode&&e.name)map.set(root.StockCore.canonical(e.barcode),{...e,manual:true});return [...map.values()];}
 function merge(existing,incoming){const ids=new Set((existing||[]).map(e=>e.id));return [...(existing||[]),...(incoming||[]).filter(e=>e&&typeof e.id==='string'&&!ids.has(e.id)&&ids.add(e.id))];}
 const api={extract,records,merge};if(typeof module!=='undefined'){root.StockCore=require('./core.js');root.ImportCore=require('./import-core.js');module.exports=api;}root.ProductCore=api;
})(typeof window!=='undefined'?window:globalThis);

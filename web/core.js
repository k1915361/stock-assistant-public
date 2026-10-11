(function (root) {
  'use strict';
  function canonical(value) {
    const trimmed=String(value).trim(),code=/^[\d\s-]+$/.test(trimmed)?trimmed.replace(/[\s-]/g,''):trimmed;
    return /^0\d{12}$/.test(code) ? code.slice(1) : code;
  }
  function tokens(value) {
    return String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  }
  function wordDistance(a,b) {
    const rows=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
    for(let i=0;i<=a.length;i++)rows[i][0]=i;for(let j=0;j<=b.length;j++)rows[0][j]=j;
    for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
      rows[i][j]=Math.min(rows[i-1][j]+1,rows[i][j-1]+1,rows[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
      if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])rows[i][j]=Math.min(rows[i][j],rows[i-2][j-2]+1);
    }return rows[a.length][b.length];
  }
  function searchDetailed(products,query) {
    const exact=searchExact(products,query);if(exact.length)return {matches:exact,similar:false};
    const trimmed=String(query).trim(),wanted=tokens(trimmed);
    // Never guess a barcode, URL identity, short word, size or capacity.
    if(!wanted.length||/^https?:/i.test(trimmed)||/^[\d\s-]+$/.test(trimmed)||wanted.length>12||wanted.some(t=>t.length>40))return {matches:[],similar:false};
    const ranked=[];
    for(const product of products){
      const words=tokens(product.name+' '+(product.aliases||''));let score=0,changed=false;
      for(const term of wanted){
        let best=Infinity;
        for(const word of words){
          if(term===word){best=0;break;}
          if(term.length>=3&&word.startsWith(term)){best=Math.min(best,.2);continue;}
          if(term.length<4||/\d/.test(term)||/\d/.test(word)||word.length>40)continue;
          const limit=term.length>=8?2:1;if(Math.abs(term.length-word.length)>limit)continue;
          const distance=wordDistance(term,word);if(distance<=limit)best=Math.min(best,distance);
        }
        if(!Number.isFinite(best)){score=Infinity;break;}score+=best;changed ||= best>0;
      }
      if(Number.isFinite(score)&&changed)ranked.push({product,score});
    }
    ranked.sort((a,b)=>a.score-b.score||String(a.product.name).localeCompare(String(b.product.name)));
    return {matches:ranked.map(r=>r.product),similar:ranked.length>0};
  }
  function search(products,query){return searchDetailed(products,query).matches;}
  function searchExact(products, query) {
    const trimmed = String(query).trim();
    if (!trimmed) return [];
    const code = canonical(trimmed);
    const exact=products.filter(p=>canonical(p.barcode)===code);if(exact.length)return exact;
    if (/^\d{12,13}$/.test(code)) return products.filter(p => canonical(p.barcode) === code);
    // A URL is a reference, not a product-code mapping. Only a standalone GTIN
    // in its text can be matched; retailer product IDs must never become GTINs.
    if (/^https?:\/\//i.test(trimmed)) {
      const codes = trimmed.match(/(?<!\d)\d{12,13}(?!\d)/g) || [];
      return products.filter(p => codes.some(c => canonical(c) === canonical(p.barcode)));
    }
    const wanted = tokens(trimmed);
    return products.filter(p => {
      const haystack = tokens(p.name + ' ' + (p.aliases || '')+' '+(p.description||'')+' '+(p.rawText||'')).join(' ');
      return wanted.every(t => haystack.includes(t));
    });
  }
  function group(matches) {
    const groups = new Map();
    for (const match of matches) {
      const key = canonical(match.barcode);
      if (!groups.has(key)) groups.set(key, {barcode: match.barcode, name: match.name,price:match.price,currency:match.currency,description:match.description,rawText:match.rawText,placements: []});
      if(match.doc)groups.get(key).placements.push(match);
    }
    return [...groups.values()];
  }
  function appendEvent(state, event) {
    const next = {...state, events: [...(state.events || [])]};
    if (!next.events.some(e => e.id === event.id)) next.events.push({...event});
    return next;
  }
  function markFor(state, doc) {
    const events = (state.events || []).filter(e => e.kind === 'plan-mark' && e.doc === doc);
    return events.length ? events[events.length - 1].mark : 'unverified';
  }
  const api = {canonical, tokens, search, searchDetailed, group, appendEvent, markFor};
  if (typeof module !== 'undefined') module.exports = api;
  root.StockCore = api;
})(typeof window !== 'undefined' ? window : globalThis);

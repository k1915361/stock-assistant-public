(function (root) {
  'use strict';
  function canonical(value) {
    const trimmed=String(value).trim(),code=/^[\d\s-]+$/.test(trimmed)?trimmed.replace(/[\s-]/g,''):trimmed;
    return /^0\d{12}$/.test(code) ? code.slice(1) : code;
  }
  function tokens(value) {
    return String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  }
  function search(products, query) {
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
  const api = {canonical, tokens, search, group, appendEvent, markFor};
  if (typeof module !== 'undefined') module.exports = api;
  root.StockCore = api;
})(typeof window !== 'undefined' ? window : globalThis);

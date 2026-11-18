// Restore rules: how a backup pack is checked, how its events map to this device, and how restored history joins what the phone holds. No DOM, storage or bridge access.
(function(root){
  'use strict';
  // Browser: the cores are globals, loaded before this file. Node: the tests load them with require.
  const cores=typeof module==='object'&&module.exports?{ProductCore:require('./product-core.js'),RetailerCore:require('./retailer-core.js')}:root;
  const MAX_EVENTS=50000,MAX_RECORDS=5000;
  // Throws the same messages the restore always has. The caller saves nothing when this throws.
  function checkPack(pack){
    if(pack.schema!==1||!pack.state||!Array.isArray(pack.state.events)||pack.state.events.length>MAX_EVENTS||!Array.isArray(pack.records)||pack.records.length>MAX_RECORDS||pack.records.some(r=>!r||typeof r.id!=='string')||pack.state.recent!==undefined&&(!Array.isArray(pack.state.recent)||pack.state.recent.some(q=>typeof q!=='string'))||pack.state.retailerCache!==undefined&&!Array.isArray(pack.state.retailerCache))throw Error('Unsupported or oversized workspace backup.');
    if(new Set(pack.records.map(record=>record.id)).size!==pack.records.length)throw Error('Backup file identities need review. Keep the original ZIP; no restored files were saved.');
  }
  // Keeps only well-formed events. Plan and photo references move to the ids this device gives them; other fields stay as they were.
  function mapEvents(events,mapping,reference){
    return events.filter(e=>e&&typeof e.id==='string'&&typeof e.kind==='string').map(e=>({...e,doc:mapping.get(e.doc)||e.doc,...(e.photo?{photo:reference(e.photo)}:{}),...(e.thumbnail?{thumbnail:reference(e.thumbnail)}:{}),...(e.labelPhoto?{labelPhoto:reference(e.labelPhoto)}:{})}));
  }
  // Existing events and recent searches stay. A restored event joins only when its id is new, so a restore never overwrites history the phone already holds.
  function mergeWorkspace(existing,restored){
    return {...existing,retailerCache:cores.RetailerCore.merge(existing.retailerCache,restored.retailerCache),events:cores.ProductCore.merge(existing.events,restored.events),recent:[...new Set([...existing.recent,...(restored.recent||[])])].slice(0,25)};
  }
  const api={checkPack,mapEvents,mergeWorkspace};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.RestoreCore=api;
})(typeof window==='object'?window:globalThis);

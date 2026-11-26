// @ts-check
// Finds a retailer's official product page from an item name, and lists official search links for a person to open.
// Nothing here touches the network. The Android app downloads the product index (one product path per line, from the
// public sitemaps) and passes it in. Settings come from retailer-config.js, so another retailer needs no change here.
(function(/** @type {any} */ root){
  'use strict';
  const defaults=()=>(root.RetailerConfig||require('./retailer-config.js')).defaults;
  const stripMarks=(/** @type {string} */ text)=>String(text||'').normalize('NFKD').replace(/[̀-ͯ]/g,'');
  const escapeRegExp=(/** @type {string} */ text)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

  // The searchable words of an item name: lower case, accents removed, generic joining words dropped.
  // Short words, numbers and size or pack words are kept. Each one must appear in a product page, or the name is not linked.
  function words(/** @type {string} */ text,cfg=defaults()){
    const stop=new Set(cfg.stopWords);
    return [...new Set(stripMarks(text).toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(word=>word&&!stop.has(word)))];
  }

  // Product paths from the index, such as /product/addis-rectangle-bowl-1000000093. Other lines are ignored.
  function parseIndex(/** @type {string} */ text,cfg=defaults()){
    const pattern=new RegExp('^'+escapeRegExp(cfg.productPath)+'([a-z0-9-]+)-(\\d{6,15})$');
    const entries=[];
    for(const line of String(text||'').split('\n')){
      const path=line.trim(),match=path.match(pattern);
      if(match)entries.push({path,productId:match[2],slug:match[1],slugWords:new Set(match[1].split('-'))});
    }
    return entries;
  }

  // A readable product name from the slug, for display: "addis-rectangle-bowl" becomes "Addis Rectangle Bowl".
  function titleOf(/** @type {any} */ entry){return entry.slug.split('-').filter(Boolean).map((/** @type {string} */ word)=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ');}
  function productOf(/** @type {any} */ entry,cfg=defaults()){return {productId:entry.productId,url:cfg.origin+entry.path,path:entry.path,title:titleOf(entry)};}

  // Every index entry whose slug contains all the item's words. The shortest slugs come first: they are the most specific.
  function candidatesFor(/** @type {string} */ name,/** @type {any[]} */ index,cfg=defaults()){
    const tokens=words(name,cfg);
    if(!tokens.length||!Array.isArray(index))return [];
    return index.filter(entry=>tokens.every(token=>entry.slugWords.has(token)))
      .sort((a,b)=>a.slugWords.size-b.slugWords.size||a.productId.localeCompare(b.productId));
  }

  // The entries that contain at least half of the item's words (rounded up) but not all of them. Most words first.
  // A query word that no product contains lands here, so it is never linked automatically.
  function partialFor(/** @type {string[]} */ tokens,/** @type {any[]} */ index){
    const need=Math.ceil(tokens.length/2);
    return index.map(entry=>({entry,hits:tokens.filter(token=>entry.slugWords.has(token)).length}))
      .filter(row=>row.hits>=need&&row.hits<tokens.length)
      .sort((a,b)=>b.hits-a.hits||a.entry.slugWords.size-b.entry.slugWords.size||a.entry.productId.localeCompare(b.entry.productId))
      .map(row=>row.entry);
  }

  // The slug words the item's name does not mention, joining words aside. A product that says more ("anti-allergy")
  // is a different item from one that says the same words only, so it is never linked by name alone.
  function extraWordsOf(/** @type {any} */ entry,/** @type {string[]} */ tokens,cfg=defaults()){
    const stop=new Set(cfg.stopWords);
    return [...entry.slugWords].filter(word=>word&&!stop.has(word)&&!tokens.includes(word));
  }

  // status: 'matched' (one product has every word and nothing more), 'ambiguous' (several do, listed in candidates),
  // 'partial' (no product is an exact match; the closest are listed for a person to choose, never linked),
  // 'none', 'no-index' or 'no-name'.
  function match(/** @type {string} */ name,/** @type {any[]} */ index,cfg=defaults()){
    if(!Array.isArray(index)||!index.length)return {status:'no-index',candidates:[]};
    const tokens=words(name,cfg);
    if(!tokens.length)return {status:'no-name',candidates:[]};
    const found=candidatesFor(name,index,cfg);
    if(found.length===1&&!extraWordsOf(found[0],tokens,cfg).length){
      const product=productOf(found[0],cfg);
      return {status:'matched',product,candidates:[product],total:1};
    }
    if(found.length>1)return {status:'ambiguous',candidates:found.slice(0,cfg.maxCandidates).map(entry=>productOf(entry,cfg)),total:found.length};
    // Nothing matches exactly, or the one product that has every word also says more than the item does.
    const listed=[...found,...partialFor(tokens,index)];
    if(!listed.length)return {status:'none',candidates:[]};
    return {status:'partial',candidates:listed.slice(0,cfg.maxCandidates).map(entry=>productOf(entry,cfg)),total:listed.length};
  }

  // Official search links, most reliable first. A person opens them; the app never fetches them.
  //   1. the product page, when one product matched exactly
  //   2. a barcode search, which uses the exact code on the item
  //   3. possible product pages, when the name matched several (a person chooses one)
  //   4. a search by product ID, when a product ID is known
  //   5. a search by item name, the least exact
  function fallbackLinks(/** @type {any} */ item,/** @type {any} */ result,cfg=defaults()){
    const barcode=String(item?.barcode||'').replace(/\s+/g,''),name=String(item?.name||'').trim();
    const search=(/** @type {string} */ query)=>cfg.origin+cfg.searchPath+encodeURIComponent(query);
    /** @type {{rank:number,kind:string,label:string,url:string}[]} */ const links=[];
    const add=(/** @type {string} */ kind,/** @type {string} */ label,/** @type {string} */ url)=>links.push({rank:links.length+1,kind,label,url});
    if(result?.status==='matched')add('exact-product','Official product page',result.product.url);
    if(barcode)add('barcode-search','Search by barcode',search(barcode));
    const possible=result?.status==='ambiguous'||result?.status==='partial';
    for(const candidate of possible?result.candidates:[])add('possible-product','Possible match: '+candidate.title,candidate.url);
    const productId=result?.product?.productId||item?.productId||'';
    if(productId)add('product-id-search','Search by product ID',search(productId));
    if(name)add('name-search','Search by item name',search(name));
    return links;
  }

  const api={words,parseIndex,titleOf,productOf,candidatesFor,match,fallbackLinks};
  if(typeof module!=='undefined')module.exports=api;
  root.RetailerLookup=api;
})(typeof window!=='undefined'?window:globalThis);

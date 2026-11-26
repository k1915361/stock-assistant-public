// Finds a retailer's official product page from an item name, and lists official search links for a person to open.
// Nothing here touches the network. The Android app downloads the product index (one product path per line, from the
// public sitemaps) and passes it in. Settings come from retailer-config.js, so another retailer needs no change here.
(function(root){
  'use strict';
  const defaults=()=>(root.RetailerConfig||require('./retailer-config.js')).defaults;
  const stripMarks=text=>String(text||'').normalize('NFKD').replace(/[̀-ͯ]/g,'');
  const escapeRegExp=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

  // The searchable words of an item name: lower case, accents removed, short and stop words dropped.
  function words(text,cfg=defaults()){
    const stop=new Set(cfg.stopWords);
    return [...new Set(stripMarks(text).toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(word=>word.length>=cfg.minWordLength&&/[a-z]/.test(word)&&!stop.has(word)))];
  }

  // Product paths from the index, such as /product/addis-rectangle-bowl-1000000093. Other lines are ignored.
  function parseIndex(text,cfg=defaults()){
    const pattern=new RegExp('^'+escapeRegExp(cfg.productPath)+'([a-z0-9-]+)-(\\d{6,15})$');
    const entries=[];
    for(const line of String(text||'').split('\n')){
      const path=line.trim(),match=path.match(pattern);
      if(match)entries.push({path,productId:match[2],slug:match[1],slugWords:new Set(match[1].split('-'))});
    }
    return entries;
  }

  // A readable product name from the slug, for display: "addis-rectangle-bowl" becomes "Addis Rectangle Bowl".
  function titleOf(entry){return entry.slug.split('-').filter(Boolean).map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ');}
  function productOf(entry,cfg=defaults()){return {productId:entry.productId,url:cfg.origin+entry.path,path:entry.path,title:titleOf(entry)};}

  // Every index entry whose slug contains all the item's words. The shortest slugs come first: they are the most specific.
  function candidatesFor(name,index,cfg=defaults()){
    const tokens=words(name,cfg);
    if(!tokens.length||!Array.isArray(index))return [];
    return index.filter(entry=>tokens.every(token=>entry.slugWords.has(token)))
      .sort((a,b)=>a.slugWords.size-b.slugWords.size||a.productId.localeCompare(b.productId));
  }

  // status: 'matched' (exactly one product), 'ambiguous' (several, listed in candidates), 'none', 'no-index' or 'no-name'.
  function match(name,index,cfg=defaults()){
    if(!Array.isArray(index)||!index.length)return {status:'no-index',candidates:[]};
    if(!words(name,cfg).length)return {status:'no-name',candidates:[]};
    const found=candidatesFor(name,index,cfg);
    if(!found.length)return {status:'none',candidates:[]};
    const candidates=found.slice(0,cfg.maxCandidates).map(entry=>productOf(entry,cfg));
    if(found.length===1)return {status:'matched',product:candidates[0],candidates,total:1};
    return {status:'ambiguous',candidates,total:found.length};
  }

  // Official search links, most reliable first. A person opens them; the app never fetches them.
  //   1. the product page, when one product matched exactly
  //   2. a barcode search, which uses the exact code on the item
  //   3. possible product pages, when the name matched several (a person chooses one)
  //   4. a search by product ID, when a product ID is known
  //   5. a search by item name, the least exact
  function fallbackLinks(item,result,cfg=defaults()){
    const barcode=String(item?.barcode||'').replace(/\s+/g,''),name=String(item?.name||'').trim();
    const search=query=>cfg.origin+cfg.searchPath+encodeURIComponent(query);
    const links=[];
    const add=(kind,label,url)=>links.push({rank:links.length+1,kind,label,url});
    if(result?.status==='matched')add('exact-product','Official product page',result.product.url);
    if(barcode)add('barcode-search','Search by barcode',search(barcode));
    for(const candidate of result?.status==='ambiguous'?result.candidates:[])add('possible-product','Possible match: '+candidate.title,candidate.url);
    const productId=result?.product?.productId||item?.productId||'';
    if(productId)add('product-id-search','Search by product ID',search(productId));
    if(name)add('name-search','Search by item name',search(name));
    return links;
  }

  const api={words,parseIndex,titleOf,productOf,candidatesFor,match,fallbackLinks};
  if(typeof module!=='undefined')module.exports=api;
  root.RetailerLookup=api;
})(typeof window!=='undefined'?window:globalThis);

// Retailer settings: the site, the addresses the lookup uses, the stores it offers, and the words ignored when names are matched.
// To point the app at another retailer, brand, store or distribution centre, add a config here. The lookup (retailer-lookup.js)
// and the item page (retailer-ui.js) read only these fields, so they do not change.
(function(root){
  'use strict';
  const dunelm={
    id:'dunelm',
    label:'Dunelm',
    origin:'https://www.dunelm.com',
    // Product pages are /product/<name-words>-<productId>. The Android app may fetch them after the robots rules allow it.
    productPath:'/product/',
    // Search pages are links for a person to open. robots.txt disallows them to automated clients, so the app never fetches them.
    searchPath:'/search?q=',
    // The public sitemaps list the product pages. The Android app downloads the product sitemaps, which robots.txt allows, and the lookup matches names against them.
    sitemapIndexPath:'/sitemap.xml',
    productSitemapPattern:'^/sitemap/product-\\d+-sitemap\\.xml$',
    indexMaxAgeDays:7,
    defaultStore:{name:'Kingston',id:'0186'},
    stores:[
      {name:'Kingston',id:'0186'},
      {name:'Colliers Wood',id:'0115'},
      {name:'Feltham',id:'0151'},
      {name:'Croydon',id:'0335'},
      {name:'Wandsworth',id:'0189'},
      {name:'Westfield White City',id:'0163'},
    ],
    // Words too common to identify a product. They are dropped from item names before matching.
    stopWords:['and','the','of','with','for','set','pack','size','new','in','a','an','to','by','on','at','from','mini','large','small','medium'],
    minWordLength:3,
    // How many possible pages to list when a name matches more than one.
    maxCandidates:5,
  };
  const api={defaults:dunelm,configs:{dunelm}};
  if(typeof module!=='undefined')module.exports=api;
  root.RetailerConfig=api;
})(typeof window!=='undefined'?window:globalThis);

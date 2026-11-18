'use strict';
// Internal app: addresses, one icon registry and icon hydration. Pure, so tests can load it under Node.
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AppUI=api;})(typeof window!=='undefined'?window:globalThis,()=>{
  // Each route is a page address like Chrome's chrome:// URLs. Screens with
  // screen:true are full-page views handled by their own show/hide code. Pages
  // with restorable:true are rebuilt from their address when Back returns to them.
  const routes=[
    {url:'app:history',title:'History',summary:'Recent searches on this device',restorable:true},
    {url:'app:settings',title:'Settings',summary:'Options, plans, backups and recovery',screen:true},
    {url:'app:whats-new',title:'What’s new',summary:'Recent app updates, available offline',screen:true},
    {url:'app:urls',title:'Internal URLs',summary:'Every app: address and what it opens',restorable:true},
    {url:'app:pins',title:'Bookmarks',summary:'Items you bookmarked for quick access',restorable:true},
    {url:'app:presets',title:'Workflow presets',summary:'Saved scan and photo settings for jobs',restorable:true},
    {url:'app:plans',title:'Stored plans',summary:'Imported PDFs and their search codes',restorable:true},
    {url:'app:restored-data',title:'Restored data',summary:'Backup records waiting for review',restorable:true},
    {url:'app:recovery',title:'Local recovery',summary:'Choose which restored records to keep'},
    {url:'app:shortcuts',title:'Keyboard shortcuts',summary:'Keys for a hardware keyboard',restorable:true},
    {url:'app:label-photos',title:'Saved label photos',summary:'Label photos waiting for item details'},
    {url:'app:item-details',title:'Item details',summary:'Barcode, name, price and label text'},
    {url:'app:read-label',title:'Read label',summary:'Offline reading of a label photo'},
    {url:'app:location-note',title:'Location note',summary:'Where you saw this item'},
    {url:'app:item-history',title:'Item history',summary:'Observations for this item'},
    {url:'app:plan-history',title:'Plan history',summary:'Status and comments for one plan'},
    {url:'app:plan-page',title:'Source plan page',summary:'Full PDF page with highlights'},
    {url:'app:shelf-labels',title:'Shelf labels',summary:'Read several labels from one photo',restorable:true},
    {url:'app:last-seen-map',title:'Last-seen map',summary:'Recorded GPS readings for an item'},
    {url:'app:scan-photo',title:'Scan from image',summary:'Read a saved barcode photo',restorable:true},
    {url:'app:store-prices',title:'Store and prices',summary:'Official store and price lookup'},
    {url:'app:account',title:'Account and membership',summary:'Sign in and paid features',restorable:true}
  ];
  const icons={
    search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
    home:'<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-6h4v6"/>',
    camera:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    label:'<path d="M3 7h12l6 5-6 5H3z"/><circle cx="7" cy="12" r="1"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-8 8"/>',
    note:'<path d="M4 4h16v9l-7 7H4z"/><path d="M14 20v-7h6"/>',
    history:'<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/>',
    map:'<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    store:'<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v11H4z"/><path d="M9 20v-6h6v6"/>',
    pin:'<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/>',
    bookmarks:'<path d="M6 3h12v18l-6-4-6 4z"/>',
    star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2-4.5-4.4 6.2-.9z"/>',
    refresh:'<path d="M20 12a8 8 0 1 1-2.3-5.6L20 9"/><path d="M20 4v5h-5"/>',
    sliders:'<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    forward:'<path d="m15 5 6 6-6 6"/><path d="M21 11H9a5 5 0 0 0 0 10h2"/>',
    location:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    photo:'<path d="M4 7h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="3"/>',
    edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
    page:'<path d="M5 3h11l3 3v15H5zM8 11h8m-8 4h8m-8-8h4"/>',
    comment:'<path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-2 2v-9.5A7.5 7.5 0 0 1 10.5 4H13a7 7 0 0 1 7 7.5Z"/><path d="M8 11h7m-7 3h5"/>',
    link:'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    account:'<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
    back:'<path d="M19 12H5M11 6l-6 6 6 6"/>',
    close:'<path d="M6 6l12 12M18 6 6 18"/>',
    paste:'<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h6"/>',
    upload:'<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    warning:'<path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 10v4M12 17h.01"/>',
    check:'<path d="M5 12.5 10 17 19 7"/>',
    trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    download:'<path d="M12 4v11M7 10l5 5 5-5M4 19h16"/>',
    refresh:'<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
    next:'<path d="m9 6 6 6-6 6"/>',
    previous:'<path d="m15 6-6 6 6 6"/>',
  first:'<path d="M6 6v12"/><path d="m17 6-6 6 6 6"/>',
  last:'<path d="M18 6v12"/><path d="m7 6 6 6-6 6"/>',
    copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    archive:'<path d="M3 5h18v4H3zM5 9v11h14V9M10 13h4"/>',
    send:'<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
    up:'<path d="m5 14 7-7 7 7M12 7v13"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    sparkle:'<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/>',
    appearance:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
    barcode:'<path d="M4 5v14m3-14v14m3-14v14m4-14v14m3-14v14m3-14v14"/>',
    capture:'<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10"/>',
    submit:'<path d="M5 12h14M13 6l6 6-6 6"/>',
    more:'<path d="M12 5h.01M12 12h.01M12 19h.01"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.3 1.8c-1.2 1.2-1.9 1.4-1.9 3.2m0 3v.1"/>'
  };
  const resolve=text=>{const url=String(text??'').trim().toLowerCase();return routes.find(route=>route.url===url)||null;};
  // A tone colours the icon's own line through a token (.tone-* in style.css). A tone set on the button wins over the icon's default.
  const tones={trash:'danger',warning:'warning',refresh:'warning',check:'success',submit:'success',link:'primary'};
  const iconMarkup=(name,className='ui-icon',tone=tones[name])=>{const path=icons[name];return path?`<svg class="${className}${tone?' tone-'+tone:''}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`:'';};
  // Adds the registry icon to every button[data-icon] under scope (or scope itself) once. A [data-icon-slot] is replaced by its icon and keeps its class.
  function hydrateIcons(scope){
    if(!scope||typeof scope.querySelectorAll!=='function')return 0;
    const buttons=[...scope.querySelectorAll('button[data-icon]')];
    if(typeof scope.matches==='function'&&scope.matches('button[data-icon]'))buttons.unshift(scope);
    let count=0;
    for(const button of buttons){
      if(button.dataset.iconReady==='true')continue;
      const markup=iconMarkup(button.dataset.icon,'ui-icon',button.dataset.tone);
      if(!markup)continue;
      button.insertAdjacentHTML('afterbegin',markup);button.dataset.iconReady='true';count++;
    }
    for(const slot of scope.querySelectorAll('[data-icon-slot]')){
      const markup=iconMarkup(slot.dataset.iconSlot,slot.className);
      if(markup){slot.outerHTML=markup;count++;}
    }
    return count;
  }
  return {routes,resolve,icons,tones,iconMarkup,hydrateIcons};
});

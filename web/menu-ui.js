'use strict';
// The app menu's markup. Pure, so tests can load it under Node. app.js opens the menu and binds each button's action by id.
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./app-ui.js'):root.AppUI);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.AppMenu=api;
})(typeof window==='object'?window:globalThis,AppUI=>{
  // item adds the rows for the open item, build is the version line and escape is app.js's HTML escaper.
  function markup({item,build,escape}){
    const menuButton=(id,icon,label,className='menu-row')=>{
      const quickAction=className==='menu-tile';
      return `<button type="button" id="${id}" class="${className}" aria-label="${escape(label)}">${AppUI.iconMarkup(icon)}<span${quickAction?' class="menu-tile-label"':''}>${escape(label)}</span></button>`;
    };
    const itemRows=item?`<section class="menu-group"><p class="menu-label">This item</p>${menuButton('quick-product','info','Item details / read label')}${menuButton('quick-photo','image','Photo')}${menuButton('quick-note','note','Location note')}${menuButton('quick-history','history','Item history')}${menuButton('quick-map','map','Last-seen GPS map')}${menuButton('quick-retailer','store','Official price / stock')}</section>`:'';
    return '<h2 class="sr-only">'+(item?'Item menu':'Menu')+'</h2><nav class="menu-tiles menu-history" aria-label="Page controls">'+menuButton('quick-back','back','Back','menu-tile')+menuButton('quick-forward','forward','Forward','menu-tile')+menuButton('quick-refresh','refresh','Refresh','menu-tile')+menuButton('quick-bookmark','star','Bookmark','menu-tile')+'</nav><p id="menu-status" class="menu-status" role="status"></p><nav class="menu-tiles" aria-label="Quick actions">'+menuButton('quick-search','search','Search','menu-tile')+menuButton('quick-image','camera','Scan photo','menu-tile')+menuButton('quick-shelf','label','Shelf labels','menu-tile')+menuButton('quick-recent','clock','History','menu-tile')+'</nav>'+itemRows+'<section class="menu-group"><p class="menu-label">Lists</p>'+menuButton('quick-pins','bookmarks','Bookmarks')+'</section><section class="menu-group"><p class="menu-label">App</p>'+menuButton('quick-urls','link','Internal URLs')+menuButton('quick-whats-new','history','What’s new')+menuButton('settings','sliders','Settings and local backup')+'<p class="menu-version">'+build+'</p></section>';
  }
  return {markup};
});

'use strict';
// The rows the navigation panel draws for the open item and for the Android page controls. Pure, so tests can load it under Node.
// app.js draws these rows each time the panel opens and binds each row's action by id.
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./app-ui.js'):root.AppUI);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.AppMenu=api;
})(typeof window==='object'?window:globalThis,AppUI=>{
  // item adds the rows for the open item. native is true in the Android app, which has no browser buttons, so its panel keeps Back, Forward and Refresh.
  // Stock, Scan, Plans, Bookmarks, history, tools and settings are fixed destinations in index.html, so they are not repeated here.
  function markup({item,escape,native=false}){
    const row=(id,icon,label)=>`<button type="button" id="${id}" class="nav-row" aria-label="${escape(label)}">${AppUI.iconMarkup(icon)}<span>${escape(label)}</span></button>`;
    // Back, Forward and Refresh repeat the browser's own buttons, so only the Android app shows them.
    const pageRows=native?`<section class="nav-group" aria-labelledby="nav-page"><h3 id="nav-page">Page</h3>${row('quick-back','back','Back')}${row('quick-forward','forward','Forward')}${row('quick-refresh','refresh','Refresh')}</section>`:'';
    const itemRows=item?`<section class="nav-group" aria-labelledby="nav-this-item"><h3 id="nav-this-item">This item</h3>${row('quick-product','info','Item details / read label')}${row('quick-photo','image','Photo')}${row('quick-note','note','Location note')}${row('quick-history','history','Item history')}${row('quick-map','map','Last-seen GPS map')}${row('quick-bookmark','star','Bookmark')}</section>`:'';
    return pageRows+itemRows+'<p id="menu-status" class="menu-status" role="status"></p>';
  }
  return {markup};
});

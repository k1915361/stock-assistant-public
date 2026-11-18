(function(root){
  'use strict';
  // Bookmarks are the pinned-lookups list: one entry per item, at most LIMIT. Pure, so tests can load it under Node.
  const LIMIT=20;
  const isBookmarked=(bookmarks,query)=>Array.isArray(bookmarks)&&bookmarks.some(bookmark=>bookmark.query===query);
  // saved is true when the item was added, false when it was removed, and null when the list is full.
  function toggle(bookmarks,{query,name}){
    if(isBookmarked(bookmarks,query))return {bookmarks:bookmarks.filter(bookmark=>bookmark.query!==query),saved:false};
    if(bookmarks.length>=LIMIT)return {bookmarks,saved:null};
    return {bookmarks:[...bookmarks,{query,name}],saved:true};
  }
  const api={LIMIT,isBookmarked,toggle};if(typeof module==='object'&&module.exports)module.exports=api;root.BookmarkCore=api;
})(typeof window==='object'?window:globalThis);

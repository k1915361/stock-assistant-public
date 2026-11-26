// @ts-check
(function(/** @type {any} */ root){
  'use strict';
  // Bookmarks are the pinned-lookups list: one entry per item, at most LIMIT. Pure, so tests can load it under Node.
  const LIMIT=20;
  const isBookmarked=(/** @type {any[]|null|undefined} */ bookmarks,/** @type {string} */ query)=>Array.isArray(bookmarks)&&bookmarks.some((/** @type {any} */ bookmark)=>bookmark.query===query);
  // saved is true when the item was added, false when it was removed, and null when the list is full.
  function toggle(/** @type {any[]} */ bookmarks,/** @type {{query:string,name?:string}} */ {query,name}){
    if(isBookmarked(bookmarks,query))return {bookmarks:bookmarks.filter((/** @type {any} */ bookmark)=>bookmark.query!==query),saved:false};
    if(bookmarks.length>=LIMIT)return {bookmarks,saved:null};
    return {bookmarks:[...bookmarks,{query,name}],saved:true};
  }
  const api={LIMIT,isBookmarked,toggle};if(typeof module==='object'&&module.exports)module.exports=api;root.BookmarkCore=api;
})(typeof window==='object'?window:globalThis);

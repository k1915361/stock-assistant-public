// @ts-check
(function(/** @type {any} */ root){
  'use strict';
  // The temporary plan pack: the one town whose PDFs ship inside the app, and every message that names it.
  // The storage keys, cache name and bundle id stay in bundled-plans.js and the public build, because saved preferences and offline files depend on them.
  const town='Kingston';
  const text={
    downloadDisabled:`${town} plans are disabled in this browser. Re-enable them in Settings to download again.`,
    importDisabled:`${town} plans remain disabled. Re-enable them in Settings before importing.`,
    importCancelled:`${town} plan import cancelled by your saved preference.`,
    openDisabled:`${town} plans are disabled`,
    searchOff:`${town} plans are switched off by your saved preference. Re-enable them in Settings to search them again.`,
    settingsHeading:`Temporary ${town} plans`,
    enabledHelp:`${town} plans are enabled. Opened PDFs are saved for offline use.`,
    offHelp:`${town} plans are off. This browser will keep them off after updates.`,
    removeAction:`Remove ${town} plans and keep them off`,
    enableAction:`Re-enable ${town} plans`,
    savedCount:(/** @type {number} */ saved,/** @type {number} */ total)=>`${saved} of ${total} ${town} plans saved.`,
    off:`${town} plans are off.`,
    allSaved:`All ${town} plans and item search saved`,
    enabled:`${town} plans enabled.`,
    removed:`${town} plans removed and kept off in this browser. Your photos, notes and other plans are retained.`,
    keptOff:`${town} plans are kept off; removal will be retried when you reopen the app.`,
  };
  const isPackTown=(/** @type {unknown} */ name)=>String(name||'').trim().toLowerCase()===town.toLowerCase();
  const api={town,text,isPackTown};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PlanPack=api;
})(typeof window==='object'?window:globalThis);

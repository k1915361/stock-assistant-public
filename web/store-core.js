// A small store for the workspace state. Pure: no DOM, no bridge, no storage.
// Every change goes through setState, which tells the listeners the new and previous values.
// Reads use getState. A change that leaves the value the same (Object.is) is not announced.
(function(root){
  'use strict';

  /**
   * @template T
   * @param {T} initialState
   * @returns {{
   *   getState: () => T,
   *   setState: (update: T | ((current: T) => T)) => void,
   *   subscribe: (listener: (next: T, previous: T) => void) => () => void
   * }}
   */
  function createStore(initialState){
    let state=initialState;
    /** @type {Set<(next: any, previous: any) => void>} */
    const listeners=new Set();
    return {
      getState:()=>state,
      setState(update){
        const previous=state;
        const next=typeof update==='function'?/** @type {(current: T) => T} */ (update)(previous):/** @type {T} */ (update);
        if(Object.is(next,previous))return;
        state=next;
        for(const listener of [...listeners])listener(next,previous);
      },
      subscribe(listener){
        listeners.add(listener);
        return()=>{listeners.delete(listener);};
      },
    };
  }

  const api={createStore};
  if(typeof module==='object'&&module.exports)module.exports=api;
  /** @type {any} */ (root).StoreCore=api;
})(typeof window==='object'?window:globalThis);

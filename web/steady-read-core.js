// @ts-check
// Steady-read rule for camera scans. A barcode is passed on only once it has been read STEADY_READS times within STEADY_WINDOW_MILLIS, with the reads spread over at least STEADY_SPAN_MILLIS. Same rule as the native app's SteadyRead.kt and CameraScanner.kt. No DOM, storage or camera access.
(function(root){
  'use strict';
  // The numbers come from shared/rules.json through the generated shared-rules.js, so the web and native apps cannot drift apart. Three reads of one code, two seconds at most, first and last at least 0.6 seconds apart. Three frames in a tenth of a second are one look at the label, not three.
  /** @type {{steadyRead: {reads: number, windowMillis: number, spanMillis: number}}} */
  const SHARED=(typeof module==='object'&&module.exports)?require('./shared-rules.js'):/** @type {any} */ (root).SharedRules;
  const STEADY_READS=SHARED.steadyRead.reads,STEADY_WINDOW_MILLIS=SHARED.steadyRead.windowMillis,STEADY_SPAN_MILLIS=SHARED.steadyRead.spanMillis;
  /** @typedef {{code: string, atMillis: number}} Read */
  /** @typedef {{kind: 'waiting', code: string, agreeing: number} | {kind: 'steady', code: string}} Step */
  // Records one read and says whether the code is steady yet. Reads of other codes in between do not reset the count.
  class SteadyRead{
    /** @param {{needed?: number, windowMillis?: number, spanMillis?: number}} [options] */
    constructor({needed=STEADY_READS,windowMillis=STEADY_WINDOW_MILLIS,spanMillis=STEADY_SPAN_MILLIS}={}){
      this.needed=needed;this.windowMillis=windowMillis;this.spanMillis=spanMillis;
      /** @type {Read[]} */
      this.reads=[];
    }
    // Returns {kind:'waiting',code,agreeing} or {kind:'steady',code}. Steady clears the count, so the next read starts again.
    /**
     * @param {string} code
     * @param {number} atMillis
     * @returns {Step}
     */
    offer(code,atMillis){
      this.reads=this.reads.filter(read=>atMillis-read.atMillis<=this.windowMillis);
      this.reads.push({code,atMillis});
      const agreeing=this.reads.filter(read=>read.code===code);
      const spread=atMillis-agreeing[0].atMillis;
      if(agreeing.length<this.needed||spread<this.spanMillis)return {kind:'waiting',code,agreeing:agreeing.length};
      this.reads=[];
      return {kind:'steady',code};
    }
  }
  // The status line for the second and the third read. Null for any other count.
  /**
   * @param {number} agreeing
   * @returns {string | null}
   */
  function attemptMessage(agreeing){
    if(agreeing===2)return 'Attempting scan twice';
    if(agreeing===3)return 'Attempting scan thrice';
    return null;
  }
  // Gives each attempt message once per count: again only when the code changes or the count rises. A steady read starts over.
  class AttemptAnnouncer{
    constructor(){
      /** @type {string | null} */
      this.code=null;
      this.count=0;
    }
    // Takes one step from SteadyRead.offer and returns the message to show, or null.
    /**
     * @param {Step} step
     * @returns {string | null}
     */
    next(step){
      if(step.kind==='steady'){this.code=null;this.count=0;return null;}
      if(step.code!==this.code){this.code=step.code;this.count=0;}
      if(step.agreeing<=this.count)return null;
      this.count=step.agreeing;
      return attemptMessage(step.agreeing);
    }
  }
  // A camera scan that finds no product is scanned again, up to this many scans of that barcode. A different barcode starts the count again, and so does a found product, a typed search or a scan that is not from the camera.
  const SEARCH_MISS_ATTEMPTS=3;
  // True when the camera should open again after a miss. attempts is the number of scans of this barcode so far, including the one that missed.
  /**
   * @param {number} attempts
   * @returns {boolean}
   */
  function retryAfterMiss(attempts){return attempts<SEARCH_MISS_ATTEMPTS;}
  // The miss count after one more camera miss of code. State is {code,count}; a different barcode starts again at one.
  /**
   * @param {{code: string | null, count: number} | null | undefined} state
   * @param {string} code
   * @returns {{code: string, count: number}}
   */
  function recordMiss(state,code){return state&&state.code===code?{code,count:state.count+1}:{code,count:1};}
  // The status line after a camera miss, given the scans of this barcode that have missed so far. "Twice" and "thrice" match the steady-read messages.
  /**
   * @param {number} attempts
   * @returns {string}
   */
  function missMessage(attempts){
    if(attempts>=SEARCH_MISS_ATTEMPTS)return `Item does not exist in the stored plans after ${attempts} scans. Check the barcode, or search by name.`;
    return `Item does not exist in the stored plans. Attempting scan ${attempts===1?'twice':'thrice'}.`;
  }
  const api={STEADY_READS,STEADY_WINDOW_MILLIS,STEADY_SPAN_MILLIS,SteadyRead,attemptMessage,AttemptAnnouncer,SEARCH_MISS_ATTEMPTS,retryAfterMiss,recordMiss,missMessage};
  if(typeof module==='object'&&module.exports)module.exports=api;
  /** @type {any} */ (root).SteadyReadCore=api;
})(typeof window==='object'?window:globalThis);

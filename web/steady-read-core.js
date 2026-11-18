// Steady-read rule for camera scans. A barcode is passed on only once it has been read STEADY_READS times within STEADY_WINDOW_MILLIS, with the reads spread over at least STEADY_SPAN_MILLIS. Same rule as the native app's SteadyRead.kt and CameraScanner.kt. No DOM, storage or camera access.
(function(root){
  'use strict';
  // Three reads of one code, two seconds at most, first and last at least 0.6 seconds apart. Three frames in a tenth of a second are one look at the label, not three.
  const STEADY_READS=3,STEADY_WINDOW_MILLIS=2000,STEADY_SPAN_MILLIS=600;
  // Records one read and says whether the code is steady yet. Reads of other codes in between do not reset the count.
  class SteadyRead{
    constructor({needed=STEADY_READS,windowMillis=STEADY_WINDOW_MILLIS,spanMillis=STEADY_SPAN_MILLIS}={}){
      this.needed=needed;this.windowMillis=windowMillis;this.spanMillis=spanMillis;this.reads=[];
    }
    // Returns {kind:'waiting',code,agreeing} or {kind:'steady',code}. Steady clears the count, so the next read starts again.
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
  function attemptMessage(agreeing){
    if(agreeing===2)return 'Attempting scan twice';
    if(agreeing===3)return 'Attempting scan thrice';
    return null;
  }
  // Gives each attempt message once per count: again only when the code changes or the count rises. A steady read starts over.
  class AttemptAnnouncer{
    constructor(){this.code=null;this.count=0;}
    // Takes one step from SteadyRead.offer and returns the message to show, or null.
    next(step){
      if(step.kind==='steady'){this.code=null;this.count=0;return null;}
      if(step.code!==this.code){this.code=step.code;this.count=0;}
      if(step.agreeing<=this.count)return null;
      this.count=step.agreeing;
      return attemptMessage(step.agreeing);
    }
  }
  // A camera scan that finds no product is scanned again, up to this many scans in all. The count starts again after a product is found, a typed search or a scan that is not from the camera.
  const SEARCH_MISS_ATTEMPTS=3;
  // True when the camera should open again after a miss. attempts is the number of scans so far in this run, including the one that missed.
  function retryAfterMiss(attempts){return attempts<SEARCH_MISS_ATTEMPTS;}
  const api={STEADY_READS,STEADY_WINDOW_MILLIS,STEADY_SPAN_MILLIS,SteadyRead,attemptMessage,AttemptAnnouncer,SEARCH_MISS_ATTEMPTS,retryAfterMiss};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SteadyReadCore=api;
})(typeof window==='object'?window:globalThis);

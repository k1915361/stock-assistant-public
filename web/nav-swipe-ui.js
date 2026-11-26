// @ts-check
// Wires the edge swipe to the navigation panel. The panel and its scrim follow the finger, then app.js opens or closes the panel as NavSwipeCore decides. The rules are in nav-swipe-core.js; this file only reads touches and moves the two elements.
(function(root){
  'use strict';
  // Installs the swipe. panel and scrim are the navigation elements. isOpen, openPanel and closePanel are the panel's own functions. ignoreStart(target) says a touch on that element must not start a swipe, and available() says whether the panel can be reached right now.
  function install({panel,scrim,isOpen,openPanel,closePanel,ignoreStart=()=>false,available=()=>true}){
    const Core=root.NavSwipeCore;
    const body=document.body;
    let drag=null;
    // Puts the panel and scrim where the finger has them. Transitions are off during a drag, so they keep up with the finger.
    function show(offset,width){
      body.classList.add('nav-dragging');
      panel.style.visibility='visible';scrim.style.visibility='visible';
      panel.style.transform=`translateX(${offset-width}px)`;
      scrim.style.opacity=String(width?offset/width:0);
    }
    // Gives control back to the stylesheet, so the class change that follows animates from where the finger left the panel.
    function release(){
      body.classList.remove('nav-dragging');
      panel.style.visibility='';panel.style.transform='';
      scrim.style.visibility='';scrim.style.opacity='';
    }
    function stop(){
      drag=null;
      document.removeEventListener('touchmove',onMove);
      document.removeEventListener('touchend',onEnd);
      document.removeEventListener('touchcancel',onEnd);
    }
    function onStart(event){
      stop();
      if(event.touches.length!==1||!available())return;
      if(document.querySelector('dialog[open]'))return;
      const touch=event.touches[0],open=isOpen();
      if(!open&&!Core.startsEdgeSwipe(touch.clientX))return;
      if(ignoreStart(event.target))return;
      const width=panel.offsetWidth;
      drag={x0:touch.clientX,y0:touch.clientY,open,width,state:'pending',offset:open?width:0,lastX:touch.clientX,lastT:event.timeStamp,velocity:0};
      document.addEventListener('touchmove',onMove,{passive:false});
      document.addEventListener('touchend',onEnd);
      document.addEventListener('touchcancel',onEnd);
    }
    function onMove(event){
      if(!drag)return;
      if(event.touches.length!==1){onEnd(event);return;}
      const touch=event.touches[0],dx=touch.clientX-drag.x0,dy=touch.clientY-drag.y0;
      if(drag.state==='pending'){
        const direction=Core.lockDirection(dx,dy);
        if(direction==='vertical'){stop();return;}
        if(direction!=='horizontal')return;
        drag.state='horizontal';
      }
      // Stops the page from scrolling sideways while the panel follows the finger.
      event.preventDefault();
      const elapsed=event.timeStamp-drag.lastT;
      if(elapsed>0)drag.velocity=(touch.clientX-drag.lastX)/elapsed;
      drag.lastX=touch.clientX;drag.lastT=event.timeStamp;
      drag.offset=Core.dragOffset({open:drag.open,dx,width:drag.width});
      show(drag.offset,drag.width);
    }
    function onEnd(){
      const finished=drag;
      stop();
      if(!finished||finished.state!=='horizontal')return;
      const open=Core.settlesOpen({offset:finished.offset,width:finished.width,velocity:finished.velocity});
      release();
      if(open)openPanel();else closePanel();
    }
    document.addEventListener('touchstart',onStart,{passive:true});
  }
  root.NavSwipeUI={install};
})(typeof window==='object'?window:globalThis);

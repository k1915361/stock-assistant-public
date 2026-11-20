// Pinch zoom and pan on the plan picture in a placement preview. Two fingers zoom, and one finger pans once the picture is zoomed. At the whole-picture scale a one-finger drag still scrolls the page, and a tap still opens the full page. The zoom is remembered per plan page on this device. The rules are in plan-zoom-core.js.
(function(root){
  'use strict';
  const reportError=root.reportFailure??((where,error)=>console.error(where,error));
  const STORE_KEY='stock-assistant-plan-views';
  // A finger that has moved this far from where it went down is panning, not tapping.
  const MOVE_PIXELS=8;
  // Every mounted preview that needs to repaint after a size change. Previews left off the page are dropped on the next resize.
  const resizers=new Set();
  root.addEventListener('resize',()=>{for(const repaint of resizers)repaint();});
  function readViews(){
    try{return JSON.parse(root.localStorage.getItem(STORE_KEY)||'{}')||{};}catch(error){reportError('plan zoom memory read',error);return {};}
  }
  function writeViews(views){
    try{root.localStorage.setItem(STORE_KEY,JSON.stringify(views));}catch(error){/* Storage may be blocked. The zoom then lasts only for this view. */reportError('plan zoom memory save',error);}
  }
  const relative=(point,origin)=>({x:point.x-origin.left,y:point.y-origin.top});
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const middle=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  // Adds zoom to one placement preview. frame is the plan frame, picture its image and key the plan page the zoom is remembered under.
  function mount(frame,picture,key){
    const Core=root.PlanZoomCore;
    frame.classList.add('plan-zoomable');
    const pointers=new Map();
    let view=Core.identity(),lastBox={width:0,height:0},pinch=null,moved=false,multi=false,suppressClick=false;
    const reset=document.createElement('button');
    reset.type='button';reset.className='quiet plan-zoom-reset';reset.hidden=true;reset.dataset.icon='refresh';
    reset.setAttribute('aria-label','Reset plan zoom');reset.textContent='Reset zoom';
    frame.append(reset);
    root.AppUI?.hydrateIcons?.(reset);
    const box=()=>({width:picture.offsetWidth,height:picture.offsetHeight});
    // Draws the current view. The picture is moved and scaled from its top-left corner, which is the frame's top-left corner.
    function paint(){
      lastBox=box();
      view=Core.clampView(view,lastBox);
      const zoomed=Core.isZoomed(view);
      picture.style.transformOrigin='0 0';
      picture.style.transform=zoomed?`translate(${view.x}px, ${view.y}px) scale(${view.scale})`:'';
      frame.dataset.zoomed=String(zoomed);
      reset.hidden=!zoomed;
    }
    // Ends a gesture: a near-miss snaps back, and a zoomed view is remembered for this plan page.
    function settle(){
      view=Core.settleView(view);
      paint();
      const entry=Core.isZoomed(view)?Core.toStored(view,lastBox):null;
      writeViews(Core.remember(readViews(),key,entry));
    }
    function restore(){
      const stored=Core.recall(readViews(),key),size=box();
      if(!stored||!size.width||!size.height)return;
      view=Core.fromStored(stored,size);
      paint();
    }
    // A screen size or orientation change keeps the same part of the picture in view.
    const repaint=()=>{
      if(!frame.isConnected){resizers.delete(repaint);return;}
      if(!Core.isZoomed(view)||!lastBox.width)return;
      const fraction=Core.toStored(view,lastBox);
      view=Core.fromStored(fraction,box());
      paint();
    };
    resizers.add(repaint);
    if(picture.complete&&picture.naturalWidth)restore();else picture.addEventListener('load',restore,{once:true});
    // While a gesture is open, its moves and its end are read from the window, so a finger that leaves the frame is still followed.
    function onMove(event){
      const current=pointers.get(event.pointerId);
      if(!current)return;
      current.previousX=current.x;current.previousY=current.y;
      current.x=event.clientX;current.y=event.clientY;
      if(distance(current,{x:current.startX,y:current.startY})>MOVE_PIXELS)moved=true;
      if(pointers.size>=2&&pinch){
        const [a,b]=[...pointers.values()];
        const origin=frame.getBoundingClientRect();
        view=Core.pinchView(pinch.view,pinch.distance,pinch.middle,distance(a,b),middle(relative(a,origin),relative(b,origin)),box());
        paint();
        return;
      }
      if(pointers.size===1&&Core.isZoomed(view)){
        view=Core.panView(view,current.x-current.previousX,current.y-current.previousY,box());
        paint();
      }
    }
    function onEnd(event){
      if(!pointers.has(event.pointerId))return;
      pointers.delete(event.pointerId);
      if(pointers.size===1)pinch=null;
      if(pointers.size>0)return;
      pinch=null;
      root.removeEventListener('pointermove',onMove);
      root.removeEventListener('pointerup',onEnd);
      root.removeEventListener('pointercancel',onEnd);
      if(moved||multi){suppressClick=true;settle();}
    }
    frame.addEventListener('pointerdown',event=>{
      if(event.target.closest('button'))return;
      if(event.pointerType==='mouse'&&event.button!==0)return;
      if(pointers.size===0){
        moved=false;multi=false;suppressClick=false;
        root.addEventListener('pointermove',onMove);
        root.addEventListener('pointerup',onEnd);
        root.addEventListener('pointercancel',onEnd);
      }
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,previousX:event.clientX,previousY:event.clientY});
      if(pointers.size===2){
        multi=true;
        const [a,b]=[...pointers.values()];
        const origin=frame.getBoundingClientRect();
        pinch={distance:distance(a,b),middle:middle(relative(a,origin),relative(b,origin)),view:{...view}};
      }
    });
    // A gesture that moved the picture must not also open the full page when the finger lifts.
    frame.addEventListener('click',event=>{
      if(!suppressClick)return;
      suppressClick=false;
      event.stopPropagation();event.preventDefault();
    },true);
    reset.addEventListener('click',()=>{
      view=Core.identity();
      paint();
      writeViews(Core.remember(readViews(),key,null));
    });
  }
  root.PlanZoomUI={mount};
})(typeof window==='object'?window:globalThis);

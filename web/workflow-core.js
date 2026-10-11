(function(root){
 'use strict';
 function settings(previous={}){return previous.workflowRevision===4?{autoScan:60,scanPosition:true,planZoom:true,...previous}:{...previous,autoScan:60,scanPosition:true,planZoom:true,workflowRevision:4};}
 function scheduler(fire,clock={now:()=>Date.now(),setTimeout,clearTimeout}){
   let timer=null,deadline=null,remaining=null;
   function clear(){if(timer!==null)clock.clearTimeout(timer);timer=null;}
   function stop(){clear();deadline=null;remaining=null;}
   function arm(seconds){stop();if(seconds<=0)return;remaining=seconds*1000;resume();}
   function pause(){if(deadline!==null)remaining=Math.max(0,deadline-clock.now());clear();deadline=null;}
   function resume(){if(remaining===null||deadline!==null)return;deadline=clock.now()+remaining;timer=clock.setTimeout(()=>{stop();fire();},remaining);}
   function seconds(){return deadline!==null?Math.max(0,Math.ceil((deadline-clock.now())/1000)):null;}
   return {arm,pause,resume,stop,seconds};
 }
 function union(boxes){const valid=boxes.filter(b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]>=0&&b[1]>=0&&b[2]<=1&&b[3]<=1&&b[2]>b[0]&&b[3]>b[1]);return valid.length?[Math.min(...valid.map(b=>b[0])),Math.min(...valid.map(b=>b[1])),Math.max(...valid.map(b=>b[2])),Math.max(...valid.map(b=>b[3]))]:null;}
 function focus(images,markers=[]){
   const candidates=images.filter(b=>b[0]>=0&&b[1]>=0&&b[2]<=1&&b[3]<=1&&(b[2]-b[0])*(b[3]-b[1])>.001&&b[2]-b[0]<.8&&b[3]-b[1]<.85);
   const bounds=union(candidates);if(!bounds)return null;
   const annotations=markers.filter(b=>union([b])).map(b=>[Math.max(0,b[0]-.03),Math.max(0,b[1]-.05),Math.min(1,b[2]+.04),Math.min(1,b[3]+.03)]);
   const combined=union([bounds,...annotations]);if(!combined||combined[2]-combined[0]>.9||combined[3]-combined[1]>.9)return null;
   return [Math.max(0,combined[0]-.035),Math.max(0,combined[1]-.035),Math.min(1,combined[2]+.035),Math.min(1,combined[3]+.035)];
 }
 const api={settings,scheduler,focus,union};if(typeof module!=='undefined')module.exports=api;root.WorkflowCore=api;
})(typeof window!=='undefined'?window:globalThis);

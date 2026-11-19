'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LocationCore=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const MAX_AGE=5000, TIMEOUT=6000, TARGET=2;
  function normalize(raw,now=Date.now(),capturedAt=null){
    const base={source:String(raw.source||'unknown'),permission:String(raw.permission||'unknown'),latencyMs:Math.max(0,Number(raw.latencyMs)||0),recordedAt:new Date(now).toISOString(),shelfVerified:false};
    if(raw.status&&raw.status!=='fix')return {...base,status:raw.status};
    const valid=typeof raw.latitude==='number'&&Number.isFinite(raw.latitude)&&Math.abs(raw.latitude)<=90&&typeof raw.longitude==='number'&&Number.isFinite(raw.longitude)&&Math.abs(raw.longitude)<=180&&typeof raw.accuracy==='number'&&Number.isFinite(raw.accuracy)&&raw.accuracy>0&&typeof raw.timestamp==='number'&&Number.isFinite(raw.timestamp)&&Math.abs(raw.timestamp)<=8640000000000000;
    if(!valid)return {...base,status:'invalid'};
    const age=typeof raw.ageMs==='number'?raw.ageMs:now-raw.timestamp;
    if(!Number.isFinite(age)||age<0||age>MAX_AGE)return {...base,status:'stale',ageMs:Number.isFinite(age)?age:null};
    const offset=Number.isFinite(capturedAt)?raw.timestamp-capturedAt:null;
    return {...base,latitude:raw.latitude,longitude:raw.longitude,horizontalAccuracyMetres:raw.accuracy,measurementAt:new Date(raw.timestamp).toISOString(),ageMs:age,captureOffsetMs:offset,mock:!!raw.mock,status:raw.mock?'simulated':offset!==null&&Math.abs(offset)>2000?'timing-uncertain':raw.permission==='approximate'||raw.accuracy>TARGET?'imprecise':'candidate'};
  }
  function describe(fix){
    if(!fix)return 'No phone position recorded';
    const messages={'permission-denied':'Location permission unavailable','timeout':'No position within 6 seconds','unavailable':'Location unavailable','disabled':'Device location is off','cancelled':'Position request cancelled','stale':'Old reading rejected','invalid':'Invalid reading rejected','simulated':'Simulated test position','timing-uncertain':'Phone position measured too far from capture time for shelf guidance'};
    if(messages[fix.status])return messages[fix.status];
    return `Phone position · reported accuracy ${Number(fix.horizontalAccuracyMetres).toFixed(1)} m · ${fix.status==='candidate'?'candidate for field testing':'too uncertain for shelf guidance'}`;
  }
  // A bounded foreground request. Injectable API/clock allow permission, race and timeout tests.
  function browserCollector(geo,clock={now:()=>Date.now(),setTimeout,clearTimeout}){
    let cancel=()=>{};
    function capture(callback){
      cancel();const start=clock.now();let done=false,watch=null,timer=null,best=null;
      function finish(raw){if(done)return;done=true;if(timer!==null)clock.clearTimeout(timer);if(watch!==null)geo.clearWatch(watch);callback({...raw,source:'browser-geolocation',permission:'unknown',latencyMs:clock.now()-start});}
      cancel=()=>finish({status:'cancelled'});
      if(!geo){finish({status:'unavailable'});return;}
      timer=clock.setTimeout(()=>finish(best||{status:'timeout'}),TIMEOUT);
      try{watch=geo.watchPosition(position=>{
        if(done)return;
        const raw={status:'fix',latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,timestamp:position.timestamp};
        const checked=normalize(raw,clock.now());if(!['candidate','imprecise'].includes(checked.status))return;
        if(!best||clock.now()-best.timestamp>MAX_AGE||raw.accuracy<best.accuracy)best=raw;
        if(checked.status==='candidate')finish(raw);
      },error=>finish(best||{status:error.code===1?'permission-denied':error.code===3?'timeout':'unavailable'}),{enableHighAccuracy:true,maximumAge:0,timeout:TIMEOUT});
      // Some test/platform implementations can return synchronously.
      if(done&&watch!==null)geo.clearWatch(watch);
      }catch{finish({status:'unavailable'});}
    }
    return {capture,cancel:()=>cancel()};
  }
  return {normalize,describe,browserCollector,MAX_AGE,TIMEOUT,TARGET};
});

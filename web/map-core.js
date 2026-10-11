(function(root){
  'use strict';
  function points(events,barcode=''){
    const key=value=>String(value||'').replace(/^0(?=\d{12}$)/,'');
    return (events||[]).filter(e=>e.kind==='phone-position'&&(!barcode||key(e.product||e.query)===key(barcode))&&e.fix&&['candidate','imprecise','timing-uncertain','simulated'].includes(e.fix.status)&&Number.isFinite(e.fix.latitude)&&Math.abs(e.fix.latitude)<=90&&Number.isFinite(e.fix.longitude)&&Math.abs(e.fix.longitude)<=180&&Number.isFinite(e.fix.horizontalAccuracyMetres)&&e.fix.horizontalAccuracyMetres>0).slice().sort((a,b)=>Date.parse(b.capturedAt||b.at)-Date.parse(a.capturedAt||a.at));
  }
  function distance(a,b){const rad=Math.PI/180,lat1=a.latitude*rad,lat2=b.latitude*rad,dlat=lat2-lat1,dlon=(b.longitude-a.longitude)*rad;return 6371008.8*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2)));}
  const api={points,distance};if(typeof module!=='undefined')module.exports=api;root.MapCore=api;
})(typeof window!=='undefined'?window:globalThis);

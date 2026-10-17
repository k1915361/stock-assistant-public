'use strict';
window.LocationMap={open(events,product=''){
  const points=MapCore.points(events,product),shown=points.slice(0,200),escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels=shown.map(e=>MapCore.reading(e,typeof catalogue!=='undefined'?catalogue.products:[]));
  openModal(`<h2>${product?'Item last-seen GPS':'Recorded GPS map'}</h2>${points.length?`<label for="map-reading">Recorded reading</label><select id="map-reading">${shown.map((e,i)=>`<option value="${i}">${i+1}. ${escape(labels[i].name)} · ${escape(date(e.capturedAt||e.at))}${e.fix.mock?' · simulated':''}</option>`).join('')}</select><section id="map-item" class="map-item" aria-live="polite" aria-label="Selected item and recorded reading"><h3 id="map-item-title"></h3><p id="map-item-code" class="code"></p><p id="map-item-reading" class="muted"></p></section><div id="gps-map" role="region" aria-label="Recorded phone positions and reported accuracy radii"></div><p id="map-summary" class="source"></p><button id="street-map">Load street map (online)</button><p class="muted">Points and accuracy circles work offline. Street-map tiles request this viewing area from OpenStreetMap; item names and history stay local. Reported accuracy is an estimate, not a shelf location.</p><p id="map-network" role="status"></p><details><summary>Reading source and technical details</summary><div id="map-details"></div></details>`:'<p>No coordinates have been recorded for this selection. Camera scans and location photos collect them when GPS recording and phone permission are enabled. Denied or rejected readings are still available in history.</p>'}`);
  if(!points.length)return;
  const map=L.map('gps-map',{maxZoom:22,minZoom:2,zoomControl:true}).setView([shown[0].fix.latitude,shown[0].fix.longitude],18),layers=L.featureGroup().addTo(map),circles=[],markers=[];
  L.control.scale({imperial:false}).addTo(map);
  for(const [i,e] of shown.entries()){
    const f=e.fix,color=f.mock?'#8b5ab9':i===0?'#cf202b':'#196a94';
    circles.push(L.circle([f.latitude,f.longitude],{radius:f.horizontalAccuracyMetres,color,weight:1.5,fillOpacity:.06}).addTo(layers));
    markers.push(L.circleMarker([f.latitude,f.longitude],{radius:4,color,weight:2,fillOpacity:.8}).on('click',()=>select(i)).addTo(layers));
  }
  function select(index){
    const e=shown[index],f=e.fix,label=labels[index];
    document.getElementById('map-reading').value=String(index);
    const title=document.getElementById('map-item-title');title.textContent=label.name;title.title=label.name;title.setAttribute('aria-label',label.name);
    document.getElementById('map-item-code').textContent=label.code?'Code '+label.code:'No barcode recorded';
    document.getElementById('map-item-reading').textContent=`${date(e.capturedAt||e.at)} · reported accuracy ${f.horizontalAccuracyMetres.toFixed(1)} m${f.mock?' · SIMULATED':''}`;
    markers.forEach((marker,i)=>marker.setStyle({radius:i===index?8:4,weight:i===index?3:2,fillOpacity:i===index?1:.6}));markers[index].bringToFront();
    map.fitBounds(circles[index].getBounds(),{padding:[24,24],maxZoom:20});
    document.getElementById('map-summary').textContent=`Reading ${index+1} of ${points.length}${points.length>shown.length?' (latest 200 shown)':''} · ${f.latitude.toFixed(6)}, ${f.longitude.toFixed(6)}`;
    document.getElementById('map-details').innerHTML=positionDetails(e);
  }
  select(0);document.getElementById('map-reading').onchange=e=>select(Number(e.target.value));
  document.getElementById('street-map').onclick=e=>{e.target.disabled=true;const tile=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:22,maxNativeZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);tile.on('tileerror',()=>{const n=document.getElementById('map-network');if(n)n.textContent='Street-map tiles unavailable. Recorded points and accuracy circles remain usable.';});};
  const modal=document.getElementById('modal'),closed=()=>{map.remove();modal.removeEventListener('close',closed);};modal.addEventListener('close',closed);setTimeout(()=>map.invalidateSize(),0);
}};

'use strict';
window.LocationMap={open(events,product=''){
  const points=MapCore.points(events,product),escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  openModal(`<h2>${product?'Item last-seen GPS':'Recorded GPS map'}</h2>${points.length?`<label for="map-reading">Recorded reading</label><select id="map-reading">${points.slice(0,200).map((e,i)=>`<option value="${i}">${escape(e.productName||e.product||e.query||'Capture')} · ${escape(date(e.capturedAt||e.at))}${e.fix.mock?' · simulated':''}</option>`).join('')}</select><div id="gps-map" role="region" aria-label="Recorded phone positions and reported accuracy radii"></div><p id="map-summary" aria-live="polite"></p><button id="street-map">Load street map (online)</button><p class="muted">Points and accuracy circles work offline. Street-map tiles request this viewing area from OpenStreetMap; item names and history stay local. Reported accuracy is an estimate, not a shelf location.</p><p id="map-network" role="status"></p><div id="map-details"></div>`:'<p>No coordinates have been recorded for this selection. Camera scans and location photos collect them when GPS recording and phone permission are enabled. Denied or rejected readings are still available in history.</p>'}`);
  if(!points.length)return;
  const map=L.map('gps-map',{maxZoom:22,minZoom:2,zoomControl:true}).setView([points[0].fix.latitude,points[0].fix.longitude],18),layers=L.featureGroup().addTo(map),circles=[];
  L.control.scale({imperial:false}).addTo(map);
  for(const [i,e] of points.slice(0,200).entries()){
    const f=e.fix,color=f.mock?'#8b5ab9':i===0?'#cf202b':'#196a94';
    circles.push(L.circle([f.latitude,f.longitude],{radius:f.horizontalAccuracyMetres,color,weight:1.5,fillOpacity:.06}).addTo(layers));
    L.circleMarker([f.latitude,f.longitude],{radius:i===0?7:4,color,weight:2,fillOpacity:.8}).bindPopup(`${escape(e.productName||e.product||e.query)}<br>${escape(date(e.capturedAt||e.at))}<br>Reported accuracy ${f.horizontalAccuracyMetres.toFixed(1)} m${f.mock?'<br>Simulated reading':''}`).addTo(layers);
  }
  function select(index){const e=points[index],f=e.fix;map.fitBounds(circles[index].getBounds(),{padding:[24,24],maxZoom:20});document.getElementById('map-summary').textContent=`${points.length} readings · ${f.latitude.toFixed(6)}, ${f.longitude.toFixed(6)} · accuracy radius ${f.horizontalAccuracyMetres.toFixed(1)} m${f.mock?' · SIMULATED':''}`;document.getElementById('map-details').innerHTML=positionDetails(e);}
  select(0);document.getElementById('map-reading').onchange=e=>select(Number(e.target.value));
  document.getElementById('street-map').onclick=e=>{e.target.disabled=true;const tile=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:22,maxNativeZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);tile.on('tileerror',()=>{const n=document.getElementById('map-network');if(n)n.textContent='Street-map tiles unavailable. Recorded points and accuracy circles remain usable.';});};
  const modal=document.getElementById('modal'),closed=()=>{map.remove();modal.removeEventListener('close',closed);};modal.addEventListener('close',closed);setTimeout(()=>map.invalidateSize(),0);
}};

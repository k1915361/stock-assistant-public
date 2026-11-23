'use strict';
// The camera scan timer: the next-scan countdown, pausing under overlays, cancelling and re-arming, and opening the camera.
const autoScanner=WorkflowCore.scheduler(startScan,{now:()=>Date.now(),setTimeout:(callback,ms)=>setTimeout(callback,ms),clearTimeout:id=>clearTimeout(id)});
let scanCycle=false,scanTick=null,cameraActive=false,missedScan={code:null,count:0};
function updateCountdown(){const seconds=autoScanner.seconds();const label=seconds===null?'Next scan':`Next scan · ${seconds}s`;$('next-scan').title=label;$('next-scan').setAttribute('aria-label',label);$('scan-countdown').textContent=seconds===null?'':`${seconds}s`;$('scan-countdown').hidden=seconds===null;clearTimeout(scanTick);if(seconds!==null)scanTick=setTimeout(updateCountdown,1000);}
function pauseTimer(){autoScanner.pause();updateCountdown();}
function resumeTimer(){if(scanCycle&&!cameraActive&&!document.hidden&&!overlayOpen()&&!document.body.classList.contains('settings-open')&&!document.body.classList.contains('whats-new-open')){autoScanner.resume();updateCountdown();}}
function cancelTimer(){scanCycle=false;autoScanner.stop();updateCountdown();}
function armTimer(){scanCycle=true;autoScanner.arm(Number(state.settings.autoScan));if(document.hidden||overlayOpen())autoScanner.pause();updateCountdown();}
async function startScan(){missedScan={code:null,count:0};await openScanner();}
// Opens the camera for the next barcode. A retry after a miss passes its message, which the camera panel shows, so the count of misses is kept.
async function openScanner(note=''){cancelTimer();cameraActive=true;await leaveOverlay(); if(native) native.scan(); else if(window.LocalPlatform)LocalPlatform.scan(note);else $('status').textContent='Camera tools are loading. You can still search by barcode or name.';}

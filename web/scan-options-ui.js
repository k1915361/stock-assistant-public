'use strict';
// Scan buttons: a tap starts a scan, and a long press opens the scan options page. The floating scan button is optional and off by default.
// The options page is an app: address, so Back returns to the screen beneath it, as every other page does.
window.ScanOptionsUI=(()=>{
  const FLOATING_NOTE='A large scan button stays in the bottom-right corner, above the page-top button, on the results screen too.';
  const floatingOn=()=>workspace.getState().settings?.floatingScan===true;
  function pageHTML(){
    const on=floatingOn();
    return `<section class="scan-options" aria-labelledby="scan-floating-title"><h2 id="scan-floating-title">Floating scan button</h2><p>${escapeHTML(FLOATING_NOTE)}</p><label class="check-row"><input id="floating-scan" type="checkbox"${on?' checked':''}> Show the floating scan button</label><p class="muted">Off by default. The Scan barcode button and Next scan in the top bar stay in place either way.</p></section><section class="scan-options" aria-labelledby="scan-gesture-title"><h2 id="scan-gesture-title">Opening this page</h2><p>Long-press any scan button to open this page. A short tap still starts a scan.</p><p class="muted">Settings has a Scan button and floating button row for use without a long press.</p></section>`;
  }
  // The floating button shows only when its setting is on. The body class moves the page-top button above it.
  function syncFloating(){
    const on=floatingOn(),button=$('scan-fab');
    document.body.classList.toggle('has-scan-fab',on);
    if(button)button.hidden=!on;
  }
  function open(options={}){
    openPage('app:scan-options',pageHTML(),options);
    const box=$('floating-scan');
    box.onchange=()=>{
      if(updateSettings({floatingScan:box.checked})){syncFloating();return;}
      box.checked=floatingOn();
      overlayMessage('The setting could not be saved. It is unchanged.');
    };
  }
  // A hold past the threshold opens the options page. The click that follows the release is swallowed, so the hold never starts a scan.
  function bind(button){
    if(!button||button.dataset.scanBound==='true')return;
    button.dataset.scanBound='true';
    const press=WorkflowCore.longPress({show:()=>open()});
    button.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button!==0)return;press.start(button,event.pointerId,event.clientX,event.clientY);});
    button.addEventListener('pointermove',event=>{press.move(event.pointerId,event.clientX,event.clientY);});
    button.addEventListener('pointerup',event=>{press.end(event.pointerId);});
    button.addEventListener('pointercancel',event=>{press.end(event.pointerId,{cancelled:true});});
    button.addEventListener('click',event=>{if(press.consumeClick(button)){event.preventDefault();return;}startScan();});
  }
  bind($('scan'));
  bind($('next-scan'));
  bind($('scan-fab'));
  syncFloating();
  return {open,bind,syncFloating};
})();

'use strict';
// Routing and history: app: addresses, the Back stack, and the page and dialog containers. Pages build their own content; the workspace state lives in workspace-state.js.
// The query last shown, not the box: a draft typed but not searched must not become a history entry.
// Internal pages (app:...) use one container. Dialogs remain only for the menu, confirms and photo viewing.
let currentPageRoute=null,currentPageOptions=null,pageReturn=false;
const DIALOG_VARIANTS=['confirm','viewer'];
// Pages Back can rebuild from their address. Pages that need an item or plan return to the screen beneath them instead.
const restorePages={'app:history':options=>openRecent(options),'app:urls':options=>openUrlsPage(options),'app:pins':options=>window.openPinnedLookups(options),'app:shortcuts':options=>openShortcutSheet(options),'app:plans':options=>showStoredPlans(options),'app:presets':options=>window.openWorkflowPresets(options),'app:restored-data':options=>restoredDataStatus(options),'app:account':options=>AccountUI.open(options),'app:scan-photo':options=>ImageTest.open(options),'app:shelf-labels':options=>ShelfLabels.open(options),'app:scan-options':options=>ScanOptionsUI.open(options)};
function pageOpen(){return !!currentPageRoute;}
function settingsOpen(){return document.body.classList.contains('settings-open');}
function overlayOpen(){return $('modal').open||pageOpen()||settingsOpen();}
function overlayContent(){return pageOpen()?$('page-content'):settingsOpen()?$('settings-content'):$('modal-content');}
function overlayMessage(text){
  if(!overlayOpen()){$('status').textContent=text;return;}
  const content=overlayContent();
  let node=content.querySelector('[data-overlay-message]');
  if(!node){node=document.createElement('p');node.className='overlay-message';node.dataset.overlayMessage='';node.setAttribute('role','status');content.prepend(node);}
  node.textContent=text;
}
// Runs the page's onClose once, then empties it. Plan previews are released with the page.
function clearPageContent(){
  const onClose=currentPageOptions?.onClose;currentPageOptions=null;
  if(onClose)onClose();
  const content=$('page-content');
  for(const view of planViews.keys())if(content.contains(view))releasePlanView(view);
  content.replaceChildren();
}
// Reveals the page that openPage has already filled. The content is set first and synchronously, because callers wire their controls straight after openPage returns. Opening from closed runs the reveal inside a view transition, so the main screen fades into the page. The browser runs the reveal a frame later, so a page closed in the meantime is not shown.
function revealPage(opening){
  const reveal=()=>{
    if(!pageOpen())return;
    $('app-page').hidden=false;document.body.classList.add('page-open');
    $('page-title').focus({preventScroll:true});
  };
  const motion=!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if(opening&&motion&&typeof document.startViewTransition==='function')document.startViewTransition(reveal);
  else reveal();
}
// Shows an app: address in the page container. A new address adds one history entry, so Back returns to the screen beneath it. A refresh of the same address, or a restored entry, adds none.
function openPage(url,html,options={}){
  const route=AppUI.resolve(url);
  if(!route)throw Error('Unknown app address: '+url);
  if($('modal').open)$('modal').close();
  if(!options.keepRecovery)window.LocalPlatform?.cancelRestoreRecovery?.();
  pauseTimer();
  // The control that opened the first page gets focus back when the stack closes, so keyboard users are not dropped at the top.
  const wasOpen=pageOpen(),sameRoute=wasOpen&&currentPageRoute===route.url,opener=wasOpen?currentPageOptions?.opener:document.activeElement;
  if(wasOpen)clearPageContent();
  currentPageRoute=route.url;currentPageOptions={onClose:options.onClose||null,opener};
  $('page-title').textContent=options.title||route.title;
  $('page-address').textContent=route.url;
  $('page-content').innerHTML=html;
  $('page-back').onclick=()=>window.stockAssistantBack();
  revealPage(!wasOpen);window.scrollTo(0,0);
  if(!options.restoring&&!sameRoute){if(options.replace&&wasOpen)refreshAppSnapshot();else recordAppScreen(route.url);}
  AppUI.hydrateIcons($('app-page'));resolvePhotos();
  return $('page-content');
}
// Removes the page without moving through history, for a screen that replaces it in place.
function hidePage({resume=true}={}){
  if(!pageOpen())return;
  const opener=currentPageOptions?.opener;
  clearPageContent();currentPageRoute=null;
  $('app-page').hidden=true;document.body.classList.remove('page-open');
  window.LocalPlatform?.cancelRestoreRecovery?.();
  if(resume)resumeTimer();
  if(opener?.isConnected)opener.focus({preventScroll:true});
}
// Back leaves a page through history, so the screen beneath it is shown again. The promise resolves once the page has gone.
let leavingPage=null;
function closeOverlay(){
  if(!pageOpen())return Promise.resolve(false);
  if(history.state?.stockAssistant&&Number(history.state.index)>0&&history.length>1){
    pageReturn=true;
    return new Promise(resolve=>{
      leavingPage=resolve;history.back();
      // If the browser never reports the move, close the page anyway so Back cannot stall.
      setTimeout(()=>{if(leavingPage===resolve){leavingPage=null;pageReturn=false;hidePage();resolve(false);}},600);
    });
  }
  hidePage();return Promise.resolve(true);
}
// Leaves an open dialog or page before another screen starts. Await it before anything that adds a history entry.
function leaveOverlay(){if($('modal').open){$('modal').close();return Promise.resolve(true);}return closeOverlay();}
// A search shows its results on the main screen, so an open page, Settings or What’s new is closed first and the results replace it.
function leaveScreensForSearch(){if(pageOpen())hidePage({resume:false});if(settingsOpen())leaveSettingsPage();if(document.body.classList.contains('whats-new-open'))leaveWhatsNewPage();}
const routeOpeners={'app:history':()=>openRecent(),'app:urls':()=>openUrlsPage(),'app:settings':()=>openSettings(),'app:whats-new':()=>showWhatsNew(),'app:pins':()=>window.openPinnedLookups(),'app:presets':()=>window.openWorkflowPresets(),'app:plans':()=>showStoredPlans(),'app:restored-data':()=>restoredDataStatus(),'app:shortcuts':()=>openShortcutSheet(),'app:account':()=>AccountUI.open(),'app:scan-photo':()=>ImageTest.open(),'app:shelf-labels':()=>ShelfLabels.open(),'app:scan-options':()=>ScanOptionsUI.open(),'app:store-prices':()=>window.RetailerUI?.settings(),'app:last-seen-map':()=>LocationMap.open(visibleEvents())};
// Chrome-style app: addresses. Routes without an opener need an item or plan, so they explain how to reach them.
function openRoute(address){
  const route=AppUI.resolve(address);
  if(!route){overlayMessage('Unknown address. Try app:history, app:settings or app:urls.');return false;}
  const opener=routeOpeners[route.url];
  if(!opener){overlayMessage(route.title+' opens from an item or another screen. Search for the item first.');return false;}
  opener();return true;
}
function renderAppRouteSuggestions(list,query){
  const routes=AppUI.routes.filter(route=>route.url.startsWith(query.toLowerCase())&&routeOpeners[route.url]);
  list.innerHTML=routes.map(route=>`<button type="button" role="option" class="search-suggestion" data-app-route="${escapeHTML(route.url)}" data-icon="link"><strong>${escapeHTML(route.title)}</strong><span>${escapeHTML(route.url)} · ${escapeHTML(route.summary)}</span></button>`).join('')||'<p class="muted search-empty">No app address starts with this text. Try app:history or app:urls.</p>';
  list.querySelectorAll('[data-app-route]').forEach(button=>button.onclick=()=>{hideSearchAssist();openRoute(button.dataset.appRoute);});
}
function openUrlsPage(options={}){
  openPage('app:urls',`<p class="muted">Every address this app can open, like Chrome's internal pages. Type one in the search box to open it.</p><div class="url-list">${AppUI.routes.map(route=>`<article class="card url-row"><strong>${escapeHTML(route.title)}</strong><code class="code">${escapeHTML(route.url)}</code><p class="muted">${escapeHTML(route.summary)}</p>${routeOpeners[route.url]?`<button type="button" data-open-route="${escapeHTML(route.url)}" data-icon="link">Open ${escapeHTML(route.title)}</button>`:'<p class="muted">Opens from an item or another screen.</p>'}</article>`).join('')}</div>`,options);
  $('page-content').querySelectorAll('[data-open-route]').forEach(button=>button.onclick=()=>openRoute(button.dataset.openRoute));
}
// Hydrates icons on buttons that any screen adds later, from the one icon registry in app-ui.js.
if(document.body)AppUI.hydrateIcons(document.body);
if(typeof MutationObserver==='function'&&document.body)new MutationObserver(()=>AppUI.hydrateIcons(document.body)).observe(document.body,{childList:true,subtree:true});
function visibleScreen(){return {query:shownQuery,selectedBarcode:currentProduct?.barcode||'',placementIndex,scrollY:window.scrollY,page:pageOpen()&&restorePages[currentPageRoute]?currentPageRoute:document.body.classList.contains('whats-new-open')?'whats-new':document.body.classList.contains('settings-open')?'settings':'main'};}
function canGoBack(){return !!(history.state?.stockAssistant&&Number(history.state.index)>0);}
function updateAppBack(){const button=$('app-back'),enabled=canGoBack();button.hidden=!enabled;button.disabled=!enabled;}
function canGoForward(){return !!(history.state?.stockAssistant&&Number(history.state.index)<appHistoryMaxIndex);}
// While the page is still blank, refresh=false keeps the entry's saved screen. refresh=true records the screen now shown.
function initializeAppHistory(refresh=false){const current=history.state?.stockAssistant?history.state:null,index=current?Number(current.index)||0:0,snapshot=current?.snapshot&&!refresh?current.snapshot:visibleScreen();appHistoryMaxIndex=Math.max(index,Number(current?.maxIndex)||0);history.replaceState({stockAssistant:true,index,maxIndex:appHistoryMaxIndex,snapshot},'',location.href);appHistoryReady=true;updateAppBack();}
function recordAppScreen(route=''){if(!appHistoryReady)initializeAppHistory();const index=history.state?.stockAssistant?Number(history.state.index||0)+1:1;appHistoryMaxIndex=index;history.pushState({stockAssistant:true,index,maxIndex:index,snapshot:visibleScreen(),route},'','#stock-'+index+'-'+Date.now());updateAppBack();}
function restoreAppScreen(snapshot){if(!snapshot)return;const returning=pageReturn;pageReturn=false;hidePage({resume:false});if(snapshot.page==='settings'){document.body.classList.remove('whats-new-open');$('whats-new-screen').hidden=true;document.body.classList.add('settings-open');$('settings-screen').hidden=false;updateAppBack();return;}if(snapshot.page==='whats-new'){document.body.classList.remove('settings-open');$('settings-screen').hidden=true;document.body.classList.add('whats-new-open');$('whats-new-screen').hidden=false;renderWhatsNew();updateAppBack();return;}leaveWhatsNewPage();leaveSettingsPage();if(restorePages[snapshot.page]){restorePages[snapshot.page]({restoring:true});updateAppBack();return;}if(returning&&snapshot.page==='main'){resumeTimer();updateAppBack();return;}const query=String(snapshot.query||'');if(query)lookup(query,false,true,true);else{document.body.classList.remove('has-results');currentProduct=null;lastMatches=[];placementIndex=0;$('query').value='';shownQuery='';$('results').innerHTML=initialWelcomeHTML;$('status').textContent='';const previous=workspace.getState();workspace.setState({...previous,lastQuery:''});if(!save())workspace.setState(previous);}if(snapshot.selectedBarcode){const selected=StockCore.group(lastMatches).find(group=>group.barcode===snapshot.selectedBarcode);if(selected){showProduct(selected);if(Number.isInteger(snapshot.placementIndex)&&snapshot.placementIndex>0&&snapshot.placementIndex<currentProduct.placements.length){placementIndex=snapshot.placementIndex;showPlacement();}}}window.requestAnimationFrame(()=>window.scrollTo(0,Math.max(0,Number(snapshot.scrollY)||0)));updateAppBack();}
function refreshAppSnapshot(){if(history.state?.stockAssistant)history.replaceState({...history.state,snapshot:visibleScreen()},'',location.href);}
// Runs once the catalogue and saved state are ready. A search typed before the catalogue loaded runs now; otherwise the last search is restored unless a screen already shows.
function startupScreen(){window.ScanOptionsUI?.syncFloating();const waiting=pendingLookup,address=new URLSearchParams(location.search).get('route');pendingLookup=null;if(waiting)lookup(waiting.query,waiting.scanned,waiting.refresh,waiting.restoring);else if(!address&&state.lastQuery&&!document.body.classList.contains('has-results'))lookup(state.lastQuery,false,true,true);initializeAppHistory(true);if(address)openShortcutRoute(address);}
// A home-screen shortcut opens its app: address once. The route parameter is then removed, so a reload does not open the page again.
function openShortcutRoute(address){const url=new URL(location.href);url.searchParams.delete('route');history.replaceState(history.state,'',url.pathname+url.search+url.hash);openRoute(address);}
window.addEventListener('popstate',event=>{if(event.state?.stockAssistant){appHistoryMaxIndex=Math.max(appHistoryMaxIndex,Number(event.state.maxIndex)||0);history.replaceState({...event.state,maxIndex:appHistoryMaxIndex},'',location.href);if(!pageReturn)cancelTimer();restoreAppScreen(event.state.snapshot);if(leavingPage){const done=leavingPage;leavingPage=null;done(true);}}updateAppBack();});
window.stockAssistantBack=()=>{if(closeNavPanel())return true;if($('modal')?.open){$('modal').close();return true;}if(pageOpen()){closeOverlay();return true;}if(document.body.classList.contains('settings-open')||document.body.classList.contains('whats-new-open')){if(history.state?.stockAssistant&&Number(history.state.index)>0&&history.length>1)history.back();else{leaveWhatsNewPage();leaveSettingsPage();}return true;}if(history.state?.stockAssistant&&Number(history.state.index)>0&&history.length>1){cancelTimer();history.back();return true;}return false;};
document.addEventListener('click',event=>{if(event.target.closest('#app-back'))window.stockAssistantBack();const example=event.target.closest('[data-query]');if(example)lookup(example.dataset.query);});
function openModal(html,keepRecovery=false,variant='') {if(!DIALOG_VARIANTS.includes(variant))throw Error('Use openPage for app screens. Dialogs are limited to '+DIALOG_VARIANTS.join(', ')+'.');if(!keepRecovery)window.LocalPlatform?.cancelRestoreRecovery?.();$('modal-content').ontouchstart=null;$('modal-content').ontouchend=null;pauseTimer(); $('modal-content').innerHTML=html;$('modal').className=variant;$('modal').onclick=variant?event=>{if(event.target===$('modal'))$('modal').close();}:null;const title=$('modal-content').querySelector('h2');if(title){title.id=title.id||'modal-title';$('modal').setAttribute('aria-labelledby',title.id);}else $('modal').removeAttribute('aria-labelledby'); if($('modal').open)$('close-modal').focus();else $('modal').showModal();$('modal').scrollTop=0;}

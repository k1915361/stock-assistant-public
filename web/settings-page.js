// Settings page: opens the settings screen, binds its controls and search, and closes it.
// It reads app.js state (updateSettings, save, showWhatsNew, and the photo and plan helpers) when it runs,
// not when it loads, so it loads before app.js and only defines functions and one settings variable.
let settingsOpener=null;
function enterSettingsPage(html){settingsOpener=document.activeElement;if(pageOpen())hidePage({resume:false});document.body.classList.remove('whats-new-open');$('whats-new-screen').hidden=true;pauseTimer();$('settings-content').innerHTML=html;document.body.classList.add('settings-open');$('settings-screen').hidden=false;window.scrollTo(0,0);recordAppScreen();$('settings-back').onclick=()=>window.stockAssistantBack();$('settings-back').focus();}
function leaveSettingsPage(){if(!$('settings-screen'))return;const hadFocus=$('settings-screen').contains(document.activeElement);document.body.classList.remove('settings-open');$('settings-screen').hidden=true;resumeTimer();if(hadFocus){const target=[settingsOpener,$('app-menu')].find(el=>el&&el!==document.body&&el.isConnected&&el.getClientRects().length);target?.focus();}settingsOpener=null;}
const openSettings=()=>{
  if($('modal').open)$('modal').close();
  if(pageOpen())hidePage({resume:false});
  enterSettingsPage(`
<label for="settings-search">Search settings</label><input id="settings-search" type="search" placeholder="Try GPS, timer, photos or plans" autocomplete="off"><div id="settings-search-results" role="list" aria-live="polite"></div>
<section class="settings-group"><h3>Appearance</h3><label for="high-contrast-borders">Border contrast</label><select id="high-contrast-borders"><option value="off">Standard · subtle borders</option><option value="on">High contrast · stronger borders</option></select><p>Light or dark colours follow your device. This only changes border strength.</p>${native?.setRotationAllowed?'<label for="auto-rotate">Screen rotation</label><select id="auto-rotate"><option value="off">Portrait only · recommended</option><option value="on">Rotate with the phone</option></select><p>Portrait keeps scanning and results steady. Rotate lets the screen turn to landscape when you turn the phone.</p>':''}</section>
<section class="settings-group"><h3>Scanning</h3><label for="auto-scan">Start the next scan</label><select id="auto-scan"><option value="0">When I tap Next scan</option><option value="15">After 15 seconds</option><option value="30">After 30 seconds</option><option value="60">After 60 seconds</option></select><p>Editing or leaving the app pauses the timer.</p><button id="settings-image" data-icon="photo">Scan a photo / try a sample</button></section>
<section class="settings-group"><h3>Photos</h3><label for="photo-quality">Photo storage</label><select id="photo-quality"><option value="balanced">Balanced · up to 1600 px / 320 KB</option><option value="compact">Smaller files · up to 1280 px / 200 KB</option><option value="detail">More detail · up to 2048 px / 600 KB</option></select><p>New photos are compressed with a small preview. Sizes are targets; originals are not retained.</p></section>
<section class="settings-group"><h3>Location</h3><label for="scan-position">Save phone position</label><select id="scan-position"><option value="off">Off</option><option value="on">After scans and location photos</option></select><p id="position-help" class="muted">Uses foreground permission. Saved coordinates include accuracy and time. Indoor GPS may be imprecise and does not confirm a shelf.</p><div class="actions"><button id="position-map" data-icon="map">Last-seen map</button><button id="position-history" data-icon="history">Position history</button></div></section>
<section class="settings-group"><h3>Plans and backups</h3><div class="actions"><button id="settings-plans" data-icon="page">Stored plans</button><button id="settings-import" data-icon="upload">Import plans or backup</button><button id="export" data-icon="download">Export backup</button><button id="retailer-settings" data-icon="store">Dunelm store and prices</button></div><p>Import PDFs or a workspace ZIP. Data stays on this device. Keep exports private: they can include photos and GPS positions.</p></section>
<section class="settings-group"><h3>Help</h3><button id="settings-whats-new" data-icon="sparkle">What’s new</button><p>Read recent app updates. Notes are saved on this device.</p></section><div id="settings-offline"></div><details class="settings-group" open><summary>Recovery and saved photos</summary><div id="settings-recovery-tools"></div></details><details class="settings-group"><summary>Account and other options</summary><button id="settings-account" data-icon="account">Account and membership</button><p><a href="delete-account.html">Privacy and data deletion</a></p></details><div id="settings-ready-update"></div><p class="source settings-version">${currentBuildMarkup()}</p>`);
  const settingsGroups=[...document.querySelectorAll('#settings-content .settings-group')];
  const settingsGroupIcons={Appearance:'appearance',Scanning:'barcode',Photos:'image',Location:'location','Plans and backups':'page',Help:'help','Recovery and saved photos':'list','Account and other options':'account','Offline plans':'page'};
  const settingsIcon=name=>AppUI.iconMarkup(settingsGroupIcons[name]||'info','settings-group-icon');
  settingsGroups.forEach((group,index)=>{group.id='settings-group-'+index;const heading=group.querySelector('h3,summary');if(heading){heading.classList.add('settings-heading');heading.insertAdjacentHTML('afterbegin',settingsIcon(heading.textContent.trim()));}});

  const settingSearch=[
    {name:'Border contrast',terms:'high contrast appearance theme accessibility borders stronger outline dark black subtle',group:0,target:'high-contrast-borders'},
    {name:'Screen rotation',terms:'rotate rotation landscape portrait orientation turn screen auto',group:0,target:'auto-rotate'},
    {name:'Automatic next scan',terms:'auto scan timer countdown seconds delay',group:1,target:'auto-scan'},
    {name:'Scan a photo or try a sample',terms:'camera image barcode testing demo',group:1,target:'settings-image'},
    {name:'Photo storage and compression',terms:'photo image size compression quality smaller optimise storage',group:2,target:'photo-quality'},
    {name:'Save phone position',terms:'gps location coordinate accuracy after scan privacy',group:3,target:'scan-position'},
    {name:'Last-seen map',terms:'gps map where item located',group:3,target:'position-map'},
    {name:'Position history',terms:'gps location previous records observations',group:3,target:'position-history'},
    {name:'Stored plans · archive or delete a PDF',terms:'pdf files documents offline downloaded data archive remove outdated wrong duplicate plan',group:4,target:'settings-plans'},
    {name:'Import plans or backup',terms:'pdf zip add winter seasonal workspace upload',group:4,target:'settings-import'},
    {name:'Export backup',terms:'save data copy export photos history gps',group:4,target:'export'},
    {name:'Dunelm store and prices',terms:'retailer stock price shop click collect',group:4,target:'retailer-settings'},
    {name:'What’s new',terms:'version release update changes history',group:5,target:'settings-whats-new'},
    {name:'Account and membership',terms:'sign in google login paid subscription',group:7,target:'settings-account'}
  ];
  const settingsSearch=$('settings-search'),settingsSearchResults=$('settings-search-results');
  const renderSettingSearch=()=>{
    const terms=settingsSearch.value.toLocaleLowerCase('en-GB').trim().split(/\s+/).filter(Boolean);
    if(!terms.length){settingsSearchResults.innerHTML='';settingsGroups.forEach(group=>group.hidden=false);return;}
    const hits=settingSearch.filter(item=>$(item.target)&&terms.every(term=>(item.name+' '+item.terms).toLocaleLowerCase('en-GB').includes(term)));
    settingsGroups.forEach(group=>group.hidden=true);
    settingsSearchResults.innerHTML=hits.length?hits.map(item=>`<button class="setting-search-hit" type="button" data-setting-target="${item.target}" data-setting-group="${item.group}" data-icon="search">${item.name}<small>${settingsGroups[item.group]?.querySelector('h3,summary')?.textContent||'Account'}</small></button>`).join(''):'<p class="muted">No matching setting. Try GPS, timer, photo size or plans.</p>';
  };
  settingsSearch.oninput=renderSettingSearch;
  $('settings-whats-new').onclick=showWhatsNew;
  settingsSearchResults.onclick=event=>{
    const hit=event.target.closest('[data-setting-target]');if(!hit)return;
    const group=settingsGroups[Number(hit.dataset.settingGroup)];if(group){group.hidden=false;if(group instanceof HTMLDetailsElement)group.open=true;}
    const target=$(hit.dataset.settingTarget);if(!target)return;
    settingsSearch.value='';renderSettingSearch();target.scrollIntoView({block:'nearest'});target.focus();
  };
  settingsSearchResults.onkeydown=event=>{if(event.key==='Escape'&&settingsSearch.value){event.preventDefault();settingsSearch.value='';renderSettingSearch();settingsSearch.focus();}};
  $('high-contrast-borders').value=state.settings.highContrastBorders?'on':'off';$('high-contrast-borders').onchange=()=>{const enabled=$('high-contrast-borders').value==='on';if(!updateSettings({highContrastBorders:enabled})){$('high-contrast-borders').value=state.settings.highContrastBorders?'on':'off';return;}document.documentElement.dataset.highContrast=enabled?'true':'false';};
  if(native?.setRotationAllowed){$('auto-rotate').value=native.rotationAllowed()?'on':'off';$('auto-rotate').onchange=()=>native.setRotationAllowed($('auto-rotate').value==='on');}
  if(stateReadFailed)$('settings-content').insertAdjacentHTML('afterbegin','<p role="alert">Saved data is unreadable. Changes are paused to protect it. Export a recovery backup with the original data for repair. Keep this backup private.</p>');
  if(window.LocalPlatform?.restoreReviews){
   $('settings-recovery-tools').insertAdjacentHTML('beforeend','<button id="restored-data-status" data-icon="info">Restored data status</button>');
   $('restored-data-status').onclick=restoredDataStatus;
  }
  if(!native&&window.LocalPlatform?.pendingPhotos){
   $('settings-recovery-tools').insertAdjacentHTML('beforeend','<h3>Photo recovery</h3><p id="web-photo-recovery">Checking retained photos…</p><button id="retry-web-photos" data-icon="refresh">Retry photo recovery</button>');
   const info=$('web-photo-recovery');LocalPlatform.pendingPhotos().then(result=>{if(info.isConnected)info.textContent=result.records.length+' completed photos waiting for their original item/workspace. '+(result.invalid?'Unreadable records are kept for review.':'');}).catch(()=>{if(info.isConnected)info.textContent='Recovery is unavailable. Tickets and files are retained; export a backup.';});
   $('retry-web-photos').onclick=async()=>{const result=await LocalPlatform.recoverPhotos();if(info.isConnected)info.textContent=result.recovered+' photos recovered. Original ownership is kept; remaining photos need their original workspace or storage space.';};
  }
  if(nativeWriter?.stale()){$('settings-content').insertAdjacentHTML('beforeend','<button id="reload-native-workspace" data-icon="refresh">Refresh saved history</button>');$('reload-native-workspace').onclick=()=>window.reloadNativeWorkspace();}
  if(native?.pendingPhotos){const pending=nativePendingPhotos();$('settings-recovery-tools').insertAdjacentHTML('beforeend','<h3>Photo recovery</h3><p>'+ (pending.unavailable?'Recovery could not be read. Existing photos and tickets are retained; export a private backup.':pending.records.length+' completed photos waiting to save. Recovery keeps the original item and capture time.')+'</p><button id="retry-photos" data-icon="refresh">Retry photo recovery</button><button id="saved-labels" data-icon="bookmarks">Saved label photos</button>');$('retry-photos').onclick=()=>window.onNativePhotosReady();$('saved-labels').onclick=()=>{const labels=visibleEvents().filter(e=>e.kind==='label-photo').slice().reverse();openPage('app:label-photos',''+labels.map((e,i)=>`<article class="card"><p>${escapeHTML(e.productName||e.product||'Item not yet identified')} · ${date(e.at)}</p><img class="location-photo" src="${/^local-/.test(e.thumbnail||e.photo)?'':escapeHTML(e.thumbnail||e.photo)}" ${/^local-/.test(e.thumbnail||e.photo)?`data-local-photo="${escapeHTML(e.thumbnail||e.photo)}"`:''} alt="Saved label photo for ${escapeHTML(e.productName||e.product||'an unidentified item')}"><button data-label-review="${i}" data-icon="label">Review item details</button></article>`).join('')+(labels.length?'':'<p>No saved label photos.</p>'));resolvePhotos();document.querySelectorAll('[data-label-review]').forEach(b=>b.onclick=()=>{const e=labels[Number(b.dataset.labelReview)];productForm({barcode:e.product,name:e.productName,labelPhoto:e.photo,labelEvent:e.id,source:'label-photo'});});};}
  $('photo-quality').value=state.settings?.photoQuality||'balanced';$('photo-quality').onchange=()=>{if(!updateSettings({photoQuality:$('photo-quality').value})){$('photo-quality').value=window.photoQuality();return;}if(native)native.photoProfile(state.settings.photoQuality);};
  $('settings-image').onclick=()=>ImageTest.open();$('auto-scan').value=String(state.settings.autoScan);$('auto-scan').onchange=()=>{if(!updateSettings({autoScan:Number($('auto-scan').value)})){$('auto-scan').value=String(state.settings.autoScan);return;}if(scanCycle){armTimer();pauseTimer();}};
  $('scan-position').value=state.settings?.scanPosition?'on':'off';$('scan-position').onchange=()=>{
    const previous=workspace.getState();workspace.setState({...previous,settings:{...previous.settings,scanPosition:$('scan-position').value==='on'}});
    if(!save()){workspace.setState(previous);$('scan-position').value=previous.settings?.scanPosition?'on':'off';return;}
    if(native)native.locationEnabled(state.settings.scanPosition,true);if(!state.settings.scanPosition)cancelPosition();
  };
  $('position-map').onclick=()=>LocationMap.open(visibleEvents());$('retailer-settings').onclick=()=>RetailerUI.settings();
  $('position-history').onclick=()=>showHistory(visibleEvents().filter(e=>e.kind==='phone-position'),'','Position history');
  $('export').onclick=()=>{if(!window.LocalPlatform)return;const job=native?LocalPlatform.nativeBackup(state):LocalPlatform.backup(state);job.catch(()=>{$('status').textContent='Backup could not be created. Existing data is unchanged.';});};
  if(pendingWebUpdate){$('settings-ready-update').insertAdjacentHTML('beforeend','<button id="apply-web-update" data-icon="download">Apply ready app update</button>');$('apply-web-update').onclick=applyWebUpdate;}
  if(window.BundlePlans?.available())setupBundleSettings();
  document.querySelectorAll('#settings-offline .settings-group h3').forEach(heading=>{heading.classList.add('settings-heading');heading.insertAdjacentHTML('afterbegin',settingsIcon(heading.textContent.trim()));});

  $('settings-account').onclick=()=>AccountUI.open();$('settings-plans').onclick=()=>showStoredPlans();
  $('settings-import').onclick=()=>{$('modal').close();$('import-plans').click();};
};

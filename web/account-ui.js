'use strict';
window.AccountUI=(()=>{
  const KEY='stock-assistant-account',config=window.STOCK_SERVICES||{},native=!!window.Native;
  let account={},claims=null,resolved=false,scriptJobs=new Map();
  try{account=JSON.parse(localStorage.getItem(KEY)||'{}');}catch{}
  const ready=()=>!native&&!!config.googleClientId&&/^https:\/\//.test(config.apiBase)&&!!config.entitlementKey;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function store(){localStorage.setItem(KEY,JSON.stringify(account));}
  async function script(url){if(scriptJobs.has(url))return scriptJobs.get(url);const job=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.async=true;s.onload=resolve;s.onerror=()=>reject(Error('Account service could not load'));document.head.append(s);});scriptJobs.set(url,job);return job;}
  async function api(path,body,authenticated=true){
    const response=await fetch(config.apiBase.replace(/\/$/,'')+path,{method:body===undefined?'GET':'POST',cache:'no-store',headers:{'Content-Type':'application/json',...(authenticated&&account.token?{Authorization:'Bearer '+account.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});
    if(response.status===401){account={};claims=null;store();}
    const data=await response.json();if(!response.ok)throw Error(data.error||'Account service unavailable');return data;
  }
  async function accept(data){account={...account,...data};claims=await MembershipCore.verify(account.entitlement,config.entitlementKey,location.origin,account.user?.id);if(account.entitlement&&!claims)throw Error('Membership proof could not be verified');store();resolved=true;}
  async function refresh(){
    claims=await MembershipCore.verify(account.entitlement,config.entitlementKey,location.origin,account.user?.id);
    if(ready()&&account.token&&navigator.onLine){try{await accept(await api('/session'));}catch{resolved=false;return;}}
    resolved=true;
  }
  function has(feature){return MembershipCore.has(claims,feature);}
  async function open(){
    window.openAccountModal(`<h2>Account and membership</h2><p><strong>£1/month</strong> · no ads, saved workflow presets and pinned item lookups.</p><p class="muted">Scanning, plan search, offline plans, photos and existing history remain available without membership.</p><div id="account-content">Checking account…</div><p class="muted">No payment is taken by opening this screen.</p>`);
    await refresh();const box=document.getElementById('account-content');if(!box)return;
    if(!ready()){box.innerHTML=`<p>${native?'Google sign-in, AdMob and Google Play subscriptions are being prepared for Android.':'Google sign-in and membership are not connected yet.'}</p><p class="muted">Ads are off. ${native?'':'Publisher IDs, a sign-in project and the payment backend are needed before activation.'}</p>`;return;}
    box.innerHTML=`${account.user?`<p>Signed in as ${esc(account.user.name||account.user.email)}</p><p>${has('no-ads')?'Membership active · ads removed':'Free account'}</p>${config.billingEnabled?`<button id="account-subscribe">${has('no-ads')?'Manage / cancel membership':'Join for £1/month'}</button><button id="account-restore">Refresh membership</button>`:'<p>Payments are not active yet.</p>'}${has('workflow-presets')?'<button id="account-presets">Saved workflow presets</button>':''}<button id="account-signout">Sign out</button>`:'<div id="google-signin"></div>'}<p id="account-error" role="status"></p><div id="account-ad" hidden></div>`;
    const error=e=>{const node=document.getElementById('account-error');if(node)node.textContent=e.message;};
    if(account.user){
      document.getElementById('account-signout').onclick=async()=>{try{await api('/auth/signout',{});}catch{}account={};claims=null;store();open();};
      if(document.getElementById('account-presets'))document.getElementById('account-presets').onclick=()=>window.openWorkflowPresets();
      if(document.getElementById('account-restore'))document.getElementById('account-restore').onclick=()=>open();
      if(document.getElementById('account-subscribe'))document.getElementById('account-subscribe').onclick=async()=>{try{const result=await api(has('no-ads')?'/billing/portal':'/billing/checkout',{});const url=new URL(result.url);if(!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname)||url.protocol!=='https:')throw Error('Unexpected payment destination');location.assign(url.href);}catch(e){error(e);}};
    }else{
      try{const challenge=await api('/auth/challenge',{},false);await script('https://accounts.google.com/gsi/client');
        google.accounts.id.initialize({client_id:config.googleClientId,nonce:challenge.nonce,auto_select:false,callback:async response=>{try{await accept(await api('/auth/google',{credential:response.credential,nonce:challenge.nonce},false));open();}catch(e){error(e);}}});
        const target=document.getElementById('google-signin');if(target)google.accounts.id.renderButton(target,{theme:'outline',size:'large'});
      }catch(e){error(e);}
    }
    showAd().catch(error);
  }
  async function showAd(){
    const ads=config.ads||{},target=document.getElementById('account-ad');
    if(!target||!ads.enabled||native||!navigator.onLine||!resolved||has('no-ads'))return;
    if(!/^ca-pub-\d{16}$/.test(ads.client)||!/^\d+$/.test(ads.slot)||!/^https:\/\/fundingchoicesmessages\.google\.com\/i\/pub-\d+/.test(ads.cmpScriptUrl))return;
    await script(ads.cmpScriptUrl);
    const consent=await new Promise(resolve=>{let finished=false;const finish=value=>{if(!finished){finished=true;resolve(value);}};setTimeout(()=>finish(false),8000);
      if(typeof window.__tcfapi!=='function'){finish(false);return;}
      window.__tcfapi('addEventListener',2,(data,success)=>{if(!success)return;if(['tcloaded','useractioncomplete'].includes(data.eventStatus)){finish(data.gdprApplies===false||data.gdprApplies===true&&data.vendor?.consents?.[755]===true&&[1,2,3,4,7,9,10].every(p=>data.purpose?.consents?.[p]===true));}});
    });
    if(!target.isConnected||!MembershipCore.adEligible({configured:ads.enabled,native,online:navigator.onLine,resolved,claims,consent}))return;
    target.hidden=false;target.innerHTML=`<p class="muted">Advertisement</p><ins class="adsbygoogle" style="display:block" data-ad-client="${ads.client}" data-ad-slot="${ads.slot}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
    await script('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+ads.client);
    if(target.isConnected&&!has('no-ads'))(window.adsbygoogle=window.adsbygoogle||[]).push({});
  }
  return {open,has,refresh};
})();

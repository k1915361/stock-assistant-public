(function(root){
  'use strict';
  const decode=part=>Uint8Array.from(atob(part.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  async function verify(proof,jwk,audience,subject,now=Date.now(),cryptoAPI=crypto){
    try{
      if(typeof proof!=='string'||proof.length>8192||!jwk||!subject)return null;
      const [header,payload,signature,...extra]=proof.split('.');if(extra.length||!signature)return null;
      const metadata=JSON.parse(new TextDecoder().decode(decode(header)));if(metadata.alg!=='EdDSA'||metadata.typ!=='JWT')return null;
      const key=await cryptoAPI.subtle.importKey('jwk',jwk,{name:'Ed25519'},false,['verify']);
      if(!await cryptoAPI.subtle.verify('Ed25519',key,decode(signature),new TextEncoder().encode(header+'.'+payload)))return null;
      const claims=JSON.parse(new TextDecoder().decode(decode(payload))),seconds=Math.floor(now/1000);
      if(claims.iss!=='stock-assistant'||claims.aud!==audience||claims.sub!==subject||!Number.isFinite(claims.exp)||claims.exp<=seconds||!Number.isFinite(claims.iat)||claims.iat>seconds+30||claims.exp-claims.iat>7*86400||!Array.isArray(claims.features))return null;
      return claims;
    }catch{return null;}
  }
  const has=(claims,feature,now=Date.now())=>!!claims&&claims.exp>Math.floor(now/1000)&&claims.features.includes(feature);
  function adEligible({configured,native,online,resolved,claims,consent}){return !!configured&&!native&&online&&resolved&&!has(claims,'no-ads')&&consent===true;}
  const api={verify,has,adEligible};if(typeof module==='object'&&module.exports)module.exports=api;root.MembershipCore=api;
})(typeof window==='object'?window:globalThis);

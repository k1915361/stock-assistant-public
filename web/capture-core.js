/* Capture ownership assertions are local bindings, not authentication. */
(function(root){
 'use strict';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
 const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
 const fail=()=>{throw Error('Capture ownership needs a valid original item/workspace.');};
 const text=(value,max,empty=false)=>typeof value==='string'&&value.length<=max&&(empty||!!value.trim());
 const closed=(value,keys)=>plain(value)&&Object.keys(value).sort().join(',')===keys.sort().join(',');
 const canonical=value=>JSON.stringify(value,function(key,value){return plain(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value;});
 const copy=value=>JSON.parse(JSON.stringify(value));
 function identity(value){
  if(!plain(value)||typeof value.profileId!=='string'||typeof value.workspaceId!=='string'||!UUID.test(value.profileId)||!UUID.test(value.workspaceId)||!text(value.actorId,128))fail();
  return {profileId:value.profileId,workspaceId:value.workspaceId,actorId:value.actorId};
 }
 function product(value){
  if(!plain(value))fail();
  if(value.namespace==='sku'){if(!closed(value,['namespace','raw','retailerId'])||!text(value.raw,128)||!text(value.retailerId,128))fail();}
  else if(value.namespace==='manual'){if(!closed(value,['namespace','raw'])||typeof value.raw!=='string'||!UUID.test(value.raw))fail();}
  else if(value.namespace==='gtin'){
   if(!closed(value,['namespace','raw'])||typeof value.raw!=='string'||! /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value.raw))fail();
   let sum=0;for(let i=value.raw.length-2,m=3;i>=0;i--,m=4-m)sum+=Number(value.raw[i])*m;if((10-sum%10)%10!==Number(value.raw.at(-1)))fail();
  }else fail();
  return copy(value);
 }
 function scope(value,target){
  if(!closed(value,['schema','mode','profileId','workspaceId','actorId','eventId','product'])||value.schema!==1||!['local','shared'].includes(value.mode)||typeof value.eventId!=='string'||!UUID.test(value.eventId))fail();
  identity(value);const item=product(value.product);
  if(item.namespace!=='manual'&&item.raw!==target.product)fail();
  if(item.namespace==='manual'&&target.product&&!['manual-'+item.raw,item.raw].includes(target.product))fail();
  return copy(value);
 }
 function context(value={},purpose){
  if(!['label','location'].includes(purpose))fail();
  const target={product:value.product??'',productName:value.productName??''};
  if(!text(target.product,128,true)||!text(target.productName,500,true)||purpose==='location'&&!target.product&&!target.productName)fail();
  if(value.captureScope!==undefined)target.captureScope=scope(value.captureScope,target);
  return target;
 }
 const sameIdentity=(first,second)=>first===null&&second===null||!!first&&!!second&&['profileId','workspaceId','actorId'].every(key=>first[key]===second[key]);
 function visible(events,active=null){
  const selected=active===null?null:identity(active);
  return events.filter(event=>sameIdentity(event.workspaceContext||event.photoInfo?.captureScope||null,selected));
 }
 function committed(ticket,state){
  if(!state||!Array.isArray(state.events))return false;
  const id=ticket.captureId||ticket.id,expected=ticket.photoUrl||ticket.photo;
  const event=state.events.find(event=>event.id===id),kind=ticket.purpose==='label'?'label-photo':'location';
  const reference=event&&(event.photo===expected||event.photo?.startsWith('local-photo:')&&event.photoInfo?.captureId===id&&event.photoInfo?.photo===ticket.photo);
  if(!event||event.kind!==kind||event.product!==ticket.product||!reference)return false;
  if(!ticket.captureScope)return !event.workspaceContext&&!event.photoInfo?.captureScope;
  let bound;try{bound=scope(ticket.captureScope,ticket);}catch{return false;}
  if(canonical(event.photoInfo?.captureScope)!==canonical(bound)||!sameIdentity(event.workspaceContext,identity(bound)))return false;
  if(bound.mode==='local')return true;
  const bucket=state.sharingReplica?.schema===1&&state.sharingReplica.replicas?.[JSON.stringify([bound.profileId,bound.workspaceId])];
  return !!bucket?.pending?.some(entry=>sameIdentity(entry.origin,bound)&&entry.intent?.eventId===bound.eventId&&entry.intent.localEventId===id&&entry.intent.workspaceId===bound.workspaceId&&entry.intent.kind===(ticket.purpose==='label'?'product-version':'location')&&canonical(entry.intent.entity?.product)===canonical(bound.product));
 }
 const api={identity,product,scope,context,sameIdentity,visible,committed,canonical};
 if(typeof module!=='undefined')module.exports=api;root.CaptureCore=api;
})(typeof window==='undefined'?globalThis:window);

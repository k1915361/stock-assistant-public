// Deliberate local recovery. Imported sharing/session/receipt fields never enroll.
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const canonical=value=>JSON.stringify(value,(_,value)=>plain(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value);
const clone=value=>JSON.parse(JSON.stringify(value));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const kinds=new Set(['location','label-photo','product','phone-position','plan-mark','plan-comment','retailer-link']);
function readable(event){
 if(!plain(event)||typeof event.id!=='string'||!event.id||!kinds.has(event.kind))return false;
 for(const key of ['product','productName','barcode','name','note','area','section','photo','thumbnail','labelPhoto','url','doc'])if(event[key]!==undefined&&typeof event[key]!=='string')return false;
 if(event.kind==='product'&&(!event.barcode||!event.name))return false;
 if(event.kind==='location'&&!event.product&&!event.productName)return false;
 if(event.kind==='label-photo'&&!event.photo)return false;
 if(['plan-mark','plan-comment'].includes(event.kind)&&!event.doc)return false;
 if(event.kind==='plan-mark'&&!['outdated','unverified'].includes(event.mark))return false;
 if(event.kind==='phone-position'&&(!plain(event.fix)||event.fix.latitude!==undefined&&(!Number.isFinite(event.fix.latitude)||Math.abs(event.fix.latitude)>90||!Number.isFinite(event.fix.longitude)||Math.abs(event.fix.longitude)>180||!Number.isFinite(event.fix.horizontalAccuracyMetres)||event.fix.horizontalAccuracyMetres<=0)))return false;
 return true;
}
export {canonical};
export function previewRecovery(row,root,active,core){
 if(row?.kind!=='workspace-restore-review'||row.schema!==1||!plain(row.sourcePack)||!Array.isArray(row.restoredState?.events))throw Error('This evidence needs repair. Keep a private export.');
 if(!Array.isArray(root.events)||new Set(root.events.map(event=>event.id)).size!==root.events.length)throw Error('Current history needs review before recovery.');
 active=active===null?null:core.identity(active);
 const target=new Map(root.events.map(event=>[event.id,event])),references=new Map(row.photoMapping||[]),candidates=[];
 const sharedIds=new Set();const sharing=row.sourcePack.state?.sharingReplica;
 if(sharing?.schema===1&&plain(sharing.replicas))for(const bucket of Object.values(sharing.replicas))for(const record of [...(Array.isArray(bucket?.pending)?bucket.pending:[]),...(Array.isArray(bucket?.records)?bucket.records:[]),...(Array.isArray(bucket?.archivedRecords)?bucket.archivedRecords:[])])if(typeof record?.intent?.localEventId==='string')sharedIds.add(record.intent.localEventId);
 function owner(event,ticket){
  if(sharedIds.has(event.id))return 'Shared updates need verified account recovery.';
  const scope=ticket?.captureScope||event.photoInfo?.captureScope;
  if(scope){core.scope(scope,{product:ticket?.product??event.product??''});if(scope.mode==='shared')return 'Shared updates need verified account recovery.';}
  let original=scope?core.identity(scope):null;
  if(event.workspaceContext!==undefined&&event.workspaceContext!==null){const bound=core.identity(event.workspaceContext);if(original&&!core.sameIdentity(bound,original))return 'Original ownership is inconsistent.';original=bound;}
  if(!core.sameIdentity(original,active))return 'This belongs to another worker or workspace.';
  if(!scope&&original&&sharing!==undefined)return 'Scoped shared history needs verified account recovery.';
  return '';
 }
 function add(key,event,ticket=null){
  let reason='';try{
   if(!readable(event))reason='This record format needs review.';
   else if(event.photoInfo&&Object.hasOwn(event.photoInfo,'captureScope')&&!event.photoInfo.captureScope)reason='Original ownership is unreadable.';
   else reason=owner(event,ticket);
  }catch{reason='Original ownership is unreadable.';}
  if(reason){candidates.push({key,status:'held',reason});return;}
  const prior=target.get(event.id),same=prior&&(canonical(prior)===canonical(event)||ticket&&core.committed(ticket,{events:[prior]}));
  let showPrior=false;try{showPrior=!!prior&&!owner(prior,null);}catch{}
  candidates.push({key,event:clone(event),...(ticket?{ticket:clone(ticket)}:{}),...(showPrior?{existing:clone(prior)}:{}),status:prior?(same?'existing':'conflict'):'ready',reason:prior&&!same?'A different saved version has this ID. Both versions are kept.':''});
 }
 row.restoredState.events.forEach((event,index)=>{
  const fields=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!['doc','photo','thumbnail','labelPhoto'].includes(key)));
  const raw=row.sourcePack.state?.events?.find(raw=>plain(raw)&&raw.id===event.id&&canonical(fields(raw))===canonical(fields(event)));
  if(!raw){candidates.push({key:'e:'+index,status:'held',reason:'Original source references need review.'});return;}
  if(['photo','thumbnail','labelPhoto'].some(key=>raw[key]&&!event[key])){candidates.push({key:'e:'+index,status:'held',reason:'An original image is missing.'});return;}
  add('e:'+index,event);
 });
 const tickets=row.sourcePack.pendingPhotoTickets;
 if(Array.isArray(tickets))tickets.forEach((ticket,index)=>{
  const key='p:'+index;try{
   core.context(ticket,ticket.purpose);
   if(ticket.kind!=='photo-capture'||ticket.schema!==1||typeof ticket.captureId!=='string'||!UUID.test(ticket.captureId)||ticket.id!=='capture-'+ticket.captureId||!Number.isFinite(ticket.capturedAt)||ticket.capturedAt<=0||ticket.capturedAt>8640000000000000||!Number.isFinite(ticket.startedAt)||!['balanced','compact','detail'].includes(ticket.quality)||!Number.isInteger(ticket.width)||ticket.width<1||!Number.isInteger(ticket.height)||ticket.height<1||!Number.isInteger(ticket.bytes)||ticket.bytes<1)throw Error('The original photo was incomplete or unreadable.');
   const photo=references.get(ticket.photo),thumbnail=references.get(ticket.thumbnail);if(!photo||!thumbnail)throw Error('The original photo pair is missing.');
   const event={id:ticket.captureId,kind:ticket.purpose==='label'?'label-photo':'location',product:ticket.product,productName:ticket.productName,at:new Date(ticket.capturedAt).toISOString(),worker:'Me',photo,thumbnail,photoInfo:{...clone(ticket),recovery:true},...(ticket.captureScope?{workspaceContext:core.identity(ticket.captureScope)}:{}),...(ticket.purpose==='label'?{}:{area:'',section:'',note:'',action:'seen'})};
   add(key,event,ticket);
  }catch(error){candidates.push({key,status:'held',reason:error.message||'The original photo needs review.'});}
 });
 return {reviewId:row.id,identity:active,candidates};
}
export function selectedRecovery(preview,keys){
 if(!Array.isArray(keys)||!keys.length||keys.length>25||keys.some(key=>typeof key!=='string')||new Set(keys).size!==keys.length)throw Error('Select between 1 and 25 records to recover.');
 const selected=keys.map(key=>preview.candidates.find(candidate=>candidate.key===key));
 if(selected.some(candidate=>!candidate||!['ready','existing'].includes(candidate.status)))throw Error('A selected record is not available for local recovery.');
 if(new Set(selected.map(candidate=>candidate.event.id)).size!==selected.length)throw Error('Choose one version for each original record ID. Other versions stay in the backup.');
 return selected;
}
export async function recoveredRoot(root,preview,selected,{digest,at}){
 if(root.restoreRecovery!==undefined&&(root.restoreRecovery?.schema!==1||!Array.isArray(root.restoreRecovery.receipts)))throw Error('Saved recovery receipts need review.');
 const next=clone(root),receipts=clone(root.restoreRecovery?.receipts||[]),ids=new Set(next.events.map(event=>event.id)),originalIds=new Set(ids);
 const group=event=>{const context=event.workspaceContext||event.photoInfo?.captureScope,raw=String(event.doc||event.barcode||event.product||'').trim(),item=/^[\d\s-]+$/.test(raw)?raw.replace(/[\s-]/g,''):raw;return canonical({identity:context?Object.fromEntries(['profileId','workspaceId','actorId'].map(key=>[key,context[key]])):null,kind:event.kind==='plan-mark'||event.kind==='plan-comment'?'plan':event.kind,item:/^0\d{12}$/.test(item)?item.slice(1):item});};
 for(const candidate of selected){
  if(!ids.has(candidate.event.id)){
   // Local reducers use arrival order. Recovery is historical evidence: keep
   // already-saved answers later in their entity's history, never override them.
   const index=next.events.findIndex(event=>originalIds.has(event.id)&&group(event)===group(candidate.event));
   if(index<0)next.events.push(clone(candidate.event));else next.events.splice(index,0,clone(candidate.event));ids.add(candidate.event.id);
  }
  const actual=next.events.find(event=>event.id===candidate.event.id),body={reviewId:preview.reviewId,key:candidate.key,eventId:actual.id,eventSHA256:await digest(canonical(actual)),identity:preview.identity};
  const id='restore-receipt-'+await digest(canonical(body)),prior=receipts.find(receipt=>receipt.id===id);
  if(prior){const {id:ignored,at:time,...old}=prior;if(canonical(old)!==canonical(body))throw Error('A recovery receipt conflicts. Original evidence is retained.');}
  else receipts.push({id,...body,at});
 }
 next.restoreRecovery={schema:1,receipts};return next;
}
export function fileToken(row){
 if(!row)return '';
 return canonical({id:row.id,kind:row.kind,photoSHA256:row.photoSHA256,thumbnailSHA256:row.thumbnailSHA256,blob:row.blob&&{size:row.blob.size,type:row.blob.type},thumbnail:row.thumbnail&&{size:row.thumbnail.size,type:row.thumbnail.type},width:row.width,height:row.height,bytes:row.bytes,document:row.document,importerVersion:row.importerVersion});
}

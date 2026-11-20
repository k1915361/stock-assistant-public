// Imported ownership/receipts are evidence, never current enrollment or cursors.
export const REVIEW_KIND='workspace-restore-review';
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const copy=value=>JSON.parse(JSON.stringify(value));
export function needsReview(pack){
 return Object.hasOwn(pack.state,'sharingReplica')||Object.hasOwn(pack.state,'restoreRecovery')||
  ['pendingPhotoTickets','recoveryRootJournals','recoveryOriginalState','recoveryNativePhotoTickets'].some(key=>Object.hasOwn(pack,key))||
  new Set(pack.state.events.map(event=>event?.id)).size!==pack.state.events.length||
  pack.state.events.some(event=>!plain(event)||typeof event.id!=='string'||!event.id||typeof event.kind!=='string'||
   event.workspaceContext!=null||plain(event.photoInfo)&&Object.hasOwn(event.photoInfo,'captureScope'));
}
export function reviewSummary(row){
 // Malformed/unknown records remain exportable; do not reinterpret their data.
 if(row?.kind!==REVIEW_KIND||row.schema!==1||!plain(row.sourcePack)||!plain(row.restoredState))return {id:row?.id,unreadable:true};
 const pack=row.sourcePack;
 return {id:row.id,events:Array.isArray(row.restoredState.events)?row.restoredState.events.length:0,
  photos:Array.isArray(pack.pendingPhotoTickets)?pack.pendingPhotoTickets.length:0,
  nativeTickets:Array.isArray(pack.recoveryNativePhotoTickets)?pack.recoveryNativePhotoTickets.length:0,
  sharing:Object.hasOwn(pack.state||{},'sharingReplica')||Object.hasOwn(pack,'recoveryRootJournals'),
  originalState:Object.hasOwn(pack,'recoveryOriginalState'),held:true};
}
export async function prepareReview({pack,restoredState,photoMapping,documentMapping=new Map(),existing=[],digest}){
 const result=[];
 const mapReference=value=>photoMapping.get(value)||value;
 // Flatten previous review rows instead of nesting them on every backup cycle.
 if(pack.restoreReviews!==undefined&&!Array.isArray(pack.restoreReviews))throw Error('Unsupported restored review evidence; keep the original ZIP.');
 for(const raw of pack.restoreReviews||[]){
  if(!plain(raw)||typeof raw.id!=='string')throw Error('Unreadable restored review record; keep the original ZIP.');
  const row=raw.kind===REVIEW_KIND&&/^restore-review-[0-9a-f]{64}$/.test(raw.id)?copy(raw):{kind:REVIEW_KIND,schema:0,id:'restore-review-'+await digest(JSON.stringify(raw)),rawOriginal:copy(raw)};
  if(plain(row.restoredState)&&Array.isArray(row.restoredState.events))row.restoredState.events=row.restoredState.events.map(event=>({...event,...(event.doc?{doc:documentMapping.get(event.doc)||event.doc}:{}),...Object.fromEntries(['photo','thumbnail','labelPhoto'].filter(key=>event[key]).map(key=>[key,mapReference(event[key])]))}));
  if(Array.isArray(row.photoMapping))row.photoMapping=row.photoMapping.map(([original,current])=>[original,mapReference(current)]);
  if(Array.isArray(row.documentMapping))row.documentMapping=row.documentMapping.map(([original,current])=>[original,documentMapping.get(current)||current]);
  await retain(row);
 }
 if(needsReview(pack)){
  const sourcePack=copy(pack);delete sourcePack.restoreReviews;
  const body={kind:REVIEW_KIND,schema:1,sourceSHA256:await digest(JSON.stringify(sourcePack)),sourcePack,restoredState:copy(restoredState),photoMapping:[...photoMapping],documentMapping:[...documentMapping]};
  body.id='restore-review-'+await digest(JSON.stringify(body));await retain(body);
 }
 async function retain(row){
  let prior=existing.find(value=>value.id===row.id);
  if(prior&&JSON.stringify(prior)!==JSON.stringify(row)){
   // Same-ID different evidence must survive, never silently drop the import.
   row={...row,id:'restore-review-'+await digest(JSON.stringify(row))};prior=existing.find(value=>value.id===row.id);
  }
  if(!prior&&!result.some(value=>value.id===row.id))result.push(row);
 }
 return result;
}

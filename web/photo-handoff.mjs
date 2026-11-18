// Durable browser tickets. Empty/cancelled and invalid evidence is never deleted.
export function createPhotoHandoff({database,context,deliver,readCommitted}){
 const PREFIX='capture-',KIND='photo-capture';let recovery=Promise.resolve();
 async function rows(){const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction('files'),request=tx.objectStore('files').getAll();let result;request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);});}
 async function get(id){const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction('files'),request=tx.objectStore('files').get(PREFIX+id);let result;request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);});}
 function validate(ticket){
  const allowed=['id','kind','schema','captureId','product','productName','purpose','quality','startedAt','photo','thumbnail','captureScope','capturedAt','width','height','bytes','originalBytes'];
  if(ticket?.kind!==KIND||ticket.schema!==1||Object.keys(ticket).some(key=>!allowed.includes(key))||typeof ticket.captureId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(ticket.captureId)||ticket.id!==PREFIX+ticket.captureId||ticket.photo!=='local-photo:photo-'+ticket.captureId||ticket.thumbnail!=='local-thumb:photo-'+ticket.captureId||!Number.isFinite(ticket.startedAt)||ticket.startedAt<=0||!['balanced','compact','detail'].includes(ticket.quality))throw Error('Unreadable photo ticket; retain for review.');
  context(ticket,ticket.purpose);return ticket;
 }
 async function begin(target,purpose,quality){
  const id=crypto.randomUUID(),ticket={id:PREFIX+id,kind:KIND,schema:1,captureId:id,...context(target,purpose),purpose,quality,startedAt:Date.now(),photo:'local-photo:photo-'+id,thumbnail:'local-thumb:photo-'+id};
  const db=await database;await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite',{durability:'strict'});tx.objectStore('files').add(ticket);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Photo ticket not saved.'));});return ticket;
 }
 async function completed(id,saved,capturedAt){
  const ticket=validate(await get(id));if(!Number.isFinite(capturedAt)||capturedAt<=0||capturedAt>8640000000000000||!(saved.blob instanceof Blob)||!(saved.thumbnail instanceof Blob)||!saved.blob.size||!saved.thumbnail.size||!Number.isInteger(saved.width)||saved.width<1||!Number.isInteger(saved.height)||saved.height<1)throw Error('Photo pair unavailable; ticket retained.');
  const next={...ticket,capturedAt,width:saved.width,height:saved.height,bytes:saved.blob.size,originalBytes:saved.originalBytes};
  const db=await database;await new Promise((resolve,reject)=>{
   let failure;const tx=db.transaction('files','readwrite',{durability:'strict'}),table=tx.objectStore('files'),request=table.get(ticket.id);
   tx.oncomplete=resolve;tx.onabort=()=>reject(failure||tx.error||Error('Photo pair write aborted.'));
   request.onsuccess=()=>{try{const current=validate(request.result);if(JSON.stringify(current)!==JSON.stringify(ticket)||current.capturedAt)throw Error('Photo completion changed; original evidence retained.');table.add({id:'photo-'+id,kind:'photo',...saved});table.put(next);}catch(error){failure=error;tx.abort();}};
  });return next;
 }
 async function pending(){
  const records=await rows(),photos=new Map(records.filter(row=>row.kind==='photo').map(row=>[row.id,row])),ready=[];let invalid=0;
  for(const row of records.filter(row=>row.kind===KIND)){
   try{const ticket=validate(row),photo=photos.get('photo-'+ticket.captureId);if(!photo||!ticket.capturedAt)continue;
    if(photo.blob.type!=='image/jpeg'||photo.thumbnail.type!=='image/jpeg')throw Error('Invalid pair');
    const main=await createImageBitmap(photo.blob);const match=main.width===ticket.width&&main.height===ticket.height&&photo.blob.size===ticket.bytes;main.close();const thumb=await createImageBitmap(photo.thumbnail);thumb.close();if(!match)throw Error('Changed pair metadata');ready.push(ticket);
   }catch{invalid++;}
  }return {records:ready,invalid};
 }
 async function acknowledge(ticket){
  const committed=await readCommitted(ticket);if(!committed)return false;
  const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite'),table=tx.objectStore('files'),request=table.get(ticket.id);let removed=false,failure;
   tx.oncomplete=()=>resolve(removed);tx.onabort=()=>reject(failure||tx.error);
   request.onsuccess=()=>{try{const current=validate(request.result);if(JSON.stringify(current)!==JSON.stringify(ticket))return;table.delete(ticket.id);removed=true;}catch(error){failure=error;tx.abort();}};
  });
 }
 async function recover(liveId=''){
  const next=recovery.then(async()=>{const pendingPhotos=await pending();let recovered=0;for(const ticket of pendingPhotos.records){try{if(await deliver(ticket,ticket.captureId===liveId)&&await acknowledge(ticket))recovered++;}catch{/* Ownership/file evidence remains for retry/export. */}}return {...pendingPhotos,recovered};});
  recovery=next.catch(()=>{});return next;
 }
 return {begin,completed,pending,recover,acknowledge};
}

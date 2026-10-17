// Local whole-root journal. No transport, account binding or enrollment here.
export const JOURNAL_ID='workspace-sharing-root-v1';
export const JOURNAL_KIND='workspace-root-journal';
const fail=message=>{throw Error(message);};
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const canonical=value=>JSON.stringify(value,function(key,value){return plain(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value;});
function decode(encoded){
 const stored=encoded===null?{}:JSON.parse(encoded,(key,value)=>{if(typeof value==='number'&&!Number.isFinite(value))fail('Invalid workspace number; preserve its bytes');return value;});if(!plain(stored))fail('Invalid workspace root; preserve its bytes');
 const root={events:[],recent:[],settings:{},...stored};
 if(!plain(root)||!Array.isArray(root.events)||!Array.isArray(root.recent)||!plain(root.settings))fail('Invalid workspace root; preserve its bytes');
 const ids=new Set();for(const event of root.events){if(!plain(event)||typeof event.id!=='string'||!event.id||ids.has(event.id))fail('Local event IDs need review');ids.add(event.id);}
 if(root.sharingReplica!==undefined&&(root.sharingReplica?.schema!==1||!plain(root.sharingReplica.replicas)))fail('Unsupported sharing root; preserve its bytes');
 if(root.restoreRecovery!==undefined&&(root.restoreRecovery?.schema!==1||!Array.isArray(root.restoreRecovery.receipts)))fail('Unsupported recovery receipts; preserve the root');
 if(root.restoreRecovery){const ids=new Set();for(const receipt of root.restoreRecovery.receipts){if(!plain(receipt)||typeof receipt.id!=='string'||!/^restore-receipt-[0-9a-f]{64}$/.test(receipt.id)||ids.has(receipt.id))fail('Recovery receipt IDs need review');ids.add(receipt.id);}}
 return root;
}
function validate(record){
 if(record?.id!==JOURNAL_ID||record.kind!==JOURNAL_KIND||record.schema!==1||Object.keys(record).sort().join(',')!=='id,kind,mirrorBefore,revision,root,schema'||!Number.isSafeInteger(record.revision)||record.revision<1||typeof record.root!=='string'||record.mirrorBefore!==null&&typeof record.mirrorBefore!=='string')fail('Unsupported workspace journal; preserve it');
 decode(record.root);decode(record.mirrorBefore);
}
function mergeEvents(first,second){
 const events=[...first],ids=new Map(first.map(event=>[event.id,canonical(event)]));
 for(const event of second){if(ids.has(event.id)){if(ids.get(event.id)!==canonical(event))fail('Changed local event ID; preserve both roots for review');}else{events.push(event);ids.set(event.id,canonical(event));}}
 return events;
}
export function composeWorkspace(record,mirror){
 if(!record){if(mirror!==null)decode(mirror);return mirror;}
 validate(record);const committed=decode(record.root);
 if(mirror===record.mirrorBefore||mirror===record.root)return record.root;
 if(mirror===null)fail('Workspace mirror was removed; keep the committed journal for review');
 const current=decode(mirror),before=decode(record.mirrorBefore);
 const sharing=canonical(current.sharingReplica??null);
 if(sharing!==canonical(before.sharingReplica??null)&&sharing!==canonical(committed.sharingReplica??null))fail('Unreviewed sharing state in mirror; keep journal and mirror');
 // The journal owns immutable history/sharing. Later ordinary mirror edits own
 // current settings/recent/cache and unrelated fields. Commit order stays stable.
 return JSON.stringify({...current,events:mergeEvents(committed.events,current.events),...(committed.sharingReplica?{sharingReplica:committed.sharingReplica}:{}),...(committed.restoreRecovery?{restoreRecovery:{schema:1,receipts:mergeEvents(committed.restoreRecovery.receipts,current.restoreRecovery?.receipts||[])}}:{})});
}
export function createWorkspaceJournal({database,readMirror,owned,pause,pauseRecovery,apply}){
 let job=Promise.resolve();
 const serial=work=>{const next=job.then(work,work);job=next.catch(()=>{});return next;};
 async function read(){
  const db=await database;return new Promise((resolve,reject)=>{
   const tx=db.transaction('files','readonly'),request=tx.objectStore('files').get(JOURNAL_ID);let record;
   request.onsuccess=()=>{record=request.result;};tx.oncomplete=()=>resolve(record||null);tx.onabort=()=>reject(tx.error||Error('Workspace journal read aborted'));tx.onerror=()=>{};
  });
 }
 async function readRoot(){await job;const record=await read(),mirror=readMirror();
  if(!record&&decode(mirror).sharingReplica!==undefined)fail('Sharing mirror has no committed journal; review before enrollment');
  return composeWorkspace(record,mirror);
 }
 function recover(){return serial(async()=>{
  const release=pauseRecovery();if(!release)fail('Workspace commit is busy; retain the journal and retry');
  try{const record=await read();if(!record)return false;
   const mirror=readMirror(),encoded=composeWorkspace(record,mirror);apply(encoded,mirror);return true;
  }finally{release();}
 });
 }
 async function commit(expected,encoded,optIn,guard){
  if(optIn!==true)fail('Workspace journal commits require explicit opt-in');
  decode(encoded);
  if(!owned())fail('This browser window does not own workspace saving');
  const release=pause();if(!release)return false;
  try{
   const db=await database;let before;
   const committed=await new Promise((resolve,reject)=>{
    let failure,won=false;const tx=db.transaction('files','readwrite',{durability:'strict'}),table=tx.objectStore('files');
    tx.oncomplete=()=>resolve(won);tx.onabort=()=>reject(failure||tx.error||Error('Workspace root write aborted'));tx.onerror=()=>{};
    const request=table.get(JOURNAL_ID);
    request.onsuccess=()=>{
     try{
      const record=request.result||null;before=readMirror();
      if(!record&&decode(before).sharingReplica!==undefined)fail('Sharing mirror has no committed journal; review before enrollment');
      const current=composeWorkspace(record,before);if(current!==expected)return;
      const old=decode(current),next=decode(encoded),kept=new Map(next.events.map(event=>[event.id,canonical(event)]));
      for(const event of old.events)if(kept.get(event.id)!==canonical(event))fail('Root commit would drop or change local evidence');
      const receipts=new Map((next.restoreRecovery?.receipts||[]).map(row=>[row.id,canonical(row)]));
      for(const receipt of old.restoreRecovery?.receipts||[])if(receipts.get(receipt.id)!==canonical(receipt))fail('Root commit would drop or change a recovery receipt');
      const write=()=>{if(!owned()||guard&&!guard.accept())fail('Recovery preview changed; review again before saving');if(record&&record.revision===Number.MAX_SAFE_INTEGER)fail('Workspace journal revision exhausted');table.put({id:JOURNAL_ID,kind:JOURNAL_KIND,schema:1,revision:(record?.revision||0)+1,root:encoded,mirrorBefore:before});won=true;};
      const checks=guard?.records||[];let remaining=checks.length;
      if(!remaining)write();
      for(const check of checks){const evidence=table.get(check.id);evidence.onsuccess=()=>{try{if(check.tokenize(evidence.result)!==check.token)fail('Recovery evidence changed; reopen its preview');if(!--remaining)write();}catch(error){failure=error;tx.abort();}};}
     }catch(error){failure=error;tx.abort();}
    };
   });
   // Request success is insufficient. Apply/ack only after transaction complete.
   if(committed)apply(encoded,before);
   return committed;
  }finally{release();}
 }
 const compareRoot=(expected,encoded,optIn=false,guard=null)=>serial(()=>commit(expected,encoded,optIn,guard));
 return {read,readRoot,recover,compareRoot};
}

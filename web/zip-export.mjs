// Only transient export buffers are transferred. IndexedDB blobs stay intact.
export function zipOffThread(entries){
 return new Promise((resolve,reject)=>{
  let worker,timer,settled=false;
  const finish=(error,blob)=>{if(settled)return;settled=true;clearTimeout(timer);worker?.terminate();error?reject(error):resolve(blob);};
  try{
   worker=new Worker(new URL('./zip-worker.mjs',import.meta.url),{type:'module'});
   timer=setTimeout(()=>finish(Error('Backup timed out. Your saved files are unchanged; please retry.')),180000);
   worker.onmessage=({data})=>data?.error?finish(Error(data.error)):data?.blob instanceof Blob?finish(null,data.blob):finish(Error('Backup response could not be read.'));
   worker.onerror=event=>{event.preventDefault();finish(Error('Backup could not start or finish. Your saved files are unchanged; please retry.'));};
   worker.onmessageerror=()=>finish(Error('Backup response could not be read. Your saved files are unchanged.'));
   worker.postMessage(entries,[...new Set(Object.values(entries).filter(value=>value instanceof Uint8Array).map(bytes=>bytes.buffer))]);
  }catch(error){finish(error);}
 });
}

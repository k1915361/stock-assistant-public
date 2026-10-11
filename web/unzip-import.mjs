// The chosen File/Blob stays readable; only worker-owned decoded buffers transfer.
export function unzipOffThread(file){
 return new Promise((resolve,reject)=>{
  let worker,timer,settled=false;
  const finish=(error,entries)=>{if(settled)return;settled=true;clearTimeout(timer);worker?.terminate();error?reject(error):resolve(entries);};
  try{
   if(!(file instanceof Blob))throw Error('Choose a ZIP file to import.');
   if(file.size>200*1024*1024)throw Error('ZIP exceeds 200 MB. Import PDFs individually.');
   worker=new Worker(new URL('./unzip-worker.mjs',import.meta.url),{type:'module'});
   timer=setTimeout(()=>finish(Error('ZIP reading timed out. Existing files and history are unchanged; please retry.')),180000);
   worker.onmessage=({data})=>{
    if(data?.error){finish(Error(data.error));return;}
    const entries=data?.entries;
    if(!entries||typeof entries!=='object'||Array.isArray(entries)||Object.values(entries).some(value=>!(value instanceof Uint8Array)))finish(Error('ZIP response could not be read.'));
    else finish(null,entries);
   };
   worker.onerror=event=>{event.preventDefault();finish(Error('ZIP could not be read. Existing files and history are unchanged; please retry.'));};
   worker.onmessageerror=()=>finish(Error('ZIP response could not be read. Existing files and history are unchanged.'));
   worker.postMessage(file);
  }catch(error){finish(error);}
 });
}

import {unzipSync} from './vendor/zip.mjs';
self.onmessage=async({data:file})=>{
 try{
  if(!(file instanceof Blob))throw Error('Choose a ZIP file to import.');
  if(file.size>200*1024*1024)throw Error('ZIP exceeds 200 MB. Import PDFs individually.');
  const bytes=new Uint8Array(await file.arrayBuffer());let expanded=0;
  const entries=unzipSync(bytes,{filter:entry=>{
   if(entry.originalSize>100*1024*1024)throw Error('An archive entry exceeds 100 MB.');
   expanded+=entry.originalSize;if(expanded>350*1024*1024)throw Error('Expanded archive exceeds 350 MB.');
   return (/\.(?:pdf|json|jpg)$/i.test(entry.name)||/^photo-handoffs\/[a-f0-9-]{36}\.json(?:\.bak|\.new)$/.test(entry.name))&&!entry.name.includes('..');
  }});
  self.postMessage({entries},[...new Set(Object.values(entries).map(value=>value.buffer))]);
 }catch(error){self.postMessage({error:error.message||'ZIP could not be read.'});}
};

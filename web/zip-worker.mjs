import {Zip,ZipDeflate,zipSync,strToU8} from './vendor/zip.mjs';
self.onmessage=async({data})=>{
 try{
  const entries={};for(const [name,value] of Object.entries(data))entries[name]=name==='workspace.json'&&!(value instanceof Blob)&&!(value instanceof Uint8Array)?strToU8(JSON.stringify(value)):value;
  const size=Object.values(entries).reduce((total,value)=>total+(value instanceof Blob?value.size:value.byteLength),0);
  // Keep the established fast path for small workspaces; bound its payload copies.
  if(size<=16777216){const bytes={};for(const [name,value] of Object.entries(entries))bytes[name]=value instanceof Blob?new Uint8Array(await value.arrayBuffer()):value;self.postMessage({blob:new Blob([zipSync(bytes,{level:0})],{type:'application/zip'})});return;}
  // Blob parts release transient byte arrays instead of retaining every source
  // array, a contiguous archive array and another complete Blob copy together.
  // Batch tiny ZIP headers/descriptors to avoid thousands of Blob registrations.
  const parts=[],batch=new Uint8Array(8388608);let used=0;
  const flush=()=>{if(used){parts.push(new Blob([batch.subarray(0,used)]));used=0;}};
  const zip=new Zip((error,bytes,final)=>{if(error)throw error;for(let offset=0;offset<bytes.length;){const count=Math.min(batch.length-used,bytes.length-offset);batch.set(bytes.subarray(offset,offset+count),used);used+=count;offset+=count;if(used===batch.length)flush();}if(final){flush();self.postMessage({blob:new Blob(parts,{type:'application/zip'})});}});
  for(const [name,value] of Object.entries(entries)){
   // Level-zero DEFLATE supports streaming descriptors in common ZIP readers.
   const file=new ZipDeflate(name,{level:0});zip.add(file);
   if(value instanceof Blob){for(let offset=0;offset<value.size;offset+=1048576){const chunk=value.size<=1048576?value:value.slice(offset,offset+1048576);file.push(new Uint8Array(await chunk.arrayBuffer()));}file.push(new Uint8Array(0),true);}
   else file.push(value,true);
  }zip.end();
 }
 catch(error){self.postMessage({error:error.message||'Archive creation failed'});}
};

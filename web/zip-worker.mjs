import {zipSync,strToU8} from './vendor/zip.mjs';
self.onmessage=async({data})=>{
 try{const entries={};for(const [name,value] of Object.entries(data))entries[name]=value instanceof Blob?new Uint8Array(await value.arrayBuffer()):name==='workspace.json'&&!(value instanceof Uint8Array)?strToU8(JSON.stringify(value)):value;const bytes=zipSync(entries,{level:0});self.postMessage({blob:new Blob([bytes],{type:'application/zip'})});}
 catch(error){self.postMessage({error:error.message||'Archive creation failed'});}
};

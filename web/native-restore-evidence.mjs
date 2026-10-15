// Native AtomicFile ticket entries are raw evidence, never an active capture queue.
export function nativeTickets(entries,previous){
 const names=Object.keys(entries).filter(name=>/^photo-handoffs\/[a-f0-9-]{36}\.json(?:\.bak|\.new)?$/.test(name)).sort();
 if(!names.length)return previous;
 if(previous!==undefined&&!Array.isArray(previous))throw Error('Unsupported native ticket evidence. Keep the original ZIP; no files were saved.');
 const result=[...(previous||[])];
 for(const path of names){const bytes=entries[path];if(!(bytes instanceof Uint8Array))throw Error('Unreadable native ticket entry. Keep the original ZIP.');let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));const base64=btoa(text);if(!result.some(row=>row?.path===path&&row.base64===base64))result.push({path,base64});}
 return result;
}
export function nativePhotos(entries){
 for(const name of Object.keys(entries))if(/^photos\/[a-zA-Z0-9_-]+-thumb\.jpg$/.test(name)&&!entries[name.replace('-thumb.jpg','.jpg')])throw Error('Backup native photo main image missing. Keep the original ZIP; no files were saved.');
 return Object.keys(entries).filter(name=>/^photos\/[a-zA-Z0-9_-]+\.jpg$/.test(name)&&!name.endsWith('-thumb.jpg')).sort().map(file=>{
  const filename=file.split('/').at(-1),thumbnailFile=file.replace('.jpg','-thumb.jpg');
  if(!entries[thumbnailFile])throw Error('Backup native photo preview missing. Keep the original ZIP; no files were saved.');
  return {id:'photo-'+filename.slice(0,-4),kind:'photo',file,thumbnailFile,nativeFilename:filename};
 });
}

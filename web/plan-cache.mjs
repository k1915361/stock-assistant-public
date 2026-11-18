// Cache source pages, never item-specific highlights. Only one raster runs at a time.
export class PlanCache {
 constructor({load,draw,dispose,allowed=()=>true,maxDocuments=2,maxPages=12,maxBytes=16*1024*1024}){
  Object.assign(this,{load,draw,dispose,allowed,maxDocuments,maxPages,maxBytes});
  this.documents=new Map();this.pages=new Map();this.bytes=0;this.epoch=0;this.queue=Promise.resolve();this.renders=0;this.hits=0;
 }
 check(id,epoch=this.epoch){if(epoch!==this.epoch||!this.allowed(id))throw Error('Plan rendering cancelled or disabled');}
 touch(map,key,value){map.delete(key);map.set(key,value);}
 async release(entry){if(entry.released)return;entry.released=true;try{await this.dispose(await entry.promise);}catch{}}
 trimDocuments(){for(const [id,entry] of this.documents){if(this.documents.size<=this.maxDocuments)break;if(!entry.users){this.documents.delete(id);void this.release(entry);}}}
 async withDocument(id,callback){
  const epoch=this.epoch;this.check(id,epoch);let entry=this.documents.get(id);
  if(!entry){entry={users:0,promise:Promise.resolve().then(()=>this.load(id))};this.documents.set(id,entry);}
  this.touch(this.documents,id,entry);entry.users++;
  try{const document=await entry.promise;this.check(id,epoch);return await callback(document);}
  catch(error){entry.invalid=true;if(this.documents.get(id)===entry)this.documents.delete(id);throw error;}
  finally{entry.users--;if((entry.invalid||epoch!==this.epoch)&&!entry.users)void this.release(entry);this.trimDocuments();}
 }
 async page(job){
  const epoch=this.epoch;this.check(job.doc,epoch);const key=job.doc+':'+job.page;let entry=this.pages.get(key);
  if(entry){this.hits++;this.touch(this.pages,key,entry);const value=await entry.promise;this.check(job.doc,epoch);return value;}
  entry={bytes:0,pending:true};this.pages.set(key,entry);
  const work=this.queue.catch(()=>{}).then(async()=>{this.check(job.doc,epoch);return this.withDocument(job.doc,document=>this.draw(document,job.page));});
  this.queue=work.then(()=>{},()=>{});
  entry.promise=work.then(value=>{
   this.check(job.doc,epoch);this.renders++;entry.pending=false;entry.bytes=value.blob.size;this.bytes+=entry.bytes;
   for(const [oldKey,old] of this.pages){if(this.pages.size<=this.maxPages&&this.bytes<=this.maxBytes)break;if(!old.pending){this.pages.delete(oldKey);this.bytes-=old.bytes;}}
   return value;
  }).catch(error=>{if(this.pages.get(key)===entry){this.pages.delete(key);this.bytes-=entry.bytes;}throw error;});
  return entry.promise;
 }
 clear(){this.epoch++;this.pages.clear();this.bytes=0;for(const entry of this.documents.values())if(!entry.users)void this.release(entry);this.documents.clear();}
 stats(){return {documents:this.documents.size,pages:this.pages.size,bytes:this.bytes,renders:this.renders,hits:this.hits};}
}

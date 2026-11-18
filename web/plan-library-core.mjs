export function searchablePlanRecords(records,blocked=()=>false){
 return records.filter(record=>record?.kind==='pdf'&&!record.archivedAt&&!blocked(record));
}

export function planLibraryRows(records,isBundled=()=>false){
 return records.filter(record=>record?.kind==='pdf'&&record.document).map(record=>({
  id:record.id,
  name:record.document.name||'Imported PDF',
  pages:Number(record.document.pages)||0,
  added:record.document.added||'',
  codeCount:new Set((record.products||[]).map(product=>product?.barcode).filter(Boolean)).size,
  archivedAt:record.archivedAt||null,
  bundled:!!isBundled(record)
 }));
}

export function transitionImportedPlan(record,action,isBundled=()=>false,archivedAt=new Date().toISOString()){
 if(!record||record.kind!=='pdf'||!record.document)throw Error('This action requires an imported PDF.');
 if(isBundled(record))throw Error('Plans included with the app cannot be archived or deleted here.');
 if(action==='delete')return null;
 if(action==='archive')return {...record,archivedAt};
 if(action==='restore'){const restored={...record};delete restored.archivedAt;return restored;}
 throw Error('Unknown plan action.');
}

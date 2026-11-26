// @ts-check
'use strict';
// Plan pictures in the results: the preview of a placement, the zoomed display area, and releasing picture URLs once they are no longer shown.
const planViews=new Map();
function releasePlanView(view){const entry=planViews.get(view);if(entry){URL.revokeObjectURL(entry.url);planViews.delete(view);}}
function releaseDetachedPlanViews(){for(const [view,entry] of planViews)if(!entry.pending&&!view.isConnected)releasePlanView(view);}
if(typeof MutationObserver==='function'&&document.body)new MutationObserver(releaseDetachedPlanViews).observe(document.body,{childList:true,subtree:true});
function browserPlanView(data,focus=null){
  const bounds=WorkflowCore.union(focus?[focus]:[])||[0,0,1,1],width=data.width,height=data.height;
  const x=bounds[0]*width,y=bounds[1]*height,w=(bounds[2]-bounds[0])*width,h=(bounds[3]-bounds[1])*height;
  const view=document.createElement('div');view.className='plan-preview';view.style.aspectRatio=w+'/'+h;
  view.style.maxWidth=`calc(${w/h} * (100svh - 215px))`;view.tabIndex=0;view.setAttribute('role','button');
  const label=focus?'Zoomed display area':'Full original plan page';
  view.setAttribute('aria-label',label+(data.markers.length?'. Matching position marked in yellow and red.':'. Marker unavailable; use the position number and surrounding products.')+' Open full page.');
  const image=document.createElement('img'),url=URL.createObjectURL(data.blob);
  planViews.set(view,{url,pending:true});image.src=url;image.alt=label;image.style.width=100/(bounds[2]-bounds[0])+'%';image.style.left=-bounds[0]/(bounds[2]-bounds[0])*100+'%';image.style.top=-bounds[1]/(bounds[3]-bounds[1])*100+'%';
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`${x} ${y} ${w} ${h}`);svg.setAttribute('aria-hidden','true');
  const shapes=[];
  for(const b of data.codeBoxes){if(!WorkflowCore.union([b]))continue;shapes.push(`<rect x="${b[0]*width-7}" y="${b[1]*height-5}" width="${(b[2]-b[0])*width+14}" height="${(b[3]-b[1])*height+10}" fill="#008ceb44" stroke="#0073cd" stroke-width="3"/>`);}
  for(const b of data.markers){if(!WorkflowCore.union([b]))continue;
   const cx=(b[0]+b[2])*width/2,cy=(b[1]+b[3])*height/2,r=Math.max(12,Math.max((b[2]-b[0])*width,(b[3]-b[1])*height)/2+7);
   for(let ring=0;ring<3;ring++)for(const [color,stroke] of [['#111',8],['#fff',5],[ring===1?'#e1232d':'#ffd300',3]])shapes.push(`<circle cx="${cx}" cy="${cy}" r="${r+ring*9}" fill="none" stroke="${color}" stroke-width="${stroke}"/>`);
   for(const [color,stroke] of [['#111',10],['#fff',7],['#ffd300',4]])shapes.push(`<path d="M${cx+68} ${cy-68} L${cx+24} ${cy-24} M${cx+47} ${cy-29} L${cx+24} ${cy-24} L${cx+29} ${cy-47}" fill="none" stroke="${color}" stroke-width="${stroke}"/>`);
  }
  svg.innerHTML=shapes.join('');view.append(image,svg);return {view,image};
}
async function showBrowserPlan(request,data){
  const node=document.querySelector(`[data-request="${CSS.escape(request)}"]`);if(!node)return;
  const dialog=node.closest('dialog');if(dialog&&!dialog.open)return;
  node.dataset.hasMarkers=String(data.markers.length>0);
  if(data.markers.length){const verification=node.closest('.placement-card')?.querySelector('.verification');if(verification)verification.textContent=verification.textContent.replace(' · Position marker unavailable','');}
  const focus=node.dataset.focus?JSON.parse(node.dataset.focus):null,presentation=browserPlanView(data,focus);
  if(node.dataset.fullPage==='true'){
   presentation.view.classList.add('original-preview');presentation.view.removeAttribute('role');presentation.view.removeAttribute('tabindex');presentation.view.setAttribute('aria-label','Full original page');
  }else{
   const open=()=>{const job=node.planJob;fullPlan(job.doc,job.page,job.codeBoxes,job.markers,job.positions,data);};
   presentation.view.onclick=open;presentation.view.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};
  }
  try{await presentation.image.decode();if(!node.isConnected||node.dataset.request!==request){releasePlanView(presentation.view);return;}node.replaceChildren(presentation.view);planViews.get(presentation.view).pending=false;releaseDetachedPlanViews();}
  catch{if(node.isConnected&&node.dataset.request===request)node.innerHTML='<p>Source image could not be loaded.</p>';releasePlanView(presentation.view);}
}

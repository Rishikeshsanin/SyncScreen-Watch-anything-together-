import {randomBytes,randomUUID} from 'node:crypto';
export const LIMIT=20;
export const pos=(p,now)=>Math.max(0,p.position+(p.playing?Math.max(0,now-p.at)/1000:0));
export const clean=(s,n)=>typeof s==='string'?s.trim().slice(0,n):'';
export function source(v){
 if(!v||typeof v!=='object')throw Error('Invalid source');
 if(v.kind==='youtube'&&/^[\w-]{11}$/.test(v.id))return {kind:v.kind,id:v.id,title:clean(v.title,120)||'YouTube video'};
 if(v.kind==='local'&&/^[a-f0-9]{64}$/.test(v.id))return {kind:v.kind,id:v.id,title:clean(v.title,120)||'Local video'};
 if(v.kind==='screen')return {kind:'screen',title:'Live screen'};
 if(['direct','ott'].includes(v.kind)){
  const u=new URL(v.url);if(u.protocol!=='https:'||u.username||u.password||u.href.length>2048)throw Error('Use a valid HTTPS URL');
  return {kind:v.kind,url:u.href,title:clean(v.title,120)||u.hostname};
 }
 throw Error('Unsupported source');
}
export function createRoom(code,now){return {code,host:null,people:new Map(),media:null,mediaGeneration:0,playback:{playing:false,position:0,at:now,version:0},mode:'catchup',waiting:false,queue:[],chat:[],updated:now};}
export function addMember(r,name,now){if(r.people.size>=LIMIT)throw Error('Room is full');const p={id:randomUUID(),token:randomBytes(32).toString('hex'),name:clean(name,32)||'Guest',online:true,ready:false,control:false,seen:now};r.people.set(p.id,p);if(!r.host)r.host=p.id;return p;}
export function snapshot(r){return {code:r.code,host:r.host,media:r.media,mediaGeneration:r.mediaGeneration,playback:r.playback,mode:r.mode,waiting:r.waiting,queue:r.queue,chat:r.chat,people:[...r.people.values()].map(({id,name,online,ready,control,drift})=>({id,name,online,ready,control,drift}))};}
export function setPlayback(r,playing,position,now,delay=350){r.playback={playing,position:Math.max(0,position),at:now+delay,version:r.playback.version+1};}
const timeline=r=>r.media&&['youtube','direct','local'].includes(r.media.kind);
export function reconcile(r,now){if(!timeline(r)||r.mode!=='wait')return;const blocked=[...r.people.values()].some(p=>p.online&&!p.ready);if(blocked&&r.playback.playing){r.waiting=true;setPlayback(r,false,pos(r.playback,now),now,0);}else if(!blocked&&r.waiting){r.waiting=false;setPlayback(r,true,r.playback.position,now);}}
export function apply(r,p,m,now){
 const host=p.id===r.host, control=host||p.control;
 if(m.type==='ready'){if(m.mediaGeneration!==r.mediaGeneration)return;p.ready=m.ready===true;p.drift=Number.isFinite(m.drift)?Math.max(-60,Math.min(60,m.drift)):null;reconcile(r,now);return;}
 if(m.type==='chat'){const value=clean(m.text,500);if(value){r.chat.push({id:randomUUID(),name:p.name,text:value,at:now});r.chat=r.chat.slice(-80);}return;}
 if(m.type==='queue'){if(r.queue.length>=50)throw Error('Queue is full');const item=source(m.source);if(item.kind==='screen'||item.kind==='ott')throw Error('This source cannot be queued');r.queue.push(item);return;}
 if(m.type==='permission'||m.type==='transfer'||m.type==='mode'||m.type==='kick'){
  if(!host)throw Error('Host only');if(m.type==='mode'){if(!['wait','catchup'].includes(m.mode))throw Error('Invalid mode');r.mode=m.mode;if(r.mode==='catchup'&&r.waiting){r.waiting=false;setPlayback(r,true,r.playback.position,now);}reconcile(r,now);return;}
  const target=r.people.get(m.id);if(!target||target.id===p.id)throw Error('Invalid member');
  if(m.type==='permission')target.control=m.enabled===true;
  if(m.type==='transfer'){if(!target.online)throw Error('Member offline');if(r.media?.kind==='screen')throw Error('Stop screen sharing before transfer');r.host=target.id;}
  if(m.type==='kick'){r.people.delete(target.id);reconcile(r,now);}return;
 }
 if(!control)throw Error('Playback permission required');
 if(m.type==='clear'){if(!host)throw Error('Host only');r.media=null;r.mediaGeneration++;r.waiting=false;for(const q of r.people.values()){q.ready=false;q.drift=null;}setPlayback(r,false,0,now,0);return;}
 if(m.type==='source'||m.type==='next'){
  if(m.type==='source'&&m.source?.kind==='screen'&&!host)throw Error('Host only');
  const item=m.type==='next'?r.queue.shift():source(m.source);if(!item)throw Error('Queue empty');r.media=item;r.mediaGeneration++;r.waiting=false;for(const q of r.people.values()){q.ready=false;q.drift=null;}setPlayback(r,false,0,now,0);return;
 }
 if(m.type==='play'||m.type==='pause'||m.type==='seek'){
  if(!timeline(r))throw Error('No synchronized video');const n=m.type==='seek'?m.position:pos(r.playback,now);
  if(!Number.isFinite(n)||n<0||n>864000)throw Error('Invalid position');
  const shouldPlay=m.type==='play'||(m.type==='seek'&&(r.playback.playing||r.waiting));r.waiting=false;setPlayback(r,shouldPlay,n,now,m.type==='pause'?0:350);reconcile(r,now);return;
 }
 throw Error('Unknown action');
}

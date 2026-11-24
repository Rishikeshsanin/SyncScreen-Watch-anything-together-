import http from 'node:http';
import {CallService} from './calls.mjs';
const calls=new CallService({url:process.env.LIVEKIT_URL,key:process.env.LIVEKIT_API_KEY,secret:process.env.LIVEKIT_API_SECRET});
import {YouTubeDiscovery} from './youtube.mjs';
const discovery=new YouTubeDiscovery({key:process.env.YOUTUBE_API_KEY||''});
import {monotonicNow} from './public/sync.js';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {createRoom,addMember,snapshot,apply,reconcile,clean,restoreNewRoom} from './core.mjs';
const rooms=new Map(), clients=new Map();
const assets={'/':'index.html','/app.js':'app.js','/calls.js':'calls.js','/livekit.js':'../node_modules/livekit-client/dist/livekit-client.umd.min.js','/sw.js':'sw.js','/icon.svg':'icon.svg','/offline.html':'offline.html','/hls.mjs':'../node_modules/hls.js/dist/hls.mjs','/sync.js':'sync.js','/rtc.js':'rtc.js','/style.css':'style.css','/manifest.webmanifest':'manifest.webmanifest'};
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',webmanifest:'application/manifest+json',mjs:'text/javascript; charset=utf-8',svg:'image/svg+xml'};
let ice=[{urls:'stun:stun.l.google.com:19302'}];if(process.env.ICE_SERVERS)ice=JSON.parse(process.env.ICE_SERVERS);
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Cache-Control','no-store');
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/health'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,rooms:rooms.size,revision:process.env.RENDER_GIT_COMMIT||process.env.SYNCSCREEN_REVISION||null}));}
 if(req.method!=='GET'||!assets[path]){res.writeHead(404);return res.end('Not found');}
 try{const data=await readFile(new URL('./public/'+assets[path],import.meta.url));res.setHeader('Content-Type',types[assets[path].split('.').pop()]);res.end(data);}catch{res.writeHead(500);res.end('Unavailable');}
});
const wss=new WebSocketServer({noServer:true,maxPayload:65536,perMessageDeflate:false});
server.on('upgrade',(req,socket,head)=>{
 const origin=req.headers.origin,expected=process.env.PUBLIC_ORIGIN;
 try{if(req.url!=='/ws'||!origin||(expected?origin!==expected:new URL(origin).host!==req.headers.host)||wss.clients.size>=500)throw Error();}catch{socket.destroy();return;}
 wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
});
const send=(ws,o)=>{if(ws?.readyState===WebSocket.OPEN&&ws.bufferedAmount<1000000)ws.send(JSON.stringify(o));};
function broadcast(r,o){for(const p of r.people.values())send(clients.get(p.id),o);}
function state(r){r.updated=monotonicNow();broadcast(r,{type:'state',room:snapshot(r)});}
function attach(ws,r,p){const old=clients.get(p.id);if(old&&old!==ws)old.close(4001,'Reconnected');clients.set(p.id,ws);ws.room=r;ws.member=p;p.online=true;p.ready=false;p.drift=null;p.rtt=null;p.seen=monotonicNow();reconcile(r,p.seen);send(ws,{type:'welcome',id:p.id,token:p.token,ice,callMode:calls.enabled?'livekit':'mesh',room:snapshot(r)});state(r);}
wss.on('connection',ws=>{
 let windowStart=monotonicNow(),count=0,failures=0;const actionWindows=new Map();ws.alive=true;ws.on('pong',()=>ws.alive=true);
 ws.on('error',()=>{});
 ws.on('message',raw=>{
  const now=monotonicNow();if(now-windowStart>1000){windowStart=now;count=0;}if(++count>45){ws.close(1008,'Rate limit');return;}
  try{
   const m=JSON.parse(raw.toString());if(!m||typeof m!=='object')throw Error('Invalid message');
   if(Array.isArray(m)||typeof m.type!=='string')throw Error('Invalid message');if(m.type==='ping'){if(!Number.isSafeInteger(m.client)||m.client<0)throw Error('Invalid ping');send(ws,{type:'pong',client:m.client,server:now});return;}
   if(!ws.room){
    if(m.type==='create'){if(rooms.size>=250)throw Error('Server capacity reached');let code;do{code=randomBytes(5).toString('hex').toUpperCase();}while(rooms.has(code));const r=createRoom(code,now);if(m.recovery!==undefined)restoreNewRoom(r,m.recovery,now);rooms.set(code,r);attach(ws,r,addMember(r,m.name,now));return;}
    const r=rooms.get(clean(m.code,10).toUpperCase());if(!r)throw Error('Room unavailable');
    if(m.type==='resume'){const p=[...r.people.values()].find(p=>p.token===m.token);if(!p)throw Error('Session expired');attach(ws,r,p);return;}
    if(m.type==='join'){attach(ws,r,addMember(r,m.name,now));return;}throw Error('Join a room first');
   }
   const r=ws.room,p=ws.member;if(clients.get(p.id)!==ws||!r.people.has(p.id))throw Error('Session invalid');
   p.seen=now;const budget={chat:8,reaction:12,queue:8,signal:120,roomSettings:6,ready:25,queueMove:20,queueRemove:20,youtubeLookup:3,queueBatch:2,callToken:3}[m.type];if(budget){let bucket=actionWindows.get(m.type);if(!bucket||now-bucket.at>=10000){bucket={at:now,count:0};actionWindows.set(m.type,bucket);}if(++bucket.count>budget)throw Error('Action rate limit; try again shortly');}
   if(m.type==='callToken'){calls.token(r,p).then(result=>{if(clients.get(p.id)===ws&&r.people.has(p.id))send(ws,{type:'callToken',...result});}).catch(()=>{if(clients.get(p.id)===ws)send(ws,{type:'callError',message:'Call unavailable'});});return;}
   if(m.type==='youtubeLookup'){if(!Number.isSafeInteger(m.requestId)||m.requestId<0)throw Error('Invalid lookup request');const result={type:'youtubeResults',requestId:m.requestId};discovery.lookup(m.mode,m.value).then(items=>{if(clients.get(p.id)===ws&&r.people.has(p.id))send(ws,{...result,items});}).catch(e=>{if(clients.get(p.id)===ws&&r.people.has(p.id))send(ws,{...result,error:clean(e.message,160)});});return;}
   if(m.type==='signal'){if(calls.enabled&&m.channel==='call')throw Error('Use LiveKit for calls');const target=r.people.get(m.to);if(!target?.online||target.id===p.id||!['call','screen'].includes(m.channel)||!m.data||typeof m.data!=='object'||Array.isArray(m.data)||(!m.data.description&&!m.data.candidate))throw Error('Invalid signal');if(m.channel==='screen'&&(r.media?.kind!=='screen'||(p.id!==r.host&&target.id!==r.host)))throw Error('Screen signals must involve host');if(m.data.description){const d=m.data.description;if(!['offer','answer'].includes(d.type)||typeof d.sdp!=='string'||d.sdp.length>48000)throw Error('Invalid description');}if(m.data.candidate){const c=m.data.candidate;if(typeof c.candidate!=='string'||c.candidate.length>2048)throw Error('Invalid candidate');}send(clients.get(target.id),{type:'signal',from:p.id,channel:m.channel,data:m.data});return;}
   if(m.type==='reaction'){if(!['❤️','😂','🔥','👏','😮','😢'].includes(m.emoji))throw Error('Invalid reaction');broadcast(r,{type:'reaction',emoji:m.emoji,name:p.name});return;}
   if(m.type==='leave'){r.people.delete(p.id);void calls.remove(r,p.id);clients.delete(p.id);ws.close(1000,'Left');if(r.host===p.id){r.host=[...r.people.values()].find(x=>x.online)?.id||r.people.keys().next().value;if(r.media?.kind==='screen')r.media=null;}reconcile(r,now);state(r);return;}
   apply(r,p,m,now);if(m.type==='kick'){void calls.remove(r,m.id);clients.get(m.id)?.close(4003,'Removed');clients.delete(m.id);}state(r);
  }catch(e){send(ws,{type:'error',message:clean(e.message,160)||'Request failed'});if(!ws.room&&++failures>=8)ws.close(1008,'Too many invalid room attempts');}
 });
 ws.on('close',()=>{const p=ws.member,r=ws.room;if(p&&clients.get(p.id)===ws){clients.delete(p.id);p.online=false;p.ready=false;p.drift=null;p.rtt=null;p.seen=monotonicNow();reconcile(r,monotonicNow());state(r);}});
});
const timer=setInterval(()=>{const now=monotonicNow();for(const ws of wss.clients){if(!ws.alive)ws.terminate();else{ws.alive=false;ws.ping();}}for(const [code,r] of rooms){let changed=false;for(const p of r.people.values())if(!p.online&&now-p.seen>120000){r.people.delete(p.id);changed=true;}if(!r.people.size){rooms.delete(code);continue;}if(!r.people.has(r.host)){r.host=[...r.people.values()].find(p=>p.online)?.id||r.people.keys().next().value;if(r.media?.kind==='screen')r.media=null;changed=true;}if(changed){reconcile(r,now);state(r);}}},15000);timer.unref();
server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('SyncScreen listening'));

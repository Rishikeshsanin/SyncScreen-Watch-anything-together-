// Epoch-shaped monotonic timestamps: wall clock changes do not move the timeline.
export const monotonicNow=()=>performance.timeOrigin+performance.now();
const clamp=(x,min,max)=>Math.min(max,Math.max(min,x));
export class ClockSync {
 constructor(now=monotonicNow){this.now=now;this.reset();}
 reset(){this.samples=[];this.pending=new Map();this.offset=0;this.ready=false;this.rtt=null;this.jitter=null;this.last=-Infinity;this.seq=0;}
 request(){const id=++this.seq;const at=this.now();this.pending.set(id,at);for(const [key,t] of this.pending)if(at-t>10000)this.pending.delete(key);return id;}
 accept(id,server){const end=this.now(),start=this.pending.get(id);if(start===undefined)return false;this.pending.delete(id);const rtt=end-start;if(!Number.isFinite(server)||rtt<0||rtt>5000)return false;this.samples=this.samples.filter(s=>end-s.at<=30000);this.samples.push({at:end,rtt,offset:server-(start+end)/2});this.samples=this.samples.slice(-24);const sorted=[...this.samples].sort((a,b)=>a.rtt-b.rtt);const best=sorted.slice(0,Math.min(5,Math.max(1,Math.ceil(sorted.length/3))));const offsets=best.map(s=>s.offset).sort((a,b)=>a-b);const target=offsets[Math.floor(offsets.length/2)];this.offset=target;this.ready=true;this.rtt=sorted[0].rtt;this.jitter=sorted[Math.floor(sorted.length*.75)].rtt-this.rtt;return true;}
 serverNow(){const t=this.now()+this.offset;this.last=Math.max(this.last,t);return this.last;}
}
export function correction({kind,delta,playing,force=false,elapsed=Infinity}){
 const abs=Math.abs(delta);
 if(!Number.isFinite(delta))return {seek:false,rate:1};
 if(!playing)return {seek:abs>(force?.07:.25),rate:1};
 const youtube=kind==='youtube';
 const seek=force?abs>(youtube?.35:.12):abs>(youtube?1.2:.75)&&elapsed>3500;
 return {seek,rate:youtube||seek||abs<.045?1:clamp(1+delta*.18,.96,1.04)};
}

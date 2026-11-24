export class MediaPeers{
 constructor(send,onStream,onClose,notice){this.send=send;this.onStream=onStream;this.onClose=onClose;this.notice=notice;this.map=new Map();this.config=[];this.me=null;this.room=null;this.call=null;this.screen=null;}
 key(id,ch){return ch+':'+id;}
 sync(room,me,call,screen){this.room=room;this.me=me;this.call=call;this.screen=screen;if(!room||!me)return;
 const online=new Set(room.people.filter(p=>p.online&&p.id!==me).map(p=>p.id));for(const [key,x] of this.map)if(!online.has(x.id)||(x.channel==='screen'&&room.media?.kind!=='screen'))this.close(key);
 for(const id of online){if(call?.getTracks().length||this.map.has(this.key(id,'call')))this.ensure(id,'call');if(room.media?.kind==='screen'&&room.host===me&&screen)this.ensure(id,'screen');}
 for(const x of this.map.values())this.tracks(x).catch(e=>this.notice('Media: '+e.message));
 }
 ensure(id,channel){const key=this.key(id,channel);if(this.map.has(key))return this.map.get(key);
 const pc=new RTCPeerConnection({iceServers:this.config});const x={id,channel,pc,polite:this.me>id,making:false,ignore:false,pending:[],remote:new MediaStream(),senders:{},chain:Promise.resolve()};this.map.set(key,x);
 pc.onicecandidate=e=>{if(e.candidate)this.send({type:'signal',to:id,channel,data:{candidate:e.candidate.toJSON()}});};
 pc.ontrack=e=>{if(!x.remote.getTracks().some(t=>t.id===e.track.id))x.remote.addTrack(e.track);this.onStream(id,channel,x.remote);};
 pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed')this.notice('Peer media connection failed; TURN may be needed.');};
 pc.onnegotiationneeded=async()=>{try{x.making=true;await pc.setLocalDescription();this.send({type:'signal',to:id,channel,data:{description:pc.localDescription.toJSON()}});}catch(e){this.notice(e.message);}finally{x.making=false;}};
 this.tracks(x).catch(e=>this.notice(e.message));return x;
 }
 async tracks(x){const stream=x.channel==='call'?this.call:(this.room?.host===this.me?this.screen:null);
 for(const kind of ['audio','video']){const t=stream?.getTracks().find(t=>t.kind===kind&&t.readyState==='live')||null;const sender=x.senders[kind];if(sender){if(sender.track!==t)await sender.replaceTrack(t);}else if(t){x.senders[kind]=x.pc.addTrack(t,stream);}}
 }
 async receive(m){if(!this.room?.people.some(p=>p.id===m.from&&p.online))return;const x=this.ensure(m.from,m.channel);x.chain=x.chain.catch(()=>{}).then(async()=>{const pc=x.pc,{description,candidate}=m.data;if(description){const collision=description.type==='offer'&&(x.making||pc.signalingState!=='stable');x.ignore=!x.polite&&collision;if(x.ignore)return;await pc.setRemoteDescription(description);for(const c of x.pending.splice(0))await pc.addIceCandidate(c).catch(()=>{});if(description.type==='offer'){await pc.setLocalDescription();this.send({type:'signal',to:x.id,channel:x.channel,data:{description:pc.localDescription.toJSON()}});}}else if(candidate&&!x.ignore){if(pc.remoteDescription)await pc.addIceCandidate(candidate);else x.pending.push(candidate);}});return x.chain;}
 close(key){const x=this.map.get(key);if(!x)return;x.pc.close();this.map.delete(key);this.onClose(x.id,x.channel);}
 closeAll(){for(const key of this.map.keys())this.close(key);}
}

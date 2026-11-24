let loading;
function sdk(){if(globalThis.LivekitClient)return Promise.resolve(globalThis.LivekitClient);if(!loading)loading=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/livekit.js';s.onload=()=>globalThis.LivekitClient?resolve(globalThis.LivekitClient):reject(Error('LiveKit SDK unavailable'));s.onerror=()=>reject(Error('LiveKit SDK failed to load'));document.head.append(s);}).catch(e=>{loading=null;throw e;});return loading;}
export class Calls{
 constructor({container,status,onChange}){this.container=container;this.status=status;this.onChange=onChange;this.room=null;this.generation=0;this.tracks=new Map();this.mic=false;this.cam=false;this.volume=1;}
 async connect(url,token){await this.disconnect();const generation=this.generation,L=await sdk();if(generation!==this.generation)return;const room=new L.Room({adaptiveStream:true,dynacast:true,audioCaptureDefaults:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});this.room=room;const current=()=>this.room===room&&generation===this.generation;
 room.on(L.RoomEvent.TrackSubscribed,(track,pub,participant)=>{if(!current())return;const el=track.attach();el.autoplay=true;el.playsInline=true;el.dataset.participant=participant.identity;el.setAttribute('aria-label',participant.name||'Call participant');if(el.tagName==='AUDIO')el.volume=this.volume;this.container.append(el);this.tracks.set(track,el);});
 room.on(L.RoomEvent.TrackUnsubscribed,track=>{if(!current())return;track.detach().forEach(el=>el.remove());this.tracks.delete(track);});
 room.on(L.RoomEvent.Reconnecting,()=>{if(current())this.status('Call reconnecting…');});room.on(L.RoomEvent.Reconnected,()=>{if(current())this.status('Call connected');});
 room.on(L.RoomEvent.Disconnected,()=>{if(current()){this.clear();this.room=null;this.status('Call disconnected');this.onChange();}});
 try{await room.connect(url,token);if(!current()){await room.disconnect();return;}this.status('Call connected');this.onChange();}catch{if(current())await this.disconnect();throw Error('Could not connect to the call');}}
 clear(){for(const [track,el] of this.tracks){track.detach(el);el.remove();}this.tracks.clear();this.mic=false;this.cam=false;}
 async disconnect(){this.generation++;const room=this.room;this.room=null;this.clear();if(room)await room.disconnect();this.onChange();}
 async toggle(kind){const room=this.room;if(!room)throw Error('Join the call first');if(kind==='audio'){await room.localParticipant.setMicrophoneEnabled(!this.mic);if(this.room===room)this.mic=!this.mic;}else{await room.localParticipant.setCameraEnabled(!this.cam);if(this.room===room)this.cam=!this.cam;}this.onChange();}
 async audio(){if(this.room)await this.room.startAudio();}
 setVolume(value){this.volume=Math.max(0,Math.min(1,value));for(const el of this.tracks.values())if(el.tagName==='AUDIO')el.volume=this.volume;}
}

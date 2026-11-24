import {AccessToken,RoomServiceClient,TrackSource} from 'livekit-server-sdk';
export class CallService{
 constructor({url='',key='',secret='',client}={}){this.url=url;this.key=key;this.secret=secret;this.enabled=false;if(!url||!key||!secret)return;const u=new URL(url);if(u.protocol!=='wss:'&&!(u.protocol==='ws:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error('LiveKit requires WSS except local tests');if(u.username||u.password)throw Error('Invalid LiveKit URL');this.enabled=true;this.client=client||new RoomServiceClient(url.replace(/^ws/,'http'),key,secret);}
 roomName(code){if(!/^[A-F0-9]{10}$/.test(code))throw Error('Invalid room');return 'syncscreen-'+code;}
 async token(room,member){if(!this.enabled)throw Error('LiveKit is not configured');if(!member?.online||room.people.get(member.id)!==member)throw Error('Call membership required');const at=new AccessToken(this.key,this.secret,{identity:member.id,name:member.name,ttl:120});at.addGrant({roomJoin:true,room:this.roomName(room.code),canPublish:true,canSubscribe:true,canPublishData:false,canUpdateOwnMetadata:false,canPublishSources:[TrackSource.CAMERA,TrackSource.MICROPHONE]});return {url:this.url,token:await at.toJwt()};}
 async remove(room,id){if(!this.enabled)return;try{await this.client.removeParticipant(this.roomName(room.code),id);}catch{/* No token, key, participant name or URL logged. */}}
}

// Only public YouTube metadata; no media proxy, no credential sent to the browser.
const videoId=/^[A-Za-z0-9_-]{11}$/,playlistId=/^[A-Za-z0-9_-]{10,80}$/;
export function playlist(value){const raw=String(value??'').trim();if(playlistId.test(raw))return raw;let u;try{u=new URL(raw);}catch{throw Error('Enter a valid public YouTube playlist URL or ID');}if(u.protocol!=='https:'||!['www.youtube.com','youtube.com','m.youtube.com','youtu.be'].includes(u.hostname)||!playlistId.test(u.searchParams.get('list')||''))throw Error('Enter a valid public YouTube playlist URL or ID');return u.searchParams.get('list');}
export class YouTubeDiscovery{
 constructor({key='',fetcher=fetch,now=Date.now}={}){this.key=key;this.fetcher=fetcher;this.now=now;this.cache=new Map();this.day='';this.used={search:0,playlist:0};}
 async lookup(mode,value){
  if(!this.key)throw Error('YouTube discovery is not configured. Paste a video URL instead.');
  if(!['search','playlist'].includes(mode))throw Error('Invalid discovery mode');
  const q=mode==='playlist'?playlist(value):String(value??'').trim();
  if(!q||q.length>120)throw Error('Enter a query of 1–120 characters');
  const now=this.now(),cacheKey=mode+':'+q.toLowerCase(),hit=this.cache.get(cacheKey);if(hit&&hit.expires>now)return hit.items;
  const day=new Date(now).toISOString().slice(0,10);if(day!==this.day){this.day=day;this.used={search:0,playlist:0};}
  if(this.used[mode]>=(mode==='search'?60:200))throw Error('YouTube discovery daily limit reached');
  this.used[mode]++;
  const u=new URL('https://www.googleapis.com/youtube/v3/'+(mode==='search'?'search':'playlistItems'));
  u.search=new URLSearchParams(mode==='search'?{part:'snippet',type:'video',videoEmbeddable:'true',videoSyndicated:'true',maxResults:'12',q,key:this.key}:{part:'snippet,contentDetails',maxResults:'25',playlistId:q,key:this.key});
  let response;try{response=await this.fetcher(u,{signal:AbortSignal.timeout(8000),redirect:'error'});}catch{throw Error('YouTube discovery is temporarily unavailable');}
  if(!response.ok)throw Error(response.status===403||response.status===429?'YouTube discovery is unavailable or quota-limited':'YouTube discovery request failed');
  let body;try{body=await response.json();}catch{throw Error('Invalid YouTube response');}
  const items=(Array.isArray(body.items)?body.items:[]).slice(0,25).map(x=>({kind:'youtube',id:mode==='search'?x?.id?.videoId:x?.contentDetails?.videoId,title:String(x?.snippet?.title??'').slice(0,120),channel:String(x?.snippet?.channelTitle??'').slice(0,80)})).filter(x=>videoId.test(x.id||'')&&x.title&&!['Private video','Deleted video'].includes(x.title));
  this.cache.set(cacheKey,{items,expires:now+300000});while(this.cache.size>100)this.cache.delete(this.cache.keys().next().value);return items;
 }
}

import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
const temp=await mkdtemp(join(tmpdir(),'syncscreen-')),file=join(temp,'sample.webm');
let browser,child,port;
try{
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=160x90:rate=25','-t','30','-c:v','libvpx','-b:v','100k','-an',file]);
 let base=process.env.SYNCSCREEN_TEST_URL;if(base){const u=new URL(base);assert.equal(u.protocol,'https:');assert.equal(u.hostname,'syncscreen-0n6r.onrender.com');base=u.origin;const health=await fetch(base+'/health',{signal:AbortSignal.timeout(90000)});assert.equal(health.status,200);const healthBody=await health.json();assert.equal(healthBody.ok,true);if(process.env.EXPECT_REVISION)assert.equal(healthBody.revision,process.env.EXPECT_REVISION,'Wrong production revision');}else{const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));port=socket.address().port;await new Promise(r=>socket.close(r));
 child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),PUBLIC_ORIGIN:''}});await once(child.stdout,'data');base='http://127.0.0.1:'+port;}
 browser=await chromium.launch({headless:true});const host=await browser.newPage(),guest=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];
 for(const p of [host,guest]){p.on('pageerror',e=>errors.push(e.message));await p.goto(base,{timeout:90000});await p.waitForFunction(()=>document.querySelector('#connection').textContent==='Connected');}
 await host.locator('#name').fill('Host');await host.locator('#create').click();await host.locator('#roomCode').waitFor({state:'visible'});const code=await host.locator('#roomCode').textContent();
 await guest.locator('#name').fill('Guest');await guest.locator('#code').fill(code);await guest.locator('#join').click();await guest.locator('#roomCode').waitFor({state:'visible'});assert.equal(await guest.locator('#play').isDisabled(),true);if(!process.env.SYNCSCREEN_TEST_URL||process.env.EXPECT_CINEMATIC==='1'){await guest.locator('#theater').click();assert.equal(await guest.locator('#theater').getAttribute('aria-pressed'),'true');await guest.locator('#theater').click();assert.equal(await guest.locator('#theater').getAttribute('aria-pressed'),'false');assert.ok(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile horizontal overflow');}
 await host.locator('#file').setInputFiles(file);await guest.waitForFunction(()=>document.querySelector('#mediaTitle').textContent==='sample.webm');await guest.locator('#file').setInputFiles(file);
 for(const p of [host,guest]){await p.waitForFunction(()=>document.querySelector('#video').readyState>=3);await p.locator('#unlock').click();await p.waitForFunction(()=>document.querySelector('#syncStatus').textContent.includes('Estimated media drift'));}
 await host.locator('#mode').selectOption('wait');await host.waitForFunction(()=>document.querySelector('#people').textContent.match(/Ready/g)?.length===2);
 await host.locator('#play').click();for(const p of [host,guest])await p.waitForFunction(()=>!document.querySelector('#video').paused&&document.querySelector('#video').currentTime>0.5);
 const samples=[];for(let i=0;i<25;i++){const [a,b]=await Promise.all([host.evaluate(()=>document.querySelector('#video').currentTime),guest.evaluate(()=>document.querySelector('#video').currentTime)]);samples.push(Math.abs(a-b)*1000);await new Promise(r=>setTimeout(r,100));}
 samples.sort((a,b)=>a-b);const percentile=p=>samples[Math.ceil(p*samples.length)-1];console.log(JSON.stringify({scenario:process.env.SYNCSCREEN_TEST_URL?'two Chromium contexts, native WebM, public Render WebSocket':'two Chromium contexts, native local WebM, healthy localhost',samples:samples.length,p50_ms:percentile(.5),p95_ms:percentile(.95),p99_ms:percentile(.99)}));assert.ok(percentile(.95)<750,'Browser drift smoke-test threshold exceeded');
 await host.locator('#forward').click();for(const p of [host,guest])await p.waitForFunction(()=>document.querySelector('#video').currentTime>10);
 await host.locator('#play').click();for(const p of [host,guest])await p.waitForFunction(()=>document.querySelector('#video').paused);
 if(!process.env.SYNCSCREEN_TEST_URL||process.env.EXPECT_REVISION){
  // Browser-only synthetic HLS fixture; no media uploads or external provider dependency.
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=160x90:rate=25','-t','12','-c:v','libx264','-pix_fmt','yuv420p','-g','50','-sc_threshold','0','-an','-f','hls','-hls_time','2','-hls_playlist_type','vod','-hls_segment_filename',join(temp,'part%d.ts'),join(temp,'fixture.m3u8')]);
  for(const p of [host,guest])await p.route('https://syncscreen-fixture.invalid/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!/^(fixture\.m3u8|part\d+\.ts)$/.test(name))return route.abort();await route.fulfill({status:200,contentType:name.endsWith('.ts')?'video/mp2t':'application/vnd.apple.mpegurl',headers:{'access-control-allow-origin':'*'},body:await readFile(join(temp,name))});});
  await host.locator('#kind').selectOption('hls');await host.locator('#url').fill('https://syncscreen-fixture.invalid/fixture.m3u8');await host.locator('#load').click();
  for(const p of [host,guest]){await p.waitForFunction(()=>document.querySelector('#mediaTitle').textContent==='syncscreen-fixture.invalid');await p.waitForFunction(()=>document.querySelector('#video').readyState>=3,{},{timeout:30000});await p.locator('#unlock').click();await p.waitForFunction(()=>document.querySelector('#syncStatus').textContent.includes('Estimated media drift'));}
  await host.waitForFunction(()=>document.querySelector('#people').textContent.match(/Ready/g)?.length===2);await host.locator('#play').click();for(const p of [host,guest])await p.waitForFunction(()=>!document.querySelector('#video').paused&&document.querySelector('#video').currentTime>.5);
  console.log('HLS browser playback passed with synthetic VOD segments.');
 }
 if(!process.env.SYNCSCREEN_TEST_URL){
  await host.locator('#file').setInputFiles([]);await host.locator('#file').setInputFiles(file);
  await host.waitForFunction(()=>document.querySelector('#mediaTitle').textContent==='sample.webm');await host.waitForFunction(()=>document.querySelector('#video').readyState>=3);
  await host.locator('#unlock').click();await host.waitForFunction(()=>JSON.parse(sessionStorage.getItem('syncscreen-host-recovery')||'null')?.media?.kind==='local');
  const priorCode=await host.locator('#roomCode').textContent();
  const exited=once(child,'exit');child.kill();await exited;
  child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),PUBLIC_ORIGIN:''}});await once(child.stdout,'data');
  await host.locator('#restoreRoom').waitFor({state:'visible',timeout:30000});await host.locator('#restoreRoom').click();
  await host.locator('#roomCode').waitFor({state:'visible'});assert.notEqual(await host.locator('#roomCode').textContent(),priorCode);
  assert.equal(await host.locator('#mediaTitle').textContent(),'sample.webm');assert.equal(await host.locator('#play').textContent(),'Play');
  assert.ok(await host.locator('#people').textContent().then(x=>!x.includes('Guest')));
  console.log('Browser restart recovery passed: replacement room, paused media, new invitation.');
  await host.locator('#leave').click();
 }else{await guest.locator('#leave').click();await host.locator('#leave').click();}
 assert.deepEqual(errors,[]);console.log('Browser smoke test passed: local source, guest permissions, wait mode, play, seek, pause.');
}finally{await browser?.close();child?.kill();await rm(temp,{recursive:true,force:true});}

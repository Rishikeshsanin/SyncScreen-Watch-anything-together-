import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
const temp=await mkdtemp(join(tmpdir(),'syncscreen-')),file=join(temp,'sample.webm');
let browser,child;
try{
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=160x90:rate=25','-t','30','-c:v','libvpx','-b:v','100k','-an',file]);
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),PUBLIC_ORIGIN:''}});await once(child.stdout,'data');
 browser=await chromium.launch({headless:true});const host=await browser.newPage(),guest=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];
 for(const p of [host,guest]){p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:'+port);await p.waitForFunction(()=>document.querySelector('#connection').textContent==='Connected');}
 await host.locator('#name').fill('Host');await host.locator('#create').click();await host.locator('#roomCode').waitFor({state:'visible'});const code=await host.locator('#roomCode').textContent();
 await guest.locator('#name').fill('Guest');await guest.locator('#code').fill(code);await guest.locator('#join').click();await guest.locator('#roomCode').waitFor({state:'visible'});assert.equal(await guest.locator('#play').isDisabled(),true);
 await host.locator('#file').setInputFiles(file);await guest.waitForFunction(()=>document.querySelector('#mediaTitle').textContent==='sample.webm');await guest.locator('#file').setInputFiles(file);
 for(const p of [host,guest]){await p.waitForFunction(()=>document.querySelector('#video').readyState>=3);await p.locator('#unlock').click();await p.waitForFunction(()=>document.querySelector('#syncStatus').textContent.includes('Estimated media drift'));}
 await host.locator('#mode').selectOption('wait');await host.waitForFunction(()=>document.querySelector('#people').textContent.match(/Ready/g)?.length===2);
 await host.locator('#play').click();for(const p of [host,guest])await p.waitForFunction(()=>!document.querySelector('#video').paused&&document.querySelector('#video').currentTime>0.5);
 const samples=[];for(let i=0;i<25;i++){const [a,b]=await Promise.all([host.evaluate(()=>document.querySelector('#video').currentTime),guest.evaluate(()=>document.querySelector('#video').currentTime)]);samples.push(Math.abs(a-b)*1000);await new Promise(r=>setTimeout(r,100));}
 samples.sort((a,b)=>a-b);const percentile=p=>samples[Math.ceil(p*samples.length)-1];console.log(JSON.stringify({scenario:'two Chromium contexts, native local WebM, healthy localhost',samples:samples.length,p50_ms:percentile(.5),p95_ms:percentile(.95),p99_ms:percentile(.99)}));assert.ok(percentile(.95)<750,'Browser drift smoke-test threshold exceeded');
 await host.locator('#forward').click();for(const p of [host,guest])await p.waitForFunction(()=>document.querySelector('#video').currentTime>10);
 await host.locator('#play').click();for(const p of [host,guest])await p.waitForFunction(()=>document.querySelector('#video').paused);
 assert.deepEqual(errors,[]);console.log('Browser smoke test passed: local source, guest permissions, wait mode, play, seek, pause.');
}finally{await browser?.close();child?.kill();await rm(temp,{recursive:true,force:true});}

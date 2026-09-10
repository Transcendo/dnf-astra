const {chromium}=require('playwright');
const assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch(); const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.qaListeners=0;const add=EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener=function(...args){if(this===window||this===document) window.qaListeners++;return add.apply(this,args);};
  window.qaFrames=[];let prev=0;function sample(t){if(prev) qaFrames.push(t-prev);prev=t;requestAnimationFrame(sample);}requestAnimationFrame(sample);
 });
 await page.goto('file://'+path.resolve('index.html'));await page.click('#start');
 const listenerSamples=[], peaks=[], heap=[];
 const cdp=await page.context().newCDPSession(page);
 for(let run=0;run<30;run++){
  if(run){await page.keyboard.press('Escape');await page.click('#home');await page.click('#start');}
  let peak=0;
  const until=Date.now()+6000;
  while(Date.now()<until){
   const s=await page.evaluate(()=>skySnowSnapshot());peak=Math.max(peak,s.effects);assert(s.effects<=180);
   if(s.mode==='growth'){await page.locator('[data-upgrade="power"]').click();continue;}
   const e=s.enemies[0],p=s.player;
   if(e){for(const [key,on] of [['d',e.x-p.x>55],['a',e.x-p.x< -55],['s',e.y-p.y>15],['w',e.y-p.y< -15]]){if(on)await page.keyboard.down(key);else await page.keyboard.up(key);}}
   await page.keyboard.down('j');await page.keyboard.press('l');await page.keyboard.press('u');
   await page.waitForTimeout(100);
  }
  for(const k of ['w','a','s','d','j'])await page.keyboard.up(k);
  listenerSamples.push(await page.evaluate(()=>qaListeners));peaks.push(peak);
  await cdp.send('HeapProfiler.collectGarbage');heap.push((await cdp.send('Runtime.getHeapUsage')).usedSize);
 }
 const frames=await page.evaluate(()=>qaFrames);frames.sort((a,b)=>a-b);
 assert.equal(new Set(listenerSamples).size,1);assert.deepEqual(errors,[]);
 assert(heap.at(-1)<heap[0]+2_000_000);
 const result={browser:browser.version(),platform:process.platform,arch:process.arch,viewport:'1440x1000',realSeconds:180,restarts:29,frameSamples:frames.length,p50:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)],p99:frames[Math.floor(frames.length*.99)],over33ms:frames.filter(t=>t>33.4).length,listenerSamples,peaks,heap,errors};
 fs.writeFileSync('test-results/performance.json',JSON.stringify(result,null,2));console.log(result);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

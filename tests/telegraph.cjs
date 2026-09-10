const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const b=await chromium.launch(),p=await b.newPage({viewport:{width:1024,height:768}});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date('2026-01-01')});await p.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
 await p.goto('file://'+path.resolve('锅盖雪人.html'));await p.click('#start');
 await p.keyboard.down('d');await p.clock.runFor(1500);await p.keyboard.up('d');
 let s;
 for(let i=0;i<100;i++){s=await p.evaluate(()=>skySnowSnapshot());if(s.hazards.length)break;await p.clock.runFor(40);}
 assert(s.hazards.length);const hp=s.player.hp;
 await p.keyboard.down('a');await p.keyboard.down(s.player.y>390?'w':'s');await p.clock.runFor(760);
 await p.keyboard.up('a');await p.keyboard.up('s');await p.keyboard.up('w');
 s=await p.evaluate(()=>skySnowSnapshot());assert.equal(s.player.hp,hp);
 await p.screenshot({path:'test-results/dodge-1024.png'});
 await p.keyboard.press('Escape');const before=await p.evaluate(()=>skySnowSnapshot());await p.clock.runFor(3000);assert.deepEqual(await p.evaluate(()=>skySnowSnapshot()),before);
 assert.deepEqual(errors,[]);console.log('1024x768: real keyboard exits locked ground telegraph without damage; pause freezes full state');await b.close();
})().catch(e=>{console.error(e);process.exit(1)});

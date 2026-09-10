const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
process.chdir(path.join(__dirname, '..'));
fs.mkdirSync('test-results', {recursive:true});
(async () => {
  const browser = await chromium.launch();
  try {
    const errors = [], coverage = [];
    for (const viewport of [{width:1280,height:720},{width:1440,height:900}]) {
      const page = await browser.newPage({viewport});
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
      await page.clock.install({time:new Date("2026-09-10T00:00:00Z")});
      await page.clock.pauseAt(new Date("2026-09-10T00:00:00Z"));
      await page.context().setOffline(true);
      await page.goto('file://' + path.resolve('锅盖雪人.html'));
      const snap = () => page.evaluate(() => skySnowSnapshot());
      assert((await snap()).spriteReady);
      assert((await snap()).sceneryReady);
      await page.screenshot({path:`test-results/mage-menu-${viewport.width}.png`});
      await page.click('#start'); await page.clock.runFor(16);
      assert.equal((await snap()).animation.name, 'idle');
      await page.screenshot({path:`test-results/mage-idle-${viewport.width}.png`});
      for (const [key,face] of [['a',-1],['d',1]]) {
        await page.keyboard.down(key); await page.clock.runFor(160);
        assert.equal((await snap()).animation.name,'walk');
        assert.equal((await snap()).player.face,face);
        await page.screenshot({path:`test-results/mage-walk-${face}-${viewport.width}.png`});
        await page.keyboard.up(key); await page.clock.runFor(16);
      }
      const frames = new Set();
      for (const [key,weapon] of [['1','staff'],['2','wand'],['3','broom']]) {
        await page.keyboard.press(key);
        await page.keyboard.press('j');
        let state = await snap();
        assert.equal(state.player.weapon,weapon);
        assert(state.player.casts.length > 0);
        // Windup exists before a projectile or area damage can be released.
        assert.equal(state.spriteFrame,12);
        for (let i = 0; i < 14; i++) {
          await page.clock.runFor(16);
          state = await snap(); frames.add(state.spriteFrame);
          if (i === 7) await page.screenshot({path:`test-results/mage-cast-${weapon}-${viewport.width}.png`});
        }
        assert.equal((await snap()).player.casts.length,0);
        await page.clock.runFor(500);
      }
      assert(frames.has(13) && frames.has(14) && frames.has(15) && frames.has(16) && frames.has(17), JSON.stringify([...frames]));
      await page.keyboard.press('k'); await page.clock.runFor(80);
      assert.equal((await snap()).animation.name,'jump');
      assert.equal((await snap()).spriteFrame,18);
      await page.screenshot({path:`test-results/mage-jump-${viewport.width}.png`});
      await page.clock.runFor(360);
      assert.equal((await snap()).spriteFrame,19);
      await page.clock.runFor(500);
      await page.keyboard.press('Space'); await page.clock.runFor(48);
      assert.equal((await snap()).animation.name,'dash');
      await page.screenshot({path:`test-results/mage-dash-${viewport.width}.png`});
      await page.clock.runFor(300);
      let hurt = false;
      for (let i = 0; i < 1000; i++) {
        await page.clock.runFor(32);
        if ((await snap()).animation.name === 'hurt') { hurt = true; break; }
      }
      assert(hurt,'Enemy must trigger a real hit reaction');
      assert([20,21].includes((await snap()).spriteFrame));
      await page.screenshot({path:`test-results/mage-hurt-${viewport.width}.png`});
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      coverage.push({viewport,states:['idle','walk-left','walk-right','cast-all-weapons','jump-up','jump-down','dash','hurt'],castingFrames:[...frames]});
      await page.close();
    }
    const audit = await browser.newPage();
    await audit.goto('file://' + path.resolve('锅盖雪人.html'));
    const source = fs.readFileSync('assets/mage-snowman.png').toString('base64');
    const bounds = await audit.evaluate(async source => {
      const img = new Image(); img.src = 'data:image/png;base64,' + source; await img.decode();
      const c = document.createElement('canvas'); c.width=1728;c.height=1152;
      const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
      return SkySpriteData.frames.map(f => {
        const data=ctx.getImageData(f.x,f.y,288,288).data;
        let minX=288,minY=288,maxX=0,maxY=0,green=0,transparent=0;
        for(let y=0;y<288;y++)for(let x=0;x<288;x++) {
          const i=(y*288+x)*4;
          if(data[i+3]===0){transparent++;continue;}
          minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
          if(data[i+1]>Math.max(data[i],data[i+2])+28)green++;
        }
        return {minX,minY,maxX,maxY,green,transparent};
      });
    },source);
    for(const b of bounds){
      assert(b.minX>0 && b.minY>0 && b.maxX<287 && b.maxY===248,JSON.stringify(b));
      assert.equal(b.green,0); assert(b.transparent>40000);
    }
    await audit.close();
    // Missing sprite must take the existing geometric fallback, with controls live.
    const fallback=await browser.newPage();
    await fallback.route('**/assets/mage-snowman.png',r=>r.abort());
    await fallback.goto('file://'+path.resolve('index.html'));
    await fallback.click('#start');
    assert.equal(await fallback.evaluate(()=>skySnowSnapshot().spriteReady),false);
    await fallback.keyboard.press('3');await fallback.keyboard.press('j');
    assert.equal(await fallback.evaluate(()=>skySnowSnapshot().player.weapon),'broom');
    await fallback.screenshot({path:'test-results/mage-fallback.png'});
    await fallback.close();
    assert.deepEqual(errors,[]);
    const result={browser:browser.version(),coverage,atlasBounds:bounds,offline:true,fallback:true,errors};
    fs.writeFileSync('test-results/sprites.json',JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  fs.mkdirSync('test-results', { recursive: true });
  const isolated = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'sky-offline-'));
  const browser = await chromium.launch();
  const checks = [], errors = [], requests = [];
  try {
    const artifact = path.join(isolated, 'game.html');
    fs.copyFileSync('锅盖雪人.html', artifact);
    const context = await browser.newContext({ offline: true, viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => requests.push(r.url()));
    await page.addInitScript(() => {
      window.qaTones = 0;
      const original = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function (...args) {
        window.qaTones++;
        return original.apply(this, args);
      };
    });
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
    await page.goto(pathToFileURL(artifact).href);
    const snap = () => page.evaluate(() => skySnowSnapshot());
    assert.match(await page.title(), /锅盖雪人/);
    assert((await snap()).spriteReady && (await snap()).sceneryReady);
    await page.click('#start');
    assert.equal((await snap()).mode, 'play');
    assert(requests.every(url => url === pathToFileURL(artifact).href || url.startsWith('data:')));
    checks.push('isolated HTML, offline, both images decoded, no external dependencies');

    // Real keydown / keyup, dash lock, and no browser page scroll.
    await page.keyboard.down('ArrowRight');
    await page.clock.runFor(240);
    await page.keyboard.up('ArrowRight');
    const moved = (await snap()).player.x;
    assert(moved > 110);
    await page.clock.runFor(240);
    assert.equal((await snap()).player.x, moved);
    await page.keyboard.down('ArrowUp');
    await page.keyboard.press('Space');
    const dash = await snap();
    assert(dash.player.dash > 0 && dash.player.inv > 0);
    await page.keyboard.press('Space');
    assert.equal((await snap()).player.cd.dash, dash.player.cd.dash);
    await page.clock.runFor(160);
    await page.keyboard.up('ArrowUp');
    assert((await snap()).player.y < dash.player.y);
    assert.equal(await page.evaluate(() => scrollY), 0);
    await page.keyboard.down('d');
    await page.keyboard.press('Escape');
    await page.keyboard.up('d');
    const frozen = await snap();
    await page.clock.runFor(1000);
    assert.deepEqual(await snap(), frozen);
    await page.click('#resume');
    await page.clock.runFor(800);
    const stopped = (await snap()).player.x;
    await page.clock.runFor(160);
    assert.equal((await snap()).player.x, stopped);
    checks.push('arrow release, directional dash, cooldown, pause clears held keys, no scroll');

    await page.click('#sound');
    assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'true');
    const tones = await page.evaluate(() => qaTones);
    await page.keyboard.press('l');
    await page.clock.runFor(400);
    assert.equal(await page.evaluate(() => qaTones), tones);
    await page.click('#sound');
    await page.keyboard.press('u');
    await page.clock.runFor(160);
    assert((await page.evaluate(() => qaTones)) > tones);
    for (const [id, field] of [['effects', 'reducedFX'], ['shake', 'noShake']]) {
      await page.click(`#${id}`); assert.equal((await snap())[field], true);
      await page.click(`#${id}`); assert.equal((await snap())[field], false);
    }
    checks.push('audio oscillator suppressed while muted and resumes; effects/shake toggle both ways');

    // Take a real enemy hit, then use a potion close to the health cap.
    await page.keyboard.press('Escape'); await page.click('#home'); await page.click('#start');
    await page.keyboard.press('h'); assert.equal((await snap()).player.potions, 2);
    await page.keyboard.down('d'); await page.clock.runFor(2100); await page.keyboard.up('d');
    for (let i = 0; i < 300 && (await snap()).player.hp === 160; i++) await page.clock.runFor(32);
    const injured = await snap();
    assert(injured.player.hp < 160 && injured.player.hp > 115, JSON.stringify(injured.player));
    await page.keyboard.press('h');
    const healed = await snap();
    assert.equal(healed.player.hp, 160);
    assert.equal(healed.player.potions, 1);
    const healing = healed.events.filter(e => e.type === 'heal').at(-1);
    assert.equal(healing.source, 'potion');
    assert.equal(healing.applied, 160 - injured.player.hp);
    assert(healing.applied < healing.requested);
    await page.clock.runFor(16);
    await page.screenshot({ path: 'test-results/healing-actual.png' });
    checks.push({ healing, fullHealthPotionNotConsumed: true });

    for (const [width, height] of [[1024, 768], [1280, 720], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await page.keyboard.press('Escape');
      for (const selector of ['#game', '#resume', '#home', '#sound', '#effects']) {
        const box = await page.locator(selector).boundingBox();
        assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, selector);
      }
      await page.screenshot({ path: `test-results/integration-${width}.png` });
      await page.click('#resume');
    }
    checks.push('1024x768, 1280x720, 1440x900 canvas and controls fit');
    assert.deepEqual(errors, []);
    await context.close();

    const fallback = await browser.newPage();
    const fallbackErrors = [], failedAssets = [];
    fallback.on('pageerror', e => fallbackErrors.push(e.message));
    fallback.on('requestfailed', r => failedAssets.push(r.url()));
    await fallback.route('**/assets/*.png', route => route.abort());
    await fallback.goto(pathToFileURL(path.resolve('index.html')).href);
    await fallback.click('#start');
    const state = () => fallback.evaluate(() => skySnowSnapshot());
    assert(!(await state()).spriteReady && !(await state()).sceneryReady);
    for (const [key, weapon] of [['1', 'staff'], ['2', 'wand'], ['3', 'broom']]) {
      await fallback.keyboard.press(key); await fallback.keyboard.press('j');
      assert.equal((await state()).player.weapon, weapon);
    }
    await fallback.screenshot({ path: 'test-results/all-assets-fallback.png' });
    assert.equal(failedAssets.length, 2);
    assert.deepEqual(fallbackErrors, []);
    checks.push('both image requests deliberately blocked: fallback starts and all weapons switch');
    const report = { browser: browser.version(), checks, errors, externalRequests: 0, expectedFailedAssets: failedAssets.map(u => path.basename(u)) };
    fs.writeFileSync('test-results/integration.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    fs.rmSync(isolated, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

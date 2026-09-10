const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
(async () => {
  assert.deepEqual(fs.readdirSync('.').filter(name => name.endsWith('.html')), ['index.html']);
  const html = fs.readFileSync('index.html');
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    if (req.url !== '/' && req.url !== '/index.html') { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const entry of ['/', '/index.html']) {
      await page.goto(`http://127.0.0.1:${server.address().port}${entry}`);
      await page.waitForFunction(() => skySnowSnapshot().spriteReady && skySnowSnapshot().sceneryReady);
      await page.click('#start');
      await page.keyboard.press('3');
      assert.equal(await page.evaluate(() => skySnowSnapshot().player.weapon), 'broom');
      assert.equal(await page.locator('#effects').count(), 1);
    }
    assert.deepEqual(errors, []);
    assert(requests.every(url => ['/', '/index.html', '/favicon.ico'].includes(url)), JSON.stringify(requests));
    console.log(`Deployment passed: Chromium ${browser.version()}, root and index.html, embedded assets, weapon switching, no page errors`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

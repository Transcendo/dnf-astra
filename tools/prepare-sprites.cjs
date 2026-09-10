// Deterministic chroma-key/cell registration for the generated green-screen asset.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
process.chdir(path.join(__dirname, '..'));
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const input = fs.readFileSync('assets/source/mage-snowman-green.png').toString('base64');
    const output = await page.evaluate(async input => {
      const image = new Image(); image.src = 'data:image/png;base64,' + input; await image.decode();
      if (image.width !== 1536 || image.height !== 1024) throw Error('Unexpected sheet size');
      const canvas = document.createElement('canvas'); canvas.width = 1536; canvas.height = 1024;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, 1536, 1024);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const d = pixels.data, m = Math.max(d[i], d[i + 2]);
        if (d[i + 1] > m + 28 && d[i + 1] > m * 1.25) {
          d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
        } else if (d[i + 1] > m) d[i + 1] = m; // remove edge spill
      }
      ctx.putImageData(pixels, 0, 0);
      const atlas = document.createElement('canvas'); atlas.width = 1728; atlas.height = 1152;
      const a = atlas.getContext('2d');
      const centers = [143,143,143,143,143,143,141,139,145,141,142,143,137,146,145,142,143,143,148,145,149,144,143,147];
      const hands = [[210,142],[210,142],[210,142],[210,142],[210,142],[210,142],
        [211,144],[206,144],[213,140],[207,141],[203,140],[209,146],
        [200,138],[181,130],[214,75],[241,105],[206,117],[209,141],
        [216,118],[205,128],[213,129],[181,151],[201,161],[199,153]];
      const frames = [];
      for (let n = 0; n < 24; n++) {
        const sx = n % 6 * 256, sy = Math.floor(n / 6) * 256;
        const cell = ctx.getImageData(sx, sy, 256, 256);
        let bottom = 0;
        for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++)
          if (cell.data[(y * 256 + x) * 4 + 3] > 64) bottom = Math.max(bottom, y);
        const dx = 144 - centers[n], dy = 248 - bottom;
        const tx = n % 6 * 288, ty = Math.floor(n / 6) * 288;
        a.save(); a.beginPath(); a.rect(tx, ty, 288, 288); a.clip();
        a.drawImage(canvas, sx, sy, 256, 256, tx + dx, ty + dy, 256, 256); a.restore();
        frames.push({ x:tx, y:ty, hand:[hands[n][0]+dx, hands[n][1]+dy], sourceFoot:[centers[n],bottom] });
      }
      return { png:atlas.toDataURL().split(',')[1], frames };
    }, input);
    fs.writeFileSync('assets/mage-snowman.png', Buffer.from(output.png, 'base64'));
    fs.writeFileSync('sprite-data.js', '"use strict";\nconst SkySpriteData = ' + JSON.stringify({size:288,anchor:[144,248],scale:0.46,frames:output.frames}, null, 2) + ';\n');
    console.log('Registered 24 RGBA frames at foot (144,248); wrote atlas and hand metadata.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

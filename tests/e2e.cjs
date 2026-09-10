const { chromium } = require("playwright");
const path = require("path"),
  assert = require("node:assert/strict"),
  fs = require("fs");
process.chdir(path.join(__dirname, ".."));
fs.mkdirSync("test-results", { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  const coverage = new Set();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.addInitScript(() => {
    let seed = 1616;
    Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    window.damageAudit = [];
    window.addEventListener("sky-combat", e => {
      if (e.detail.type === "damage") window.damageAudit.push(e.detail);
    });
  });
  await page.clock.install({time: new Date("2026-01-01T00:00:00Z")});
  await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
  await page.goto("file://" + path.resolve("锅盖雪人.html"));
  const snap = () => page.evaluate(() => skySnowSnapshot());
  let held = new Set();
  async function setKeys(want) {
    const next = new Set(want);
    for (const k of held) if (!next.has(k)) await page.keyboard.up(k);
    for (const k of next) if (!held.has(k)) await page.keyboard.down(k);
    held = next;
  }
  assert.match(await page.title(), /锅盖雪人/);
  assert(await page.locator("#start").isVisible());
  assert((await snap()).sceneryReady);
  // Actual keyboard switching must not refresh basic/skill timers or reset the run.
  await page.click("#start");
  await page.keyboard.press("j");
  await page.keyboard.press("l");
  await page.keyboard.press("u");
  const locked = await snap();
  for (const [key, id] of [
    ["2", "wand"],
    ["3", "broom"],
    ["1", "staff"],
  ]) {
    await page.keyboard.press(key);
    await page.keyboard.press("j");
    await page.keyboard.press("l");
    await page.keyboard.press("u");
    const s = await snap();
    assert.equal(s.player.weapon, id);
    assert.equal(s.room, locked.room);
    assert.equal(s.player.hp, locked.player.hp);
    assert.deepEqual(s.player.cd, locked.player.cd);
    assert.equal(s.player.hitCd, locked.player.hitCd);
    assert.equal(s.shots, 0);
  }
  await page.keyboard.press("Escape");
  await page.click("#home");
  const result = [];
  for (let run = 0; run < 9; run++) {
    const level = run % 3,
      loadout = ["staff", "wand", "broom"][Math.floor(run / 3)];
    if (run) await page.click("#home");
    await page.click(`[data-level="${level}"]`);
    await page.click("#start");
    await page.evaluate(() => { window.damageAudit = []; });
    let initial = await snap();
    assert.equal(initial.level, level);
    const visited = new Set(),
      damageWeapons = new Set(),
      specialWeapons = new Set(),
      captured = new Set();
    let state;
    for (let i = 0; i < 2200; i++) {
      state = await snap();
      if (run === 0 && !visited.has(state.room)) {
        await page.clock.runFor(650);
        await page.screenshot({path:`test-results/room-${state.room}.png`});
      }
      visited.add(state.room);
      for (const event of state.events) {
        if (event.type === "control") coverage.add(event.control);
        if (event.type === "boss-phase") coverage.add("boss-phase");
        if (event.type === "telegraph" && event.antiAir) coverage.add("antiAir");
      }
      assert(state.effects <= state.effectLimit);
      if (state.enemies.some(e=>e.z>0) && !coverage.has("air-shot")) {
        await page.screenshot({path:"test-results/air-pursuit.png"}); coverage.add("air-shot");
      }
      if (state.hazards.some(h=>h.antiAir) && !coverage.has("warning-shot")) {
        await page.screenshot({path:"test-results/anti-air.png"}); coverage.add("warning-shot");
      }
      if (state.mode === "growth") {
        await setKeys([]);
        assert(await page.locator("#growth").isVisible());
        const frozen = await snap();
        await page.clock.runFor(2500);
        await page.keyboard.press("j");
        await page.keyboard.press("Escape");
        assert.deepEqual(await snap(), frozen);
        const choice = ["power", "crit", "haste"][(run + state.room) % 3];
        const expected = require("../combat.js");
        const preview = structuredClone(state.player);
        expected.applyUpgrade(preview, choice);
        assert.match(await page.locator(`[data-upgrade="${choice}"]`).innerText(), /选择后/);
        if (run === 0 && state.room === 0) {
          await page.screenshot({path:"test-results/growth.png"});
          await page.setViewportSize({width:1024,height:768});
          await page.screenshot({path:"test-results/growth-1024.png"});
          for (const card of await page.locator("[data-upgrade]").all()) {
            const box = await card.boundingBox();
            assert(box.x >= 0 && box.x + box.width <= 1024 && box.y >= 0 && box.y + box.height <= 768);
          }
          await page.setViewportSize({width:1440,height:1000});
        }
        if (run === 0 && state.room === 0) await page.keyboard.press("Enter");
        else await page.click(`[data-upgrade="${choice}"]`);
        const grown = await snap();
        assert.equal(grown.mode, "play");
        assert.equal(grown.player.upgrades.length, state.room + 1);
        assert.deepEqual(grown.panel, expected.stats(preview));
        // Weapon switch immediately uses the grown attack, without changing upgrades.
        for (const [key, weapon] of [["2", "wand"], ["3", "broom"], ["1", "staff"]]) {
          await page.keyboard.press(key);
          const switched = await snap();
          assert.equal(switched.panel.attack, expected.stats({...preview, weapon}).attack);
        }
        if (run === 0 && state.room === 0) {
          await page.clock.runFor(32);
          await page.screenshot({path:"test-results/grown-panel.png"});
          await page.clock.runFor(2100);
          assert.equal((await snap()).combo, 0);
          assert((await snap()).events.some(e => e.type === "combo-break" && e.reason === "超时"));
        }
        const seconds = (await snap()).combatSeconds;
        await page.clock.runFor(500);
        assert.equal((await snap()).combatSeconds, seconds);
        continue;
      }
      if (state.mode !== "play") break;
      for (const event of state.events)
        if (event.type === "damage") {
          damageWeapons.add(event.weapon);
          if (event.skill === "special") specialWeapons.add(event.weapon);
        }
      const wanted = loadout;
      if (state.player.weapon !== wanted)
        await page.keyboard.press(
          String(["staff", "wand", "broom"].indexOf(wanted) + 1),
        );
      if (!captured.has(wanted) && state.combo > 1) {
        await page.screenshot({
          path: `test-results/weapon-${level}-${wanted}.png`,
        });
        captured.add(wanted);
      }
      const p = state.player,
        desired = ["j"];
      if (state.clear) {
        if (p.x < 905) desired.push("d");
        if (p.y < 375) desired.push("s");
        if (p.y > 407) desired.push("w");
      } else {
        let e = [...state.enemies].sort(
          (a, b) =>
            Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y),
        )[0];
        if (e) {
          const dx = e.x - p.x,
            dy = e.y - p.y;
          if (Math.abs(dx) > 63) desired.push(dx > 0 ? "d" : "a");
          else if (dx * p.face < 0) desired.push(dx > 0 ? "d" : "a");
          if (Math.abs(dy) > 13) desired.push(dy > 0 ? "s" : "w");
          await setKeys(desired);
          if (p.z === 0 && p.cd.jump === 0) await page.keyboard.press("k");
          if (Math.abs(dx) < 160 && Math.abs(dy) < 70 && p.cd.frost === 0)
            await page.keyboard.press("u");
          if (Math.abs(dy) < 30 && dx * p.face > 0 && p.cd.lid === 0)
            await page.keyboard.press("l");
          if (p.hp < 115 && p.potions > 0) await page.keyboard.press("h");
        }
      }
      await setKeys(desired);
      await page.clock.runFor(160);
      if (i % 120 === 0)
        console.log(
          `level=${level} room=${state.room} hp=${Math.round(p.hp)} enemies=${state.enemies.length}`,
        );
    }
    await setKeys([]);
    state = await snap();
    await page.screenshot({
      path: `test-results/result-${loadout}-${level}.png`,
    });
    result.push({
      level,
      damageWeapons: [...damageWeapons],
      specialWeapons: [...specialWeapons],
      initialEnemyHP: initial.enemies[0].max,
      mode: state.mode,
      rooms: [...visited],
      seconds: state.clock,
      hp: state.player.hp,
      kills: state.kills,
      upgrades: state.player.upgrades,
      totalDamage: state.totalDamage, combatSeconds: state.combatSeconds,
    });
    assert.equal(state.mode, "win", JSON.stringify(result));
    assert.equal(state.player.upgrades.length, 3);
    const audit = await page.evaluate(() => window.damageAudit);
    assert(Math.abs(audit.reduce((sum, e) => sum + e.applied, 0) - state.totalDamage) < 1e-6);
    assert(audit.some(e => e.critical));
    if (run === 0) assert(audit.some(e => e.attack > require("../combat.js").weapons[e.weapon].attack));
    for (const e of audit) {
      // Full formula is checked using the cast-time critical multiplier emitted by the game.
      assert.equal(e.damage, require("../combat.js").calculateDamage({...e, criticalMultiplier:e.criticalMultiplier}, e.defense));
      assert(e.applied <= e.damage && e.applied >= 0);
    }
    assert(state.combatSeconds > 0 && state.combatSeconds < state.clock);
    assert.match(await page.locator("#result-text").innerText(), /总伤害.*有效战斗/s);
    assert.equal(visited.size, 4);
    assert(damageWeapons.has(loadout));
    assert(specialWeapons.has(loadout), JSON.stringify(result));
    await page.click("#retry");
    assert.equal((await snap()).room, 0);
    assert.deepEqual((await snap()).player.upgrades, []);
    assert.equal((await snap()).totalDamage, 0);
    assert.equal((await snap()).combatSeconds, 0);
    assert.equal((await snap()).panel.attack, 30);
    await page.keyboard.press("Escape");
    await page.click("#home");
    if (run < 8) {
      await page.click("#start");
      await page.keyboard.press("Escape");
    }
  }
  // Lose without attacking, then restart with keyboard.
  await page.click('[data-level="2"]');
  await page.click("#start");
  await page.keyboard.down("d");
  await page.clock.runFor(2100);
  await page.keyboard.up("d");
  for (let i = 0; i < 700; i++) {
    if ((await snap()).mode === "lose") break;
    await page.clock.runFor(250);
  }
  assert.equal((await snap()).mode, "lose");
  await page.screenshot({ path: "test-results/lose.png" });
  await page.keyboard.press("r");
  assert.equal((await snap()).mode, "play");
  assert.equal((await snap()).player.hp, 160);
  // Pause freezes state; blur automatically pauses.
  await page.keyboard.press("Escape");
  const before = await snap();
  await page.clock.runFor(1000);
  assert.equal((await snap()).clock, before.clock);
  assert.equal((await snap()).combatSeconds, before.combatSeconds);
  await page.click("#resume");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal((await snap()).mode, "pause");
  await page.click("#resume");
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
    { width: 1672, height: 941 },
  ]) {
    await page.setViewportSize(viewport);
    await page.screenshot({
      path: `test-results/desktop-${viewport.width}.png`,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  // Network-free build and missing-background fallback both remain playable.
  const fallback = await browser.newPage();
  await fallback.route("**/assets/sky-castle.png", (route) => route.abort());
  await fallback.goto("file://" + path.resolve("index.html"));
  await fallback.click("#start");
  assert.equal(
    (await fallback.evaluate(() => skySnowSnapshot())).sceneryReady,
    false,
  );
  await fallback.keyboard.press("2");
  await fallback.keyboard.press("j");
  assert.equal(
    (await fallback.evaluate(() => skySnowSnapshot())).player.weapon,
    "wand",
  );
  await fallback.screenshot({ path: "test-results/fallback.png" });
  await fallback.close();
  await page.click("#effects"); await page.click("#shake");
  assert((await snap()).reducedFX); assert((await snap()).noShake);
  await page.screenshot({path:"test-results/reduced-effects.png"});
  for (const item of ["launch", "pursuit", "freeze", "immune", "boss-phase", "antiAir"]) assert(coverage.has(item), [...coverage].join(","));
  fs.writeFileSync("test-results/feel-coverage.json",JSON.stringify([...coverage],null,2));
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        browser: browser.version(),
        result,
        lossRestart: true,
        pause: true,
        blur: true,
        errors,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    "test-results/results.json",
    JSON.stringify(
      {
        browser: browser.version(),
        result,
        lossRestart: true,
        pause: true,
        blur: true,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

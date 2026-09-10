const { test } = require("node:test");
const assert = require("node:assert/strict");
const C = require("../combat.js");
const player = () => ({
  weapon: "staff",
  x: 300,
  y: 390,
  face: 1,
  chain: 0,
  hp: 83,
  hitCd: 0.4,
  cd: { lid: 3, frost: 5, dash: 0.7, jump: 0.2 },
});
test("equipment changes preserve health, position, combo and every active cooldown", () => {
  const p = player(),
    before = structuredClone(p);
  for (const id of ["wand", "broom", "staff"]) {
    assert(C.switchWeapon(p, id));
    assert.deepEqual({ ...p, weapon: "staff" }, before);
  }
  assert.equal(C.switchWeapon(p, "invalid"), false);
});
test("front attacks reject rear and wrong depth in both directions; broom skill surrounds", () => {
  for (const weapon of ["staff", "broom"])
    for (const face of [-1, 1]) {
      const p = { ...player(), weapon, face },
        s = C.attackSpec(p);
      assert(C.inArea(s, { x: 300 + face * 60, y: 400 }));
      assert(!C.inArea(s, { x: 300 - face * 10, y: 390 }));
      assert(!C.inArea(s, { x: 300 + face * 60, y: 470 }));
    }
  const s = C.attackSpec({ ...player(), weapon: "broom" }, "special");
  assert(C.inArea(s, { x: 230, y: 390 }));
  assert(!C.inArea(s, { x: 300, y: 475 }));
});
test("staff burst aims ahead, never behind, and excludes off-lane targets", () => {
  for (const face of [-1, 1]) {
    const s = C.attackSpec({ ...player(), face }, "special");
    assert(C.inArea(s, { x: 300 + 135 * face, y: 390 }));
    assert(!C.inArea(s, { x: 300 - 30 * face, y: 390 }));
    assert(!C.inArea(s, { x: 300 + 135 * face, y: 470 }));
  }
});
test("damage supports attack scale, skill multiplier, deterministic crit, cast-time snapshot", () => {
  const p = { ...player(), weapon: "wand" },
    s = C.attackSpec(p, "special", () => 1);
  assert.equal(C.calculateDamage(s), 34);
  C.switchWeapon(p, "staff");
  p.face = -1;
  assert.equal(C.calculateDamage(s), 34);
  assert.equal(s.face, 1);
  assert.equal(
    C.calculateDamage(
      C.attackSpec({ ...p, attackScale: 2, critChance: 1 }, "special", () => 0),
    ),
    189,
  );
});
test("swept projectile collision orders nearest first, excludes old hits/dead/wrong depth", () => {
  for (const face of [-1, 1]) {
    const near = { hp: 10, x: 300 + face * 30, y: 390 },
      far = { hp: 10, x: 300 + face * 80, y: 390 };
    const s = {
      ...C.attackSpec({ ...player(), weapon: "wand", face }),
      x: 300 + face * 100,
      hit: new Set(),
    };
    assert.deepEqual(
      C.projectileTargets(s, 300, [
        far,
        near,
        { hp: 10, x: near.x, y: 470 },
        { hp: 0, x: near.x, y: 390 },
      ]),
      [near, far],
    );
    s.hit.add(near);
    assert.deepEqual(C.projectileTargets(s, 300, [near, far]), [far]);
  }
});
test("animation interface handles defeat, hurt, dash, jump, casting and movement", () => {
  const p = player();
  assert.equal(C.animationState(p).name, "idle");
  for (const [field, value, name] of [
    ["walk", 1, "walk"],
    ["attack", 0.2, "cast"],
    ["z", 10, "jump"],
    ["dash", 0.2, "dash"],
    ["hurt", 0.1, "hurt"],
    ["hp", 0, "defeat"],
  ]) {
    p[field] = value;
    assert.equal(C.animationState(p).name, name);
  }
});
test("defense formula, critical threshold and caps use deterministic RNG", () => {
  const p = { ...player(), critChance: 0.1, critMultiplier: 1.5 };
  assert.equal(C.calculateDamage(C.attackSpec(p, "basic", () => 0.1)), 30);
  assert.equal(C.calculateDamage(C.attackSpec(p, "basic", () => 0.099)), 45);
  assert.equal(C.calculateDamage(C.attackSpec(p, "special", () => 0.5), 25), 50);
  assert.equal(C.calculateDamage(C.attackSpec(p, "basic", () => 0.5), -10), 30);
  assert.equal(C.calculateDamage(C.attackSpec(p, "basic", () => 0.5), 999), 15);
  assert.equal(C.attackSpec({ ...p, critChance: 0 }, "basic", () => 0).critical, false);
  assert.equal(C.attackSpec({ ...p, critChance: 2 }, "basic", () => 0.75).critical, false);
});
test("all weapons deliver actual growth damage, overkill counts only remaining HP", () => {
  for (const weapon of Object.keys(C.weapons)) {
    const p = { ...player(), weapon };
    const before = C.calculateDamage(C.attackSpec(p, "basic", () => 1), 10);
    C.applyUpgrade(p, "power");
    const spec = C.attackSpec(p, "basic", () => 1);
    const target = { hp: 100, defense: 10 };
    const dealt = C.applyDamage(target, spec);
    assert(dealt.applied > before);
    assert.equal(target.hp, 100 - dealt.applied);
    const low = { hp: 3, defense: 10 };
    assert.equal(C.applyDamage(low, spec).applied, 3);
    assert.equal(low.hp, 0);
    assert.equal(C.applyDamage(low, spec).applied, 0);
  }
});
test("upgrade tradeoffs, upper/lower limits and cooldown floor", () => {
  for (const u of C.upgrades) {
    const p = { ...player(), attackScale: 1, critChance: 0.1, haste: 0 };
    const before = C.stats(p);
    C.applyUpgrade(p, u.id);
    const after = C.stats(p);
    if (u.id === "power") {
      assert(after.attack > before.attack);
      assert(after.cooldownScale > before.cooldownScale);
    } else assert(after.attack < before.attack);
    for (let i = 0; i < 100; i++) C.applyUpgrade(p, u.id);
    const v = C.stats(p);
    assert(v.attack >= C.weapons.staff.attack * 0.5 && v.attack <= C.weapons.staff.attack * 2.5);
    assert(v.critChance <= 0.75 && v.critMultiplier <= 2.5);
    assert(v.cooldownScale >= 0.4 && v.cooldownScale <= 1.5);
    assert(C.cooldown(p, -10) >= 0.1);
    assert(C.cooldown(p, 7) >= 2.8 - 1e-9);
  }
  assert.equal(C.applyUpgrade(player(), "bad"), false);
  assert.deepEqual([1, 3, 8, 15, 30].map(C.comboRank), ["D · 初击", "C · 起势", "B · 熟练", "A · 华丽", "S · 超凡"]);
});
test("difficulty changes pressure as well as HP and armor", () => {
  for (let i = 1; i < 3; i++) {
    const a = C.difficulties[i - 1], b = C.difficulties[i];
    assert(b.hp > a.hp && b.dmg > a.dmg && b.speed > a.speed && b.wind < a.wind && b.defense > a.defense);
  }
});

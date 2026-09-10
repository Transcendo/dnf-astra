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

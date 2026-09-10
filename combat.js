"use strict";
// Pure combat rules shared by the browser and Node regression tests.
const SkyCombat = (() => {
  const weapons = {
    staff: {
      name: "法杖",
      key: "1",
      attack: 30,
      interval: 0.48,
      speed: 1,
      color: "#c7a8ff",
      description: "前方范围 · 慢速高伤",
      basic: { shape: "front", range: 160, depth: 52, knock: 15 },
      skill: {
        name: "星落爆破",
        cooldown: 3.8,
        multiplier: 2.1,
        shape: "burst",
        offset: 135,
        range: 110,
        depth: 64,
        knock: 22,
      },
    },
    wand: {
      name: "魔杖",
      key: "2",
      attack: 13,
      interval: 0.17,
      speed: 1,
      color: "#9cefff",
      description: "直线弹道 · 快速连击",
      basic: {
        shape: "projectile",
        speed: 680,
        range: 460,
        depth: 27,
        knock: 3,
        pierce: false,
      },
      skill: {
        name: "穿星飞弹",
        cooldown: 2.6,
        multiplier: 2.6,
        shape: "projectile",
        speed: 740,
        range: 690,
        depth: 32,
        knock: 12,
        pierce: true,
      },
    },
    broom: {
      name: "扫把",
      key: "3",
      attack: 22,
      interval: 0.32,
      speed: 1.18,
      color: "#ffd598",
      description: "近身横扫 · 移速 +18%",
      basic: { shape: "front", range: 105, depth: 58, knock: 9 },
      skill: {
        name: "旋风扫击",
        cooldown: 3.2,
        multiplier: 2,
        shape: "sweep",
        range: 145,
        depth: 80,
        knock: 25,
      },
    },
  };
  const skills = {
    frost: { name: "冰霜环", cooldown: 7, multiplier: 2, range: 175 },
    dash: { name: "冲刺", cooldown: 1.2 },
    jump: { name: "跳跃", cooldown: 0.95 },
  };
  // Freeze recursively so extensions cannot accidentally mutate shared configuration.
  function freeze(value) {
    Object.values(value).forEach((v) => {
      if (v && typeof v === "object") freeze(v);
    });
    return Object.freeze(value);
  }
  freeze(weapons);
  freeze(skills);
  function switchWeapon(player, id) {
    if (!weapons[id] || player.weapon === id) return false;
    player.weapon = id;
    return true;
  }
  // Capture attack, direction and critical roll at CAST time. Switching later cannot
  // redirect or upgrade a projectile already in flight.
  function attackSpec(player, skill = "basic", rng = Math.random) {
    const weapon = weapons[player.weapon],
      config =
        skill === "frost"
          ? skills.frost
          : skill === "basic"
            ? weapon.basic
            : weapon.skill;
    const multiplier =
      skill === "basic"
        ? [1, 1.12, 1.35][player.chain || 0]
        : config.multiplier;
    const attack = weapon.attack * (player.attackScale ?? 1);
    const critical = rng() < (player.critChance ?? 0);
    return {
      ...config,
      weapon: player.weapon,
      skill,
      attack,
      multiplier,
      critical,
      criticalMultiplier: player.critMultiplier ?? 1.5,
      face: player.face,
      x: player.x,
      y: player.y,
      color: weapon.color,
    };
  }
  function calculateDamage(spec) {
    return Math.max(
      0,
      Math.round(
        spec.attack *
          spec.multiplier *
          (spec.critical ? spec.criticalMultiplier : 1),
      ),
    );
  }
  function inArea(spec, target) {
    const dx = (target.x - spec.x) * spec.face,
      dy = Math.abs(target.y - spec.y);
    if (spec.shape === "front")
      return dx >= 0 && dx < spec.range && dy < spec.depth;
    if (spec.shape === "burst")
      return Math.hypot((dx - spec.offset) / spec.range, dy / spec.depth) < 1;
    return Math.hypot(dx / spec.range, dy / spec.depth) < 1;
  }
  // Swept segment avoids tunnelling at low frame rates; nearest target wins.
  function projectileTargets(shot, previousX, targets) {
    return targets
      .filter(
        (e) =>
          e.hp > 0 &&
          !shot.hit.has(e) &&
          Math.abs(e.y - shot.y) < shot.depth &&
          e.x >= Math.min(previousX, shot.x) - 12 &&
          e.x <= Math.max(previousX, shot.x) + 12,
      )
      .sort((a, b) => (a.x - b.x) * shot.face);
  }
  function animationState(player) {
    return {
      name:
        player.hp <= 0
          ? "defeat"
          : player.hurt > 0
            ? "hurt"
            : player.dash > 0
              ? "dash"
              : player.z > 0
                ? "jump"
                : player.attack > 0
                  ? "cast"
                  : player.walk
                    ? "walk"
                    : "idle",
      facing: player.face,
      weapon: player.weapon,
      chain: player.chain,
      elapsed: player.animationTime || 0,
    };
  }
  return Object.freeze({
    weapons,
    skills,
    switchWeapon,
    attackSpec,
    calculateDamage,
    inArea,
    projectileTargets,
    animationState,
  });
})();
if (typeof module !== "undefined") module.exports = SkyCombat;

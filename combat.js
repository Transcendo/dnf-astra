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
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const difficulties = [
    { name: "普通", hp: 1, dmg: 0.85, speed: 0.9, wind: 1.15, defense: 0 },
    { name: "冒险", hp: 1.2, dmg: 1.25, speed: 1.12, wind: 0.9, defense: 8 },
    { name: "王者", hp: 1.4, dmg: 1.7, speed: 1.4, wind: 0.7, defense: 16 },
  ];
  const defenses = { dragon: 0, mage: 0, golem: 15, boss: 10 };
  const upgrades = [
    { id: "power", name: "重铸 · 强攻", description: "攻击 +25% 基础值；技能冷却 +8% 基础值", attack: 0.25, crit: 0, haste: -0.08 },
    { id: "crit", name: "星晶 · 会心", description: "暴击率 +15 个百分点；暴伤 +0.2 倍；攻击 −5% 基础值", attack: -0.05, crit: 0.15, critDamage: 0.2, haste: 0 },
    { id: "haste", name: "轻羽 · 速咏", description: "技能冷却 −20% 基础值；攻击 −5% 基础值（不影响普攻间隔）", attack: -0.05, crit: 0, haste: 0.2 },
  ];
  function stats(player) {
    return {
      attack: weapons[player.weapon].attack * clamp(player.attackScale ?? 1, 0.5, 2.5),
      critChance: clamp(player.critChance ?? 0, 0, 0.75),
      critMultiplier: clamp(player.critMultiplier ?? 1.5, 1, 2.5),
      cooldownScale: clamp(1 - (player.haste ?? 0), 0.4, 1.5),
    };
  }
  function cooldown(player, base) {
    return Math.max(0.1, base * stats(player).cooldownScale);
  }
  function applyUpgrade(player, id) {
    const u = upgrades.find(u => u.id === id);
    if (!u) return false;
    player.attackScale = clamp((player.attackScale ?? 1) + u.attack, 0.5, 2.5);
    player.critChance = clamp((player.critChance ?? 0) + u.crit, 0, 0.75);
    player.critMultiplier = clamp((player.critMultiplier ?? 1.5) + (u.critDamage ?? 0), 1, 2.5);
    player.haste = clamp((player.haste ?? 0) + u.haste, -0.5, 0.6);
    (player.upgrades ??= []).push(id);
    return true;
  }
  function applyDamage(target, spec) {
    const damage = calculateDamage(spec, target.defense ?? 0);
    const applied = Math.min(Math.max(0, target.hp), damage);
    target.hp = Math.max(0, target.hp - applied);
    return { damage, applied };
  }
  function comboRank(combo) {
    return combo >= 30 ? "S · 超凡" : combo >= 15 ? "A · 华丽" : combo >= 8 ? "B · 熟练" : combo >= 3 ? "C · 起势" : "D · 初击";
  }
  // Freeze recursively so extensions cannot accidentally mutate shared configuration.
  function freeze(value) {
    Object.values(value).forEach((v) => {
      if (v && typeof v === "object") freeze(v);
    });
    return Object.freeze(value);
  }
  freeze(weapons);
  freeze(skills);
  freeze(difficulties);
  freeze(defenses);
  freeze(upgrades);
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
    const panel = stats(player);
    const attack = panel.attack;
    const critical = rng() < panel.critChance;
    return {
      ...config,
      weapon: player.weapon,
      skill,
      attack,
      multiplier,
      critical,
      criticalMultiplier: panel.critMultiplier,
      face: player.face,
      x: player.x,
      y: player.y,
      color: weapon.color,
    };
  }
  function calculateDamage(spec, defense = 0) {
    return Math.max(
      0,
      Math.round(
        spec.attack *
          spec.multiplier *
          (spec.critical ? spec.criticalMultiplier : 1) * 100 / (100 + clamp(defense, 0, 100)),
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
    difficulties, defenses, upgrades, stats, cooldown, applyUpgrade, applyDamage, comboRank,
    switchWeapon,
    attackSpec,
    calculateDamage,
    inArea,
    projectileTargets,
    animationState,
  });
})();
if (typeof module !== "undefined") module.exports = SkyCombat;

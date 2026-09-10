"use strict";
(() => {
  const canvas = document.querySelector("#game"),
    c = canvas.getContext("2d");
  const $ = (s) => document.querySelector(s),
    W = 960,
    H = 540;
  const scenery = new Image();
  let sceneryReady = false;
  scenery.onload = () => {
    sceneryReady = true;
  };
  scenery.onerror = () => {
    sceneryReady = false;
  };
  scenery.src = "assets/sky-castle.png";
  const mageSprite = new Image();
  let spriteReady = false;
  mageSprite.onload = () => { spriteReady = mageSprite.naturalWidth === 1728 && mageSprite.naturalHeight === 1152; };
  mageSprite.onerror = () => { spriteReady = false; };
  mageSprite.src = "assets/mage-snowman.png";
  const {
    weapons,
    skills,
    difficulties, defenses, upgrades, stats, cooldown, applyUpgrade, applyDamage, comboRank,
    switchWeapon,
    attackSpec,
    calculateDamage,
    inArea,
    projectileTargets,
    animationState,
  } = SkyCombat;
  let combatEvents = [],
    lastAnimation = "idle";
  function emitCombat(type, detail) {
    const event = { type, time, ...detail };
    combatEvents.push(event);
    if (combatEvents.length > 100) combatEvents.shift();
    window.dispatchEvent(
      new CustomEvent("sky-combat", { detail: { ...event } }),
    );
  }
  const names = ["龙卫门廊", "悬空回廊", "石像工坊", "城主大厅"];
  let level = 0,
    mode = "menu",
    room = 0,
    p,
    enemies = [],
    effects = [],
    shots = [],
    hazards = [],
    drops = [],
    keys = new Set(),
    time = 0,
    clock = 0,
    combatSeconds = 0,
    totalDamage = 0,
    kills = 0,
    combo = 0,
    maxCombo = 0,
    comboUntil = 0,
    shake = 0,
    clear = false,
    muted = false,
    audio = null,
    last = 0,
    doorLock = 0;
  const rand = (a, b) => a + Math.random() * (b - a),
    clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function tone(freq = 220, duration = 0.07, type = "square", volume = 0.025) {
    if (muted) return;
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      const o = audio.createOscillator(),
        g = audio.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, audio.currentTime);
      o.frequency.exponentialRampToValueAtTime(
        Math.max(30, freq * 0.4),
        audio.currentTime + duration,
      );
      g.gain.setValueAtTime(volume, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
      o.connect(g);
      g.connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + duration);
    } catch {}
  }
  function makePlayer() {
    return {
      job: "魔法师",
      weapon: "staff",
      attackScale: 1,
      critChance: 0.1,
      haste: 0,
      upgrades: [],
      critMultiplier: 1.5,
      hurt: 0,
      casts: [],
      attackTotal: 0.22,
      animationTime: 0,
      x: 140,
      y: 390,
      z: 0,
      vz: 0,
      hp: 160,
      face: 1,
      inv: 0,
      attack: 0,
      chain: 0,
      lastAttack: -10,
      hitCd: 0,
      dash: 0,
      dx: 1,
      dy: 0,
      cd: { dash: 0, lid: 0, frost: 0, jump: 0 },
      potions: 2,
      walk: 0,
    };
  }
  function spawn(type, x, y) {
    const hp =
      { dragon: 48, mage: 42, golem: 105, boss: 520 }[type] *
      difficulties[level].hp;
    return {
      type,
      x,
      y,
      hp,
      max: hp,
      defense: defenses[type] + difficulties[level].defense,
      face: -1,
      cd: rand(0.7, 1.5),
      stun: 0,
      flash: 0,
      cast: 0,
      phase: 0,
    };
  }
  function loadRoom() {
    clear = false;
    doorLock = 0.6;
    hazards = [];
    shots = [];
    drops = [];
    effects = [];
    p.x = 110;
    p.y = 390;
    p.z = 0;
    p.vz = 0;
    const packs = [
      ["dragon", "dragon", "dragon"],
      ["dragon", "mage", "dragon", "mage"],
      ["golem", "dragon", "golem"],
      ["boss", "mage", "dragon"],
    ];
    enemies = packs[room].map((t, i) =>
      spawn(t, 500 + (i % 2) * 180, 340 + (i % 3) * 53),
    );
    float(480, 235, names[room], "#f4edd6", 2, 24);
  }
  function start() {
    p = makePlayer();
    combatEvents = [];
    lastAnimation = "idle";
    room = 0;
    clock = 0;
    combatSeconds = 0;
    totalDamage = 0;
    time = 0;
    comboUntil = 0;
    kills = 0;
    combo = 0;
    maxCombo = 0;
    mode = "play";
    keys.clear();
    loadRoom();
    $("#menu").classList.add("hidden");
    $("#modal").classList.add("hidden");
    $("#growth").classList.add("hidden");
    $("#pause").textContent = "暂停 Esc";
    canvas.focus();
    tone(530, 0.2, "triangle");
  }
  function showModal(kind) {
    keys.clear();
    $("#modal").classList.remove("hidden");
    $("#resume").classList.toggle("hidden", kind !== "pause");
    $("#retry").classList.toggle("hidden", kind === "pause");
    $("#result-title").textContent =
      kind === "win"
        ? "天空，已被征服。"
        : kind === "lose"
          ? "雪人暂时融化了。"
          : "冒险暂停";
    $("#result-sub").textContent =
      kind === "win"
        ? "DUNGEON CLEAR"
        : kind === "lose"
          ? "TRY AGAIN"
          : "TAKE A BREATH";
    $("#result-text").textContent =
      kind === "pause"
        ? "休息一下，锅盖还在。点击继续或按 Esc 返回。"
        : `${difficulties[level].name} · ${Math.floor(clock / 60)} 分 ${Math.floor(clock % 60)} 秒 · 击败 ${kills} · 最高 ${maxCombo} 连击\n总伤害 ${totalDamage.toFixed(0)} · 有效战斗 ${combatSeconds.toFixed(1)} 秒 · 秒伤 ${(totalDamage / Math.max(0.001, combatSeconds)).toFixed(1)}\n取得升级：${p.upgrades.map(id => upgrades.find(u => u.id === id).name).join(" / ") || "无"}\n伤害按实扣血；战斗时间仅统计有存活敌人的游玩帧，排除暂停、成长和清房走门。`;
    $("#pause").textContent = kind === "pause" ? "继续 Esc" : "暂停 Esc";
  }
  function panelText(player) {
    const v = stats(player);
    return `攻击 ${v.attack.toFixed(1)} · 暴击 ${Math.round(v.critChance * 100)}% · 暴伤 ${v.critMultiplier.toFixed(1)}倍 · L ${cooldown(player, weapons[player.weapon].skill.cooldown).toFixed(2)}s / U ${cooldown(player, skills.frost.cooldown).toFixed(2)}s`;
  }
  function showGrowth() {
    mode = "growth";
    keys.clear();
    $("#growth").classList.remove("hidden");
    $("#growth-current").textContent = `当前 ${weapons[p.weapon].name}：${panelText(p)}`;
    $("#growth-choices").replaceChildren();
    for (const u of upgrades) {
      const preview = structuredClone(p);
      applyUpgrade(preview, u.id);
      const b = document.createElement("button");
      b.dataset.upgrade = u.id;
      const title = document.createElement("strong");
      title.textContent = u.name;
      const description = document.createElement("span");
      description.textContent = u.description;
      const after = document.createElement("small");
      after.textContent = "选择后：" + panelText(preview);
      b.append(title, description, after);
      b.onclick = () => {
        if (mode !== "growth") return;
        const before = stats(p);
        applyUpgrade(p, u.id);
        emitCombat("upgrade", { id: u.id, before, after: stats(p) });
        $("#growth").classList.add("hidden");
        mode = "play";
        keys.clear();
        canvas.focus();
        float(480, 240, "成长完成！进入右侧光门", "#d6fbd0", 2, 23);
      };
      $("#growth-choices").append(b);
    }
    $("#growth-choices button").focus();
  }
  function breakCombo(reason) {
    if (combo > 0) {
      float(800, 185, `断连 · ${reason}（${combo}）`, "#ffb5ac", 1.3, 16);
      emitCombat("combo-break", { count: combo, reason });
      combo = 0;
    }
  }
  function pause() {
    if (mode === "play") {
      mode = "pause";
      showModal("pause");
    } else if (mode === "pause") {
      mode = "play";
      $("#modal").classList.add("hidden");
      $("#pause").textContent = "暂停 Esc";
      canvas.focus();
    }
  }
  function end(win) {
    mode = win ? "win" : "lose";
    showModal(mode);
    tone(win ? 780 : 130, 0.5, "triangle");
  }
  function float(x, y, text, color = "#fff", life = 0.65, size = 17) {
    effects.push({ kind: "text", x, y, text, color, life, max: life, size });
  }
  function particles(x, y, color, count = 8) {
    for (let i = 0; i < count; i++)
      effects.push({
        kind: "pixel",
        x,
        y,
        vx: rand(-100, 100),
        vy: rand(-160, 20),
        color,
        life: 0.4,
        max: 0.4,
      });
  }
  function hit(e, spec, knock = 12, freeze = 0) {
    if (e.hp <= 0) return;
    const { damage, applied } = applyDamage(e, spec);
    totalDamage += applied;
    emitCombat("damage", {
      weapon: spec.weapon,
      skill: spec.skill,
      attack: spec.attack,
      multiplier: spec.multiplier,
      critical: spec.critical,
      criticalMultiplier: spec.criticalMultiplier,
      damage,
      applied,
      target: e.type,
      defense: e.defense,
    });
    e.x = clamp(e.x + spec.face * knock, 50, 885);
    e.stun = Math.max(e.stun, freeze || 0.25);
    e.flash = 0.13;
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    comboUntil = time + 2;
    emitCombat("combo", { count: combo, max: maxCombo });
    float(e.x, e.y - 64, `${spec.critical ? "暴击！" : spec.skill !== "basic" ? "技能 " : ""}${damage}`, spec.critical ? "#ffce69" : spec.skill !== "basic" ? "#aeefff" : "#fff4df", 0.8, spec.critical ? 23 : 17);
    particles(e.x, e.y - 35, "#ffe4a3");
    shake = Math.max(shake, 3);
    tone(180 + combo * 7);
    if (e.hp <= 0) {
      kills++;
      emitCombat("kill", {
        target: e.type,
        weapon: spec.weapon,
        skill: spec.skill,
        kills,
      });
      particles(e.x, e.y - 35, e.type === "boss" ? "#efd28b" : "#b9dbe7", 15);
      if (kills % 3 === 0) drops.push({ x: e.x, y: e.y });
    }
  }
  function hurt(dmg) {
    if (mode !== "play" || p.inv > 0 || p.z > 22) return;
    p.hp = Math.max(0, p.hp - dmg);
    p.inv = 0.8;
    p.hurt = 0.25;
    shake = 8;
    breakCombo("受击");
    float(p.x, p.y - 65, "−" + Math.round(dmg), "#ff9292");
    particles(p.x, p.y - 32, "#ff817e");
    tone(85, 0.17, "sawtooth");
    if (p.hp <= 0) end(false);
  }
  // Input actions only consume shared player cooldowns; equipment never owns timers.
  function cast(spec) {
    p.attackTotal = spec.skill === "basic" ? 0.22 : 0.30;
    p.attack = p.attackTotal;
    // Capture combat values on input; release after two anticipation frames.
    p.casts.push({ spec, delay: p.attackTotal / 3 });
  }
  function releaseCast(spec) {
    if (spec.skill === "frost") {
      effects.push({ kind: "frost", x: spec.x, y: spec.y, life: 0.65, max: 0.65 });
      for (const e of enemies)
        if (Math.hypot(e.x - spec.x, (e.y - spec.y) * 1.6) < skills.frost.range)
          hit(e, spec, 8, e.type === "boss" ? 0.7 : 1.8);
      tone(880, 0.3, "sine");
      return;
    }
    if (spec.shape === "projectile") {
      shots.push({
        ...spec,
        x: spec.x + spec.face * 16,
        y: spec.y,
        vx: spec.face * spec.speed,
        life: spec.range / spec.speed,
        hit: new Set(),
      });
    } else {
      const burst = spec.shape === "burst";
      effects.push({
        kind: "magic",
        x: spec.x + (burst ? spec.face * spec.offset : 0),
        y: spec.y,
        range: spec.range,
        depth: spec.depth,
        shape: spec.shape,
        face: spec.face,
        color: spec.color,
        life: 0.28,
        max: 0.28,
      });
      for (const e of enemies) if (inArea(spec, e)) hit(e, spec, spec.knock);
    }
    tone(
      spec.weapon === "staff" ? 340 : spec.weapon === "wand" ? 680 : 220,
      0.07,
      "triangle",
    );
  }
  function action(key) {
    if (mode !== "play") return;
    const selected = { Digit1: "staff", Digit2: "wand", Digit3: "broom" }[key];
    if (selected && switchWeapon(p, selected)) {
      float(p.x, p.y - 105, weapons[selected].name, weapons[selected].color);
      emitCombat("weapon", { weapon: selected });
      return;
    }
    if (key === "KeyJ" && p.hitCd <= 0) {
      p.chain = time - p.lastAttack < 0.8 ? (p.chain + 1) % 3 : 0;
      p.lastAttack = time;
      p.hitCd = weapons[p.weapon].interval;
      cast(attackSpec(p));
    }
    if (key === "KeyK" && p.z === 0 && p.cd.jump <= 0) {
      p.vz = 335;
      p.cd.jump = cooldown(p, skills.jump.cooldown);
      tone(320, 0.12, "triangle");
    }
    if (key === "Space" && p.cd.dash <= 0) {
      let dx =
          (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
          (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0),
        dy =
          (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) -
          (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0);
      if (!dx && !dy) dx = p.face;
      const len = Math.hypot(dx, dy);
      p.dx = dx / len;
      p.dy = dy / len;
      p.dash = 0.2;
      p.inv = Math.max(p.inv, 0.28);
      p.cd.dash = cooldown(p, skills.dash.cooldown);
      tone(210, 0.1, "triangle");
    }
    if (key === "KeyL" && p.cd.lid <= 0) {
      p.cd.lid = cooldown(p, weapons[p.weapon].skill.cooldown);
      cast(attackSpec(p, "special"));
    }
    if (key === "KeyU" && p.cd.frost <= 0) {
      p.cd.frost = cooldown(p, skills.frost.cooldown);
      cast(attackSpec(p, "frost"));
    }
    if (key === "KeyH" && p.potions > 0 && p.hp < 160) {
      p.potions--;
      p.hp = Math.min(160, p.hp + 45);
      float(p.x, p.y - 70, "+45", "#9af4bb");
      tone(540, 0.2, "sine");
    }
  }
  const controls = new Set([
    "Digit1",
    "Digit2",
    "Digit3",
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "KeyJ",
    "KeyK",
    "KeyL",
    "KeyU",
    "KeyH",
    "Space",
  ]);
  window.addEventListener("keydown", (e) => {
    if (controls.has(e.code) && mode === "play") {
      e.preventDefault();
      keys.add(e.code);
      if (!e.repeat) action(e.code);
    }
    if (["Escape", "KeyP"].includes(e.code) && !e.repeat) {
      e.preventDefault();
      pause();
    }
    if (e.code === "KeyR" && !e.repeat && (mode === "win" || mode === "lose"))
      start();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => {
    keys.clear();
    if (mode === "play") pause();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && mode === "play") pause();
  });
  $("#start").onclick = start;
  $("#pause").onclick = pause;
  $("#resume").onclick = pause;
  $("#retry").onclick = start;
  $("#home").onclick = () => {
    mode = "menu";
    keys.clear();
    $("#modal").classList.add("hidden");
    $("#menu").classList.remove("hidden");
    $("#pause").textContent = "暂停 Esc";
  };
  $("#sound").onclick = () => {
    muted = !muted;
    $("#sound").textContent = "音效：" + (muted ? "关" : "开");
    $("#sound").setAttribute("aria-pressed", String(muted));
    canvas.focus();
  };
  document.querySelectorAll("[data-level]").forEach(
    (b) =>
      (b.onclick = () => {
        level = Number(b.dataset.level);
        document.querySelectorAll("[data-level]").forEach((a) => {
          a.classList.toggle("selected", a === b);
          a.setAttribute("aria-pressed", String(a === b));
        });
      }),
  );
  function telegraph(e) {
    const boss = e.type === "boss",
      mage = e.type === "mage",
      r = boss
        ? e.phase % 2 === 0
          ? 100
          : 66
        : mage
          ? 46
          : e.type === "golem"
            ? 70
            : 39;
    const aimed = mage || (boss && e.phase % 2 === 1);
    const duration =
      (boss ? 1 : mage ? 0.95 : e.type === "golem" ? 0.8 : 0.6) *
      difficulties[level].wind;
    hazards.push({
      x: aimed ? p.x : e.x,
      y: aimed ? p.y : e.y,
      r,
      life: duration,
      max: duration,
      damage:
        (boss ? 26 : mage ? 14 : e.type === "golem" ? 20 : 11) *
        difficulties[level].dmg,
      lightning: aimed,
      source: e,
    });
    if (boss && e.hp < e.max * 0.5) {
      hazards.push({
        x: clamp(p.x + 100, 60, 880),
        y: p.y,
        r: 50,
        life: duration + 0.25,
        max: duration + 0.25,
        damage: 22 * difficulties[level].dmg,
        lightning: true,
        source: e,
      });
    }
    e.cast = duration;
    e.phase++;
    e.cd =
      (boss ? 2.4 : mage ? 2.7 : e.type === "golem" ? 2.3 : 1.5) /
      difficulties[level].speed;
    if (boss && e.hp < e.max * 0.5) e.cd *= 0.75;
  }
  function update(dt) {
    if (mode === "pause" || mode === "growth" || mode === "win" || mode === "lose") return;
    time += dt;
    effects = effects.filter((f) => f.life > 0);
    for (const f of effects) {
      f.life -= dt;
      if (f.kind === "text") f.y -= 25 * dt;
      if (f.kind === "pixel") {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vy += 400 * dt;
      }
    }
    shake = Math.max(0, shake - dt * 30);
    if (mode !== "play") return;
    clock += dt;
    if (enemies.some(e => e.hp > 0)) combatSeconds += dt;
    doorLock -= dt;
    p.inv -= dt;
    p.hurt -= dt;
    p.animationTime += dt;
    p.hitCd = Math.max(0, p.hitCd - dt);
    p.attack -= dt;
    for (const pending of p.casts) pending.delay -= dt;
    const due = p.casts.filter(pending => pending.delay <= 0);
    p.casts = p.casts.filter(pending => pending.delay > 0);
    for (const pending of due) releaseCast(pending.spec);
    p.dash -= dt;
    for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt);
    if (time > comboUntil) breakCombo("超时");
    let dx =
        (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
        (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0),
      dy =
        (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) -
        (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0);
    if (dx) p.face = Math.sign(dx);
    if (p.dash > 0) {
      dx = p.dx * 3.5;
      dy = p.dy * 3.5;
      particles(p.x, p.y - 20, "#91bfd6", 1);
    } else if (dx && dy) {
      dx *= 0.707;
      dy *= 0.707;
    }
    p.x = clamp(p.x + dx * 195 * weapons[p.weapon].speed * dt, 40, 920);
    p.y = clamp(p.y + dy * 148 * weapons[p.weapon].speed * dt, 305, 477);
    if (dx || dy) p.walk += dt * 12;
    else p.walk = 0;
    if (p.z > 0 || p.vz > 0) {
      p.z += p.vz * dt;
      p.vz -= 850 * dt;
      if (p.z < 0) {
        p.z = 0;
        p.vz = 0;
        particles(p.x, p.y, "#bcdce5", 4);
      }
    }
    if (keys.has("KeyJ")) action("KeyJ");
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      e.cd -= dt;
      e.stun -= dt;
      e.flash -= dt;
      e.cast -= dt;
      e.face = p.x >= e.x ? 1 : -1;
      if (e.stun > 0 || e.cast > 0) continue;
      const ex = p.x - e.x,
        ey = p.y - e.y,
        dist = Math.hypot(ex, ey);
      const range = e.type === "mage" ? 280 : e.type === "boss" ? 150 : 56;
      if (dist > range) {
        const speed =
          (e.type === "golem" ? 44 : e.type === "boss" ? 56 : 70) *
          difficulties[level].speed;
        e.x += (ex / dist) * speed * dt;
        e.y += (ey / dist) * speed * dt;
      } else if (e.cd <= 0) telegraph(e);
    }
    for (const h of hazards) {
      h.life -= dt;
      if (h.life <= 0 && !h.done) {
        h.done = true;
        if (h.source.hp > 0) {
          if (Math.hypot(p.x - h.x, (p.y - h.y) * 1.5) < h.r) hurt(h.damage);
          effects.push({
            kind: h.lightning ? "bolt" : "impact",
            x: h.x,
            y: h.y,
            r: h.r,
            life: 0.3,
            max: 0.3,
          });
          tone(80, 0.08, "sawtooth", 0.012);
        }
      }
    }
    if (mode !== "play") return;
    hazards = hazards.filter((h) => h.life > 0 && h.source.hp > 0);
    for (const s of shots) {
      const previousX = s.x,
        step = Math.min(dt, Math.max(0, s.life));
      s.x += s.vx * step;
      s.life -= dt;
      for (const e of projectileTargets(s, previousX, enemies)) {
        s.hit.add(e);
        hit(e, s, s.knock);
        if (!s.pierce) {
          s.life = 0;
          break;
        }
      }
    }
    shots = shots.filter((s) => s.life > 0 && s.x > -50 && s.x < 1010);
    const nextAnimation = animationState(p).name;
    if (nextAnimation !== lastAnimation) {
      lastAnimation = nextAnimation;
      p.animationTime = 0;
    }
    for (const d of drops)
      if (Math.hypot(p.x - d.x, p.y - d.y) < 38) {
        p.hp = Math.min(160, p.hp + 12);
        d.done = true;
        float(p.x, p.y - 65, "+12", "#9af4bb");
      }
    drops = drops.filter((d) => !d.done);
    if (!clear && enemies.every((e) => e.hp <= 0)) {
      clear = true;
      tone(670, 0.3, "triangle");
      if (room === 3) {
        end(true);
        return;
      }
      showGrowth();
      return;
    }
    if (clear && p.x > 875 && Math.abs(p.y - 392) < 75 && doorLock <= 0) {
      room++;
      p.hp = Math.min(160, p.hp + 18);
      loadRoom();
    }
  }
  function rect(x, y, w, h, color) {
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  function poly(points, color) {
    c.fillStyle = color;
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fill();
  }
  function ellipse(x, y, rx, ry, color) {
    c.fillStyle = color;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
  }
  function text(t, x, y, size = 14, color = "#f4edd6", align = "left") {
    c.fillStyle = color;
    c.font = `${size >= 20 ? "bold " : ""}${size}px "PingFang SC","Microsoft YaHei",sans-serif`;
    c.textAlign = align;
    if (size >= 16) {
      c.strokeStyle = "#172637";
      c.lineWidth = 2.5;
      c.strokeText(t, x, y);
    }
    c.fillText(t, x, y);
  }
  function cloud(x, y, s) {
    const color = "#c7e8e8";
    rect(x, y, 130 * s, 13 * s, color);
    rect(x + 17 * s, y - 12 * s, 80 * s, 16 * s, color);
    rect(x + 35 * s, y - 22 * s, 40 * s, 17 * s, color);
    rect(x - 20 * s, y + 10 * s, 180 * s, 10 * s, "#a6d3db");
  }
  function tower(x, y, s) {
    rect(x, y, 50 * s, 200 * s, "#4d859f");
    poly(
      [
        [x - 10 * s, y],
        [x + 25 * s, y - 65 * s],
        [x + 60 * s, y],
      ],
      "#76a6ba",
    );
    rect(x + 8 * s, y + 10 * s, 7 * s, 130 * s, "#77aec0");
    for (let i = 0; i < 3; i++)
      rect(x + 27 * s, y + 25 * s + i * 45 * s, 10 * s, 20 * s, "#2b637f");
  }
  function background() {
    const skies = ["#6eafc5", "#88b9ce", "#587b9a", "#535f91"];
    rect(0, 0, W, H, skies[room]);
    rect(0, 64, W, 20, "#8fc5d3");
    for (let i = 0; i < 6; i++)
      cloud(
        ((i * 210 + time * 5) % 1280) - 180,
        170 + (i % 3) * 37,
        0.8 + (i % 2) * 0.5,
      );
    tower(170, 173, 0.7);
    tower(655, 135, 0.95);
    tower(420, 225, 0.4);
    rect(0, 283, 960, 27, "#799fac");
    rect(0, 290, 960, 5, "#d5d9c4");
    for (let i = -1; i < 5; i++) {
      const x = i * 230 + 15;
      rect(x, 66, 34, 245, "#d6d7be");
      rect(x + 7, 66, 11, 245, "#efebcf");
      rect(x + 27, 66, 7, 245, "#839fa7");
      rect(x - 11, 277, 55, 18, "#c5ccba");
      rect(x - 16, 295, 65, 16, "#e1ddc4");
      rect(x - 8, 85, 50, 16, "#e7e0c4");
      poly(
        [
          [x + 30, 128],
          [x + 30, 90],
          [x + 70, 53],
          [x + 163, 53],
          [x + 207, 90],
          [x + 207, 128],
          [x + 185, 95],
          [x + 157, 78],
          [x + 80, 78],
          [x + 52, 98],
        ],
        "#dedbc0",
      );
      poly(
        [
          [x + 34, 129],
          [x + 53, 101],
          [x + 82, 84],
          [x + 154, 84],
          [x + 182, 101],
          [x + 204, 129],
          [x + 196, 130],
          [x + 177, 108],
          [x + 151, 92],
          [x + 85, 92],
          [x + 60, 109],
          [x + 41, 135],
        ],
        "#7492a0",
      );
    }
    rect(0, 306, 960, 190, "#526779");
    for (let row = 0; row < 7; row++) {
      let y = 309 + row * 29;
      rect(0, y, 960, 2, "#293f56");
      for (let col = -1; col < 10; col++) {
        let x = col * 125 + (row % 2) * 62;
        rect(x, y + 2, 122, 25, (col + row) % 3 === 0 ? "#657b87" : "#5a7080");
        rect(x + 3, y + 3, 116, 2, "#7b8d94");
        rect(x + 120, y + 1, 3, 27, "#344f65");
        if ((col * 3 + row) % 5 === 0) {
          rect(x + 30, y + 17, 20, 2, "#465c6f");
          rect(x + 49, y + 18, 2, 5, "#465c6f");
        }
      }
    }
    rect(0, 483, 960, 13, "#bdc3b2");
    rect(0, 489, 960, 6, "#6d8591");
    for (const x of [80, 810]) {
      rect(x, 264, 9, 35, "#485871");
      poly(
        [
          [x - 3, 267],
          [x + 4, 241],
          [x + 13, 267],
        ],
        room === 3 ? "#dabcff" : "#87f8ef",
      );
      rect(x - 8, 297, 26, 10, "#a7afa6");
    }
    if (sceneryReady) {
      c.save();
      c.imageSmoothingEnabled = false;
      if (room % 2) {
        c.translate(960, 0);
        c.scale(-1, 1);
      }
      c.drawImage(scenery, 0, 0, scenery.width, 620, 0, 64, 960, 242);
      c.restore();
      c.drawImage(scenery, 0, 620, scenery.width, 185, 0, 306, 960, 177);
      c.drawImage(scenery, 0, 805, scenery.width, 50, 0, 483, 960, 13);
    }
    if (room === 2) {
      for (const x of [310, 660]) {
        rect(x, 270, 34, 30, "#83979c");
        rect(x + 6, 244, 23, 30, "#9eada9");
        rect(x + 10, 250, 5, 5, "#526374");
      }
    }
    if (room === 3) {
      rect(430, 225, 106, 73, "#657084");
      rect(446, 203, 74, 83, "#8d91a0");
      poly(
        [
          [446, 204],
          [457, 184],
          [483, 199],
          [509, 184],
          [520, 204],
        ],
        "#d1b785",
      );
      rect(461, 218, 44, 54, "#555776");
    }
    const open = clear || mode === "menu";
    rect(888, 293, 45, 159, "#243c58");
    rect(883, 287, 55, 8, "#dbd9bf");
    rect(883, 287, 7, 167, "#bdc8bb");
    rect(931, 287, 7, 167, "#bdc8bb");
    if (open) {
      rect(893, 303, 34, 140, "#65bdd0");
      rect(899, 310, 22, 131, "#b4f8e9");
      for (let i = 0; i < 10; i++)
        rect(
          891 + (i % 4) * 9,
          310 + ((i * 17 + time * 35) % 128),
          5,
          12,
          "#f1ffdf",
        );
      text("下一房 →", 908, 279, 12, "#edffd9", "center");
    } else {
      for (let i = 0; i < 4; i++) rect(893 + i * 9, 297, 4, 148, "#63798d");
      text("清场开门", 910, 279, 11, "#e1dbbd", "center");
    }
  }
  function spriteFrame(preview = false) {
    const state = preview ? "idle" : animationState(p).name;
    if (state === "defeat") return 21;
    if (state === "hurt") return p.hurt > 0.125 ? 20 : 21;
    if (state === "dash") return p.dash > 0.1 ? 22 : 23;
    if (state === "jump") return p.vz > 0 ? 18 : 19;
    if (state === "cast") return 12 + Math.min(5, Math.max(0, Math.floor((1 - p.attack / p.attackTotal) * 6)));
    if (state === "walk") return 6 + Math.floor(Math.abs(p.walk) * 0.8) % 6;
    return Math.floor(time * 5) % 6;
  }
  function drawMageWeapon(x, y, angle) {
    const weapon = weapons[p.weapon];
    c.save(); c.translate(x, y); c.rotate(p.weapon === "broom" ? -angle : angle);
    if (p.weapon === "staff") {
      rect(-3, -38, 6, 70, "#302742"); rect(-1, -36, 2, 66, "#bb8e63");
      poly([[-10,-42],[0,-56],[10,-42],[0,-29]], "#35284f");
      poly([[-7,-42],[0,-52],[7,-42],[0,-33]], weapon.color);
      rect(-2,-48,3,9,"#f6e6ff"); rect(-5,-29,10,4,"#e5b96b");
    } else if (p.weapon === "wand") {
      rect(-2,-25,4,44,"#473348"); rect(-1,-24,2,41,"#d4b080");
      poly([[0,-40],[3,-32],[10,-29],[3,-26],[0,-18],[-3,-26],[-10,-29],[-3,-32]], weapon.color);
      rect(-2,-32,4,6,"#fff7d8");
    } else {
      rect(-3,-26,6,64,"#43333b"); rect(-1,-25,2,63,"#c69b69");
      poly([[-7,20],[7,20],[14,43],[9,46],[-13,43]], "#604547");
      poly([[-5,21],[5,21],[11,40],[7,42],[-10,40]], "#e3bd7b");
      for (let i = -6; i <= 6; i += 4) rect(i,29,1,12,"#977049");
      rect(-7,20,14,4,"#ce4b57");
    }
    c.restore();
  }
  function snowman(
    x,
    y,
    z = 0,
    face = 1,
    walk = 0,
    attack = 0,
    inv = 0,
    scale = 1,
  ) {
    ellipse(x, y + 1, 24 * scale, 8 * scale, "#102c4766");
    c.save();
    c.translate(Math.round(x), Math.round(y - z));
    c.scale(face * scale, scale);
    if (inv > 0 && Math.floor(time * 16) % 2) c.globalAlpha = 0.5;
    if (spriteReady) {
      const index = spriteFrame(scale !== 1);
      const meta = SkySpriteData.frames[index], unit = SkySpriteData.scale;
      const hx = (meta.hand[0] - SkySpriteData.anchor[0]) * unit;
      const hy = (meta.hand[1] - SkySpriteData.anchor[1]) * unit;
      const phase = p.attack > 0 ? Math.min(5, Math.floor((1 - p.attack / p.attackTotal) * 6)) : -1;
      const angle = phase < 0 ? 0.12 : [-0.45, -0.65, 0.35, 1.05, 0.5, 0.15][phase];
      drawMageWeapon(hx, hy, angle);
      c.imageSmoothingEnabled = true;
      c.drawImage(mageSprite, meta.x, meta.y, 288, 288,
        -SkySpriteData.anchor[0] * unit, -SkySpriteData.anchor[1] * unit, 288 * unit, 288 * unit);
      c.restore();
      return;
    }
    const bob = Math.sin(walk) * 2;
    c.translate(0, bob);
    const R = (x, y, w, h, col) => rect(x, y, w, h, col);
    R(-17, -12 + Math.sin(walk) * 3, 12, 13, "#bed4e2");
    R(7, -12 - Math.sin(walk) * 3, 12, 13, "#e7f0ea");
    poly(
      [
        [-12, -53],
        [13, -53],
        [13, -48],
        [21, -48],
        [21, -40],
        [26, -40],
        [26, -30],
        [29, -30],
        [29, -17],
        [24, -17],
        [24, -10],
        [16, -10],
        [16, -7],
        [-16, -7],
        [-16, -10],
        [-24, -10],
        [-24, -17],
        [-29, -17],
        [-29, -30],
        [-26, -30],
        [-26, -40],
        [-21, -40],
        [-21, -48],
        [-12, -48],
      ],
      "#adc4d7",
    );
    poly(
      [
        [-11, -51],
        [12, -51],
        [12, -46],
        [19, -46],
        [19, -37],
        [24, -37],
        [24, -18],
        [19, -18],
        [19, -12],
        [-14, -12],
        [-14, -16],
        [-21, -16],
        [-21, -25],
        [-24, -25],
        [-24, -35],
        [-20, -35],
        [-20, -44],
        [-11, -44],
      ],
      "#f8f5e4",
    );
    R(-17, -37, 6, 17, "#fffdf0");
    R(-11, -75, 27, 24, "#edcfbb");
    R(-14, -75, 31, 10, "#eef2e6");
    R(-15, -65, 9, 17, "#edf3e7");
    R(14, -68, 6, 16, "#e5eee8");
    R(-2, -66, 4, 7, "#28344a");
    R(11, -66, 4, 7, "#28344a");
    R(5, -56, 5, 3, "#bd6d68");
    R(-7, -55, 26, 9, "#d94246");
    R(-18, -51, 37, 7, "#b82d40");
    R(-20, -47, 10, 23, "#df4950");
    R(-25, -31, 12, 5, "#b62d42");
    R(4, -38, 5, 5, "#3a4654");
    R(5, -27, 5, 5, "#3a4654");
    R(-17, -79, 36, 5, "#4c5c77");
    R(-13, -87, 28, 8, "#889da9");
    R(-7, -92, 17, 6, "#bfccd0");
    R(-1, -97, 7, 6, "#51586a");
    R(-12, -86, 24, 3, "#e2e8de");
    R(-23, -79, 47, 4, "#c6d1d1");
    R(-23, -75, 47, 3, "#6e8395");
    R(18, -41, 10, 12, "#d8e8e5");
    c.save();
    c.translate(25, -30);
    c.rotate(attack > 0 ? -1.2 : -0.45);
    const weapon = weapons[p.weapon];
    R(-2, -14, 5, p.weapon === "staff" ? 57 : 38, "#a28068");
    if (p.weapon === "broom") {
      poly(
        [
          [-10, 15],
          [12, 15],
          [18, 38],
          [-14, 38],
        ],
        "#d8b077",
      );
      for (let i = 0; i < 4; i++) R(-10 + i * 7, 18, 2, 18, "#9d754d");
    } else {
      ellipse(
        1,
        -16,
        p.weapon === "staff" ? 10 : 6,
        p.weapon === "staff" ? 12 : 6,
        weapon.color,
      );
      R(-2, -22, 4, 8, "#fff6e0");
    }
    c.restore();
    c.restore();
  }
  function enemyArt(e) {
    if (e.hp <= 0) return;
    const boss = e.type === "boss",
      golem = e.type === "golem",
      mage = e.type === "mage",
      s = boss ? 1.65 : golem ? 1.2 : 1;
    ellipse(e.x, e.y, 22 * s, 8 * s, "#17324988");
    c.save();
    c.translate(Math.round(e.x), Math.round(e.y));
    c.scale(e.face * s, s);
    const color =
        e.flash > 0
          ? "#ffffff"
          : e.stun > 0.4
            ? "#8cdef4"
            : boss
              ? "#be9b60"
              : golem
                ? "#8e9fa8"
                : mage
                  ? "#917cb6"
                  : "#9181b8",
      dark = boss ? "#786047" : golem ? "#586b81" : "#4e4d7b",
      light = boss ? "#f4d38a" : golem ? "#bac3bd" : "#c1afd5";
    rect(-19, -42, 38, 31, dark);
    rect(-16, -49, 33, 33, color);
    rect(-11, -43, 24, 15, light);
    rect(-23, -44, 9, 24, color);
    rect(17, -44, 9, 24, color);
    rect(-15, -12, 11, 13, dark);
    rect(7, -12, 11, 13, dark);
    rect(-12, -68, 28, 22, color);
    rect(-6, -61, 6, 5, "#ffe692");
    rect(8, -61, 7, 5, "#ffe692");
    rect(-2, -52, 14, 3, dark);
    if (mage) {
      poly(
        [
          [-20, -67],
          [0, -95],
          [22, -67],
        ],
        dark,
      );
      rect(-18, -70, 38, 6, light);
      rect(25, -68, 4, 66, "#ad9e86");
      rect(21, -72, 13, 11, "#8ef3df");
      poly(
        [
          [-17, -24],
          [-26, -3],
          [25, -3],
          [17, -24],
        ],
        color,
      );
    } else if (boss) {
      poly(
        [
          [-16, -69],
          [-19, -86],
          [-5, -77],
          [3, -89],
          [11, -77],
          [21, -86],
          [18, -69],
        ],
        light,
      );
      rect(27, -64, 9, 50, light);
      rect(21, -30, 20, 5, dark);
    } else if (!golem) {
      poly(
        [
          [-13, -63],
          [-26, -80],
          [-20, -52],
        ],
        dark,
      );
      poly(
        [
          [16, -67],
          [27, -82],
          [23, -51],
        ],
        light,
      );
      poly(
        [
          [-17, -30],
          [-36, -16],
          [-34, -8],
          [-17, -18],
        ],
        dark,
      );
    } else {
      rect(-26, -44, 14, 17, light);
      rect(16, -44, 15, 17, light);
    }
    c.restore();
    if (!boss) {
      rect(e.x - 23, e.y - 85 * s, 46, 4, "#182b44");
      rect(
        e.x - 23,
        e.y - 85 * s,
        46 * Math.max(0, e.hp / e.max),
        4,
        e.stun > 0.4 ? "#94e8fa" : "#dcae74",
      );
    }
    if (e.cast > 0) text("!", e.x, e.y - 90 * s, 24, "#ffcb8c", "center");
  }
  function render() {
    c.clearRect(0, 0, W, H);
    c.save();
    if (shake > 0 && mode === "play")
      c.translate(rand(-shake, shake), rand(-shake, shake));
    background();
    for (const h of hazards) {
      ellipse(h.x, h.y, h.r, h.r * 0.55, "#ed66613d");
      c.strokeStyle = "#ffb09a";
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(h.x, h.y, h.r, h.r * 0.55, 0, 0, Math.PI * 2);
      c.stroke();
      ellipse(
        h.x,
        h.y,
        h.r * (1 - h.life / h.max),
        h.r * 0.55 * (1 - h.life / h.max),
        "#ee666666",
      );
    }
    for (const d of drops) {
      rect(d.x - 6, d.y - 19, 12, 15, "#df655e");
      rect(d.x - 3, d.y - 24, 6, 6, "#e0d4b1");
      rect(d.x - 4, d.y - 15, 8, 3, "#ffdcd0");
    }
    if (mode === "menu") {
      enemyArt({ type: "dragon", x: 785, y: 398, hp: 40, max: 48, face: -1 });
      snowman(670, 424, 0, 1, time * 2, 0, 0, 1.9);
    } else {
      const actors = [
        ...enemies
          .filter((e) => e.hp > 0)
          .map((e) => ({ y: e.y, draw: () => enemyArt(e) })),
        {
          y: p.y,
          draw: () => snowman(p.x, p.y, p.z, p.face, p.walk, p.attack, p.inv),
        },
      ];
      actors.sort((a, b) => a.y - b.y).forEach((a) => a.draw());
    }
    for (const s of shots) {
      ellipse(s.x, s.y - 40, s.pierce ? 16 : 9, 7, s.color);
      rect(s.x - s.face * 23, s.y - 42, 20, 4, "#eaffff");
    }
    for (const f of effects) {
      c.save();
      c.globalAlpha = Math.max(0, f.life / f.max);
      if (f.kind === "text") text(f.text, f.x, f.y, f.size, f.color, "center");
      if (f.kind === "pixel") rect(f.x, f.y, 4, 4, f.color);
      if (f.kind === "magic") {
        c.strokeStyle = f.color;
        c.lineWidth = 5;
        c.beginPath();
        if (f.shape === "front") {
          c.ellipse(
            f.x,
            f.y - 20,
            f.range,
            f.depth,
            0,
            f.face === 1 ? -Math.PI / 2 : Math.PI / 2,
            f.face === 1 ? Math.PI / 2 : Math.PI * 1.5,
          );
        } else {
          c.ellipse(f.x, f.y - 18, f.range, f.depth, 0, 0, Math.PI * 2);
        }
        c.stroke();
      }
      if (f.kind === "slash") {
        c.translate(f.x, f.y);
        c.scale(f.face, 1);
        poly(
          [
            [15, -40],
            [80, -26],
            [109, 8],
            [69, 39],
            [22, 42],
            [66, 18],
            [77, -1],
            [61, -20],
          ],
          f.color,
        );
      }
      if (f.kind === "frost") {
        const r = 185 * (1 - f.life / f.max);
        c.strokeStyle = "#b7faff";
        c.lineWidth = 5;
        c.beginPath();
        c.ellipse(f.x, f.y, r, r * 0.45, 0, 0, Math.PI * 2);
        c.stroke();
        for (let i = 0; i < 12; i++) {
          let a = (i * Math.PI) / 6,
            x = f.x + Math.cos(a) * r,
            y = f.y + Math.sin(a) * r * 0.45;
          poly(
            [
              [x - 5, y],
              [x, y - 32],
              [x + 7, y],
              [x, y + 8],
            ],
            "#b9faff",
          );
        }
      }
      if (f.kind === "bolt") {
        poly(
          [
            [f.x + 18, f.y - 220],
            [f.x - 16, f.y - 80],
            [f.x + 4, f.y - 80],
            [f.x - 11, f.y],
            [f.x + 29, f.y - 116],
            [f.x + 9, f.y - 116],
          ],
          "#f8e4ac",
        );
        ellipse(f.x, f.y, f.r, f.r * 0.5, "#fbc48588");
      }
      if (f.kind === "impact") ellipse(f.x, f.y, f.r, f.r * 0.55, "#ffd0a188");
      c.restore();
    }
    c.restore();
    hud();
  }
  function hud() {
    rect(0, 0, 960, 64, "#101c31");
    rect(0, 63, 960, 1, "#5a6976");
    rect(0, 496, 960, 44, "#101c31");
    rect(0, 496, 960, 1, "#6b737b");
    if (mode === "menu") {
      text("锅盖雪人", 24, 29, 17);
      text("四座回廊 / 一场云端冒险", 24, 49, 11, "#93acc4");
      return;
    }
    text("魔法师 · 锅盖雪人", 22, 23, 15);
    rect(22, 32, 194, 13, "#394158");
    rect(23, 33, 192 * (p.hp / 160), 11, "#d56566");
    rect(23, 33, 192 * (p.hp / 160), 3, "#f49687");
    text(`${Math.ceil(p.hp)} / 160`, 119, 43, 10, "#fff4e3", "center");
    text(`药水 ${p.potions}  [H]`, 229, 42, 11, "#b8c8d7");
    text(names[room], 480, 26, 18, "#f4edd6", "center");
    text(
      `${difficulties[level].name} / ${String(Math.floor(clock / 60)).padStart(2, "0")}:${String(Math.floor(clock % 60)).padStart(2, "0")}`,
      480,
      47,
      11,
      "#a6bdcf",
      "center",
    );
    for (let i = 0; i < 4; i++) {
      rect(
        770 + i * 42,
        22,
        28,
        23,
        i === room ? "#dfb66b" : i < room ? "#527d7f" : "#27374e",
      );
      text(
        i === 3 ? "♛" : String(i + 1),
        784 + i * 42,
        39,
        13,
        i === room ? "#15233a" : "#bccad6",
        "center",
      );
      if (i < 3) rect(800 + i * 42, 32, 10, 2, "#647384");
    }
    const hudSkills = [
      ["J", "魔法连击", p.hitCd],
      ["K", "跳跃", p.cd.jump],
      ["L", weapons[p.weapon].skill.name, p.cd.lid],
      ["U", "冰霜环", p.cd.frost],
      ["空格", "冲刺", p.cd.dash],
    ];
    hudSkills.forEach(([k, n, cd], i) => {
      let x = 22 + i * 149;
      rect(x, 506, k === "空格" ? 39 : 25, 24, cd > 0 ? "#29374e" : "#33465c");
      text(
        k,
        x + (k === "空格" ? 19 : 12),
        523,
        11,
        cd > 0 ? "#7e91a7" : "#f0d49a",
        "center",
      );
      text(
        cd > 0 ? `${n} ${cd.toFixed(1)}s` : n,
        x + (k === "空格" ? 48 : 34),
        523,
        12,
        cd > 0 ? "#8396ad" : "#ccd6db",
      );
    });
    text(
      clear ? "前往光门 →" : `剩余 ${enemies.filter((e) => e.hp > 0).length}`,
      925,
      523,
      12,
      clear ? "#acf0d4" : "#a7bace",
      "right",
    );
    const weapon = weapons[p.weapon];
    rect(12, 72, 265, 105, "#101c31df");
    text(
      `[${weapon.key}] ${weapon.name} · 攻击 ${stats(p).attack.toFixed(1)} · 间隔 ${weapon.interval.toFixed(2)}s`,
      22,
      93,
      12,
      weapon.color,
    );
    text(`1/2/3 切换 · ${weapon.description}`, 22, 116, 11, "#d3dce8");
    text(`暴击 ${Math.round(stats(p).critChance * 100)}% · 暴伤 ${stats(p).critMultiplier.toFixed(1)}倍 · 成长 ${p.upgrades.length}`, 22, 136, 11, "#f0d49a");
    text(`L ${cooldown(p, weapon.skill.cooldown).toFixed(2)}s / U ${cooldown(p, skills.frost.cooldown).toFixed(2)}s · 实扣 ${totalDamage.toFixed(0)}`, 22, 155, 11, "#b7c9db");
    text(`难度防御 +${difficulties[level].defense} · 石像 +15 / 领主 +10`, 22, 169, 10, "#b7c9db");
    if (combo > 0) {
      text(`${combo}`, 902, 129, 34, "#ffe5ad", "right");
      text(comboRank(combo), 902, 150, 12, "#dfb66b", "right");
    }
    const boss = enemies.find((e) => e.type === "boss" && e.hp > 0);
    if (boss) {
      text(
        boss.hp < boss.max * 0.5 ? "雷霆城主 · 狂暴" : "雷霆城主",
        480,
        88,
        14,
        "#ffe5ae",
        "center",
      );
      rect(286, 97, 388, 9, "#25364d");
      rect(288, 99, (384 * boss.hp) / boss.max, 5, "#d6ad67");
    }
  }
  p = makePlayer();
  function frame(stamp) {
    const dt = Math.min((stamp - last) / 1000 || 0, 0.04);
    last = stamp;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // Read-only snapshot for reproducible browser QA. No state mutation or cheats.
  window.skySnowSnapshot = () => ({
    sceneryReady,
    spriteReady,
    spriteFrame: spriteFrame(),
    animation: animationState(p),
    events: combatEvents.map((e) => ({ ...e })),
    weapon: weapons[p.weapon],
    mode,
    room,
    level,
    clock,
    combatSeconds, totalDamage, panel: stats(p),
    kills,
    combo,
    maxCombo,
    clear,
    player: JSON.parse(JSON.stringify(p)),
    enemies: enemies
      .filter((e) => e.hp > 0)
      .map(({ type, x, y, hp, max, cast }) => ({ type, x, y, hp, max, cast })),
    hazards: hazards.map(({ x, y, r, life }) => ({ x, y, r, life })),
    shots: shots.length,
  });
})();

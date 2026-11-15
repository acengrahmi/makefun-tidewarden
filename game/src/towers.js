// towers.js — the five towers a warden can raise on the bay's plots, their three
// levels each, and everything they do: aim, fire, chain, splash and buff. A tower on
// a flooded low plot does none of it — it stands dormant under the water until the
// tide falls again (see tide.js), which is the whole placement game.

import { cellCenter } from './config.js';
import { plotFlooded } from './tide.js';
import { damageEnemy } from './enemies.js';

// Levels are listed 1..3: cost buys that level (level 1's cost is the build price),
// damage/range/rate are that level's working numbers.
export const TOWER_TYPES = [
  {
    id: 'bolt', name: 'Bolt Spire', glyph: 'B',
    blurb: 'Rapid bolts. Cheap, tireless, honest.',
    levels: [
      { cost: 50, damage: 10, range: 140, rate: 3.0 },
      { cost: 45, damage: 16, range: 150, rate: 3.4 },
      { cost: 80, damage: 28, range: 164, rate: 4.0 },
    ],
  },
  {
    id: 'frost', name: 'Frost Totem', glyph: 'F',
    blurb: 'Chills a knot of raiders, slowing the march.',
    levels: [
      { cost: 60, damage: 3, range: 122, rate: 1.5, slowPct: 0.35, slowDur: 1.3, chill: 48 },
      { cost: 55, damage: 5, range: 130, rate: 1.6, slowPct: 0.45, slowDur: 1.5, chill: 54 },
      { cost: 95, damage: 8, range: 140, rate: 1.8, slowPct: 0.55, slowDur: 1.7, chill: 62 },
    ],
  },
  {
    id: 'mortar', name: 'Tide Mortar', glyph: 'M',
    blurb: 'Lobbed shells, wide splash. Blind up close.',
    levels: [
      { cost: 90, damage: 38, range: 196, rate: 0.55, splash: 58, minRange: 58 },
      { cost: 85, damage: 60, range: 206, rate: 0.58, splash: 66, minRange: 58 },
      { cost: 140, damage: 105, range: 218, rate: 0.62, splash: 78, minRange: 58 },
    ],
  },
  {
    id: 'storm', name: 'Storm Coil', glyph: 'S',
    blurb: 'Lightning that leaps from hull to hull.',
    levels: [
      { cost: 110, damage: 18, range: 158, rate: 0.9, chain: 3, chainRange: 92, falloff: 0.72 },
      { cost: 100, damage: 26, range: 166, rate: 0.95, chain: 4, chainRange: 96, falloff: 0.72 },
      { cost: 170, damage: 44, range: 178, rate: 1.0, chain: 6, chainRange: 100, falloff: 0.75 },
    ],
  },
  {
    id: 'aura', name: 'Sun Beacon', glyph: 'A',
    blurb: 'Lamplight: neighbours shoot harder and faster.',
    levels: [
      { cost: 80, damage: 6, range: 132, rate: 1.0, buffDmg: 0.2, buffRate: 0.15 },
      { cost: 75, damage: 10, range: 140, rate: 1.1, buffDmg: 0.3, buffRate: 0.2 },
      { cost: 130, damage: 16, range: 150, rate: 1.2, buffDmg: 0.45, buffRate: 0.3 },
    ],
  },
];

export function towerTypeById(id) {
  return TOWER_TYPES.find((t) => t.id === id);
}

export function towerStats(tower) {
  return towerTypeById(tower.typeId).levels[tower.level - 1];
}

export function createTower(typeId, plot) {
  const { x, y } = cellCenter(plot.c, plot.r);
  const type = towerTypeById(typeId);
  return {
    typeId, level: 1, plot, x, y,
    cooldown: 0, invested: type.levels[0].cost, kills: 0, angle: -Math.PI / 2,
  };
}

export function upgradeCost(tower) {
  if (tower.level >= 3) return null;
  return towerTypeById(tower.typeId).levels[tower.level].cost;
}

export function applyUpgrade(tower) {
  const cost = upgradeCost(tower);
  if (cost === null) return false;
  tower.level += 1;
  tower.invested += cost;
  return true;
}

// A tower is dormant while its plot is under the high tide.
export function towerDormant(state, tower) {
  return plotFlooded(state.tide, tower.plot);
}

// The Sun Beacon's gift to its neighbours: the strongest dry beacon in range lends
// its damage and rate multipliers (beacons never buff themselves or each other).
export function beaconBuffFor(state, tower) {
  let dmg = 0, rate = 0;
  for (const other of state.towers) {
    if (other === tower || other.typeId !== 'aura' || towerDormant(state, other)) continue;
    const s = towerStats(other);
    const d = Math.hypot(other.x - tower.x, other.y - tower.y);
    if (d <= s.range) { dmg = Math.max(dmg, s.buffDmg); rate = Math.max(rate, s.buffRate); }
  }
  return { dmgMul: 1 + dmg, rateMul: 1 + rate };
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// The enemy furthest along its road (or lane) inside range — the one closest to the
// keep is always the one that matters.
function pickTarget(state, tower, stats) {
  let best = null;
  for (const e of state.enemies) {
    if (e.dead || e.leaked) continue;
    const d = dist(tower, e);
    if (d > stats.range) continue;
    if (stats.minRange && d < stats.minRange) continue;
    if (!best || e.progress > best.progress) best = e;
  }
  return best;
}

function fire(state, tower, stats, buff, target) {
  const dmg = stats.damage * buff.dmgMul;
  if (tower.typeId === 'bolt' || tower.typeId === 'aura') {
    state.fx.push({ kind: tower.typeId === 'bolt' ? 'bolt' : 'zap', x1: tower.x, y1: tower.y - 18, x2: target.x, y2: target.y, ttl: 0.09, max: 0.09 });
    damageEnemy(state, target, dmg, tower);
  } else if (tower.typeId === 'frost') {
    state.fx.push({ kind: 'chill', x: target.x, y: target.y, r: stats.chill, ttl: 0.22, max: 0.22 });
    for (const e of state.enemies) {
      if (e.dead || e.leaked) continue;
      if (Math.hypot(e.x - target.x, e.y - target.y) <= stats.chill) {
        e.slowPct = Math.max(e.slowPct, stats.slowPct);
        e.slowTimer = Math.max(e.slowTimer, stats.slowDur);
        damageEnemy(state, e, dmg, tower);
      }
    }
  } else if (tower.typeId === 'storm') {
    let current = target, amount = dmg;
    const hit = new Set();
    let px = tower.x, py = tower.y - 18;
    for (let jump = 0; jump < stats.chain && current; jump++) {
      state.fx.push({ kind: 'arc', x1: px, y1: py, x2: current.x, y2: current.y, ttl: 0.13, max: 0.13 });
      hit.add(current);
      damageEnemy(state, current, amount, tower);
      px = current.x; py = current.y; amount *= stats.falloff;
      let next = null, nd = Infinity;
      for (const e of state.enemies) {
        if (e.dead || e.leaked || hit.has(e)) continue;
        const d = Math.hypot(e.x - px, e.y - py);
        if (d <= stats.chainRange && d < nd) { nd = d; next = e; }
      }
      current = next;
    }
  } else if (tower.typeId === 'mortar') {
    const flight = Math.max(0.35, dist(tower, target) / 300);
    state.projectiles.push({
      kind: 'shell', x: tower.x, y: tower.y - 20, sx: tower.x, sy: tower.y - 20,
      tx: target.x, ty: target.y, t: 0, dur: flight, damage: dmg, splash: stats.splash, from: tower,
    });
    state.fx.push({ kind: 'muzzle', x: tower.x, y: tower.y - 20, ttl: 0.12, max: 0.12 });
  }
  if (state.audio) state.audio.sfx(tower.typeId);
}

export function updateTowers(state, dt) {
  for (const tower of state.towers) {
    if (towerDormant(state, tower)) continue;
    const stats = towerStats(tower);
    const buff = beaconBuffFor(state, tower);
    tower.cooldown -= dt * buff.rateMul;
    // Keep the barrel on the current target between shots, for the renderer's aim.
    const target = pickTarget(state, tower, stats);
    if (target) tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x);
    if (tower.cooldown <= 0 && target) {
      fire(state, tower, stats, buff, target);
      tower.cooldown = Math.max(tower.cooldown + 1 / stats.rate, 1 / stats.rate * 0.25);
    }
  }
}

// Shells in flight: a mortar shell arcs to its mark and bursts, hurting everything
// in the splash — full at the centre, half at the rim.
export function updateProjectiles(state, dt) {
  const kept = [];
  for (const p of state.projectiles) {
    p.t += dt;
    if (p.t < p.dur) {
      const k = p.t / p.dur;
      p.x = p.sx + (p.tx - p.sx) * k;
      p.y = p.sy + (p.ty - p.sy) * k - Math.sin(k * Math.PI) * 46;
      kept.push(p);
      continue;
    }
    state.fx.push({ kind: 'boom', x: p.tx, y: p.ty, r: p.splash, ttl: 0.3, max: 0.3 });
    state.shake = Math.min(6, state.shake + 2.5);
    for (const e of state.enemies) {
      if (e.dead || e.leaked) continue;
      const d = Math.hypot(e.x - p.tx, e.y - p.ty);
      if (d <= p.splash + e.radius) {
        const fall = d <= p.splash * 0.5 ? 1 : 0.55;
        damageEnemy(state, e, p.damage * fall, p.from);
      }
    }
    if (state.audio) state.audio.sfx('boom');
  }
  state.projectiles = kept;
}

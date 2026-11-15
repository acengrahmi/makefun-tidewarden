// enemies.js — the raiders who come for the keep: eight kinds who march the stone
// road or sail the flooded lanes, and the three great hulls that boss the bay at
// waves 4, 8 and 12. This file owns their definitions, their movement along a path,
// their afflictions (chill, blink, mending), the bosses' phases, and the moment a
// tower's damage lands — armour, death, salvage and all.

import { ROAD_PATH, LANES } from './config.js';
import { awardKill } from './economy.js';

export const ENEMY_KINDS = {
  raider:    { name: 'Raider',      hp: 46,  speed: 34, armor: 0, reward: 6,  lives: 1, radius: 13, route: 'road' },
  runner:    { name: 'Runner',      hp: 26,  speed: 63, armor: 0, reward: 5,  lives: 1, radius: 11, route: 'road' },
  brute:     { name: 'Brute',       hp: 265, speed: 20, armor: 1, reward: 14, lives: 2, radius: 17, route: 'road' },
  aegis:     { name: 'Aegis',       hp: 125, speed: 26, armor: 4, reward: 12, lives: 1, radius: 14, route: 'road' },
  blinker:   { name: 'Blinker',     hp: 62,  speed: 36, armor: 0, reward: 9,  lives: 1, radius: 12, route: 'road', blinkEvery: 2.6, blinkDist: 48 },
  mender:    { name: 'Mender',      hp: 84,  speed: 30, armor: 0, reward: 11, lives: 1, radius: 13, route: 'road', healRange: 94, healAmount: 7 },
  skiff:     { name: 'Sail-runner', hp: 42,  speed: 56, armor: 0, reward: 7,  lives: 1, radius: 13, route: 'water' },
  raft:      { name: 'War-raft',    hp: 175, speed: 24, armor: 2, reward: 13, lives: 2, radius: 16, route: 'water' },
  golem:     { name: 'Tide Golem',  hp: 1500, speed: 13, armor: 2, reward: 150, lives: 5, radius: 26, route: 'road', boss: true,
               phases: [{ speedMul: 1, armor: 2 }, { speedMul: 1.35, armor: 2, spawn: 'raider', spawnEvery: 4 }, { speedMul: 1.5, armor: 5, spawn: 'runner', spawnEvery: 3.4 }] },
  barge:     { name: 'Dread Barge', hp: 900, speed: 12, armor: 2, reward: 220, lives: 5, radius: 28, route: 'water', boss: true,
               phases: [{ speedMul: 1, armor: 2 }, { speedMul: 1.2, armor: 3, spawn: 'skiff', spawnEvery: 4.5 }, { speedMul: 1.35, armor: 4, spawn: 'raft', spawnEvery: 6 }] },
  leviathan: { name: 'The Leviathan', hp: 2600, speed: 10, armor: 3, reward: 400, lives: 10, radius: 32, route: 'water', boss: true,
               phases: [{ speedMul: 1, armor: 3 }, { speedMul: 1.25, armor: 4, spawn: 'skiff', spawnEvery: 3.6 }, { speedMul: 1.6, armor: 5, spawn: 'mender', spawnEvery: 5 }] },
};

// A path is a polyline with cumulative lengths, so an enemy is just a distance
// along it — position and heading are read off in O(segments).
export function makePath(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return { points, lengths, total: lengths[lengths.length - 1] };
}

export const ROAD = makePath(ROAD_PATH);
export const LANE_PATHS = LANES.map((lane) => makePath(lane.path));

export function positionAt(path, d) {
  const dist = Math.max(0, Math.min(d, path.total));
  let i = 1;
  while (i < path.lengths.length - 1 && path.lengths[i] < dist) i++;
  const segLen = path.lengths[i] - path.lengths[i - 1] || 1;
  const k = (dist - path.lengths[i - 1]) / segLen;
  const a = path.points[i - 1], b = path.points[i];
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

let nextEnemyId = 1;

export function spawnEnemy(state, kindId, laneIndex = 0, hpMul = 1, startDist = 0) {
  const def = ENEMY_KINDS[kindId];
  const path = def.route === 'water' ? LANE_PATHS[laneIndex % LANE_PATHS.length] : ROAD;
  const hp = Math.round(def.hp * hpMul);
  const e = {
    id: nextEnemyId++, kind: kindId, def, path,
    dist: startDist, progress: 0, x: 0, y: 0, angle: 0,
    hp, maxHp: hp, speed: def.speed, armor: def.armor, reward: def.reward,
    lives: def.lives, radius: def.radius, boss: !!def.boss, phase: 1,
    slowPct: 0, slowTimer: 0, blinkTimer: def.blinkEvery ?? 0, healTimer: 0, spawnTimer: 0,
    wobble: state.rng() * Math.PI * 2, dead: false, leaked: false,
  };
  const pos = positionAt(path, startDist);
  e.x = pos.x; e.y = pos.y; e.angle = pos.angle;
  state.enemies.push(e);
  return e;
}

// Damage lands here: armour shaves every hit (to a minimum of 1, which is why a
// rapid cheap tower tickles an Aegis and a mortar does not), chill is applied by
// towers.js, and a kill pays its salvage through the economy's combo.
export function damageEnemy(state, e, amount, source = null) {
  if (e.dead || e.leaked) return;
  const dealt = Math.max(1, amount - e.armor);
  e.hp -= dealt;
  state.fx.push({ kind: 'spark', x: e.x, y: e.y, ttl: 0.16, max: 0.16 });
  if (e.hp > 0) return;
  e.dead = true;
  if (source) source.kills += 1;
  const paid = awardKill(state.eco, e.reward, state.difficulty);
  state.score += Math.round(e.reward * 10 * state.difficulty.scoreMul);
  state.fx.push({ kind: 'gold', x: e.x, y: e.y - 14, text: '+' + paid, ttl: 0.9, max: 0.9 });
  state.fx.push({ kind: 'burst', x: e.x, y: e.y, boat: e.def.route === 'water', ttl: 0.4, max: 0.4 });
  if (e.boss) {
    state.shake = Math.min(10, state.shake + 6);
    state.fx.push({ kind: 'banner', text: e.def.name + ' sunk!', ttl: 1.6, max: 1.6 });
    if (state.audio) state.audio.sfx('bossdown');
  } else if (state.audio) {
    state.audio.sfx('kill');
  }
}

// A boss's phase from its remaining hull: thirds. Crossing into a new phase is an
// event — the banner flies, the boss quickens, and from phase 2 it sheds escorts.
function bossPhase(state, e, dt) {
  const frac = e.hp / e.maxHp;
  const phase = frac > 2 / 3 ? 1 : frac > 1 / 3 ? 2 : 3;
  if (phase !== e.phase) {
    e.phase = phase;
    e.armor = e.def.phases[phase - 1].armor;
    state.fx.push({ kind: 'banner', text: e.def.name + ' — phase ' + phase + '!', ttl: 1.6, max: 1.6 });
    state.shake = Math.min(8, state.shake + 3);
    if (state.audio) state.audio.sfx('phase');
  }
  const plan = e.def.phases[e.phase - 1];
  if (plan.spawn) {
    e.spawnTimer -= dt;
    if (e.spawnTimer <= 0) {
      e.spawnTimer = plan.spawnEvery;
      const laneIndex = LANES.findIndex((l) => Math.abs(l.y - e.y) < 4);
      spawnEnemy(state, plan.spawn, Math.max(0, laneIndex), state.waveHpMul, Math.max(0, e.dist - 30));
    }
  }
  return plan.speedMul;
}

export function updateEnemies(state, dt) {
  for (const e of state.enemies) {
    if (e.dead || e.leaked) continue;
    // Chill fades; while it lasts the enemy crawls.
    if (e.slowTimer > 0) { e.slowTimer -= dt; if (e.slowTimer <= 0) e.slowPct = 0; }
    let speedMul = 1 - (e.slowTimer > 0 ? e.slowPct : 0);
    if (e.boss) speedMul *= bossPhase(state, e, dt);
    e.dist += e.speed * speedMul * dt;
    // The Blinker folds space: every few seconds it is simply further on.
    if (e.def.blinkEvery) {
      e.blinkTimer -= dt;
      if (e.blinkTimer <= 0) {
        e.blinkTimer = e.def.blinkEvery;
        state.fx.push({ kind: 'blink', x: e.x, y: e.y, ttl: 0.25, max: 0.25 });
        e.dist += e.def.blinkDist;
      }
    }
    // The Mender knits its neighbours' hulls back together, a little each second.
    if (e.def.healAmount) {
      e.healTimer += dt;
      if (e.healTimer >= 1) {
        e.healTimer = 0;
        for (const other of state.enemies) {
          if (other === e || other.dead || other.leaked || other.boss) continue;
          if (Math.hypot(other.x - e.x, other.y - e.y) <= e.def.healRange && other.hp < other.maxHp) {
            other.hp = Math.min(other.maxHp, other.hp + e.def.healAmount);
            state.fx.push({ kind: 'mend', x: other.x, y: other.y, ttl: 0.3, max: 0.3 });
          }
        }
      }
    }
    const pos = positionAt(e.path, e.dist);
    e.x = pos.x; e.y = pos.y; e.angle = pos.angle;
    e.progress = e.dist / e.path.total;
    // Reaching the keep costs the warden lives; the wave remembers the leak.
    if (e.dist >= e.path.total) {
      e.leaked = true;
      state.lives -= e.lives;
      state.leakedThisWave += e.lives;
      state.shake = Math.min(8, state.shake + 3);
      state.fx.push({ kind: 'leak', x: 962, y: e.y, text: '-' + e.lives, ttl: 1.0, max: 1.0 });
      if (state.audio) state.audio.sfx('leak');
    }
  }
  // The fallen and the fled leave the field.
  if (state.enemies.some((e) => e.dead || e.leaked)) {
    state.enemies = state.enemies.filter((e) => !e.dead && !e.leaked);
  }
}

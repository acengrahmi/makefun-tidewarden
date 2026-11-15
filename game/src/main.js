// main.js — TIDEWARDEN's conductor: the game state, the actions a player can take
// (build, upgrade, sell, loose the wave, play again), the fixed simulation step
// that runs them all, the deterministic shot scenes the screenshots are taken
// from, and — in a browser only — the boot that wires canvas, input and sound.
// The simulation half touches no DOM, so the logic tests drive it headlessly.

import { PLOTS, difficultyById, makeRng } from './config.js';
import { createTide, setTideForWave, updateTide, isHighTide, tideForWave } from './tide.js';
import { createEconomy, spend, canAfford, settleWave, sellRefund, updateEconomy } from './economy.js';
import { TOWER_TYPES, towerTypeById, createTower, upgradeCost, applyUpgrade, updateTowers, updateProjectiles } from './towers.js';
import { spawnEnemy, updateEnemies } from './enemies.js';
import { WAVE_COUNT, beginWave, updateSpawning, waveCleared } from './waves.js';

export const START_LIVES = 20;

export function createGame(difficultyId = 'normal', seed = 1) {
  const difficulty = difficultyById(difficultyId);
  const state = {
    screen: 'title', // title | game | victory | defeat
    difficulty,
    eco: createEconomy(difficulty),
    tide: createTide(),
    towers: [], enemies: [], projectiles: [], fx: [],
    wave: 0, waveTime: 0, spawnQueue: [], waveHpMul: 1, leakedThisWave: 0,
    lives: START_LIVES, score: 0, phase: 'build', // build | wave
    selectedPlot: null, selectedTower: null, selectedType: 'bolt', hoverCell: null,
    paused: false, speed: 1, shake: 0, time: 0, rng: makeRng(seed),
    audio: null, lastSettle: null, stars: 0,
  };
  setTideForWave(state.tide, 1);
  return state;
}

// Start (or restart) a run on a chosen difficulty: a clean bay, a full purse of
// lives, and the first wave's tide already on its way in.
export function startRun(state, difficultyId) {
  const fresh = createGame(difficultyId, (Math.random() * 1e9) | 0);
  Object.assign(state, fresh, { screen: 'game', audio: state.audio });
  if (state.audio) state.audio.setHighTide(false);
  return state;
}

// Back to the title (Play Again / Try Again): a fresh bay at the same table.
export function toTitle(state) {
  const fresh = createGame(state.difficulty.id, (Math.random() * 1e9) | 0);
  Object.assign(state, fresh, { audio: state.audio });
  return state;
}

export function plotTower(state, plot) {
  return state.towers.find((t) => t.plot === plot) ?? null;
}

// --- the player's actions -------------------------------------------------

export function tryBuild(state, plot) {
  if (state.screen !== 'game' || plotTower(state, plot)) return false;
  const type = towerTypeById(state.selectedType);
  if (!canAfford(state.eco, type.levels[0].cost)) {
    if (state.audio) state.audio.sfx('error');
    return false;
  }
  spend(state.eco, type.levels[0].cost);
  const tower = createTower(type.id, plot);
  state.towers.push(tower);
  state.selectedTower = tower;
  state.fx.push({ kind: 'buildring', x: tower.x, y: tower.y, ttl: 0.4, max: 0.4 });
  if (state.audio) state.audio.sfx('build');
  return true;
}

export function tryUpgrade(state, tower) {
  const cost = tower ? upgradeCost(tower) : null;
  if (cost === null || !spend(state.eco, cost)) {
    if (state.audio) state.audio.sfx('error');
    return false;
  }
  applyUpgrade(tower);
  state.fx.push({ kind: 'buildring', x: tower.x, y: tower.y, ttl: 0.4, max: 0.4 });
  if (state.audio) state.audio.sfx('upgrade');
  return true;
}

export function trySell(state, tower) {
  if (!tower) return false;
  state.eco.gold += sellRefund(tower.invested);
  state.towers = state.towers.filter((t) => t !== tower);
  if (state.selectedTower === tower) state.selectedTower = null;
  if (state.audio) state.audio.sfx('sell');
  return true;
}

export function pressStartWave(state) {
  if (state.screen !== 'game' || state.phase !== 'build') return false;
  beginWave(state);
  return true;
}

// --- the simulation step ----------------------------------------------------

// One fixed step of the bay. The browser calls it with real elapsed time (times
// the speed setting); the tests call it with exact fractions, and the shot
// scenes call it a counted number of times — the same code path every time.
export function stepGame(state, dt) {
  if (state.screen !== 'game' || state.paused) return;
  state.time += dt;
  updateTide(state.tide, dt);
  if (state.audio) state.audio.setHighTide(isHighTide(state.tide));
  if (state.phase === 'wave') updateSpawning(state, dt);
  updateTowers(state, dt);
  updateProjectiles(state, dt);
  updateEnemies(state, dt);
  updateEconomy(state.eco, dt);
  state.fx = state.fx.filter((f) => (f.ttl -= dt) > 0);
  state.shake = Math.max(0, state.shake - dt * 14);
  if (state.lives <= 0) {
    state.screen = 'defeat';
    if (state.audio) state.audio.sfx('lose');
    return;
  }
  if (waveCleared(state)) {
    const flawless = state.leakedThisWave === 0;
    state.lastSettle = settleWave(state.eco, state.wave, flawless, state.difficulty);
    state.score += 100 + state.wave * 25;
    if (state.wave >= WAVE_COUNT) {
      state.stars = state.lives >= 15 ? 3 : state.lives >= 8 ? 2 : 1;
      state.screen = 'victory';
      if (state.audio) state.audio.sfx('win');
    } else {
      state.phase = 'build';
      setTideForWave(state.tide, state.wave + 1);
    }
  }
}

// --- the shot scenes ----------------------------------------------------------

// The screenshots are staged, never faked: each scene builds a real game state
// with the ordinary actions and spawns, steps the ordinary simulation a counted
// number of fixed steps, and lets the renderer draw what it draws in play. The
// seed pins every random choice, so a scene renders the same bytes every time.
export function buildShotScene(scene, seed = 7) {
  const state = createGame('normal', seed);
  const plot = (c, r) => PLOTS.find((p) => p.c === c && p.r === r);
  const build = (typeId, c, r, level = 1) => {
    state.selectedType = typeId;
    const p = plot(c, r);
    const tower = createTower(typeId, p);
    while (tower.level < level) applyUpgrade(tower);
    state.towers.push(tower);
    return tower;
  };
  if (scene === 'title') {
    build('bolt', 1, 3); build('aura', 6, 3); build('storm', 9, 5); build('mortar', 3, 7);
    state.tide.level = 0.3;
    spawnEnemy(state, 'raider', 0, 1, 420); spawnEnemy(state, 'raider', 0, 1, 560);
    spawnEnemy(state, 'skiff', 0, 1, 500); spawnEnemy(state, 'raft', 1, 1, 260);
    return state;
  }
  state.screen = 'game';
  if (scene === 'play') {
    state.wave = 3; state.phase = 'wave'; state.eco.gold = 145; state.score = 1240;
    build('bolt', 1, 3, 2); build('mortar', 6, 3); build('frost', 9, 5);
    const storm = build('storm', 7, 3); build('bolt', 11, 4);
    state.selectedTower = storm; state.selectedPlot = storm.plot;
    const kinds = ['raider', 'raider', 'runner', 'raider', 'brute', 'raider', 'runner', 'raider'];
    kinds.forEach((k, i) => {
      const e = spawnEnemy(state, k, 0, 1.28, 180 + i * 130);
      if (i % 3 === 0) e.hp = Math.round(e.hp * 0.55);
    });
    for (let i = 0; i < 90; i++) stepGame(state, 1 / 60);
    return state;
  }
  if (scene === 'tide') {
    state.wave = 8; state.phase = 'wave'; state.eco.gold = 260; state.lives = 17; state.score = 5310;
    setTideForWave(state.tide, 8); state.tide.level = 1;
    build('storm', 6, 3, 3); build('mortar', 7, 3, 2); build('bolt', 13, 3, 2);
    build('aura', 9, 5, 2); build('bolt', 2, 5); build('mortar', 7, 5);
    const boss = spawnEnemy(state, 'barge', 1, 1.98, 620);
    boss.hp = Math.round(boss.maxHp * 0.55); boss.phase = 2;
    spawnEnemy(state, 'skiff', 1, 1.98, 380); spawnEnemy(state, 'skiff', 0, 1.98, 700);
    spawnEnemy(state, 'raft', 0, 1.98, 300); spawnEnemy(state, 'raider', 0, 1.98, 500);
    for (let i = 0; i < 60; i++) stepGame(state, 1 / 60);
    return state;
  }
  if (scene === 'victory') {
    build('storm', 6, 3, 3); build('aura', 9, 5, 2); build('mortar', 7, 3, 2); build('bolt', 1, 3, 2);
    state.tide.level = 0.25;
    state.wave = 12; state.lives = 17; state.score = 9840; state.stars = 3;
    state.eco.kills = 214; state.eco.earned = 3120;
    state.screen = 'victory';
    return state;
  }
  return state;
}

// --- the browser boot ---------------------------------------------------------

if (typeof document !== 'undefined') {
  const boot = async () => {
    const { drawGame } = await import('./render.js');
    const { attachInput } = await import('./input.js');
    const { createAudio } = await import('./audio.js');
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const params = new URLSearchParams(location.search);
    const shot = params.get('shot');
    let state;
    if (shot) {
      state = buildShotScene(shot, Number(params.get('seed') ?? 7));
    } else {
      state = createGame('normal', (Math.random() * 1e9) | 0);
      state.audio = createAudio();
    }
    attachInput(canvas, state, { tryBuild, tryUpgrade, trySell, pressStartWave, startRun, toTitle });
    let last = performance.now();
    let shotFrames = 0;
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!shot) {
        if (state.screen === 'game') {
          stepGame(state, dt * state.speed);
        } else {
          // The title and end screens keep the bay breathing behind them.
          state.time += dt;
          updateTide(state.tide, dt);
          state.fx = state.fx.filter((f) => (f.ttl -= dt) > 0);
        }
      }
      drawGame(ctx, state);
      if (shot && ++shotFrames === 3) window.__shotReady = true;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  boot();
}

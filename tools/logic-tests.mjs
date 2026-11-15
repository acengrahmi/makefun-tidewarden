// logic-tests.mjs — headless tests for TIDEWARDEN's simulation half (Node 22, no
// browser): economy math, build/upgrade/sell, tide dormancy, water-lane routing,
// boss phases, win/lose/restart, and a full autopilot run on Normal that must win.
// Run: node tools/logic-tests.mjs

import { createGame, startRun, toTitle, tryBuild, tryUpgrade, trySell, pressStartWave, stepGame, plotTower } from '../game/src/main.js';
import { PLOTS } from '../game/src/config.js';
import { createEconomy, settleWave, sellRefund, awardKill } from '../game/src/economy.js';
import { tideForWave, setTideForWave } from '../game/src/tide.js';
import { towerDormant } from '../game/src/towers.js';
import { spawnEnemy, damageEnemy, ROAD, LANE_PATHS } from '../game/src/enemies.js';
import { WAVES, WAVE_COUNT } from '../game/src/waves.js';

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
const plot = (c, r) => PLOTS.find((p) => p.c === c && p.r === r);
function gameOn(difficulty = 'normal', seed = 3) {
  const s = createGame(difficulty, seed);
  s.screen = 'game';
  return s;
}
function step(state, seconds, dt = 1 / 30) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) stepGame(state, dt);
}

// --- economy math -------------------------------------------------------------
{
  const eco = createEconomy({ goldMul: 1 });
  check('start gold 230', eco.gold === 230);
  const paid = awardKill(eco, 10, { goldMul: 1 });
  check('first kill pays base (combo x1.00)', paid === 10 && eco.combo === 1);
  const paid2 = awardKill(eco, 10, { goldMul: 1 });
  check('second kill pays combo x1.02', paid2 === Math.round(10 * 1.02), 'got ' + paid2);
  const s = settleWave(eco, 3, true, { goldMul: 1 });
  check('settle: bonus 30 + interest cap + flawless 15', s.bonus === 30 && s.flawless === 15 && s.interest <= 40 && s.total === s.bonus + s.interest + 15);
  check('sell refund is 70% floored', sellRefund(175) === 122 && sellRefund(50) === 35);
}

// --- build / upgrade / sell -----------------------------------------------------
{
  const s = gameOn();
  s.selectedType = 'bolt';
  check('build bolt succeeds', tryBuild(s, plot(1, 3)) === true);
  check('gold after build', s.eco.gold === 180, 'gold=' + s.eco.gold);
  const tw = plotTower(s, plot(1, 3));
  check('tower invested 50', tw && tw.invested === 50 && tw.level === 1);
  check('rebuild on occupied plot refused', tryBuild(s, plot(1, 3)) === false);
  check('upgrade to 2', tryUpgrade(s, tw) === true && tw.level === 2 && tw.invested === 95 && s.eco.gold === 135);
  check('upgrade to 3', tryUpgrade(s, tw) === true && tw.level === 3 && tw.invested === 175 && s.eco.gold === 55);
  check('upgrade past 3 refused', tryUpgrade(s, tw) === false);
  check('sell refunds 122', trySell(s, tw) === true && s.eco.gold === 177 && plotTower(s, plot(1, 3)) === null);
}

// --- tide: alternation and dormancy ---------------------------------------------
{
  check('tide alternates by wave', tideForWave(1) === 'low' && tideForWave(2) === 'high' && tideForWave(12) === 'high');
  check('twelve waves defined', WAVE_COUNT === 12 && WAVES.length === 12);
  const s = gameOn();
  s.selectedType = 'bolt';
  tryBuild(s, plot(2, 5)); // low plot
  tryBuild(s, plot(1, 3)); // high plot
  const low = plotTower(s, plot(2, 5)), high = plotTower(s, plot(1, 3));
  check('low tide: nothing dormant', !towerDormant(s, low) && !towerDormant(s, high));
  setTideForWave(s.tide, 2);
  step(s, 3); // let the water finish rising
  check('high tide: low tower dormant, high tower awake', towerDormant(s, low) && !towerDormant(s, high));
  // An enemy in range of the dormant low tower only: it must take no damage at
  // high tide, and start taking damage once the tide falls.
  const e = spawnEnemy(s, 'raider', 0, 1, 288);
  const hp0 = e.hp;
  step(s, 2);
  check('dormant tower deals no damage', e.hp === hp0, 'hp ' + hp0 + ' -> ' + e.hp);
  setTideForWave(s.tide, 3);
  step(s, 3); // the water falls again
  const e2 = spawnEnemy(s, 'raider', 0, 1, 288);
  step(s, 1.2);
  check('tower wakes and fires at low tide', e2.hp < e2.maxHp || e2.dead, 'hp=' + e2.hp);
}

// --- water lanes ------------------------------------------------------------------
{
  const s = gameOn();
  const skiff = spawnEnemy(s, 'skiff', 1, 1, 0);
  check('skiff sails lane path', skiff.path === LANE_PATHS[1] && Math.abs(skiff.y - LANE_PATHS[1].points[0].y) < 0.01);
  const raider = spawnEnemy(s, 'raider', 0, 1, 0);
  check('raider walks the road', raider.path === ROAD);
  const x0 = skiff.x;
  step(s, 1);
  check('skiff advances along the lane', skiff.x > x0 && Math.abs(skiff.y - LANE_PATHS[1].points[0].y) < 0.01);
}

// --- boss phases --------------------------------------------------------------------
{
  const s = gameOn();
  const golem = spawnEnemy(s, 'golem', 0, 1, 100);
  check('boss spawns in phase 1', golem.boss && golem.phase === 1);
  golem.hp = Math.round(golem.maxHp * 0.6);
  step(s, 0.1);
  check('boss enters phase 2 under 2/3 hp', golem.phase === 2, 'phase=' + golem.phase);
  golem.hp = Math.round(golem.maxHp * 0.3);
  step(s, 0.1);
  check('boss enters phase 3 under 1/3 hp', golem.phase === 3 && golem.armor === 5);
}

// --- win, lose, restart ---------------------------------------------------------------
{
  const s = gameOn();
  s.wave = 11; s.lives = 17;
  pressStartWave(s);
  check('wave 12 begins', s.wave === 12 && s.phase === 'wave');
  s.spawnQueue = []; s.enemies = [];
  step(s, 0.1);
  check('clearing wave 12 wins', s.screen === 'victory');
  check('17 lives earns 3 stars', s.stars === 3, 'stars=' + s.stars);

  const s2 = gameOn();
  s2.lives = 1;
  pressStartWave(s2);
  const e = spawnEnemy(s2, 'raider', 0, 1, ROAD.total - 2);
  step(s2, 1);
  check('a leak at 1 life loses', s2.screen === 'defeat', 'screen=' + s2.screen + ' lives=' + s2.lives);
  toTitle(s2);
  check('toTitle resets to title', s2.screen === 'title');
  startRun(s2, 'normal');
  check('startRun restarts clean', s2.screen === 'game' && s2.wave === 0 && s2.lives === 20 && s2.eco.gold === 230);
}

// --- autopilot: a fixed shopping list must win Normal ----------------------------------
{
  const s = gameOn('normal', 99);
  // A lane-aware core: frost on the upper-lane shore slows the Leviathan's lane,
  // the Sun Beacon at (11,4) buffs the storm coil and the east bolt spire, and
  // every plot ends up holding something.
  const list = [
    ['bolt', 1, 3, 1], ['mortar', 6, 3, 1], ['storm', 3, 7, 1], ['frost', 7, 3, 1],
    ['storm', 7, 5, 1], ['bolt', 2, 5, 1], ['storm', 9, 5, 1], ['bolt', 13, 3, 1],
    ['aura', 11, 4, 1], ['mortar', 12, 7, 1], ['mortar', 12, 7, 2], ['storm', 3, 7, 2],
    ['bolt', 12, 5, 1], ['frost', 6, 7, 1], ['bolt', 8, 7, 1], ['storm', 3, 7, 3],
    ['bolt', 1, 3, 2], ['mortar', 6, 3, 2], ['frost', 7, 3, 2], ['bolt', 13, 3, 2],
    ['storm', 9, 5, 2], ['aura', 11, 4, 2],
    ['bolt', 1, 3, 3], ['mortar', 6, 3, 3], ['frost', 7, 3, 3], ['bolt', 13, 3, 3],
    ['storm', 9, 5, 3], ['aura', 11, 4, 3], ['mortar', 12, 7, 3],
    ['bolt', 2, 5, 2], ['storm', 7, 5, 2], ['bolt', 8, 7, 2], ['bolt', 12, 5, 2],
    ['frost', 6, 7, 2],
  ];
  let idx = 0, guard = 0;
  while (s.screen === 'game' && guard++ < 200000) {
    if (s.phase === 'build') {
      while (idx < list.length) {
        const [type, c, r, lvl] = list[idx];
        const p = plot(c, r);
        const held = plotTower(s, p);
        if (!held) {
          s.selectedType = type;
          if (tryBuild(s, p)) { idx++; continue; }
          break; // cannot afford this one yet — wait for more salvage
        }
        if (held.typeId !== type || held.level >= lvl) { idx++; continue; }
        if (tryUpgrade(s, held)) { idx++; continue; }
        break;
      }
      pressStartWave(s);
    }
    stepGame(s, 1 / 30);
  }
  check('autopilot wins Normal', s.screen === 'victory', 'screen=' + s.screen + ' wave=' + s.wave + ' lives=' + s.lives);
  console.log('  autopilot: screen=' + s.screen + ' lives=' + s.lives + ' kills=' + s.eco.kills + ' gold left=' + s.eco.gold + ' score=' + s.score);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);

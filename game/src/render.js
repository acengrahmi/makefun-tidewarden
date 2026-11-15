// render.js — everything TIDEWARDEN draws, in one place: the dusk bay with its
// cliffs, road, lanes and lighthouse-keep; the flood as it rises over the shore
// flats; the plots, towers and raiders; the weather of battle (bolts, arcs,
// shells, spray and floating gold); and the HUD and build panel. Screens (title,
// victory, defeat) are drawn by screens.js over the same bay. Pure canvas 2D,
// deterministic: the scenery is dealt from a fixed seed at load, and every
// jitter below is a hash of position, never a fresh random — a shot scene
// renders the same bytes every time.

import { VIEW, GRID, PALETTE as P, ROAD_PATH, LANES, PLOTS, LANE_ROWS, ROAD_CELLS, cellCenter, panelLayout } from './config.js';
import { TOWER_TYPES, towerStats, towerDormant } from './towers.js';
import { tideName, isHighTide } from './tide.js';
import { comboMultiplier } from './economy.js';
import { drawTitle, drawVictory, drawDefeat } from './screens.js';

// Scenery dealt once from a fixed seed: grass tufts, shore pebbles, cliff cracks.
const SCENERY = (() => {
  let a = 4242;
  const rnd = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
  const tufts = [], pebbles = [];
  for (let i = 0; i < 90; i++) tufts.push({ x: 16 + rnd() * 940, y: 76 + rnd() * 624, s: 0.6 + rnd() * 0.8 });
  for (let i = 0; i < 60; i++) pebbles.push({ x: 16 + rnd() * 940, y: 76 + rnd() * 624, r: 1 + rnd() * 2.4 });
  return { tufts, pebbles };
})();

function hashJitter(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function drawGame(ctx, state) {
  ctx.save();
  if (state.shake > 0.2) {
    const jx = (hashJitter(state.time * 60) - 0.5) * state.shake;
    const jy = (hashJitter(state.time * 60 + 9) - 0.5) * state.shake;
    ctx.translate(jx, jy);
  }
  drawBay(ctx, state);
  drawPlotsAndTowers(ctx, state);
  drawEnemies(ctx, state);
  drawProjectilesAndFx(ctx, state);
  ctx.restore();
  if (state.screen === 'game') drawHud(ctx, state);
  else if (state.screen === 'title') drawTitle(ctx, state);
  else if (state.screen === 'victory') drawVictory(ctx, state);
  else if (state.screen === 'defeat') drawDefeat(ctx, state);
}

// The bay itself: open water, the landmass, the stone road, the dredged lanes,
// the western cliffs, and the lighthouse-keep the raiders are coming for. The
// flood is drawn over the land: as state.tide.level rises, the shore flats and
// the low plots go under translucent water while the road causeway and the high
// rocks stay dry.
function drawBay(ctx, state) {
  const { ox, oy, cell, cols, rows } = GRID;
  // Open water everywhere the land is not.
  const sea = ctx.createLinearGradient(0, 0, 0, VIEW.h);
  sea.addColorStop(0, P.water); sea.addColorStop(1, P.waterDeep);
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  // Landmass: a soft-edged slab over the grid.
  ctx.fillStyle = P.sand;
  roundRect(ctx, ox - 8, oy - 6, cols * cell + 16, rows * cell + 12, 18); ctx.fill();
  ctx.fillStyle = P.grass;
  roundRect(ctx, ox - 8, oy - 6, cols * cell + 16, rows * cell * 0.52, 18); ctx.fill();
  // Cell shading: a checker of light so the grid reads without lines.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (LANE_ROWS.has(r) || ROAD_CELLS.has(c + ',' + r)) continue;
      if ((c + r) % 2 === 0) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      ctx.fillRect(ox + c * cell, oy + r * cell, cell, cell);
    }
  }
  for (const t of SCENERY.tufts) {
    ctx.strokeStyle = 'rgba(40,70,35,0.5)';
    ctx.beginPath();
    ctx.moveTo(t.x, t.y); ctx.lineTo(t.x - 2, t.y - 5 * t.s);
    ctx.moveTo(t.x + 2, t.y); ctx.lineTo(t.x + 3, t.y - 6 * t.s);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(90,70,40,0.35)';
  for (const p of SCENERY.pebbles) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
  // The stone road: a wide stroked polyline with a darker rim.
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = P.stoneDark; ctx.lineWidth = 46;
  strokePath(ctx, ROAD_PATH);
  ctx.strokeStyle = P.stone; ctx.lineWidth = 38;
  strokePath(ctx, ROAD_PATH);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < ROAD_PATH.length - 1; i++) {
    const a = ROAD_PATH[i], b = ROAD_PATH[i + 1];
    const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 34);
    for (let k = 1; k < n; k++) {
      ctx.beginPath();
      ctx.arc(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n, 2.2, 0, 7);
      ctx.fill();
    }
  }
  // The lanes: deeper water with a current shimmer that runs with time.
  for (const lane of LANES) {
    const y = GRID.oy + lane.row * GRID.cell;
    ctx.fillStyle = P.waterDeep;
    ctx.fillRect(0, y + 3, VIEW.panelX, GRID.cell - 6);
    ctx.strokeStyle = 'rgba(191,232,239,0.35)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 5; k++) {
      const x = ((state.time * 26 + k * 210 + lane.row * 90) % (VIEW.panelX + 120)) - 60;
      ctx.beginPath();
      ctx.moveTo(x, y + 18 + (k % 2) * 26);
      ctx.quadraticCurveTo(x + 16, y + 12 + (k % 2) * 26, x + 34, y + 18 + (k % 2) * 26);
      ctx.stroke();
    }
  }
  drawFlood(ctx, state);
  drawCliffsAndKeep(ctx, state);
}

// The flood: translucent water climbing over the low ground. A cell's wetness
// threshold decides when it submerges — lane rows are already sea; low plots go
// first, then the southern flats; road and high rocks never do.
function drawFlood(ctx, state) {
  const level = state.tide.level;
  if (level <= 0.02) return;
  const { ox, oy, cell, cols, rows } = GRID;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (LANE_ROWS.has(r) || ROAD_CELLS.has(c + ',' + r)) continue;
      const plot = PLOTS.find((p) => p.c === c && p.r === r);
      if (plot && plot.high) continue;
      const threshold = plot ? 0.18 : r >= 5 ? 0.42 : 0.62;
      const depth = Math.min(1, Math.max(0, (level - threshold) / 0.35));
      if (depth <= 0) continue;
      ctx.fillStyle = 'rgba(20,96,124,' + (0.34 + depth * 0.4).toFixed(3) + ')';
      ctx.fillRect(ox + c * cell, oy + r * cell, cell, cell);
      if (depth > 0.4) {
        ctx.strokeStyle = 'rgba(191,232,239,0.25)';
        ctx.beginPath();
        const wy = oy + r * cell + 12 + hashJitter(c * 7 + r * 13) * 30;
        ctx.moveTo(ox + c * cell + 8, wy);
        ctx.quadraticCurveTo(ox + c * cell + 32, wy - 4, ox + c * cell + 56, wy);
        ctx.stroke();
      }
    }
  }
}

function drawCliffsAndKeep(ctx, state) {
  // Western cliffs the road climbs down from.
  ctx.fillStyle = P.rockDark;
  ctx.beginPath();
  ctx.moveTo(0, 300); ctx.lineTo(26, 316); ctx.lineTo(18, 420); ctx.lineTo(30, 470); ctx.lineTo(0, 486);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = P.rock;
  ctx.beginPath();
  ctx.moveTo(0, 316); ctx.lineTo(16, 330); ctx.lineTo(10, 420); ctx.lineTo(20, 458); ctx.lineTo(0, 470);
  ctx.closePath(); ctx.fill();
  // The lighthouse-keep at the road's end: stone tower, gold lamp, and a beacon
  // glow that breathes with time. This is what every raider is walking toward.
  const kx = 952, ky = cellCenter(0, 6).y;
  ctx.fillStyle = 'rgba(232,182,76,0.10)';
  ctx.beginPath(); ctx.arc(kx + 8, ky - 58, 44 + Math.sin(state.time * 2) * 5, 0, 7); ctx.fill();
  ctx.fillStyle = P.stoneDark;
  roundRect(ctx, kx - 14, ky - 44, 30, 92, 5); ctx.fill();
  ctx.fillStyle = P.stone;
  roundRect(ctx, kx - 11, ky - 44, 24, 92, 4); ctx.fill();
  ctx.fillStyle = '#3a332a';
  roundRect(ctx, kx - 16, ky - 56, 34, 14, 4); ctx.fill();
  ctx.fillStyle = P.goldBright;
  roundRect(ctx, kx - 6, ky - 52, 14, 8, 2); ctx.fill();
  ctx.fillStyle = '#3a332a';
  roundRect(ctx, kx - 3, ky + 18, 10, 30, 4); ctx.fill();
}

function strokePath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// The plots: stone rings on the shore — high plots raised on rock mounds, low
// plots flat on the sand with a warning tick of blue. A tower stands on its plot;
// a tower on a flooded plot is drawn again under the water's tint, bubbles rising,
// plainly asleep.
function drawPlotsAndTowers(ctx, state) {
  for (const plot of PLOTS) {
    const { x, y } = cellCenter(plot.c, plot.r);
    const tower = state.towers.find((t) => t.plot === plot);
    if (plot.high) {
      ctx.fillStyle = P.rockDark;
      ctx.beginPath(); ctx.ellipse(x, y + 8, 27, 17, 0, 0, 7); ctx.fill();
      ctx.fillStyle = P.rock;
      ctx.beginPath(); ctx.ellipse(x, y + 4, 24, 14, 0, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = tower ? P.gold : 'rgba(240,230,200,0.75)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 21, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, 25, 0, 7); ctx.stroke();
    if (!plot.high && !tower) {
      // A low plot carries a little blue tide-mark: it floods at high tide.
      ctx.fillStyle = P.waterLight;
      ctx.beginPath(); ctx.arc(x, y + 13, 3.4, 0, 7); ctx.fill();
    }
    if (state.selectedPlot === plot) {
      ctx.strokeStyle = P.goldBright; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 29, 0, 7); ctx.stroke();
    }
    if (tower) drawTower(ctx, state, tower);
  }
  // The hovered plot previews the selected tower's reach.
  if (state.screen === 'game' && state.hoverCell) {
    const plot = PLOTS.find((p) => p.c === state.hoverCell.c && p.r === state.hoverCell.r);
    if (plot) {
      const { x, y } = cellCenter(plot.c, plot.r);
      const held = state.towers.find((t) => t.plot === plot);
      const stats = held ? towerStats(held) : TOWER_TYPES.find((t) => t.id === state.selectedType).levels[0];
      ctx.fillStyle = 'rgba(255,217,119,0.10)';
      ctx.strokeStyle = 'rgba(255,217,119,0.55)';
      ctx.beginPath(); ctx.arc(x, y, stats.range, 0, 7); ctx.fill(); ctx.stroke();
    }
  }
}

const TOWER_COLORS = { bolt: '#ffd977', frost: '#a8e6f0', mortar: '#e4572e', storm: '#c9a7ff', aura: '#ffb347' };

function drawTower(ctx, state, tower) {
  const { x, y } = tower;
  const dormant = towerDormant(state, tower);
  ctx.save();
  ctx.translate(x, y);
  // Stone base every tower shares.
  ctx.fillStyle = P.stoneDark;
  ctx.beginPath(); ctx.ellipse(0, 10, 17, 8, 0, 0, 7); ctx.fill();
  ctx.fillStyle = P.stone;
  roundRect(ctx, -11, -2, 22, 13, 3); ctx.fill();
  const color = TOWER_COLORS[tower.typeId];
  if (tower.typeId === 'bolt') {
    ctx.fillStyle = '#8a7f6a';
    ctx.beginPath(); ctx.moveTo(-8, -2); ctx.lineTo(0, -26); ctx.lineTo(8, -2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, -26, 4.6, 0, 7); ctx.fill();
  } else if (tower.typeId === 'frost') {
    ctx.fillStyle = color;
    for (const [dx, h] of [[-7, 15], [0, 23], [7, 17]]) {
      ctx.beginPath(); ctx.moveTo(dx - 4, -2); ctx.lineTo(dx, -2 - h); ctx.lineTo(dx + 4, -2); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.arc(0, -24, 2.6, 0, 7); ctx.fill();
  } else if (tower.typeId === 'mortar') {
    ctx.fillStyle = '#5d564d';
    roundRect(ctx, -10, -10, 20, 9, 3); ctx.fill();
    ctx.save();
    ctx.rotate(tower.angle + Math.PI / 2 - 0.5);
    ctx.fillStyle = '#3a332a';
    roundRect(ctx, -4, -24, 8, 18, 3); ctx.fill();
    ctx.restore();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, -6, 3, 0, 7); ctx.fill();
  } else if (tower.typeId === 'storm') {
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.ellipse(0, -6 - i * 6, 9 - i * 1.6, 4.4, 0, 0, 7); ctx.stroke();
    }
    ctx.fillStyle = '#efe6ff';
    ctx.beginPath(); ctx.arc(0, -26, 4.4 + Math.sin(state.time * 5 + x) * 0.7, 0, 7); ctx.fill();
  } else if (tower.typeId === 'aura') {
    ctx.fillStyle = '#8a7f6a';
    roundRect(ctx, -5, -22, 10, 21, 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,179,71,0.22)';
    ctx.beginPath(); ctx.arc(0, -26, 13 + Math.sin(state.time * 3 + y) * 2, 0, 7); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, -26, 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff3cf';
    ctx.beginPath(); ctx.arc(0, -26, 2.6, 0, 7); ctx.fill();
  }
  // Level pips: one gold stud a level, along the base.
  ctx.fillStyle = P.gold;
  for (let i = 0; i < tower.level; i++) {
    ctx.beginPath(); ctx.arc(-8 + i * 8, 14, 2.4, 0, 7); ctx.fill();
  }
  ctx.restore();
  if (dormant) {
    // Under the water: a blue veil over the tower, bubbles, and a sleepy Z.
    ctx.fillStyle = 'rgba(20,96,124,0.45)';
    ctx.beginPath(); ctx.arc(x, y - 6, 24, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(191,232,239,0.8)';
    for (let i = 0; i < 3; i++) {
      const bx = x - 10 + i * 9, by = y - 16 - ((state.time * 14 + i * 7) % 16);
      ctx.beginPath(); ctx.arc(bx, by, 2.2, 0, 7); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(230,246,250,0.9)';
    ctx.font = '700 13px Georgia, serif';
    ctx.fillText('z', x + 12, y - 22 - Math.sin(state.time * 2) * 2);
    ctx.font = '700 10px Georgia, serif';
    ctx.fillText('z', x + 19, y - 30 - Math.sin(state.time * 2) * 2);
  }
}

// The raiders: cloaked walkers on the road, sailed hulls on the lanes, and the
// three great bosses — each kind its own silhouette and colours, a chill sheen
// while slowed, and a health pip-bar overhead once hurt. The boss of the moment
// also gets the wide bar in the HUD (drawHud).
const ENEMY_COLORS = {
  raider: '#b0413e', runner: '#e07b39', brute: '#7a4a2b', aegis: '#8d99ae',
  blinker: '#7d5ba6', mender: '#4e9b47', skiff: '#e8e3d3', raft: '#a9743f',
  golem: '#6f675a', barge: '#5d4037', leviathan: '#274e5c',
};

function drawEnemies(ctx, state) {
  const sorted = [...state.enemies].sort((a, b) => a.y - b.y);
  for (const e of sorted) {
    const bob = Math.sin(state.time * 6 + e.wobble) * 1.6;
    ctx.save();
    ctx.translate(e.x, e.y + (e.def.route === 'water' ? bob * 0.5 : bob));
    const color = ENEMY_COLORS[e.kind];
    if (e.def.route === 'water') drawBoat(ctx, e, color, state);
    else drawWalker(ctx, e, color, state);
    ctx.restore();
    if (e.slowTimer > 0) {
      ctx.fillStyle = 'rgba(168,230,240,0.35)';
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 3, 0, 7); ctx.fill();
    }
    if (e.hp < e.maxHp && !e.boss) {
      const w = Math.max(26, e.radius * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 13, w, 4.6);
      ctx.fillStyle = e.hp / e.maxHp > 0.4 ? '#7fc24e' : '#e4572e';
      ctx.fillRect(e.x - w / 2 + 0.7, e.y - e.radius - 12.3, (w - 1.4) * Math.max(0, e.hp / e.maxHp), 3.2);
    }
  }
}

function drawWalker(ctx, e, color, state) {
  const s = e.radius / 13;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 10 * s, 11 * s, 4 * s, 0, 0, 7); ctx.fill();
  if (e.kind === 'golem') {
    ctx.fillStyle = color;
    roundRect(ctx, -20, -24, 40, 36, 10); ctx.fill();
    ctx.fillStyle = P.rockDark;
    roundRect(ctx, -13, -38, 26, 18, 7); ctx.fill();
    ctx.fillStyle = P.waterLight;
    ctx.beginPath(); ctx.arc(-5, -29, 2.6, 0, 7); ctx.arc(6, -29, 2.6, 0, 7); ctx.fill();
    ctx.strokeStyle = P.rockDark; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-20, -8); ctx.lineTo(-30, 8); ctx.moveTo(20, -8); ctx.lineTo(30, 8); ctx.stroke();
    return;
  }
  // A hooded cloak, a face in shadow, and the kind's tell: the Aegis's plate,
  // the Blinker's shimmer, the Mender's green cross, the Brute's shoulders.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -13 * s);
  ctx.quadraticCurveTo(10 * s, -10 * s, 8 * s, 9 * s);
  ctx.lineTo(-8 * s, 9 * s);
  ctx.quadraticCurveTo(-10 * s, -10 * s, 0, -13 * s);
  ctx.fill();
  ctx.fillStyle = '#2b2118';
  ctx.beginPath(); ctx.arc(0, -7 * s, 4.6 * s, 0, 7); ctx.fill();
  ctx.fillStyle = '#f3d9a4';
  ctx.beginPath(); ctx.arc(-1.6 * s, -7 * s, 1 * s, 0, 7); ctx.arc(1.8 * s, -7 * s, 1 * s, 0, 7); ctx.fill();
  if (e.kind === 'aegis') {
    ctx.fillStyle = '#c7cede';
    roundRect(ctx, 3 * s, -4 * s, 8 * s, 12 * s, 2); ctx.fill();
    ctx.strokeStyle = '#5a6a86'; ctx.lineWidth = 1.4;
    roundRect(ctx, 3 * s, -4 * s, 8 * s, 12 * s, 2); ctx.stroke();
  } else if (e.kind === 'brute') {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(-10 * s, -8 * s, 5 * s, 0, 7); ctx.arc(10 * s, -8 * s, 5 * s, 0, 7); ctx.fill();
  } else if (e.kind === 'blinker') {
    ctx.strokeStyle = 'rgba(201,167,255,0.8)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, -2 * s, 13 * s + Math.sin(state.time * 8) * 2, 0, 7); ctx.stroke();
  } else if (e.kind === 'mender') {
    ctx.fillStyle = '#e8f5e0';
    ctx.fillRect(-1.4 * s, -3 * s, 2.8 * s, 9 * s);
    ctx.fillRect(-4.4 * s, 0 * s, 8.8 * s, 2.8 * s);
  } else if (e.kind === 'runner') {
    ctx.strokeStyle = color; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(-6 * s, 2 * s); ctx.lineTo(-14 * s, -2 * s); ctx.stroke();
  }
}

function drawBoat(ctx, e, color, state) {
  const s = e.radius / 13;
  // A wake that trails the hull.
  ctx.strokeStyle = 'rgba(191,232,239,0.5)'; ctx.lineWidth = 2;
  for (const off of [-6, 0, 6]) {
    ctx.beginPath();
    ctx.moveTo(-14 * s, off * s * 0.7);
    ctx.quadraticCurveTo(-26 * s, off * s, -38 * s - Math.sin(state.time * 7 + off) * 3, off * s * 1.4);
    ctx.stroke();
  }
  if (e.kind === 'leviathan') {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, 0, 46, 17, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#3d6a7a';
    for (const dx of [-26, 0, 26]) {
      ctx.beginPath(); ctx.moveTo(dx - 8, -8); ctx.lineTo(dx, -30); ctx.lineTo(dx + 8, -8); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#ffd977';
    ctx.beginPath(); ctx.arc(34, -6, 3.4, 0, 7); ctx.fill();
    return;
  }
  if (e.kind === 'barge') {
    ctx.fillStyle = '#4a3226';
    roundRect(ctx, -38, -8, 76, 17, 6); ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, -30, -16, 46, 10, 3); ctx.fill();
    ctx.strokeStyle = '#2b2118'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(16, -6); ctx.lineTo(16, -34); ctx.stroke();
    ctx.fillStyle = '#e4572e';
    ctx.beginPath(); ctx.moveTo(16, -34); ctx.lineTo(34, -24); ctx.lineTo(16, -24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.goldBright;
    ctx.beginPath(); ctx.arc(-22, -20, 3.4, 0, 7); ctx.fill();
    return;
  }
  // Hull, then a sail for the skiff or a cargo of barrels for the raft.
  ctx.fillStyle = e.kind === 'raft' ? '#8a5a30' : '#6d4c2f';
  ctx.beginPath();
  ctx.moveTo(-15 * s, -3 * s); ctx.lineTo(15 * s, -3 * s); ctx.lineTo(10 * s, 6 * s); ctx.lineTo(-10 * s, 6 * s);
  ctx.closePath(); ctx.fill();
  if (e.kind === 'skiff') {
    ctx.strokeStyle = '#2b2118'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -3 * s); ctx.lineTo(0, -24 * s); ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, -24 * s); ctx.lineTo(0, -5 * s); ctx.lineTo(13 * s, -5 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.gold;
    ctx.beginPath(); ctx.moveTo(0, -24 * s); ctx.lineTo(0, -5 * s); ctx.lineTo(-9 * s, -5 * s); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = '#7a4a2b';
    for (const dx of [-8, 1, 10]) {
      ctx.beginPath(); ctx.arc(dx * s, -6 * s, 4.6 * s, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = '#5d3a1f'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-14 * s, 1); ctx.lineTo(14 * s, 1); ctx.stroke();
  }
}

// Shells in flight and the weather of battle: every effect the simulation
// queued, drawn by kind with its life as alpha.
function drawProjectilesAndFx(ctx, state) {
  for (const p of state.projectiles) {
    ctx.fillStyle = '#2b2118';
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(228,87,46,0.7)';
    ctx.beginPath(); ctx.arc(p.x - 2, p.y - 2, 2, 0, 7); ctx.fill();
  }
  for (const f of state.fx) {
    const k = Math.max(0, f.ttl / f.max);
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 1.6);
    if (f.kind === 'bolt' || f.kind === 'zap' || f.kind === 'arc') {
      ctx.strokeStyle = f.kind === 'zap' ? '#ffe9b0' : f.kind === 'arc' ? '#c9a7ff' : '#ffd977';
      ctx.lineWidth = f.kind === 'arc' ? 2.6 : 2;
      ctx.beginPath();
      ctx.moveTo(f.x1, f.y1);
      const segs = 4;
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        const mx = f.x1 + (f.x2 - f.x1) * t, my = f.y1 + (f.y2 - f.y1) * t;
        ctx.lineTo(mx + (hashJitter(f.x1 + i * 13 + f.ttl * 90) - 0.5) * 14, my + (hashJitter(f.y1 + i * 29) - 0.5) * 14);
      }
      ctx.lineTo(f.x2, f.y2);
      ctx.stroke();
    } else if (f.kind === 'chill') {
      ctx.fillStyle = 'rgba(168,230,240,0.30)';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.4 - k * 0.4), 0, 7); ctx.fill();
    } else if (f.kind === 'boom') {
      ctx.fillStyle = 'rgba(228,87,46,' + (0.35 * k) + ')';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - k * 0.5), 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,217,119,0.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.1 - k * 0.6), 0, 7); ctx.stroke();
    } else if (f.kind === 'spark') {
      ctx.strokeStyle = '#ffe9b0'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(f.x - 5, f.y); ctx.lineTo(f.x + 5, f.y);
      ctx.moveTo(f.x, f.y - 5); ctx.lineTo(f.x, f.y + 5);
      ctx.stroke();
    } else if (f.kind === 'burst') {
      ctx.strokeStyle = f.boat ? '#bfe8ef' : '#d9c9a8'; ctx.lineWidth = 2.2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + f.x * 0.01;
        const r0 = 4, r1 = 8 + (1 - k) * 16;
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0);
        ctx.lineTo(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1);
        ctx.stroke();
      }
    } else if (f.kind === 'gold') {
      ctx.font = '700 14px Georgia, serif';
      ctx.fillStyle = '#ffd977';
      ctx.fillText(f.text, f.x - 8, f.y - (1 - k) * 22);
    } else if (f.kind === 'leak') {
      ctx.font = '800 20px Georgia, serif';
      ctx.fillStyle = '#ff7a52';
      ctx.fillText(f.text + ' ♥', f.x - 16, f.y - 30 - (1 - k) * 14);
    } else if (f.kind === 'buildring') {
      ctx.strokeStyle = '#ffd977'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(f.x, f.y, 8 + (1 - k) * 22, 0, 7); ctx.stroke();
    } else if (f.kind === 'muzzle') {
      ctx.fillStyle = '#ffd977';
      ctx.beginPath(); ctx.arc(f.x, f.y, 7 * k + 2, 0, 7); ctx.fill();
    } else if (f.kind === 'blink') {
      ctx.strokeStyle = '#c9a7ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, 16 * (1 - k) + 4, 0, 7); ctx.stroke();
    } else if (f.kind === 'mend') {
      ctx.fillStyle = '#9fe08a';
      ctx.fillRect(f.x - 1.6, f.y - 16, 3.2, 10);
      ctx.fillRect(f.x - 5, f.y - 12.6, 10, 3.2);
    } else if (f.kind === 'banner') {
      ctx.font = '800 25px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(10,30,40,0.72)';
      const w = ctx.measureText(f.text).width + 44;
      roundRect(ctx, 492 - w / 2, 118, w, 44, 10); ctx.fill();
      ctx.fillStyle = '#ffd977';
      ctx.fillText(f.text, 492, 149);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }
}

// The HUD and the build panel: the purse, the keep's lives, the wave and the
// score across the top; the tide gauge, the five tower cards, the selection's
// details with its Upgrade and Sell buttons, and the wave controls down the
// right side — every rect from config's panelLayout, the same rects input.js
// hit-tests.
function drawHud(ctx, state) {
  const L = panelLayout();
  // Panel ground.
  ctx.fillStyle = P.panel;
  ctx.fillRect(VIEW.panelX, 0, VIEW.panelW, VIEW.h);
  ctx.fillStyle = P.panelEdge;
  ctx.fillRect(VIEW.panelX, 0, 2, VIEW.h);
  // Top bar.
  ctx.fillStyle = 'rgba(8,24,32,0.92)';
  ctx.fillRect(0, 0, VIEW.w, VIEW.hudH);
  ctx.fillStyle = P.gold;
  ctx.font = '800 19px Georgia, serif';
  ctx.fillText('TIDEWARDEN', 16, 35);
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillStyle = P.parchment;
  ctx.beginPath(); ctx.arc(196, 27, 8, 0, 7); ctx.fillStyle = P.gold; ctx.fill();
  ctx.fillStyle = '#10222c'; ctx.font = '800 11px system-ui, sans-serif'; ctx.fillText('◉', 192.5, 31);
  ctx.font = '700 19px system-ui, sans-serif'; ctx.fillStyle = P.parchment;
  ctx.fillText(String(state.eco.gold), 212, 35);
  ctx.fillStyle = P.heart; ctx.font = '19px system-ui, sans-serif';
  ctx.fillText('♥', 316, 35);
  ctx.fillStyle = P.parchment; ctx.font = '700 19px system-ui, sans-serif';
  ctx.fillText(String(state.lives), 340, 35);
  ctx.fillText('WAVE ' + Math.max(1, state.wave + (state.phase === 'build' ? 1 : 0)) + ' / 12', 430, 35);
  ctx.fillStyle = P.gold;
  ctx.fillText('SCORE ' + state.score, 620, 35);
  if (state.eco.combo >= 3) {
    ctx.fillStyle = '#ffb347';
    ctx.fillText('STREAK ×' + comboMultiplier(state.eco).toFixed(2), 800, 35);
  }
  ctx.fillStyle = 'rgba(243,229,195,0.6)'; ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText(state.difficulty.name.toUpperCase() + ' TIDE', 876, 33);
  drawBossBar(ctx, state);
  drawGauge(ctx, state, L);
  drawCards(ctx, state, L);
  drawInfo(ctx, state, L);
  drawControls(ctx, state, L);
}

function drawBossBar(ctx, state) {
  const boss = state.enemies.find((e) => e.boss);
  if (!boss) return;
  const w = 560, x = (VIEW.panelX - w) / 2, y = 62;
  ctx.fillStyle = 'rgba(8,24,32,0.85)';
  roundRect(ctx, x, y, w, 34, 8); ctx.fill();
  ctx.font = '800 14px Georgia, serif'; ctx.fillStyle = '#ffb59d';
  ctx.fillText(boss.def.name.toUpperCase(), x + 14, y + 21);
  ctx.fillStyle = P.gold;
  ctx.fillText('PHASE ' + boss.phase, x + w - 86, y + 21);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, x + 170, y + 12, w - 280, 10, 5); ctx.fill();
  ctx.fillStyle = '#e4572e';
  roundRect(ctx, x + 170, y + 12, Math.max(0, (w - 280) * boss.hp / boss.maxHp), 10, 5); ctx.fill();
}

function drawGauge(ctx, state, L) {
  const g = L.gauge;
  const nextWave = state.phase === 'build' ? state.wave + 1 : state.wave;
  const high = state.tide.label === 'high';
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(243,229,195,0.65)';
  ctx.fillText('TIDE — WAVE ' + nextWave, g.x, g.y + 14);
  ctx.font = '800 17px Georgia, serif';
  ctx.fillStyle = high ? '#7fd4ea' : P.goldBright;
  ctx.fillText(tideName(state.tide), g.x + 118, g.y + 15);
  // The gauge: a trough that fills as the water rises, with the flood line marked.
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  roundRect(ctx, g.x, g.y + 24, g.w, 14, 7); ctx.fill();
  ctx.fillStyle = P.waterLight;
  roundRect(ctx, g.x, g.y + 24, Math.max(10, g.w * state.tide.level), 14, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.moveTo(g.x + g.w / 2, g.y + 21); ctx.lineTo(g.x + g.w / 2, g.y + 41); ctx.stroke();
  ctx.font = '600 11.5px system-ui, sans-serif';
  ctx.fillStyle = high ? '#ffb59d' : 'rgba(243,229,195,0.6)';
  ctx.fillText(high ? 'Low plots flood · the lanes open to boats' : 'All plots dry · raiders walk the road', g.x, g.y + 50);
}

function statLine(type, s) {
  if (type.id === 'frost') return 'DMG ' + s.damage + ' · SLOW ' + Math.round(s.slowPct * 100) + '% · RNG ' + s.range;
  if (type.id === 'mortar') return 'DMG ' + s.damage + ' · SPLASH ' + s.splash + ' · RNG ' + s.range;
  if (type.id === 'storm') return 'DMG ' + s.damage + ' · CHAIN ' + s.chain + ' · RNG ' + s.range;
  if (type.id === 'aura') return 'BUFF +' + Math.round(s.buffDmg * 100) + '% DMG · RNG ' + s.range;
  return 'DMG ' + s.damage + ' · RNG ' + s.range + ' · ' + s.rate.toFixed(1) + '/s';
}

function drawCards(ctx, state, L) {
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(243,229,195,0.65)';
  ctx.fillText('BUILD — keys 1–5, then click a plot', L.cards[0].x, L.cards[0].y - 3);
  TOWER_TYPES.forEach((type, i) => {
    const r = L.cards[i];
    const afford = state.eco.gold >= type.levels[0].cost;
    ctx.fillStyle = state.selectedType === type.id ? 'rgba(232,182,76,0.16)' : 'rgba(255,255,255,0.05)';
    roundRect(ctx, r.x, r.y, r.w, r.h, 8); ctx.fill();
    ctx.strokeStyle = state.selectedType === type.id ? P.gold : 'rgba(255,255,255,0.14)';
    ctx.lineWidth = state.selectedType === type.id ? 2.4 : 1.2;
    roundRect(ctx, r.x, r.y, r.w, r.h, 8); ctx.stroke();
    ctx.fillStyle = TOWER_COLORS[type.id];
    ctx.beginPath(); ctx.arc(r.x + 26, r.y + 32, 15, 0, 7); ctx.fill();
    ctx.fillStyle = '#10222c'; ctx.font = '800 15px Georgia, serif';
    ctx.fillText(type.glyph, r.x + 21, r.y + 38);
    ctx.font = '700 15.5px system-ui, sans-serif';
    ctx.fillStyle = afford ? P.parchment : 'rgba(243,229,195,0.4)';
    ctx.fillText(type.name, r.x + 50, r.y + 25);
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = afford ? P.gold : 'rgba(232,182,76,0.4)';
    ctx.fillText('◉ ' + type.levels[0].cost, r.x + 226, r.y + 25);
    ctx.fillStyle = 'rgba(243,229,195,0.55)';
    ctx.fillText(statLine(type, type.levels[0]), r.x + 50, r.y + 46);
    ctx.fillStyle = 'rgba(243,229,195,0.4)';
    ctx.fillText(String(i + 1), r.x + 8, r.y + 16);
  });
}

function drawInfo(ctx, state, L) {
  const b = L.info;
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  roundRect(ctx, b.x, b.y, b.w, b.h, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, b.x, b.y, b.w, b.h, 8); ctx.stroke();
  ctx.font = '600 12.5px system-ui, sans-serif';
  const tw = state.selectedTower;
  if (tw) {
    const type = TOWER_TYPES.find((t) => t.id === tw.typeId);
    const s = towerStats(tw);
    ctx.fillStyle = P.parchment; ctx.font = '800 15px system-ui, sans-serif';
    ctx.fillText(type.name + ' · Lv ' + tw.level, b.x + 12, b.y + 24);
    ctx.font = '600 12.5px system-ui, sans-serif'; ctx.fillStyle = 'rgba(243,229,195,0.75)';
    ctx.fillText(statLine(type, s), b.x + 12, b.y + 44);
    ctx.fillText('Kills ' + tw.kills + ' · Invested ◉' + tw.invested + (towerDormant(state, tw) ? ' · FLOODED — dormant' : ''), b.x + 12, b.y + 60);
    const up = tw.level >= 3 ? null : type.levels[tw.level].cost;
    ctx.fillStyle = up !== null && state.eco.gold >= up ? P.gold : 'rgba(255,255,255,0.14)';
    roundRect(ctx, L.upgradeBtn.x, L.upgradeBtn.y, L.upgradeBtn.w, L.upgradeBtn.h, 7); ctx.fill();
    ctx.fillStyle = up !== null && state.eco.gold >= up ? '#10222c' : 'rgba(243,229,195,0.5)';
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.fillText(up === null ? 'MAX LEVEL' : 'UPGRADE ◉' + up, L.upgradeBtn.x + 12, L.upgradeBtn.y + 24);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, L.sellBtn.x, L.sellBtn.y, L.sellBtn.w, L.sellBtn.h, 7); ctx.fill();
    ctx.fillStyle = P.parchment;
    ctx.fillText('SELL +◉' + Math.floor(tw.invested * 0.7), L.sellBtn.x + 12, L.sellBtn.y + 24);
    return;
  }
  ctx.fillStyle = 'rgba(243,229,195,0.8)';
  if (state.selectedPlot) {
    ctx.font = '800 14px system-ui, sans-serif';
    ctx.fillText(state.selectedPlot.high ? 'HIGH PLOT — never floods' : 'LOW PLOT — floods at high tide', b.x + 12, b.y + 24);
    ctx.font = '600 12.5px system-ui, sans-serif'; ctx.fillStyle = 'rgba(243,229,195,0.65)';
    ctx.fillText('Click again to build the picked tower.', b.x + 12, b.y + 46);
  } else if (state.lastSettle && state.phase === 'build') {
    const s = state.lastSettle;
    ctx.font = '800 14px system-ui, sans-serif';
    ctx.fillText('Wave ' + state.wave + ' weathered', b.x + 12, b.y + 24);
    ctx.font = '600 12.5px system-ui, sans-serif'; ctx.fillStyle = 'rgba(243,229,195,0.65)';
    ctx.fillText('Bonus ◉' + s.bonus + ' · Interest ◉' + s.interest + (s.flawless ? ' · Flawless ◉' + s.flawless : ''), b.x + 12, b.y + 46);
    ctx.fillText('Spend it, or hoard it and earn interest.', b.x + 12, b.y + 64);
  } else {
    ctx.fillText('Pick a tower, click a ring to build.', b.x + 12, b.y + 24);
    ctx.fillStyle = 'rgba(243,229,195,0.65)';
    ctx.fillText('High rings never flood. Low rings drown', b.x + 12, b.y + 44);
    ctx.fillText('at high tide — their towers sleep.', b.x + 12, b.y + 60);
    ctx.fillText('Space: wave · P pause · F speed · M mute', b.x + 12, b.y + 82);
  }
}

function drawControls(ctx, state, L) {
  const inWave = state.phase === 'wave';
  ctx.fillStyle = inWave ? 'rgba(255,255,255,0.10)' : P.gold;
  roundRect(ctx, L.startBtn.x, L.startBtn.y, L.startBtn.w, L.startBtn.h, 9); ctx.fill();
  ctx.font = '800 15px system-ui, sans-serif';
  ctx.fillStyle = inWave ? 'rgba(243,229,195,0.55)' : '#10222c';
  const label = inWave
    ? 'WAVE ' + state.wave + ' — ' + (state.enemies.length + state.spawnQueue.length) + ' left'
    : state.wave >= 12 ? 'ALL WAVES DONE' : 'START WAVE ' + (state.wave + 1);
  ctx.fillText(label, L.startBtn.x + 12, L.startBtn.y + 31);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  roundRect(ctx, L.pauseBtn.x, L.pauseBtn.y, L.pauseBtn.w, L.pauseBtn.h, 9); ctx.fill();
  roundRect(ctx, L.speedBtn.x, L.speedBtn.y, L.speedBtn.w, L.speedBtn.h, 9); ctx.fill();
  ctx.fillStyle = P.parchment; ctx.font = '800 16px system-ui, sans-serif';
  ctx.fillText(state.paused ? '▶' : '❚❚', L.pauseBtn.x + 15, L.pauseBtn.y + 32);
  ctx.fillText(state.speed + '×', L.speedBtn.x + 14, L.speedBtn.y + 32);
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(243,229,195,0.45)';
  ctx.fillText(state.audio && state.audio.muted ? 'Sound off (M)' : 'Sound on (M)', L.startBtn.x, L.startBtn.y + 68);
}




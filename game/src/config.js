// config.js — TIDEWARDEN's shared facts: the view, the bay's grid, the road and the water
// lanes, the fourteen build plots, the palette, the difficulties, the panel layout every
// other file draws and hit-tests against, and the seeded random generator that keeps a
// run (and every screenshot) reproducible.

export const VIEW = { w: 1280, h: 720, hudH: 54, panelX: 984, panelW: 296 };

// The bay is a 15 x 10 grid of 64 px cells under the HUD bar.
export const GRID = { ox: 12, oy: 66, cell: 64, cols: 15, rows: 10 };

export function cellCenter(c, r) {
  return { x: GRID.ox + c * GRID.cell + GRID.cell / 2, y: GRID.oy + r * GRID.cell + GRID.cell / 2 };
}

export function cellAtPixel(x, y) {
  const c = Math.floor((x - GRID.ox) / GRID.cell);
  const r = Math.floor((y - GRID.oy) / GRID.cell);
  if (c < 0 || r < 0 || c >= GRID.cols || r >= GRID.rows) return null;
  return { c, r };
}

// The stone road the walkers march: a polyline through cell centres, in from the west
// cliffs, out to the lighthouse-keep at the east edge.
export const ROAD_CELLS_PATH = [[-1, 4], [5, 4], [5, 2], [10, 2], [10, 6], [16, 6]];
export const ROAD_PATH = ROAD_CELLS_PATH.map(([c, r]) => cellCenter(c, r));

// Every cell the road occupies (drawn as stone, never buildable, never flooded).
export const ROAD_CELLS = (() => {
  const set = new Set();
  for (let i = 0; i + 1 < ROAD_CELLS_PATH.length; i++) {
    let [c, r] = ROAD_CELLS_PATH[i];
    const [tc, tr] = ROAD_CELLS_PATH[i + 1];
    const dc = Math.sign(tc - c), dr = Math.sign(tr - r);
    set.add(c + ',' + r);
    while (c !== tc || r !== tr) { c += dc; r += dr; set.add(c + ',' + r); }
  }
  return set;
})();

// The two water lanes: dredged channels across rows 1 and 8. Boats sail them at high tide.
export const LANES = [1, 8].map((row) => ({
  row,
  y: cellCenter(0, row).y,
  path: [cellCenter(-1, row), cellCenter(16, row)],
}));
export const LANE_ROWS = new Set(LANES.map((l) => l.row));

// The fourteen build plots. High plots stand on rock and never flood; low plots sit on the
// shore flat and go under at high tide, silencing any tower built on them.
export const PLOTS = [
  { c: 1, r: 3, high: true }, { c: 6, r: 3, high: true }, { c: 7, r: 3, high: true },
  { c: 9, r: 5, high: true }, { c: 11, r: 4, high: true }, { c: 13, r: 3, high: true },
  { c: 3, r: 7, high: true }, { c: 12, r: 7, high: true },
  { c: 2, r: 5, high: false }, { c: 7, r: 5, high: false }, { c: 12, r: 5, high: false },
  { c: 1, r: 7, high: false }, { c: 6, r: 7, high: false }, { c: 8, r: 7, high: false },
];
export function plotAtCell(c, r) {
  return PLOTS.find((p) => p.c === c && p.r === r) ?? null;
}

// Teal-and-gold dusk: deep water, wet sand, stone, and lamplight.
export const PALETTE = {
  waterDeep: '#0d3a4d', water: '#14607c', waterLight: '#2b8aa5', foam: '#bfe8ef',
  sand: '#c9a06b', sandDark: '#a37f4e', grass: '#5d7d4a', grassDark: '#49653a',
  rock: '#7d7468', rockDark: '#5d564d', stone: '#9a917f', stoneDark: '#6f675a',
  gold: '#e8b64c', goldBright: '#ffd977', ink: '#10222c', parchment: '#f3e5c3',
  panel: '#0e2a38', panelEdge: '#2c5a6b', danger: '#e4572e', frost: '#a8e6f0',
  storm: '#c9a7ff', heart: '#e4572e',
};

// Three difficulties: Calm waters for learning, the Normal tide the game is tuned on,
// and the Storm tide for wardens who want the bay to bite back.
export const DIFFICULTIES = [
  { id: 'calm', name: 'Calm', blurb: 'Gentler raiders, richer salvage.', hpMul: 0.8, goldMul: 1.15, scoreMul: 0.8 },
  { id: 'normal', name: 'Normal', blurb: 'The tide as it is meant to be.', hpMul: 1.0, goldMul: 1.0, scoreMul: 1.0 },
  { id: 'storm', name: 'Storm', blurb: 'Tougher hulls, leaner salvage, glory.', hpMul: 1.3, goldMul: 0.9, scoreMul: 1.5 },
];
export function difficultyById(id) {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[1];
}

// Panel and screen layout — one source of truth, shared by render.js (drawing) and
// input.js (hit-testing) so a button is always exactly where it is drawn.
export function panelLayout() {
  const x = VIEW.panelX + 12, w = VIEW.panelW - 24;
  const cards = [];
  for (let i = 0; i < 5; i++) cards.push({ x, y: 132 + i * 70, w, h: 64 });
  return {
    gauge: { x, y: 64, w, h: 54 },
    cards,
    info: { x, y: 490, w, h: 106 },
    upgradeBtn: { x: x + 10, y: 490 + 66, w: 124, h: 32 },
    sellBtn: { x: x + 142, y: 490 + 66, w: 120, h: 32 },
    startBtn: { x, y: 606, w: 160, h: 50 },
    pauseBtn: { x: x + 168, y: 606, w: 48, h: 50 },
    speedBtn: { x: x + 224, y: 606, w: 48, h: 50 },
  };
}
export function titleLayout() {
  const cards = DIFFICULTIES.map((d, i) => ({ x: 190 + i * 330, y: 452, w: 240, h: 118, diff: d }));
  return { cards };
}
export function endLayout() {
  return { againBtn: { x: 490, y: 452, w: 300, h: 62 } };
}
export function inRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// A seeded generator (mulberry32): the same seed always deals the same bay, which is
// what makes the screenshots deterministic and the logic tests reproducible.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

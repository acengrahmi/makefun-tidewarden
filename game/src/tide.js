// tide.js — the tide cycle, TIDEWARDEN's heart. The tide alternates with every wave:
// odd waves break at LOW tide, even waves at HIGH tide. At high tide the water level
// rises over the shore flats, the low build plots flood, and any tower standing on one
// goes dormant under the water — while the boat lanes open to sail-borne raiders.
// Placement is the game: a plot is only worth its cost if it stays dry when it matters.

export const TIDE_LOW = 'low';
export const TIDE_HIGH = 'high';

// How long the water takes to rise (or fall) when a new wave's tide comes in.
export const TIDE_TRANSITION_SECONDS = 2.4;

export function tideForWave(wave) {
  return wave % 2 === 0 ? TIDE_HIGH : TIDE_LOW;
}

export function createTide() {
  // level is the water's height: 0 at low water, 1 at high water. It eases toward the
  // target the coming wave demands, starting beached at low water.
  return { level: 0, target: 0, label: TIDE_LOW, announcedWave: 0 };
}

// Called when the player moves to face a new wave (the build phase before it): the
// water begins to move at once, so the player watches the flats flood — or drain —
// while they place their towers.
export function setTideForWave(tide, wave) {
  tide.announcedWave = wave;
  tide.label = tideForWave(wave);
  tide.target = tide.label === TIDE_HIGH ? 1 : 0;
}

export function updateTide(tide, dt) {
  const step = dt / TIDE_TRANSITION_SECONDS;
  if (tide.level < tide.target) tide.level = Math.min(tide.target, tide.level + step);
  else if (tide.level > tide.target) tide.level = Math.max(tide.target, tide.level - step);
}

// The water counts as high once it is more than halfway up — from that moment the low
// plots are under and the lanes are deep enough to sail.
export function isHighTide(tide) {
  return tide.level > 0.5;
}

export function plotFlooded(tide, plot) {
  return !plot.high && isHighTide(tide);
}

export function tideName(tide) {
  return tide.label === TIDE_HIGH ? 'HIGH TIDE' : 'LOW TIDE';
}

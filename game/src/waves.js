// waves.js — the twelve waves of TIDEWARDEN and the engine that deals them onto
// the bay. Odd waves break at low tide against the stone road alone; even waves
// come at high tide, when the lanes open and the boats come with the flood. The
// great hulls — Tide Golem, Dread Barge, the Leviathan — boss waves 4, 8 and 12.
// A wave's hulls thicken as the count climbs: hit points scale 14% a wave.

import { spawnEnemy } from './enemies.js';

export const WAVE_COUNT = 12;

// Each wave is a list of groups: a kind, how many, the seconds between them, and
// a delay before the group starts. Boats take a lane (0 = the row-1 channel,
// 1 = the row-8 channel); a group with no lane alternates lanes as it spawns.
export const WAVES = [
  // 1 — low tide: the first raiders test the road.
  [{ kind: 'raider', count: 10, gap: 1.1 }],
  // 2 — high tide: the lanes open, sail-runners run them.
  [{ kind: 'raider', count: 8, gap: 1.0 }, { kind: 'skiff', count: 6, gap: 0.9, delay: 3 }],
  // 3 — low: runners behind the raider line.
  [{ kind: 'raider', count: 12, gap: 0.9 }, { kind: 'runner', count: 5, gap: 0.7, delay: 4 }],
  // 4 — high: the Tide Golem walks the road while skiffs probe the lanes.
  [{ kind: 'raider', count: 8, gap: 0.9 }, { kind: 'golem', count: 1, gap: 1, delay: 2 }, { kind: 'skiff', count: 3, gap: 1.2, delay: 5 }],
  // 5 — low: brutes join the march.
  [{ kind: 'raider', count: 10, gap: 0.8 }, { kind: 'runner', count: 6, gap: 0.6, delay: 3 }, { kind: 'brute', count: 2, gap: 2.2, delay: 6 }],
  // 6 — high: war-rafts and a mender on the water, raiders on the road.
  [{ kind: 'skiff', count: 8, gap: 0.7 }, { kind: 'raft', count: 3, gap: 1.6, delay: 2 }, { kind: 'raider', count: 8, gap: 0.8, delay: 1 }, { kind: 'mender', count: 1, gap: 1, delay: 8 }],
  // 7 — low: aegis plate, blinkers, and brutes together.
  [{ kind: 'aegis', count: 6, gap: 1.1 }, { kind: 'runner', count: 8, gap: 0.55, delay: 2 }, { kind: 'brute', count: 2, gap: 1.8, delay: 5 }, { kind: 'blinker', count: 4, gap: 0.9, delay: 7 }],
  // 8 — high: the Dread Barge sails the lower lane under escort.
  [{ kind: 'barge', count: 1, gap: 1, lane: 1 }, { kind: 'skiff', count: 8, gap: 0.8, delay: 2 }, { kind: 'raider', count: 6, gap: 0.8, delay: 1 }, { kind: 'raft', count: 2, gap: 2.0, delay: 9 }],
  // 9 — low: the full road muster, menders knitting the line.
  [{ kind: 'raider', count: 14, gap: 0.6 }, { kind: 'blinker', count: 6, gap: 0.8, delay: 3 }, { kind: 'brute', count: 3, gap: 1.6, delay: 6 }, { kind: 'mender', count: 2, gap: 3, delay: 8 }, { kind: 'runner', count: 8, gap: 0.5, delay: 10 }],
  // 10 — high: a raft fleet with an aegis screen.
  [{ kind: 'skiff', count: 10, gap: 0.6 }, { kind: 'raft', count: 4, gap: 1.4, delay: 2 }, { kind: 'aegis', count: 8, gap: 0.9, delay: 1 }, { kind: 'runner', count: 6, gap: 0.6, delay: 6 }],
  // 11 — low: the hardest march — plate, brutes, blinkers, menders.
  [{ kind: 'aegis', count: 10, gap: 0.8 }, { kind: 'brute', count: 5, gap: 1.4, delay: 3 }, { kind: 'blinker', count: 8, gap: 0.7, delay: 5 }, { kind: 'mender', count: 3, gap: 2.5, delay: 7 }, { kind: 'runner', count: 10, gap: 0.45, delay: 9 }],
  // 12 — high: the Leviathan takes the upper lane and everything comes with it.
  [{ kind: 'leviathan', count: 1, gap: 1, lane: 0 }, { kind: 'skiff', count: 10, gap: 0.7, delay: 2 }, { kind: 'raft', count: 4, gap: 1.6, delay: 4 }, { kind: 'raider', count: 8, gap: 0.7, delay: 1 }, { kind: 'aegis', count: 4, gap: 1.0, delay: 8 }],
];

export function waveHpScale(wave) {
  return 1 + 0.14 * (wave - 1);
}

// Begin the wave the warden is facing: lay out the whole spawn schedule on the
// wave clock, so spawning is just a matter of watching the time.
export function beginWave(state) {
  state.wave += 1;
  state.waveHpMul = waveHpScale(state.wave) * state.difficulty.hpMul;
  state.leakedThisWave = 0;
  state.phase = 'wave';
  state.waveTime = 0;
  state.spawnQueue = [];
  let cursor = 0.6;
  let flip = state.wave % 2;
  for (const group of WAVES[state.wave - 1]) {
    cursor += group.delay ?? 0;
    for (let i = 0; i < group.count; i++) {
      const lane = group.lane ?? (flip++ % 2);
      state.spawnQueue.push({ at: cursor, kind: group.kind, lane });
      cursor += group.gap;
    }
  }
  state.spawnQueue.sort((a, b) => a.at - b.at);
  if (state.audio) state.audio.sfx('wave');
}

export function updateSpawning(state, dt) {
  if (state.phase !== 'wave') return;
  state.waveTime += dt;
  while (state.spawnQueue.length > 0 && state.spawnQueue[0].at <= state.waveTime) {
    const next = state.spawnQueue.shift();
    spawnEnemy(state, next.kind, next.lane, state.waveHpMul);
  }
}

// A wave is weathered when everything it dealt has been sunk or has leaked.
export function waveCleared(state) {
  return state.phase === 'wave' && state.spawnQueue.length === 0 && state.enemies.length === 0;
}

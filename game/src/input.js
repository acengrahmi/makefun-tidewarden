// input.js — TIDEWARDEN's hands: every mouse click and key press, routed by the
// screen the game is on. On the title, a click on a difficulty card starts the
// run; in the game, clicks pick tower cards, raise towers on plots, upgrade and
// sell the selected tower, and work the wave controls; on the end screens, the
// big button (or R) returns to the title. Keys mirror the buttons: 1–5 pick a
// tower, Space looses the wave, P pauses, F doubles time, M mutes, Esc clears.

import { VIEW, PLOTS, cellAtPixel, panelLayout, titleLayout, endLayout, inRect } from './config.js';
import { TOWER_TYPES } from './towers.js';

export function attachInput(canvas, state, actions) {
  const toGame = (e) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (VIEW.w / rect.width),
      y: (e.clientY - rect.top) * (VIEW.h / rect.height),
    };
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (state.audio) state.audio.unlock();
    const { x, y } = toGame(e);
    handleClick(state, actions, x, y);
  });

  canvas.addEventListener('pointermove', (e) => {
    const { x, y } = toGame(e);
    state.hoverCell = cellAtPixel(x, y);
  });

  window.addEventListener('keydown', (e) => {
    handleKey(state, actions, e);
  });
}

export function handleClick(state, actions, x, y) {
  if (state.audio) state.audio.unlock();
  if (state.screen === 'title') {
    for (const card of titleLayout().cards) {
      if (inRect(x, y, card)) {
        actions.startRun(state, card.diff.id);
        if (state.audio) state.audio.sfx('click');
        return;
      }
    }
    return;
  }
  if (state.screen === 'victory' || state.screen === 'defeat') {
    if (inRect(x, y, endLayout().againBtn)) actions.toTitle(state);
    return;
  }
  // The game screen: panel first, then the field.
  const L = panelLayout();
  for (let i = 0; i < L.cards.length; i++) {
    if (inRect(x, y, L.cards[i])) {
      state.selectedType = TOWER_TYPES[i].id;
      if (state.audio) state.audio.sfx('click');
      return;
    }
  }
  if (inRect(x, y, L.startBtn)) { actions.pressStartWave(state); return; }
  if (inRect(x, y, L.pauseBtn)) { state.paused = !state.paused; return; }
  if (inRect(x, y, L.speedBtn)) { state.speed = state.speed === 1 ? 2 : 1; return; }
  if (state.selectedTower && inRect(x, y, L.upgradeBtn)) { actions.tryUpgrade(state, state.selectedTower); return; }
  if (state.selectedTower && inRect(x, y, L.sellBtn)) { actions.trySell(state, state.selectedTower); return; }
  if (x >= VIEW.panelX) return;
  const cell = cellAtPixel(x, y);
  const plot = cell ? PLOTS.find((p) => p.c === cell.c && p.r === cell.r) : null;
  if (!plot) {
    state.selectedPlot = null;
    state.selectedTower = null;
    return;
  }
  state.selectedPlot = plot;
  const held = state.towers.find((t) => t.plot === plot);
  if (held) {
    state.selectedTower = held;
    if (state.audio) state.audio.sfx('click');
  } else {
    state.selectedTower = null;
    actions.tryBuild(state, plot);
    state.selectedTower = state.towers.find((t) => t.plot === plot) ?? null;
  }
}

export function handleKey(state, actions, e) {
  const key = e.key;
  if (state.screen === 'game') {
    if (key >= '1' && key <= '5') {
      state.selectedType = TOWER_TYPES[Number(key) - 1].id;
    } else if (key === ' ') {
      e.preventDefault();
      actions.pressStartWave(state);
    } else if (key === 'p' || key === 'P') {
      state.paused = !state.paused;
    } else if (key === 'f' || key === 'F') {
      state.speed = state.speed === 1 ? 2 : 1;
    } else if (key === 'm' || key === 'M') {
      if (state.audio) state.audio.muted = !state.audio.muted;
    } else if (key === 'Escape') {
      state.selectedPlot = null;
      state.selectedTower = null;
    }
  } else if ((state.screen === 'victory' || state.screen === 'defeat') && (key === 'r' || key === 'R')) {
    actions.toTitle(state);
  } else if (key === 'm' || key === 'M') {
    if (state.audio) state.audio.muted = !state.audio.muted;
  }
}

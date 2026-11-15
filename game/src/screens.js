// screens.js — TIDEWARDEN's three full screens, drawn over the living bay: the
// title (the bay at dusk, the keep lit, and the three difficulties as cards), the
// victory (the bay held: stars for the lives kept, the run's whole ledger, and
// Play Again), and the defeat (the keep fallen, the wave that took it, and Try
// Again). The buttons' rects come from config's layouts — the same rects
// input.js hit-tests.

import { VIEW, PALETTE as P, titleLayout, endLayout } from './config.js';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function veil(ctx, strength = 0.45) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW.h);
  g.addColorStop(0, 'rgba(6,20,28,' + strength + ')');
  g.addColorStop(0.5, 'rgba(6,20,28,' + strength * 0.55 + ')');
  g.addColorStop(1, 'rgba(6,20,28,' + strength + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
}

function star(ctx, cx, cy, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (filled) { ctx.fillStyle = P.gold; ctx.fill(); }
  ctx.strokeStyle = P.gold; ctx.lineWidth = 2; ctx.stroke();
}

export function drawTitle(ctx, state) {
  veil(ctx, 0.5);
  ctx.textAlign = 'center';
  // The lantern mark.
  ctx.fillStyle = 'rgba(232,182,76,0.16)';
  ctx.beginPath(); ctx.arc(640, 118, 40, 0, 7); ctx.fill();
  ctx.fillStyle = P.gold;
  rr(ctx, 628, 96, 24, 34, 5); ctx.fill();
  ctx.fillStyle = '#fff3cf';
  ctx.beginPath(); ctx.arc(640, 113, 6.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#3a332a';
  rr(ctx, 624, 90, 32, 8, 3); ctx.fill();
  // The name of the game.
  ctx.fillStyle = P.goldBright;
  ctx.font = '800 86px Georgia, serif';
  ctx.fillText('TIDEWARDEN', 640, 218);
  ctx.fillStyle = '#bfe8ef';
  ctx.font = '700 19px system-ui, sans-serif';
  ctx.fillText('A  T I D A L  T O W E R  D E F E N C E', 640, 254);
  ctx.fillStyle = P.parchment;
  ctx.font = 'italic 600 19px Georgia, serif';
  ctx.fillText('The tide turns every wave. Low towers drown. Boats ride the flood.', 640, 292);
  // The rules, in three strokes.
  const rules = [
    ['BUILD', 'Raise five kinds of tower on the stone rings.'],
    ['MIND THE TIDE', 'High rings never flood — low rings drown.'],
    ['HOLD THE KEEP', 'Weather all 12 waves. Do not let them pass.'],
  ];
  rules.forEach(([head, line], i) => {
    const x = 190 + i * 330;
    ctx.fillStyle = 'rgba(10,32,42,0.72)';
    rr(ctx, x, 322, 300, 84, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(232,182,76,0.4)'; ctx.lineWidth = 1.2;
    rr(ctx, x, 322, 300, 84, 10); ctx.stroke();
    ctx.fillStyle = P.gold; ctx.font = '800 14px system-ui, sans-serif';
    ctx.fillText(head, x + 150, 352);
    ctx.fillStyle = 'rgba(243,229,195,0.85)'; ctx.font = '600 13.5px system-ui, sans-serif';
    wrapText(ctx, line, x + 150, 376, 272, 17);
  });
  // The three difficulties, as cards: click one and the run begins.
  const { cards } = titleLayout();
  for (const card of cards) {
    ctx.fillStyle = 'rgba(14,42,56,0.92)';
    rr(ctx, card.x, card.y, card.w, card.h, 12); ctx.fill();
    ctx.strokeStyle = P.gold; ctx.lineWidth = card.diff.id === 'normal' ? 2.6 : 1.4;
    rr(ctx, card.x, card.y, card.w, card.h, 12); ctx.stroke();
    ctx.fillStyle = P.goldBright; ctx.font = '800 27px Georgia, serif';
    ctx.fillText(card.diff.name.toUpperCase(), card.x + card.w / 2, card.y + 42);
    ctx.fillStyle = 'rgba(243,229,195,0.85)'; ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(card.diff.blurb, card.x + card.w / 2, card.y + 66);
    ctx.fillStyle = 'rgba(191,232,239,0.8)';
    ctx.fillText('Hull ×' + card.diff.hpMul + ' · Salvage ×' + card.diff.goldMul, card.x + card.w / 2, card.y + 86);
    ctx.fillStyle = P.gold; ctx.font = '800 12.5px system-ui, sans-serif';
    ctx.fillText('— CLICK TO PLAY —', card.x + card.w / 2, card.y + 106);
  }
  ctx.fillStyle = 'rgba(243,229,195,0.55)';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText('Keyboard & mouse · Space looses a wave · P pauses · F doubles time · M mutes', 640, 622);
  ctx.textAlign = 'left';
}

function wrapText(ctx, text, cx, y, maxW, lh) {
  const words = text.split(' ');
  let line = '', yy = y;
  for (const w of words) {
    if (ctx.measureText(line + ' ' + w).width > maxW && line) {
      ctx.fillText(line, cx, yy);
      line = w; yy += lh;
    } else line = line ? line + ' ' + w : w;
  }
  if (line) ctx.fillText(line, cx, yy);
}

function endPanel(ctx, title, titleColor, state, rows, btnLabel) {
  veil(ctx, 0.55);
  ctx.fillStyle = 'rgba(10,32,42,0.94)';
  rr(ctx, 300, 108, 680, 448, 16); ctx.fill();
  ctx.strokeStyle = P.gold; ctx.lineWidth = 2;
  rr(ctx, 300, 108, 680, 448, 16); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = titleColor;
  ctx.font = '800 52px Georgia, serif';
  ctx.fillText(title, 640, 182);
  rows.forEach(([label, value], i) => {
    const y = 268 + i * 40;
    ctx.font = '600 17px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(243,229,195,0.7)';
    ctx.textAlign = 'right';
    ctx.fillText(label, 616, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = P.parchment;
    ctx.font = '800 19px system-ui, sans-serif';
    ctx.fillText(value, 640, y);
    ctx.textAlign = 'center';
  });
  const btn = endLayout().againBtn;
  ctx.fillStyle = P.gold;
  rr(ctx, btn.x, btn.y, btn.w, btn.h, 12); ctx.fill();
  ctx.fillStyle = '#10222c';
  ctx.font = '800 21px system-ui, sans-serif';
  ctx.fillText(btnLabel, 640, btn.y + 40);
  ctx.fillStyle = 'rgba(243,229,195,0.55)';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText('or press R', 640, btn.y + 88);
  ctx.textAlign = 'left';
}

export function drawVictory(ctx, state) {
  veil(ctx, 0.4);
  ctx.fillStyle = 'rgba(10,32,42,0.94)';
  rr(ctx, 300, 96, 680, 448, 16); ctx.fill();
  ctx.strokeStyle = P.gold; ctx.lineWidth = 2;
  rr(ctx, 300, 96, 680, 448, 16); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = P.goldBright;
  ctx.font = '800 52px Georgia, serif';
  ctx.fillText('THE BAY HOLDS!', 640, 168);
  // The stars: one for holding the bay, more for the lives still in the keep.
  for (let i = 0; i < 3; i++) star(ctx, 576 + i * 64, 208, 24, i < state.stars);
  const rows = [
    ['Waves weathered', '12 / 12'],
    ['Raiders sunk', String(state.eco.kills)],
    ['Salvage earned', '◉ ' + state.eco.earned],
    ['Lives left in the keep', state.lives + ' / 20'],
    ['Final score', String(state.score)],
  ];
  rows.forEach(([label, value], i) => {
    const y = 268 + i * 38;
    ctx.font = '600 16.5px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(243,229,195,0.7)';
    ctx.textAlign = 'right';
    ctx.fillText(label, 616, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = P.parchment;
    ctx.font = '800 18.5px system-ui, sans-serif';
    ctx.fillText(value, 640, y);
    ctx.textAlign = 'center';
  });
  const btn = endLayout().againBtn;
  ctx.fillStyle = P.gold;
  rr(ctx, btn.x, btn.y, btn.w, btn.h, 12); ctx.fill();
  ctx.fillStyle = '#10222c';
  ctx.font = '800 21px system-ui, sans-serif';
  ctx.fillText('PLAY AGAIN', 640, btn.y + 40);
  ctx.fillStyle = 'rgba(243,229,195,0.55)';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText('The tide will turn again — the Storm tide is sterner still. (R)', 640, btn.y + 84);
  ctx.textAlign = 'left';
}

export function drawDefeat(ctx, state) {
  endPanel(ctx, 'THE KEEP FALLS', '#ff7a52', state, [
    ['Wave that took it', state.wave + ' / 12'],
    ['Raiders sunk', String(state.eco.kills)],
    ['Salvage earned', '◉ ' + state.eco.earned],
    ['Final score', String(state.score)],
  ], 'TRY AGAIN');
}

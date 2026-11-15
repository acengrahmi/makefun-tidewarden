// economy.js — TIDEWARDEN's purse: gold for salvage, the price of towers, the 70%
// sell-back, and the three habits that reward a careful warden — a bonus for every
// wave weathered, interest on a hoard left unspent, a flawless bonus for a wave that
// never touched the keep, and a kill-streak combo that fattens every reward while
// the streak runs hot.

export const SELL_REFUND = 0.7;
export const INTEREST_RATE = 0.06;
export const INTEREST_CAP = 40;
export const FLAWLESS_BONUS = 15;
export const COMBO_WINDOW = 2.5;
export const COMBO_STEP = 0.02;
export const COMBO_MAX_STEPS = 20;

export function startGold(difficulty) {
  return Math.round(230 * difficulty.goldMul);
}

export function createEconomy(difficulty) {
  return {
    gold: startGold(difficulty),
    earned: 0,          // every coin ever taken in (kills, bonuses, interest)
    spent: 0,           // every coin ever laid out (builds and upgrades)
    combo: 0,           // kills in the current streak
    comboTimer: 0,      // seconds left before the streak cools
    kills: 0,
  };
}

export function canAfford(eco, price) {
  return eco.gold >= price;
}

export function spend(eco, price) {
  if (!canAfford(eco, price)) return false;
  eco.gold -= price;
  eco.spent += price;
  return true;
}

// The combo multiplier a kill earns right now: 1 + 2% per streak kill, capped at +40%.
export function comboMultiplier(eco) {
  return 1 + Math.min(eco.combo, COMBO_MAX_STEPS) * COMBO_STEP;
}

// Award a kill's salvage: the streak fattens it, then the streak grows and its
// window refreshes. Returns the coins actually paid, so the renderer can float the
// number over the wreck.
export function awardKill(eco, baseReward, difficulty) {
  const paid = Math.max(1, Math.round(baseReward * comboMultiplier(eco) * difficulty.goldMul));
  eco.gold += paid;
  eco.earned += paid;
  eco.kills += 1;
  eco.combo += 1;
  eco.comboTimer = COMBO_WINDOW;
  return paid;
}

export function updateEconomy(eco, dt) {
  if (eco.comboTimer > 0) {
    eco.comboTimer -= dt;
    if (eco.comboTimer <= 0) eco.combo = 0;
  }
}

// The wave-end settlement, paid when the last raider of a wave falls or flees:
// a flat bonus that grows with the wave, interest on whatever the warden hoarded,
// and the flawless bonus when nothing leaked through to the keep.
export function settleWave(eco, wave, flawless, difficulty) {
  const bonus = Math.round((24 + wave * 2) * difficulty.goldMul);
  const interest = Math.min(INTEREST_CAP, Math.floor(eco.gold * INTEREST_RATE));
  const flawlessPay = flawless ? FLAWLESS_BONUS : 0;
  const total = bonus + interest + flawlessPay;
  eco.gold += total;
  eco.earned += total;
  return { bonus, interest, flawless: flawlessPay, total };
}

// What a tower gives back when sold: 70% of everything ever spent on it.
export function sellRefund(invested) {
  return Math.floor(invested * SELL_REFUND);
}

// The economy: money earned per round, spent in the buy menu between rounds.
// Win $3,250, loss $1,900, kill $300, plant $300 — the same shape as the
// genre's buy economy, with this game's own prices. The buy menu reads this
// module's catalogue; buying mutates the weapons' `owned` record.
import { WEAPONS, GRENADE } from './weapons.js';

export const ECONOMY = {
  win: 3250,
  loss: 1900,
  kill: 300,
  plant: 300,
  startMoney: 800,
};

export function catalogue() {
  return [
    { id: 'rifle', name: WEAPONS.rifle.name, desc: 'Auto rifle · 34 dmg · 30-round mag', price: WEAPONS.rifle.price, kind: 'primary' },
    { id: 'smg', name: WEAPONS.smg.name, desc: 'Fast SMG · 22 dmg · 32-round mag', price: WEAPONS.smg.price, kind: 'primary' },
    { id: 'dmr', name: WEAPONS.dmr.name, desc: 'Heavy DMR · 80 dmg · 10-round mag', price: WEAPONS.dmr.price, kind: 'primary' },
    { id: 'grenade', name: GRENADE.name, desc: 'Frag grenade · 95 dmg in 6.5 m', price: GRENADE.price, kind: 'grenade' },
  ];
}

export function createEconomy(state, weapons) {
  function awardKill() {
    state.money += ECONOMY.kill;
  }

  function awardRound(winner, planted) {
    if (winner === 'vanguard') {
      state.money += ECONOMY.win;
      if (planted) state.money += ECONOMY.plant;
    } else {
      state.money += ECONOMY.loss;
    }
  }

  // Buy an item by id. Returns 'ok', 'owned' or 'poor'.
  function buy(id) {
    const item = catalogue().find((c) => c.id === id);
    if (!item) return 'poor';
    if (item.kind === 'primary') {
      if (weapons.owned.primary === id) return 'owned';
      if (state.money < item.price) return 'poor';
      state.money -= item.price;
      weapons.owned.primary = id;
      weapons.current = id;
      return 'ok';
    }
    if (item.kind === 'grenade') {
      if (weapons.owned.grenades >= 2) return 'owned';
      if (state.money < item.price) return 'poor';
      state.money -= item.price;
      weapons.owned.grenades += 1;
      return 'ok';
    }
    return 'poor';
  }

  return { awardKill, awardRound, buy };
}

// Weapons: definitions, ammunition, fire cadence, reload, recoil and spread.
// This module owns numbers and timing only; the raycast that resolves a shot
// lives in main.js so weapons never need to know about bots or the map.
export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'VK-7 Longshot', kind: 'rifle', slot: 'primary',
    price: 2700, damage: 34, headMult: 3.0, mag: 30, reserve: 90,
    interval: 0.11, reloadTime: 2.1, auto: true,
    spreadBase: 0.006, spreadMove: 0.028, spreadAir: 0.05, spreadPerShot: 0.004,
    recoilPitch: 0.011, recoilYaw: 0.003, range: 90, tracer: 0xe8a33d,
  },
  smg: {
    id: 'smg', name: 'Hornet-9', kind: 'smg', slot: 'primary',
    price: 1500, damage: 22, headMult: 2.6, mag: 32, reserve: 96,
    interval: 0.075, reloadTime: 1.7, auto: true,
    spreadBase: 0.011, spreadMove: 0.03, spreadAir: 0.05, spreadPerShot: 0.003,
    recoilPitch: 0.007, recoilYaw: 0.003, range: 60, tracer: 0xe8a33d,
  },
  dmr: {
    id: 'dmr', name: 'Longbow DMR', kind: 'dmr', slot: 'primary',
    price: 4750, damage: 80, headMult: 2.5, mag: 10, reserve: 30,
    interval: 0.9, reloadTime: 2.6, auto: false,
    spreadBase: 0.0015, spreadMove: 0.045, spreadAir: 0.07, spreadPerShot: 0.012,
    recoilPitch: 0.03, recoilYaw: 0.006, range: 120, tracer: 0xffe9a8,
  },
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', kind: 'pistol', slot: 'sidearm',
    price: 0, damage: 26, headMult: 2.6, mag: 12, reserve: 36,
    interval: 0.18, reloadTime: 1.4, auto: false,
    spreadBase: 0.009, spreadMove: 0.026, spreadAir: 0.045, spreadPerShot: 0.003,
    recoilPitch: 0.009, recoilYaw: 0.003, range: 50, tracer: 0xe9e4d6,
  },
};

export const GRENADE = { id: 'grenade', name: 'Spark Frag', price: 300, damage: 95, radius: 6.5 };

export function createWeapons() {
  // Per-weapon live state; the definitions above never change.
  const live = {};
  for (const id of Object.keys(WEAPONS)) {
    live[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve, reloading: 0, cooldown: 0 };
  }
  const owned = { primary: 'rifle', sidearm: 'pistol', grenades: 0 };
  let current = 'rifle';
  let spreadBloom = 0; // grows while firing, decays while not: the aim penalty
  let triggerHeld = false;

  function def() { return WEAPONS[current]; }
  function state() { return live[current]; }

  // Spread right now: base + movement + air + bloom. Stopping to aim pays.
  function spread(groundSpeed, airborne, crouched) {
    const d = def();
    let s = d.spreadBase + spreadBloom;
    s += groundSpeed * 0.004 + (airborne ? d.spreadAir : 0);
    if (crouched) s *= 0.7;
    return s;
  }

  function ready() {
    const s = state();
    return s.cooldown <= 0 && s.reloading <= 0 && s.mag > 0;
  }

  // Consume one round and start the cadence timer. Returns false when the
  // weapon cannot fire (empty, reloading, cooling down).
  function takeRound(auto) {
    const s = state();
    if (s.cooldown > 0 || s.reloading > 0) return false;
    if (s.mag <= 0) return false;
    if (!def().auto && triggerHeld && auto) return false;
    s.mag -= 1;
    s.cooldown = def().interval;
    spreadBloom = Math.min(0.05, spreadBloom + def().spreadPerShot);
    triggerHeld = true;
    return true;
  }

  function releaseTrigger() { triggerHeld = false; }

  function reload() {
    const s = state();
    const d = def();
    if (s.reloading > 0 || s.mag >= d.mag || s.reserve <= 0) return false;
    s.reloading = d.reloadTime;
    return true;
  }

  function switchTo(id) {
    if (!WEAPONS[id]) return false;
    if (id === owned.primary || id === owned.sidearm) {
      current = id;
      triggerHeld = false;
      return true;
    }
    return false;
  }

  function currentSlot() { return def().slot; }

  function refillAll() {
    for (const id of Object.keys(WEAPONS)) {
      live[id].mag = WEAPONS[id].mag;
      live[id].reserve = WEAPONS[id].reserve;
      live[id].reloading = 0;
      live[id].cooldown = 0;
    }
    // Grenades are NOT refilled here: they are bought in the buy menu and
    // must survive into the round. startBuy resets them for a new round.
    spreadBloom = 0;
  }

  function step(dt) {
    spreadBloom = Math.max(0, spreadBloom - dt * 0.045);
    for (const id of Object.keys(live)) {
      const s = live[id];
      if (s.cooldown > 0) s.cooldown -= dt;
      if (s.reloading > 0) {
        s.reloading -= dt;
        if (s.reloading <= 0) {
          s.reloading = 0;
          const d = WEAPONS[id];
          const need = d.mag - s.mag;
          const take = Math.min(need, s.reserve);
          s.mag += take;
          s.reserve -= take;
        }
      }
    }
  }

  return {
    live, owned, def, state, spread, ready, takeRound, releaseTrigger,
    reload, switchTo, currentSlot, refillAll, step,
    get current() { return current; },
    set current(id) { if (WEAPONS[id]) current = id; },
    get bloom() { return spreadBloom; },
  };
}

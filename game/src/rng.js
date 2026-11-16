// Seeded randomness. The game uses one seeded stream per match so a screenshot
// mode (?shot=...&seed=N) stages the same frame every time, and so the playtest
// driver can reproduce a bot layout exactly. Runtime play re-seeds from the clock.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick one entry of an array with the given stream.
export function pick(random, array) {
  return array[Math.floor(random() * array.length) % array.length];
}

// Integer in [min, max).
export function intIn(random, min, max) {
  return min + Math.floor(random() * (max - min));
}

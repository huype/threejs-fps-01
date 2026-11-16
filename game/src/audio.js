// All sound is synthesised with WebAudio: no audio files, no network. Every call
// is guarded so a browser without audio (headless, or before the first gesture)
// simply stays silent instead of throwing.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
      const length = Math.floor(ctx.sampleRate * 0.5);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  // One short burst of filtered noise plus a low thump: the core of every gunshot.
  function burst(duration, filterFreq, gain, type) {
    if (!ensure() || ctx.state === 'suspended') return;
    try {
      const now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = type || 'lowpass';
      filter.frequency.value = filterFreq;
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(gain, now);
      amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
      src.connect(filter);
      filter.connect(amp);
      amp.connect(master);
      src.start(now, Math.random() * 0.2, duration);
      src.stop(now + duration + 0.02);
    } catch { /* silent */ }
  }

  function tone(freq, duration, gain, type, slideTo) {
    if (!ensure() || ctx.state === 'suspended') return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(gain, now);
      amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(amp);
      amp.connect(master);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch { /* silent */ }
  }

  return {
    // Call once from a user gesture so the context is allowed to start.
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    shot(kind) {
      if (kind === 'dmr') { burst(0.22, 900, 0.9); tone(140, 0.16, 0.5, 'triangle', 55); }
      else if (kind === 'smg') { burst(0.09, 2400, 0.55); tone(190, 0.06, 0.3, 'square', 90); }
      else if (kind === 'pistol') { burst(0.11, 1800, 0.65); tone(170, 0.08, 0.35, 'square', 80); }
      else { burst(0.14, 1500, 0.8); tone(150, 0.11, 0.45, 'triangle', 60); } // rifle
    },
    enemyShot() { burst(0.1, 1100, 0.35); },
    dryFire() { tone(900, 0.04, 0.2, 'square'); },
    reload() { tone(520, 0.05, 0.25, 'square'); setTimeout(() => tone(760, 0.05, 0.25, 'square'), 260); },
    hit() { tone(1250, 0.06, 0.35, 'sine'); },
    kill() { tone(1250, 0.06, 0.35, 'sine'); setTimeout(() => tone(1650, 0.09, 0.35, 'sine'), 70); },
    hurt() { tone(110, 0.18, 0.5, 'sawtooth', 60); },
    step() { burst(0.05, 500, 0.12); },
    plantBeep() { tone(980, 0.09, 0.3, 'square'); },
    defuseBeep() { tone(620, 0.09, 0.3, 'square'); },
    planted() { tone(440, 0.12, 0.4, 'square'); setTimeout(() => tone(440, 0.12, 0.4, 'square'), 140); },
    explode() {
      burst(0.9, 420, 1.0);
      tone(70, 0.9, 0.9, 'sine', 28);
      tone(50, 1.2, 0.6, 'triangle', 24);
    },
    click() { tone(800, 0.04, 0.25, 'square'); },
    buy() { tone(660, 0.07, 0.3, 'sine'); setTimeout(() => tone(990, 0.1, 0.3, 'sine'), 80); },
    deny() { tone(220, 0.12, 0.3, 'square', 160); },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.35, 'triangle'), i * 130)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.2, 0.35, 'triangle'), i * 150)); },
  };
}

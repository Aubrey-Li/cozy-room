// Sound for The Little Lamplighter, synthesized live with the Web Audio API:
// an original mellow loop for exploring, an original rising theme for the
// finale, and small effects. No audio files, so nothing to license or load.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Mellow loop: Fmaj7, Em7, Dm7, Cmaj7, a slow descending, bittersweet turn.
const CALM = {
  bpm: 66,
  chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]],
};
// Finale: F, G, Am, C and onward, with a melody that keeps climbing.
const FINALE = {
  bpm: 76,
  chords: [[53, 57, 60, 65], [55, 59, 62, 67], [57, 60, 64, 69], [48, 55, 60, 64], [53, 57, 60, 65], [55, 59, 62, 67], [48, 55, 60, 64], [48, 52, 55, 62]],
  melody: [
    [[0, 72, 1], [1, 74, 0.5], [1.5, 76, 1.5], [3, 77, 1]],
    [[0, 79, 1.5], [1.5, 77, 0.5], [2, 76, 1], [3, 74, 1]],
    [[0, 76, 1], [1, 72, 1], [2, 76, 1], [3, 79, 1]],
    [[0, 79, 2], [2, 77, 1], [3, 76, 1]],
    [[0, 77, 1], [1, 76, 0.5], [1.5, 77, 0.5], [2, 81, 2]],
    [[0, 79, 1], [1, 77, 1], [2, 79, 1], [3, 83, 1]],
    [[0, 84, 3], [3, 83, 1]],
    [[0, 84, 4]],
  ],
};

export function createSound() {
  let ctx = null;
  let master, musicBus, sfxBus, reverb;
  let muted = false;
  try { muted = localStorage.getItem('cozy-room:game-muted') === '1'; } catch { /* storage unavailable */ }
  let mode = null;          // 'calm' | 'finale'
  let nextBar = 0;
  let bar = 0;
  let timer = 0;
  let mood = 1;             // 0..1, follows your light
  let finaleBars = 0;
  let holdOsc = null;
  let noise = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.85;
    master.connect(ctx.destination);
    reverb = ctx.createConvolver();
    reverb.buffer = impulse(3.2, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.38;
    reverb.connect(wet).connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(master);
    musicBus.connect(reverb);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.7;
    sfxBus.connect(master);
    sfxBus.connect(reverb);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function impulse(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // ---------------- instruments
  function env(gainNode, t, peak, attack, hold, release) {
    t = Math.max(t, ctx.currentTime); // never schedule in the past (the clock may not have started yet)
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(peak, t + attack);
    g.setValueAtTime(peak, t + attack + hold);
    g.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  }

  function pad(t, notes, dur, { cutoff = 1200, gain = 0.05, bright = false } = {}) {
    t = Math.max(t, ctx.currentTime);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    env(g, t, gain, 1.4, Math.max(0.1, dur - 1.4), 2.6);
    f.connect(g).connect(musicBus);
    for (const n of notes) {
      for (const [type, cents] of [['triangle', -7], [bright ? 'sawtooth' : 'triangle', 7]]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = midi(n);
        o.detune.value = cents;
        const og = ctx.createGain();
        og.gain.value = type === 'sawtooth' ? 0.35 : 1;
        o.connect(og).connect(f);
        o.start(t);
        o.stop(t + dur + 4);
      }
    }
  }

  function pluck(t, n, { gain = 0.07, decay = 1.6, bus = musicBus } = {}) {
    t = Math.max(t, ctx.currentTime);
    const g = ctx.createGain();
    env(g, t, gain, 0.006, 0.02, decay);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 3200;
    g.connect(f).connect(bus);
    for (const [type, mul, lvl] of [['sine', 1, 1], ['triangle', 2, 0.25], ['sine', 3.01, 0.08]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = midi(n) * mul;
      const og = ctx.createGain();
      og.gain.value = lvl;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + decay + 0.2);
    }
  }

  function bass(t, n, dur, gain = 0.09) {
    t = Math.max(t, ctx.currentTime);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = midi(n);
    const g = ctx.createGain();
    env(g, t, gain, 0.25, Math.max(0.1, dur - 0.6), 0.9);
    o.connect(g).connect(musicBus);
    o.start(t);
    o.stop(t + dur + 1.2);
  }

  function lead(t, n, dur, gain = 0.06) {
    t = Math.max(t, ctx.currentTime);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = midi(n);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vg = ctx.createGain();
    vg.gain.value = midi(n) * 0.004;
    vib.connect(vg).connect(o.frequency);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = midi(n + 12);
    const g2 = ctx.createGain();
    g2.gain.value = 0.18;
    o2.connect(g2);
    const g = ctx.createGain();
    env(g, t, gain, 0.09, Math.max(0.05, dur * 0.7), dur * 0.9 + 0.4);
    o.connect(g);
    g2.connect(g);
    g.connect(musicBus);
    for (const x of [o, o2, vib]) { x.start(t); x.stop(t + dur * 1.8 + 0.6); }
  }

  function heartbeat(t, gain = 0.12) {
    t = Math.max(t, ctx.currentTime);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
    const g = ctx.createGain();
    env(g, t, gain, 0.005, 0.02, 0.3);
    o.connect(g).connect(musicBus);
    o.start(t);
    o.stop(t + 0.4);
  }

  function bell(t, n, gain = 0.08, bus = sfxBus) {
    t = Math.max(t, ctx.currentTime);
    for (const [ratio, lvl, dec] of [[1, 1, 2.6], [2, 0.5, 1.8], [3.01, 0.25, 1.2], [4.16, 0.12, 0.8]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = midi(n) * ratio;
      const g = ctx.createGain();
      env(g, t, gain * lvl, 0.004, 0.01, dec);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + dec + 0.2);
    }
  }

  function noiseBurst(t, dur, { gain = 0.1, from = 400, to = 400, type = 'lowpass', q = 0.7 } = {}) {
    t = Math.max(t, ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    env(g, t, gain, Math.min(0.05, dur / 3), dur * 0.3, dur * 0.7);
    src.connect(f).connect(g).connect(sfxBus);
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  function blipTone(t, freq, gain, dur, type = 'sine', slideTo) {
    t = Math.max(t, ctx.currentTime);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    env(g, t, gain, 0.004, dur * 0.3, dur * 0.7);
    o.connect(g).connect(sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------------- music sequencer
  function scheduleBar(t) {
    const song = mode === 'finale' ? FINALE : CALM;
    const beat = 60 / song.bpm;
    const barLen = beat * 4;
    const i = bar % song.chords.length;
    const chord = song.chords[i];
    if (mode === 'finale') {
      finaleBars++;
      const build = Math.min(1, finaleBars / 8);         // swells over the first eight bars
      pad(t, chord.map((n) => n + 12), barLen, { cutoff: 1400 + 1600 * build, gain: 0.035 + 0.02 * build, bright: true });
      bass(t, chord[0] - 12, barLen, 0.1);
      if (finaleBars > 1) { heartbeat(t, 0.1 * build); heartbeat(t + beat * 2, 0.08 * build); }
      for (const [b, n, d] of song.melody[i]) lead(t + b * beat, n, d * beat, 0.05 + 0.025 * build);
      // sparkling arpeggio, faster as it builds
      const steps = finaleBars > 4 ? 16 : 8;
      const tones = [...chord.map((n) => n + 24), chord[1] + 36];
      for (let k = 0; k < steps; k++) {
        if (k % 2 && Math.random() > 0.7) continue;
        pluck(t + (k * barLen) / steps, tones[(k + i) % tones.length], { gain: 0.02 + 0.02 * build, decay: 0.8 });
      }
    } else {
      // calm: soft pads, a quiet bass, and a music box that thins as your light fades
      pad(t, chord, barLen, { cutoff: 600 + 900 * mood, gain: 0.05 });
      bass(t, chord[0] - 12, barLen * 0.9, 0.07);
      const tones = [...chord.map((n) => n + 12), chord[0] + 24, chord[2] + 24];
      let idx = Math.floor(Math.random() * tones.length);
      for (let k = 0; k < 8; k++) {
        if (Math.random() > 0.22 + 0.45 * mood) continue;
        idx = Math.max(0, Math.min(tones.length - 1, idx + (Math.random() < 0.5 ? -1 : 1)));
        pluck(t + k * beat * 0.5 + (Math.random() - 0.5) * 0.02, tones[idx], { gain: 0.05 + 0.03 * mood, decay: 1.8 });
      }
    }
    bar++;
    return barLen;
  }

  function tick() {
    if (!ctx || !mode) return;
    if (nextBar < ctx.currentTime) nextBar = ctx.currentTime + 0.05; // after a pause, start fresh rather than catch up
    while (nextBar < ctx.currentTime + 0.6) nextBar += scheduleBar(nextBar);
  }

  function music(next, { immediate = false } = {}) {
    if (!ensure()) return;
    if (next === mode) return;
    mode = next;
    bar = 0;
    if (next === 'finale') finaleBars = 0;
    const now = ctx.currentTime;
    if (immediate || nextBar < now) nextBar = now + 0.15;
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setValueAtTime(musicBus.gain.value, now);
    musicBus.gain.linearRampToValueAtTime(next === 'finale' ? 0.75 : 0.6, now + 2.5);
    if (!timer) timer = setInterval(tick, 60);
    tick();
  }

  // ---------------- effects
  const at = () => ctx.currentTime + 0.01;
  const sfx = {
    blip(voice = 0) {
      const t = at();
      blipTone(t, (voice ? 560 : 420) * (1 + (Math.random() - 0.5) * 0.12), 0.018, 0.045, 'triangle');
    },
    advance() { blipTone(at(), 740, 0.03, 0.06, 'sine', 980); },
    choiceMove() { blipTone(at(), 880, 0.03, 0.05, 'triangle'); },
    choose() { const t = at(); pluck(t, 79, { gain: 0.06, decay: 0.9, bus: sfxBus }); pluck(t + 0.08, 84, { gain: 0.05, decay: 1.2, bus: sfxBus }); },
    start() { const t = at(); [72, 76, 79, 84].forEach((n, i) => pluck(t + i * 0.09, n, { gain: 0.05, decay: 1.4, bus: sfxBus })); },
    hop(glow = 1) {
      const base = 260 + 220 * glow;
      blipTone(at(), base, 0.07, 0.16, 'sine', base * (1.6 + 0.6 * glow));
    },
    land(heavy = 0) {
      noiseBurst(at(), 0.09 + heavy * 0.06, { gain: 0.05 + heavy * 0.1, from: 600 - heavy * 300, to: 120 });
    },
    step() { noiseBurst(at(), 0.04, { gain: 0.012, from: 900, to: 300 }); },
    lightStart() {
      const t = at();
      [60, 64, 67, 72, 76, 79, 84, 88].forEach((n, i) => pluck(t + i * 0.27, n, { gain: 0.035, decay: 1.4, bus: sfxBus }));
      noiseBurst(t, 2.2, { gain: 0.02, from: 2000, to: 7000, type: 'bandpass', q: 3 });
    },
    lampLit() { const t = at(); bell(t, 72, 0.08); bell(t + 0.12, 79, 0.05); },
    flicker() {
      const t = at();
      for (let i = 0; i < 6; i++) noiseBurst(t + i * 0.12 + Math.random() * 0.05, 0.03, { gain: 0.03, from: 3000, to: 1500, type: 'bandpass', q: 2 });
    },
    gift() { const t = at(); bell(t, 91, 0.04); bell(t + 0.07, 96, 0.03); },
    giftArrive() { const t = at(); bell(t, 88, 0.05); pluck(t + 0.05, 76, { gain: 0.04, decay: 1, bus: sfxBus }); },
    travel() {
      const t = at();
      noiseBurst(t, 1.8, { gain: 0.06, from: 300, to: 3000, type: 'bandpass', q: 1.2 });
      [67, 74, 79].forEach((n, i) => pluck(t + 0.3 + i * 0.18, n, { gain: 0.03, decay: 1.5, bus: sfxBus }));
    },
    arrive() { blipTone(at(), 520, 0.03, 0.3, 'sine', 390); },
    holdLine() { pluck(at(), 76 + Math.floor(Math.random() * 3) * 3, { gain: 0.05, decay: 2.2, bus: sfxBus }); },
    hold(progress) {
      if (!ctx) return;
      const t = ctx.currentTime;
      if (progress > 0 && !holdOsc) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        const g = ctx.createGain();
        g.gain.value = 0;
        o.connect(g).connect(sfxBus);
        o.start();
        holdOsc = { o, g };
      }
      if (holdOsc) {
        holdOsc.o.frequency.setTargetAtTime(midi(60) * Math.pow(2, progress * 1.0), t, 0.1);
        holdOsc.g.gain.setTargetAtTime(progress > 0 ? 0.015 + 0.03 * progress : 0, t, 0.15);
        if (progress <= 0) {
          const h = holdOsc;
          holdOsc = null;
          setTimeout(() => { try { h.o.stop(); } catch { /* already stopped */ } }, 600);
        }
      }
    },
    ignite() {
      sfx.hold(0);
      const t = at();
      bell(t, 72, 0.1); bell(t + 0.05, 76, 0.07); bell(t + 0.1, 79, 0.07); bell(t + 0.2, 84, 0.06);
      noiseBurst(t, 2.5, { gain: 0.03, from: 1500, to: 8000, type: 'bandpass', q: 2 });
    },
  };

  return {
    resume() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); },
    music,
    stopMusic() {
      if (!ctx) return;
      const now = ctx.currentTime;
      musicBus.gain.cancelScheduledValues(now);
      musicBus.gain.setValueAtTime(musicBus.gain.value, now);
      musicBus.gain.linearRampToValueAtTime(0, now + 0.8);
      mode = null;
      clearInterval(timer);
      timer = 0;
      sfx.hold(0);
    },
    setMood(glow) { mood = glow; },
    // effects play only once audio has started and while unmuted; unknown names are ignored
    sfx: new Proxy(sfx, { get: (o, k) => (typeof o[k] === 'function' ? (...a) => { if (ctx && !muted) o[k](...a); } : undefined) }),
    get muted() { return muted; },
    setMuted(m) {
      muted = m;
      try { localStorage.setItem('cozy-room:game-muted', m ? '1' : '0'); } catch { /* storage unavailable */ }
      if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.05);
    },
  };
}

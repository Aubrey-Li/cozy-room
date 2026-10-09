// The room's sound, synthesized live with the Web Audio API like the game's
// (no audio files, so nothing to license or load). Outside, the seasons have
// their own voices: birdsong in spring, cicadas by day and crickets by night
// in summer, crisp gusts and dry leaves in fall, and a soft hush in winter.
// It all reaches the room muffled through the glass until the window opens.
// Inside: the window's latch and hinges, and the book's cover and pages.

const PREF = 'cozy-room:sound';
const MASTER = 0.9;
const CLOSED = { cutoff: 1500, gain: 0.32 }; // through the shut window
const OPEN = { cutoff: 12000, gain: 1 };

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x, a, b) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function readPref() {
  try { return localStorage.getItem(PREF); } catch { return null; }
}
function writePref(v) {
  try { localStorage.setItem(PREF, v); } catch { /* storage unavailable */ }
}

/** Stop a param's automation at t and hold its value there, so a new ramp starts smoothly. */
function holdAt(param, t) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
  else {
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
  }
}

// a few birds that live nearby, each with its own song and spot in the meadow
const BIRDS = [
  { song: 'chirp', base: 3700, pan: -0.55, every: 4 },
  { song: 'whistle', base: 3950, pan: 0.5, every: 7 },
  { song: 'warble', base: 2500, pan: -0.15, every: 6 },
  { song: 'trill', base: 5300, pan: 0.25, every: 9 },
  { song: 'chirp', base: 4400, pan: 0.75, every: 5 },
];
// crickets join one by one as the night deepens
const CRICKETS = [
  { f: 4450, period: 0.64, pulses: 3, pan: -0.45 },
  { f: 4720, period: 0.82, pulses: 4, pan: 0.4 },
  { f: 4150, period: 0.93, pulses: 3, pan: 0.05 },
  { f: 5050, period: 0.71, pulses: 2, pan: -0.8 },
  { f: 4300, period: 1.05, pulses: 4, pan: 0.75 },
];

export function createAmbience({ context = null } = {}) {
  let ctx = context;
  let enabled = context ? true : readPref() !== '0';
  let n = null;           // audio nodes, built with the context
  let timer = 0;
  let lastTick = 0;

  // what the scene looks like right now, fed in every frame
  const scene = { spring: 1, summer: 0, fall: 0, winter: 0, night: 0, morning: 0 };
  // layer loudness, eased toward the scene so scrubbing the year never jumps
  const level = { birds: 0, cicadas: 0, crickets: 0, wind: 0, hush: 0, rustle: 0 };
  const focus = { music: false, book: false, game: false, rose: false };
  let windowOpen = false;

  const birds = BIRDS.map((b) => ({ ...b, next: 0, out: null }));
  const crickets = CRICKETS.map((c) => ({ ...c, next: 0, singUntil: 0, restUntil: 0, out: null }));
  const cicadas = [];     // end times of calls in progress
  let nextCicada = 0;
  const gust = { v: 0.3, target: 0.3, next: 0 };

  // ---------------------------------------------------------------- graph
  function impulse(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function panner(x, dest) {
    if (!ctx.createStereoPanner) return dest;
    const p = ctx.createStereoPanner();
    p.pan.value = x;
    p.connect(dest);
    return p;
  }

  function build() {
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // ambience is ducked under the record player and silenced while the game plays
    const duck = ctx.createGain();
    duck.connect(master);
    // the window: a lowpass and a level that open up with the sashes
    const glass = ctx.createBiquadFilter();
    glass.type = 'lowpass';
    glass.frequency.value = windowOpen ? OPEN.cutoff : CLOSED.cutoff;
    glass.Q.value = 0.5;
    const through = ctx.createGain();
    through.gain.value = windowOpen ? OPEN.gain : CLOSED.gain;
    glass.connect(through).connect(duck);
    // everything outdoors, with a little open-air space around it
    const outdoor = ctx.createGain();
    outdoor.connect(glass);
    const air = ctx.createConvolver();
    air.buffer = impulse(1.8, 4);
    const airWet = ctx.createGain();
    airWet.gain.value = 0.22;
    outdoor.connect(air).connect(airWet).connect(glass);

    // sounds in the room itself, in a small wooden room
    const indoor = ctx.createGain();
    indoor.connect(master);
    const room = ctx.createConvolver();
    room.buffer = impulse(0.6, 3);
    const roomWet = ctx.createGain();
    roomWet.gain.value = 0.16;
    indoor.connect(room).connect(roomWet).connect(master);

    const noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    n = { master, duck, glass, through, outdoor, indoor, noise };

    // wind: a broad crisp gust, a thin whistle on top, and a low hush underneath
    const windLayer = (type, freq, q, rate = 1) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.playbackRate.value = rate;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      src.connect(f).connect(g);
      if (p) g.connect(p).connect(outdoor);
      else g.connect(outdoor);
      src.start(0, rand(0, 3.5));
      return { f, g, p };
    };
    n.crisp = windLayer('bandpass', 900, 1);
    n.whistle = windLayer('bandpass', 2400, 3.5, 0.93);
    n.hush = windLayer('lowpass', 320, 0.4, 0.81);

    // cicada calls are long, so they share a bus that follows the season live
    n.cicadas = ctx.createGain();
    n.cicadas.gain.value = 0;
    n.cicadas.connect(outdoor);

    for (const b of birds) b.out = panner(b.pan, outdoor);
    for (const c of crickets) c.out = panner(c.pan, outdoor);
  }

  // ---------------------------------------------------------------- voices
  /** A whistled note whose pitch glides through pts (Hz), evenly spaced over dur. */
  function note(t, dur, pts, gain, dest, wobble = 0) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(pts[0], t);
    pts.slice(1).forEach((f, i) => o.frequency.linearRampToValueAtTime(f, t + (dur * (i + 1)) / (pts.length - 1)));
    const g = ctx.createGain();
    const a = Math.min(0.012, dur * 0.25);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + a);
    g.gain.setValueAtTime(gain, t + dur - a * 1.5);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(dest);
    const stops = [o];
    if (wobble) {
      // a fast flutter gives songbirds their burr
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rand(28, 55);
      const lg = ctx.createGain();
      lg.gain.value = pts[0] * wobble;
      lfo.connect(lg).connect(o.frequency);
      stops.push(lfo);
    }
    for (const s of stops) { s.start(t); s.stop(t + dur + 0.02); }
  }

  function sing(bird, t, loud) {
    const k = bird.base * rand(0.96, 1.04);
    const g = 0.06 * loud * rand(0.55, 1); // some sing from further off
    const out = bird.out;
    switch (bird.song) {
      case 'chirp': { // tsip tsip tsip
        const count = 2 + Math.floor(Math.random() * 4);
        const step = rand(0.09, 0.13);
        for (let i = 0; i < count; i++) note(t + i * step, rand(0.045, 0.065), [k * 1.25, k * 0.82], g, out, Math.random() < 0.3 ? 0.02 : 0);
        break;
      }
      case 'whistle': { // fee-bee, sometimes fee-bee-ee
        note(t, 0.32, [k, k * 0.97], g * 0.8, out);
        note(t + 0.4, 0.28, [k * 0.86, k * 0.84], g * 0.75, out);
        if (Math.random() < 0.35) note(t + 0.72, 0.16, [k * 0.86, k * 0.85], g * 0.5, out);
        break;
      }
      case 'warble': { // cheerily, cheer-up, cheerio
        let at = t;
        const phrases = 2 + Math.floor(Math.random() * 2);
        for (let p = 0; p < phrases; p++) {
          const notes = 2 + Math.floor(Math.random() * 2);
          for (let i = 0; i < notes; i++) {
            const dur = rand(0.11, 0.18);
            note(at, dur, [k * rand(0.85, 1), k * rand(1.1, 1.35), k * rand(0.9, 1.05)], g, out, 0.015);
            at += dur + rand(0.05, 0.08);
          }
          at += rand(0.25, 0.45);
        }
        break;
      }
      case 'trill': { // a dry, quick run that slows and falls a little
        const count = 9 + Math.floor(Math.random() * 8);
        for (let i = 0; i < count; i++) {
          const f = k * (1 - 0.1 * (i / count));
          note(t + i * (0.045 + i * 0.0012), 0.026, [f * 1.12, f * 0.9], g * 0.7, out);
        }
        break;
      }
      default: break;
    }
  }

  function chirpCricket(c, t, loud) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = c.f * rand(0.99, 1.01);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    const peak = 0.03 * loud;
    for (let i = 0; i < c.pulses; i++) {
      const p = t + i * 0.042;
      g.gain.setValueAtTime(0, p);
      g.gain.linearRampToValueAtTime(peak, p + 0.004);
      g.gain.setValueAtTime(peak, p + 0.018);
      g.gain.linearRampToValueAtTime(0, p + 0.026);
    }
    o.connect(g).connect(c.out);
    o.start(t);
    o.stop(t + c.pulses * 0.042 + 0.05);
  }

  /** A cicada call: a buzzing band of noise that swells, holds and fades away. */
  function cicada(t) {
    const dur = rand(6, 13);
    const src = ctx.createBufferSource();
    src.buffer = n.noise;
    src.loop = true;
    const f0 = rand(4200, 5800);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 4.5;
    bp.frequency.setValueAtTime(f0 * 0.9, t);
    bp.frequency.linearRampToValueAtTime(f0, t + dur * 0.35);
    bp.frequency.linearRampToValueAtTime(f0 * 0.93, t + dur);
    // the buzz: the band pulses on and off well over a hundred times a second
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rand(110, 170);
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg).connect(am.gain);
    const env = ctx.createGain();
    const peak = 0.09 * rand(0.6, 1);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak * 0.25, t + dur * 0.12);
    env.gain.linearRampToValueAtTime(peak, t + dur * 0.4);
    env.gain.setValueAtTime(peak, t + dur * 0.62);
    env.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(bp).connect(am).connect(env).connect(panner(rand(-0.8, 0.8), n.cicadas));
    src.start(t, rand(0, 3.5));
    lfo.start(t);
    src.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
    return t + dur;
  }

  /** A short burst of filtered noise. */
  function burst(t, dur, { gain, type = 'bandpass', from, to = from, q = 0.8, attack = 0.002, dest = n.indoor, pan = 0 }) {
    const src = ctx.createBufferSource();
    src.buffer = n.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    if (to !== from) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(pan ? panner(pan, dest) : dest);
    src.start(t, rand(0, 3.5));
    src.stop(t + dur + 0.02);
  }

  /** Dry leaves skittering: a scatter of tiny crackles. */
  function rustle(t, amount) {
    const len = rand(0.4, 1.2);
    const count = Math.floor(6 + 18 * amount);
    const pan = rand(-0.7, 0.7);
    for (let i = 0; i < count; i++) {
      burst(t + Math.random() * len, rand(0.006, 0.025), {
        gain: rand(0.01, 0.045) * amount, type: 'highpass', from: rand(2500, 5500), q: 0.7, dest: n.outdoor, pan,
      });
    }
  }

  // ---------------------------------------------------------------- the scheduler
  function targets() {
    const day = 1 - scene.night;
    const { spring, summer, fall, winter, morning } = scene;
    return {
      // birds wake with the sun, loudest in the dawn chorus
      birds: day * (spring * (0.55 + 0.45 * morning) + summer * 0.3 * morning + fall * 0.08 * morning),
      // cicadas through the long summer afternoon
      cicadas: day * summer * (1 - 0.6 * morning),
      // crickets from dusk, carrying on into early fall
      crickets: smooth(scene.night, 0.25, 0.8) * (summer + 0.65 * fall + 0.2 * spring),
      // fall's crisp gusts; just a breath of air the rest of the year
      wind: fall + 0.06 * (spring + summer),
      hush: 0.08 * winter + 0.03 * (1 - winter),
      rustle: fall * (0.8 + 0.2 * day),
    };
  }

  function tick(now = ctx.currentTime) {
    const dt = lastTick ? Math.min(1, now - lastTick) : 0.1;
    lastTick = now;
    const ahead = now + 0.25;
    const tg = targets();
    const ease = 1 - Math.exp(-dt / 1.5);
    for (const k in level) level[k] += (tg[k] - level[k]) * ease;

    // birds
    birds.forEach((b, i) => {
      if (b.next < now - 1) b.next = now + rand(0.2, b.every);
      if (b.next > ahead) return;
      // more birds join in as the chorus grows
      if (level.birds > 0.03 + i * 0.12 && Math.random() < 0.4 + 0.6 * level.birds) {
        sing(b, Math.max(b.next, now), Math.sqrt(level.birds));
        b.next += b.every * rand(0.5, 1.6) / (0.4 + 0.6 * level.birds);
      } else {
        b.next = now + rand(0.5, 2); // quiet for now: listen again shortly
      }
    });

    // crickets: each sings for a while, rests, and sings again
    crickets.forEach((c, i) => {
      if (c.next < now - 1) c.next = now + rand(0, c.period);
      const joined = level.crickets > 0.04 + i * 0.15;
      while (c.next < ahead) {
        if (c.next > c.singUntil && c.next > c.restUntil) {
          if (Math.random() < 0.5) c.restUntil = c.next + rand(1.5, 6);
          c.singUntil = Math.max(c.restUntil, c.next) + rand(6, 20);
        }
        if (joined && c.next > c.restUntil) chirpCricket(c, Math.max(c.next, now), Math.min(1, level.crickets * 1.3));
        c.next += c.period * rand(0.97, 1.03);
      }
    });

    // cicadas: one or two calls overlapping, loud in the heat of the day
    for (let i = cicadas.length - 1; i >= 0; i--) if (cicadas[i] < now) cicadas.splice(i, 1);
    n.cicadas.gain.setTargetAtTime(level.cicadas, now, 0.3);
    if (tg.cicadas > 0.05 && now >= nextCicada && cicadas.length < 1 + Math.round(tg.cicadas)) {
      cicadas.push(cicada(now + 0.05));
      nextCicada = now + rand(1.5, 5);
    }

    // wind gusts: wander between calm and blustery
    if (now >= gust.next) {
      gust.target = Math.pow(Math.random(), 1.4);
      gust.next = now + rand(2.5, 7);
    }
    gust.v += (gust.target - gust.v) * (1 - Math.exp(-dt / 1.4));
    const g = 0.35 + 0.65 * gust.v + 0.06 * Math.sin(now * 0.7);
    const sweep = Math.sin(now * 0.05) * 0.5;
    n.crisp.g.gain.setTargetAtTime(level.wind * 0.11 * g, now, 0.3);
    n.crisp.f.frequency.setTargetAtTime(550 + 1500 * gust.v, now, 0.5);
    n.whistle.g.gain.setTargetAtTime(level.wind * 0.035 * gust.v * gust.v, now, 0.4);
    n.whistle.f.frequency.setTargetAtTime(2200 + 900 * gust.v, now, 0.6);
    n.hush.g.gain.setTargetAtTime(level.hush * (0.7 + 0.3 * g), now, 0.6);
    if (n.crisp.p) n.crisp.p.pan.setTargetAtTime(sweep, now, 1);
    if (n.whistle.p) n.whistle.p.pan.setTargetAtTime(-sweep * 0.6, now, 1);
    if (level.rustle > 0.05 && gust.v > 0.45 && Math.random() < dt * 1.6 * level.rustle * gust.v) rustle(now + 0.05, level.rustle * gust.v);
  }

  // ---------------------------------------------------------------- room sounds
  /** Wood creaking: a slow train of ticks ringing through a few resonances. */
  function creak(t, dur, rate0, rate1, gain, bands = [650, 1150, 2300]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(rate0, t);
    o.frequency.linearRampToValueAtTime(rate1, t + dur);
    // stick and slip: the rate never runs quite steady
    const wob = ctx.createOscillator();
    wob.frequency.value = rand(6, 11);
    const wg = ctx.createGain();
    wg.gain.value = rate0 * 0.18;
    wob.connect(wg).connect(o.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + dur * 0.25);
    env.gain.linearRampToValueAtTime(gain * 0.6, t + dur * 0.7);
    env.gain.linearRampToValueAtTime(0, t + dur);
    env.connect(n.indoor);
    bands.forEach((f, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * rand(0.95, 1.05);
      bp.Q.value = 9;
      const bg = ctx.createGain();
      bg.gain.value = [1, 0.7, 0.35][i] ?? 0.3;
      o.connect(bp).connect(bg).connect(env);
    });
    for (const s of [o, wob]) { s.start(t); s.stop(t + dur + 0.05); }
  }

  function latch(t, gain = 1) {
    burst(t, 0.014, { gain: 0.25 * gain, type: 'highpass', from: 2800, q: 0.7 });
    note(t, 0.03, [2500, 1900], 0.035 * gain, n.indoor);
    burst(t + 0.035, 0.02, { gain: 0.14 * gain, type: 'bandpass', from: 1300, q: 1.5 });
  }

  function thud(t, gain = 1) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.32 * gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(n.indoor);
    o.start(t);
    o.stop(t + 0.22);
    burst(t, 0.09, { gain: 0.12 * gain, type: 'lowpass', from: 420, to: 160, q: 0.5 });
  }

  /** A puff of moving air. */
  function whoosh(t, dur, from, to, gain) {
    const src = ctx.createBufferSource();
    src.buffer = n.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.6;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.45);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(f).connect(g).connect(n.indoor);
    src.start(t, rand(0, 3));
    src.stop(t + dur + 0.02);
  }

  function windowSound(open, t = ctx.currentTime + 0.01) {
    holdAt(n.glass.frequency, t);
    holdAt(n.through.gain, t);
    if (open) {
      latch(t);
      creak(t + 0.06, rand(0.6, 0.8), rand(28, 36), rand(46, 58), 0.09);
      whoosh(t + 0.15, 1, 300, 1600, 0.035);
      // the outdoors pours in as the sashes swing wide
      n.glass.frequency.setTargetAtTime(OPEN.cutoff, t + 0.15, 0.45);
      n.through.gain.setTargetAtTime(OPEN.gain, t + 0.15, 0.4);
    } else {
      creak(t, rand(0.45, 0.6), rand(48, 56), rand(26, 32), 0.07);
      whoosh(t, 0.6, 1400, 400, 0.025);
      thud(t + 0.62, 0.8);
      latch(t + 0.74, 0.8);
      n.glass.frequency.setTargetAtTime(CLOSED.cutoff, t + 0.45, 0.12);
      n.through.gain.setTargetAtTime(CLOSED.gain, t + 0.45, 0.12);
    }
  }

  /** A page lifting, sweeping over and settling: about as long as the turn animation. */
  function pageSound(t, len = 0.82) {
    const d = len * rand(0.92, 1.08);
    const src = ctx.createBufferSource();
    src.buffer = n.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.9;
    f.frequency.setValueAtTime(rand(1500, 2000), t);
    f.frequency.linearRampToValueAtTime(rand(3000, 3800), t + d * 0.45);
    f.frequency.linearRampToValueAtTime(rand(1800, 2400), t + d * 0.85);
    const g = ctx.createGain();
    const peak = rand(0.08, 0.11);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak * 0.5, t + 0.07);    // the corner lifts
    g.gain.linearRampToValueAtTime(peak * 0.25, t + d * 0.25);
    g.gain.linearRampToValueAtTime(peak, t + d * 0.48);     // sweeping past upright
    g.gain.exponentialRampToValueAtTime(0.0001, t + d * 0.9);
    src.connect(f).connect(g).connect(n.indoor);
    src.start(t, rand(0, 3));
    src.stop(t + d + 0.05);
    // paper crinkles as it bends and again as it lands
    const crinkle = (at) => burst(at, rand(0.005, 0.016), { gain: rand(0.02, 0.06), type: 'highpass', from: rand(3000, 6500), q: 0.7 });
    for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) crinkle(t + Math.random() * 0.22);
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) crinkle(t + d * rand(0.68, 0.82));
    // and a soft flap as it settles
    burst(t + d * 0.76, 0.08, { gain: 0.07, type: 'lowpass', from: 800, to: 300, q: 0.5, attack: 0.006 });
  }

  const bookSounds = {
    flip(t = ctx.currentTime + 0.01) { pageSound(t); },
    open(t = ctx.currentTime + 0.01) {
      creak(t, 0.32, 24, 30, 0.035, [420, 900, 1800]); // the spine
      whoosh(t + 0.05, 0.95, 700, 1600, 0.04);
      pageSound(t + 0.1, 0.9);
      thud(t + 0.98, 0.3);
    },
    close(t = ctx.currentTime + 0.01) {
      whoosh(t, 0.75, 1500, 600, 0.045);
      thud(t + 0.77, 0.65);
      burst(t + 0.77, 0.03, { gain: 0.08, type: 'bandpass', from: 1200, q: 1.2 });
    },
  };

  /** A struck glass: a few inharmonic sine partials ringing down. */
  function glassRing(t, f, gain, decay = 1.2, pan = 0) {
    const out = pan ? panner(pan, n.indoor) : n.indoor;
    for (const [ratio, lvl, dk] of [[1, 1, 1], [2.32, 0.5, 0.7], [4.25, 0.25, 0.45], [6.8, 0.12, 0.3]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain * lvl, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay * dk);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + decay * dk + 0.05);
    }
  }

  // C major-ish pitches for her shimmer, so the bloom resolves rather than clashes
  const SHIMMER = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093];

  const roseSounds = {
    // the cloche lifted off its stand: a soft ring and a breath of air
    lift(t = ctx.currentTime + 0.01) {
      glassRing(t, 1760, 0.02, 1.4);
      whoosh(t + 0.05, 0.7, 500, 1800, 0.018);
    },
    // and set back down: a clink against the stand
    set(t = ctx.currentTime + 0.01) {
      whoosh(t, 0.6, 1600, 500, 0.015);
      glassRing(t + 0.62, 1480, 0.035, 0.9);
      burst(t + 0.62, 0.025, { gain: 0.05, type: 'bandpass', from: 2400, q: 1.5 });
    },
    // a little chime when she speaks, so you notice her
    speak(t = ctx.currentTime + 0.01) {
      note(t, 0.16, [2093, 2093], 0.012, n.indoor);
      note(t + 0.07, 0.24, [2637, 2637], 0.009, n.indoor);
    },
    // one crack spreading through the glass; progress 0..1 makes them sharper and closer
    crack(progress = 0, t = ctx.currentTime + 0.01) {
      burst(t, 0.012, { gain: 0.05 + 0.08 * progress, type: 'highpass', from: 3500, q: 0.7, pan: rand(-0.3, 0.3) });
      glassRing(t, rand(2600, 4200), 0.008 + 0.014 * progress, 0.5, rand(-0.4, 0.4));
    },
    // the glass gives way all at once
    shatter(t = ctx.currentTime + 0.01) {
      burst(t, 0.5, { gain: 0.2, type: 'highpass', from: 1800, q: 0.5, attack: 0.003 });
      burst(t, 0.18, { gain: 0.18, type: 'bandpass', from: 900, to: 400, q: 0.8 });
      thud(t, 0.35);
      // and the shards ring as they fall and land
      for (let i = 0; i < 46; i++) {
        const at = t + 0.02 + Math.pow(Math.random(), 1.6) * 1.8;
        glassRing(at, rand(2200, 5200), rand(0.006, 0.02) * (1 - (at - t) / 2.4), rand(0.25, 0.6), rand(-0.8, 0.8));
      }
    },
    // her bloom: a rising shimmer over a warm swell
    bloom(t = ctx.currentTime + 0.01) {
      SHIMMER.forEach((f, i) => glassRing(t + 0.35 + i * 0.16, f, 0.03 - i * 0.002, 2.6, (i % 2 ? 0.3 : -0.3)));
      const notes = [261.63, 329.63, 392, 523.25];
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(500, t);
      f.frequency.linearRampToValueAtTime(2400, t + 2.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 1.4);
      g.gain.setValueAtTime(0.05, t + 2.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
      f.connect(g).connect(n.indoor);
      for (const nf of notes) {
        for (const det of [-6, 6]) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = nf;
          o.detune.value = det;
          o.connect(f);
          o.start(t);
          o.stop(t + 6.1);
        }
      }
    },
  };

  // ---------------------------------------------------------------- lifecycle
  function ensure() {
    if (n) return true;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
    }
    build();
    return true;
  }

  function startTicking() {
    if (!timer && !context) timer = setInterval(() => tick(), 100);
  }
  function stopTicking() {
    clearInterval(timer);
    timer = 0;
    lastTick = 0;
  }

  function fadeMaster(to, tc) {
    const t = ctx.currentTime;
    holdAt(n.master.gain, t);
    n.master.gain.setTargetAtTime(to, t, tc);
  }

  /** Called on any user gesture: browsers only let audio begin after one. */
  function unlock() {
    if (!enabled || !ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (!timer && !document.hidden) {
      startTicking();
      fadeMaster(MASTER, 1.5); // the world fades in gently
    }
  }

  function applyDuck() {
    if (!n) return;
    const to = focus.game ? 0 : (focus.music ? 0.4 : 1) * (focus.book ? 0.75 : 1) * (focus.rose ? 0.35 : 1);
    const t = ctx.currentTime;
    holdAt(n.duck.gain, t);
    n.duck.gain.setTargetAtTime(to, t, 0.5);
  }

  if (!context) {
    const events = ['pointerdown', 'keydown', 'touchend'];
    const onGesture = () => {
      unlock();
      if (ctx && ctx.state === 'running') for (const e of events) window.removeEventListener(e, onGesture, true);
    };
    for (const e of events) window.addEventListener(e, onGesture, true);
    document.addEventListener('visibilitychange', () => {
      if (!n || !enabled) return;
      if (document.hidden) {
        stopTicking();
        ctx.suspend();
      } else {
        ctx.resume();
        startTicking();
      }
    });
  }

  // anything that only makes sense with sound running and switched on
  const live = (fn) => (...a) => { if (enabled && n && ctx.state === 'running') fn(...a); };

  return {
    /** Season weights, how dark it is, and the sun angle (0 sunrise, PI/2 noon). */
    setScene(season, night, theta) {
      scene.spring = season.spring;
      scene.summer = season.summer;
      scene.fall = season.fall;
      scene.winter = season.winter;
      scene.night = night;
      scene.morning = smooth(Math.cos(theta), 0.2, 0.85) * smooth(Math.sin(theta), -0.05, 0.12);
    },
    setFocus(next) {
      if (Object.keys(next).every((k) => next[k] === focus[k])) return;
      Object.assign(focus, next);
      applyDuck();
    },
    /** The window opened or shut: play it, or with sound off just keep the glass in step. */
    window(open) {
      if (open === windowOpen) return;
      windowOpen = open;
      if (!n) return; // the glass is built to match once sound starts
      if (enabled && ctx.state === 'running') {
        windowSound(open);
        return;
      }
      const t = ctx.currentTime;
      holdAt(n.glass.frequency, t);
      holdAt(n.through.gain, t);
      n.glass.frequency.setValueAtTime(open ? OPEN.cutoff : CLOSED.cutoff, t);
      n.through.gain.setValueAtTime(open ? OPEN.gain : CLOSED.gain, t);
    },
    book: new Proxy(bookSounds, { get: (o, k) => live(o[k]) }),
    rose: new Proxy(roseSounds, { get: (o, k) => live(o[k]) }),
    get enabled() { return enabled; },
    setEnabled(on) {
      enabled = on;
      writePref(on ? '1' : '0');
      if (on) {
        unlock();
      } else if (n) {
        fadeMaster(0, 0.15);
        stopTicking();
        setTimeout(() => { if (!enabled) ctx.suspend(); }, 600);
      }
    },
    // for offline rendering in tests: build on the given context and step the scheduler by hand
    _test: context ? {
      start() { ensure(); n.master.gain.value = MASTER; },
      tick,
      level,
      windowSound: (open, t) => { windowOpen = open; windowSound(open, t); },
      bookSounds,
      roseSounds,
      get nodes() { return n; },
    } : undefined,
  };
}

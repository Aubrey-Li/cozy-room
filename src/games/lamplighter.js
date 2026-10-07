// The Little Lamplighter: a short, cozy pixel-art game about giving your light
// away, and what happens to the little you have left.
//
// The world is drawn at 256x144 and scaled up with crisp pixels; dialogue and
// titles are drawn at full resolution on top so text stays readable.
// `attract: true` runs only the title screen (used on the desk monitor).

const W = 256, H = 144;
const FONT = '"Pixelify Sans", "Silkscreen", ui-monospace, Menlo, monospace';
const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => `rgb(${hex(a).map((v, i) => Math.round(lerp(v, hex(b)[i], clamp(t, 0, 1)))).join(',')})`;

// ---------------------------------------------------------------------------
// The story
// ---------------------------------------------------------------------------
const N = ''; // narrator
const PLANETS = {
  home: {
    lit: true,
    ground: '#5b8a52', dark: '#466d43', rim: '#8bc06e',
    sky: ['#14132e', '#211d45', '#352858'],
    props: [
      { type: 'house', a: -0.75 },
      { type: 'flowers', a: -1.25, bloom: true, color: '#f4a6b8' },
      { type: 'lamp', a: 0.75 },
      { type: 'rock', a: 1.25 },
      { type: 'pad', a: 1.9 },
    ],
    intro: [
      [N, 'This is your little planet.'],
      [N, 'Your lamp is bright, and so are you.'],
      [N, 'Out there, some little planets have gone dark.'],
      [N, "Find the landing stones when you're ready."],
    ],
  },
  garden: {
    ground: '#6f7f4c', dark: '#56653b', rim: '#9cb265',
    sky: ['#101a2e', '#1a2944', '#26385a'],
    resident: { kind: 'gardener', name: 'The Gardener', a: 0.55 },
    props: [
      { type: 'flowers', a: 0.25, color: '#6ec1e4' },
      { type: 'flowers', a: 0.9, color: '#6ec1e4' },
      { type: 'lamp', a: 1.3 },
      { type: 'flowers', a: -0.5, color: '#6ec1e4' },
      { type: 'pad', a: -1.4 },
    ],
    before: [
      ['The Gardener', 'Oh, a visitor. Mind the flowers.'],
      ['The Gardener', "I've watered them every night for years."],
      ['The Gardener', "But it's been too dark to see if they ever bloomed."],
    ],
    after: [
      ['The Gardener', '...Oh.'],
      ['The Gardener', "They're blue. All this time, they were blue."],
      ['The Gardener', 'Thank you, little lamplighter.'],
    ],
  },
  clock: {
    ground: '#7d6a58', dark: '#625243', rim: '#a68d6f',
    sky: ['#18122a', '#2a1d3d', '#3d2a4d'],
    resident: { kind: 'clockmaker', name: 'The Clockmaker', a: 0.5 },
    props: [
      { type: 'clocks', a: 0.15 },
      { type: 'bench', a: 0.85 },
      { type: 'lamp', a: 1.25 },
      { type: 'clocks', a: -0.6 },
      { type: 'pad', a: -1.35 },
    ],
    before: [
      ['The Clockmaker', "Can't stop, can't stop. So much to fix."],
      ['The Clockmaker', "If I stop working, I'm not sure what I'm for."],
    ],
    after: [
      ['The Clockmaker', "It's... quiet."],
      ['The Clockmaker', "I think I'll sit for a while. Just to see what it's like."],
    ],
  },
  wait: {
    ground: '#5c6c8c', dark: '#4a5873', rim: '#8399bb',
    sky: ['#0f1530', '#1a2348', '#28325c'],
    resident: { kind: 'waiter', name: 'The One Who Waits', a: 0.5 },
    props: [
      { type: 'porch', a: 0.62 },
      { type: 'lamp', a: 1.05 },
      { type: 'rock', a: -0.45 },
      { type: 'pad', a: -1.35 },
    ],
    before: [
      ['The One Who Waits', "Someone said they'd come back."],
      ['The One Who Waits', 'I kept the porch light on for them. Then it ran out.'],
    ],
    after: [
      ['The One Who Waits', "It's warm again."],
      ['The One Who Waits', "Maybe I don't have to wait for anyone to feel at home."],
    ],
  },
  two: {
    ground: '#8c5c6c', dark: '#724a58', rim: '#b98497',
    sky: ['#1a1030', '#2c1a40', '#40284e'],
    resident: { kind: 'two', name: 'The Two', a: 0.55 },
    props: [
      { type: 'fence', a: 0.55 },
      { type: 'lamp', a: 1.2 },
      { type: 'flowers', a: -0.35, bloom: true, color: '#f2cc8f' },
      { type: 'pad', a: -1.3 },
    ],
    before: [
      ['Rosa', 'We share a planet this small...'],
      ['Sage', "...and somehow we can't find each other."],
    ],
    after: [
      ['Rosa', 'Oh. There you are.'],
      ['Sage', 'There you are.'],
    ],
  },
  star: {
    lit: true, // candlelit
    ground: '#4c5c7c', dark: '#3c4a65', rim: '#7088b2',
    sky: ['#0c0f26', '#161c3c', '#222a52'],
    resident: { kind: 'child', name: 'The Star Child', a: 0.5 },
    props: [
      { type: 'candles', a: 0.22 },
      { type: 'jar', a: 0.74 },
      { type: 'candles', a: 1.02 },
      { type: 'candles', a: -0.4 },
      { type: 'candles', a: 1.45 },
      { type: 'pad', a: -1.3 },
    ],
    before: [
      ['The Star Child', "Oh, hello. You're the one who lights the lamps."],
      ['The Star Child', 'Come sit. I was just counting my candles.'],
      ['The Star Child', 'Each one is a little light somebody gave me.'],
      ['The Star Child', "This one's from a gardener. This one, from someone I've never met."],
      ['The Star Child', 'And when theirs runs low, I give a little back.'],
      ['The Star Child', 'I think light likes to go around.'],
      ['The Star Child', 'Your light looks so small now.'],
      ['The Star Child', 'Where will you go next?', { choices: ['Visit the others again', 'Go home'] }],
    ],
  },
};

// coming back to a planet you lit; some have a little light to give, some don't
const revisit = (key, lines, gift = null) => ({ ...PLANETS[key], lit: true, revisit: true, before: lines, gift });
PLANETS.garden2 = revisit('garden', [
  ['The Gardener', 'Little lamplighter! You came back.'],
  ['The Gardener', "The flowers haven't stopped blooming since."],
  ['The Gardener', 'Here, take a little of this light. It started as yours, after all.'],
], '#8fd3f0');
PLANETS.clock2 = revisit('clock', [
  ['The Clockmaker', 'Oh! Hello again.'],
  ['The Clockmaker', "I'm sorry. I don't have any to spare, not yet."],
  ['The Clockmaker', "I'm still learning how to rest. Safe travels, little one."],
]);
PLANETS.wait2 = revisit('wait', [
  ['The One Who Waits', 'You came back. Nobody ever comes back.'],
  ['The One Who Waits', 'Here. One for your porch, too.'],
], '#c9b8f0');
PLANETS.two2 = revisit('two', [
  ['Rosa', "We're still finding our way to each other."],
  ['Sage', 'We need every bit of light we have, for now.'],
  ['Rosa', "But we'll never forget who lit it."],
]);
PLANETS.homeReturn = {
  ...PLANETS.home,
  lit: false,
  props: PLANETS.home.props.filter((p) => p.type !== 'pad'),
  intro: [
    [N, 'Home.'],
    [N, 'Your lamp went out while you were away.'],
  ],
};

const ENDINGS = {
  together: {
    hold: 'hold to pour the light into your lamp',
    lines: ['A little light from them.', 'A little light from you.', 'Together, it is enough.'],
    close: [[N, 'Far away, four lamps are glowing.'], [N, 'And here, their light and yours, together.']],
  },
  alone: {
    hold: 'hold to give your light to your lamp',
    lines: ['You still have a little left.', 'This time, you keep it for yourself.', 'It is enough.'],
    close: [[N, 'Far away, four lamps are glowing.'], [N, 'And here, warm and small, so is yours.']],
  },
};
const FIRST = ['home', 'garden', 'clock', 'wait', 'two', 'star'];
const GIVE = 0.18; // light given away with each lamp

// [text, size, colour, y]
const CREDITS = [
  ['The Little Lamplighter', 15, '#ffd98a', 26],
  ['a little game by aubrey', 8, '#f3e6d3', 44],
  ['for everyone who gives their light away,', 7, '#d9cbe8', 74],
  ['remember to keep some for yourself.', 7, '#d9cbe8', 84],
  ['thank you for playing', 8, '#ffd98a', 108],
];

// ---------------------------------------------------------------------------

export function createLamplighter(display, { attract = false, onEvent = () => {} } = {}) {
  const emit = (name, data) => { if (!attract) onEvent(name, data); };
  const low = document.createElement('canvas');
  low.width = W; low.height = H;
  const g = low.getContext('2d');
  const shade = document.createElement('canvas');
  shade.width = W; shade.height = H;
  const sg = shade.getContext('2d');
  const out = display.getContext('2d');
  if (attract) { display.width = W; display.height = H; }

  const R = 58, CX = 128, GROUND = 112, CY = GROUND + R; // the planet; you stand on its top
  const stars = Array.from({ length: 70 }, (_, i) => ({
    x: (i * 97.3) % W, y: (i * 41.7) % 104, s: i % 7 === 0 ? 2 : 1, p: (i * 1.7) % TAU,
  }));
  const input = { left: false, right: false, action: false };
  const fresh = () => ({
    scene: 'title', t: 0, glow: 1, flash: 0, fade: 1, flicker: 0,
    route: [...FIRST], stop: 0, planet: null, path: null,
    theta: 0, facing: 1, walk: 0, jumpY: 0, vy: 0, squash: 0,
    dialog: null, anim: null, gift: null, travel: null, parts: [],
    bottles: [], hold: 0, holdBase: undefined, holdLine: '', ending: 0, endingSaid: false, credits: 0,
  });
  let S = fresh();

  // ---------------- scenes and story flow
  function loadPlanet(i) {
    const key = S.route[i];
    const def = PLANETS[key];
    S.stop = i;
    S.planet = { key, def, lampLit: !!def.lit, phase: def.intro ? 'intro' : 'explore' };
    Object.assign(S, { theta: 0, jumpY: 0, vy: 0, scene: 'planet', fade: 1 });
    if (def.intro) say(def.intro, () => { S.planet.phase = key === 'homeReturn' ? 'holdReady' : 'done'; });
    emit('arrive', key);
  }
  function say(lines, done) { S.dialog = { lines: [...lines], i: 0, chars: 0, sel: 0, done }; }
  const curLine = () => (S.dialog ? S.dialog.lines[S.dialog.i] : null);

  function choose(sel) {
    S.path = sel === 0 ? 'together' : 'alone';
    if (S.path === 'together') S.route.push('garden2', 'clock2', 'wait2', 'two2', 'homeReturn');
    else S.route.push('homeReturn');
    return sel === 0
      ? [['The Star Child', 'I hope they remember you.']]
      : [['The Star Child', 'Home sounds nice. Safe travels.']];
  }

  function finishTalk() {
    const p = S.planet;
    const def = p.def;
    if (def.revisit) {
      if (def.gift) { S.gift = { t: 0, color: def.gift }; emit('gift'); }
      else p.phase = 'done';
    } else {
      p.phase = def.props.some((q) => q.type === 'lamp') ? 'light' : 'done';
    }
  }

  // ---------------- interaction
  function nearest() {
    const p = S.planet;
    if (!p || S.scene !== 'planet' || S.dialog || S.anim || S.gift) return null;
    const near = (a) => Math.abs(wrap(a - S.theta)) < 0.3; // close enough to stand beside
    const res = p.def.resident;
    if (res && near(res.a) && p.phase === 'explore') return { kind: 'talk', label: 'talk' };
    const lamp = p.def.props.find((q) => q.type === 'lamp');
    if (lamp && near(lamp.a)) {
      if (p.phase === 'light') return { kind: 'light', label: 'light the lamp' };
      if (p.phase === 'holdReady') return { kind: 'hold', label: ENDINGS[S.path].hold };
    }
    const pad = p.def.props.find((q) => q.type === 'pad');
    if (pad && near(pad.a) && p.phase === 'done') {
      return { kind: 'go', label: S.route[S.stop + 1] === 'homeReturn' ? 'go home' : 'hop to the next planet' };
    }
    return null;
  }

  function actionDown() {
    if (attract) return;
    if (S.scene === 'title') { S.scene = 'fadeToStart'; emit('start'); return; }
    if (S.scene === 'credits') { if (S.credits > 9) { S = fresh(); emit('title'); } return; }
    if (S.dialog) {
      const line = curLine();
      if (S.dialog.chars < line[1].length) { S.dialog.chars = line[1].length; return; }
      if (line[2]?.choices) {
        emit('choose');
        const extra = choose(S.dialog.sel);
        S.dialog.lines.splice(S.dialog.i + 1, 0, ...extra);
      }
      S.dialog.i++;
      S.dialog.chars = 0;
      if (!line[2]?.choices) emit('advance');
      if (S.dialog.i >= S.dialog.lines.length) {
        const done = S.dialog.done;
        S.dialog = null;
        done?.();
      }
      return;
    }
    if (S.scene !== 'planet' || S.anim || S.gift) return;
    const n = nearest();
    const p = S.planet;
    if (n?.kind === 'talk') say(p.def.before, finishTalk);
    else if (n?.kind === 'light') { S.anim = { t: 0, dur: 2.4, from: S.glow }; emit('lightStart'); }
    else if (n?.kind === 'go') { S.travel = { t: 0, next: S.stop + 1 }; S.scene = 'travel'; emit('travel'); }
    else if (n?.kind === 'hold') { /* handled while held */ }
    else if (S.jumpY <= 0.01) {
      S.vy = 118 * (0.32 + 0.68 * S.glow); // a light bloop hops high; a dim one barely leaves the ground
      S.squash = -0.35;
      emit('hop', S.glow);
    }
  }

  function choiceInput(dir) {
    const line = curLine();
    if (!line?.[2]?.choices || S.dialog.chars < line[1].length) return false;
    const sel = clamp(S.dialog.sel + dir, 0, line[2].choices.length - 1);
    if (sel !== S.dialog.sel) emit('choiceMove');
    S.dialog.sel = sel;
    return true;
  }

  // ---------------- update
  function puff(x, y, n, color) {
    for (let i = 0; i < n; i++) S.parts.push({ x, y, vx: (Math.random() - 0.5) * 24, vy: -Math.random() * 12, life: 0.5 + Math.random() * 0.3, color });
  }

  function update(dt) {
    dt = Math.min(dt, 0.05);
    S.t += dt;
    S.flash = Math.max(0, S.flash - dt * 1.5);
    S.flicker = Math.max(0, S.flicker - dt);
    S.squash *= Math.exp(-dt * 9);
    S.parts = S.parts.filter((q) => (q.life -= dt) > 0);
    for (const q of S.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 40 * dt; }

    if (attract || S.scene === 'title') { S.theta += dt * 0.12; S.fade = Math.max(0, S.fade - dt); return; }
    if (S.scene === 'fadeToStart') { S.fade = Math.min(1, S.fade + dt * 2); if (S.fade >= 1) loadPlanet(0); return; }
    if (S.dialog) {
      const before = Math.floor(S.dialog.chars);
      S.dialog.chars += dt * 38;
      const [who, line] = curLine();
      const now = Math.floor(S.dialog.chars);
      if (now > before && now <= line.length && now % 2 === 0 && line[now - 1] !== ' ') emit('blip', who ? 1 : 0);
    }
    S.fade = Math.max(0, S.fade - dt * 1.4);
    if (S.scene === 'travel') { S.travel.t += dt / 3.2; if (S.travel.t >= 1) loadPlanet(S.travel.next); return; }
    if (S.scene === 'credits') { S.credits += dt; return; }
    if (S.scene !== 'planet') return;
    const p = S.planet;

    // walking around the little planet (it turns under you); slower when dim
    if (!S.dialog && !S.anim && !S.gift && p.phase !== 'ending') {
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (dir) {
        const speed = 36 * (0.4 + 0.6 * S.glow);
        S.theta += (dir * speed * dt) / R;
        S.facing = dir;
        const step = Math.floor(S.walk / 9);
        S.walk += dt * speed;
        if (Math.floor(S.walk / 9) !== step && S.jumpY === 0) emit('step');
      }
    }
    // hopping: gravity, then a squish on landing that is bigger when you're heavy
    S.vy -= 300 * dt;
    const wasUp = S.jumpY > 0;
    S.jumpY = Math.max(0, S.jumpY + S.vy * dt);
    if (wasUp && S.jumpY === 0) {
      S.squash = clamp(0.35 + (1 - S.glow) * 0.5, 0, 0.8);
      emit('land', 1 - S.glow);
      if (S.glow < 0.65) puff(CX, GROUND, 4, '#9a96a8');
    }
    if (S.jumpY === 0 && S.vy < 0) S.vy = 0;

    // giving your light to a lamp: your bulb visibly dims as it flows across
    if (S.anim) {
      S.anim.t += dt;
      const k = clamp(S.anim.t / S.anim.dur, 0, 1);
      S.glow = lerp(S.anim.from, Math.max(0.1, S.anim.from - GIVE), ease(k));
      if (k >= 1) {
        S.anim = null;
        p.lampLit = true;
        S.flash = 1;
        S.flicker = 1.3; // the bulb sputters, then settles dimmer
        emit('lampLit');
        setTimeout(() => emit('flicker'), 250);
        p.phase = 'afterwards';
        setTimeout(() => say(p.def.after, () => { p.phase = 'done'; }), 900);
      }
    }
    // a little light handed back, in a glass bottle
    if (S.gift) {
      S.gift.t += dt / 1.4;
      if (S.gift.t >= 1) {
        S.bottles.push(S.gift.color);
        S.gift = null;
        emit('giftArrive');
        p.phase = 'done';
      }
    }

    // home again: hold to give your light (and any bottles) to your lamp
    if (p.phase === 'holdReady') {
      const n = nearest();
      if (S.holdBase === undefined) S.holdBase = S.glow;
      if (input.action && n?.kind === 'hold') S.hold = Math.min(1, S.hold + dt / 5);
      else S.hold = Math.max(0, S.hold - dt / 3);
      S.glow = lerp(S.holdBase, 0.05, S.hold);
      const L = ENDINGS[S.path].lines;
      const prev = S.holdLine;
      S.holdLine = S.hold > 0.8 ? L[2] : S.hold > 0.48 ? L[1] : S.hold > 0.16 ? L[0] : '';
      if (S.holdLine && S.holdLine !== prev) emit('holdLine');
      emit('hold', S.hold);
      if (S.hold >= 1) {
        p.phase = 'ending';
        p.lampLit = true;
        S.flash = 1.2;
        S.ending = 0;
        S.holdLine = '';
        S.bottles = [];
        emit('ignite');
      }
    }
    if (p.phase === 'ending') {
      S.ending += dt;
      // and then your lamp lights you back
      if (S.ending > 0.8) S.glow = lerp(S.glow, 1, 1 - Math.exp(-dt * 1.1));
      if (S.ending > 3 && !S.dialog && !S.endingSaid) {
        S.endingSaid = true;
        say(ENDINGS[S.path].close, () => { S.scene = 'credits'; S.credits = 0; emit('credits'); });
      }
    }
  }

  // ---------------- drawing helpers (low-res)
  const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const rpx = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); }; // inside rotated frames
  function ellipse(cx, cy, rx, ry, color) {
    g.fillStyle = color;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (Math.abs(dy) > 1) continue;
      const hw = rx * Math.sqrt(1 - dy * dy);
      const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
      if (x1 > x0) g.fillRect(x0, y, x1 - x0, 1);
    }
  }
  const disk = (cx, cy, r, color) => ellipse(cx, cy, r, r, color);

  function sky(def) {
    const [a, b, c] = def.sky.map(hex);
    for (let y = 0; y < H; y++) {
      const t = y / (H - 1);
      const [from, to, k] = t < 0.55 ? [a, b, t / 0.55] : [b, c, (t - 0.55) / 0.45];
      g.fillStyle = `rgb(${from.map((v, i) => Math.round(lerp(v, to[i], k))).join(',')})`;
      g.fillRect(0, y, W, 1);
    }
    for (const st of stars) {
      if (Math.sin(S.t * 1.6 + st.p) < -0.6) continue;
      px(st.x, st.y, st.s, st.s, st.s > 1 ? '#fff4d6' : '#c9c2ea');
    }
  }

  function farPlanets(lit) {
    const spots = [[30, 66, 7, '#9cb265', '#6f7f4c'], [72, 58, 6, '#a68d6f', '#7d6a58'], [188, 56, 6, '#8399bb', '#5c6c8c'], [228, 70, 7, '#b98497', '#8c5c6c']];
    spots.forEach(([x, y, r, rim, body], i) => {
      if (i >= lit) return;
      const tw = 0.75 + 0.25 * Math.sin(S.t * 2 + i);
      g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(x, y - r - 3, 0, x, y - r - 3, 14);
      gr.addColorStop(0, `rgba(255, 190, 110, ${0.5 * tw})`);
      gr.addColorStop(1, 'rgba(255, 190, 110, 0)');
      g.fillStyle = gr;
      g.fillRect(x - 14, y - r - 17, 28, 28);
      g.globalCompositeOperation = 'source-over';
      disk(x, y, r, rim);
      disk(x, y + 1, r - 1, body);
      px(x, y - r - 4, 1, 4, '#4a4258');
      px(x - 1, y - r - 5, 3, 2, '#ffd98a');
    });
  }

  function drawPlanetBody(def) {
    disk(CX, CY, R, def.rim);
    disk(CX, CY, R - 2, def.ground);
    disk(CX, CY, R - 11, def.dark);
    for (let i = 0; i < 26; i++) {
      const a = i * 0.83 - S.theta;
      const rr = R - 4 - (i % 4) * 3;
      const x = CX + Math.sin(a) * rr, y = CY - Math.cos(a) * rr;
      if (y < H) px(x, y, 1 + (i % 2), 1, i % 3 ? def.dark : def.rim);
    }
  }

  function bottle(x, y, color, alpha = 1) {
    g.save();
    g.globalAlpha = alpha;
    px(x - 1, y - 5, 2, 1, '#a07a55');                       // cork
    px(x - 1, y - 4, 2, 1, 'rgba(210, 235, 255, 0.7)');      // neck
    px(x - 2, y - 3, 4, 4, 'rgba(210, 235, 255, 0.45)');     // glass
    const tw = 0.7 + 0.3 * Math.sin(S.t * 4 + x);
    px(x - 1, y - 2, 2, 2, color);
    g.globalAlpha = alpha * tw;
    px(x - 1, y - 2, 1, 1, '#ffffff');
    g.restore();
  }

  // props are drawn upright with their feet at (0,0) inside a rotated frame
  function drawProp(q, p) {
    const lit = p.lampLit;
    switch (q.type) {
      case 'lamp':
        rpx(-0.5, -15, 1, 15, '#5a5070'); rpx(-1.5, -1, 3, 1, '#5a5070'); rpx(-2, -19, 4, 1, '#5a5070');
        rpx(-1.5, -18, 3, 3, lit ? '#ffd98a' : '#9a96b4');
        if (lit) rpx(-0.5, -17, 1, 1, '#fff6d8');
        break;
      case 'house':
        rpx(-8, -10, 16, 10, '#e9d6b4');
        for (let i = 0; i < 6; i++) rpx(-9 + i, -11 - i, 18 - i * 2, 1, '#b5574a');
        rpx(-6, -6, 3, 6, '#7a4a35');
        rpx(2, -7, 4, 3, lit ? '#ffd98a' : '#3a3550');
        rpx(4, -7, 1, 3, '#e9d6b4');
        break;
      case 'flowers': {
        const bloom = q.bloom || lit;
        for (let i = -2; i <= 2; i++) {
          const h = 3 + ((i + 3) % 3);
          rpx(i * 3, -h, 1, h, '#3f6b3a');
          if (bloom) { rpx(i * 3 - 1, -h - 2, 3, 2, q.color); rpx(i * 3, -h - 2, 1, 1, '#fff3b0'); }
          else rpx(i * 3, -h - 1, 1, 1, '#2f4a2c');
        }
        break;
      }
      case 'rock': rpx(-3, -3, 6, 3, '#8a8a9a'); rpx(-2, -4, 3, 1, '#a3a3b3'); break;
      case 'pad': {
        const on = p.phase === 'done';
        for (const x of [-6, -3, 0, 3]) rpx(x, -1, 2, 1, on ? '#ffe7b0' : '#9a96a8');
        if (on && Math.sin(S.t * 5) > 0) rpx(-1, -4 - Math.floor((S.t * 6) % 4), 1, 1, '#fff6d8');
        break;
      }
      case 'clocks':
        for (const [x, y, s] of [[-5, -9, 5], [1, -6, 4], [-2, -15, 4]]) {
          rpx(x, y, s, s, '#d9c9a3');
          const a = lit ? 0.6 : S.t * (2 + s);
          const cx = x + s / 2, cy = y + s / 2;
          rpx(Math.round(cx + Math.cos(a) * 1.4) - 0.5, Math.round(cy + Math.sin(a) * 1.4) - 0.5, 1, 1, '#3a2a20');
        }
        rpx(-6, -2, 12, 2, '#5c4636');
        break;
      case 'bench': rpx(-5, -3, 10, 1, '#8d5a3b'); rpx(-4, -2, 1, 2, '#5c3a26'); rpx(3, -2, 1, 2, '#5c3a26'); break;
      case 'porch': rpx(-7, -1, 14, 1, '#a07a55'); rpx(-6, -9, 1, 8, '#a07a55'); rpx(5, -9, 1, 8, '#a07a55'); rpx(-7, -10, 14, 1, '#7a5a40'); break;
      case 'fence': rpx(-0.5, -9, 1, 9, '#d8c6ae'); rpx(-1.5, -10, 3, 1, '#d8c6ae'); break;
      case 'jar':
        rpx(-2, -6, 4, 6, 'rgba(200, 230, 255, 0.35)');
        rpx(-2, -7, 4, 1, '#c9b6a0');
        for (let i = 0; i < 4; i++) if (Math.sin(S.t * 3 + i * 2) > -0.3) rpx(-1 + (i % 2) * 2, -5 + Math.floor(i / 2) * 2, 1, 1, '#ffe7b0');
        break;
      case 'candles':
        // a little cluster of candles, each a light somebody gave
        for (const [x, h] of [[-3, 4], [0, 6], [3, 3]]) {
          rpx(x, -h, 1.5, h, '#f1e6d3');
          const fl = Math.sin(S.t * 9 + x * 2 + q.a * 5) > -0.2 ? '#ffd166' : '#ffb347';
          rpx(x, -h - 2, 1.5, 2, fl);
        }
        break;
    }
  }

  function person(x, y, { body, head = '#ffe3c2', hair, hat, face = 1, sit = false, small = false, prop }) {
    const s = small ? 0.8 : 1;
    const h = sit ? 4 : 6;
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    rpx(-3, -h, 6, h, body);
    if (!sit) { rpx(-2, -1, 1, 1, '#2b2433'); rpx(1, -1, 1, 1, '#2b2433'); }
    rpx(-2, -h - 4, 4, 4, head);
    if (hair) rpx(-2, -h - 4, 4, 1, hair);
    if (hat) { rpx(-3, -h - 5, 6, 1, hat); rpx(-2, -h - 7, 4, 2, hat); }
    rpx(face > 0 ? 1 : -2, -h - 2, 1, 1, '#2b2433');
    if (prop === 'can') { rpx(face * 4 - 1, -h + 1, 3, 2, '#9aa3ad'); rpx(face * 6, -h + 1, 1, 1, '#9aa3ad'); }
    g.restore();
  }

  function drawResident(def, p) {
    const lit = p.lampLit;
    switch (def.resident.kind) {
      case 'gardener': person(0, 0, { body: '#6a994e', hair: '#d6d6d6', face: -1, prop: 'can' }); break;
      case 'clockmaker':
        if (lit) person(4, -2, { body: '#8d5a3b', hat: '#3a2a20', face: -1, sit: true });
        else person(Math.sin(S.t * 4) * 3, 0, { body: '#8d5a3b', hat: '#3a2a20', face: Math.cos(S.t * 4) > 0 ? 1 : -1 });
        break;
      case 'waiter':
        rpx(1, -4, 5, 1, '#7a5a40'); rpx(5, -8, 1, 8, '#7a5a40');
        person(3, -1, { body: '#9d8ec7', hair: '#4a3a3a', face: -1, sit: true });
        break;
      case 'two':
        person(-5, 0, { body: '#e07a5f', hair: '#6b3a2a', face: lit ? 1 : -1 });
        person(5, 0, { body: '#3d9a8b', hair: '#2b2433', face: lit ? -1 : 1 });
        if (lit && Math.sin(S.t * 2) > 0.2) rpx(-0.5, -16, 1, 1, '#ff9fb2');
        break;
      case 'child':
        person(0, 0, { body: '#f2cc5b', hat: '#f2cc5b', face: -1, small: true, sit: true });
        break;
    }
  }

  // ---------------- the bloop
  function bulbBrightness() {
    const sputter = S.flicker > 0 ? (Math.sin(S.t * 38) > 0 ? 1 : 0.25) : 1;
    const breathe = 0.92 + 0.08 * Math.sin(S.t * (S.glow < 0.4 ? 9 : 3));
    return clamp(S.glow * sputter * breathe, 0, 1);
  }

  /** Draw the bloop with feet at (fx, fy); returns where the bulb is. */
  function drawBloop(fx, fy, scale = 1) {
    const f = S.facing;
    const sq = S.squash;
    const heavy = 1 - S.glow;
    const moving = (input.left || input.right) && !S.dialog && S.jumpY === 0;
    const bob = moving ? Math.abs(Math.sin(S.walk * 0.45)) * (1.2 - heavy * 0.6) : 0;
    const rx = (5 + sq * 1.4 + heavy * 0.6) * scale;              // a dim bloop sags wider and flatter
    const ry = (4.6 - sq * 1.2 - heavy * 0.7) * scale;
    const cx = fx, cy = fy - ry - bob;
    const body = mix('#a7aabd', '#fff1dc', S.glow);
    const belly = mix('#8b8ea3', '#f3d9bd', S.glow);
    ellipse(cx, cy, rx, ry, belly);
    ellipse(cx, cy - 0.6 * scale, rx - 0.5 * scale, ry - 0.7 * scale, body);
    px(cx - 2 * scale, cy - 2 * scale, 1, 1, 'rgba(255,255,255,0.8)');
    // two small black round eyes, glancing the way you're going; an occasional blink
    const blink = (S.t % 4.3) < 0.13;
    const ex = cx + f * 1.2 * scale;
    if (!blink) {
      px(ex - 2 * scale, cy - 0.5 * scale, 1, scale > 0.8 ? 2 : 1, '#1d1620');
      px(ex + 1 * scale, cy - 0.5 * scale, 1, scale > 0.8 ? 2 : 1, '#1d1620');
    } else {
      px(ex - 2 * scale, cy + 0.5 * scale, 1, 1, '#1d1620');
      px(ex + 1 * scale, cy + 0.5 * scale, 1, 1, '#1d1620');
    }
    if (S.glow > 0.55) { // rosy cheeks while you're bright
      px(ex - 3 * scale, cy + 1.5 * scale, 1, 1, 'rgba(244, 150, 160, 0.7)');
      px(ex + 2 * scale, cy + 1.5 * scale, 1, 1, 'rgba(244, 150, 160, 0.7)');
    }
    // the antenna stands tall when you're bright and droops as your light fades
    let x = cx - f * 0.5 * scale, y = cy - ry + 0.5;
    const droop = heavy * 1.35;
    const steps = Math.round(6 * scale);
    for (let k = 1; k <= steps; k++) {
      const a = f * (0.1 + droop * (k / steps));
      x += Math.sin(a) * scale;
      y -= Math.cos(a) * scale;
      px(x, y, 1, 1, mix('#6d6a80', '#8a7a6a', S.glow));
    }
    const b = bulbBrightness();
    const bx = x + Math.sin(f * (0.1 + droop)) * 1.5 * scale, by = y - Math.cos(f * (0.1 + droop)) * 1.5 * scale;
    ellipse(bx, by, 1.6 * scale, 1.6 * scale, mix('#5d5560', '#ffd166', b));
    if (b > 0.35) px(bx - 0.5, by - 0.5, 1, 1, mix('#ffd166', '#fffbe8', b));
    return { x: bx, y: by };
  }

  function drawBottlesFollowing(fx, fy) {
    S.bottles.forEach((color, i) => {
      if (S.planet?.phase === 'holdReady' && i < Math.floor(S.hold * (S.bottles.length + 1))) return; // poured
      const x = fx - S.facing * (10 + i * 5);
      const y = fy - 6 - Math.sin(S.t * 3 + i) * 1.5;
      bottle(x, y, color);
    });
  }

  function lights(list, darkness) {
    sg.globalCompositeOperation = 'source-over';
    sg.clearRect(0, 0, W, H);
    sg.fillStyle = `rgba(6, 4, 18, ${darkness})`;
    sg.fillRect(0, 0, W, H);
    sg.globalCompositeOperation = 'destination-out';
    for (const l of list) {
      if (l.r <= 0.5) continue;
      const gr = sg.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(0.5, 'rgba(0,0,0,0.6)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      sg.fillStyle = gr;
      sg.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    g.drawImage(shade, 0, 0);
    g.globalCompositeOperation = 'lighter';
    for (const l of list) {
      if (l.r <= 0.5) continue;
      const gr = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * 0.8);
      gr.addColorStop(0, `rgba(255, 170, 80, ${0.22 * (l.warm ?? 1)})`);
      gr.addColorStop(1, 'rgba(255, 170, 80, 0)');
      g.fillStyle = gr;
      g.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    g.globalCompositeOperation = 'source-over';
  }

  const stream = (from, to, t, n = 14, arc = 14) => {
    for (let i = 0; i < n; i++) {
      const k = (t * 0.9 + i / n) % 1;
      const x = lerp(from.x, to.x, k), y = lerp(from.y, to.y, k) - Math.sin(k * Math.PI) * arc;
      px(x, y, 1, 1, i % 3 ? '#ffd98a' : '#fff6d8');
    }
  };

  // ---------------- the planet scene
  function drawPlanetScene(def, p, { player = true } = {}) {
    sky(def);
    drawPlanetBody(def);
    const list = [];
    const place = (a) => ({ x: CX + Math.sin(a) * R, y: CY - Math.cos(a) * R });
    const spots = {};
    const items = [...def.props.map((q) => ({ q })), ...(def.resident ? [{ res: def.resident }] : [])];
    for (const it of items) {
      const a = wrap((it.q ? it.q.a : it.res.a) - S.theta);
      if (Math.abs(a) > 1.5) continue;
      const pos = place(a);
      g.save();
      g.translate(pos.x, pos.y);
      g.rotate(a);
      if (it.q) drawProp(it.q, p); else drawResident(def, p);
      g.restore();
      const at = (lx, ly) => ({ x: pos.x + lx * Math.cos(a) - ly * Math.sin(a), y: pos.y + lx * Math.sin(a) + ly * Math.cos(a) });
      if (it.q?.type === 'lamp') { spots.lamp = at(0, -17); if (p.lampLit) list.push({ ...spots.lamp, r: 48 + 6 * Math.sin(S.t * 2) }); }
      if (it.q?.type === 'house' && p.lampLit) list.push({ ...at(4, -6), r: 16, warm: 0.6 });
      if (it.q?.type === 'jar') list.push({ ...at(0, -4), r: 18, warm: 0.4 });
      if (it.q?.type === 'candles') list.push({ ...at(0, -7), r: 20 + Math.sin(S.t * 7 + it.q.a) * 1.5, warm: 0.8 });
      if (it.res) spots.res = at(0, -8);
    }
    let bulb = { x: CX, y: GROUND - 18 };
    if (player) {
      const fy = GROUND - Math.round(S.jumpY);
      drawBottlesFollowing(CX, GROUND);
      bulb = drawBloop(CX, fy);
      S.bottles.forEach((_, i) => list.push({ x: CX - S.facing * (10 + i * 5), y: GROUND - 8, r: 9, warm: 0.5 }));
    }
    list.push({ ...bulb, r: 8 + 52 * bulbBrightness() });

    // light flowing from your bulb to the lamp
    if (S.anim && spots.lamp) {
      stream(bulb, spots.lamp, S.anim.t);
      list.push({ ...spots.lamp, r: 14 * clamp(S.anim.t / S.anim.dur, 0, 1) });
    }
    // a bottle of light floating over from a friend
    if (S.gift && spots.res) {
      const k = ease(S.gift.t);
      const x = lerp(spots.res.x, CX - S.facing * (10 + S.bottles.length * 5), k);
      const y = lerp(spots.res.y, GROUND - 6, k) - Math.sin(k * Math.PI) * 16;
      bottle(x, y, S.gift.color);
      list.push({ x, y: y - 2, r: 12, warm: 0.6 });
    }
    // pouring at home, and the lamp lighting you back
    if (p.phase === 'holdReady' && S.hold > 0 && spots.lamp) {
      stream(bulb, spots.lamp, S.t * 0.8, Math.ceil(4 + S.hold * 10));
      S.bottles.forEach((color, i) => {
        if (i < Math.floor(S.hold * (S.bottles.length + 1))) stream({ x: CX - S.facing * (10 + i * 5), y: GROUND - 8 }, spots.lamp, S.t * 0.7 + i * 0.3, 6, 10);
      });
      list.push({ ...spots.lamp, r: 10 + 30 * S.hold });
    }
    if (p.phase === 'ending' && spots.lamp && S.ending > 0.8 && S.ending < 4.5) stream(spots.lamp, bulb, S.ending * 0.7, 10, 10);

    for (const q of S.parts) px(q.x, q.y, 1, 1, q.color);
    const darkness = (p.lampLit ? 0.16 : 0.5) + (1 - S.glow) * 0.36;
    lights(list, clamp(darkness, 0, 0.9));
    const finale = p.phase === 'ending' || S.scene === 'credits';
    if (finale) farPlanets(S.scene === 'credits' ? 4 : clamp(Math.floor((S.ending - 1.4) / 0.45), 0, 4));
    if (S.flash > 0) { g.fillStyle = `rgba(255, 236, 190, ${S.flash * 0.35})`; g.fillRect(0, 0, W, H); }
  }

  function drawTravel() {
    const tr = S.travel;
    sky(PLANETS[S.route[Math.min(tr.next, S.route.length - 1)]]);
    for (const st of stars) {
      const x = (st.x - tr.t * 260 * (st.s + 1)) % W;
      px(x < 0 ? x + W : x, st.y, 2 + st.s * 2, 1, '#c9c2ea');
    }
    const k = ease(tr.t);
    const x = lerp(-10, W + 10, k), y = 84 - Math.sin(k * Math.PI) * 40;
    for (let i = 1; i < 10; i++) px(x - i * 4, y - 3 + i * 0.6, 1, 1, i % 2 ? '#ffd98a' : '#fff6d8');
    S.bottles.forEach((color, i) => bottle(x - 9 - i * 6, y + 1 + Math.sin(S.t * 5 + i), color));
    const bulb = drawBloop(x, y, 0.85);
    lights([{ ...bulb, r: 8 + 40 * bulbBrightness() }], 0.25 + (1 - S.glow) * 0.32);
  }

  // ---------------- text on the full-resolution canvas
  const sc = () => display.width / W;
  function text(str, x, y, { size = 8, color = '#fff6e8', align = 'center', alpha = 1, shadow = true } = {}) {
    const s = sc();
    out.save();
    out.globalAlpha = alpha;
    out.font = `${Math.round(size * s)}px ${FONT}`;
    out.textAlign = align;
    out.textBaseline = 'middle';
    if (shadow) { out.fillStyle = 'rgba(10, 6, 20, 0.85)'; out.fillText(str, x * s + Math.max(1, s * 0.5), y * s + Math.max(1, s * 0.5)); }
    out.fillStyle = color;
    out.fillText(str, x * s, y * s);
    out.restore();
  }
  // a little pixel star, drawn in crisp blocks to match the game
  const STAR = ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'];
  function star(x, y, size, color = '#ffd98a', alpha = 1) {
    const s = sc();
    const u = Math.max(1, Math.round((size * s) / 7.5));
    const ox = Math.round(x * s - (u * 7) / 2), oy = Math.round(y * s - (u * 7) / 2);
    out.save();
    out.globalAlpha = alpha;
    out.fillStyle = 'rgba(10, 6, 20, 0.85)';
    STAR.forEach((row, r) => [...row].forEach((c, k) => { if (c === '#') out.fillRect(ox + k * u + u * 0.5, oy + r * u + u * 0.5, u, u); }));
    out.fillStyle = color;
    STAR.forEach((row, r) => [...row].forEach((c, k) => { if (c === '#') out.fillRect(ox + k * u, oy + r * u, u, u); }));
    out.restore();
  }
  /** A star followed by a label, centred on cx. Returns the total width. */
  function starText(label, cx, y, { size = 7, color = '#ffe7b0', alpha = 1 } = {}) {
    const iw = size * 0.85, gap = size * 0.55;
    const w = iw + gap + measure(label, size);
    const x0 = cx - w / 2;
    star(x0 + iw / 2, y - 0.3, size, color, alpha);
    text(label, x0 + iw + gap, y, { size, color, align: 'left', alpha });
    return w;
  }
  function measure(str, size) {
    const s = sc();
    out.font = `${Math.round(size * s)}px ${FONT}`;
    return out.measureText(str).width / s;
  }
  function wrapText(str, maxW, size) {
    const lines = [];
    let cur = '';
    for (const w of str.split(' ')) {
      const t = cur ? `${cur} ${w}` : w;
      if (measure(t, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function panel(x, y, w, h) {
    const s = sc();
    out.save();
    out.fillStyle = 'rgba(16, 12, 30, 0.86)';
    out.strokeStyle = 'rgba(242, 214, 162, 0.55)';
    out.lineWidth = Math.max(1, s * 0.6);
    out.beginPath();
    out.roundRect(x * s, y * s, w * s, h * s, 3 * s);
    out.fill();
    out.stroke();
    out.restore();
  }

  function drawDialog() {
    const d = S.dialog;
    if (!d) return;
    const [who, line, opts] = d.lines[d.i];
    const shown = line.slice(0, Math.floor(d.chars));
    const typed = d.chars >= line.length;
    const choosing = opts?.choices && typed;
    panel(10, 6, 236, choosing ? 50 : 34);
    if (who) text(who, 18, 13, { size: 7, color: '#ffd98a', align: 'left' });
    wrapText(shown, 220, 8).forEach((l, i) => text(l, 18, (who ? 23 : 17) + i * 9, { size: 8, align: 'left', color: who ? '#fff6e8' : '#d9cbe8' }));
    if (choosing) {
      opts.choices.forEach((c, i) => {
        const on = i === d.sel;
        text(`${on ? '▸ ' : '  '}${c}`, i === 0 ? 72 : 184, 40, { size: 8, color: on ? '#ffd98a' : 'rgba(255, 246, 232, 0.55)' });
      });
      text('◀ ▶ choose', 110, 50, { size: 5.5, color: 'rgba(217, 203, 232, 0.7)', align: 'right' });
      starText('confirm', 138, 50, { size: 5.5, color: 'rgba(217, 203, 232, 0.7)' });
    } else if (typed && Math.sin(S.t * 6) > -0.2) text('▾', 238, 34, { size: 7, color: '#ffd98a' });
  }

  function drawPrompt() {
    if (S.scene !== 'planet') return;
    if (S.holdLine) text(S.holdLine, 128, 30, { size: 9, color: '#ffe7b0', alpha: 0.95 });
    const n = nearest();
    if (n) {
      const w = 7 * 0.85 + 7 * 0.55 + measure(n.label, 7) + 16;
      panel(128 - w / 2, 124, w, 13);
      starText(n.label, 128, 130.5, { size: 7 });
      if (n.kind === 'hold' && S.hold > 0) {
        const s = sc();
        out.fillStyle = 'rgba(255, 217, 138, 0.9)';
        out.fillRect((128 - w / 2 + 6) * s, 134.5 * s, (w - 12) * S.hold * s, 1.2 * s);
      }
    } else if (S.stop === 0 && !S.dialog && S.planet.phase === 'done') {
      text('← →  walk', 108, 132, { size: 6, color: 'rgba(255, 246, 232, 0.7)', align: 'right' });
      starText('talk, light, hop', 150, 132, { size: 6, color: 'rgba(255, 246, 232, 0.7)' });
    }
  }

  const titlePlanet = { lampLit: true, phase: 'title', def: PLANETS.home };
  function drawTitleText() {
    text('The Little Lamplighter', 128, 30, { size: attract ? 17 : 16, color: '#ffd98a' });
    if (!attract) text('a small story about light', 128, 44, { size: 7, color: '#d9cbe8' });
    if (Math.sin(S.t * 3) > -0.3) {
      if (attract) text('PRESS START', 128, 50, { size: 9, color: '#fff6e8' });
      else starText('press space or tap to begin', 128, 58, { size: 7, color: '#fff6e8' });
    }
  }
  function drawCreditsText() {
    const rise = Math.max(0, 1 - S.credits / 3) * 14;
    CREDITS.forEach(([line, size, color, y], i) => text(line, 128, y + rise, { size, color, alpha: clamp((S.credits - i * 0.6) / 1.5, 0, 1) }));
    if (S.credits > 9 && Math.sin(S.t * 3) > -0.3) starText('return to the beginning', 128, 132, { size: 7, color: '#d9cbe8' });
  }

  function render() {
    g.imageSmoothingEnabled = false;
    if (attract || S.scene === 'title' || S.scene === 'fadeToStart') drawPlanetScene(PLANETS.home, titlePlanet);
    else if (S.scene === 'travel') drawTravel();
    else if (S.scene === 'credits') {
      drawPlanetScene(PLANETS.home, { lampLit: true, phase: 'credits', def: PLANETS.home });
      g.fillStyle = 'rgba(8, 6, 20, 0.45)';
      g.fillRect(0, 0, W, H);
    } else drawPlanetScene(S.planet.def, S.planet);
    if (S.fade > 0) { g.fillStyle = `rgba(6, 4, 18, ${S.fade})`; g.fillRect(0, 0, W, H); }

    out.imageSmoothingEnabled = false;
    out.clearRect(0, 0, display.width, display.height);
    out.drawImage(low, 0, 0, display.width, display.height);
    if (attract || S.scene === 'title') drawTitleText();
    else if (S.scene === 'credits') drawCreditsText();
    else { drawDialog(); drawPrompt(); }
  }

  return {
    step(dt) { update(dt); render(); },
    resize(width) {
      display.width = Math.max(W, Math.round(width));
      display.height = Math.round((display.width * H) / W);
    },
    setInput(name, down) {
      if (name === 'action') {
        if (down && !input.action) actionDown();
        input.action = down;
        return;
      }
      if (down && !input[name] && S.dialog && choiceInput(name === 'left' ? -1 : 1)) { input[name] = down; return; }
      input[name] = down;
    },
    clearInput() { input.left = input.right = input.action = false; },
    reset() { S = fresh(); },
    get scene() { return S.scene; },
    get state() { return S; },
  };
}

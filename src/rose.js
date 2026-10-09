import * as THREE from 'three';
import { leafGeometry, profiles } from './foliage.js';
import { makeGlowTexture } from './textures.js';
import { LINES } from './rose-lines.js';

// ---------------------------------------------------------------------------
// The rose under the glass. Click the cloche to lift it or set it back. She
// asks for things (her glass at night, air by day, the window shut, a song)
// and every act of care, and every return on a new day, tames her a little
// more. Once she is tamed enough she breaks the glass herself and blooms
// into her full self, and stays that way: the browser remembers.
// ---------------------------------------------------------------------------

const KEY = 'cozy-room:rose';
const BOND_TO_BLOOM = 7;   // acts of care before she breaks free
const CARE_GAP = 30;       // seconds between acts of care that count
const DEMAND_LIFE = 45;    // how long she waits before sulking

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const rand = (a, b) => a + Math.random() * (b - a);
const pickLine = (list) => list[Math.floor(Math.random() * list.length)];
const easeInOut = (x) => x * x * (3 - 2 * x);
const easeOutBack = (x, s = 1.7) => (x >= 1 ? 1 : 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2));
const span = (t, a, b) => clamp01((t - a) / (b - a));

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save(mem) {
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* storage unavailable */ }
}
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

// the cloche sits on the stand, or is set down behind it, away from the viewer
const DOME_ON = new THREE.Vector3(0, 0.89, 0);
const DOME_ASIDE = new THREE.Vector3(-0.75, 0.77, -0.75);
const DOME_R = 0.42;
const DOME_HALF = 0.35;

// colours she shifts to as she blooms into herself
const GLAM = { deep: 0x7a0820, mid: 0xc4123a, outer: 0xdc2248, leaf: 0x2f8f3a };
// how far each original petal layer (inner to outer) opens
const OPEN = [0.03, 0.07, 0.14, 0.24, 0.34, 0.44];

export function createRose(handles, { sound = {}, onClimax } = {}) {
  const { group, plant, bloom, dome, fallen, leafMat } = handles;

  // ?rose=reset forgets her, ?rose=ready brings her to the brink, ?rose=free skips to the end
  const param = new URLSearchParams(location.search).get('rose');
  if (param === 'reset') try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  let mem = { found: false, bond: 0, lastDay: '', free: false, ...load() };
  if (param === 'ready') mem = { ...mem, found: true, bond: BOND_TO_BLOOM - 1, free: false };
  if (param === 'free') mem = { ...mem, found: true, free: true };
  if (param) save(mem);

  // ---------------------------------------------------------------- the bloom's own parts
  const petals = [];
  bloom.traverse((o) => { if (o.userData.petal) petals.push({ mesh: o, baseX: o.rotation.x, layer: o.userData.petal.layer }); });
  const mats = bloom.userData.materials;
  const base = {
    deep: mats.deep.color.clone(), mid: mats.mid.color.clone(), outer: mats.outer.color.clone(), leaf: leafMat.color.clone(),
  };
  const glamCol = { deep: new THREE.Color(GLAM.deep), mid: new THREE.Color(GLAM.mid), outer: new THREE.Color(GLAM.outer), leaf: new THREE.Color(GLAM.leaf) };
  for (const m of [mats.deep, mats.mid, mats.outer]) m.emissive = new THREE.Color(0x5a0418);
  const bloomScale = bloom.scale.x;
  const bloomTop = new THREE.Vector3();

  // two new outer rings of velvet petals, crimson at the heart and blushing toward the tips
  const velvet = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.5, sheen: 0.45, sheenColor: new THREE.Color(0xd8285a), sheenRoughness: 0.45,
    side: THREE.DoubleSide, emissive: new THREE.Color(0x5a0418), emissiveIntensity: 0,
  });
  const glamPetals = [];
  const ringDefs = [
    { n: 7, len: 0.16, width: 1.15, pitch: 1.0, r: 0.048, curl: 0.42, cup: -0.22, y: -0.01 },
    { n: 8, len: 0.18, width: 1.2, pitch: 0.78, r: 0.054, curl: 0.5, cup: -0.16, y: -0.018 },
  ];
  const heart = new THREE.Color(0x6e0619);
  const body = new THREE.Color(0xa80c30);
  const tip = new THREE.Color(0xf0506e);
  ringDefs.forEach((L, li) => {
    const geo = leafGeometry(profiles.petal, { length: 1, width: L.width, curl: L.curl, cup: L.cup, segments: 18 });
    const uv = geo.attributes.uv;
    const col = new Float32Array(uv.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < uv.count; i++) {
      const v = uv.getY(i);
      c.copy(heart).lerp(body, Math.min(1, v / 0.55));
      if (v > 0.7) c.lerp(tip, ((v - 0.7) / 0.3) * 0.6);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (let i = 0; i < L.n; i++) {
      const az = (i / L.n) * Math.PI * 2 + li * 0.45 + 0.2;
      const m = new THREE.Mesh(geo, velvet);
      m.position.set(Math.sin(az) * L.r, L.y, Math.cos(az) * L.r);
      m.rotation.order = 'YXZ';
      m.rotation.y = az;
      m.rotation.x = Math.PI / 2 - L.pitch;
      m.rotation.z = (i % 2 ? 1 : -1) * 0.1;
      m.castShadow = true;
      m.visible = false;
      bloom.add(m);
      glamPetals.push({ mesh: m, len: L.len, order: li * 0.5 + (i / L.n) * 0.5 });
    }
  });

  // her light: a soft glow at the bloom and a little rose-coloured light on the grass
  const glowTex = makeGlowTexture();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xff7aa0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.scale.setScalar(1.3);
  group.add(glow);
  const light = new THREE.PointLight(0xff6a8a, 0, 4.5, 2);
  group.add(light);

  // gold motes that drift round her once she is free
  const MOTES = 36;
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(MOTES * 3);
  const moteCol = new Float32Array(MOTES * 3);
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  moteGeo.setAttribute('color', new THREE.BufferAttribute(moteCol, 3));
  const moteSeeds = Array.from({ length: MOTES }, () => ({ a: rand(0, Math.PI * 2), r: rand(0.25, 0.75), h: rand(-0.4, 0.5), s: rand(0.15, 0.45), tw: rand(0, 10) }));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    map: glowTex, size: 6, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  motes.visible = false;
  motes.frustumCulled = false;
  group.add(motes);

  // ---------------------------------------------------------------- the shattering, built ahead
  // cracks are drawn onto a shell just outside the cloche as they spread
  const crackCanvas = document.createElement('canvas');
  crackCanvas.width = 512;
  crackCanvas.height = 512;
  const crackCtx = crackCanvas.getContext('2d');
  const crackTex = new THREE.CanvasTexture(crackCanvas);
  const crackShell = new THREE.Mesh(dome.geometry, new THREE.MeshBasicMaterial({
    map: crackTex, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  crackShell.scale.setScalar(1.004);
  crackShell.visible = false;
  dome.add(crackShell);
  let cracks = [];
  function planCracks() {
    // branching walks from a few points where she presses against the glass
    cracks = [];
    const seeds = [[0.12, 0.55], [0.37, 0.62], [0.6, 0.5], [0.85, 0.58], [0.25, 0.8]];
    seeds.forEach(([u, v], si) => {
      const walk = (x, y, ang, len, t0, depth) => {
        let t = t0;
        for (let i = 0; i < len; i++) {
          ang += rand(-0.6, 0.6);
          const nx = x + Math.cos(ang) * rand(10, 22);
          const ny = y + Math.sin(ang) * rand(10, 22);
          cracks.push({ x0: x, y0: y, x1: nx, y1: ny, t, w: Math.max(0.6, 2.2 - depth * 0.6) });
          x = nx; y = ny; t += rand(0.02, 0.06);
          if (depth < 2 && Math.random() < 0.28) walk(x, y, ang + rand(-1.4, 1.4), Math.floor(len * 0.6), t, depth + 1);
        }
      };
      const t0 = si * 0.32 + rand(0, 0.15);
      for (let k = 0; k < 3; k++) walk(u * 512, (1 - v) * 512, (k / 3) * Math.PI * 2 + rand(-0.5, 0.5), 9 + Math.floor(Math.random() * 6), t0, 0);
    });
    cracks.sort((a, b) => a.t - b.t);
    crackCtx.clearRect(0, 0, 512, 512);
    crackTex.needsUpdate = true;
  }
  let crackDrawn = 0;
  let nextTink = 0;
  function drawCracks(time) {
    let drew = false;
    while (crackDrawn < cracks.length && cracks[crackDrawn].t <= time) {
      const c = cracks[crackDrawn++];
      crackCtx.strokeStyle = 'rgba(235,248,255,0.95)';
      crackCtx.shadowColor = 'rgba(200,230,255,0.9)';
      crackCtx.shadowBlur = 4;
      crackCtx.lineWidth = c.w;
      crackCtx.lineCap = 'round';
      crackCtx.beginPath();
      crackCtx.moveTo(c.x0, c.y0);
      crackCtx.lineTo(c.x1, c.y1);
      crackCtx.stroke();
      drew = true;
    }
    if (drew) crackTex.needsUpdate = true;
  }

  // glass shards
  const SHARDS = 90;
  const shardGeo = new THREE.BufferGeometry();
  shardGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.4, 0, 0.55, -0.3, 0, -0.05, 0.6, 0]), 3));
  shardGeo.computeVertexNormals();
  const shardMesh = new THREE.InstancedMesh(shardGeo, new THREE.MeshPhysicalMaterial({
    color: 0xe8f7ff, transparent: true, opacity: 0.6, roughness: 0.05, clearcoat: 1, metalness: 0,
    side: THREE.DoubleSide, depthWrite: false, emissive: new THREE.Color(0x9ab8d0), emissiveIntensity: 0.25,
  }), SHARDS);
  shardMesh.count = 0;
  shardMesh.frustumCulled = false;
  group.add(shardMesh);
  const shards = [];

  // petals flung up into the wind
  const BURST = 64;
  const burstGeo = leafGeometry(profiles.petal, { length: 1, width: 1, curl: 0.2, cup: -0.25, segments: 10 });
  const burstMesh = new THREE.InstancedMesh(burstGeo, new THREE.MeshStandardMaterial({ roughness: 0.55, side: THREE.DoubleSide }), BURST);
  burstMesh.count = 0;
  burstMesh.frustumCulled = false;
  const burstColors = [0xc4123a, 0xdc2248, 0xff6a86, 0x9a0c2a, 0xffa0b4].map((h) => new THREE.Color(h));
  for (let i = 0; i < BURST; i++) burstMesh.setColorAt(i, burstColors[i % burstColors.length]);
  group.add(burstMesh);
  const flying = [];

  const m4 = new THREE.Matrix4();
  const q4 = new THREE.Quaternion();
  const e4 = new THREE.Euler();
  const s4 = new THREE.Vector3();

  function spawnShards() {
    shards.length = 0;
    for (let i = 0; i < SHARDS; i++) {
      const th = rand(0, Math.PI * 2);
      const y = rand(-DOME_HALF - DOME_R * 0.9, DOME_HALF + DOME_R * 0.95);
      const ay = Math.abs(y);
      const r = ay <= DOME_HALF ? DOME_R : Math.sqrt(Math.max(0, DOME_R * DOME_R - (ay - DOME_HALF) ** 2));
      const out = rand(1.1, 2.6);
      shards.push({
        p: new THREE.Vector3(Math.cos(th) * r, DOME_ON.y + y, Math.sin(th) * r),
        v: new THREE.Vector3(Math.cos(th) * out, rand(0.8, 2.4) + (y > 0 ? 0.8 : 0), Math.sin(th) * out),
        rot: new THREE.Vector3(rand(0, 6), rand(0, 6), rand(0, 6)),
        spin: new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)),
        size: rand(0.04, 0.11),
        rest: false,
      });
    }
    shardMesh.count = SHARDS;
  }

  function spawnBurst(from) {
    flying.length = 0;
    for (let i = 0; i < BURST; i++) {
      const th = rand(0, Math.PI * 2);
      const out = rand(0.4, 1.6);
      flying.push({
        p: from.clone().add(new THREE.Vector3(rand(-0.08, 0.08), rand(-0.05, 0.1), rand(-0.08, 0.08))),
        v: new THREE.Vector3(Math.cos(th) * out, rand(1.4, 3.2), Math.sin(th) * out),
        swirl: rand(1.2, 2.6) * (Math.random() < 0.5 ? -1 : 1),
        rot: new THREE.Vector3(rand(0, 6), rand(0, 6), rand(0, 6)),
        spin: new THREE.Vector3(rand(-4, 4), rand(-4, 4), rand(-4, 4)),
        size: rand(0.07, 0.13),
        life: rand(4.5, 7.5),
        age: 0,
      });
    }
    burstMesh.count = BURST;
  }

  function stepShards(dt, age) {
    if (!shardMesh.count) return;
    const fade = 1 - span(age, 3.2, 5);
    shards.forEach((s, i) => {
      if (!s.rest) {
        s.v.y -= 7 * dt;
        s.p.addScaledVector(s.v, dt);
        s.rot.addScaledVector(s.spin, dt);
        const floor = Math.hypot(s.p.x, s.p.z) < 0.52 ? 0.125 : 0.01;
        if (s.p.y < floor) {
          s.p.y = floor;
          if (Math.abs(s.v.y) < 0.6) {
            s.rest = true;
            s.rot.x = Math.PI / 2 + rand(-0.15, 0.15); // settles flat
          } else {
            s.v.y *= -0.3;
            s.v.x *= 0.45;
            s.v.z *= 0.45;
            s.spin.multiplyScalar(0.5);
          }
        }
      }
      m4.compose(s.p, q4.setFromEuler(e4.set(s.rot.x, s.rot.y, s.rot.z)), s4.setScalar(Math.max(1e-4, s.size * fade)));
      shardMesh.setMatrixAt(i, m4);
    });
    shardMesh.instanceMatrix.needsUpdate = true;
    if (fade <= 0) shardMesh.count = 0;
  }

  function stepBurst(dt, time) {
    if (!burstMesh.count) return;
    let alive = 0;
    flying.forEach((f, i) => {
      f.age += dt;
      // drag, a gentle fall, and a swirl round her as they rise
      f.v.multiplyScalar(Math.exp(-dt * 1.1));
      f.v.y -= 0.35 * dt;
      const sw = f.swirl * dt * Math.exp(-f.age * 0.4);
      const x = f.p.x;
      f.p.x = x * Math.cos(sw) - f.p.z * Math.sin(sw);
      f.p.z = x * Math.sin(sw) + f.p.z * Math.cos(sw);
      f.p.x += Math.sin(time * 1.3 + i) * 0.12 * dt + 0.25 * dt; // and off on the breeze
      f.p.addScaledVector(f.v, dt);
      f.rot.addScaledVector(f.spin, dt);
      const k = 1 - span(f.age, f.life - 1.2, f.life);
      if (k > 0) alive++;
      m4.compose(f.p, q4.setFromEuler(e4.set(f.rot.x, f.rot.y, f.rot.z)), s4.setScalar(Math.max(1e-4, f.size * k)));
      burstMesh.setMatrixAt(i, m4);
    });
    burstMesh.instanceMatrix.needsUpdate = true;
    if (!alive) burstMesh.count = 0;
  }

  // ---------------------------------------------------------------- speech
  const bubble = document.createElement('div');
  bubble.className = 'rose-bubble';
  bubble.setAttribute('role', 'status');
  bubble.setAttribute('aria-live', 'polite');
  bubble.hidden = true;
  document.body.appendChild(bubble);
  let bubbleUntil = 0;
  let hidden = false;
  let onScreen = false;
  let clock = 0;

  function say(list, extra = 0) {
    const text = Array.isArray(list) ? pickLine(list) : list;
    bubble.textContent = text;
    bubble.hidden = false;
    bubble.classList.remove('show');
    void bubble.offsetWidth; // restart the fade-in
    bubble.classList.add('show');
    bubbleUntil = clock + 3.2 + text.length * 0.045 + extra;
    sound.speak?.();
  }

  // ---------------------------------------------------------------- state
  let domeOn = !mem.free;
  let domeT = domeOn ? 0 : 1;     // 0 on the stand, 1 set aside
  let demand = null;               // { kind, until }
  let nextDemand = 10;
  let lastCare = -Infinity;
  let greetedToday = false;
  let climax = mem.free ? null : undefined; // undefined: not begun; object: in progress; null: done
  let glam = mem.free ? 1 : 0;
  let pendingBloom = mem.bond >= BOND_TO_BLOOM && !mem.free ? 3 : -1;
  let nextFavour = 0; // when she next asks for her glass back, if it is off when her moment comes
  if (mem.free) {
    dome.visible = false;
    fallen.visible = false;
  }
  let scene = { cold: false, windowOpen: false, musicPlaying: false };

  function care(kind) {
    // an act of care: it counts toward taming her if it has been a little while
    if (clock - lastCare < CARE_GAP || mem.free) return false;
    lastCare = clock;
    mem.bond += 1;
    save(mem);
    if (mem.bond >= BOND_TO_BLOOM && pendingBloom < 0) pendingBloom = clock + 4.5;
    return true;
  }

  function meet() {
    const kind = demand.kind;
    demand = null;
    nextDemand = clock + rand(35, 65);
    care(kind);
    say(kind === 'music' ? LINES.musicThanks : LINES.thanks);
  }

  function click() {
    if (climax) return; // she is busy becoming herself
    if (mem.free) {
      say(LINES.free);
      return;
    }
    domeOn = !domeOn;
    sound[domeOn ? 'set' : 'lift']?.();
    if (pendingBloom >= 0) {
      // her moment has come: she only wants the glass on, so she can break it herself
      if (domeOn) {
        bubbleUntil = Math.min(bubbleUntil, clock); // no waiting on her last request
        bubble.classList.remove('show');
      } else {
        say(LINES.lastFavour);
        nextFavour = clock + 45;
      }
      return;
    }
    const first = !mem.found;
    mem.found = true;
    if (!greetedToday) {
      greetedToday = true;
      const day = today();
      if (!first && mem.lastDay && mem.lastDay !== day) {
        mem.lastDay = day;
        care('return');
        lastCare = -Infinity; // coming back doesn't use up today's first act of care
        say(LINES.returning);
        save(mem);
        return;
      }
      mem.lastDay = day;
    }
    save(mem);
    if (first) {
      say(LINES.first);
      nextDemand = clock + 14;
      return;
    }
    // did this give her what she asked for, or what she wanted without asking?
    if (demand && ((demand.kind === 'cover' && domeOn) || (demand.kind === 'uncover' && !domeOn))) {
      meet();
      return;
    }
    const wants = scene.cold ? 'on' : 'off';
    const got = domeOn ? 'on' : 'off';
    if (wants === got && !demand && care('noticed')) say(LINES.noticed);
    else if (domeOn) say(scene.cold ? LINES.lowerCold : LINES.lowerWarm);
    else say(scene.cold ? LINES.liftCold : LINES.liftWarm);
  }

  function maybeDemand() {
    if (mem.free || !mem.found || climax !== undefined || pendingBloom >= 0) return;
    if (demand) {
      const met = (demand.kind === 'cover' && domeOn) || (demand.kind === 'uncover' && !domeOn)
        || (demand.kind === 'window' && !scene.windowOpen) || (demand.kind === 'music' && scene.musicPlaying);
      if (met) meet();
      else if (clock > demand.until) {
        demand = null;
        nextDemand = clock + rand(45, 75);
        if (onScreen && !hidden) say(LINES.sulk);
      }
      return;
    }
    if (clock < nextDemand || !onScreen || hidden || clock < bubbleUntil) return;
    const options = [];
    if (scene.cold && !domeOn) options.push(['cover', 3]);
    if (!scene.cold && domeOn) options.push(['uncover', 3]);
    if (scene.windowOpen) options.push(['window', 1.5]);
    if (!scene.musicPlaying) options.push(['music', 0.8]);
    options.push(['tender', 0.7]);
    let r = Math.random() * options.reduce((s, [, w]) => s + w, 0);
    const [kind] = options.find(([, w]) => (r -= w) < 0) ?? options[0];
    if (kind === 'tender') {
      say(LINES.tender);
      nextDemand = clock + rand(40, 70);
      return;
    }
    demand = { kind, until: clock + DEMAND_LIFE };
    say(LINES[kind], 2);
  }

  // ---------------------------------------------------------------- the climax
  function beginClimax() {
    pendingBloom = -1;
    demand = null;
    climax = { t: 0, shattered: false, spoke: false };
    planCracks();
    crackDrawn = 0;
    nextTink = 0;
    say(LINES.breaking, 1.5);
    bloom.getWorldPosition(bloomTop);
    onClimax?.(bloomTop.clone(), true);
  }

  function stepClimax(dt) {
    const c = climax;
    c.t += dt;
    const CRACK_AT = 2.2, CRACK_LEN = 2.4, SHATTER = 5.1;
    if (c.t > CRACK_AT && c.t < SHATTER) {
      crackShell.visible = true;
      const ct = (c.t - CRACK_AT) / CRACK_LEN * 1.9; // crack plan runs about 1.9 units of time
      const before = crackDrawn;
      drawCracks(ct);
      if (crackDrawn > before && c.t > nextTink) {
        sound.crack?.(span(c.t, CRACK_AT, SHATTER));
        nextTink = c.t + rand(0.08, 0.3) * (1 - 0.6 * span(c.t, CRACK_AT, SHATTER));
      }
      // the glass shivers harder as it gives
      const shiver = 0.012 * span(c.t, CRACK_AT, SHATTER);
      dome.position.x = DOME_ON.x + Math.sin(c.t * 61) * shiver;
      dome.position.z = DOME_ON.z + Math.cos(c.t * 53) * shiver;
    }
    // her light gathers inside the glass
    c.gather = span(c.t, CRACK_AT, SHATTER) ** 2;
    if (!c.shattered && c.t >= SHATTER) {
      c.shattered = true;
      dome.visible = false;
      crackShell.visible = false;
      fallen.visible = false;
      spawnShards();
      bloom.getWorldPosition(bloomTop);
      spawnBurst(group.worldToLocal(bloomTop.clone()));
      sound.shatter?.();
      sound.bloom?.();
      mem.free = true;
      save(mem);
    }
    if (c.shattered) {
      const a = c.t - SHATTER;
      glam = a; // read as seconds into the bloom by applyLook
      stepShards(dt, a);
      if (!c.spoke && a > 2.8) {
        c.spoke = true;
        say(LINES.freed, 1);
      }
      if (a > 9 && !shardMesh.count && !burstMesh.count) {
        climax = null;
        glam = 1;
        onClimax?.(null, false);
      }
    }
  }

  // ---------------------------------------------------------------- look
  const col = new THREE.Color();
  function applyLook(time, night) {
    // during the climax `glam` holds seconds since the shatter; afterwards it is 1
    const a = climax && climax.shattered ? glam : climax ? -1 : glam >= 1 ? 99 : -1;
    const grow = a < 0 ? 0 : easeOutBack(span(a, 0, 2.4), 1.4);
    const open = a < 0 ? 0 : easeOutBack(span(a, 0.15, 2.6), 1.2);
    const tint = a < 0 ? 0 : easeInOut(span(a, 0, 1.6));
    const tame = Math.min(1, mem.bond / BOND_TO_BLOOM) * (1 - tint);

    // taller and straighter, standing on her own
    plant.scale.set(1 + 0.3 * grow, 1 + 0.42 * grow, 1 + 0.3 * grow);
    bloom.scale.setScalar(bloomScale * (1 + 0.08 * tame + 0.08 * tint + 0.2 * grow));
    for (const p of petals) p.mesh.rotation.x = p.baseX + (0.05 * tame + OPEN[p.layer] * open);
    for (const g of glamPetals) {
      const k = a < 0 ? 0 : easeOutBack(span(a, 0.2 + g.order * 0.9, 1.6 + g.order * 0.9), 1.5);
      g.mesh.visible = k > 0.001;
      g.mesh.scale.setScalar(Math.max(1e-4, g.len * k));
    }
    mats.deep.color.copy(base.deep).lerp(glamCol.deep, tint);
    mats.mid.color.copy(base.mid).lerp(glamCol.mid, tint);
    mats.outer.color.copy(base.outer).lerp(glamCol.outer, tint);
    leafMat.color.copy(base.leaf).lerp(glamCol.leaf, tint);

    // a glow that gathers in the glass, flashes as it breaks, then settles to a warm pulse
    const gather = climax?.gather ?? 0;
    const flash = a < 0 ? 0 : Math.exp(-a * 1.6);
    const pulse = 0.85 + 0.15 * Math.sin(time * 1.4);
    const settled = tint * (0.35 + 0.65 * night) * pulse;
    const emis = Math.max(gather * 0.5, settled * 0.28 + flash * 0.8);
    for (const m of [mats.deep, mats.mid, mats.outer]) m.emissiveIntensity = emis;
    velvet.emissiveIntensity = emis * 0.8;
    plant.updateMatrixWorld();
    bloom.getWorldPosition(bloomTop);
    group.worldToLocal(glow.position.copy(bloomTop));
    light.position.copy(glow.position).y += 0.4; // from just above, so it lights her petals and the grass
    glow.material.opacity = Math.min(1, gather * 0.7 + flash * 1.2 + settled * 0.9);
    glow.scale.setScalar(1.3 + 2.4 * flash + 1 * tint);
    light.intensity = gather * 4 + flash * 26 + settled * 1.4;

    // motes
    motes.visible = tint > 0.01;
    if (motes.visible) {
      const pa = motes.geometry.attributes.position;
      const ca = motes.geometry.attributes.color;
      moteSeeds.forEach((m, i) => {
        const ang = m.a + time * m.s;
        const rr = m.r * (0.6 + 0.4 * tint);
        pa.setXYZ(i, glow.position.x + Math.cos(ang) * rr, glow.position.y + m.h + Math.sin(time * 0.6 + m.tw) * 0.08, glow.position.z + Math.sin(ang) * rr);
        const tw = Math.max(0, Math.sin(time * 2.2 + m.tw)) ** 3 * tint;
        col.setRGB(1, 0.82, 0.5).multiplyScalar(tw);
        ca.setXYZ(i, col.r, col.g, col.b);
      });
      pa.needsUpdate = true;
      ca.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- frame
  const proj = new THREE.Vector3();
  const up = new THREE.Vector3();
  function update(dt, time, { night, season, windowOpen, musicPlaying, camera }) {
    clock += dt;
    scene = { cold: night > 0.5 || season.winter > 0.5, windowOpen, musicPlaying };

    // the cloche: lifted in an arc and set down behind her, or back on the stand
    const target = domeOn ? 0 : 1;
    domeT += Math.sign(target - domeT) * Math.min(Math.abs(target - domeT), dt / 0.9);
    if (!climax || !climax.shattered) {
      const k = easeInOut(domeT);
      dome.position.lerpVectors(DOME_ON, DOME_ASIDE, k);
      dome.position.y += Math.sin(Math.PI * k) * 0.7;
      dome.rotation.z = Math.sin(Math.PI * k) * 0.3;
    }

    if (climax) stepClimax(dt);
    else if (pendingBloom >= 0 && clock > pendingBloom && onScreen && !hidden) {
      // the glass has to be on her, and settled on its stand, before she can break it
      if (domeOn && domeT === 0 && clock > bubbleUntil) beginClimax();
      else if (!domeOn && clock > nextFavour && clock > bubbleUntil) {
        say(LINES.lastFavour);
        nextFavour = clock + 45;
      }
    }
    stepBurst(dt, time);
    applyLook(time, night);
    maybeDemand();

    // where she is on screen, for the speech bubble and for only asking while seen
    up.set(0, 0.55 * plant.scale.y, 0).applyQuaternion(group.quaternion);
    proj.copy(bloomTop).add(up).project(camera);
    onScreen = Math.abs(proj.x) < 0.92 && Math.abs(proj.y) < 0.92;
    motes.material.size = 9 * Math.min(2.5, Math.max(0.8, camera.zoom ** 0.6));
    if (!bubble.hidden) {
      if (clock > bubbleUntil || hidden || !onScreen) {
        bubble.classList.remove('show');
        if (clock > bubbleUntil + 0.4 || hidden || !onScreen) bubble.hidden = true;
      }
      bubble.style.transform = `translate(${((proj.x + 1) / 2) * innerWidth}px, ${((1 - proj.y) / 2) * innerHeight}px) translate(-50%, -100%)`;
    }
  }

  applyLook(0, 0);
  // the effects are for looking at: clicks pass through them to the rose
  for (const o of [glow, motes, crackShell, shardMesh, burstMesh]) o.raycast = () => {};

  return {
    roots: [group],
    click,
    update,
    /** Hide the bubble while the book or the game covers the scene. */
    setHidden(h) {
      hidden = h;
      if (h) bubble.hidden = true;
    },
    get free() { return mem.free; },
  };
}

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// The cat, a grey tabby with white socks. She keeps to a few favourite spots
// and wanders between them as the day and the year turn: loafing on the floor
// cushion by day, curled up asleep at the foot of the bed at night, and all
// winter under the kotatsu with just her head poking out. Pet her and she purrs.
// ---------------------------------------------------------------------------

const FUR = 0x8e8984, STRIPE = 0x57524d, CREAM = 0xf2ede4, PINK = 0xe5a19f, EYE = 0x2b2720;

const smooth = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
const lerp = THREE.MathUtils.lerp;
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const rand = (a, b) => a + Math.random() * (b - a);

const STAND_Y = 0.2;  // body centre above the ground when standing
const LIE_Y = 0.105;  // and when lying down
const SPEED = 0.42;   // walking pace, units per second
const TURN = 4.5;     // radians per second
const STRIDE = 0.2;
const SIZE = 1.2;     // drawn a little large, like the tea set, so she reads from across the room

// Each pose is a set of numbers the body eases between. Head position is relative to the body centre.
//   fold: legs tucked (0 standing, 1 folded away)  up: tail raised (0 wrapped round her, 1 up)
//   wrap: how far round her the tail curls         len: body length, shorter when curled
//   eyes: open (1), heavy-lidded (~0.4) or shut (0)
const POSES = {
  stand: { y: STAND_Y, fold: 0, hx: 0, hy: 0.08, hz: 0.24, yaw: 0, pitch: 0, roll: 0, up: 1, wrap: 1.4, len: 1, eyes: 1 },
  loaf: { y: LIE_Y, fold: 1, hx: 0, hy: 0.085, hz: 0.235, yaw: 0, pitch: 0.08, roll: 0, up: 0, wrap: 1.8, len: 1, eyes: 0.42 },
  curl: { y: 0.1, fold: 1, hx: 0.1, hy: 0.0, hz: 0.15, yaw: 2.0, pitch: 0.45, roll: 0.5, up: 0, wrap: 2.6, len: 0.86, eyes: 0 },
  peek: { y: LIE_Y, fold: 1, hx: 0, hy: -0.035, hz: 0.42, yaw: 0, pitch: 0.12, roll: 0, up: 0, wrap: 1.8, len: 1, eyes: 0.5 },
};

/** Tabby stripes for the body. On the body's sphere the poles run nose to tail, so bands of v ring her. */
function makeTabbyTexture(w = 256, h = 128) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const base = new THREE.Color(FUR), dark = new THREE.Color(STRIPE), belly = new THREE.Color(CREAM);
  const col = new THREE.Color();
  for (let y = 0; y < h; y++) {
    const v = y / h; // 0 at the head end, 1 at the tail
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const back = 0.5 + 0.5 * Math.cos((u - 0.75) * Math.PI * 2); // 1 along the spine, 0 under the belly
      const wobble = 0.035 * Math.sin(u * Math.PI * 8 + v * 5) + 0.02 * Math.sin(u * Math.PI * 22);
      const band = Math.pow(Math.max(0, Math.sin((v + wobble) * Math.PI * 13)), 2.5);
      const stripe = band * smooth(back, 0.3, 0.75) * smooth(v, 0.06, 0.16);
      const grain = 0.04 * (Math.random() - 0.5);
      col.copy(belly).lerp(base, smooth(back, 0.1, 0.4)).lerp(dark, stripe * 0.8);
      const k = (y * w + x) * 4;
      img.data[k] = Math.min(255, (col.r + grain) * 255);
      img.data[k + 1] = Math.min(255, (col.g + grain) * 255);
      img.data[k + 2] = Math.min(255, (col.b + grain) * 255);
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeHeartTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const s = size / 64;
  ctx.fillStyle = '#ff8fa3';
  ctx.beginPath();
  ctx.moveTo(32 * s, 54 * s);
  ctx.bezierCurveTo(4 * s, 36 * s, 6 * s, 10 * s, 22 * s, 10 * s);
  ctx.bezierCurveTo(28 * s, 10 * s, 31 * s, 14 * s, 32 * s, 18 * s);
  ctx.bezierCurveTo(33 * s, 14 * s, 36 * s, 10 * s, 42 * s, 10 * s);
  ctx.bezierCurveTo(58 * s, 10 * s, 60 * s, 36 * s, 32 * s, 54 * s);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildModel() {
  const mat = (color, roughness = 0.95) => new THREE.MeshStandardMaterial({ color, roughness });
  const tabby = new THREE.MeshStandardMaterial({ map: makeTabbyTexture(), roughness: 0.95 });
  const fur = mat(FUR), furDark = mat(STRIPE), cream = mat(CREAM), pink = mat(PINK, 0.7), eye = mat(EYE, 0.3);
  const ball = new THREE.SphereGeometry(1, 20, 14);
  const part = (geo, material, parent, [x, y, z], [sx, sy, sz] = [1, 1, 1]) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  const root = new THREE.Group();  // on the ground, facing +z
  const body = new THREE.Group();  // raised to the body's height; everything else hangs off it
  root.add(body);
  const torso = new THREE.Group(); // breathes
  body.add(torso);
  const trunkGeo = new THREE.SphereGeometry(1, 28, 18).rotateX(Math.PI / 2);
  part(trunkGeo, tabby, torso, [0, 0, 0], [0.125, 0.115, 0.235]);
  part(trunkGeo, tabby, torso, [0, 0.005, -0.1], [0.135, 0.12, 0.14]); // haunches
  part(ball, cream, torso, [0, -0.02, 0.13], [0.095, 0.1, 0.105]);     // white bib

  const head = new THREE.Group();
  head.rotation.order = 'YXZ';
  body.add(head);
  part(ball, fur, head, [0, 0, 0], [0.108, 0.092, 0.097]);
  for (const s of [-1, 1]) {
    part(ball, fur, head, [s * 0.05, -0.03, 0.025], [0.05, 0.05, 0.05]);        // cheeks
    part(ball, cream, head, [s * 0.019, -0.034, 0.075], [0.032, 0.03, 0.03]);  // muzzle
  }
  part(ball, cream, head, [0, -0.05, 0.068], [0.025, 0.02, 0.025]);            // chin
  part(ball, pink, head, [0, -0.012, 0.094], [0.014, 0.01, 0.009]);            // nose
  const ears = [-1, 1].map((s) => {
    const ear = new THREE.Group();
    ear.position.set(s * 0.052, 0.07, -0.005);
    ear.rotation.set(-0.15, 0, -s * 0.38);
    const outer = part(new THREE.ConeGeometry(0.042, 0.08, 3), fur, ear, [0, 0.035, 0]);
    outer.rotation.y = Math.PI; // a flat face forward
    const inner = part(new THREE.ConeGeometry(0.026, 0.05, 3), pink, ear, [0, 0.025, 0.012]);
    inner.rotation.y = Math.PI;
    head.add(ear);
    return { ear, rest: ear.rotation.z };
  });
  const open = [], shut = [];
  const lid = new THREE.TorusGeometry(0.016, 0.0042, 5, 10, Math.PI).rotateZ(Math.PI); // a closed eye, curved down
  for (const s of [-1, 1]) {
    const o = part(ball, eye, head, [s * 0.04, 0.012, 0.084], [0.017, 0.017, 0.009]);
    o.rotation.y = s * 0.42;
    open.push(o);
    const c = part(lid, furDark, head, [s * 0.04, 0.016, 0.088]);
    c.rotation.y = s * 0.42;
    shut.push(c);
  }

  // legs hang from hip and shoulder pivots; paws are white
  const legGeo = new THREE.CapsuleGeometry(0.032, 0.1, 4, 8).translate(0, -0.06, 0);
  const pawGeo = ball;
  const legs = [[0.062, 0.15, 0], [-0.062, 0.15, Math.PI], [0.07, -0.13, Math.PI], [-0.07, -0.13, 0]].map(([x, z, phase], i) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, -0.03, z);
    part(legGeo, fur, pivot, [0, 0, 0]);
    part(pawGeo, cream, pivot, [0, -0.145, 0.006], [0.036, 0.024, 0.045]);
    body.add(pivot);
    return { pivot, phase, front: i < 2 };
  });

  // the tail is a chain of beads with darker rings, placed along a curve every frame
  const tail = [];
  const TAIL_N = 16;
  for (let i = 0; i < TAIL_N; i++) {
    const r = lerp(0.033, 0.022, i / (TAIL_N - 1));
    const ring = i >= TAIL_N - 2 || Math.floor(i / 2) % 2 === 1;
    tail.push({ m: part(ball, ring ? furDark : fur, body, [0, 0, 0], [r, r, r]), r });
  }

  // in the kotatsu only her head shows, chin on her paws
  const peekPaws = new THREE.Group();
  for (const s of [-1, 1]) part(ball, cream, peekPaws, [s * 0.05, 0.022, 0.5], [0.036, 0.024, 0.045]);
  root.add(peekPaws);

  return { root, body, torso, head, ears, open, shut, legs, tail, peekPaws };
}

/**
 * spots: { name: { pos: [x, y, z], heading, pose, elevated } }, where heading is the
 *   direction she faces at rest (radians, 0 = +z).
 * routes: { 'from>to': [[x, z] | { x, y, z, jump }] }, the waypoints between spots, ending at the spot.
 * groundY(x, z): the floor height (the rug is a little raised).
 * quilt: the kotatsu's footprint { x, z, hx, hz }; she ducks under it.
 * sound(name): called with 'purr' when she is petted.
 */
export function createCat({ spots, routes, groundY, quilt, sound = () => {} }) {
  const model = buildModel();
  model.root.scale.setScalar(SIZE);
  const group = new THREE.Group();
  group.add(model.root);

  const P = { ...POSES.loaf }; // the pose she is in, eased toward a target each frame
  const pos = new THREE.Vector3();
  let heading = 0;
  let mode = 'rest';  // rest, rise, walk, jump, settle, hide, peekOut, peekIn
  let at = null;      // the spot she is resting at, or heading for
  let route = [];
  let timer = 0;
  let jump = null;
  let gait = 0;
  let nightish = false;
  let petT = 0;
  let nextHeart = 0; // a second heart follows the first
  const idle = { yaw: 0, yawTarget: 0, nextLook: 4, blink: 0, nextBlink: 3, ear: [0, 0], nextEar: 2, flick: 0, nextFlick: 5 };

  // hearts float up when she is petted
  const heartMap = makeHeartTexture();
  const hearts = [0, 1, 2].map(() => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartMap, transparent: true, depthWrite: false }));
    s.visible = false;
    group.add(s);
    return { s, age: 0, from: new THREE.Vector3() };
  });
  const headWorld = new THREE.Vector3();
  function heart() {
    const h = hearts.find((x) => !x.s.visible) ?? hearts[0];
    model.head.getWorldPosition(headWorld);
    h.from.copy(headWorld).add(new THREE.Vector3(rand(-0.05, 0.05), 0.12, rand(-0.05, 0.05)));
    h.age = 0;
    h.s.visible = true;
  }

  function show(which) {
    const body = which === 'all';
    for (const c of [model.torso, ...model.legs.map((l) => l.pivot), ...model.tail.map((t) => t.m)]) c.visible = body;
    model.head.visible = which !== 'none';
    model.peekPaws.visible = which === 'peek';
  }

  const toPoint = (w) => (Array.isArray(w) ? { x: w[0], y: groundY(w[0], w[1]), z: w[1], jump: false } : w);

  function snapTo(name) {
    const s = spots[name];
    at = name;
    pos.set(...s.pos);
    heading = s.heading;
    Object.assign(P, POSES[s.pose]);
    mode = 'rest';
    show(s.pose === 'peek' ? 'peek' : 'all');
  }

  function leave(to) {
    const from = at;
    route = (routes[`${from}>${to}`] ?? []).map(toPoint);
    at = to;
    timer = 0;
    mode = spots[from].pose === 'peek' ? 'peekIn' : 'rise';
  }

  function insideQuilt(x, z, margin = 0) {
    return Math.abs(x - quilt.x) < quilt.hx + margin && Math.abs(z - quilt.z) < quilt.hz + margin;
  }
  // 1 well under the quilt, 0 clear of it
  function underness(x, z) {
    const dx = Math.abs(x - quilt.x) - quilt.hx, dz = Math.abs(z - quilt.z) - quilt.hz;
    return 1 - smooth(Math.max(dx, dz), -0.25, 0.12);
  }

  function arrive() {
    const s = spots[at];
    timer = 0;
    mode = s.pose === 'peek' ? 'hide' : 'settle';
  }

  function stepWalk(dt, quiltDown) {
    const wp = route[0];
    if (!wp) {
      arrive();
      return;
    }
    const dx = wp.x - pos.x, dz = wp.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    const err = wrapAngle(want - heading);
    heading += THREE.MathUtils.clamp(err, -TURN * dt, TURN * dt);
    if (wp.jump) {
      // line up first, then crouch and spring
      if (Math.abs(err) < 0.15 || dist < 0.05) {
        const dy = wp.y - pos.y;
        jump = { from: pos.clone(), to: new THREE.Vector3(wp.x, wp.y, wp.z), t: -0.25, dy, dur: 0.42 + 0.25 * Math.abs(dy) + 0.2 * dist, h: 0.1 + 0.2 * Math.abs(dy) };
        route.shift();
        mode = 'jump';
      }
      return;
    }
    const speed = SPEED * SIZE * Math.max(0, Math.cos(err)) * (1 - 0.35 * (quiltDown ? underness(pos.x, pos.z) : 0));
    const step = Math.min(dist, speed * dt);
    pos.x += Math.sin(heading) * step;
    pos.z += Math.cos(heading) * step;
    pos.y = groundY(pos.x, pos.z);
    gait += (step / (STRIDE * SIZE)) * Math.PI;
    if (dist < 0.07) route.shift();
  }

  function stepJump(dt) {
    const j = jump;
    j.t += dt;
    if (j.t < 0) return; // crouching
    const k = Math.min(1, j.t / j.dur);
    pos.lerpVectors(j.from, j.to, k);
    // rise early going up and drop late coming down, so she clears the bed's edge
    const rise = j.dy >= 0 ? 1 - (1 - k) * (1 - k) : k * k;
    pos.y = j.from.y + j.dy * rise + j.h * 4 * k * (1 - k);
    if (k >= 1) {
      jump = null;
      if (route.length) mode = 'walk';
      else arrive();
    }
  }

  /** env: { night (0..1), kotatsuReady (the quilt is down and staying), quilt (0..1 how far down) } */
  function update(dt, time, env) {
    if (env.night > 0.55) nightish = true;
    else if (env.night < 0.45) nightish = false;
    const want = env.kotatsuReady ? 'kotatsu' : nightish ? 'bed' : 'cushion';
    if (!at) snapTo(want);
    if (mode === 'rest' && want !== at) leave(want);
    const quiltDown = env.quilt > 0.5;
    timer += dt;

    let T = POSES.stand;
    let rate = 6;
    switch (mode) {
      case 'rest':
        T = POSES[spots[at].pose];
        rate = 3;
        break;
      case 'rise':
        if (timer > 0.55) mode = 'walk';
        break;
      case 'peekIn':
        // tuck her head back under the quilt, then set off from underneath
        T = { ...POSES.peek, hz: 0.12 };
        rate = 5;
        if (timer > 0.6) {
          const k = spots.kotatsu;
          pos.set(...k.pos);
          heading = k.heading;
          Object.assign(P, POSES.stand, { fold: 0.7 });
          show('all');
          mode = 'walk';
        }
        break;
      case 'walk':
        stepWalk(dt, quiltDown);
        break;
      case 'jump':
        stepJump(dt);
        break;
      case 'settle': {
        const s = spots[at];
        T = POSES[s.pose];
        rate = 3.5;
        heading += THREE.MathUtils.clamp(wrapAngle(s.heading - heading), -TURN * 0.5 * dt, TURN * 0.5 * dt);
        if (timer > 1.1) mode = 'rest';
        break;
      }
      case 'hide':
        // she has crept in under the quilt; turn round out of sight and poke her head out
        T = { ...POSES.stand, fold: 0.7 };
        if (timer > 0.35) show('none');
        if (timer > 1.1) {
          const k = spots.kotatsu;
          pos.set(...k.pos);
          heading = k.heading;
          Object.assign(P, POSES.peek, { hz: 0.12 });
          show('peek');
          mode = 'peekOut';
          timer = 0;
        }
        break;
      case 'peekOut':
        T = POSES.peek;
        rate = 2.5;
        if (timer > 1.2) mode = 'rest';
        break;
    }

    // crouch while under the quilt
    if ((mode === 'walk' || mode === 'hide') && quiltDown) {
      const u = underness(pos.x, pos.z);
      T = { ...T, fold: Math.max(T.fold, 0.7 * u), hy: T.hy - 0.04 * u };
    }
    // crouch before a jump and stretch out in the air
    let reach = 0;
    if (mode === 'jump' && jump) {
      if (jump.t < 0) T = { ...T, fold: 0.65 };
      else {
        reach = Math.sin(Math.PI * Math.min(1, jump.t / jump.dur));
        T = { ...T, fold: 0.2, up: 0.5 };
      }
    }

    // petting: she lifts her chin, shuts her eyes and leans in
    petT = Math.max(0, petT - dt);
    if (nextHeart > 0 && (nextHeart -= dt) <= 0) heart();
    const pet = smooth(petT, 0, 0.5) * (1 - smooth(petT, 2.9, 3.4));
    if (pet > 0) T = { ...T, pitch: T.pitch - 0.35 * pet, hy: T.hy + 0.03 * pet, roll: T.roll + 0.18 * pet, eyes: T.eyes * (1 - pet) };

    for (const k in P) P[k] = damp(P[k], T[k], rate, dt);
    pose(dt, time, reach);
    for (const h of hearts) {
      if (!h.s.visible) continue;
      h.age += dt;
      const k = h.age / 1.6;
      if (k >= 1) {
        h.s.visible = false;
        continue;
      }
      h.s.position.copy(h.from).add(new THREE.Vector3(Math.sin(h.age * 3) * 0.02, k * 0.32, 0));
      h.s.scale.setScalar(0.07 + 0.05 * Math.sin(Math.PI * Math.min(1, k * 2)));
      h.s.material.opacity = 1 - smooth(k, 0.55, 1);
    }
  }

  function pose(dt, time, reach) {
    const m = model;
    const resting = mode === 'rest';
    const asleep = resting && spots[at].pose === 'curl';
    const walking = mode === 'walk' && route.length > 0;

    // idle life: a look around, a slow blink, an ear twitch, a flick of the tail
    if (resting) {
      if (time > idle.nextLook) {
        idle.yawTarget = asleep || Math.random() < 0.4 ? 0 : rand(-0.6, 0.6);
        idle.nextLook = time + rand(4, 11);
      }
      if (time > idle.nextBlink) {
        idle.blink = 1;
        idle.nextBlink = time + rand(4, 10);
      }
      if (time > idle.nextEar) {
        idle.ear[Math.random() < 0.5 ? 0 : 1] = 1;
        idle.nextEar = time + rand(3, 9);
      }
      if (time > idle.nextFlick) {
        idle.flick = 1;
        idle.nextFlick = time + rand(5, 12);
      }
    } else {
      idle.yawTarget = 0;
    }
    idle.yaw = damp(idle.yaw, idle.yawTarget, 2, dt);
    idle.blink = Math.max(0, idle.blink - dt * 2.5);
    idle.flick = Math.max(0, idle.flick - dt * 1.4);
    for (let i = 0; i < 2; i++) idle.ear[i] = Math.max(0, idle.ear[i] - dt * 5);

    m.root.position.copy(pos);
    m.root.rotation.y = heading;
    const bob = walking ? Math.abs(Math.sin(gait)) * 0.008 : 0;
    // legs fold back under the body; the body lowers until the paws would leave the floor
    const fold = P.fold;
    const legReach = 0.02 + 0.178 * Math.cos((fold * Math.PI) / 2);
    m.body.position.y = Math.min(P.y, Math.max(legReach, 0.1)) + bob;
    const breathe = Math.sin(time * (asleep ? 1.7 : 2.4)) * (resting ? 0.022 : 0.008);
    m.torso.scale.set(1 + breathe * 0.6, 1 + breathe, P.len);

    m.head.position.set(P.hx, P.hy + (walking ? Math.sin(gait * 2) * 0.004 : 0), P.hz * (0.6 + 0.4 * P.len));
    m.head.rotation.set(P.pitch, P.yaw + idle.yaw, P.roll);
    m.ears.forEach((e, i) => { e.ear.rotation.z = e.rest + (i ? 1 : -1) * 0.45 * Math.sin(idle.ear[i] * Math.PI); });
    const eyes = Math.max(0, P.eyes - Math.sin(idle.blink * Math.PI) * P.eyes);
    for (const o of m.open) {
      o.visible = eyes > 0.12;
      o.scale.y = 0.017 * Math.max(0.15, eyes);
    }
    for (const c of m.shut) c.visible = eyes <= 0.12;

    const swing = walking ? 0.5 : 0;
    for (const l of m.legs) {
      const tuck = (l.front ? 1 : -1) * fold * (Math.PI / 2);
      const stretch = (l.front ? -0.7 : 0.7) * reach;
      l.pivot.rotation.x = tuck + stretch + swing * Math.sin(gait + l.phase);
    }

    // the tail: wrapped round her at ground level when resting, up in a question mark when walking
    const ground = -m.body.position.y;
    const n = m.tail.length;
    const len = 0.44;
    let ux = 0, uy = 0.0, uz = -0.22;
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      const sway = Math.sin(time * 1.3 - s * 2) * 0.12 * s + Math.sin(idle.flick * Math.PI) * 0.5 * s * s;
      // wrapped: sweep round her right side at a fixed distance, settling to the floor
      const th = s * P.wrap + sway * 0.4;
      const wx = 0.17 * Math.sin(th), wz = -0.25 * Math.cos(th) * (0.75 + 0.25 * P.len);
      const wy = lerp(0, ground + m.tail[i].r, smooth(s, 0, 0.22));
      // raised: integrate a direction that sweeps from back-and-up to over the top
      if (i > 0) {
        const a = lerp(0.6, 2.15, Math.pow(s, 1.2));
        ux += Math.sin(time * 2 + s * 3) * 0.004 + sway * 0.02;
        uy += Math.sin(a) * (len / (n - 1));
        uz += -Math.cos(a) * (len / (n - 1));
      }
      m.tail[i].m.position.set(lerp(wx, ux, P.up), lerp(wy, uy, P.up), lerp(wz, uz, P.up));
    }
  }

  return {
    group,
    update,
    /** Pet her: she purrs and leans into it. */
    pet() {
      if (petT > 1) return;
      petT = 3.4;
      sound('purr');
      heart();
      nextHeart = 1.1;
    },
    /** True while she is under the quilt, or still in its way, so it should not be lifted. */
    get under() {
      return (at === 'kotatsu' && mode !== 'walk') || mode === 'hide' || mode === 'peekIn' || mode === 'peekOut'
        || insideQuilt(pos.x, pos.z, 0.15);
    },
    roots: [model.root],
  };
}

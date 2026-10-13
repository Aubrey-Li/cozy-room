import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeRadialTexture } from './textures.js';

// ---------------------------------------------------------------------------
// A low tea table in the middle of the room, with a kyusu and two cups. In
// winter a padded quilt drops over its frame and it becomes a kotatsu, warm
// underneath, with a bowl of mandarins on top. Click it to pour a cup of tea.
// ---------------------------------------------------------------------------

const TOP_W = 1.3, TOP_D = 0.95, TOP_T = 0.05;
const HEIGHT = 0.4;    // the top surface, above whatever the table stands on
const MARGIN = 0.03;   // how far the quilt peeks out from under the top
const OVERHANG = 0.36; // how much further it spreads by the time it reaches the floor
const SET_SCALE = 1.25; // the tea set is drawn a little large so it reads from across the room

const smooth = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
const lerp = THREE.MathUtils.lerp;

function mesh(geo, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function lathe(points, material, segments = 24) {
  return mesh(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments), material);
}

/** A soft tartan in indigo and cream, with a thin rust line. Tiles. */
function makePlaidTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#41588a';
  ctx.fillRect(0, 0, size, size);
  // [start, width, colour, alpha], drawn across and down so the bands cross
  const bands = [
    [0, 0.3, '#26345a', 0.55],
    [0.42, 0.045, '#f1e3c8', 0.7],
    [0.6, 0.02, '#d9774a', 0.85],
    [0.78, 0.045, '#f1e3c8', 0.7],
  ];
  for (const [s, w, col, a] of bands) {
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    ctx.fillRect(0, s * size, size, w * size);
    ctx.fillRect(s * size, 0, w * size, size);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * A point on a rounded rectangle (half sizes hx, hz, corner radius r) at t in [0, 1)
 * of the way round, with its outward normal.
 */
function outline(hx, hz, r, t) {
  const lx = 2 * (hx - r), lz = 2 * (hz - r), arc = (Math.PI / 2) * r;
  let s = (((t % 1) + 1) % 1) * (2 * lx + 2 * lz + 4 * arc);
  const corners = [[hx - r, hz - r], [-(hx - r), hz - r], [-(hx - r), -(hz - r)], [hx - r, -(hz - r)]];
  const edges = [lx, lz, lx, lz];
  for (let k = 0; k < 4; k++) {
    const [cx, cz] = corners[k];
    if (s <= arc) {
      const a = (k * Math.PI) / 2 + s / r;
      return { x: cx + r * Math.cos(a), z: cz + r * Math.sin(a), nx: Math.cos(a), nz: Math.sin(a) };
    }
    s -= arc;
    if (s <= edges[k]) {
      // the straight run after corner k, heading for the next corner
      const a = ((k + 1) * Math.PI) / 2;
      const nx = Math.round(Math.cos(a)), nz = Math.round(Math.sin(a));
      return { x: cx + r * nx - nz * s, z: cz + r * nz + nx * s, nx, nz };
    }
    s -= edges[k];
  }
  return outline(hx, hz, r, 0);
}

/**
 * The kotatsu quilt, hung from just under the table top: it rounds over the edge,
 * falls in soft folds and spreads out onto the floor. Heights are relative to the
 * top of the quilt, so scaling it in y gathers it up under the board.
 */
function buildQuilt(drop, material) {
  const hx = TOP_W / 2, hz = TOP_D / 2, r = 0.06;
  const N = 168, S = 14;
  const perimeter = 2 * (2 * (hx - r)) + 2 * (2 * (hz - r)) + 2 * Math.PI * r;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= S; j++) {
    const s = j / S;
    // part rounded like a stuffed quilt, part hanging straight
    const a = (s * Math.PI) / 2;
    const out = lerp(Math.sin(a), s * s, 0.45);
    const down = 1 - lerp(Math.cos(a), 1 - s, 0.45);
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const o = outline(hx, hz, r, t);
      const fold = Math.pow(s, 1.4) * (0.02 * Math.sin(t * Math.PI * 2 * 23 + 0.7) + 0.016 * Math.sin(t * Math.PI * 2 * 9 + 2.1));
      const d = MARGIN + OVERHANG * out + fold;
      pos.push(o.x + o.nx * d, -drop * down, o.z + o.nz * d);
      uv.push((t * perimeter) / 0.45, s * 1.2);
    }
  }
  const row = N + 1;
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // the flat top under the board, sharing the first ring so the edge rounds smoothly
  const centre = pos.length / 3;
  pos.push(0, 0, 0);
  uv.push(0.5, 0.5);
  for (let i = 0; i < N; i++) idx.push(centre, i + 1, i);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const g = new THREE.Group();
  g.add(mesh(geo, material));
  // a plump rolled hem where it meets the floor
  const hem = [];
  for (let i = 0; i < N; i += 2) {
    const k = (S * row + i) * 3;
    hem.push(new THREE.Vector3(pos[k], pos[k + 1] + 0.022, pos[k + 2]));
  }
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hem, true), 168, 0.026, 6, true), material));
  return g;
}

/** A kyusu: a squat teapot with a straight side handle. Origin at its base, spout toward +x. */
function buildTeapot(glaze) {
  const g = new THREE.Group();
  g.add(lathe([
    [0.001, 0], [0.05, 0], [0.075, 0.01], [0.088, 0.04], [0.084, 0.075], [0.066, 0.098], [0.042, 0.106],
    [0.041, 0.112], [0.03, 0.118], [0.012, 0.121], [0.011, 0.128], [0.016, 0.134], [0.001, 0.138],
  ], glaze));
  const tilt = 0.9;
  const axis = new THREE.Vector3(Math.sin(tilt), Math.cos(tilt), 0);
  const base = new THREE.Vector3(0.074, 0.042, 0);
  const spout = mesh(new THREE.CylinderGeometry(0.009, 0.018, 0.085, 10), glaze);
  spout.rotation.z = -tilt;
  spout.position.copy(base).addScaledVector(axis, 0.0425);
  g.add(spout);
  const tip = new THREE.Object3D();
  tip.position.copy(base).addScaledVector(axis, 0.087);
  g.add(tip);
  // the handle sticks straight out to the side, angled up a little
  const handle = mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.09, 10), glaze);
  handle.rotation.x = Math.PI / 2 - 0.25;
  handle.position.set(0, 0.066, 0.122);
  g.add(handle);
  return { group: g, tip };
}

/** A yunomi, a tall handleless cup, with tea in it that can rise and fall. */
function buildCup(clay, tea) {
  const g = new THREE.Group();
  g.add(lathe([[0.001, 0], [0.026, 0], [0.03, 0.004], [0.034, 0.062], [0.031, 0.064], [0.028, 0.01], [0.001, 0.01]], clay, 20));
  const surface = mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), tea, { cast: false });
  g.add(surface);
  const setFill = (f) => {
    const y = lerp(0.014, 0.056, f);
    surface.position.y = y;
    surface.scale.setScalar(0.028 + (0.003 * (y - 0.01)) / 0.054);
    surface.visible = f > 0.02;
  };
  return { group: g, setFill, rim: 0.064 };
}

function buildMikanBowl(bowlMat) {
  const g = new THREE.Group();
  g.add(lathe([[0.001, 0], [0.05, 0], [0.09, 0.025], [0.115, 0.06], [0.108, 0.062], [0.084, 0.03], [0.045, 0.012], [0.001, 0.012]], bowlMat));
  const peel = new THREE.MeshStandardMaterial({ color: 0xf08a24, roughness: 0.6, bumpScale: 0.002 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.8, side: THREE.DoubleSide });
  const fruit = new THREE.SphereGeometry(0.036, 14, 10);
  const spots = [[-0.035, 0.045, 0.02], [0.035, 0.045, 0.025], [0.0, 0.045, -0.04], [0.005, 0.1, 0.0]];
  for (const [x, y, z] of spots) {
    const m = mesh(fruit, peel);
    m.scale.set(1, 0.84, 1);
    m.position.set(x, y, z);
    g.add(m);
  }
  const l = mesh(new THREE.PlaneGeometry(0.03, 0.014), leaf, { cast: false });
  l.position.set(0.012, 0.132, 0.004);
  l.rotation.set(-0.9, 0.4, 0.2);
  g.add(l);
  return g;
}

/**
 * Warm light spilling out from under the quilt onto the floor: a soft band around
 * the hem (the middle is hidden under the quilt anyway). Additive, so it only brightens.
 */
function buildHemGlow(hx, hz) {
  const pad = 0.45;
  const w = 2 * (hx + pad), d = 2 * (hz + pad);
  const px = 96; // canvas pixels per unit
  const c = document.createElement('canvas');
  c.width = Math.round(w * px);
  c.height = Math.round(d * px);
  const ctx = c.getContext('2d');
  ctx.filter = `blur(${Math.round(0.14 * px)}px)`;
  ctx.fillStyle = 'rgb(255,140,60)';
  const inset = (pad - 0.06) * px;
  ctx.beginPath();
  ctx.roundRect(inset, inset, c.width - inset * 2, c.height - inset * 2, 0.4 * px);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  m.raycast = () => {}; // light, not a thing to click
  return m;
}

/** Rising wisps of steam: a small pool of sprites fed by a few emitters. */
function createSteam(parent, count = 44) {
  const map = makeRadialTexture([
    [0, 'rgba(255,255,255,0.55)'],
    [0.45, 'rgba(255,255,255,0.2)'],
    [1, 'rgba(255,255,255,0)'],
  ], 64);
  const puffs = [];
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false;
    parent.add(s);
    puffs.push({ s, age: 0, life: 1, x: 0, y: 0, z: 0, phase: 0, strength: 0 });
  }
  let next = 0;
  function emit(at, strength) {
    const p = puffs[next];
    next = (next + 1) % puffs.length;
    p.age = 0;
    p.life = 2 + Math.random() * 0.9;
    p.x = at.x + (Math.random() - 0.5) * 0.02;
    p.y = at.y;
    p.z = at.z + (Math.random() - 0.5) * 0.02;
    p.phase = Math.random() * Math.PI * 2;
    p.strength = strength;
    p.s.visible = true;
  }
  function update(dt, brightness) {
    for (const p of puffs) {
      if (!p.s.visible) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        p.s.visible = false;
        continue;
      }
      p.s.position.set(
        p.x + Math.sin(p.age * 2.1 + p.phase) * 0.025 * k,
        p.y + p.age * 0.12,
        p.z + Math.cos(p.age * 1.7 + p.phase) * 0.02 * k,
      );
      p.s.scale.setScalar(0.035 + 0.11 * k);
      p.s.material.opacity = 0.34 * p.strength * Math.sin(Math.PI * Math.min(1, k * 1.15));
      p.s.material.color.setScalar(brightness);
    }
  }
  return { emit, update };
}

/**
 * Builds the table at (x, z), standing on a surface at height floorY.
 * `sound(name)` is called with 'pour' when the stream starts and 'set' when the pot is put down.
 */
export function buildTeaTable({ x, z, floorY = 0, wood, fabricBump = null, sound = () => {} }) {
  const group = new THREE.Group();
  group.position.set(x, floorY, z);
  const top = HEIGHT;

  // the table: a rounded oak top on a shallow apron and four square legs
  const board = mesh(new RoundedBoxGeometry(TOP_W, TOP_T, TOP_D, 3, 0.016), wood);
  board.position.y = top - TOP_T / 2;
  group.add(board);
  const apronY = top - TOP_T - 0.03;
  for (const sz of [-1, 1]) {
    const m = mesh(new THREE.BoxGeometry(TOP_W - 0.14, 0.06, 0.03), wood);
    m.position.set(0, apronY, sz * (TOP_D / 2 - 0.08));
    group.add(m);
  }
  for (const sx of [-1, 1]) {
    const m = mesh(new THREE.BoxGeometry(0.03, 0.06, TOP_D - 0.14), wood);
    m.position.set(sx * (TOP_W / 2 - 0.08), apronY, 0);
    group.add(m);
  }
  const legH = top - TOP_T;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const m = mesh(new THREE.BoxGeometry(0.065, legH, 0.065), wood);
    m.position.set(sx * (TOP_W / 2 - 0.08), legH / 2, sz * (TOP_D / 2 - 0.08));
    group.add(m);
  }

  // the quilt, gathered up out of sight until winter
  const quiltMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: makePlaidTexture(),
    roughness: 1,
    sheen: 0.6,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color(0xc9d4f2),
    side: THREE.DoubleSide,
    ...(fabricBump ? { bumpMap: fabricBump, bumpScale: 0.014 } : {}),
  });
  const quiltTop = top - TOP_T - 0.004;
  const quilt = buildQuilt(quiltTop - 0.012, quiltMat);
  quilt.name = 'quilt';
  quilt.position.y = quiltTop;
  quilt.visible = false;
  group.add(quilt);
  // the heater's glow, leaking out from under the hem onto the rug
  const glow = new THREE.PointLight(0xff8a3d, 0, 2.4, 2);
  glow.position.set(0, 0.12, 0);
  group.add(glow);
  const hemGlow = buildHemGlow(TOP_W / 2 + MARGIN + OVERHANG, TOP_D / 2 + MARGIN + OVERHANG);
  hemGlow.position.y = 0.004;
  hemGlow.visible = false;
  group.add(hemGlow);

  // the tea set
  const glaze = new THREE.MeshStandardMaterial({ color: 0x8fae9a, roughness: 0.32 });
  const clay = new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.45 });
  const tea = new THREE.MeshStandardMaterial({ color: 0xb3a845, roughness: 0.12 });
  const pot = buildTeapot(glaze);
  const potRest = { x: -0.32, z: -0.12, yaw: 0.5 };
  pot.group.scale.setScalar(SET_SCALE);
  pot.group.position.set(potRest.x, top, potRest.z);
  pot.group.rotation.order = 'YXZ';
  pot.group.rotation.y = potRest.yaw;
  group.add(pot.group);
  const cups = [[0.42, 0.06, 0.4], [-0.05, 0.3, 1]].map(([cx, cz, fill]) => {
    const c = buildCup(clay, tea);
    c.group.scale.setScalar(SET_SCALE);
    c.group.position.set(cx, top, cz);
    group.add(c.group);
    c.fill = fill;
    c.fresh = 0;
    c.setFill(fill);
    c.top = new THREE.Vector3(cx, top + c.rim * SET_SCALE, cz);
    c.surface = new THREE.Vector3();
    return c;
  });
  const bowl = buildMikanBowl(clay);
  bowl.position.set(0.14, top, -0.22);
  bowl.visible = false;
  group.add(bowl);

  // the stream of tea, from the spout down to the cup
  const stream = mesh(new THREE.CylinderGeometry(0.006, 0.0045, 1, 6, 1, true).translate(0, -0.5, 0), tea, { cast: false });
  stream.visible = false;
  group.add(stream);

  const steam = createSteam(group);
  const emitTimers = [0, 0, 0];
  const spout = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  const tmp = new THREE.Vector3();

  // a pour runs on a fixed timeline: lift and turn, tip, pour, tip back, set down
  const PHASES = { move: 0.6, tip: 0.9, pourEnd: 2.0, untip: 2.3, back: 2.9 };
  let pour = null;
  let amount = -1; // how far the quilt is down, 0..1; negative until the first update

  function startPour() {
    if (pour) return false;
    // fill whichever cup has less in it
    const cup = cups[0].fill <= cups[1].fill ? cups[0] : cups[1];
    const dx = cup.top.x - potRest.x, dz = cup.top.z - potRest.z;
    const len = Math.hypot(dx, dz);
    const reach = 0.215; // how far the tipped spout reaches past the pot's base
    pour = {
      t: 0,
      cup,
      from: cup.fill,
      at: { x: cup.top.x - (dx / len) * reach, z: cup.top.z - (dz / len) * reach },
      // the spout points along local +x; turn it to face the cup
      yaw: Math.atan2(-dz, dx),
      poured: false,
      set: false,
    };
    return true;
  }

  function stepPour(dt) {
    if (!pour) return;
    const p = pour;
    p.t += dt;
    const t = p.t;
    const move = t < PHASES.untip ? smooth(t, 0, PHASES.move) : 1 - smooth(t, PHASES.untip, PHASES.back);
    const tip = smooth(t, PHASES.move, PHASES.tip) * (1 - smooth(t, PHASES.pourEnd, PHASES.untip));
    // lifted high enough that the tipped spout clears the cup's rim
    pot.group.position.set(lerp(potRest.x, p.at.x, move), top + 0.15 * move, lerp(potRest.z, p.at.z, move));
    // turn the short way round
    let dy = p.yaw - potRest.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    pot.group.rotation.y = potRest.yaw + dy * move;
    pot.group.rotation.z = -0.65 * tip;
    const pouring = t > PHASES.tip - 0.05 && t < PHASES.pourEnd;
    if (pouring && !p.poured) {
      p.poured = true;
      sound('pour');
    }
    const k = smooth(t, PHASES.tip, PHASES.pourEnd - 0.05);
    p.cup.fill = lerp(p.from, 1, k);
    p.cup.setFill(p.cup.fill);
    if (pouring) p.cup.fresh = 1;
    // the stream hangs from the spout tip to the tea
    stream.visible = pouring;
    if (pouring) {
      group.updateMatrixWorld(true);
      pot.tip.getWorldPosition(spout);
      group.worldToLocal(spout);
      p.cup.surface.set(p.cup.top.x, top + lerp(0.014, 0.056, p.cup.fill) * SET_SCALE, p.cup.top.z);
      stream.position.copy(spout);
      tmp.subVectors(p.cup.surface, spout);
      const l = tmp.length();
      stream.scale.set(1, l, 1);
      stream.quaternion.setFromUnitVectors(down, tmp.divideScalar(l));
    }
    if (t >= PHASES.back && !p.set) {
      p.set = true;
      sound('set');
    }
    if (t >= PHASES.back) {
      pot.group.position.set(potRest.x, top, potRest.z);
      pot.group.rotation.set(0, potRest.yaw, 0);
      pour = null;
    }
  }

  /**
   * `on`: whether the quilt should be down. `cold` (0..1) thickens the steam; `night`
   * (0..1) dims it and lets the heater's glow show.
   */
  function update(dt, time, { on, cold = 0, night = 0 }) {
    const target = on ? 1 : 0;
    // the first frame starts settled; after that the quilt unfolds or gathers over a second and a half
    amount = amount < 0 ? target : target > amount ? Math.min(target, amount + dt / 1.5) : Math.max(target, amount - dt / 1.5);
    const e = amount * amount * (3 - 2 * amount);
    quilt.visible = amount > 0.001;
    if (quilt.visible) {
      const spread = lerp(0.9, 1, e);
      quilt.scale.set(spread, Math.max(0.02, e), spread);
    }
    bowl.visible = amount > 0.01;
    bowl.scale.setScalar(Math.max(0.001, smooth(amount, 0.4, 1)));
    glow.intensity = 3 * e * (0.35 + 0.65 * night);
    hemGlow.material.opacity = 0.5 * e * night;
    hemGlow.visible = hemGlow.material.opacity > 0.01;

    stepPour(dt);

    // steam: a gentle wisp from each cup, thicker when it is cold or the tea is fresh
    const base = 0.35 + 0.65 * cold;
    cups.forEach((c, i) => {
      c.fresh = Math.max(0, c.fresh - dt / 50);
      const rate = (0.7 + 2.2 * c.fresh) * base * smooth(c.fill, 0.05, 0.4);
      emitTimers[i] -= dt * rate;
      if (emitTimers[i] <= 0) {
        emitTimers[i] = 1;
        steam.emit(c.top, Math.min(1, base * (0.6 + 0.6 * c.fresh)));
      }
    });
    // and a thread from the spout while the pot is warm
    emitTimers[2] -= dt * 0.45 * base;
    if (emitTimers[2] <= 0 && !pour) {
      emitTimers[2] = 1;
      group.updateMatrixWorld(true);
      pot.tip.getWorldPosition(spout);
      steam.emit(group.worldToLocal(spout), 0.5 * base);
    }
    steam.update(dt, 1 - 0.45 * night);
    return amount;
  }

  const hx = TOP_W / 2 + MARGIN + OVERHANG, hz = TOP_D / 2 + MARGIN + OVERHANG;
  return {
    group,
    update,
    pour: startPour,
    get amount() { return Math.max(0, amount); },
    /** The quilt's footprint on the floor, in room coordinates. */
    footprint: { x, z, hx, hz },
  };
}

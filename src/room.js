import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makePlankTexture, makePhotoTexture, makeVinylTexture } from './textures.js';

// Room footprint: x in [-4, 4], z in [-4, 4]. Floor top at y = 0.
// Back walls: wall A along z = -4 (with the window), wall B along x = -4.
const W = 4;
const WALL_H = 5;
const WALL_T = 0.3;

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });

const M = {
  wall: mat(0xf4e8d4, { roughness: 0.95 }),
  wallOuter: mat(0xe6d6bd, { roughness: 0.95 }),
  trim: mat(0xfbf7f0),
  walnut: mat(0x7a4f2e, { roughness: 0.7 }),
  oak: mat(0xc9a06e, { roughness: 0.75 }),
  mattress: mat(0xf7f0e4),
  blanket: mat(0xd98c6b, { roughness: 1 }),
  blanketFold: mat(0xc87a5c, { roughness: 1 }),
  pillow: mat(0xfff9ee),
  pillowAccent: mat(0xe7bb8e),
  rugOuter: mat(0xc96f5a, { roughness: 1 }),
  rugInner: mat(0xf1dec3, { roughness: 1 }),
  rugStripe: mat(0x8d5a4a, { roughness: 1 }),
  pot: mat(0xc9714a, { roughness: 0.9 }),
  potCream: mat(0xf1e6d6, { roughness: 0.9 }),
  soil: mat(0x3a2a1e, { roughness: 1 }),
  leaf: mat(0x3f8f4a, { roughness: 0.9, side: THREE.DoubleSide }),
  leaf2: mat(0x5aa65c, { roughness: 0.9, side: THREE.DoubleSide }),
  leaf3: mat(0x2f6e3a, { roughness: 0.9, side: THREE.DoubleSide }),
  dark: mat(0x2a2320, { roughness: 0.6 }),
  metal: mat(0xb9b2a6, { roughness: 0.4, metalness: 0.7 }),
  brass: mat(0xd6a85c, { roughness: 0.35, metalness: 0.8 }),
  lampShade: mat(0xf6dcae, { roughness: 1, side: THREE.DoubleSide }),
  curtain: mat(0xe9c8a6, { roughness: 1 }),
  guitar: mat(0xd28d44, { roughness: 0.5 }),
  guitarDark: mat(0x3b2415, { roughness: 0.6 }),
  speaker: mat(0x3a3330, { roughness: 0.8 }),
  speakerCone: mat(0x6b625c, { roughness: 1 }),
  frameDark: mat(0x3a2a1e, { roughness: 0.7 }),
  frameLight: mat(0xfaf5ec, { roughness: 0.8 }),
  frameOak: mat(0xc9a06e, { roughness: 0.8 }),
  wire: mat(0x2b2622, { roughness: 1 }),
};

function box(w, h, d, material, x = 0, y = 0, z = 0, { cast = true, receive = true, rounded = 0 } = {}) {
  const geo = rounded > 0 ? new RoundedBoxGeometry(w, h, d, 3, rounded) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function cylinder(rt, rb, h, material, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------------------

function buildShell() {
  const g = new THREE.Group();

  // floor slab with planks on top
  const plank = makePlankTexture();
  plank.repeat.set(1, 1);
  const floorMat = new THREE.MeshStandardMaterial({ map: plank, roughness: 0.75 });
  const sideMat = M.walnut;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 0.4, 0.8, W * 2 + 0.4), [
    sideMat, sideMat, floorMat, sideMat, sideMat, sideMat,
  ]);
  floor.position.y = -0.4;
  floor.receiveShadow = true;
  floor.castShadow = true;
  g.add(floor);

  // wall B: x = -4, full
  const wallB = box(WALL_T, WALL_H, W * 2 + WALL_T, M.wall, -W - WALL_T / 2 + 0.15, WALL_H / 2, 0);
  g.add(wallB);

  // wall A: z = -4, with a window opening at x in [1.1, 3.1], y in [2.0, 3.8]
  const wz = -W - WALL_T / 2 + 0.15;
  const win = { x0: 1.1, x1: 3.1, y0: 2.0, y1: 3.8 };
  const pieces = [
    [-W, win.x0, 0, WALL_H],
    [win.x1, W, 0, WALL_H],
    [win.x0, win.x1, win.y1, WALL_H],
    [win.x0, win.x1, 0, win.y0],
  ];
  for (const [x0, x1, y0, y1] of pieces) {
    g.add(box(x1 - x0, y1 - y0, WALL_T, M.wall, (x0 + x1) / 2, (y0 + y1) / 2, wz));
  }

  // window frame + muntins
  const fw = 0.08;
  const frameMat = M.trim;
  const wcx = (win.x0 + win.x1) / 2;
  const wcy = (win.y0 + win.y1) / 2;
  const ww = win.x1 - win.x0;
  const wh = win.y1 - win.y0;
  g.add(box(ww + fw * 2, fw, WALL_T + 0.1, frameMat, wcx, win.y1 + fw / 2, wz));
  g.add(box(ww + fw * 2, fw, WALL_T + 0.1, frameMat, wcx, win.y0 - fw / 2, wz));
  g.add(box(fw, wh, WALL_T + 0.1, frameMat, win.x0 - fw / 2, wcy, wz));
  g.add(box(fw, wh, WALL_T + 0.1, frameMat, win.x1 + fw / 2, wcy, wz));
  g.add(box(0.05, wh, 0.05, frameMat, wcx, wcy, wz));
  g.add(box(ww, 0.05, 0.05, frameMat, wcx, wcy, wz));

  // glass
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xbfe3ff,
    transparent: true,
    opacity: 0.22,
    roughness: 0.1,
    metalness: 0.1,
    emissive: 0xffb466,
    emissiveIntensity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), glassMat);
  glass.position.set(wcx, wcy, wz);
  g.add(glass);

  // sill
  g.add(box(ww + 0.5, 0.08, 0.5, frameMat, wcx, win.y0 - fw - 0.04, wz + 0.2));

  // curtains
  for (const x of [win.x0 - 0.3, win.x1 + 0.3]) {
    const c = box(0.42, wh + 0.75, 0.14, M.curtain, x, wcy + 0.15, wz + 0.26, { rounded: 0.05 });
    g.add(c);
  }
  // curtain rod
  const rod = cylinder(0.025, 0.025, ww + 1.2, M.brass, wcx, win.y1 + 0.45, wz + 0.26);
  rod.rotation.z = Math.PI / 2;
  g.add(rod);

  // baseboards
  g.add(box(W * 2, 0.18, 0.06, M.trim, 0, 0.09, -W + 0.18));
  g.add(box(0.06, 0.18, W * 2, M.trim, -W + 0.18, 0.09, 0));

  return { group: g, glassMat };
}

// ---------------------------------------------------------------------------

function buildBed() {
  const g = new THREE.Group();
  // frame along wall A corner (x -3.7..-1.5, z -3.7..-0.5)
  const cx = -2.6, cz = -2.1, bw = 2.2, bl = 3.2;
  g.add(box(bw, 0.3, bl, M.walnut, cx, 0.35, cz));
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(box(0.12, 0.3, 0.12, M.walnut, cx + dx * (bw / 2 - 0.1), 0.15, cz + dz * (bl / 2 - 0.1)));
  }
  g.add(box(bw + 0.1, 1.3, 0.12, M.walnut, cx, 1.0, cz - bl / 2 - 0.02)); // headboard
  g.add(box(bw - 0.15, 0.32, bl - 0.15, M.mattress, cx, 0.66, cz, { rounded: 0.06 }));
  // blanket covers the lower 2/3 of the bed and drapes over the sides
  const blanket = box(bw + 0.05, 0.22, bl * 0.62, M.blanket, cx, 0.86, cz + bl * 0.19, { rounded: 0.08 });
  g.add(blanket);
  g.add(box(bw + 0.05, 0.12, 0.35, M.blanketFold, cx, 0.95, cz + bl * 0.19 - bl * 0.31 + 0.18, { rounded: 0.05 }));
  // pillows
  g.add(box(0.85, 0.22, 0.5, M.pillow, cx - 0.5, 0.95, cz - bl / 2 + 0.45, { rounded: 0.08 }));
  g.add(box(0.85, 0.22, 0.5, M.pillow, cx + 0.5, 0.95, cz - bl / 2 + 0.45, { rounded: 0.08 }));
  const accent = box(0.5, 0.18, 0.5, M.pillowAccent, cx, 0.98, cz - bl / 2 + 0.85, { rounded: 0.07 });
  accent.rotation.y = 0.3;
  g.add(accent);
  return g;
}

function buildNightstandAndLamp() {
  const g = new THREE.Group();
  const x = -3.4, z = 0.1;
  g.add(box(0.7, 0.62, 0.7, M.oak, x, 0.31, z));
  g.add(box(0.62, 0.05, 0.62, M.walnut, x, 0.42, z)); // drawer line
  g.add(cylinder(0.03, 0.03, 0.04, M.brass, x + 0.35, 0.31, z, 8));
  // lamp
  g.add(cylinder(0.12, 0.14, 0.05, M.brass, x, 0.645, z));
  g.add(cylinder(0.025, 0.025, 0.6, M.brass, x, 0.95, z, 8));
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.34, 20, 1, true), M.lampShade);
  shade.position.set(x, 1.36, z);
  shade.castShadow = false;
  g.add(shade);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: 0xffc27a, emissiveIntensity: 0 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), bulbMat);
  bulb.position.set(x, 1.3, z);
  g.add(bulb);
  const light = new THREE.PointLight(0xffb15c, 0, 11, 2);
  light.position.set(x, 1.32, z);
  light.castShadow = false;
  g.add(light);
  // a small book stack
  g.add(box(0.3, 0.05, 0.22, mat(0x6d8fb3), x + 0.0, 0.645, z + 0.2));
  g.add(box(0.26, 0.05, 0.2, mat(0xd36b5a), x + 0.02, 0.695, z + 0.2));
  return { group: g, light, bulbMat };
}

function buildBookshelf() {
  const g = new THREE.Group();
  const x0 = -1.0, x1 = 0.6, zc = -3.62, depth = 0.36, h = 3.3;
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const side = 0.05;
  g.add(box(side, h, depth, M.oak, x0 + side / 2, h / 2, zc));
  g.add(box(side, h, depth, M.oak, x1 - side / 2, h / 2, zc));
  g.add(box(w, h, 0.03, M.oak, cx, h / 2, zc - depth / 2 + 0.015));
  const shelfYs = [0.05, 0.85, 1.65, 2.45, 3.25];
  for (const y of shelfYs) g.add(box(w, 0.05, depth, M.oak, cx, y, zc));

  // books sorted by hue across all shelves
  const total = 46;
  let n = 0;
  let seed = 42;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const color = new THREE.Color();
  for (let s = 0; s < 4; s++) {
    const y = shelfYs[s] + 0.025;
    let x = x0 + side + 0.03;
    const maxX = x1 - side - 0.03 - (s === 3 ? 0.45 : 0);
    while (x < maxX - 0.08) {
      const t = 0.08 + rnd() * 0.08;
      const bh = 0.42 + rnd() * 0.3;
      const hue = (n / total) * 0.92;
      color.setHSL(hue, 0.55 + rnd() * 0.2, 0.42 + rnd() * 0.15);
      const b = box(t, bh, 0.28 - rnd() * 0.06, mat(color.getHex()), x + t / 2, y + bh / 2, zc + 0.02);
      if (rnd() < 0.12) { b.rotation.z = -0.12; b.position.x += 0.03; }
      g.add(b);
      x += t + 0.004;
      n++;
    }
  }
  // trailing plant on top + a little one on the 4th shelf gap
  g.add(buildTrailingPlant(cx + 0.4, h + 0.025, zc));
  g.add(buildSmallPlant(x1 - 0.28, shelfYs[3] + 0.025, zc + 0.02, 0.6));
  return g;
}

function buildRecordPlayer() {
  const g = new THREE.Group();
  // cabinet sits against wall A, flush with the right side of the bookshelf
  const cx = 1.55, cz = -3.35;
  g.add(box(1.6, 0.8, 0.6, M.walnut, cx, 0.4, cz));
  g.add(box(1.5, 0.02, 0.5, M.oak, cx, 0.81, cz));
  g.add(box(0.7, 0.3, 0.02, M.oak, cx - 0.4, 0.4, cz + 0.31)); // cabinet doors
  g.add(box(0.7, 0.3, 0.02, M.oak, cx + 0.4, 0.4, cz + 0.31));
  g.add(cylinder(0.02, 0.02, 0.03, M.brass, cx - 0.05, 0.4, cz + 0.33, 8));
  g.add(cylinder(0.02, 0.02, 0.03, M.brass, cx + 0.05, 0.4, cz + 0.33, 8));
  // legs
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = cylinder(0.03, 0.02, 0.25, M.walnut, cx + dx * 0.7, 0.0, cz + dz * 0.22, 6);
    leg.rotation.z = dx * 0.15;
    g.add(leg);
  }
  // turntable
  g.add(box(0.95, 0.1, 0.56, M.dark, cx - 0.1, 0.87, cz));
  g.add(cylinder(0.38, 0.38, 0.03, M.metal, cx - 0.2, 0.935, cz, 32));
  const vinylMat = new THREE.MeshStandardMaterial({ map: makeVinylTexture(), roughness: 0.55 });
  const vinyl = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.012, 48), [M.dark, vinylMat, M.dark]);
  vinyl.position.set(cx - 0.2, 0.956, cz);
  vinyl.castShadow = true;
  g.add(vinyl);
  g.add(cylinder(0.012, 0.012, 0.05, M.metal, cx - 0.2, 0.98, cz, 8));
  // tonearm
  g.add(cylinder(0.06, 0.06, 0.06, M.metal, cx + 0.28, 0.95, cz - 0.18, 12));
  const arm = box(0.03, 0.02, 0.5, M.metal, cx + 0.2, 0.99, cz + 0.02);
  arm.rotation.y = 0.35;
  g.add(arm);

  // speaker on the floor to the right of the cabinet, under the window
  const sx = 2.78, sz = -3.4;
  g.add(box(0.42, 0.62, 0.4, M.speaker, sx, 0.31, sz, { rounded: 0.02 }));
  for (const [r, y] of [[0.12, 0.42], [0.06, 0.16]]) {
    const cone = cylinder(r, r, 0.02, M.speakerCone, sx, y, sz + 0.21, 20);
    cone.rotation.x = Math.PI / 2;
    g.add(cone);
  }
  // a few records leaning against the speaker
  const sleeves = [0xe4ad4c, 0x4f7a9c, 0xb3462f];
  sleeves.forEach((col, i) => {
    const r = box(0.02, 0.62, 0.62, mat(col), sx + 0.25 + i * 0.03, 0.33, sz);
    r.rotation.z = -0.12 - i * 0.05;
    g.add(r);
  });
  return { group: g, vinyl };
}

// ---------------------------------------------------------------------------
// Plants

function leafMesh(len, wid, material) {
  const geo = new THREE.SphereGeometry(0.5, 8, 6);
  geo.scale(wid, 0.08, len);
  geo.translate(0, 0, len * 0.5);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  return m;
}

function buildTallPlant(x, z) {
  const g = new THREE.Group();
  g.add(cylinder(0.34, 0.26, 0.62, M.pot, 0, 0.31, 0, 20));
  g.add(cylinder(0.31, 0.31, 0.04, M.soil, 0, 0.62, 0, 20));
  g.add(cylinder(0.04, 0.05, 1.9, M.guitarDark, 0, 1.55, 0, 7));
  const leaves = 10;
  for (let i = 0; i < leaves; i++) {
    const t = i / leaves;
    const y = 1.1 + t * 1.4;
    const ang = i * 2.39996; // golden angle
    const l = leafMesh(0.75 - t * 0.2, 0.42 - t * 0.12, i % 3 === 0 ? M.leaf2 : M.leaf);
    l.position.set(Math.cos(ang) * 0.06, y, Math.sin(ang) * 0.06);
    l.rotation.set(0, -ang, 0);
    l.rotateX(-0.35 - t * 0.3);
    g.add(l);
  }
  g.position.set(x, 0, z);
  return g;
}

function buildMonstera(x, z) {
  const g = new THREE.Group();
  g.add(cylinder(0.26, 0.2, 0.42, M.potCream, 0, 0.21, 0, 20));
  g.add(cylinder(0.23, 0.23, 0.04, M.soil, 0, 0.42, 0, 20));
  const n = 6;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + 0.4;
    const stem = cylinder(0.015, 0.02, 0.7, M.leaf3, 0, 0.75, 0, 5);
    stem.rotation.set(0, -ang, 0);
    stem.rotateX(0.55);
    stem.position.set(Math.cos(ang) * 0.17, 0.72, Math.sin(ang) * 0.17);
    g.add(stem);
    const l = leafMesh(0.55, 0.5, i % 2 ? M.leaf : M.leaf3);
    l.position.set(Math.cos(ang) * 0.32, 1.02, Math.sin(ang) * 0.32);
    l.rotation.set(0, -ang, 0);
    l.rotateX(-0.25);
    g.add(l);
  }
  g.position.set(x, 0, z);
  return g;
}

function buildSmallPlant(x, y, z, scale = 1) {
  const g = new THREE.Group();
  g.add(cylinder(0.14, 0.11, 0.22, M.pot, 0, 0.11, 0, 14));
  g.add(cylinder(0.12, 0.12, 0.03, M.soil, 0, 0.22, 0, 14));
  for (let i = 0; i < 7; i++) {
    const ang = i * 2.39996;
    const blob = new THREE.Mesh(new THREE.SphereGeometry(0.08 + (i % 3) * 0.02, 7, 6), i % 2 ? M.leaf2 : M.leaf);
    blob.position.set(Math.cos(ang) * 0.09, 0.3 + (i % 2) * 0.06, Math.sin(ang) * 0.09);
    blob.castShadow = true;
    g.add(blob);
  }
  g.position.set(x, y, z);
  g.scale.setScalar(scale);
  return g;
}

function buildTrailingPlant(x, y, z) {
  const g = new THREE.Group();
  g.add(cylinder(0.17, 0.14, 0.26, M.potCream, 0, 0.13, 0, 14));
  g.add(cylinder(0.15, 0.15, 0.03, M.soil, 0, 0.26, 0, 14));
  for (let i = 0; i < 5; i++) {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 6), i % 2 ? M.leaf2 : M.leaf);
    const ang = i * 1.3;
    blob.position.set(Math.cos(ang) * 0.1, 0.33, Math.sin(ang) * 0.1);
    blob.castShadow = true;
    g.add(blob);
  }
  // vines trailing down the front
  for (let v = 0; v < 3; v++) {
    const pts = [];
    const sx = -0.1 + v * 0.1;
    for (let k = 0; k <= 6; k++) {
      pts.push(new THREE.Vector3(sx + Math.sin(k * 0.9 + v) * 0.06, 0.28 - k * 0.14, 0.14 + k * 0.02));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const vine = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.012, 5), M.leaf3);
    g.add(vine);
    for (let k = 1; k <= 6; k += 1) {
      const p = curve.getPoint(k / 6);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), k % 2 ? M.leaf : M.leaf2);
      leaf.scale.set(1, 0.6, 1.3);
      leaf.position.copy(p).add(new THREE.Vector3(0.03, 0, 0.03));
      g.add(leaf);
    }
  }
  g.position.set(x, y, z);
  return g;
}

// ---------------------------------------------------------------------------

function buildGallery() {
  const g = new THREE.Group();
  const x = -W + 0.15 + WALL_T / 2 + 0.03; // just proud of wall B
  const frames = [
    { z: -3.0, y: 3.35, w: 0.6, h: 0.8, mat: M.frameDark, kind: 'portrait' },
    { z: -2.2, y: 3.55, w: 0.8, h: 0.6, mat: M.frameLight, kind: 'sunset' },
    { z: -2.2, y: 2.75, w: 0.8, h: 0.6, mat: M.frameOak, kind: 'mountains' },
    { z: -1.3, y: 3.2, w: 0.7, h: 0.95, mat: M.frameLight, kind: 'planet' },
    { z: -0.5, y: 3.55, w: 0.5, h: 0.5, mat: M.frameDark, kind: 'sea' },
    { z: -0.5, y: 2.85, w: 0.5, h: 0.6, mat: M.frameOak, kind: 'portrait' },
  ];
  for (const f of frames) {
    const frame = box(0.06, f.h, f.w, f.mat, x, f.y, f.z, { cast: false });
    g.add(frame);
    const photo = new THREE.Mesh(
      new THREE.PlaneGeometry(f.w - 0.1, f.h - 0.1),
      new THREE.MeshStandardMaterial({ map: makePhotoTexture(f.kind, 128, Math.round(128 * (f.h / f.w))), roughness: 0.9 }),
    );
    photo.rotation.y = Math.PI / 2;
    photo.position.set(x + 0.035, f.y, f.z);
    g.add(photo);
  }
  return g;
}

function buildStringLights() {
  const g = new THREE.Group();
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff0d2, emissive: 0xffc27a, emissiveIntensity: 0.1 });
  const bulbGeo = new THREE.SphereGeometry(0.065, 10, 8);
  const strands = [
    // along wall B (x fixed), varying z
    [[-3.75, 4.65, -3.9], [-3.6, 4.05, -2.0], [-3.75, 4.6, 0.0], [-3.6, 4.05, 2.0], [-3.75, 4.65, 3.9]],
    // along wall A (z fixed), varying x
    [[-3.9, 4.65, -3.75], [-2.0, 4.1, -3.6], [0.0, 4.6, -3.75], [2.0, 4.1, -3.6], [3.9, 4.65, -3.75]],
  ];
  const lights = [];
  for (const pts of strands) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.012, 5), M.wire);
    g.add(wire);
    const n = 16;
    for (let i = 1; i < n; i++) {
      const p = curve.getPoint(i / n);
      const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 4), M.wire);
      hang.position.set(p.x, p.y - 0.06, p.z);
      g.add(hang);
      const b = new THREE.Mesh(bulbGeo, bulbMat);
      b.position.set(p.x, p.y - 0.17, p.z);
      g.add(b);
    }
    for (const t of [0.3, 0.7]) {
      const p = curve.getPoint(t);
      const l = new THREE.PointLight(0xffc27a, 0, 6, 2);
      l.position.set(p.x + 0.25, p.y - 0.3, p.z + 0.25);
      g.add(l);
      lights.push(l);
    }
  }
  return { group: g, bulbMat, lights };
}

function buildGuitar() {
  const g = new THREE.Group();
  // body outline (figure 8)
  const right = [
    [0, 0.72], [0.2, 0.69], [0.33, 0.55], [0.32, 0.36], [0.24, 0.22], [0.25, 0.08],
    [0.38, -0.08], [0.45, -0.3], [0.38, -0.55], [0.2, -0.7], [0, -0.74],
  ];
  const pts = [...right, ...right.slice(1, -1).reverse().map(([x, y]) => [-x, y])].map(
    ([x, y]) => new THREE.Vector3(x, y, 0),
  );
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
  const shape = new THREE.Shape(curve.getPoints(80).map((p) => new THREE.Vector2(p.x, p.y)));
  const hole = new THREE.Path();
  hole.absarc(0, 0.1, 0.13, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 }),
    M.guitar,
  );
  body.castShadow = true;
  g.add(body);
  // dark inside of the sound hole
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), M.guitarDark);
  inner.position.set(0, 0.1, 0.02);
  g.add(inner);
  // bridge, neck, head
  g.add(box(0.3, 0.06, 0.03, M.guitarDark, 0, -0.3, 0.155));
  g.add(box(0.13, 1.35, 0.06, M.guitarDark, 0, 1.3, 0.1));
  g.add(box(0.17, 0.32, 0.05, M.guitarDark, 0, 2.1, 0.1));
  for (let i = 0; i < 6; i++) {
    const s = box(0.005, 2.35, 0.004, M.metal, -0.045 + i * 0.018, 0.86, 0.17, { cast: false });
    g.add(s);
    const peg = box(0.02, 0.02, 0.05, M.metal, (i < 3 ? -1 : 1) * 0.1, 2.0 + (i % 3) * 0.09, 0.1, { cast: false });
    g.add(peg);
  }
  // place: standing on the floor, leaning against wall B
  g.position.set(-3.45, 0.76, 1.7);
  g.rotation.order = 'YZX';
  g.rotation.y = Math.PI / 2 + 0.25;
  g.rotation.x = -0.2;
  g.rotation.z = 0.12;
  return g;
}

function buildRug() {
  const g = new THREE.Group();
  const y = 0.012;
  const mk = (r, material, yy) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.02, 48), material);
    m.position.set(0.9, yy, 1.1);
    m.receiveShadow = true;
    return m;
  };
  g.add(mk(1.75, M.rugOuter, y));
  g.add(mk(1.45, M.rugStripe, y + 0.004));
  g.add(mk(1.3, M.rugInner, y + 0.008));
  g.add(mk(0.5, M.rugOuter, y + 0.012));
  return g;
}

function buildExtras() {
  const g = new THREE.Group();
  // a floor cushion by the rug
  g.add(box(0.7, 0.2, 0.7, M.pillowAccent, 2.4, 0.1, 1.9, { rounded: 0.08 }));
  // a small side table with a mug near the window
  g.add(cylinder(0.3, 0.3, 0.04, M.oak, 3.1, 0.5, -1.6, 20));
  g.add(cylinder(0.03, 0.04, 0.5, M.dark, 3.1, 0.25, -1.6, 8));
  g.add(cylinder(0.2, 0.26, 0.03, M.dark, 3.1, 0.015, -1.6, 20));
  g.add(cylinder(0.07, 0.06, 0.12, mat(0xf2efe9), 3.05, 0.58, -1.62, 14));
  return g;
}

// ---------------------------------------------------------------------------

export function buildRoom() {
  const group = new THREE.Group();
  const shell = buildShell();
  group.add(shell.group);
  group.add(buildRug());
  group.add(buildBed());
  const ns = buildNightstandAndLamp();
  group.add(ns.group);
  group.add(buildBookshelf());
  const rp = buildRecordPlayer();
  group.add(rp.group);
  group.add(buildTallPlant(3.5, -3.3));
  group.add(buildMonstera(-3.25, 3.3));
  group.add(buildSmallPlant(2.6, 1.95, -3.6, 0.75));
  group.add(buildGallery());
  const sl = buildStringLights();
  group.add(sl.group);
  group.add(buildGuitar());
  group.add(buildExtras());

  function update(state, dt) {
    const k = state.indoor;
    ns.light.intensity = 26 * k;
    ns.bulbMat.emissiveIntensity = 2.2 * k;
    sl.bulbMat.emissiveIntensity = 0.1 + 2.4 * k;
    for (const l of sl.lights) l.intensity = 3.2 * k;
    shell.glassMat.emissiveIntensity = 0.35 * k;
    shell.glassMat.opacity = 0.22 + 0.18 * state.night;
    rp.vinyl.rotation.y -= dt * 1.4;
  }

  return { group, update };
}

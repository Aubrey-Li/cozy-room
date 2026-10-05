import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { leafGeometry, profiles, leafMaterial, stem, arcStem, placeLeaf, pot } from './foliage.js';
import {
  makePlankTexture, makePhotoTexture, makeVinylTexture,
  makeFabricBump, makePlasterBump, makeWoodTexture,
} from './textures.js';

// Room footprint: x in [-4, 4], z in [-4, 4]. Floor top at y = 0.
// Back walls: wall A along z = -4 (with the window), wall B along x = -4.
const W = 4;
const WALL_H = 5;
const WALL_T = 0.3;

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
const fabric = (color, opts = {}) =>
  new THREE.MeshPhysicalMaterial({
    color,
    roughness: 1,
    metalness: 0,
    bumpMap: T.fabric,
    bumpScale: 0.012,
    sheen: 0.7,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color(0xffffff),
    ...opts,
  });

const T = {
  fabric: makeFabricBump(),
  plaster: makePlasterBump(),
  walnut: makeWoodTexture(0x8a5a36, 0x4a2c15, 512, 5),
  oak: makeWoodTexture(0xd2a874, 0x8a6236, 512, 9),
  weave: makeFabricBump(256, 28),
};
T.weave.repeat.set(6, 6);

const M = {
  wall: mat(0xf4e8d4, { roughness: 0.95, bumpMap: T.plaster, bumpScale: 0.02 }),
  wallOuter: mat(0xe6d6bd, { roughness: 0.95 }),
  trim: mat(0xfbf7f0),
  walnut: mat(0xffffff, { roughness: 0.65, map: T.walnut }),
  oak: mat(0xffffff, { roughness: 0.7, map: T.oak }),
  mattress: fabric(0xf7f0e4),
  // bedding: one warm orange throughout
  blanket: fabric(0xe9803a, { bumpScale: 0.016, sheen: 0.85, sheenColor: new THREE.Color(0xffd2a8) }),
  pillow: fabric(0xfff9ee, { bumpScale: 0.02 }),
  pillowAccent: fabric(0xe9803a, { bumpScale: 0.02, sheen: 0.85, sheenColor: new THREE.Color(0xffd2a8) }),
  cushion: fabric(0xe7bb8e, { bumpScale: 0.02 }),
  rugOuter: mat(0xc96f5a, { roughness: 1, bumpMap: T.weave, bumpScale: 0.02 }),
  rugInner: mat(0xf1dec3, { roughness: 1, bumpMap: T.weave, bumpScale: 0.02 }),
  rugStripe: mat(0x8d5a4a, { roughness: 1, bumpMap: T.weave, bumpScale: 0.02 }),
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
  curtain: fabric(0xe9c8a6, { bumpScale: 0.02 }),
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
  const geo = rounded > 0 ? new RoundedBoxGeometry(w, h, d, 5, rounded) : new THREE.BoxGeometry(w, h, d);
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

const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const puffNoise = (x, z) =>
  (Math.sin(x * 1.7 + Math.sin(z * 1.3)) * Math.cos(z * 1.1 + Math.sin(x * 0.9))) * 0.5 + 0.5;

/**
 * A duvet with real thickness: a gently puffed top surface, an underside
 * offset along the surface normal, and side walls stitched around the rim.
 * The head edge lies flat on the sheet; the sides and foot drape down.
 */
function buildDuvet(cx, cz, bw, bl, topY) {
  const thick = 0.07;
  const pad = 0.4;
  const segX = 44, segZ = 52;
  const zStart = cz - bl / 2 + bl * 0.4;
  const zEnd = cz + bl / 2 + 0.3;
  const width = bw + pad * 2;
  const length = zEnd - zStart;
  const top = new THREE.PlaneGeometry(width, length, segX, segZ);
  top.rotateX(-Math.PI / 2); // row 0 ends up at the head (zStart)
  top.translate(cx, 0, (zStart + zEnd) / 2);
  const pos = top.attributes.position;
  const footEdge = cz + bl / 2 - 0.02;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const lx = x - cx;
    const inside = Math.min(bw / 2 - 0.02 - Math.abs(lx), footEdge - z);
    const n1 = puffNoise(lx * 2.4, z * 2.1);
    const n2 = puffNoise(lx * 5.5 + 3.0, z * 4.8 - 1.0);
    let y = topY + thick;
    if (inside > 0) {
      // soft puff, fading to flat at the mattress edges and at the head edge
      const puff = (0.045 + 0.045 * n1 + 0.02 * n2) * smooth(0, 0.35, inside) * smooth(0, 0.3, z - zStart);
      y += puff;
    } else {
      const out = -inside;
      y += -Math.min(out * 1.7, 0.62) + 0.012 * n2 * smooth(0, 0.1, out);
    }
    pos.setY(i, y);
  }
  top.computeVertexNormals();

  // underside: the top pushed down along its normals
  const bottom = top.clone();
  const bp = bottom.attributes.position;
  const nrm = top.attributes.normal;
  for (let i = 0; i < bp.count; i++) {
    bp.setXYZ(i, pos.getX(i) - nrm.getX(i) * thick, pos.getY(i) - nrm.getY(i) * thick, pos.getZ(i) - nrm.getZ(i) * thick);
  }
  const idx = bottom.index.array;
  for (let k = 0; k < idx.length; k += 3) {
    const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t;
  }
  bottom.computeVertexNormals();

  // side walls around the rim
  const cols = segX + 1;
  const rim = [];
  for (let ix = 0; ix < segX; ix++) rim.push(ix);                              // head edge
  for (let iz = 0; iz < segZ; iz++) rim.push(iz * cols + segX);                // right edge
  for (let ix = segX; ix > 0; ix--) rim.push(segZ * cols + ix);                // foot edge
  for (let iz = segZ; iz > 0; iz--) rim.push(iz * cols);                       // left edge
  const sidePos = [];
  const sideUv = [];
  for (let k = 0; k < rim.length; k++) {
    const a = rim[k], b = rim[(k + 1) % rim.length];
    const quad = [
      [pos, a], [pos, b], [bp, b],
      [pos, a], [bp, b], [bp, a],
    ];
    for (const [src, i] of quad) sidePos.push(src.getX(i), src.getY(i), src.getZ(i));
    const u0 = k / rim.length, u1 = (k + 1) / rim.length;
    sideUv.push(u0 * 40, 1, u1 * 40, 1, u1 * 40, 0, u0 * 40, 1, u1 * 40, 0, u0 * 40, 0);
  }
  const sides = new THREE.BufferGeometry();
  sides.setAttribute('position', new THREE.Float32BufferAttribute(sidePos, 3));
  sides.setAttribute('uv', new THREE.Float32BufferAttribute(sideUv, 2));
  sides.computeVertexNormals();

  const g = new THREE.Group();
  for (const geo of [top, bottom, sides]) {
    const m = new THREE.Mesh(geo, M.blanket);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  M.blanket.side = THREE.DoubleSide; // the stitched rim does not care about winding
  return g;
}

function buildBed() {
  const g = new THREE.Group();
  // frame along wall A corner (x -3.7..-1.5, z -3.7..-0.5)
  const cx = -2.6, cz = -2.1, bw = 2.2, bl = 3.2;
  g.add(box(bw, 0.3, bl, M.walnut, cx, 0.35, cz));
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(box(0.12, 0.3, 0.12, M.walnut, cx + dx * (bw / 2 - 0.1), 0.15, cz + dz * (bl / 2 - 0.1)));
  }
  g.add(box(bw + 0.1, 1.3, 0.12, M.walnut, cx, 1.0, cz - bl / 2 - 0.02)); // headboard
  const mattressTop = 0.66 + 0.16;
  g.add(box(bw - 0.15, 0.32, bl - 0.15, M.mattress, cx, 0.66, cz, { rounded: 0.06 }));
  g.add(buildDuvet(cx, cz, bw - 0.15, bl - 0.15, mattressTop));
  // pillows, plump
  const pillow = (x, z, w, d, material, rot = 0) => {
    const pm = box(w, 0.24, d, material, x, mattressTop + 0.12, z, { rounded: 0.1 });
    pm.rotation.y = rot;
    pm.scale.set(1, 0.95, 1);
    return pm;
  };
  g.add(pillow(cx - 0.5, cz - bl / 2 + 0.45, 0.85, 0.5, M.pillow));
  g.add(pillow(cx + 0.5, cz - bl / 2 + 0.45, 0.85, 0.5, M.pillow));
  g.add(pillow(cx, cz - bl / 2 + 0.85, 0.5, 0.5, M.pillowAccent, 0.3));
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

// ---------------------------------------------------------------------------
// Books

const pageMat = mat(0xf3ead6, { roughness: 0.95 });
const css = (c) => `#${c.getHexString()}`;

/** Spine artwork: cloth colour, foil bands, a title block and an author mark. */
function spineTexture(color, rnd) {
  const w = 48, h = 192;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const base = color.clone();
  const dark = color.clone().multiplyScalar(0.62);
  const light = color.clone().lerp(new THREE.Color(0xffffff), 0.35);
  // cloth with a soft rounded-spine shading
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, css(dark));
  g.addColorStop(0.3, css(base));
  g.addColorStop(0.55, css(light.clone().lerp(base, 0.6)));
  g.addColorStop(1, css(dark));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const foil = rnd() < 0.55 ? '#e8c77a' : rnd() < 0.5 ? '#f6f0e2' : '#2a221c';
  const style = Math.floor(rnd() * 4);
  ctx.fillStyle = foil;
  ctx.strokeStyle = foil;
  if (style === 0) {
    // classic: double bands top and bottom
    for (const y of [14, 22, h - 26, h - 18]) ctx.fillRect(4, y, w - 8, 3);
  } else if (style === 1) {
    // a contrasting label panel
    ctx.fillStyle = rnd() < 0.5 ? '#f3ead6' : css(dark);
    ctx.fillRect(6, h * 0.22, w - 12, h * 0.3);
    ctx.strokeRect(6, h * 0.22, w - 12, h * 0.3);
    ctx.fillStyle = foil;
  } else if (style === 2) {
    // raised ribs like an old leather binding
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = css(dark);
      ctx.fillRect(0, 20 + i * 42, w, 6);
      ctx.fillStyle = css(light);
      ctx.fillRect(0, 20 + i * 42, w, 2);
    }
    ctx.fillStyle = foil;
  } else {
    // modern paperback: a block of colour at the bottom
    ctx.fillStyle = css(light);
    ctx.fillRect(0, h * 0.78, w, h * 0.22);
    ctx.fillStyle = foil;
  }
  // title "letters" running down the spine
  const titleTop = style === 1 ? h * 0.26 : h * 0.24;
  const titleLen = h * (0.18 + rnd() * 0.14);
  for (let y = titleTop; y < titleTop + titleLen; y += 7) {
    if (rnd() < 0.15) continue; // word gaps
    ctx.fillRect(w / 2 - 4 + (rnd() - 0.5) * 2, y, 8, 4);
  }
  // author initials and a publisher mark
  ctx.fillRect(w / 2 - 6, h * 0.66, 12, 3);
  ctx.beginPath();
  ctx.arc(w / 2, h - 34, 3.5, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A book standing upright: spine faces +Z, pages show on top and the open side. */
function book(t, bh, depth, color, rnd) {
  const cover = mat(color.getHex(), { roughness: 0.8 });
  const spine = new THREE.MeshStandardMaterial({ map: spineTexture(color, rnd), roughness: 0.75 });
  // +x, -x, +y, -y, +z, -z
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(t, bh, depth), [cover, cover, pageMat, pageMat, spine, pageMat]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // hardcover boards overhang the page block a touch
  if (rnd() < 0.7) {
    for (const side of [-1, 1]) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.008, bh + 0.016, depth + 0.012), cover);
      board.position.x = side * (t / 2 + 0.004);
      board.position.z = 0.006;
      mesh.add(board);
    }
  }
  return mesh;
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
  // front lip on each shelf
  for (const y of shelfYs) g.add(box(w - side * 2, 0.07, 0.02, M.oak, cx, y + 0.01, zc + depth / 2 - 0.01));

  let seed = 42;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const color = new THREE.Color();

  // space reserved at the right end of each shelf for something that is not an upright book
  const reserve = [0.12, 0.44, 0.3, 0.45];
  const inner0 = x0 + side + 0.03;
  // count books first so the rainbow spans every shelf evenly
  const plan = [];
  for (let sIdx = 0; sIdx < 4; sIdx++) {
    let x = inner0;
    const maxX = x1 - side - 0.03 - reserve[sIdx];
    while (x < maxX - 0.08) {
      const t = 0.07 + rnd() * 0.08;
      plan.push({ sIdx, x, t, bh: 0.44 + rnd() * 0.28, d: 0.27 - rnd() * 0.05, lean: rnd() });
      x += t + 0.006;
    }
  }
  plan.forEach((p, n) => {
    const hue = (n / plan.length) * 0.9;
    color.setHSL(hue, 0.5 + rnd() * 0.2, 0.4 + rnd() * 0.14);
    const b = book(p.t, p.bh, p.d, color, rnd);
    b.position.set(p.x + p.t / 2, shelfYs[p.sIdx] + 0.025 + p.bh / 2, zc + 0.03);
    g.add(b);
  });

  // shelf 0: a little wooden box at the end
  g.add(box(0.1, 0.16, 0.2, M.walnut, x1 - side - 0.08, shelfYs[0] + 0.105, zc + 0.03));

  // shelf 1: a horizontal stack topped with a candle
  {
    const sx = x1 - side - 0.24;
    let y = shelfYs[1] + 0.025;
    const stack = [[0.36, 0.06, 0.06], [0.34, 0.05, 0.02], [0.32, 0.07, 0.95], [0.3, 0.045, 0.5]];
    stack.forEach(([len, th, hue], i) => {
      color.setHSL(hue, 0.35, 0.45);
      const b = book(th, len, 0.24, color, rnd);
      b.rotation.z = Math.PI / 2;
      b.rotation.y = (i % 2 ? 1 : -1) * 0.06;
      b.position.set(sx, y + th / 2, zc + 0.03);
      g.add(b);
      y += th;
    });
    const candleMat = mat(0xf6efe2, { roughness: 0.6 });
    g.add(cylinder(0.05, 0.05, 0.12, candleMat, sx, y + 0.06, zc + 0.04, 14));
    g.add(cylinder(0.004, 0.004, 0.025, M.dark, sx, y + 0.13, zc + 0.04, 4));
  }

  // shelf 2: a brass bookend holding the row and a single leaning book
  {
    const ex = x1 - side - 0.3 + 0.02;
    const by = shelfYs[2] + 0.025;
    g.add(box(0.02, 0.32, 0.18, M.brass, ex, by + 0.16, zc + 0.03));
    g.add(box(0.14, 0.012, 0.18, M.brass, ex + 0.07, by + 0.006, zc + 0.03));
    color.setHSL(0.08, 0.55, 0.5);
    const lean = book(0.06, 0.5, 0.24, color, rnd);
    lean.rotation.z = -0.32;
    lean.position.set(ex + 0.16, by + 0.235, zc + 0.03);
    g.add(lean);
  }

  // trailing pothos on top, a succulent in the shelf-3 gap
  g.add(buildPothos(cx + 0.38, h + 0.025, zc + 0.02));
  g.add(buildSucculent(x1 - 0.28, shelfYs[3] + 0.025, zc + 0.02, 0.85));
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
  // tonearm on a pivot: rests beside the platter, swings over the grooves to play
  g.add(cylinder(0.06, 0.06, 0.06, M.metal, cx + 0.28, 0.95, cz - 0.18, 12));
  const arm = new THREE.Group();
  arm.position.set(cx + 0.28, 0.99, cz - 0.18);
  arm.add(cylinder(0.035, 0.035, 0.04, M.metal, 0, 0.0, 0, 10)); // pivot cap
  arm.add(box(0.025, 0.018, 0.48, M.metal, 0, 0.01, 0.24));    // arm tube
  arm.add(box(0.05, 0.02, 0.07, M.dark, 0, 0.0, 0.5));          // headshell
  arm.add(box(0.05, 0.03, 0.05, M.metal, 0, 0.01, -0.07));      // counterweight
  g.add(arm);
  // arm rest post where the headshell parks
  g.add(cylinder(0.012, 0.012, 0.06, M.metal, cx + 0.28 + Math.sin(0.2) * 0.5, 0.95, cz - 0.18 + Math.cos(0.2) * 0.5, 6));

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
  return { group: g, vinyl, arm };
}

// ---------------------------------------------------------------------------
// Plants

const P = {
  fig: leafMaterial(0x3e7d34),
  figLight: leafMaterial(0x5b9a43),
  monstera: leafMaterial(0x2f6f3a),
  monsteraLight: leafMaterial(0x478a45),
  pothos: leafMaterial(0x5aa04a),
  pothosVar: leafMaterial(0x9cc86a),
  succulent: leafMaterial(0x8fb39a, { map: null, roughness: 0.45 }),
  succulentTip: leafMaterial(0xc98a9a, { map: null, roughness: 0.45 }),
  stem: mat(0x4e7a35, { roughness: 0.8 }),
  bark: mat(0x6b4f36, { roughness: 1 }),
};

let plantSeed = 99;
const prnd = () => { plantSeed = (plantSeed * 16807) % 2147483647; return plantSeed / 2147483647; };

/** Fiddle-leaf fig: a slim trunk with big violin-shaped leaves spiralling up. */
function buildTallPlant(x, z) {
  const g = new THREE.Group();
  const pt = pot(0.34, 0.26, 0.62, M.pot, M.soil);
  g.add(pt);
  const top = pt.userData.top;
  // gently curving trunk
  const trunkPts = [
    new THREE.Vector3(0, top, 0),
    new THREE.Vector3(0.04, top + 0.7, 0.02),
    new THREE.Vector3(-0.03, top + 1.5, -0.02),
    new THREE.Vector3(0.02, top + 2.2, 0.03),
  ];
  const trunkCurve = new THREE.CatmullRomCurve3(trunkPts);
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(trunkCurve, 24, 0.035, 6), P.bark);
  trunk.castShadow = true;
  g.add(trunk);

  const geos = [0, 1, 2].map((i) =>
    leafGeometry(profiles.fiddle, { length: 1, width: 0.7, curl: 0.18 + i * 0.06, cup: 0.12 }));
  const n = 16;
  for (let i = 0; i < n; i++) {
    const t = 0.18 + (i / (n - 1)) * 0.82;
    const at = trunkCurve.getPoint(t);
    // golden-angle spiral, folded into a 250-degree fan that faces away from the back wall
    const az = Math.PI * 0 + (((i * 2.39996) % (Math.PI * 2)) / (Math.PI * 2) - 0.5) * THREE.MathUtils.degToRad(250);
    const scale = 0.42 + 0.22 * Math.sin(t * Math.PI) + prnd() * 0.06;
    // short petiole out from the trunk
    const out = new THREE.Vector3(Math.sin(az), 0.45, Math.cos(az)).multiplyScalar(0.06);
    const base = at.clone().add(out);
    g.add(stem(at, base, 0.01, P.stem, 4));
    const pitch = THREE.MathUtils.lerp(0.15, 0.85, t) + (prnd() - 0.5) * 0.2;
    g.add(placeLeaf(geos[i % 3], i % 4 === 0 ? P.figLight : P.fig, base, az, pitch, scale, (prnd() - 0.5) * 0.5));
  }
  // a fresh bud at the top
  const bud = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 6), P.figLight);
  bud.position.copy(trunkCurve.getPoint(1)).add(new THREE.Vector3(0, 0.06, 0));
  g.add(bud);
  g.position.set(x, 0, z);
  return g;
}

/** Monstera: long arcing stems ending in big split leaves. */
function buildMonstera(x, z) {
  const g = new THREE.Group();
  const pt = pot(0.28, 0.22, 0.44, M.potCream, M.soil);
  g.add(pt);
  const top = pt.userData.top;
  const slitSets = [
    [{ y: 0.3, depth: 0.12 }, { y: 0.5, depth: 0.1 }, { y: 0.7, depth: 0.12 }],
    [{ y: 0.35, depth: 0.08 }, { y: 0.62, depth: 0.1 }],
    [{ y: 0.25, depth: 0.14 }, { y: 0.45, depth: 0.1 }, { y: 0.65, depth: 0.1 }, { y: 0.82, depth: 0.2 }],
  ];
  const geos = slitSets.map((sl, i) =>
    leafGeometry(profiles.monstera, { length: 1, width: 0.9, curl: 0.22 + i * 0.05, cup: 0.08, slits: sl, segments: 40 }));
  // the leaf cutout shape only appears on one side; mirror a copy for the other side
  const mirrored = geos.map((geo) => {
    const m = geo.clone();
    m.scale(-1, 1, 1);
    m.computeVertexNormals();
    return m;
  });
  // fan the leaves toward the room (+x, -z) so none push through the wall or off the floor
  const n = 7;
  const fanCenter = Math.atan2(1, -1);
  const fanSpread = 2.3;
  for (let i = 0; i < n; i++) {
    const az = fanCenter + ((i + 0.5) / n - 0.5) * fanSpread + (prnd() - 0.5) * 0.2;
    const reach = 0.3 + prnd() * 0.2;
    const height = 0.55 + prnd() * 0.45;
    const from = new THREE.Vector3(Math.sin(az) * 0.05, top, Math.cos(az) * 0.05);
    const to = new THREE.Vector3(Math.sin(az) * reach, top + height, Math.cos(az) * reach);
    const { mesh } = arcStem(from, to, 0.18, 0.016, P.stem);
    g.add(mesh);
    const k = i % 3;
    const geo = i % 2 ? geos[k] : mirrored[k];
    g.add(placeLeaf(geo, i % 3 === 0 ? P.monsteraLight : P.monstera, to, az, 0.3 + prnd() * 0.3, 0.55 + prnd() * 0.12, (prnd() - 0.5) * 0.4));
  }
  // an unfurling new leaf
  const curl = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.32, 7), P.monsteraLight);
  curl.position.set(0.02, top + 0.55, -0.03);
  curl.rotation.z = 0.15;
  curl.castShadow = true;
  g.add(curl);
  g.add(stem(new THREE.Vector3(0, top, 0), new THREE.Vector3(0.02, top + 0.42, -0.03), 0.014, P.stem));
  g.position.set(x, 0, z);
  return g;
}

/** Echeveria-style succulent rosette in a small pot. */
function buildSucculent(x, y, z, scale = 1) {
  const g = new THREE.Group();
  const pt = pot(0.13, 0.1, 0.18, M.pot, M.soil, false);
  g.add(pt);
  const top = pt.userData.top;
  const geo = leafGeometry(profiles.succulent, { length: 1, width: 0.55, curl: -0.12, cup: -0.18, segments: 14 });
  const rings = [
    { n: 9, len: 0.13, pitch: 0.2, r: 0.04 },
    { n: 8, len: 0.11, pitch: 0.55, r: 0.025 },
    { n: 6, len: 0.08, pitch: 0.95, r: 0.012 },
    { n: 4, len: 0.05, pitch: 1.25, r: 0.0 },
  ];
  rings.forEach((ring, ri) => {
    for (let i = 0; i < ring.n; i++) {
      const az = (i / ring.n) * Math.PI * 2 + ri * 0.45;
      const at = new THREE.Vector3(Math.sin(az) * ring.r, top + 0.02 + ri * 0.012, Math.cos(az) * ring.r);
      // the leaf curls toward -Z (up when lying flat) so the rosette cups upward
      const leaf = placeLeaf(geo, ri === 0 && i % 3 === 0 ? P.succulentTip : P.succulent, at, az, ring.pitch, ring.len);
      g.add(leaf);
    }
  });
  g.position.set(x, y, z);
  g.scale.setScalar(scale);
  return g;
}

/** Pothos: heart-shaped leaves along vines spilling over the edge. */
function buildPothos(x, y, z) {
  const g = new THREE.Group();
  const pt = pot(0.17, 0.14, 0.26, M.potCream, M.soil, false);
  g.add(pt);
  const top = pt.userData.top;
  const heart = [0, 1].map((i) => leafGeometry(profiles.heart, { length: 1, width: 0.85, curl: 0.15 + i * 0.1, cup: 0.15, segments: 18 }));
  const leafAt = (at, az, pitch, scale) =>
    placeLeaf(heart[prnd() < 0.5 ? 0 : 1], prnd() < 0.3 ? P.pothosVar : P.pothos, at, az, pitch, scale, (prnd() - 0.5) * 0.6);

  // a mound of leaves in the pot
  for (let i = 0; i < 12; i++) {
    const az = i * 2.39996;
    const at = new THREE.Vector3(Math.sin(az) * 0.06, top + 0.02, Math.cos(az) * 0.06);
    g.add(leafAt(at, az, 0.3 + prnd() * 0.7, 0.11 + prnd() * 0.04));
  }
  // vines: up over the rim, then down the front and sides of the shelf
  const vines = [
    { az: 0.2, drop: 1.2, out: 0.24 },
    { az: -0.35, drop: 0.9, out: 0.22 },
    { az: 0.7, drop: 0.6, out: 0.2 },
    { az: -1.1, drop: 0.45, out: 0.2 },
    { az: 1.4, drop: 0.35, out: 0.18 },
  ];
  for (const v of vines) {
    const dir = new THREE.Vector3(Math.sin(v.az), 0, Math.cos(v.az));
    const pts = [
      new THREE.Vector3(0, top, 0).addScaledVector(dir, 0.08),
      new THREE.Vector3(0, top + 0.06, 0).addScaledVector(dir, 0.18),
      new THREE.Vector3(0, top - 0.08, 0).addScaledVector(dir, v.out),
    ];
    const steps = 5;
    for (let k = 1; k <= steps; k++) {
      const p = new THREE.Vector3(0, top - 0.08 - (k / steps) * v.drop, 0).addScaledVector(dir, v.out + 0.02 * Math.sin(k * 1.7));
      p.x += Math.sin(k * 1.3 + v.az * 3) * 0.04;
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const vine = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.008, 5), P.stem);
    g.add(vine);
    const leaves = Math.round(6 + v.drop * 8);
    for (let k = 1; k <= leaves; k++) {
      const t = k / (leaves + 0.5);
      const at = curve.getPoint(t);
      const side = k % 2 ? 1 : -1;
      const az = v.az + side * 0.9 + (prnd() - 0.5) * 0.5;
      g.add(leafAt(at, az, -0.2 + prnd() * 0.5, (0.1 - t * 0.04) * (0.85 + prnd() * 0.3)));
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
  g.add(box(0.7, 0.2, 0.7, M.cushion, 2.4, 0.1, 1.9, { rounded: 0.08 }));
  // a small side table with a mug near the window
  g.add(cylinder(0.3, 0.3, 0.04, M.oak, 3.1, 0.5, -1.6, 20));
  g.add(cylinder(0.03, 0.04, 0.5, M.dark, 3.1, 0.25, -1.6, 8));
  g.add(cylinder(0.2, 0.26, 0.03, M.dark, 3.1, 0.015, -1.6, 20));
  g.add(cylinder(0.07, 0.06, 0.12, mat(0xf2efe9), 3.05, 0.58, -1.62, 14));
  return g;
}

// ---------------------------------------------------------------------------

const ARM_REST = 0.2;

// ---------------------------------------------------------------------------
// Floating music notes that drift up from the turntable while a song plays

/** Draw a note as vector shapes so it looks the same on every device. */
function noteTexture(kind) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const head = (x, y) => {
    ctx.beginPath();
    ctx.ellipse(x, y, 17, 12, -0.45, 0, Math.PI * 2);
  };
  const path = new Path2D();
  const shapes = [];
  if (kind === 'eighth') {
    shapes.push(() => { head(46, 96); });
    shapes.push(() => { ctx.beginPath(); ctx.rect(57, 22, 8, 74); });
    shapes.push(() => {
      ctx.beginPath();
      ctx.moveTo(61, 22);
      ctx.bezierCurveTo(70, 40, 98, 46, 92, 74);
      ctx.bezierCurveTo(90, 56, 76, 52, 61, 50);
      ctx.closePath();
    });
  } else if (kind === 'beamed') {
    shapes.push(() => { head(32, 98); });
    shapes.push(() => { head(90, 86); });
    shapes.push(() => { ctx.beginPath(); ctx.rect(43, 30, 8, 68); });
    shapes.push(() => { ctx.beginPath(); ctx.rect(101, 18, 8, 68); });
    shapes.push(() => {
      ctx.beginPath();
      ctx.moveTo(43, 30); ctx.lineTo(109, 18); ctx.lineTo(109, 34); ctx.lineTo(43, 46);
      ctx.closePath();
    });
  } else {
    // quarter note
    shapes.push(() => { head(52, 96); });
    shapes.push(() => { ctx.beginPath(); ctx.rect(63, 20, 8, 76); });
  }
  void path;
  // pass 1: soft warm glow + dark outline, pass 2: white fill (tinted by the sprite colour)
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(255, 180, 90, 0.9)';
  ctx.shadowBlur = 14;
  ctx.strokeStyle = 'rgba(70, 38, 18, 0.9)';
  ctx.lineWidth = 10;
  for (const draw of shapes) { draw(); ctx.stroke(); }
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  for (const draw of shapes) { draw(); ctx.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createNotes(origin) {
  const textures = ['eighth', 'beamed', 'quarter', 'eighth'].map(noteTexture);
  const tints = [0xffd27a, 0xffb85c, 0xfff0c8, 0xff9f8a];
  const group = new THREE.Group();
  const pool = [];
  for (let i = 0; i < 26; i++) {
    const mat = new THREE.SpriteMaterial({
      map: textures[i % textures.length],
      color: tints[i % tints.length],
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    sprite.renderOrder = 5;
    group.add(sprite);
    pool.push({ sprite, age: 0, life: 1, drift: 0, sway: 0, phase: 0, size: 0.2 });
  }
  let spawnTimer = 0;

  function spawn() {
    const n = pool.find((p) => !p.sprite.visible);
    if (!n) return;
    n.age = 0;
    n.life = 5.5 + Math.random() * 2;
    n.drift = (Math.random() - 0.5) * 1.1; // sideways travel over the note's life
    n.sway = 0.06 + Math.random() * 0.06;
    n.phase = Math.random() * Math.PI * 2;
    n.size = 0.22 + Math.random() * 0.1;
    n.height = 4.4 + Math.random() * 1.2; // up past the walls into the sky
    n.x0 = origin.x + (Math.random() - 0.5) * 0.4;
    n.z0 = origin.z + (Math.random() - 0.5) * 0.3 + 0.1;
    n.sprite.visible = true;
  }

  // viewScale keeps notes legible when zoomed out
  function update(dt, playing, viewScale = 1) {
    if (playing) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawn();
        spawnTimer = 0.32 + Math.random() * 0.3;
      }
    }
    for (const n of pool) {
      if (!n.sprite.visible) continue;
      n.age += dt;
      const t = n.age / n.life;
      if (t >= 1) {
        n.sprite.visible = false;
        n.sprite.material.opacity = 0;
        continue;
      }
      // quick lift off the platter, slowing to a drift as it reaches the sky
      const rise = n.height * (1 - Math.pow(1 - t, 3));
      n.sprite.position.set(
        n.x0 + n.drift * t + Math.sin(n.age * 1.6 + n.phase) * n.sway,
        origin.y + 0.1 + rise,
        n.z0 + n.drift * 0.4 * t,
      );
      // pop in, hold, fade out near the top
      const fadeIn = Math.min(1, t / 0.06);
      const fadeOut = 1 - Math.max(0, (t - 0.62) / 0.38);
      n.sprite.material.opacity = 0.95 * fadeIn * fadeOut;
      const s = n.size * viewScale * (0.6 + 0.4 * fadeIn);
      n.sprite.scale.set(s, s, s);
      n.sprite.material.rotation = Math.sin(n.age * 1.3 + n.phase) * 0.25;
    }
  }

  return { group, update };
}
const ARM_PLAY = -0.6;

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
  group.add(buildMonstera(-3.3, 3.2));
  group.add(buildSucculent(2.55, 1.92, -3.66, 0.9));
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

    // ease the platter up to 33⅓ rpm while a song plays and let it coast down after
    const targetSpin = player.playing ? (33.333 / 60) * Math.PI * 2 : 0;
    player.spin += (targetSpin - player.spin) * (1 - Math.exp(-dt * (player.playing ? 2.2 : 1.1)));
    if (player.spin < 0.002 && !player.playing) player.spin = 0;
    rp.vinyl.rotation.y -= player.spin * dt;
    // tonearm swings in before the record reaches speed, and back out when it stops
    const targetArm = player.playing ? ARM_PLAY : ARM_REST;
    rp.arm.rotation.y += (targetArm - rp.arm.rotation.y) * (1 - Math.exp(-dt * 3));
    notes.update(dt, player.playing, player.viewScale);
  }

  const player = { playing: false, spin: 0, viewScale: 1 };
  rp.arm.rotation.y = ARM_REST;
  const notes = createNotes(rp.vinyl.position.clone());
  group.add(notes.group);

  return {
    group,
    update,
    recordPlayer: rp.group,
    setPlaying(on) {
      player.playing = on;
    },
    /** Camera zoom, so floating notes stay readable from far away. */
    setViewZoom(zoom) {
      player.viewScale = THREE.MathUtils.clamp(2 / Math.pow(zoom, 0.7), 0.6, 2.6);
    },
  };
}

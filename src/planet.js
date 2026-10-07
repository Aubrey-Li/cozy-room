import * as THREE from 'three';
import { makeLeafTexture, makeGlowTexture } from './textures.js';
import { leafGeometry, profiles, leafMaterial, placeLeaf } from './foliage.js';

export const PLANET_R = 22;
export const PLANET_CENTER = new THREE.Vector3(0, -PLANET_R, 0);

const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Map a flat offset (dx, dz) from the north pole onto the planet surface.
 * Returns the world position (height h above the surface) and a quaternion
 * that aligns local +Y with the surface normal.
 */
export function onPlanet(dx, dz, h = 0, outPos = new THREE.Vector3(), outQuat = new THREE.Quaternion()) {
  const d = Math.hypot(dx, dz);
  const phi = d / PLANET_R;
  if (d < 1e-6) _dir.set(0, 1, 0);
  else _dir.set(Math.sin(phi) * (dx / d), Math.cos(phi), Math.sin(phi) * (dz / d));
  outPos.copy(PLANET_CENTER).addScaledVector(_dir, PLANET_R + h);
  outQuat.setFromUnitVectors(_up, _dir);
  return { position: outPos, quaternion: outQuat, normal: _dir.clone() };
}

const HOUSE_HALF = 4.9;
const insideHouse = (dx, dz) => Math.abs(dx) < HOUSE_HALF && Math.abs(dz) < HOUSE_HALF;

let seed = 1337;
function rnd() {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}

function buildGround() {
  const geo = new THREE.SphereGeometry(PLANET_R, 128, 96);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const a = new THREE.Color(0x5d9a47);
  const b = new THREE.Color(0x76b35a);
  const c = new THREE.Color(0x4c8540);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = Math.sin(x * 0.9 + z * 0.7) * Math.cos(y * 0.8 - x * 0.3) * 0.5 + 0.5;
    const n2 = Math.sin(x * 2.3 - z * 1.7 + y * 1.1) * 0.5 + 0.5;
    tmp.copy(a).lerp(b, n).lerp(c, n2 * 0.35);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(PLANET_CENTER);
  mesh.receiveShadow = true;
  return mesh;
}

function buildGrass(wind) {
  const count = 3200;
  const geo = new THREE.ConeGeometry(0.065, 0.4, 4, 1);
  geo.translate(0, 0.2, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
  const windOpts = { pinned: true, height: 0.4, amount: 0.9 };
  wind.patch(mat, windOpts);
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.customDepthMaterial = wind.depthFor(mat, windOpts);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const yaw = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const shades = [0x5fa84a, 0x76bf5c, 0x4d8f3c, 0x8ccb6a, 0x63a34f];
  let i = 0;
  let guard = 0;
  while (i < count && guard++ < count * 10) {
    const ang = rnd() * Math.PI * 2;
    const d = 4.8 + Math.sqrt(rnd()) * 22;
    const dx = Math.cos(ang) * d;
    const dz = Math.sin(ang) * d;
    if (insideHouse(dx, dz)) continue;
    onPlanet(dx, dz, -0.03, p, q);
    yaw.setFromAxisAngle(_up, rnd() * Math.PI * 2);
    q.multiply(yaw);
    const sc = 0.7 + rnd() * 0.8;
    s.set(sc, sc * (0.8 + rnd() * 0.6), sc);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    col.setHex(shades[Math.floor(rnd() * shades.length)]);
    mesh.setColorAt(i, col);
    i++;
  }
  mesh.count = i;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildFlowers() {
  const count = 180;
  const petal = new THREE.SphereGeometry(0.11, 6, 5);
  petal.scale(1, 0.55, 1);
  petal.translate(0, 0.38, 0);
  const stem = new THREE.CylinderGeometry(0.015, 0.02, 0.36, 4);
  stem.translate(0, 0.18, 0);
  const petalMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x4d8a3b, roughness: 1 });
  const petals = new THREE.InstancedMesh(petal, petalMat, count);
  const stems = new THREE.InstancedMesh(stem, stemMat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();
  const palette = [0xffffff, 0xffd166, 0xff8fab, 0xf4a261, 0xcdb4db, 0xff6b6b];
  let i = 0;
  let guard = 0;
  while (i < count && guard++ < count * 10) {
    const ang = rnd() * Math.PI * 2;
    const d = 5.4 + Math.sqrt(rnd()) * 18;
    const dx = Math.cos(ang) * d;
    const dz = Math.sin(ang) * d;
    if (insideHouse(dx, dz)) continue;
    onPlanet(dx, dz, 0, p, q);
    const sc = 0.8 + rnd() * 0.5;
    s.setScalar(sc);
    m.compose(p, q, s);
    petals.setMatrixAt(i, m);
    stems.setMatrixAt(i, m);
    col.setHex(palette[Math.floor(rnd() * palette.length)]);
    petals.setColorAt(i, col);
    i++;
  }
  petals.count = stems.count = i;
  petals.castShadow = true;
  const g = new THREE.Group();
  g.add(petals, stems);
  return g;
}

let treeLeafMaterial = null;
let treeLeafDepth = null;
function getLeafMaterial(wind) {
  if (!treeLeafMaterial) {
    const opts = { amount: 0.55, flutter: 1 };
    treeLeafMaterial = new THREE.MeshStandardMaterial({
      map: makeLeafTexture(),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.9,
    });
    wind.patch(treeLeafMaterial, opts);
    treeLeafDepth = wind.depthFor(treeLeafMaterial, opts);
  }
  return { material: treeLeafMaterial, depth: treeLeafDepth };
}

function buildTree(dx, dz, scale, wind) {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 2.6, 7), trunkMat);
  trunk.position.y = 1.3;
  trunk.castShadow = true;
  g.add(trunk);
  // a few branches reaching into the canopy
  const branches = [
    [0.9, 2.5, 0.3], [-0.8, 2.6, -0.4], [0.2, 2.3, -0.9], [-0.3, 2.4, 0.9],
  ];
  for (const [bx, by, bz] of branches) {
    const from = new THREE.Vector3(0, 2.0, 0);
    const to = new THREE.Vector3(bx, by, bz);
    const dir = to.clone().sub(from);
    const len = dir.length();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, len, 5), trunkMat);
    b.position.copy(from).addScaledVector(dir, 0.5);
    b.quaternion.setFromUnitVectors(_up, dir.normalize());
    b.castShadow = true;
    g.add(b);
  }

  // canopy: dark cores so the crown is not hollow, plus hundreds of leaf cards
  const blobs = [
    [0, 3.0, 0, 1.45],
    [0.9, 2.5, 0.3, 1.0],
    [-0.8, 2.6, -0.4, 1.05],
    [0.2, 2.3, -0.9, 0.9],
    [-0.3, 2.4, 0.9, 0.85],
    [0.1, 3.9, 0.1, 0.9],
  ];
  const coreMat = new THREE.MeshStandardMaterial({ color: 0x2f5f2a, roughness: 1 });
  let total = 0;
  for (const [x, y, z, r] of blobs) {
    const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.62, 8, 6), coreMat);
    core.position.set(x, y, z);
    core.castShadow = true;
    g.add(core);
    total += Math.round(r * r * 160);
  }

  const { material, depth } = getLeafMaterial(wind);
  const leafGeo = new THREE.PlaneGeometry(0.46, 0.64);
  leafGeo.translate(0, 0.2, 0); // pivot near the stem end
  const leaves = new THREE.InstancedMesh(leafGeo, material, total);
  leaves.customDepthMaterial = depth;
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const roll = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const col = new THREE.Color();
  const greens = [0x4f9a3a, 0x5fae46, 0x3f8230, 0x79bf58, 0x8fc96a, 0x6aa84a];
  let i = 0;
  for (const [x, y, z, r] of blobs) {
    const n = Math.round(r * r * 160);
    for (let k = 0; k < n && i < total; k++, i++) {
      dir.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
      const rad = r * (0.5 + 0.5 * Math.sqrt(rnd()));
      pos.set(x, y, z).addScaledVector(dir, rad);
      q.setFromUnitVectors(_up, dir); // leaf points outward from the blob
      roll.setFromAxisAngle(_up, rnd() * Math.PI * 2);
      q.multiply(roll);
      const s2 = 0.75 + rnd() * 0.6;
      sc.set(s2, s2, s2);
      m.compose(pos, q, sc);
      leaves.setMatrixAt(i, m);
      col.setHex(greens[Math.floor(rnd() * greens.length)]);
      if (rnd() < 0.06) col.setHex(0xd9c25a); // the odd yellowing leaf
      leaves.setColorAt(i, col);
    }
  }
  leaves.count = i;
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  g.add(leaves);

  const { position, quaternion } = onPlanet(dx, dz, -0.1);
  g.position.copy(position);
  g.quaternion.copy(quaternion);
  g.scale.setScalar(scale);
  return g;
}

function buildStones() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x9c9a90, roughness: 1, flatShading: true });
  const geo = new THREE.CylinderGeometry(0.36, 0.4, 0.12, 7);
  const pts = [
    [3.9, 4.6], [4.7, 5.5], [5.6, 6.2], [6.6, 6.9], [7.5, 7.9], [8.3, 9.0],
  ];
  pts.forEach(([dx, dz], i) => {
    const m = new THREE.Mesh(geo, mat);
    const { position, quaternion } = onPlanet(dx + (i % 2) * 0.3, dz - (i % 2) * 0.3, 0.02);
    m.position.copy(position);
    m.quaternion.copy(quaternion);
    m.scale.set(0.8 + (i % 3) * 0.15, 1, 0.9 + ((i + 1) % 3) * 0.12);
    m.receiveShadow = true;
    m.castShadow = true;
    g.add(m);
  });
  return g;
}

/** Rose bloom: a tight spiral bud wrapped by layers of opening, outward-curling petals. */
function buildBloom() {
  const g = new THREE.Group();
  const deep = new THREE.MeshStandardMaterial({ color: 0x9e1b2c, roughness: 0.55, side: THREE.DoubleSide });
  const mid = new THREE.MeshStandardMaterial({ color: 0xc8243a, roughness: 0.5, side: THREE.DoubleSide });
  const outer = new THREE.MeshStandardMaterial({ color: 0xdc3a4c, roughness: 0.5, side: THREE.DoubleSide });
  // inner petals are cupped toward the centre (negative cup); outer ones flare out at the tip (positive curl)
  const layers = [
    { n: 3, len: 0.09, width: 0.8, pitch: 1.5, r: 0.004, curl: -0.04, cup: -0.4, mat: deep, y: 0.05 },
    { n: 4, len: 0.11, width: 0.9, pitch: 1.44, r: 0.012, curl: -0.02, cup: -0.38, mat: deep, y: 0.035 },
    { n: 5, len: 0.13, width: 1.0, pitch: 1.34, r: 0.022, curl: 0.03, cup: -0.34, mat: mid, y: 0.022 },
    { n: 5, len: 0.15, width: 1.05, pitch: 1.2, r: 0.032, curl: 0.1, cup: -0.28, mat: mid, y: 0.01 },
    { n: 6, len: 0.16, width: 1.1, pitch: 1.0, r: 0.04, curl: 0.2, cup: -0.2, mat: outer, y: 0.0 },
    { n: 5, len: 0.15, width: 1.1, pitch: 0.7, r: 0.044, curl: 0.26, cup: -0.12, mat: outer, y: -0.008 },
  ];
  layers.forEach((L, li) => {
    const geo = leafGeometry(profiles.petal, { length: 1, width: L.width, curl: L.curl, cup: L.cup, segments: 18 });
    for (let i = 0; i < L.n; i++) {
      const az = (i / L.n) * Math.PI * 2 + li * 0.62;
      const at = new THREE.Vector3(Math.sin(az) * L.r, L.y, Math.cos(az) * L.r);
      const petal = placeLeaf(geo, L.mat, at, az, L.pitch, L.len, (i % 2 ? 1 : -1) * 0.08);
      g.add(petal);
    }
  });
  // a tight centre spiral
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), deep);
  core.scale.set(1, 1.6, 1);
  core.position.y = 0.075;
  g.add(core);
  // receptacle and sepals curling down beneath the bloom
  const green = leafMaterial(0x3d7a2e, { map: null });
  const hip = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), green);
  hip.scale.set(1, 0.8, 1);
  hip.position.y = -0.01;
  g.add(hip);
  const sepalGeo = leafGeometry(profiles.sepal, { length: 1, width: 0.5, curl: 0.25, cup: 0.1, segments: 10 });
  for (let i = 0; i < 5; i++) {
    const az = (i / 5) * Math.PI * 2 + 0.3;
    g.add(placeLeaf(sepalGeo, green, new THREE.Vector3(Math.sin(az) * 0.02, -0.005, Math.cos(az) * 0.02), az, -0.35, 0.11));
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** A compound rose leaf: a short rachis with a terminal leaflet and two opposite pairs. */
function buildRoseLeaf(material) {
  const g = new THREE.Group();
  const leafletGeo = leafGeometry(profiles.roseLeaf, { length: 1, width: 0.62, curl: 0.12, cup: 0.18, segments: 30 });
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x3f7a2f, roughness: 0.9 });
  const rachis = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.2, 5), stemMat);
  rachis.rotation.x = Math.PI / 2;
  rachis.position.z = 0.1;
  g.add(rachis);
  g.add(placeLeaf(leafletGeo, material, new THREE.Vector3(0, 0, 0.2), 0, 0.05, 0.11));
  for (const [zz, s] of [[0.13, 0.095], [0.06, 0.08]]) {
    g.add(placeLeaf(leafletGeo, material, new THREE.Vector3(0, 0, zz), Math.PI / 2 - 0.5, 0.1, s, 0.2));
    g.add(placeLeaf(leafletGeo, material, new THREE.Vector3(0, 0, zz), -Math.PI / 2 + 0.5, 0.1, s, -0.2));
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** A single rose under a glass cloche, as a nod to the Little Prince. */
function buildRose(dx, dz) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.55, 0.12, 24),
    new THREE.MeshStandardMaterial({ color: 0xd9c7a8, roughness: 0.9 }),
  );
  base.position.y = 0.06;
  base.receiveShadow = true;
  g.add(base);
  const soil = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.18, 0.04, 16),
    new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 }),
  );
  soil.position.y = 0.13;
  g.add(soil);

  // stem: a gentle S-curve
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x3f7a2f, roughness: 0.85 });
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.13, 0),
    new THREE.Vector3(0.03, 0.4, 0.01),
    new THREE.Vector3(-0.02, 0.72, -0.01),
    new THREE.Vector3(0.0, 0.98, 0.0),
  ]);
  const stemMesh = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 30, 0.014, 7), stemMat);
  stemMesh.castShadow = true;
  g.add(stemMesh);

  // thorns
  const thornMat = new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 0.8 });
  const thornGeo = new THREE.ConeGeometry(0.008, 0.035, 5);
  const up = new THREE.Vector3(0, 1, 0);
  for (const [t, az] of [[0.22, 0.4], [0.38, 2.6], [0.55, 4.5], [0.7, 1.4], [0.83, 3.6]]) {
    const p = stemCurve.getPoint(t);
    const outDir = new THREE.Vector3(Math.sin(az), 0.55, Math.cos(az)).normalize();
    const th = new THREE.Mesh(thornGeo, thornMat);
    th.position.copy(p).addScaledVector(outDir, 0.018);
    th.quaternion.setFromUnitVectors(up, outDir);
    g.add(th);
  }

  // two compound leaves off the stem
  const leafMat = leafMaterial(0x3f8a34);
  for (const [t, az] of [[0.36, 0.9], [0.6, 4.0]]) {
    const leaf = buildRoseLeaf(leafMat);
    leaf.position.copy(stemCurve.getPoint(t));
    leaf.rotation.order = 'YXZ';
    leaf.rotation.y = az;
    leaf.rotation.x = -0.45; // angle up from the stem
    g.add(leaf);
  }

  const bloom = buildBloom();
  bloom.scale.setScalar(1.45);
  bloom.position.copy(stemCurve.getPoint(1));
  bloom.rotation.z = 0.08;
  g.add(bloom);

  // one fallen petal on the base
  const fallen = placeLeaf(
    leafGeometry(profiles.petal, { length: 1, width: 1, curl: 0.15, cup: -0.2, segments: 12 }),
    new THREE.MeshStandardMaterial({ color: 0xc8243a, roughness: 0.55, side: THREE.DoubleSide }),
    new THREE.Vector3(0.25, 0.125, 0.12), 2.2, -0.02, 0.13,
  );
  g.add(fallen);

  const dome = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.42, 0.7, 6, 20),
    new THREE.MeshPhysicalMaterial({
      color: 0xdff4ff,
      transparent: true,
      opacity: 0.18,
      roughness: 0.05,
      metalness: 0,
      clearcoat: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  dome.position.y = 0.12 + 0.35 + 0.42;
  g.add(dome);

  const { position, quaternion } = onPlanet(dx, dz, 0);
  g.position.copy(position);
  g.quaternion.copy(quaternion);
  return g;
}

export function buildPlanet(wind) {
  const group = new THREE.Group();
  group.add(buildGround());
  group.add(buildGrass(wind));
  group.add(buildFlowers());
  group.add(buildTree(-8.5, 6.5, 1.1, wind));
  group.add(buildTree(9.5, -3.5, 0.85, wind));
  group.add(buildTree(-3.0, 11.5, 0.7, wind));
  group.add(buildStones());
  group.add(buildRose(-6.6, 2.4));
  return group;
}

/**
 * A little iron lamp post on the meadow. Like the lights indoors, it glows warm
 * after dusk and switches off by day. Returns { group, update(state, time) }.
 */
export function buildLampPost(dx, dz) {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x2c2a31, roughness: 0.55, metalness: 0.5 });
  const add = (geo, y, mat = iron) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // base, post and a couple of decorative rings
  add(new THREE.CylinderGeometry(0.2, 0.26, 0.18, 12), 0.09);
  add(new THREE.CylinderGeometry(0.11, 0.16, 0.3, 12), 0.33);
  add(new THREE.CylinderGeometry(0.045, 0.055, 2.2, 10), 1.55);
  add(new THREE.TorusGeometry(0.075, 0.02, 6, 16), 0.9).rotation.x = Math.PI / 2;
  add(new THREE.TorusGeometry(0.07, 0.02, 6, 16), 2.55).rotation.x = Math.PI / 2;

  // lantern: a small iron frame around warm glass, with a pointed cap
  const LY = 2.92; // lantern centre
  add(new THREE.CylinderGeometry(0.14, 0.08, 0.1, 4), LY - 0.27).rotation.y = Math.PI / 4;
  const glass = new THREE.MeshStandardMaterial({
    color: 0xfff1d6,
    emissive: 0xffbe6e,
    emissiveIntensity: 0,
    roughness: 0.3,
    transparent: true,
    opacity: 0.85,
  });
  const pane = add(new THREE.BoxGeometry(0.26, 0.4, 0.26), LY, glass);
  pane.castShadow = false;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.44, 0.03), iron);
    bar.position.set(x * 0.135, LY, z * 0.135);
    bar.castShadow = true;
    g.add(bar);
  }
  const cap = add(new THREE.ConeGeometry(0.25, 0.24, 4), LY + 0.32);
  cap.rotation.y = Math.PI / 4;
  add(new THREE.SphereGeometry(0.045, 10, 8), LY + 0.47);

  // the light it throws on the grass, plus a soft halo around the glass
  const light = new THREE.PointLight(0xffc27a, 0, 9, 1.7);
  light.position.y = LY;
  g.add(light);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color: 0xffd9a0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  halo.scale.setScalar(1.8);
  halo.position.y = LY;
  g.add(halo);

  const { position, quaternion } = onPlanet(dx, dz, -0.02);
  g.position.copy(position);
  g.quaternion.copy(quaternion);

  function update(state, time) {
    const k = state.indoor; // same dusk-to-dawn curve as the lights in the room
    const flicker = 1 + 0.03 * Math.sin(time * 7.3) * Math.sin(time * 3.1);
    light.intensity = 14 * k * flicker;
    glass.emissiveIntensity = 2.4 * k * flicker;
    halo.material.opacity = 0.75 * k;
    light.visible = k > 0.01;
  }
  update({ indoor: 0 }, 0);
  return { group: g, update };
}

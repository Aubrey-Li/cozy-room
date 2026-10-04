import * as THREE from 'three';
import { makeLeafTexture } from './textures.js';

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

let leafMaterial = null;
let leafDepth = null;
function getLeafMaterial(wind) {
  if (!leafMaterial) {
    const opts = { amount: 0.55, flutter: 1 };
    leafMaterial = new THREE.MeshStandardMaterial({
      map: makeLeafTexture(),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.9,
    });
    wind.patch(leafMaterial, opts);
    leafDepth = wind.depthFor(leafMaterial, opts);
  }
  return { material: leafMaterial, depth: leafDepth };
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

/** A single rose under a glass cloche, as a nod to the Little Prince. */
function buildRose(dx, dz) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.55, 0.12, 16),
    new THREE.MeshStandardMaterial({ color: 0xd9c7a8, roughness: 0.9 }),
  );
  base.position.y = 0.06;
  base.receiveShadow = true;
  g.add(base);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.035, 0.9, 6),
    new THREE.MeshStandardMaterial({ color: 0x3f7a2f, roughness: 1 }),
  );
  stem.position.y = 0.57;
  g.add(stem);
  const leaf = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 6, 4),
    new THREE.MeshStandardMaterial({ color: 0x4f9a3a, roughness: 1 }),
  );
  leaf.scale.set(1.2, 0.3, 0.6);
  leaf.position.set(0.12, 0.5, 0);
  leaf.rotation.z = -0.5;
  g.add(leaf);
  const bloom = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xe43d4f, roughness: 0.8 }),
  );
  bloom.scale.set(1, 1.2, 1);
  bloom.position.y = 1.08;
  bloom.castShadow = true;
  g.add(bloom);
  const dome = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.42, 0.7, 6, 16),
    new THREE.MeshPhysicalMaterial({
      color: 0xdff4ff,
      transparent: true,
      opacity: 0.22,
      roughness: 0.05,
      metalness: 0,
      transmission: 0,
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

import * as THREE from 'three';
import { onPlanet } from './planet-math.js';

// ---------------------------------------------------------------------------
// A little stone-edged pond beside the end of the garden path, with koi.
// Everything is built in flat (dx, dz) offsets from the pond's centre and then
// draped over the planet, so the water follows the curve of the little world.
// ---------------------------------------------------------------------------

export const POND = { dx: 12.2, dz: 3.4, r: 3.3 };
const WATER_H = 0.2;   // water surface height above the ground
const BANK_W = 0.5;    // width of the earthen bank around the water

/** Shoreline radius at an angle around the pond: a soft, slightly kidney shape. */
export function shoreRadius(a) {
  return POND.r * (1 + 0.13 * Math.sin(2 * a + 0.8) + 0.07 * Math.sin(3 * a - 0.4));
}

/** True if a flat offset lies within the pond and its bank (plus a margin). */
export function inPond(dx, dz, margin = 0) {
  const x = dx - POND.dx;
  const z = dz - POND.dz;
  return Math.hypot(x, z) < shoreRadius(Math.atan2(z, x)) + BANK_W + margin;
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

/** Move every vertex from pond-local flat space (x, h, z) onto the planet. */
function drape(geo) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    onPlanet(POND.dx + pos.getX(i), POND.dz + pos.getZ(i), pos.getY(i), _p);
    pos.setXYZ(i, _p.x, _p.y, _p.z);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * A polar grid over the pond: `rings` x `seg` vertices, each placed by
 * profile(t, a) -> [radius, height] where t runs 0..1 across the rings.
 */
function polarSurface(rings, seg, profile, withFlat = false) {
  const positions = [];
  const flat = [];
  const edge = [];
  const index = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const [rad, h] = profile(t, a);
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      positions.push(x, h, z);
      flat.push(x, z);
      edge.push(t);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * seg + s;
      const b = r * seg + ((s + 1) % seg);
      const c = (r + 1) * seg + s;
      const d = (r + 1) * seg + ((s + 1) % seg);
      index.push(a, b, c, b, d, c); // counter-clockwise seen from above
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (withFlat) {
    geo.setAttribute('aFlat', new THREE.Float32BufferAttribute(flat, 2));
    geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  }
  geo.setIndex(index);
  return geo;
}

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------

const WATER_VERT = /* glsl */ `
  attribute vec2 aFlat;
  attribute float aEdge;
  varying vec2 vFlat;
  varying float vEdge;
  void main() {
    vFlat = aFlat;
    vEdge = aEdge;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WATER_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uDay;
  uniform float uAmbient;
  uniform float uIce;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;   // toward the sun, world space
  uniform vec3 uMoonDir;  // toward the moon, world space
  uniform float uSunI;
  uniform float uMoonI;
  uniform vec3 uViewDir;  // toward the viewer, world space
  uniform vec3 uN0;       // pond up, world space
  uniform vec3 uT0;       // pond flat +x, world space
  uniform vec3 uB0;       // pond flat +z, world space
  uniform vec4 uRipples[4]; // xy = centre, z = age, w = strength (koi breaking the surface)
  varying vec2 vFlat;
  varying float vEdge;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  // gentle waves as a height field, with its gradient
  vec3 waves(vec2 p, float t) {
    vec3 acc = vec3(0.0);
    vec2 k1 = vec2(3.1, 1.7);  float w1 = dot(p, k1) + t * 1.3;
    vec2 k2 = vec2(-2.3, 2.9); float w2 = dot(p, k2) + t * 1.7;
    vec2 k3 = vec2(5.3, -4.1); float w3 = dot(p, k3) + t * 2.3;
    vec2 k4 = vec2(-7.7, -5.9); float w4 = dot(p, k4) + t * 3.1;
    acc.x = sin(w1) * 0.5 + sin(w2) * 0.35 + sin(w3) * 0.15 + sin(w4) * 0.08;
    acc.yz = k1 * cos(w1) * 0.5 + k2 * cos(w2) * 0.35 + k3 * cos(w3) * 0.15 + k4 * cos(w4) * 0.08;
    for (int i = 0; i < 4; i++) {
      vec4 rp = uRipples[i];
      if (rp.w <= 0.0) continue;
      vec2 d = p - rp.xy;
      float r = length(d) + 1e-4;
      float front = rp.z * 0.55;
      float ring = exp(-pow((r - front) * 9.0, 2.0)) * rp.w * exp(-rp.z * 1.2);
      float ph = (r - front) * 40.0;
      acc.x += sin(ph) * ring * 0.35;
      acc.yz += (d / r) * cos(ph) * ring * 3.5;
    }
    return acc;
  }

  void main() {
    float calm = 1.0 - 0.85 * uIce;
    vec3 wv = waves(vFlat, uTime) * calm;
    vec2 grad = wv.yz * 0.035;
    vec3 n = normalize(uN0 - uT0 * grad.x - uB0 * grad.y);
    vec3 v = normalize(uViewDir);

    // body colour: deep green-teal, shallower toward the banks
    vec3 deep = vec3(0.03, 0.17, 0.2);
    vec3 shallow = vec3(0.1, 0.3, 0.27);
    vec3 col = mix(deep, shallow, smoothstep(0.55, 1.0, vEdge)) * uAmbient;
    // dappled light rippling over the bed by day
    float caustic = pow(0.5 + 0.5 * sin(vFlat.x * 9.0 + wv.x * 2.0 + uTime * 0.8) * sin(vFlat.y * 8.0 - wv.x * 1.5 - uTime * 0.6), 6.0);
    col += vec3(0.05, 0.12, 0.1) * caustic * uDay;

    // sky reflection, stronger at grazing angles and on wave slopes
    float fres = 0.12 + 0.4 * pow(1.0 - max(dot(n, v), 0.0), 4.0);
    vec3 skyCol = mix(uSkyHorizon, uSkyTop, 0.65 + 0.2 * wv.x);
    col = mix(col, skyCol, fres);

    // sunlight: glitter that winks on and off over the wave crests, brightest
    // where the ripples tilt toward the sun (a broad mirror sheen would wash
    // the pond out, as the scene's key light sits close to the mirror angle)
    vec3 hs = normalize(uSunDir + v);
    float sheen = pow(max(dot(n, hs), 0.0), 30.0);
    vec2 g = vFlat * 24.0;
    vec2 cell = floor(g);
    float h1 = hash(cell);
    vec2 off = vec2(hash(cell + 3.7), hash(cell + 9.1)) * 0.6 + 0.2;
    vec2 fd = abs(fract(g) - off);
    // a little four-pointed twinkle rather than a round dot
    float spark = max(smoothstep(0.09, 0.0, fd.x) * smoothstep(0.32, 0.0, fd.y), smoothstep(0.09, 0.0, fd.y) * smoothstep(0.32, 0.0, fd.x));
    spark = max(spark, smoothstep(0.12, 0.0, length(fd)));
    float wink = pow(max(0.0, sin(uTime * (1.5 + h1 * 4.0) + h1 * 40.0)), 8.0);
    float crest = smoothstep(-0.1, 0.6, wv.x);
    float glitter = step(0.45, h1) * wink * crest * spark;
    col += uSunColor * glitter * (1.6 + 3.0 * sheen) * uDay * uSunI * calm;

    // night: the moon's light, broken up by the ripples
    vec3 hm = normalize(uMoonDir + v);
    float moonGlint = pow(max(dot(n, hm), 0.0), 500.0);
    col += vec3(0.75, 0.82, 1.0) * (moonGlint * 0.9 + glitter * 0.8) * uMoonI * 2.0;

    // winter: a skin of frosted ice that still lets the koi show through
    vec3 ice = vec3(0.78, 0.88, 0.95) * (0.35 + 0.65 * uAmbient);
    col = mix(col, ice, uIce * (0.45 + 0.25 * vEdge));

    float alpha = mix(0.56, 0.9, smoothstep(0.5, 1.0, vEdge));
    alpha = mix(alpha, 0.86, uIce);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function buildWater() {
  const geo = polarSurface(14, 72, (t, a) => [shoreRadius(a) * t + 0.02 * t, WATER_H], true);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    onPlanet(POND.dx + pos.getX(i), POND.dz + pos.getZ(i), pos.getY(i), _p);
    pos.setXYZ(i, _p.x, _p.y, _p.z);
  }
  geo.computeBoundingSphere();

  const center = onPlanet(POND.dx, POND.dz, 0);
  const uniforms = {
    uTime: { value: 0 },
    uDay: { value: 1 },
    uAmbient: { value: 1 },
    uIce: { value: 0 },
    uSkyTop: { value: new THREE.Color() },
    uSkyHorizon: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunI: { value: 0 },
    uMoonI: { value: 0 },
    uViewDir: { value: new THREE.Vector3(0, 1, 1) },
    uN0: { value: center.normal.clone() },
    uT0: { value: new THREE.Vector3(1, 0, 0).applyQuaternion(center.quaternion) },
    uB0: { value: new THREE.Vector3(0, 0, 1).applyQuaternion(center.quaternion) },
    uRipples: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return { mesh, uniforms };
}

// ---------------------------------------------------------------------------
// Bank, bed, stones and plants
// ---------------------------------------------------------------------------

function buildBank() {
  const g = new THREE.Group();
  // the pond bed: dark silt under the water
  const bed = drape(polarSurface(8, 64, (t, a) => [shoreRadius(a) * t + 0.05 * t, 0.015 + 0.03 * t]));
  const bedMat = new THREE.MeshStandardMaterial({ color: 0x3a4632, roughness: 1 });
  const bedMesh = new THREE.Mesh(bed, bedMat);
  bedMesh.receiveShadow = true;
  g.add(bedMesh);

  // an earthen rim: rises from the bed to a crest just outside the water, then
  // slopes back down to the meadow
  const bank = drape(polarSurface(8, 72, (t, a) => {
    const r0 = shoreRadius(a);
    const profile = [
      [0.0, 0.02], [0.04, 0.16], [0.1, 0.27], [0.2, 0.3], [0.3, 0.24], [0.4, 0.1], [BANK_W, -0.04],
    ];
    const x = t * (profile.length - 1);
    const i = Math.min(profile.length - 2, Math.floor(x));
    const f = x - i;
    const [ra, ha] = profile[i];
    const [rb, hb] = profile[i + 1];
    return [r0 + ra + (rb - ra) * f, ha + (hb - ha) * f];
  }));
  const bankMat = new THREE.MeshStandardMaterial({ color: 0x6e7a45, roughness: 1, flatShading: false });
  const bankMesh = new THREE.Mesh(bank, bankMat);
  bankMesh.receiveShadow = true;
  bankMesh.castShadow = true;
  g.add(bankMesh);

  // rounded stones set along the crest
  const stoneGeo = new THREE.DodecahedronGeometry(1, 1);
  const stoneMat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
  const n = 58;
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, n);
  const m = new THREE.Matrix4();
  const s = new THREE.Vector3();
  const yaw = new THREE.Quaternion();
  const col = new THREE.Color();
  const greys = [0x9c9a90, 0x8a8a84, 0xaaa79b, 0x7f8079, 0xb3ae9f];
  let seed = 91;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.08;
    const rad = shoreRadius(a) + 0.13 + rnd() * 0.06;
    onPlanet(POND.dx + Math.cos(a) * rad, POND.dz + Math.sin(a) * rad, 0.22, _p, _q);
    yaw.setFromAxisAngle(_up, rnd() * Math.PI * 2);
    _q.multiply(yaw);
    const big = 0.13 + rnd() * 0.09;
    s.set(big * (1.1 + rnd() * 0.5), big * (0.6 + rnd() * 0.3), big * (0.9 + rnd() * 0.3));
    m.compose(_p, _q, s);
    stones.setMatrixAt(i, m);
    stones.setColorAt(i, col.setHex(greys[i % greys.length]));
  }
  stones.castShadow = true;
  stones.receiveShadow = true;
  g.add(stones);

  // reeds and a couple of cattails on the far side
  const reedMat = new THREE.MeshStandardMaterial({ color: 0x6f9a45, roughness: 0.9 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x6b4428, roughness: 1 });
  const reeds = [];
  for (let i = 0; i < 24; i++) {
    const a = -2.35 + (i / 23) * 1.4 + (rnd() - 0.5) * 0.1;
    const rad = shoreRadius(a) - 0.05 + rnd() * 0.18;
    const h = 0.55 + rnd() * 0.5;
    const reed = new THREE.Mesh(new THREE.ConeGeometry(0.018, h, 4), reedMat);
    reed.geometry.translate(0, h / 2, 0);
    const lean = new THREE.Group();
    lean.add(reed);
    lean.rotation.set((rnd() - 0.5) * 0.3, rnd() * 3, (rnd() - 0.5) * 0.3);
    if (i % 4 === 1) {
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.12, 3, 6), tailMat);
      tail.position.y = h * 0.82;
      lean.add(tail);
    }
    const holder = new THREE.Group();
    onPlanet(POND.dx + Math.cos(a) * rad, POND.dz + Math.sin(a) * rad, 0.12, holder.position, holder.quaternion);
    holder.add(lean);
    reed.castShadow = true;
    g.add(holder);
    reeds.push(lean);
  }
  return { group: g, stones, stoneMat, bankMat, reeds };
}

/** Lily pads floating on the surface, one with a pink flower. */
function buildLilies() {
  const g = new THREE.Group();
  const padMat = new THREE.MeshStandardMaterial({ color: 0x4f8f3a, roughness: 0.6, side: THREE.DoubleSide });
  const pads = [];
  const k = POND.r / 1.65; // the layout was drawn for a pond of radius 1.65
  for (const [x0, z0, r, rot] of [
    [0.6, -0.55, 0.22, 0.5], [0.85, -0.15, 0.16, 2.1], [-0.75, 0.6, 0.2, 4.0], [0.2, -0.95, 0.13, 1.2],
    [-0.3, 0.95, 0.18, 2.8], [-0.95, 0.2, 0.14, 5.1], [0.95, 0.35, 0.19, 3.3],
  ]) {
    const x = x0 * k;
    const z = z0 * k;
    // a disc with a notch, like a real lily pad
    const geo = new THREE.CircleGeometry(r, 20, 0.3, Math.PI * 2 - 0.6);
    geo.rotateX(-Math.PI / 2);
    const pad = new THREE.Mesh(geo, padMat);
    pad.rotation.y = rot;
    pad.receiveShadow = true;
    const holder = new THREE.Group();
    onPlanet(POND.dx + x, POND.dz + z, WATER_H + 0.006, holder.position, holder.quaternion);
    holder.add(pad);
    g.add(holder);
    pads.push({ holder, pad, x, z, phase: x * 3 + z * 5 });
  }
  // a little water lily on the biggest pad
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xf6b8cc, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x3a1020, emissiveIntensity: 0.2 });
  const flower = new THREE.Group();
  for (let ring = 0; ring < 2; ring++) {
    for (let i = 0; i < 7; i++) {
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), petalMat);
      petal.scale.set(0.45, 0.25, 1);
      const a = (i / 7) * Math.PI * 2 + ring * 0.45;
      const tilt = ring ? 0.9 : 0.45;
      petal.position.set(Math.sin(a) * 0.035, 0.02 + ring * 0.01, Math.cos(a) * 0.035);
      petal.rotation.set(-tilt, a, 0, 'YXZ');
      flower.add(petal);
    }
  }
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf2c94c, emissive: 0x5a4000, emissiveIntensity: 0.3 }));
  heart.position.y = 0.03;
  flower.add(heart);
  flower.position.set(0.04, 0.0, 0.03);
  pads[0].pad.add(flower);
  return { group: g, pads, flower };
}

// ---------------------------------------------------------------------------
// Koi
// ---------------------------------------------------------------------------

const KOI_PATTERNS = [
  { base: '#f7f2ea', spots: ['#e2502a', '#d9431f'], n: 4 },                 // kohaku: white with red
  { base: '#f39a2b', spots: ['#ffc15e'], n: 2 },                            // orange ogon
  { base: '#f7f2ea', spots: ['#1d1d22', '#e2502a'], n: 5 },                 // showa-ish
  { base: '#fbf7ef', spots: ['#e2502a'], n: 1, crown: true },               // tancho: one red crown
  { base: '#f2d16b', spots: ['#f7f2ea'], n: 3 },                            // yellow with pale patches
  { base: '#f7f2ea', spots: ['#e2502a'], n: 6 },                            // a busier kohaku
  { base: '#e2502a', spots: ['#f7f2ea'], n: 2 },                            // mostly red
];

function koiTexture(pattern, seed) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = pattern.base;
  ctx.fillRect(0, 0, 128, 64);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  if (pattern.crown) {
    // the sphere is turned so v runs head (0) to tail (1) and u runs round the body
    ctx.fillStyle = pattern.spots[0];
    ctx.beginPath();
    ctx.ellipse(96, 10, 16, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < pattern.n * 3; i++) {
    ctx.fillStyle = pattern.spots[i % pattern.spots.length];
    ctx.beginPath();
    // patches sit on the back (u around 0.75) and wrap a little down the sides
    ctx.ellipse(96 + (rnd() - 0.5) * 36, 10 + rnd() * 40, 6 + rnd() * 10, 4 + rnd() * 7, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildKoi(pattern, seed) {
  const g = new THREE.Group();
  const tex = koiTexture(pattern, seed);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 });
  // a sphere stretched along z, with its poles turned to the nose and tail
  const bodyGeo = new THREE.SphereGeometry(1, 18, 12);
  bodyGeo.rotateX(Math.PI / 2);
  const front = new THREE.Mesh(bodyGeo, mat);
  front.scale.set(0.06, 0.036, 0.13);
  front.position.z = 0.04;
  g.add(front);
  // the back half bends side to side as it swims
  const rear = new THREE.Group();
  rear.position.z = -0.02;
  g.add(rear);
  const back = new THREE.Mesh(bodyGeo, mat);
  back.scale.set(0.048, 0.03, 0.12);
  back.position.z = -0.07;
  rear.add(back);
  const finMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(pattern.spots[0] === '#1d1d22' ? pattern.base : pattern.spots[0]).lerp(new THREE.Color(pattern.base), 0.5),
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    roughness: 0.5,
  });
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0);
  tailShape.quadraticCurveTo(0.045, -0.04, 0.06, -0.1);
  tailShape.quadraticCurveTo(0.0, -0.07, -0.06, -0.1);
  tailShape.quadraticCurveTo(-0.045, -0.04, 0, 0);
  const tailGeo = new THREE.ShapeGeometry(tailShape, 6);
  tailGeo.rotateX(Math.PI / 2); // lie flat in the xz plane, trailing toward -z, so it fans out seen from above
  const tail = new THREE.Group();
  tail.position.z = -0.17;
  tail.add(new THREE.Mesh(tailGeo, finMat));
  rear.add(tail);
  // pectoral fins
  const finGeo = new THREE.CircleGeometry(0.04, 8, 0, Math.PI);
  finGeo.rotateX(-Math.PI / 2);
  const fins = [];
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(finGeo, finMat);
    fin.position.set(side * 0.05, -0.015, 0.06);
    fin.rotation.y = side * 2.2;
    g.add(fin);
    fins.push(fin);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return { group: g, rear, tail, fins };
}

// ---------------------------------------------------------------------------

export function buildPond() {
  const group = new THREE.Group();
  const water = buildWater();
  const bank = buildBank();
  const lilies = buildLilies();
  group.add(bank.group, water.mesh, lilies.group);

  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const koi = KOI_PATTERNS.map((pattern, i) => {
    const fish = buildKoi(pattern, 11 + i * 17);
    const scale = 0.9 + rnd() * 0.45;
    fish.group.scale.setScalar(scale * 1.4);
    group.add(fish.group);
    const a = rnd() * Math.PI * 2;
    return {
      ...fish,
      x: Math.cos(a) * 0.6, z: Math.sin(a) * 0.6,
      heading: rnd() * Math.PI * 2,
      speed: 0.2,
      target: new THREE.Vector2(),
      cruise: 0.18 + rnd() * 0.12,
      depth: 0.08 + rnd() * 0.03, // keeps the back just under the surface
      phase: rnd() * 10,
      rest: 0,
      nextTarget: 0,
    };
  });
  const pickTarget = (f) => {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 0.62 * shoreRadius(a);
    f.target.set(Math.cos(a) * r, Math.sin(a) * r);
  };
  koi.forEach(pickTarget);

  const ripples = water.uniforms.uRipples.value;
  let rippleIdx = 0;
  const yaw = new THREE.Quaternion();
  const tmpColor = new THREE.Color();

  /**
   * light: { sunDir, moonDir, viewDir } in world space; season: { winter, spring }
   */
  function update(state, dt, time, light, season) {
    const u = water.uniforms;
    u.uTime.value = time;
    const day = THREE.MathUtils.smoothstep(state.elev, -0.05, 0.25);
    u.uDay.value = day;
    u.uAmbient.value = 0.22 + 0.78 * day;
    u.uSkyTop.value.copy(state.sky.top);
    u.uSkyHorizon.value.copy(state.sky.horizon);
    u.uSunColor.value.copy(state.sunColor);
    u.uSunDir.value.copy(light.sunDir);
    u.uMoonDir.value.copy(light.moonDir);
    u.uSunI.value = Math.min(1, state.sunIntensity / 1.6);
    u.uMoonI.value = state.moonIntensity * state.night;
    u.uViewDir.value.copy(light.viewDir);
    const ice = THREE.MathUtils.smoothstep(season.winter, 0.35, 0.9);
    u.uIce.value = ice;
    // frost settles on the bank in winter
    bank.bankMat.color.setHex(0x6e7a45).lerp(tmpColor.setHex(0xe8eef3), season.snowiness * 0.85);
    bank.stoneMat.color.setHex(0xffffff).lerp(tmpColor.setHex(0xf2f6fa), season.snowiness * 0.3);
    // lily pads die back under the ice and return in spring
    const lilyScale = Math.max(0.001, 1 - ice);
    for (const p of lilies.pads) {
      p.holder.scale.setScalar(lilyScale);
      p.pad.rotation.y += Math.sin(time * 0.4 + p.phase) * 0.0006;
    }
    lilies.flower.visible = season.winter < 0.2 && season.fall < 0.6;

    // ripples age; koi occasionally nose the surface and start a new ring
    for (const r of ripples) {
      if (r.w > 0) {
        r.z += dt;
        if (r.z > 3.5) r.w = 0;
      }
    }

    const slow = 1 - 0.6 * ice;
    for (const f of koi) {
      // wander: cruise toward a target, linger now and then, pick a new one when close
      const dx = f.target.x - f.x;
      const dz = f.target.y - f.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.15 || time > f.nextTarget) {
        pickTarget(f);
        f.nextTarget = time + 6 + rnd() * 8;
        if (rnd() < 0.25) f.rest = 1.5 + rnd() * 2.5;
        if (rnd() < 0.35 && ice < 0.3) {
          const r = ripples[rippleIdx++ % ripples.length];
          r.set(f.x, f.z, 0, 0.6 + rnd() * 0.4);
        }
      }
      f.rest = Math.max(0, f.rest - dt);
      const want = Math.atan2(dz, dx);
      let turn = want - f.heading;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      const maxTurn = 1.4 * dt;
      f.heading += THREE.MathUtils.clamp(turn, -maxTurn, maxTurn);
      const targetSpeed = (f.rest > 0 ? 0.03 : f.cruise) * slow;
      f.speed += (targetSpeed - f.speed) * (1 - Math.exp(-dt * 1.5));
      f.x += Math.cos(f.heading) * f.speed * dt;
      f.z += Math.sin(f.heading) * f.speed * dt;
      // keep inside the shore
      const a = Math.atan2(f.z, f.x);
      const lim = shoreRadius(a) * 0.72;
      const rr = Math.hypot(f.x, f.z);
      if (rr > lim) {
        f.x *= lim / rr;
        f.z *= lim / rr;
      }
      onPlanet(POND.dx + f.x, POND.dz + f.z, f.depth + (ice > 0.5 ? -0.02 : 0), f.group.position, f.group.quaternion);
      // local +z is the nose; flat +x maps to local +x, so heading 0 points along +x
      yaw.setFromAxisAngle(_up, Math.PI / 2 - f.heading);
      f.group.quaternion.multiply(yaw);
      // a steady, unhurried beat whatever the speed; the body only leans a little into turns
      const swim = time * 2.2 + f.phase;
      const amp = 0.14;
      f.rear.rotation.y = Math.sin(swim) * amp + THREE.MathUtils.clamp(turn, -0.5, 0.5) * 0.25;
      f.tail.rotation.y = Math.sin(swim - 1.1) * amp * 1.2;
      f.fins[0].rotation.z = 0.3 + Math.sin(swim * 0.5) * 0.25;
      f.fins[1].rotation.z = -0.3 - Math.sin(swim * 0.5) * 0.25;
    }
  }

  return { group, update };
}


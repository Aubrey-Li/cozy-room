import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { onPlanet } from './planet-math.js';
import { makeGlowTexture } from './textures.js';

// ---------------------------------------------------------------------------
// Holiday things by the front door, where the stepping-stone path begins.
// Orange and white pumpkins sit either side of the first stones through the
// fall; a little fir hung with lights stands there from mid-December until
// New Year's Day.
// ---------------------------------------------------------------------------

const smooth = THREE.MathUtils.smoothstep;

/** The tree is up from this day in December through New Year's Day. */
export const TREE_FROM_DEC = 11;
export const TREE_UNTIL_JAN = 1;

export function christmasTreeUp(date) {
  const m = date.getMonth(), d = date.getDate();
  return (m === 11 && d >= TREE_FROM_DEC) || (m === 0 && d <= TREE_UNTIL_JAN);
}

// ---------------------------------------------------------------------------
// Pumpkins

/** A unit pumpkin: a squashed sphere with grooves between the lobes and dimpled ends. */
function pumpkinGeometry(ribs, squash) {
  let geo = new THREE.SphereGeometry(1, 56, 32);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo); // weld the seam so the shading has no crease down one side
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    const groove = Math.pow(Math.abs(Math.cos((a * ribs) / 2)), 8);
    const k = 1 - 0.1 * groove * r;
    x *= k;
    z *= k;
    y *= squash;
    // pull the poles in: a hollow for the stem on top, a flat-ish seat underneath
    const pole = Math.exp(-(r * r) / 0.05);
    y -= Math.sign(y) * 0.24 * squash * pole;
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildPumpkin({ radius, color, stemColor, ribs = 10, squash = 0.68, lean = 0, turn = 0 }) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    pumpkinGeometry(ribs, squash),
    new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0 }),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // a short, ridged stem with a crook at the top
  const top = squash * 0.78;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, top - 0.06, 0),
    new THREE.Vector3(0.01, top + 0.12, 0),
    new THREE.Vector3(0.06, top + 0.24, 0.01),
    new THREE.Vector3(0.14, top + 0.27, 0.02),
  ]);
  const stem = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 10, 0.07, 6),
    new THREE.MeshStandardMaterial({ color: stemColor, roughness: 0.9, flatShading: true }),
  );
  stem.castShadow = true;
  g.add(stem);
  const inner = new THREE.Group();
  inner.add(g);
  g.scale.setScalar(radius);
  g.position.y = squash * 0.92 * radius; // settle into the grass a touch
  g.rotation.set(lean, turn, lean * 0.5);
  return { group: inner, radius };
}

const ORANGES = [0xe0731f, 0xd6651a, 0xeb8a2c, 0xc95a17];
const WHITES = [0xf1ebdc, 0xe9e2cf];
const STEMS = { orange: 0x5d6b2f, white: 0x7d8a4a };

/** Either side of the first stepping stones, which start at the house's front corner. */
const PUMPKIN_SPOTS = [
  // left of the path
  { dx: 3.05, dz: 5.35, radius: 0.36, kind: 'orange', ribs: 10 },
  { dx: 3.6, dz: 5.85, radius: 0.22, kind: 'white', ribs: 8 },
  { dx: 2.55, dz: 5.75, radius: 0.18, kind: 'orange', ribs: 8 },
  // right of the path
  { dx: 5.05, dz: 3.85, radius: 0.3, kind: 'white', ribs: 10 },
  { dx: 5.6, dz: 4.4, radius: 0.4, kind: 'orange', ribs: 12 },
  { dx: 5.75, dz: 3.6, radius: 0.17, kind: 'orange', ribs: 8 },
  { dx: 4.6, dz: 3.45, radius: 0.14, kind: 'white', ribs: 8 },
];

function buildPumpkins() {
  const group = new THREE.Group();
  const items = PUMPKIN_SPOTS.map((s, i) => {
    const color = s.kind === 'white' ? WHITES[i % WHITES.length] : ORANGES[i % ORANGES.length];
    const pk = buildPumpkin({
      radius: s.radius,
      color,
      stemColor: STEMS[s.kind],
      ribs: s.ribs,
      squash: s.kind === 'white' ? 0.62 : 0.7,
      lean: ((i * 37) % 7 - 3) * 0.03,
      turn: i * 1.7,
    });
    onPlanet(s.dx, s.dz, -0.02, pk.group.position, pk.group.quaternion);
    group.add(pk.group);
    // each one arrives (and goes) on its own day
    return { ...pk, r: ((i * 53) % 11) / 11 };
  });
  return { group, items };
}

/**
 * How much the pumpkins are out, from the season position (0 spring .. 3 winter).
 * They arrive as the leaves turn and are cleared away as the first snow settles.
 */
function pumpkinSeason(pos, r) {
  const p = ((pos % 4) + 4) % 4;
  return smooth(p, 1.55 + r * 0.15, 1.75 + r * 0.15) * (1 - smooth(p, 2.25 + r * 0.08, 2.4 + r * 0.08));
}

// ---------------------------------------------------------------------------
// Christmas tree

/** One ring of boughs: an open cone with a scalloped, drooping hem. */
function tierGeometry(radius, height, seed) {
  const seg = 72;
  let geo = new THREE.ConeGeometry(radius, height, seg, 4, true);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const down = 0.5 - y / height; // 0 at the tip, 1 at the hem
    // boughs: lobes around the hem that dip at their tips
    const lobe = 0.5 + 0.5 * Math.cos(a * 9 + seed);
    const jitter = Math.sin(a * 4 - seed) * 0.6 + Math.sin(a * 2 + seed * 1.7) * 0.4;
    const k = 1 + down * (0.1 * lobe + 0.05 * jitter);
    p.setXYZ(i, x * k, y - down * down * 0.1 * height * lobe, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildChristmasTree() {
  const root = new THREE.Group();
  const g = new THREE.Group(); // scaled to grow in
  root.add(g);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.13, 0.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 1 }),
  );
  trunk.position.y = 0.3;
  trunk.castShadow = true;
  g.add(trunk);

  // boughs, with vertex colours so snow can settle on the upper faces
  const needleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const deep = new THREE.Color(0x2c5a34);
  const pale = new THREE.Color(0x3f7a44);
  const snowC = new THREE.Color(0xf2f6fa);
  const tiers = [
    { r: 0.95, h: 0.95, y: 0.95 },
    { r: 0.78, h: 0.85, y: 1.45 },
    { r: 0.6, h: 0.75, y: 1.9 },
    { r: 0.42, h: 0.62, y: 2.3 },
    { r: 0.24, h: 0.48, y: 2.62 },
  ];
  const tierMeshes = tiers.map((t, i) => {
    const geo = tierGeometry(t.r, t.h, i * 1.9);
    const n = geo.attributes.position.count;
    const base = new Float32Array(n * 3);
    const snow = new Float32Array(n); // how readily snow lies on each vertex
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const c = new THREE.Color();
    for (let k = 0; k < n; k++) {
      // lighter along each bough's crest, deeper in the folds between them (matches tierGeometry's lobes)
      const a = Math.atan2(pos.getZ(k), pos.getX(k));
      const shade = 0.5 + 0.5 * Math.cos(a * 9 + i * 1.9);
      c.copy(deep).lerp(pale, shade * 0.8);
      c.toArray(base, k * 3);
      const down = 0.5 - pos.getY(k) / t.h;
      // snow lies in patches on the upper boughs, never smothering the green
      const patch = 0.5 + 0.5 * Math.sin(a * 3 + i * 2.3) * Math.cos(a * 2 - i);
      snow[k] = smooth(patch, 0.4, 0.7) * shade * smooth(nrm.getY(k), 0.4, 0.8) * (1 - smooth(down, 0.75, 1));
    }
    geo.setAttribute('color', new THREE.BufferAttribute(base.slice(), 3));
    const m = new THREE.Mesh(geo, needleMat);
    m.position.y = t.y;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return { mesh: m, base, snow };
  });
  // a dark core so you never see daylight through the gaps between tiers
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 10), new THREE.MeshStandardMaterial({ color: 0x1f3f26, roughness: 1 }));
  core.position.y = 1.65;
  g.add(core);

  // a gold star on top
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.075 : 0.18;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starMat = new THREE.MeshStandardMaterial({ color: 0xffd36b, emissive: 0xffb83a, emissiveIntensity: 0.4, roughness: 0.35, metalness: 0.6 });
  const starMesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(star, { depth: 0.05, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 }),
    starMat,
  );
  starMesh.geometry.center();
  starMesh.position.y = 3.02;
  g.add(starMesh);

  /** The tree's outer radius at height y: the widest bough there (each is a cone with its tip up). */
  const outline = (y) => tiers.reduce((best, t) => {
    const down = (t.y + t.h / 2 - y) / t.h;
    return down >= 0 && down <= 1 ? Math.max(best, t.r * down * 1.05) : best;
  }, 0);

  // little lights wound round the boughs in a loose spiral
  const COLORS = [0xffd890, 0xff5a4a, 0x6ac8ff, 0xffd890, 0xffb347, 0x8be07a, 0xffd890, 0xff8fc8].map((h) => new THREE.Color(h));
  const bulbs = [];
  const turns = 5.5;
  const count = 64;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;          // 0 at the bottom, 1 at the top
    const y = 0.55 + t * 2.2;
    // the outside of the cone at this height, a hair proud of the needles
    const a = t * turns * Math.PI * 2 + Math.sin(i * 1.3) * 0.18;
    // tucked just inside the outline of whichever bough is outermost at this height
    const r = Math.max(0.1, outline(y) * 0.97);
    bulbs.push({
      pos: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r),
      color: COLORS[i % COLORS.length],
      phase: i * 2.399,
      speed: 0.8 + ((i * 7) % 5) * 0.25,
    });
  }
  const bulbMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.035, 8, 6),
    new THREE.MeshBasicMaterial({ toneMapped: false }),
    count,
  );
  const mtx = new THREE.Matrix4();
  bulbs.forEach((b, i) => {
    bulbMesh.setMatrixAt(i, mtx.makeTranslation(b.pos.x, b.pos.y, b.pos.z));
    bulbMesh.setColorAt(i, b.color);
  });
  g.add(bulbMesh);

  // a soft glow round each bulb after dark
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(bulbs.flatMap((b) => [b.pos.x, b.pos.y, b.pos.z]), 3));
  glowGeo.setAttribute('color', new THREE.Float32BufferAttribute(bulbs.flatMap((b) => [b.color.r, b.color.g, b.color.b]), 3));
  const glowMat = new THREE.PointsMaterial({
    map: makeGlowTexture(),
    size: 0.5,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Points(glowGeo, glowMat);
  g.add(glow);

  // and a warm wash on the snow around it
  const light = new THREE.PointLight(0xffc58a, 0, 5, 1.8);
  light.position.set(0, 1.3, 1.0); // in front of the tree, so it lights the snow rather than the boughs from inside
  g.add(light);

  const tmpC = new THREE.Color();
  let lastSnow = -1;
  function setSnow(s) {
    if (Math.abs(s - lastSnow) < 0.01) return;
    lastSnow = s;
    for (const t of tierMeshes) {
      const col = t.mesh.geometry.attributes.color;
      for (let k = 0; k < t.snow.length; k++) {
        tmpC.fromArray(t.base, k * 3).lerp(snowC, s * t.snow[k] * 0.85);
        col.setXYZ(k, tmpC.r, tmpC.g, tmpC.b);
      }
      col.needsUpdate = true;
    }
  }

  function update(time, night, pxPerUnit) {
    // twinkling: each bulb breathes on its own rhythm, a few blink right off now and then
    const glowCol = glowGeo.attributes.color;
    bulbs.forEach((b, i) => {
      const w = 0.5 + 0.5 * Math.sin(time * b.speed + b.phase);
      const blink = Math.sin(time * 0.37 + b.phase * 3) > 0.93 ? 0.2 : 1;
      const k = (0.55 + 0.45 * w) * blink * (1 + 0.6 * night);
      bulbMesh.setColorAt(i, tmpC.copy(b.color).multiplyScalar(k));
      glowCol.setXYZ(i, b.color.r * k * 0.6, b.color.g * k * 0.6, b.color.b * k * 0.6);
    });
    bulbMesh.instanceColor.needsUpdate = true;
    glowCol.needsUpdate = true;
    glowMat.opacity = 0.1 + 0.45 * night;
    glowMat.size = 0.32 * pxPerUnit; // the orthographic camera draws points in pixels, so keep them the same size in the world
    starMat.emissiveIntensity = 0.4 + 0.9 * night;
    light.intensity = 2.2 * night;
    light.visible = night > 0.02;
  }

  return { group: root, grow: g, update, setSnow };
}

// ---------------------------------------------------------------------------

/** Where the tree stands: beside the path, off the line between the camera and the room. */
const TREE_SPOT = { dx: 6.4, dz: 2.6 };

export function buildDecor() {
  const group = new THREE.Group();
  const pumpkins = buildPumpkins();
  group.add(pumpkins.group);
  const tree = buildChristmasTree();
  onPlanet(TREE_SPOT.dx, TREE_SPOT.dz, -0.05, tree.group.position, tree.group.quaternion);
  tree.group.scale.setScalar(1.4);
  group.add(tree.group);
  let treeAmount = 0;

  /**
   * season: the look from seasons.js; date: the day the scene shows; night: 0..1;
   * pxPerUnit: drawing-buffer pixels per world unit at the current zoom (for glow sizes).
   */
  function update(dt, time, { season, date, night, pxPerUnit = 40 }) {
    let any = false;
    for (const p of pumpkins.items) {
      const k = pumpkinSeason(season.position, p.r);
      // a little overshoot as each one is set down
      const s = k <= 0 ? 0 : k * (1 + 0.12 * Math.sin(k * Math.PI));
      p.group.visible = s > 0.001;
      p.group.scale.setScalar(Math.max(1e-4, s));
      any ||= p.group.visible;
    }
    pumpkins.group.visible = any;

    const up = christmasTreeUp(date);
    treeAmount += ((up ? 1 : 0) - treeAmount) * (1 - Math.exp(-dt * 3));
    if (!up && treeAmount < 0.002) treeAmount = 0;
    tree.group.visible = treeAmount > 0;
    if (tree.group.visible) {
      const e = treeAmount;
      tree.grow.scale.set(e, e * (0.85 + 0.15 * e), e);
      tree.setSnow(season.snowiness);
      tree.update(time, night, pxPerUnit);
    }
  }

  return { group, update };
}

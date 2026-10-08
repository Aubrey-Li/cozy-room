import * as THREE from 'three';
import { onPlanet, PLANET_CENTER, PLANET_R, snowField, SNOW_FIELD_GLSL } from './planet-math.js';
import { inPond, shoreRadius, POND } from './pond.js';
import { BARK_SNOW, ROSE } from './planet.js';
import { makeLeafTexture } from './textures.js';

// ---------------------------------------------------------------------------
// Seasons on the planet. A season position (0 spring, 1 summer, 2 fall,
// 3 winter, wrapping) blends between looks. Inside each transition every leaf,
// blade and flower has its own moment to turn, so a tree speckles with colour
// and snow creeps over the meadow instead of everything fading in lockstep.
// ---------------------------------------------------------------------------

const C = (hex) => new THREE.Color(hex);
const smooth = THREE.MathUtils.smoothstep;
const STAGGER = 0.55; // how much of each transition the stagger is spread across

/** Per-element progress through a transition: element r turns a little earlier or later. */
const stagger = (t, r) => smooth(t, r * STAGGER, r * STAGGER + (1 - STAGGER));

// Snow cover rises toward this at midwinter: past the top of the snow field, so the
// whole planet is buried; bare patches only show while it is settling or melting
const COVER_MAX = 1.1;
const SNOW_DEPTH = 0.26; // how deep it lies once it has properly settled
const SNOW_RIM = 0.07;   // how much field it takes to go from bare grass to full depth

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

// brighter than they look on paper: the leaf cards are mid-grey and the crowns shade themselves
const SAKURA = [0xffc6dc, 0xffadcb, 0xffdcea, 0xff9fc2, 0xffeef5, 0xffbcd6].map(C);
const SPRING_GREEN = C(0x9fd36a);
// each tree turns its own way: a maple, a birch, a beech...
const FALL_TREES = [
  [0xc8402b, 0xe0682a, 0xa82e26, 0xe89a34, 0xd2552b, 0x8f2a24],
  [0xe8b73a, 0xf0c94a, 0xd9a531, 0xe39b2e, 0xc9b04a, 0xf2d35c],
  [0xe07b28, 0xd9662a, 0xeba13a, 0xc9502b, 0xe8b04a, 0xb8642a],
].map((p) => p.map(C));
const SNOW = C(0xf4f7fb);
const WITHERED = C(0x8a6a44);

const GRASS = {
  spring: { color: C(0x9ad46a), amount: 0.32 },
  fall: [C(0xc9b24c), C(0xb79b3d), C(0xa9a64a), C(0xd0b85a)],
  winter: { color: C(0xa39a72), amount: 0.6 },
};
// a multiplier on the meadow's own colours, then a blend toward a seasonal colour
// (a multiply alone cannot turn green into straw)
const GROUND_TINT = [
  new THREE.Vector3(1.04, 1.07, 0.92), // spring
  new THREE.Vector3(0.9, 1.06, 0.84),  // summer: deep and lush
  new THREE.Vector3(1.2, 1.04, 0.7),   // fall: straw and gold
  new THREE.Vector3(1.0, 0.92, 0.75),  // winter
];
const GROUND_MIX = [
  [C(0x9fd36a), 0.12],
  [C(0x4f9a3a), 0.0],
  [C(0xb9a548), 0.3],
  [C(0x8f8a5c), 0.55], // winter: dry, dull grass where the snow has not settled
];
const FLOWER_SHARE = [1, 0.75, 0.22, 0]; // how many flowers are out in each season

function lustrous(color, out) {
  // summer greens: richer and a touch brighter
  const hsl = {};
  color.getHSL(hsl);
  return out.setHSL(hsl.h, Math.min(1, hsl.s * 1.22 + 0.04), hsl.l * 1.04);
}

// ---------------------------------------------------------------------------

function patchGround(ground, uniforms) {
  const mat = ground.material;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPlanetPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlanetPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPlanetPos;
        uniform float uSnowCover;
        uniform vec3 uGroundTint;
        uniform vec4 uGroundMix;
        uniform vec3 uSnowColor;
        ${SNOW_FIELD_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb * uGroundTint, uGroundMix.rgb, uGroundMix.a);
        float snowF = snowField(vPlanetPos);
        // white only under the snow layer, stopping just inside its rim so no pale halo shows
        float snowK = smoothstep(snowF + 0.02, snowF + 0.03, uSnowCover);
        diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, snowK);`);
  };
  mat.customProgramCacheKey = () => 'ground-seasons';
  mat.needsUpdate = true;
}

/** Autumn leaves lying on the meadow, gathered under the trees. */
function buildFallenLeaves(trees) {
  const count = 900;
  const geo = new THREE.PlaneGeometry(0.3, 0.42);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ map: makeLeafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.receiveShadow = true;
  let s = 2024;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const leaves = [];
  const centers = trees.map((t) => {
    // a tree's flat position from its world position
    const p = t.group.position.clone().sub(PLANET_CENTER).normalize();
    const phi = Math.acos(THREE.MathUtils.clamp(p.y, -1, 1));
    const len = Math.hypot(p.x, p.z) || 1;
    return { dx: (p.x / len) * phi * 22, dz: (p.z / len) * phi * 22, reach: 3.2 * t.group.scale.x };
  });
  const tilt = new THREE.Quaternion();
  const e = new THREE.Euler();
  let guard = 0;
  while (leaves.length < count && guard++ < count * 6) {
    const ti = leaves.length % centers.length;
    const c = centers[ti];
    // mostly under the trees, a few blown across the meadow
    const stray = rnd() < 0.25;
    const a = rnd() * Math.PI * 2;
    const d = stray ? 1 + rnd() * 7 : 0.4 + Math.sqrt(rnd()) * c.reach;
    const dx = c.dx + Math.cos(a) * d;
    const dz = c.dz + Math.sin(a) * d;
    if ((Math.abs(dx) < 5.1 && Math.abs(dz) < 5.1) || inPond(dx, dz, 0.15)) continue;
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    onPlanet(dx, dz, 0.015 + rnd() * 0.02, p, q);
    tilt.setFromEuler(e.set((rnd() - 0.5) * 0.5, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.5));
    q.multiply(tilt);
    const rel = p.clone().sub(PLANET_CENTER);
    leaves.push({
      p, q, s: 0.7 + rnd() * 0.6, r: rnd(), r2: rnd(), tree: ti % FALL_TREES.length,
      field: snowField(rel.x, rel.y, rel.z),
    });
  }
  mesh.count = leaves.length;
  return { mesh, leaves };
}

/**
 * A layer of snow with real depth over the side of the planet you can see. It
 * rises out of the ground where the snow field is covered, with a rounded rim
 * against bare grass and a lumpy top, and dips under the house floor and the pond.
 */
function buildSnowLayer() {
  const MAX_D = 31;    // flat distance from the pole the layer reaches (just past the view)
  const RINGS = 150;
  const SEG = 520;
  const n = (RINGS + 1) * SEG + 1;
  const pos = new Float32Array(n * 3);
  const dir = new Float32Array(n * 3);   // unit direction from the planet centre
  const field = new Float32Array(n);     // snow field at each vertex
  const lumps = new Float32Array(n);     // uneven top, fixed per vertex
  const keepOut = new Float32Array(n);   // 1 where snow must stay below the surface, easing to 0
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const lump = (x, y, z) =>
    0.55 * Math.sin(x * 1.3 + Math.sin(z * 1.1) * 1.4) * Math.cos(z * 1.2 + Math.sin(y * 0.9))
    + 0.3 * Math.sin(x * 3.1 - z * 2.7 + y * 1.9) * Math.cos(y * 2.9 + x * 1.7)
    + 0.15 * Math.sin(x * 7.3 + z * 6.1) * Math.sin(z * 5.9 - y * 6.7);
  const put = (k, dx, dz) => {
    onPlanet(dx, dz, 0, p, q);
    const ux = (p.x - PLANET_CENTER.x) / PLANET_R;
    const uy = (p.y - PLANET_CENTER.y) / PLANET_R;
    const uz = (p.z - PLANET_CENTER.z) / PLANET_R;
    dir.set([ux, uy, uz], k * 3);
    field[k] = snowField(ux * PLANET_R, uy * PLANET_R, uz * PLANET_R);
    lumps[k] = lump(p.x, p.y, p.z);
    // tuck under the room's floor slab (eased well inside its edge, where the slab
    // hides the slope) and slope down into the pond's inner bank
    const house = 1 - smooth(Math.max(Math.abs(dx), Math.abs(dz)), 3.3, 3.9);
    const px = dx - POND.dx, pz = dz - POND.dz;
    const water = 1 - smooth(Math.hypot(px, pz) - shoreRadius(Math.atan2(pz, px)), 0.02, 0.25);
    // the cloche keeps the rose (and its little stand) clear; snow banks up round it
    const rose = 1 - smooth(Math.hypot(dx - ROSE.dx, dz - ROSE.dz), 0.6, 0.95);
    keepOut[k] = Math.max(house, water, rose);
  };
  put(0, 0, 0);
  for (let r = 0; r <= RINGS; r++) {
    // rings bunch up slightly toward the pole, where the camera looks closest
    const d = 0.25 + MAX_D * Math.pow(r / RINGS, 1.15);
    for (let sIdx = 0; sIdx < SEG; sIdx++) {
      const a = (sIdx / SEG) * Math.PI * 2;
      put(1 + r * SEG + sIdx, Math.cos(a) * d, Math.sin(a) * d);
    }
  }
  const index = [];
  for (let sIdx = 0; sIdx < SEG; sIdx++) index.push(0, 1 + ((sIdx + 1) % SEG), 1 + sIdx);
  for (let r = 0; r < RINGS; r++) {
    for (let sIdx = 0; sIdx < SEG; sIdx++) {
      const a = 1 + r * SEG + sIdx;
      const b = 1 + r * SEG + ((sIdx + 1) % SEG);
      const c = 1 + (r + 1) * SEG + sIdx;
      const d = 1 + (r + 1) * SEG + ((sIdx + 1) % SEG);
      index.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(index);
  const mat = new THREE.MeshStandardMaterial({ color: 0xf6f9fc, roughness: 0.92, metalness: 0 });
  // The outline is cut per pixel from the exact snow field, not left to where the
  // mesh happens to cross the ground, so the edge follows a smooth curve instead
  // of stepping along the triangles.
  const coverUniform = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSnowCover = coverUniform;
    shader.uniforms.uPlanetCenter = { value: PLANET_CENTER };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uPlanetCenter;\nvarying vec3 vSnowP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSnowP = position - uPlanetCenter;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uSnowCover;
        varying vec3 vSnowP;
        ${SNOW_FIELD_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        // the field is defined on the planet's surface, so read it at ground level
        if (uSnowCover - snowField(normalize(vSnowP) * ${PLANET_R.toFixed(1)}) < 0.0) discard;`);
  };
  mat.customProgramCacheKey = () => 'snow-layer';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.visible = false;
  mesh.frustumCulled = false;

  /** Lift each vertex for the current cover: buried below ground where bare, piled where snowed. */
  function set(cover) {
    mesh.visible = cover > 0.001;
    coverUniform.value = cover;
    if (!mesh.visible) return;
    const settled = THREE.MathUtils.clamp(cover / 0.5, 0, 1); // thin at first, deeper as it builds
    for (let k = 0; k < n; k++) {
      // the height starts rising just outside the cut, so the edge already has some
      // thickness where it is trimmed, then rounds up to full depth
      const e = smooth(cover - field[k], -0.012, SNOW_RIM);
      let h = 0.004 + e * (SNOW_DEPTH * (0.55 + 0.45 * settled) + 0.07 * lumps[k] * e);
      if (keepOut[k] > 0) h += (-0.12 - h) * keepOut[k];
      const r = PLANET_R + h;
      pos[k * 3] = PLANET_CENTER.x + dir[k * 3] * r;
      pos[k * 3 + 1] = PLANET_CENTER.y + dir[k * 3 + 1] * r;
      pos[k * 3 + 2] = PLANET_CENTER.z + dir[k * 3 + 2] * r;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return { mesh, set };
}

// ---------------------------------------------------------------------------

export function createSeasons(planet) {
  const groundUniforms = {
    uSnowCover: { value: 0 },
    uGroundTint: { value: new THREE.Vector3(1, 1, 1) },
    uGroundMix: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSnowColor: { value: SNOW.clone() },
  };
  patchGround(planet.ground, groundUniforms);

  const fallen = buildFallenLeaves(planet.trees);
  planet.group.add(fallen.mesh);
  const snowLayer = buildSnowLayer();
  planet.group.add(snowLayer.mesh);

  // snow-field values for every blade and flower, computed once
  const rel = new THREE.Vector3();
  const fieldAt = (p) => {
    rel.copy(p).sub(PLANET_CENTER);
    return snowField(rel.x, rel.y, rel.z);
  };
  for (const b of planet.grass.blades) b.field = fieldAt(b.p);
  for (const f of planet.flowers.blooms) f.field = fieldAt(f.p);

  const m = new THREE.Matrix4();
  const sc = new THREE.Vector3();
  const ca = new THREE.Color();
  const cb = new THREE.Color();
  const col = new THREE.Color();
  const tint = new THREE.Vector3();
  const stoneBase = C(0x9c9a90);

  // the current look, read by the pond, the weather and the HUD
  const look = { position: -1, spring: 0, summer: 0, fall: 0, winter: 0, snow: 0, snowiness: 0, from: 0, to: 1, t: 0 };

  /** How far snow has spread over the planet for a season position. */
  function coverFor(i, t) {
    if (i === 2) return COVER_MAX * smooth(t, 0.15, 1);          // fall into winter: it settles
    if (i === 3) return COVER_MAX * (1 - smooth(t, 0.0, 0.75));  // winter into spring: it melts
    return 0;
  }

  /** Is this spot buried, given its snow-field value? 0 bare, 1 under snow. */
  const buried = (field) => smooth(look.snow, field + 0.005, field + SNOW_RIM * 0.6);

  function leafLook(season, leaf, treeIdx, out) {
    switch (season) {
      case 0: // new leaves: soft, bright spring green
        return out.copy(leaf.color).lerp(SPRING_GREEN, 0.55);
      case 1:
        return lustrous(leaf.color, out);
      case 2: {
        const pal = FALL_TREES[treeIdx % FALL_TREES.length];
        if (leaf.r2 < 0.07) return out.copy(leaf.color).lerp(pal[1], 0.4); // a few hang on green
        return out.copy(pal[Math.floor(leaf.r2 * 61) % pal.length]);
      }
      default: // the last ones wither before they drop
        return out.copy(FALL_TREES[treeIdx % FALL_TREES.length][Math.floor(leaf.r2 * 61) % 6]).lerp(WITHERED, 0.5);
    }
  }

  /**
   * The tree's year: bare and snow-laden in winter; blossom opens on the bare
   * twigs at the thaw; leaves grow out as the petals fall, to a full summer
   * crown; the colours turn; then the leaves drop in late fall.
   */
  function leafGrowth(r) {
    const { from, t } = look;
    if (from === 0) return stagger(t, r);                           // spring into summer: leafing out
    if (from === 1) return 1;
    if (from === 2) return 1 - stagger(Math.min(1, t / 0.5), r);    // late fall: they drop, done by winter
    return 0;                                                       // winter: bare
  }
  function bloom(r) {
    const { from, t } = look;
    if (from === 3) return stagger(smooth(t, 0.3, 1), r);           // the thaw: buds open on bare twigs
    if (from === 0) return 1 - stagger(Math.min(1, t / 0.65), r);   // petals fall as the leaves come
    return 0;
  }
  function barkSnow() {
    const { from, t } = look;
    if (from === 2) return smooth(t, 0.5, 0.9);   // settles once the leaves are down
    if (from === 3) return 1 - smooth(t, 0.0, 0.35);
    return 0;
  }

  function grassLook(season, blade, out) {
    const base = blade.color;
    switch (season) {
      case 0: return out.copy(base).lerp(GRASS.spring.color, GRASS.spring.amount);
      case 1: return lustrous(base, out);
      case 2: return out.copy(base).lerp(GRASS.fall[Math.floor(blade.r * 40) % 4], 0.5 + blade.r * 0.15);
      default: return out.copy(base).lerp(GRASS.winter.color, GRASS.winter.amount);
    }
  }

  function apply() {
    const { from: i, to: j, t } = look;

    // meadow
    tint.copy(GROUND_TINT[i]).lerp(GROUND_TINT[j], t);
    groundUniforms.uGroundTint.value.copy(tint);
    col.copy(GROUND_MIX[i][0]).lerp(GROUND_MIX[j][0], t);
    groundUniforms.uGroundMix.value.set(col.r, col.g, col.b, THREE.MathUtils.lerp(GROUND_MIX[i][1], GROUND_MIX[j][1], t));
    groundUniforms.uSnowCover.value = look.snow;
    snowLayer.set(look.snow);

    const grass = planet.grass;
    grass.blades.forEach((b, k) => {
      const u = stagger(t, b.r);
      grassLook(i, b, ca);
      grassLook(j, b, cb);
      col.copy(ca).lerp(cb, u);
      const bury = buried(b.field);
      col.lerp(SNOW, bury * 0.85);
      sc.copy(b.s);
      sc.y *= 1 - 0.85 * bury;
      sc.x *= 1 - 0.3 * bury;
      sc.z *= 1 - 0.3 * bury;
      m.compose(b.p, b.q, sc);
      grass.mesh.setMatrixAt(k, m);
      grass.mesh.setColorAt(k, col);
    });
    grass.mesh.instanceMatrix.needsUpdate = true;
    grass.mesh.instanceColor.needsUpdate = true;

    // wildflowers come and go with the seasons
    const share = THREE.MathUtils.lerp(FLOWER_SHARE[i], FLOWER_SHARE[j], t);
    const fl = planet.flowers;
    fl.blooms.forEach((f, k) => {
      const show = THREE.MathUtils.clamp((share - f.r) / 0.12, 0, 1) * (1 - buried(f.field));
      sc.setScalar(Math.max(1e-4, f.sc * show));
      m.compose(f.p, f.q, sc);
      fl.petals.setMatrixAt(k, m);
      fl.stems.setMatrixAt(k, m);
    });
    fl.petals.instanceMatrix.needsUpdate = true;
    fl.stems.instanceMatrix.needsUpdate = true;

    // trees
    BARK_SNOW.value = barkSnow();
    const coreLook = [C(0x4f8a3a), C(0x2f5f2a), C(0x6a4a24), C(0x6a4a24)];
    planet.trees.forEach((tree, ti) => {
      let grown = 0;
      tree.leafData.forEach((leaf, k) => {
        const u = stagger(t, leaf.r);
        leafLook(i, leaf, ti, ca);
        leafLook(j, leaf, ti, cb);
        tree.leaves.setColorAt(k, col.copy(ca).lerp(cb, u));
        // leaves unfurl from nothing and shrink away as they drop
        const g = leafGrowth(leaf.r2);
        grown += g;
        sc.setScalar(Math.max(1e-4, leaf.s * (g < 1 ? 0.25 + 0.75 * g : 1) * Math.min(1, g * 4)));
        tree.leaves.setMatrixAt(k, m.compose(leaf.pos, leaf.q, sc));
      });
      tree.leaves.instanceColor.needsUpdate = true;
      tree.leaves.instanceMatrix.needsUpdate = true;
      // the dark inner crown only fills in once there are enough leaves to hide it
      const fill = smooth(grown / tree.leafData.length, 0.35, 0.9);
      for (const core of tree.cores) {
        core.scale.setScalar(Math.max(1e-4, fill));
        core.visible = fill > 0.01;
      }
      tree.coreMat.color.copy(coreLook[i]).lerp(coreLook[j], smooth(t, 0.2, 0.8));
      tree.blossomData.forEach((b, k) => {
        const open = bloom(b.r);
        sc.setScalar(Math.max(1e-4, b.s * open));
        tree.blossoms.setMatrixAt(k, m.compose(b.pos, b.q, sc));
        tree.blossoms.setColorAt(k, SAKURA[Math.floor(b.r2 * 97) % SAKURA.length]);
      });
      tree.blossoms.instanceMatrix.needsUpdate = true;
      if (tree.blossoms.instanceColor) tree.blossoms.instanceColor.needsUpdate = true;
      tree.blossoms.visible = tree.blossomData.some((b) => bloom(b.r) > 0.001);
    });

    // leaves on the ground: they gather through the fall and vanish under snow
    const LITTER = [0.0, 0.0, 1.0, 0.45];
    const litter = THREE.MathUtils.lerp(LITTER[i], LITTER[j], i === 3 ? smooth(t, 0, 0.3) : t);
    fallen.leaves.forEach((leaf, k) => {
      const show = THREE.MathUtils.clamp((litter - leaf.r) / 0.1, 0, 1) * (1 - buried(leaf.field));
      sc.setScalar(Math.max(1e-4, leaf.s * show));
      m.compose(leaf.p, leaf.q, sc);
      fallen.mesh.setMatrixAt(k, m);
      const pal = FALL_TREES[leaf.tree];
      // fresh colour first, browning as winter nears
      col.copy(pal[Math.floor(leaf.r2 * 53) % pal.length]).lerp(C(0x7a5a3a), i === 2 ? t * 0.6 * leaf.r2 : i === 3 ? 0.6 : 0);
      fallen.mesh.setColorAt(k, col);
    });
    fallen.mesh.instanceMatrix.needsUpdate = true;
    if (fallen.mesh.instanceColor) fallen.mesh.instanceColor.needsUpdate = true;

    // a dusting on the stepping stones
    planet.stones.userData.material.color.copy(stoneBase).lerp(SNOW, look.snowiness * 0.8);
  }

  /** Set the season position (0..4, wrapping). Cheap when nothing has changed. */
  function set(position) {
    const p = ((position % 4) + 4) % 4;
    if (Math.abs(p - look.position) < 0.0015) return look;
    look.position = p;
    look.from = Math.floor(p) % 4;
    look.to = (look.from + 1) % 4;
    look.t = p - Math.floor(p);
    const w = [0, 0, 0, 0];
    w[look.from] = 1 - look.t;
    w[look.to] += look.t;
    [look.spring, look.summer, look.fall, look.winter] = w;
    look.snow = coverFor(look.from, look.t);
    look.snowiness = Math.min(1, look.snow / 0.75);
    apply();
    return look;
  }

  return { set, look };
}

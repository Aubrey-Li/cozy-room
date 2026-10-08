import * as THREE from 'three';
import { PLANET_CENTER, PLANET_R } from './planet-math.js';
import { makeLeafTexture, makePetalTexture } from './textures.js';

// ---------------------------------------------------------------------------
// Snow: flakes drift down toward the planet's centre, all moved on the GPU
// ---------------------------------------------------------------------------

const SNOW_VERT = /* glsl */ `
  attribute vec3 aDir;
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uAmount;
  uniform float uSize;
  uniform vec3 uCenter;
  varying float vAlpha;
  const float H = 15.0;
  void main() {
    float speed = 0.45 + aSeed.y * 0.35;
    float h = mod(aSeed.x * H - uTime * speed, H);
    vec3 t1 = normalize(cross(aDir, vec3(0.31, 0.95, 0.07)));
    vec3 t2 = cross(aDir, t1);
    float sway = 0.35 + aSeed.z * 0.3;
    vec3 p = uCenter + aDir * (${PLANET_R.toFixed(1)} + h)
      + t1 * sin(uTime * 0.7 + aSeed.z * 20.0) * sway
      + t2 * cos(uTime * 0.53 + aSeed.w * 20.0) * sway;
    // only some flakes fall in a light snow; all of them in a heavy one
    vAlpha = step(aSeed.w, uAmount) * smoothstep(0.0, 0.5, h) * smoothstep(H, H - 4.0, h);
    gl_PointSize = (2.2 + aSeed.z * 2.6) * uSize;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const SNOW_FRAG = /* glsl */ `
  precision highp float;
  uniform float uLight;
  varying float vAlpha;
  void main() {
    if (vAlpha <= 0.0) discard;
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.35, r) * vAlpha * 0.92;
    if (a <= 0.01) discard;
    gl_FragColor = vec4(vec3(0.96, 0.98, 1.0) * uLight, a);
  }
`;

function buildSnow(count = 2600) {
  const dir = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  let s = 31337;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let i = 0;
  while (i < count) {
    // only over the side of the planet you can see
    const cMin = Math.cos(1.25);
    const y = cMin + rnd() * (1 - cMin);
    const az = rnd() * Math.PI * 2;
    const rr = Math.sqrt(1 - y * y);
    const x = Math.cos(az) * rr;
    const z = Math.sin(az) * rr;
    // no snow falling inside the open-roofed room
    if (y > 0.9 && Math.abs(x * PLANET_R) < 5.6 && Math.abs(z * PLANET_R) < 5.6) continue;
    dir.set([x, y, z], i * 3);
    seed.set([rnd(), rnd(), rnd(), rnd()], i * 4);
    i++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const uniforms = {
    uTime: { value: 0 },
    uAmount: { value: 0 },
    uSize: { value: 1 },
    uLight: { value: 1 },
    uCenter: { value: PLANET_CENTER.clone() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SNOW_VERT,
    fragmentShader: SNOW_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  return { points, uniforms };
}

// ---------------------------------------------------------------------------
// Leaves and petals: a few dozen cards tumbling down from the tree crowns
// ---------------------------------------------------------------------------

const FALL_COLORS = [0xc8402b, 0xe0682a, 0xe8b73a, 0xd9a531, 0xa82e26, 0xeba13a].map((h) => new THREE.Color(h));
const PETAL_COLORS = [0xffc3d4, 0xffd8e3, 0xf7a3bb, 0xffe6ee].map((h) => new THREE.Color(h));
const WIND = new THREE.Vector3(1, 0, 0.55).normalize();

function buildDrifters(count, texture, size, colors) {
  const geo = new THREE.PlaneGeometry(size[0], size[1]);
  const mat = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  const items = [];
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < count; i++) {
    mesh.setMatrixAt(i, zero);
    mesh.setColorAt(i, colors[i % colors.length]);
    items.push({
      alive: false, p: new THREE.Vector3(), rest: 0, wait: Math.random() * 6,
      spin: new THREE.Vector3(Math.random() * 3, Math.random() * 3, Math.random() * 3),
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      fall: 0.35 + Math.random() * 0.3, phase: Math.random() * 10, landedQ: new THREE.Quaternion(),
    });
  }
  return { mesh, items, colors };
}

export function createWeather(trees) {
  const group = new THREE.Group();
  const snow = buildSnow();
  const leaves = buildDrifters(36, makeLeafTexture(), [0.26, 0.36], FALL_COLORS);
  const petals = buildDrifters(90, makePetalTexture(), [0.16, 0.16], PETAL_COLORS);
  group.add(snow.points, leaves.mesh, petals.mesh);

  // spawn points inside the tree crowns
  const spots = [];
  function collectSpots() {
    for (const tree of trees) {
      tree.group.updateMatrixWorld(true);
      for (const [x, y, z, r] of tree.blobs) {
        spots.push({ tree, local: new THREE.Vector3(x, y, z), r });
      }
    }
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const down = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const yaw = new THREE.Quaternion();

  function stepDrifters(set, intensity, dt, time, scale) {
    for (let i = 0; i < set.items.length; i++) {
      const it = set.items[i];
      if (!it.alive) {
        it.wait -= dt;
        if (it.wait > 0) continue;
        // only a share of them keep falling when the season is just starting or ending
        if (Math.random() > intensity || spots.length === 0) {
          it.wait = 1 + Math.random() * 3;
          continue;
        }
        const spot = spots[Math.floor(Math.random() * spots.length)];
        it.p.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
          .normalize().multiplyScalar(spot.r * (0.6 + Math.random() * 0.4)).add(spot.local);
        spot.tree.group.localToWorld(it.p);
        it.alive = true;
        it.rest = 0;
        set.mesh.setColorAt(i, set.colors[Math.floor(Math.random() * set.colors.length)]);
        set.mesh.instanceColor.needsUpdate = true;
      }
      const dist = down.copy(PLANET_CENTER).sub(it.p).length();
      down.divideScalar(dist);
      if (it.rest > 0) {
        // lying on the grass for a moment before it is gone
        it.rest -= dt;
        const k = Math.min(1, it.rest / 0.6);
        sc.setScalar(scale * k);
        m.compose(it.p, it.landedQ, sc);
        set.mesh.setMatrixAt(i, m);
        if (it.rest <= 0) {
          it.alive = false;
          it.wait = Math.random() * 2;
          set.mesh.setMatrixAt(i, m.makeScale(0, 0, 0));
        }
        continue;
      }
      if (dist <= PLANET_R + 0.03) {
        it.rest = 2 + Math.random() * 3;
        up.set(0, 1, 0);
        it.landedQ.setFromUnitVectors(up, down.clone().negate());
        it.landedQ.multiply(yaw.setFromAxisAngle(up, Math.random() * 6.28));
        continue;
      }
      // fall, flutter side to side and drift with the breeze
      side.copy(WIND).addScaledVector(down, -WIND.dot(down));
      const flutter = Math.sin(time * 2.1 + it.phase) * 0.6;
      it.p.addScaledVector(down, it.fall * dt * (0.8 + 0.4 * Math.abs(Math.sin(time * 1.3 + it.phase))))
        .addScaledVector(side, (0.25 + flutter) * dt);
      it.rot.x += it.spin.x * dt;
      it.rot.y += it.spin.y * dt;
      it.rot.z += it.spin.z * dt;
      q.setFromEuler(it.rot);
      sc.setScalar(scale);
      m.compose(it.p, q, sc);
      set.mesh.setMatrixAt(i, m);
    }
    set.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * look: the season look from seasons.js; light: 0..1 daylight; zoom: camera zoom
   */
  function update(look, dt, time, light, zoom) {
    if (spots.length === 0) collectSpots();
    // snowfall builds as fall turns to winter and stops the moment the thaw begins
    let snowing = 0;
    if (look.from === 2) snowing = THREE.MathUtils.smoothstep(look.t, 0.05, 0.6);
    else if (look.from === 3) snowing = 1 - THREE.MathUtils.smoothstep(look.t, 0.0, 0.02);
    const u = snow.uniforms;
    u.uTime.value = time;
    u.uAmount.value = snowing;
    u.uSize.value = Math.min(window.devicePixelRatio, 2) * THREE.MathUtils.clamp(Math.sqrt(zoom), 0.4, 2);
    u.uLight.value = 0.4 + 0.6 * light;
    snow.points.visible = snowing > 0.001;

    // a few leaves drift down through the fall, a little more while the trees are
    // shedding, and none once winter has come; petals drift while the blossom drops
    let leafing = 0;
    if (look.from === 1) leafing = 0.1 * THREE.MathUtils.smoothstep(look.t, 0.5, 1);
    else if (look.from === 2) leafing = (0.12 + 0.3 * THREE.MathUtils.smoothstep(look.t, 0, 0.3)) * (1 - THREE.MathUtils.smoothstep(look.t, 0.35, 0.5));
    const blooming = look.from === 0 ? 0.8 * (1 - THREE.MathUtils.smoothstep(look.t, 0.4, 0.7)) : 0;
    leaves.mesh.visible = leafing > 0.001 || leaves.items.some((it) => it.alive);
    petals.mesh.visible = blooming > 0.001 || petals.items.some((it) => it.alive);
    if (leaves.mesh.visible) stepDrifters(leaves, leafing, dt, time, 1);
    if (petals.mesh.visible) stepDrifters(petals, blooming, dt, time, 1);
  }

  return { group, update };
}

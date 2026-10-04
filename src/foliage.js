import * as THREE from 'three';

/**
 * Leaf and petal geometry built from a half-width profile w(y), y in [0,1],
 * then curled along its length and cupped across its width. The base sits
 * at the origin and the leaf grows along +Y, facing +Z.
 */
export function leafGeometry(profile, {
  length = 1,
  width = 0.5,
  curl = 0.25,      // bend of the tip toward +Z (negative bends to -Z)
  cup = 0,          // bend of the side edges toward +Z
  slits = null,     // [{ y, depth }] notches cut from the edge toward the midrib
  segments = 28,
} = {}) {
  const right = [];
  for (let i = 0; i <= segments; i++) {
    const y = i / segments;
    right.push([Math.max(0, profile(y)) * width, y]);
  }
  if (slits) {
    for (const { y: sy, depth } of slits) {
      const keep = right.filter(([, y]) => Math.abs(y - sy) > 0.055 || y === 0 || y === 1);
      const insertAt = keep.findIndex(([, y]) => y > sy);
      const w = (y) => Math.max(0, profile(y)) * width;
      keep.splice(insertAt, 0,
        [w(sy - 0.055), sy - 0.055],
        [depth * width, sy - 0.01],
        [depth * width, sy + 0.01],
        [w(sy + 0.055), sy + 0.055]);
      right.length = 0;
      right.push(...keep);
    }
  }
  const pts = [];
  for (const [x, y] of right) pts.push(new THREE.Vector2(x, y * length));
  for (let i = right.length - 2; i > 0; i--) pts.push(new THREE.Vector2(-right[i][0], right[i][1] * length));
  const shape = new THREE.Shape(pts);
  const geo = new THREE.ShapeGeometry(shape, 4);
  const pos = geo.attributes.position;
  const halfW = width * 0.5;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const yn = pos.getY(i) / length;
    const xn = halfW > 0 ? x / halfW : 0;
    let z = curl * yn * yn * length;
    z += cup * xn * xn * width;
    // slight midrib ridge
    z -= 0.015 * width * (1 - Math.min(1, Math.abs(xn))) * (1 - yn);
    pos.setZ(i, z);
  }
  // normalise UVs so u runs across the leaf and v from base to tip
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, pos.getX(i) / width + 0.5, pos.getY(i) / length);
  }
  geo.computeVertexNormals();
  return geo;
}

let veinTex = null;
/** Grayscale leaf veins: a pale midrib, angled side veins and a darker rim. */
export function veinTexture() {
  if (veinTex) return veinTex;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(222,222,222)';
  ctx.fillRect(0, 0, size, size);
  const rim = ctx.createRadialGradient(size / 2, size * 0.55, size * 0.1, size / 2, size * 0.55, size * 0.62);
  rim.addColorStop(0, 'rgba(255,255,255,0.18)');
  rim.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,255,240,0.85)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(size / 2, size);
  ctx.lineTo(size / 2, 6);
  ctx.stroke();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = 'rgba(255,255,240,0.55)';
  for (let i = 0; i < 9; i++) {
    const y = size * (0.92 - i * 0.095);
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(size / 2, y);
      ctx.quadraticCurveTo(size / 2 + dir * size * 0.2, y - size * 0.05, size / 2 + dir * size * 0.46, y - size * 0.15);
      ctx.stroke();
    }
  }
  veinTex = new THREE.CanvasTexture(c);
  veinTex.colorSpace = THREE.SRGBColorSpace;
  return veinTex;
}

// Half-width profiles, y in [0,1] from base to tip.
export const profiles = {
  fiddle: (y) => {
    // violin shaped: narrow waist, broad rounded top
    const base = Math.sin(Math.PI * Math.pow(y, 0.9));
    const waist = 1 - 0.3 * Math.exp(-Math.pow((y - 0.4) / 0.14, 2));
    const top = 1 + 0.35 * Math.exp(-Math.pow((y - 0.75) / 0.14, 2));
    return 0.5 * Math.pow(base, 0.6) * waist * top * (y > 0.97 ? (1 - y) / 0.03 : 1);
  },
  monstera: (y) => 0.52 * Math.pow(Math.sin(Math.PI * Math.pow(y, 0.72)), 0.75),
  heart: (y) => 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(y, 0.65)), 0.9),
  succulent: (y) => 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(y, 0.5)), 1.4),
  roseLeaf: (y) => 0.45 * Math.sin(Math.PI * Math.pow(y, 0.85)) * (1 + 0.05 * Math.sign(Math.sin(y * 70))),
  petal: (y) => 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(y, 0.55)), 0.55),
  sepal: (y) => 0.35 * Math.sin(Math.PI * y),
};

export function leafMaterial(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    map: veinTexture(),
    roughness: 0.55,
    metalness: 0,
    side: THREE.DoubleSide,
    ...opts,
  });
}

/** Thin stem between two points. */
export function stem(from, to, radius, material, segments = 6) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.8, radius, len, segments), material);
  m.position.copy(from).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  return m;
}

/** Curved stem along a quadratic arc. */
export function arcStem(from, to, lift, radius, material) {
  const mid = from.clone().lerp(to, 0.5);
  mid.y += lift;
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, radius, 6), material);
  m.castShadow = true;
  return { mesh: m, curve };
}

/**
 * Place a leaf: base at `at`, pointing toward azimuth `az` (radians around Y),
 * raised `pitch` radians above horizontal.
 */
export function placeLeaf(geo, material, at, az, pitch, scale = 1, roll = 0) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.copy(at);
  mesh.rotation.order = 'YXZ';
  mesh.rotation.y = az;
  mesh.rotation.x = Math.PI / 2 - pitch; // +Y -> outward (+Z local before yaw), tipped up by pitch
  mesh.rotation.z = roll;
  mesh.scale.setScalar(scale);
  return mesh;
}

/** A pot with rim, soil and a saucer. */
export function pot(radiusTop, radiusBottom, height, material, soilMaterial, saucer = true) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 24), material);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radiusTop, radiusTop * 0.09, 8, 28), material);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = height;
  rim.castShadow = true;
  g.add(rim);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop * 0.92, radiusTop * 0.92, 0.03, 24), soilMaterial);
  soil.position.y = height - 0.03;
  g.add(soil);
  if (saucer) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(radiusBottom * 1.25, radiusBottom * 1.2, 0.03, 24), material);
    s.position.y = 0.015;
    s.receiveShadow = true;
    g.add(s);
  }
  g.userData.top = height - 0.02;
  return g;
}

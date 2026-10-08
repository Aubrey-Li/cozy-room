import * as THREE from 'three';

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

/**
 * A smooth 0..1 field over the planet (positions relative to its centre). Snow
 * settles wherever the field is below the current cover, so raising the cover
 * buries the meadow from the hollows up and leaves the highest patches bare.
 * SNOW_FIELD_GLSL is the identical function for shaders.
 */
export function snowField(x, y, z) {
  const a = Math.sin(x * 0.42 + Math.sin(z * 0.31) * 1.6) * Math.cos(z * 0.38 + Math.sin(y * 0.35) * 1.4);
  const b = Math.sin(x * 1.1 - y * 0.9 + z * 0.7) * Math.cos(y * 1.3 + z * 0.8);
  return 0.5 + 0.5 * (a * 0.7 + b * 0.3);
}

export const SNOW_FIELD_GLSL = /* glsl */ `
  float snowField(vec3 p) {
    float a = sin(p.x * 0.42 + sin(p.z * 0.31) * 1.6) * cos(p.z * 0.38 + sin(p.y * 0.35) * 1.4);
    float b = sin(p.x * 1.1 - p.y * 0.9 + p.z * 0.7) * cos(p.y * 1.3 + p.z * 0.8);
    return 0.5 + 0.5 * (a * 0.7 + b * 0.3);
  }
`;

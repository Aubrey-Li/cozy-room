import * as THREE from 'three';
import { onPlanet } from './planet.js';

const VERT = /* glsl */ `
  attribute float aPhase;
  attribute float aSize;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vBlink;
  void main() {
    float t = uTime * (1.6 + aPhase * 1.2) + aPhase * 40.0;
    float blink = 0.5 + 0.5 * sin(t);
    blink = pow(blink, 4.0);
    // occasional longer dark gaps
    blink *= smoothstep(0.1, 0.4, 0.5 + 0.5 * sin(t * 0.21 + aPhase * 9.0));
    vBlink = blink;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (0.55 + 0.75 * blink);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uNight;
  varying float vBlink;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    float core = smoothstep(0.45, 0.0, r);
    float halo = smoothstep(1.0, 0.0, r);
    halo *= halo;
    vec3 col = vec3(0.78, 1.0, 0.42) * (core * 1.4 + halo * 0.6);
    float a = (core + halo * 0.7) * (0.15 + 0.85 * vBlink) * uNight;
    gl_FragColor = vec4(col, a);
  }
`;

export class Fireflies {
  constructor(count = 80) {
    this.count = count;
    this.base = new Float32Array(count * 3); // dx, dz, h in planet-local flat coordinates
    this.seedOff = new Float32Array(count * 3);
    const positions = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    const size = new Float32Array(count);

    let i = 0;
    while (i < count) {
      const ang = Math.random() * Math.PI * 2;
      const d = 5.6 + Math.sqrt(Math.random()) * 11;
      const dx = Math.cos(ang) * d;
      const dz = Math.sin(ang) * d;
      if (Math.abs(dx) < 5 && Math.abs(dz) < 5) continue;
      this.base[i * 3] = dx;
      this.base[i * 3 + 1] = dz;
      this.base[i * 3 + 2] = 0.3 + Math.random() * 2.0;
      this.seedOff[i * 3] = Math.random() * 100;
      this.seedOff[i * 3 + 1] = Math.random() * 100;
      this.seedOff[i * 3 + 2] = Math.random() * 100;
      phase[i] = Math.random();
      size[i] = 9 + Math.random() * 8;
      i++;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

    this.uniforms = {
      uTime: { value: 0 },
      uNight: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this.update(0, 0);
  }

  update(time, night) {
    this.uniforms.uTime.value = time;
    this.uniforms.uNight.value = night;
    this.points.visible = night > 0.01;
    if (!this.points.visible) return;

    const pos = this.points.geometry.attributes.position;
    for (let i = 0; i < this.count; i++) {
      const bx = this.base[i * 3];
      const bz = this.base[i * 3 + 1];
      const bh = this.base[i * 3 + 2];
      const sx = this.seedOff[i * 3];
      const sz = this.seedOff[i * 3 + 1];
      const sh = this.seedOff[i * 3 + 2];
      const dx = bx + Math.sin(time * 0.35 + sx) * 0.9 + Math.sin(time * 0.9 + sz) * 0.3;
      const dz = bz + Math.cos(time * 0.28 + sz) * 0.9 + Math.cos(time * 0.7 + sx) * 0.3;
      const h = bh + Math.sin(time * 0.6 + sh) * 0.35;
      onPlanet(dx, dz, h, this._p, this._q);
      pos.setXYZ(i, this._p.x, this._p.y, this._p.z);
    }
    pos.needsUpdate = true;
  }
}

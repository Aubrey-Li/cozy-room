import * as THREE from 'three';
import { makeSunTexture, makeGlowTexture, makeMoonTexture } from './textures.js';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  uniform vec2 uSunUV;
  uniform vec3 uGlowColor;
  uniform float uGlow;
  uniform float uNight;
  uniform float uTime;
  uniform float uAspect;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    float y = vUv.y;
    vec3 col = mix(uHorizon, uTop, smoothstep(0.42, 1.0, y));
    col = mix(uBottom, col, smoothstep(0.0, 0.42, y));

    // warm glow around the sun, strongest near the horizon
    vec2 d = vUv - uSunUV;
    d.x *= uAspect;
    float dist = length(d);
    col += uGlowColor * uGlow * (exp(-dist * dist * 9.0) * 0.55 + exp(-dist * 3.5) * 0.22);

    // stars: two layers of hashed cells, twinkling
    float stars = 0.0;
    for (int layer = 0; layer < 2; layer++) {
      float scale = layer == 0 ? 70.0 : 130.0;
      vec2 g = vUv * vec2(uAspect, 1.0) * scale + float(layer) * 17.0;
      vec2 id = floor(g);
      vec2 f = fract(g) - 0.5;
      float h = hash(id);
      float threshold = layer == 0 ? 0.90 : 0.955;
      if (h > threshold) {
        vec2 off = (vec2(hash(id + 1.3), hash(id + 7.1)) - 0.5) * 0.6;
        float r = length(f - off);
        float tw = 0.55 + 0.45 * sin(uTime * (0.8 + h * 2.5) + h * 60.0);
        float size = layer == 0 ? 0.09 : 0.06;
        stars += smoothstep(size, 0.0, r) * tw * (layer == 0 ? 1.0 : 0.7);
      }
    }
    col += vec3(1.0, 0.97, 0.9) * stars * uNight * smoothstep(0.25, 0.6, y);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Screen-space sky: a full-screen gradient quad rendered before the main
 * scene, plus sun and moon sprites parented to the camera so they orbit in
 * the screen plane and get occluded by the little planet as they set.
 */
export class Sky {
  constructor(camera) {
    this.camera = camera;
    this.scene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.halfW = 1;
    this.halfH = 1;

    this.uniforms = {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uBottom: { value: new THREE.Color() },
      uSunUV: { value: new THREE.Vector2(0.5, 0.5) },
      uGlowColor: { value: new THREE.Color() },
      uGlow: { value: 0 },
      uNight: { value: 0 },
      uTime: { value: 0 },
      uAspect: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));

    const spriteMat = (map, extra = {}) =>
      new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, ...extra });

    this.sun = new THREE.Sprite(spriteMat(makeSunTexture()));
    this.sun.scale.setScalar(2.4);
    this.sunGlow = new THREE.Sprite(spriteMat(makeGlowTexture(), { blending: THREE.AdditiveBlending, opacity: 0.8 }));
    this.sunGlow.scale.setScalar(9);
    this.moon = new THREE.Sprite(spriteMat(makeMoonTexture()));
    this.moon.scale.setScalar(2.6);

    for (const s of [this.sunGlow, this.sun, this.moon]) {
      s.renderOrder = -10;
      camera.add(s);
    }

    this.orbitCenter = new THREE.Vector2(0, -2.5);
    this.orbitRadius = 12;
    this.depth = -300;
  }

  setFrustum(halfW, halfH) {
    this.halfW = halfW;
    this.halfH = halfH;
    this.uniforms.uAspect.value = halfW / halfH;
    this.orbitRadius = Math.min(halfH * 1.1, halfW * 0.82);
  }

  /** Where the sun currently is, in camera-local XY. */
  sunLocal(theta, out) {
    return out.set(
      this.orbitCenter.x + this.orbitRadius * Math.cos(theta),
      this.orbitCenter.y + this.orbitRadius * Math.sin(theta),
    );
  }

  update(state, time) {
    const u = this.uniforms;
    u.uTop.value.copy(state.sky.top);
    u.uHorizon.value.copy(state.sky.horizon);
    u.uBottom.value.copy(state.sky.bottom);
    u.uGlowColor.value.copy(state.glowColor);
    u.uGlow.value = state.glow;
    u.uNight.value = state.night;
    u.uTime.value = time;

    const p = this.sunLocal(state.theta, _v2);
    u.uSunUV.value.set(0.5 + p.x / (2 * this.halfW), 0.5 + p.y / (2 * this.halfH));

    this.sun.position.set(p.x, p.y, this.depth);
    this.sunGlow.position.set(p.x, p.y, this.depth + 1);
    this.moon.position.set(
      this.orbitCenter.x - this.orbitRadius * Math.cos(state.theta),
      this.orbitCenter.y - this.orbitRadius * Math.sin(state.theta),
      this.depth,
    );

    const sunVis = THREE.MathUtils.smoothstep(state.elev, -0.12, 0.0);
    this.sun.material.opacity = sunVis;
    this.sunGlow.material.opacity = sunVis * (0.35 + 0.65 * state.glow);
    this.moon.material.opacity = THREE.MathUtils.smoothstep(-state.elev, -0.12, 0.05) * (0.55 + 0.45 * state.night);
  }

  render(renderer) {
    renderer.render(this.scene, this.quadCamera);
  }
}

const _v2 = new THREE.Vector2();

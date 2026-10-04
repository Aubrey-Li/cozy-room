import * as THREE from 'three';
import { Sky } from './sky.js';
import { buildPlanet } from './planet.js';
import { buildRoom } from './room.js';
import { Fireflies } from './fireflies.js';
import { localHours, computeSky, createSkyState, formatClock, phaseName, parseTimeParam } from './time.js';

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.autoClear = false;

// ---------------------------------------------------------------------------
// Camera: fixed isometric-ish orthographic view
// ---------------------------------------------------------------------------
const FRUSTUM_H = 22;
const TARGET = new THREE.Vector3(0, 1.6, 0);
const AZIMUTH = Math.PI / 4;
const ELEVATION = THREE.MathUtils.degToRad(32);
const DIST = 90;

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 700);
camera.position.set(
  TARGET.x + DIST * Math.cos(ELEVATION) * Math.sin(AZIMUTH),
  TARGET.y + DIST * Math.sin(ELEVATION),
  TARGET.z + DIST * Math.cos(ELEVATION) * Math.cos(AZIMUTH),
);
camera.lookAt(TARGET);
camera.updateMatrixWorld();

const scene = new THREE.Scene();
scene.add(camera); // needed so sprites parented to the camera render

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------
const sky = new Sky(camera);
scene.add(buildPlanet());
const room = buildRoom();
scene.add(room.group);
const fireflies = new Fireflies(110);
scene.add(fireflies.points);

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 20;
sun.shadow.camera.far = 160;
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 16;
sun.shadow.camera.bottom = -16;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.02;
sun.target.position.copy(TARGET);
scene.add(sun, sun.target);

const moon = new THREE.DirectionalLight(0x9fb4ff, 0);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
moon.shadow.camera.near = 20;
moon.shadow.camera.far = 160;
moon.shadow.camera.left = -16;
moon.shadow.camera.right = 16;
moon.shadow.camera.top = 16;
moon.shadow.camera.bottom = -16;
moon.shadow.bias = -0.0006;
moon.target.position.copy(TARGET);
scene.add(moon, moon.target);

// soft fill from the viewer's side so the interior walls stay readable at midday
const fill = new THREE.DirectionalLight(0xfff1e0, 0);
fill.position.copy(camera.position);
fill.target.position.copy(TARGET);
scene.add(fill, fill.target);
const FILL_DAY = new THREE.Color(0xfff1e0);
const FILL_NIGHT = new THREE.Color(0x8fa3d8);

// ---------------------------------------------------------------------------
// Time control
// ---------------------------------------------------------------------------
const state = createSkyState();
const clockEl = document.getElementById('clock');
const phaseEl = document.getElementById('phase');
const slider = document.getElementById('time-slider');
const liveBtn = document.getElementById('live-btn');
const liveDot = document.getElementById('live-dot');

const params = new URLSearchParams(location.search);
let override = parseTimeParam(params.get('t'));
let live = override === null;

function setLive(on) {
  live = on;
  liveDot.classList.toggle('live', on);
  liveBtn.disabled = on;
  if (on) override = null;
}
setLive(live);

slider.addEventListener('input', () => {
  override = Number(slider.value) / 60;
  setLive(false);
});
liveBtn.addEventListener('click', () => setLive(true));
window.addEventListener('keydown', (e) => {
  if (e.key === 'l' || e.key === 'L') setLive(true);
});

function currentHours() {
  return live ? localHours() : override;
}

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  const halfH = FRUSTUM_H / 2;
  const halfW = halfH * aspect;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();
  sky.setFrustum(halfW, halfH);
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------
const camRight = new THREE.Vector3();
const camUp = new THREE.Vector3();
const camBack = new THREE.Vector3(); // from the scene toward the viewer
const KEY_BIAS = 0.45; // tilt the sun toward the viewer so the room interior stays readable
const sunDir = new THREE.Vector3();
const clock = new THREE.Clock();
let hudTimer = 1; // force a HUD refresh on the first frame

function applyLighting(s) {
  camera.updateMatrixWorld();
  camRight.setFromMatrixColumn(camera.matrixWorld, 0);
  camUp.setFromMatrixColumn(camera.matrixWorld, 1);
  camBack.setFromMatrixColumn(camera.matrixWorld, 2);
  sunDir
    .copy(camRight)
    .multiplyScalar(Math.cos(s.theta))
    .addScaledVector(camUp, Math.sin(s.theta))
    .addScaledVector(camBack, KEY_BIAS * Math.max(0, Math.sin(s.theta) + 0.2))
    .normalize();

  sun.position.copy(TARGET).addScaledVector(sunDir, 80);
  sun.color.copy(s.sunColor);
  sun.intensity = s.sunIntensity;
  sun.castShadow = s.sunIntensity > 0.02;

  moon.position.copy(TARGET).addScaledVector(sunDir, -80);
  moon.intensity = s.moonIntensity;
  moon.castShadow = s.moonIntensity > 0.02;

  const day = THREE.MathUtils.smoothstep(s.elev, -0.1, 0.3);
  fill.intensity = 0.08 + 0.85 * day;
  fill.color.copy(FILL_NIGHT).lerp(FILL_DAY, day);

  hemi.color.copy(s.sky.hemiSky);
  hemi.groundColor.copy(s.sky.hemiGround);
  hemi.intensity = s.sky.hemiI;
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  const hours = currentHours();
  computeSky(hours, state);

  applyLighting(state);
  sky.update(state, t);
  room.update(state, dt);
  fireflies.update(t, state.night);

  renderer.clear();
  sky.render(renderer);
  renderer.render(scene, camera);

  hudTimer += dt;
  if (hudTimer > 0.25) {
    hudTimer = 0;
    clockEl.textContent = formatClock(hours);
    phaseEl.textContent = phaseName(hours);
    if (live) slider.value = String(Math.floor(hours * 60));
  }
}

renderer.setAnimationLoop(frame);

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from './sky.js';
import { buildPlanet, buildLampPost } from './planet.js';
import { buildRoom } from './room.js';
import { Fireflies } from './fireflies.js';
import { createWind } from './wind.js';
import { createMusicPanel } from './music.js';
import { createBook } from './book.js';
import { createGameOverlay } from './game.js';
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
const HOME_POSITION = camera.position.clone();

// ---------------------------------------------------------------------------
// Controls: drag to orbit, scroll to zoom, right-drag / WASD / arrows to pan
// ---------------------------------------------------------------------------
const controls = new OrbitControls(camera, canvas);
controls.target.copy(TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 1.1;
controls.panSpeed = 0.9;
controls.screenSpacePanning = true;
controls.minZoom = 0.45;
controls.maxZoom = 5;
controls.minPolarAngle = THREE.MathUtils.degToRad(12);
controls.maxPolarAngle = THREE.MathUtils.degToRad(82);
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
{
  // optional ?z= start zoom, handy for sharing a close-up
  const q = new URLSearchParams(location.search);
  const z = Number(q.get('z'));
  if (z > 0) {
    camera.zoom = THREE.MathUtils.clamp(z, controls.minZoom, controls.maxZoom);
    camera.updateProjectionMatrix();
  }
  // optional ?target=x,y,z to centre the view on a point
  const tgt = (q.get('target') || '').split(',').map(Number);
  if (tgt.length === 3 && tgt.every(Number.isFinite)) {
    const delta = new THREE.Vector3(...tgt).sub(controls.target);
    controls.target.add(delta);
    camera.position.add(delta);
  }
}
controls.update();

const keysDown = new Set();
const PAN_KEYS = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (PAN_KEYS[e.code]) {
    keysDown.add(e.code);
    e.preventDefault();
  }
  if (e.code === 'KeyR') resetView();
});
window.addEventListener('keyup', (e) => keysDown.delete(e.code));
window.addEventListener('blur', () => keysDown.clear());

function resetView() {
  camera.position.copy(HOME_POSITION);
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  controls.target.copy(TARGET);
  controls.update();
}

const panRight = new THREE.Vector3();
const panUp = new THREE.Vector3();
const panDelta = new THREE.Vector3();
function keyboardPan(dt) {
  if (keysDown.size === 0) return;
  panDelta.set(0, 0, 0);
  panRight.setFromMatrixColumn(camera.matrixWorld, 0);
  panUp.setFromMatrixColumn(camera.matrixWorld, 1);
  for (const code of keysDown) {
    const [x, y] = PAN_KEYS[code];
    panDelta.addScaledVector(panRight, x).addScaledVector(panUp, y);
  }
  if (panDelta.lengthSq() === 0) return;
  // pan speed in world units per second, scaled by the visible frustum height
  const speed = (FRUSTUM_H / camera.zoom) * 0.6 * dt;
  panDelta.normalize().multiplyScalar(speed);
  camera.position.add(panDelta);
  controls.target.add(panDelta);
}

const scene = new THREE.Scene();
scene.add(camera); // needed so sprites parented to the camera render

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------
const sky = new Sky(camera);
const wind = createWind();
scene.add(buildPlanet(wind));
// a lamp post out on the meadow, a little to the right of the house
const lampPost = buildLampPost(6.4, -0.8);
scene.add(lampPost.group);
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

const params = new URLSearchParams(location.search);
let override = parseTimeParam(params.get('t'));
let live = override === null;

function setLive(on) {
  live = on;
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

// ---------------------------------------------------------------------------
// HUD: collapsible, collapsed by default on small screens
// ---------------------------------------------------------------------------
const hudCard = document.getElementById('hud-card');
const hudToggle = document.getElementById('hud-toggle');
const hudSummary = document.getElementById('hud-summary');
const hintEl = document.getElementById('hint');
// keep it light: the room is for discovering, not reading instructions
hintEl.textContent = 'feel free to explore this little world of mine';

function readPref(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

function setCollapsed(collapsed, remember = true) {
  hudCard.classList.toggle('collapsed', collapsed);
  for (const el of [hudToggle, hudSummary]) el.setAttribute('aria-expanded', String(!collapsed));
  hudToggle.setAttribute('aria-label', collapsed ? 'Show controls' : 'Hide controls');
  if (remember) writePref('cozy-room:hud-collapsed', collapsed ? '1' : '0');
}
{
  const saved = readPref('cozy-room:hud-collapsed');
  const small = window.matchMedia('(max-width: 600px)').matches;
  setCollapsed(saved === null ? small : saved === '1', false);
}
hudToggle.addEventListener('click', () => setCollapsed(!hudCard.classList.contains('collapsed')));
hudSummary.addEventListener('click', () => setCollapsed(!hudCard.classList.contains('collapsed')));

function currentHours() {
  return live ? localHours() : override;
}

// ---------------------------------------------------------------------------
// Record player: click or tap it to open the song list
// ---------------------------------------------------------------------------
const music = createMusicPanel({ onPlayingChange: (on) => room.setPlaying(on) });
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();

// things in the room you can click, checked against whatever the ray hits first
const book = createBook();
const gameWindow = createGameOverlay();
const clickables = [
  { roots: [room.recordPlayer], action: () => music.open() },
  { roots: [room.bookshelf], action: (at) => book.open(at) },
  { roots: [room.desk, room.chair], action: (at) => gameWindow.open(at) },
  { roots: room.windowTargets, action: () => room.toggleWindow() },
  { roots: [room.lamp], action: () => room.cycleLamp() },
  { roots: [room.lightSwitch], action: () => room.cycleStringLights() },
];

function pick(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointerNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  // only the room can sit between the camera and these objects, so skip the meadow
  const hit = raycaster.intersectObject(room.group, true).find((h) => h.object.visible && !h.object.isLight && !h.object.isSprite);
  if (!hit) return null;
  for (let o = hit.object; o; o = o.parent) {
    const c = clickables.find((entry) => entry.roots.includes(o));
    if (c) return c;
  }
  return null;
}

// a tap is a short press that barely moves, so orbit drags never open the panel
let press = null;
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  press = { x: e.clientX, y: e.clientY, t: e.timeStamp };
});
canvas.addEventListener('pointerup', (e) => {
  if (!press) return;
  const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
  // event timestamps mark when the touch happened, so a slow frame in between cannot turn a tap into a long press
  const quick = e.timeStamp - press.t < 600;
  press = null;
  if (moved < 6 && quick) pick(e.clientX, e.clientY)?.action({ x: e.clientX, y: e.clientY });
});

// pointer cursor when hovering something clickable (mouse only, at most once per frame)
let hoverQueued = null;
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || e.buttons) return;
  hoverQueued = { x: e.clientX, y: e.clientY };
});
// ?debug exposes a few handles for automated checks
if (new URLSearchParams(location.search).has('debug')) {
  window.__cozy = { camera, room, music, book, gameWindow, THREE };
}

function updateHover() {
  if (!hoverQueued) return;
  const over = Boolean(pick(hoverQueued.x, hoverQueued.y));
  canvas.style.cursor = over ? 'pointer' : '';
  hoverQueued = null;
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
  fill.position.copy(camera.position);
  fill.target.position.copy(controls.target);
  fill.intensity = 0.08 + 0.85 * day;
  fill.color.copy(FILL_NIGHT).lerp(FILL_DAY, day);

  hemi.color.copy(s.sky.hemiSky);
  hemi.groundColor.copy(s.sky.hemiGround);
  hemi.intensity = s.sky.hemiI;
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  // the scene sits frozen and blurred behind the book, so skip rendering it while reading
  if (book.isOpen || gameWindow.isOpen) return;
  const t = clock.elapsedTime;
  const hours = currentHours();
  computeSky(hours, state);

  keyboardPan(dt);
  controls.update();
  updateHover();
  camera.updateMatrixWorld();

  applyLighting(state);
  sky.update(state, t, camera);
  room.setViewZoom(camera.zoom);
  room.update(state, dt, t);
  lampPost.update(state, t);
  wind.update(t);
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

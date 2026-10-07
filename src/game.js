// The game window: opens from the desk monitor over the room and runs
// The Little Lamplighter (./games/lamplighter.js).

import { createLamplighter } from './games/lamplighter.js';
import { createSound } from './games/sound.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = window.matchMedia('(pointer: coarse)').matches;

export function createGameOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'game-overlay' + (touch ? ' touch' : '');
  overlay.hidden = true;
  overlay.tabIndex = -1;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'The Little Lamplighter');
  overlay.innerHTML = `
    <div class="game-backdrop"></div>
    <div class="game-stage">
      <div class="game-monitor">
        <div class="game-screen"><canvas class="game-canvas" aria-label="Game screen"></canvas></div>
        <div class="game-chin"><span class="game-led"></span></div>
      </div>
      <div class="game-pad" aria-hidden="${touch ? 'false' : 'true'}">
        <button class="pad-btn" data-key="left" type="button" aria-label="Walk left">◀</button>
        <button class="pad-btn" data-key="right" type="button" aria-label="Walk right">▶</button>
        <button class="pad-btn pad-action" data-key="action" type="button" aria-label="Talk, light or hop"><svg viewBox="0 0 7 7" width="28" height="28" shape-rendering="crispEdges" aria-hidden="true"><path d="M3 0h1v2h3v1h-1v1h-1v1h1v2h-1v-1h-1v-1h-1v1h-1v1h-1v-2h1v-1h-1v-1h-1v-1h3z" fill="currentColor"/></svg></button>
      </div>
      <p class="game-note">← → walk · space talk, light, hop · esc to leave</p>
    </div>
    <button class="game-mute" type="button" aria-label="Mute sound" aria-pressed="false">
      <svg class="on" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10H4z" fill="currentColor"/><path d="M16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      <svg class="off" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
    </button>
    <button class="game-close" type="button" aria-label="Close the game">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </button>`;
  document.body.appendChild(overlay);
  const stage = overlay.querySelector('.game-stage');
  const monitor = overlay.querySelector('.game-monitor');
  const backdrop = overlay.querySelector('.game-backdrop');
  const screen = overlay.querySelector('.game-screen');
  const canvas = overlay.querySelector('.game-canvas');
  const closeBtn = overlay.querySelector('.game-close');
  const muteBtn = overlay.querySelector('.game-mute');
  const sound = createSound();
  const onEvent = (name, data) => {
    const fx = sound.sfx;
    switch (name) {
      case 'ignite': fx.ignite(); sound.music('finale', { immediate: true }); break;
      case 'title': sound.music('calm'); break;
      case 'hold': fx.hold(data); break;
      default: fx[name]?.(data);
    }
  };
  const game = createLamplighter(canvas, { onEvent });
  const reflectMute = () => {
    overlay.classList.toggle('muted', sound.muted);
    muteBtn.setAttribute('aria-pressed', String(sound.muted));
    muteBtn.setAttribute('aria-label', sound.muted ? 'Turn sound on' : 'Mute sound');
  };
  reflectMute();
  muteBtn.addEventListener('click', () => { sound.setMuted(!sound.muted); reflectMute(); });

  let isOpen = false;
  let busy = false;
  let pendingClose = false;
  let raf = 0;
  let last = 0;
  let origin = { x: innerWidth / 2, y: innerHeight / 2 };
  let lastFocus = null;

  const fit = () => game.resize(screen.clientWidth * Math.min(window.devicePixelRatio || 1, 2));
  const loop = (now) => {
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    game.step(dt);
    sound.setMood(game.state.glow);
    raf = requestAnimationFrame(loop);
  };
  const anim = (el, frames, ms, easing) =>
    el.animate(frames, { duration: reduceMotion ? 1 : ms, easing, fill: 'forwards' }).finished.catch(() => {});
  function fromOrigin() {
    const r = monitor.getBoundingClientRect();
    return { dx: origin.x - (r.left + r.width / 2), dy: origin.y - (r.top + r.height / 2) };
  }

  async function open(at) {
    if (isOpen || busy) return;
    busy = true;
    isOpen = true;
    if (at) origin = at;
    lastFocus = document.activeElement;
    overlay.hidden = false;
    fit();
    sound.resume();
    const st = game.state;
    sound.music(st.planet?.phase === 'ending' || st.scene === 'credits' ? 'finale' : 'calm');
    last = 0;
    raf = requestAnimationFrame(loop);
    const { dx, dy } = fromOrigin();
    anim(backdrop, [{ opacity: 0 }, { opacity: 1 }], 380, 'ease-out');
    await anim(stage, [
      { transform: `translate(${dx}px, ${dy}px) scale(0.08)`, opacity: 0 },
      { transform: `translate(${dx * 0.2}px, ${dy * 0.2}px) scale(0.85)`, opacity: 1, offset: 0.6 },
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    ], 620, 'cubic-bezier(.2,.75,.25,1)');
    overlay.classList.add('ready');
    overlay.focus({ preventScroll: true });
    busy = false;
    if (pendingClose) { pendingClose = false; close(); }
  }

  async function close() {
    if (!isOpen) return;
    if (busy) { pendingClose = true; return; }
    busy = true;
    game.clearInput();
    sound.stopMusic();
    overlay.classList.remove('ready');
    const { dx, dy } = fromOrigin();
    anim(backdrop, [{ opacity: 1 }, { opacity: 0 }], 380, 'ease-in');
    await anim(stage, [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.08)`, opacity: 0 },
    ], 460, 'cubic-bezier(.55,0,.75,.3)');
    cancelAnimationFrame(raf);
    overlay.hidden = true;
    isOpen = false;
    busy = false;
    lastFocus?.focus?.({ preventScroll: true });
  }

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  window.addEventListener('resize', () => { if (isOpen) fit(); });

  // tapping the screen is the action button
  screen.addEventListener('pointerdown', (e) => { e.preventDefault(); game.setInput('action', true); });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) screen.addEventListener(t, () => game.setInput('action', false));
  // on-screen pad for touch screens
  overlay.querySelectorAll('.pad-btn').forEach((b) => {
    const key = b.dataset.key;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); game.setInput(key, true); });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, () => game.setInput(key, false));
  });

  // keyboard, in the capture phase so scene shortcuts (WASD, R) stay quiet while playing
  const keyMap = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Space: 'action', Enter: 'action', ArrowUp: 'action', KeyW: 'action', KeyE: 'action',
  };
  window.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    e.stopPropagation();
    if (e.key === 'Escape') { close(); return; }
    const k = keyMap[e.code];
    if (k) { e.preventDefault(); if (!e.repeat) game.setInput(k, true); }
  }, true);
  window.addEventListener('keyup', (e) => {
    if (!isOpen) return;
    const k = keyMap[e.code];
    if (k) game.setInput(k, false);
  }, true);
  window.addEventListener('blur', () => game.clearInput());

  return {
    open,
    close,
    game,
    get isOpen() { return isOpen; },
  };
}

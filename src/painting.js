// The painting corner: click the easel and its canvas opens over the room.
// Five tools, each its own small Canvas 2D brush:
//   pen         smoothed ink whose width follows pressure (or speed, with a mouse)
//   pencil      graphite specks caught by the paper's tooth
//   oil         a bristle brush: streaky, opaque, runs dry, smears what is underneath,
//               with light and shadow along the ridges
//   watercolor  a transparent wash that pools dark at its edges, settles into the
//               paper's grain and glazes over what is already there
//   eraser      lifts paint back to bare paper
// Layers: the paper (never erased), the paint, and a wet layer for the stroke in
// progress. The painting is saved in IndexedDB and shown on the easel in the room.

import { CANVAS_ASPECT } from './easel.js';

const W = 1000;
const H = Math.round(W / CANVAS_ASPECT);
const UNDO_LIMIT = 12;
const STREAMLINE = 0.45; // how much the pointer is smoothed before the brush follows it
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas2d = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Paper: tileable noise for the cold-press grain, plus masks the brushes use.

function tileNoise(size, octaves, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = new Float32Array(size * size);
  for (const [f, weight] of octaves) {
    const lat = Float32Array.from({ length: f * f }, rnd);
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * f, y0 = Math.floor(fy), ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % f) * f, r1 = ((y0 + 1) % f) * f;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * f, x0 = Math.floor(fx), tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % f, c1 = (x0 + 1) % f;
        const top = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * sx;
        const bot = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * sx;
        out[y * size + x] += (top + (bot - top) * sy) * weight;
      }
    }
  }
  let lo = Infinity, hi = -Infinity;
  for (const v of out) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
  return out;
}

/** A tile whose pixels come from fn(value, index) => [r, g, b, a] (0..255). */
function tileFrom(size, values, fn) {
  const c = canvas2d(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < values.length; i++) img.data.set(fn(values[i], i), i * 4);
  ctx.putImageData(img, 0, 0);
  return c;
}

function makePaper() {
  const T = 256;
  let s = 99;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const grain = tileNoise(T, [[8, 0.2], [16, 0.25], [32, 0.3], [64, 0.25]], 11);
  // a little fibre noise on top of the tooth
  const tooth = grain.map((g) => clamp(g * 0.85 + rnd() * 0.15, 0, 1));
  const blooms = tileNoise(T, [[2, 0.55], [4, 0.3], [8, 0.15]], 23);

  const paperTile = tileFrom(T, tooth, (g) => {
    const k = 0.95 + 0.07 * g;
    return [Math.min(255, 248 * k), Math.min(255, 244 * k), Math.min(255, 234 * k), 255];
  });
  // graphite catches only the peaks of the tooth
  const toothMask = tileFrom(T, tooth, (g) => [0, 0, 0, 255 * Math.pow(smooth(0.22, 0.85, g), 1.3)]);

  const paper = canvas2d(W, H);
  const pctx = paper.getContext('2d');
  pctx.fillStyle = pctx.createPattern(paperTile, 'repeat');
  pctx.fillRect(0, 0, W, H);
  // the faintest vignette, as light falls across a real sheet
  const v = pctx.createRadialGradient(W / 2, H * 0.45, W * 0.3, W / 2, H / 2, W * 0.85);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(90,70,40,0.07)');
  pctx.fillStyle = v;
  pctx.fillRect(0, 0, W, H);
  // tooth and blooms (large, soft patches) also drive the watercolor's drying
  return { paper, toothMask, tooth, blooms, T };
}

// ---------------------------------------------------------------------------
// Colour helpers

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbStr = ([r, g, b]) => `rgb(${r | 0},${g | 0},${b | 0})`;
const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/**
 * Mix two paints the way pigments do, roughly: a weighted geometric mean of
 * their reflectance in linear light. Yellow into blue gives green rather than
 * the grey a plain RGB average makes. (Mixbox does this properly, but its
 * licence is non-commercial.)
 */
const toLin = (c) => Math.pow(Math.max(c, 1) / 255, 2.2);
const toSrgb = (l) => 255 * Math.pow(l, 1 / 2.2);
const mixPaint = (a, b, t) => [0, 1, 2].map((i) => toSrgb(Math.exp(Math.log(toLin(a[i])) * (1 - t) + Math.log(toLin(b[i])) * t)));
/** Nudge lightness (and a hair of hue) so bristles carry slightly different paint. */
function jitterRgb(rgb, amount, rnd) {
  const l = (rnd() - 0.5) * amount;
  const toward = l > 0 ? [255, 250, 240] : [20, 14, 10];
  const c = mixRgb(rgb, toward, Math.abs(l));
  const h = (rnd() - 0.5) * amount * 40;
  return [clamp(c[0] + h, 0, 255), clamp(c[1] - h * 0.3, 0, 255), clamp(c[2] - h * 0.6, 0, 255)];
}

// ---------------------------------------------------------------------------
// Shape helpers

/** A tapered segment: a quad between two circles, then the end cap. */
function capsule(ctx, a, ra, b, rb) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d > 0.01) {
    const nx = -dy / d, ny = dx / d;
    ctx.beginPath();
    ctx.moveTo(a.x + nx * ra, a.y + ny * ra);
    ctx.lineTo(b.x + nx * rb, b.y + ny * rb);
    ctx.lineTo(b.x - nx * rb, b.y - ny * rb);
    ctx.lineTo(a.x - nx * ra, a.y - ny * ra);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(b.x, b.y, rb, 0, Math.PI * 2);
  ctx.fill();
}

const box = () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
function grow(bb, x, y, r) {
  bb.x0 = Math.min(bb.x0, x - r); bb.y0 = Math.min(bb.y0, y - r);
  bb.x1 = Math.max(bb.x1, x + r); bb.y1 = Math.max(bb.y1, y + r);
}
/** Integer rect clipped to the canvas, or null if empty. */
function rectOf(bb, pad = 0) {
  const x = Math.max(0, Math.floor(bb.x0 - pad)), y = Math.max(0, Math.floor(bb.y0 - pad));
  const x1 = Math.min(W, Math.ceil(bb.x1 + pad)), y1 = Math.min(H, Math.ceil(bb.y1 + pad));
  return x1 > x && y1 > y ? { x, y, w: x1 - x, h: y1 - y } : null;
}

// ---------------------------------------------------------------------------
// Tools

const TOOLS = {
  pen: { label: 'Pen', key: '1', size: 22, radius: (s) => 0.6 + s * 0.12, spacing: () => 1.5 },
  pencil: { label: 'Pencil', key: '2', size: 30, radius: (s) => 0.9 + s * 0.06, spacing: () => 1.2 },
  oil: { label: 'Oil', key: '3', size: 45, radius: (s) => 3 + s * 0.55, spacing: (r) => Math.max(2, r * 0.1) },
  watercolor: { label: 'Watercolor', key: '4', size: 50, radius: (s) => 3 + s * 0.6, spacing: () => 2 },
  eraser: { label: 'Eraser', key: '5', size: 40, radius: (s) => 2 + s * 0.5, spacing: () => 2 },
};

const PALETTE = [
  '#1f1c1a', '#f7f3ea', '#c8372d', '#e8742a', '#f2c230', '#c9a46a', '#8a5a36',
  '#7fae3e', '#2f6b4f', '#5fb3c9', '#3a6fb0', '#243a73', '#7b4a9e', '#e88aa6',
];

const ICONS = {
  pen: '<path d="M12 3c3 4 6 7 6 10l-6 8-6-8c0-3 3-6 6-10z"/><path d="M12 13v8"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  pencil: '<path d="M4 20l1.2-4.6L16 4.6a1.9 1.9 0 0 1 2.7 0l.7.7a1.9 1.9 0 0 1 0 2.7L8.6 18.8z"/><path d="M14 6.6l3.4 3.4"/><path d="M5.2 15.4l3.4 3.4"/>',
  oil: '<path d="M13 3.5l7.5 7.5-3.5 2.5-6.5-6.5z"/><path d="M10.5 7l6.5 6.5-2.5 1-5-5z"/><path d="M12 12L4.6 19.4a1.4 1.4 0 0 0 2 2L14 14"/>',
  watercolor: '<path d="M8 3c2.5 3.5 4 5.8 4 7.6a4 4 0 0 1-8 0C4 8.8 5.5 6.5 8 3z"/><path d="M15 15l5.5-5.5"/><path d="M15 14.6c-1.6-.4-3.2.5-3.4 2.4-.2 1.6-.9 2.5-1.8 3.1 2.8.6 6.1-.2 6.7-2.8.3-1.2-.2-2.3-1.5-2.7z"/>',
  eraser: '<path d="M9 20h11"/><path d="M4.6 15.4l9.9-9.9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H8.2z"/><path d="M9.5 10.5l5 5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  clear: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  download: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};
const icon = (name, size = 20) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

// ---------------------------------------------------------------------------
// Saved painting (IndexedDB: a PNG is too big for localStorage)

const DB_NAME = 'cozy-room';
const STORE = 'kv';
let dbPromise = null;
/** One connection, opened on first use and shared by every read and write. */
function openDb() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}
async function dbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------

/** onChange(canvas) is called with the finished picture (paper and paint) whenever the easel should update. */
export function createPainting({ onChange = () => {} } = {}) {
  const { paper, toothMask, tooth, blooms, T: TILE } = makePaper();
  const paint = canvas2d(W, H);
  const pctx = paint.getContext('2d');
  const wet = canvas2d(W, H);
  const wctx = wet.getContext('2d');
  const patterns = {
    tooth: wctx.createPattern(toothMask, 'repeat'),
  };
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // ---- DOM
  const overlay = document.createElement('div');
  overlay.className = 'paint-overlay';
  overlay.hidden = true;
  overlay.tabIndex = -1;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Painting corner');
  overlay.innerHTML = `
    <div class="paint-backdrop"></div>
    <div class="paint-stage">
      <div class="paint-board">
        <canvas class="paint-canvas" width="${W}" height="${H}" aria-label="Canvas"></canvas>
        <div class="paint-cursor" aria-hidden="true"></div>
      </div>
      <div class="paint-panel">
        <div class="paint-tools" role="radiogroup" aria-label="Tools">
          ${Object.entries(TOOLS).map(([id, t]) => `
            <button type="button" class="paint-tool" data-tool="${id}" role="radio" aria-checked="false" title="${t.label} (${t.key})">
              ${icon(id, 22)}<span>${t.label}</span>
            </button>`).join('')}
        </div>
        <div class="paint-swatches" role="radiogroup" aria-label="Colours">
          ${PALETTE.map((c) => `<button type="button" class="paint-swatch" data-color="${c}" style="--c:${c}" role="radio" aria-checked="false" aria-label="Colour ${c}"></button>`).join('')}
          <label class="paint-swatch paint-custom" title="Pick any colour"><input type="color" value="#5a8a6a" aria-label="Custom colour"></label>
        </div>
        <label class="paint-size">
          <span class="paint-size-label">Size</span>
          <input type="range" min="1" max="100" value="22" aria-label="Brush size">
          <span class="paint-size-dot" aria-hidden="true"><i></i></span>
        </label>
        <div class="paint-actions">
          <button type="button" class="paint-btn" data-act="undo" title="Undo (⌘Z)" aria-label="Undo">${icon('undo', 18)}</button>
          <button type="button" class="paint-btn" data-act="redo" title="Redo (⇧⌘Z)" aria-label="Redo">${icon('redo', 18)}</button>
          <button type="button" class="paint-btn" data-act="clear" title="Clear the canvas" aria-label="Clear the canvas">${icon('clear', 18)}</button>
        </div>
        <div class="paint-export">
          <button type="button" class="paint-btn wide" data-act="png" title="Save as PNG">${icon('download', 16)}<span>PNG</span></button>
          <button type="button" class="paint-btn wide" data-act="jpg" title="Save as JPG">${icon('download', 16)}<span>JPG</span></button>
        </div>
      </div>
    </div>
    <button class="paint-close" type="button" aria-label="Close the canvas">${icon('close', 18)}</button>`;
  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const stage = $('.paint-stage');
  const backdrop = $('.paint-backdrop');
  const board = $('.paint-board');
  const view = $('.paint-canvas');
  const vctx = view.getContext('2d');
  const cursor = $('.paint-cursor');
  const sizeInput = $('.paint-size input');
  const sizeDot = $('.paint-size-dot i');
  const customInput = $('.paint-custom input');

  // ---- state
  let tool = 'pen';
  let color = PALETTE[0];
  const sizes = Object.fromEntries(Object.entries(TOOLS).map(([id, t]) => [id, t.size]));
  const undoStack = [];
  const redoStack = [];
  let stroke = null;
  let wetShowing = false;
  let dirty = true;
  let raf = 0;

  const radius = () => TOOLS[tool].radius(sizes[tool]);

  // ---- display
  function compose(ctx) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(paper, 0, 0);
    ctx.drawImage(paint, 0, 0);
  }
  function render() {
    dirty = false;
    compose(vctx);
    if (wetShowing) {
      // a wash in progress, before it dries and its edges darken
      vctx.globalCompositeOperation = 'multiply';
      vctx.globalAlpha = 0.34;
      vctx.drawImage(wet, 0, 0);
      vctx.globalCompositeOperation = 'source-over';
      vctx.globalAlpha = 1;
    }
  }
  function invalidate() {
    dirty = true;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (dirty) render(); });
  }

  // ---- undo
  function snapshot() {
    const c = canvas2d(W, H);
    c.getContext('2d').drawImage(paint, 0, 0);
    return c;
  }
  function restore(c) {
    pctx.globalCompositeOperation = 'source-over';
    pctx.globalAlpha = 1;
    pctx.clearRect(0, 0, W, H);
    pctx.drawImage(c, 0, 0);
  }
  function pushUndo() {
    undoStack.push(snapshot());
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
    reflectHistory();
  }
  function undo() {
    if (stroke || !undoStack.length) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
    changed();
  }
  function redo() {
    if (stroke || !redoStack.length) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
    changed();
  }
  function clearAll() {
    if (stroke) return;
    pushUndo();
    pctx.clearRect(0, 0, W, H);
    changed();
  }
  function reflectHistory() {
    $('[data-act="undo"]').disabled = !undoStack.length;
    $('[data-act="redo"]').disabled = !redoStack.length;
  }

  // ---- saving
  let saveTimer = 0;
  function changed() {
    reflectHistory();
    invalidate();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 800);
  }
  function save() {
    clearTimeout(saveTimer);
    paint.toBlob((blob) => { if (blob) dbSet('painting', blob).catch(() => {}); }, 'image/png');
  }
  async function load() {
    try {
      const blob = await dbGet('painting');
      if (!blob) return;
      const bmp = await createImageBitmap(blob);
      pctx.drawImage(bmp, 0, 0, W, H);
      render();
      onChange(view);
    } catch { /* storage unavailable: start with a fresh canvas */ }
  }

  // ---- export
  function exportImage(kind) {
    const out = canvas2d(W, H);
    compose(out.getContext('2d'));
    const type = kind === 'jpg' ? 'image/jpeg' : 'image/png';
    out.toBlob((blob) => {
      if (!blob) return;
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const name = `cozy-room-painting-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${kind}`;
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, type, 0.92);
  }

  // -------------------------------------------------------------------------
  // Brushes. Each gets begin(p), step(a, b) for every small step along the
  // smoothed path, flush() once per pointer event, and end().

  const brushes = {
    pen: {
      begin(p) {
        pctx.fillStyle = color;
        pctx.globalAlpha = 1;
        pctx.globalCompositeOperation = 'source-over';
        const r = radius() * (0.3 + 0.9 * p.p);
        capsule(pctx, p, r, p, r);
      },
      step(a, b) {
        const R = radius();
        capsule(pctx, a, R * (0.3 + 0.9 * a.p), b, R * (0.3 + 0.9 * b.p));
      },
    },

    eraser: {
      begin(p) {
        pctx.globalCompositeOperation = 'destination-out';
        pctx.globalAlpha = 1;
        pctx.fillStyle = '#000';
        const r = radius() * (0.6 + 0.4 * p.p);
        capsule(pctx, p, r, p, r);
      },
      step(a, b) {
        const R = radius();
        capsule(pctx, a, R * (0.6 + 0.4 * a.p), b, R * (0.6 + 0.4 * b.p));
      },
      end() { pctx.globalCompositeOperation = 'source-over'; },
    },

    pencil: {
      bb: box(),
      begin(p) {
        this.bb = box();
        wctx.globalCompositeOperation = 'source-over';
        wctx.fillStyle = color;
        this.step(p, p);
      },
      step(a, b) {
        // graphite specks scattered over the lead's footprint
        const r = radius() * (0.75 + 0.4 * b.p);
        const n = clamp(Math.round(3 + r * r * 1.2), 3, 50);
        wctx.globalAlpha = 0.18 + 0.55 * b.p;
        for (let i = 0; i < n; i++) {
          const t = rnd();
          const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
          const ang = rnd() * Math.PI * 2, rr = r * Math.sqrt(rnd());
          const s = 0.8 + rnd() * 1.1;
          wctx.fillRect(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr, s, s);
        }
        grow(this.bb, b.x, b.y, r + 2);
        grow(this.bb, a.x, a.y, r + 2);
      },
      flush() {
        const rc = rectOf(this.bb);
        this.bb = box();
        if (!rc) return;
        // only the peaks of the paper take the graphite
        wctx.save();
        wctx.beginPath();
        wctx.rect(rc.x, rc.y, rc.w, rc.h);
        wctx.clip();
        wctx.globalCompositeOperation = 'destination-in';
        wctx.globalAlpha = 1;
        wctx.fillStyle = patterns.tooth;
        wctx.fillRect(rc.x, rc.y, rc.w, rc.h);
        wctx.restore();
        pctx.globalCompositeOperation = 'source-over';
        pctx.globalAlpha = 1;
        pctx.drawImage(wet, rc.x, rc.y, rc.w, rc.h, rc.x, rc.y, rc.w, rc.h);
        wctx.clearRect(rc.x, rc.y, rc.w, rc.h);
        wctx.fillStyle = color;
      },
    },

    watercolor: {
      bb: box(),
      begin(p) {
        this.bb = box();
        wctx.globalCompositeOperation = 'source-over';
        wctx.globalAlpha = 1;
        wctx.fillStyle = color;
        wetShowing = true;
        const r = radius() * (0.55 + 0.6 * p.p);
        capsule(wctx, p, r, p, r);
        grow(this.bb, p.x, p.y, r);
      },
      step(a, b) {
        // the whole stroke goes down at full strength here, so it never darkens where
        // it crosses itself; it only becomes a translucent wash when it dries
        const R = radius();
        const rb = R * (0.55 + 0.6 * b.p);
        capsule(wctx, a, R * (0.55 + 0.6 * a.p), b, rb);
        grow(this.bb, b.x, b.y, rb);
      },
      end() {
        wetShowing = false;
        const rc = rectOf(this.bb, radius() * 0.3 + 14);
        if (rc) dryWash(rc);
        wctx.clearRect(0, 0, W, H);
      },
    },

    oil: {
      begin(p) {
        this.p0 = p;
        this.bristles = null;
        this.dir = null;
        this.lastPerp = null;
        this.travel = 0;
      },
      /** Load the brush once its direction is known. */
      load(at, perp, R) {
        const base = hexToRgb(color);
        const n = clamp(Math.round(R * 1.4), 6, 44);
        const under = this.sample(at, perp, R, n);
        this.bristles = Array.from({ length: n }, (_, i) => {
          let rgb = jitterRgb(base, 0.16, rnd);
          if (rnd() < 0.12) rgb = jitterRgb(rgb, 0.35, rnd); // a streak of less-mixed paint
          // paint already on the canvas gets dragged into the new stroke
          if (under[i]) rgb = mixPaint(rgb, under[i], 0.2);
          const off = ((i + 0.5) / n) * 2 - 1 + (rnd() - 0.5) * (1.2 / n);
          const edge = smooth(0.7, 1, Math.abs(off)); // the outer bristles hold less and run dry first
          return {
            off,
            edge,
            w: ((2 * R) / n) * (1.25 + rnd() * 0.9),
            rgb,
            load: (0.85 + rnd() * 0.3) * (1 - 0.3 * edge),
            reach: (1000 + rnd() * 1000) * (1 - 0.45 * edge), // px of travel a full load lasts
            sparse: rnd() < 0.1,        // a few bristles carry little paint
            ridge: rnd() < 0.3,         // and some catch the light along their ridge
            pickup: 0.4 + rnd(),        // how readily it drags in paint from the canvas
            phase: rnd() * Math.PI * 2,
            freq: 0.006 + rnd() * 0.014,
            t: 0,
            last: null,
          };
        });
      },
      /** Colours under each bristle at a point `ahead` along the stroke (null where bare). */
      sample(at, perp, R, n) {
        const x0 = Math.floor(at.x - R - 2), y0 = Math.floor(at.y - R - 2), s = Math.ceil(R * 2 + 4);
        const sx = clamp(x0, 0, W - 1), sy = clamp(y0, 0, H - 1);
        const sw = clamp(x0 + s, 1, W) - sx, sh = clamp(y0 + s, 1, H) - sy;
        if (sw <= 0 || sh <= 0) return [];
        const data = pctx.getImageData(sx, sy, sw, sh).data;
        const out = [];
        for (let i = 0; i < n; i++) {
          const off = ((i + 0.5) / n) * 2 - 1;
          const px = Math.round(at.x + perp.x * off * R * 0.9) - sx;
          const py = Math.round(at.y + perp.y * off * R * 0.9) - sy;
          if (px < 0 || py < 0 || px >= sw || py >= sh) { out.push(null); continue; }
          const k = (py * sw + px) * 4;
          out.push(data[k + 3] > 60 ? [data[k], data[k + 1], data[k + 2]] : null);
        }
        return out;
      },
      step(a, b) {
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d < 0.01) return;
        // the brush turns smoothly rather than snapping to every wobble
        if (!this.dir) this.dir = { x: dx / d, y: dy / d };
        else {
          const nx = this.dir.x * 0.7 + (dx / d) * 0.3, ny = this.dir.y * 0.7 + (dy / d) * 0.3;
          const nl = Math.hypot(nx, ny) || 1;
          this.dir = { x: nx / nl, y: ny / nl };
        }
        const perp = { x: -this.dir.y, y: this.dir.x };
        const R = radius();
        const Rp = R * (0.65 + 0.45 * b.p);
        if (!this.bristles) this.load(this.p0, perp, R);
        // every so often, pick up a little of whatever the brush is pushing into
        this.travel += d;
        if (this.travel > 26) {
          this.travel = 0;
          const ahead = { x: b.x + this.dir.x * Rp * 0.9, y: b.y + this.dir.y * Rp * 0.9 };
          const under = this.sample(ahead, perp, Rp, this.bristles.length);
          this.bristles.forEach((br, i) => {
            if (under[i]) br.rgb = mixPaint(br.rgb, under[i], br.pickup * (0.04 + 0.14 * (1 - clamp(br.load, 0, 1))));
          });
        }
        const ctx = pctx;
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineCap = 'round';
        // body: a soft underlayer of the mixed colour so the bristle streaks sit in paint, not on bare paper
        let avg = 0;
        for (const br of this.bristles) avg += clamp(br.load, 0, 1);
        avg /= this.bristles.length;
        if (avg > 0.25) {
          // a flat brush leaves a square-ended band, so this is a quad across the brush, not a capsule
          const mid = [0, 1, 2].map((c) => this.bristles.reduce((m, br) => m + br.rgb[c], 0) / this.bristles.length);
          const k = Rp * 0.82;
          const pa = this.lastPerp || perp;
          ctx.globalAlpha = 0.6 * Math.min(1, avg * 1.2);
          ctx.fillStyle = rgbStr(mid);
          ctx.beginPath();
          ctx.moveTo(a.x + pa.x * k, a.y + pa.y * k);
          ctx.lineTo(b.x + perp.x * k, b.y + perp.y * k);
          ctx.lineTo(b.x - perp.x * k, b.y - perp.y * k);
          ctx.lineTo(a.x - pa.x * k, a.y - pa.y * k);
          ctx.closePath();
          ctx.fill();
        }
        this.lastPerp = perp;
        const press = 0.75 + 0.4 * b.p;
        for (const br of this.bristles) {
          br.t += d;
          // bristles splay and drift a little as the brush moves, so the edges are never ruled lines
          const wave = Math.sin(br.t * br.freq + br.phase);
          const off = br.off + wave * 0.035 * (1 + br.edge);
          const to = { x: b.x + perp.x * off * Rp, y: b.y + perp.y * off * Rp };
          const from = br.last || to;
          br.last = to;
          br.load -= d / br.reach;
          const L = br.load;
          if (L <= 0.02) continue;
          if (L < 0.4 && rnd() > L / 0.4) continue; // running dry: the stroke breaks into dry-brush streaks
          const ragged = 1 - 0.6 * br.edge * (0.5 + 0.5 * Math.sin(br.t * br.freq * 2.3 + br.phase * 1.7));
          const alpha = Math.min(1, L * 1.6) * (br.sparse ? 0.35 : 1) * ragged;
          const lw = br.w * press;
          // the paint on each bristle is not perfectly even along the stroke either
          const shade = 1 + 0.07 * Math.sin(br.t * br.freq * 1.7 + br.phase * 2);
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = rgbStr(br.rgb.map((c) => clamp(c * shade, 0, 255)));
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
          // impasto: the light comes from the upper left, so ridges get a highlight
          // on that side and a shadow on the other
          const o = Math.max(0.6, lw * 0.3);
          ctx.lineWidth = Math.max(0.6, lw * 0.28);
          // ridges come and go along the stroke, where the paint happens to be heaped up
          const heap = Math.sin(br.t * 0.045 + br.phase * 3);
          if (br.ridge && heap > 0.15) {
            ctx.globalAlpha = 0.22 * alpha * (heap - 0.15);
            ctx.strokeStyle = '#fffaf0';
            ctx.beginPath();
            ctx.moveTo(from.x - o, from.y - o);
            ctx.lineTo(to.x - o, to.y - o);
            ctx.stroke();
          } else if (!br.ridge && heap < -0.3) {
            ctx.globalAlpha = 0.2 * alpha * (-heap - 0.3);
            ctx.strokeStyle = '#2a1e14';
            ctx.beginPath();
            ctx.moveTo(from.x + o, from.y + o);
            ctx.lineTo(to.x + o, to.y + o);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      },
      end() {
        // a tap with no drag still leaves a dab of paint
        if (!this.bristles && this.p0) {
          const r = radius() * 0.6;
          pctx.globalAlpha = 0.9;
          pctx.fillStyle = color;
          capsule(pctx, this.p0, r, this.p0, r);
          pctx.globalAlpha = 1;
        }
      },
    },
  };

  /**
   * Let a watercolor stroke dry. Per pixel, over the stroke's bounding box:
   *  - the edge is where a softened copy of the stroke crosses a threshold that
   *    wanders with low-frequency noise, so the wash creeps unevenly into the paper
   *  - pigment pools just inside that edge, giving the darker rim of a dried wash
   *  - density drifts in soft blooms across the wash
   *  - granulation: pigment settles in the paper's hollows and thins on its peaks
   * The result is glazed onto the paint (multiply), as transparent layers are.
   */
  const canFilter = 'filter' in vctx;
  function dryWash({ x, y, w, h }) {
    const rgb = hexToRgb(color);
    const soft = canvas2d(w, h);
    const sctx = soft.getContext('2d', { willReadFrequently: true });
    if (canFilter) sctx.filter = `blur(${clamp(radius() * 0.15, 3, 9).toFixed(1)}px)`;
    sctx.drawImage(wet, x, y, w, h, 0, 0, w, h);
    const img = sctx.getImageData(0, 0, w, h);
    const d = img.data;
    // each stroke gets its own bloom pattern, but the grain belongs to the sheet
    const bx = Math.floor(rnd() * TILE), by = Math.floor(rnd() * TILE);
    const strength = 0.24 + 0.08 * rnd();
    for (let j = 0; j < h; j++) {
      const ty = ((y + j) % TILE) * TILE;
      const byy = ((y + j + by) % TILE) * TILE;
      for (let i = 0; i < w; i++) {
        const k = (j * w + i) * 4;
        const a = d[k + 3] / 255;
        if (a < 0.01) { d[k + 3] = 0; continue; }
        const g = tooth[ty + ((x + i) % TILE)];
        const bl = blooms[byy + ((x + i + bx) % TILE)];
        const edgeAt = 0.5 + (bl - 0.5) * 0.45 + (g - 0.5) * 0.12;
        const cover = smooth(edgeAt - 0.06, edgeAt + 0.04, a);
        if (cover <= 0) { d[k + 3] = 0; continue; }
        const rim = 1 - smooth(edgeAt + 0.02, edgeAt + 0.32, a);
        const density = strength * (0.75 + 0.5 * bl) * (1 + 1.1 * rim) * (1 - 0.45 * g);
        d[k] = rgb[0];
        d[k + 1] = rgb[1];
        d[k + 2] = rgb[2];
        d[k + 3] = 255 * clamp(cover * density, 0, 1);
      }
    }
    sctx.filter = 'none';
    sctx.putImageData(img, 0, 0);
    pctx.save();
    pctx.globalCompositeOperation = 'multiply';
    pctx.globalAlpha = 1;
    pctx.drawImage(soft, x, y);
    pctx.restore();
  }

  // -------------------------------------------------------------------------
  // Pointer input: smoothing, simulated pressure for mice and fingers, and
  // resampling the path into small steps along gentle curves.

  function toCanvas(e) {
    const r = view.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  function pressureOf(e, st, raw) {
    if (e.pointerType === 'pen' && e.pressure > 0) return e.pressure;
    // no real pressure: slow strokes press harder, quick flicks lift off
    if (!st) return 0.6;
    const dt = Math.max(1, e.timeStamp - st.lastTime);
    const v = Math.hypot(raw.x - st.raw.x, raw.y - st.raw.y) / dt; // canvas px per ms
    const target = clamp(1.05 - v * 0.28, 0.3, 1);
    st.sim += (target - st.sim) * 0.2;
    return st.sim;
  }

  function stepAlong(from, to, ctrl) {
    const brush = brushes[tool];
    const spacing = TOOLS[tool].spacing(radius());
    const len = ctrl ? Math.hypot(ctrl.x - from.x, ctrl.y - from.y) + Math.hypot(to.x - ctrl.x, to.y - ctrl.y) : Math.hypot(to.x - from.x, to.y - from.y);
    const n = Math.max(1, Math.ceil(len / spacing));
    let prev = stroke.last;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      let x, y;
      if (ctrl) {
        const u = 1 - t;
        x = u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x;
        y = u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y;
      } else {
        x = from.x + (to.x - from.x) * t;
        y = from.y + (to.y - from.y) * t;
      }
      const pt = { x, y, p: from.p + (to.p - from.p) * t };
      brush.step(prev, pt);
      prev = pt;
    }
    stroke.last = prev;
  }

  function addPoint(e) {
    const raw = toCanvas(e);
    const st = stroke;
    const p = pressureOf(e, st, raw);
    st.raw = raw;
    st.lastTime = e.timeStamp;
    const s = st.smooth;
    s.x += (raw.x - s.x) * (1 - STREAMLINE);
    s.y += (raw.y - s.y) * (1 - STREAMLINE);
    s.p += (p - s.p) * 0.5;
    const c = { x: s.x, y: s.y, p: s.p };
    // a quadratic through the previous point, from midpoint to midpoint
    const m1 = { x: (st.b.x + c.x) / 2, y: (st.b.y + c.y) / 2, p: (st.b.p + c.p) / 2 };
    stepAlong(st.m, m1, st.b);
    st.m = m1;
    st.b = c;
  }

  function begin(e) {
    const at = toCanvas(e);
    const p0 = pressureOf(e, null, at);
    const pt = { x: at.x, y: at.y, p: p0 };
    stroke = {
      id: e.pointerId,
      raw: at,
      lastTime: e.timeStamp,
      sim: 0.6,
      smooth: { ...pt },
      m: pt,
      b: pt,
      last: pt,
    };
    pushUndo();
    brushes[tool].begin(pt);
    brushes[tool].flush?.();
    invalidate();
  }

  function finish() {
    if (!stroke) return;
    // close the gap between the smoothed path and where the pointer actually lifted
    const end = { x: stroke.raw.x, y: stroke.raw.y, p: stroke.smooth.p };
    stepAlong(stroke.m, end, stroke.b);
    const brush = brushes[tool];
    brush.flush?.();
    brush.end?.();
    pctx.globalAlpha = 1;
    pctx.globalCompositeOperation = 'source-over';
    stroke = null;
    changed();
  }

  view.addEventListener('pointerdown', (e) => {
    if (stroke || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    try { view.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    begin(e);
  });
  view.addEventListener('pointermove', (e) => {
    moveCursor(e);
    if (!stroke || e.pointerId !== stroke.id) return;
    const events = e.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e]) addPoint(ev);
    brushes[tool].flush?.();
    invalidate();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    view.addEventListener(type, (e) => { if (stroke && e.pointerId === stroke.id) finish(); });
  }
  view.addEventListener('pointerleave', () => { cursor.style.opacity = '0'; });

  // a ring showing the brush size under a mouse or hovering pen
  function moveCursor(e) {
    if (e.pointerType === 'touch') { cursor.style.opacity = '0'; return; }
    const r = view.getBoundingClientRect();
    const b = board.getBoundingClientRect();
    const d = Math.max(4, ((radius() * 2) / W) * r.width);
    cursor.style.width = cursor.style.height = `${d}px`;
    cursor.style.transform = `translate(${e.clientX - b.left - d / 2}px, ${e.clientY - b.top - d / 2}px)`;
    cursor.style.opacity = '1';
  }

  // ---- controls
  function setTool(id) {
    tool = id;
    overlay.querySelectorAll('.paint-tool').forEach((b) => {
      const on = b.dataset.tool === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    });
    sizeInput.value = String(sizes[id]);
    reflectSize();
    overlay.dataset.tool = id;
  }
  function setColor(c) {
    color = c;
    let matched = false;
    overlay.querySelectorAll('.paint-swatch[data-color]').forEach((b) => {
      const on = b.dataset.color === c;
      matched ||= on;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    });
    $('.paint-custom').classList.toggle('active', !matched);
    if (!matched) $('.paint-custom').style.setProperty('--c', c);
    overlay.style.setProperty('--paint', c);
  }
  function reflectSize() {
    const px = clamp((radius() * 2 * 28) / 110, 3, 28); // a preview dot, roughly to scale
    sizeDot.style.width = sizeDot.style.height = `${px}px`;
  }
  overlay.querySelectorAll('.paint-tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  overlay.querySelectorAll('.paint-swatch[data-color]').forEach((b) => b.addEventListener('click', () => setColor(b.dataset.color)));
  customInput.addEventListener('input', () => setColor(customInput.value));
  sizeInput.addEventListener('input', () => { sizes[tool] = Number(sizeInput.value); reflectSize(); });
  const actions = { undo, redo, clear: clearAll, png: () => exportImage('png'), jpg: () => exportImage('jpg') };
  overlay.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => actions[b.dataset.act]()));
  setTool('pen');
  setColor(color);
  reflectHistory();

  // ---- open / close, growing out of the easel like the game window does from the monitor
  let isOpen = false;
  let busy = false;
  let origin = { x: innerWidth / 2, y: innerHeight / 2 };
  let lastFocus = null;
  const anim = (el, frames, ms, easing) =>
    el.animate(frames, { duration: reduceMotion ? 1 : ms, easing, fill: 'forwards' }).finished.catch(() => {});
  function fromOrigin() {
    const r = board.getBoundingClientRect();
    return { dx: origin.x - (r.left + r.width / 2), dy: origin.y - (r.top + r.height / 2) };
  }
  async function open(at) {
    if (isOpen || busy) return;
    busy = true;
    isOpen = true;
    if (at) origin = at;
    lastFocus = document.activeElement;
    overlay.hidden = false;
    render();
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
  }
  async function close() {
    if (!isOpen || busy) return;
    if (stroke) finish();
    busy = true;
    overlay.classList.remove('ready');
    render();
    onChange(view);
    save();
    const { dx, dy } = fromOrigin();
    anim(backdrop, [{ opacity: 1 }, { opacity: 0 }], 380, 'ease-in');
    await anim(stage, [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.08)`, opacity: 0 },
    ], 460, 'cubic-bezier(.55,0,.75,.3)');
    overlay.hidden = true;
    isOpen = false;
    busy = false;
    lastFocus?.focus?.({ preventScroll: true });
  }
  $('.paint-close').addEventListener('click', close);
  backdrop.addEventListener('click', close);

  // keyboard, in the capture phase so the scene's own shortcuts (WASD, R, L) stay quiet
  const toolKeys = Object.fromEntries(Object.entries(TOOLS).map(([id, t]) => [t.key, id]));
  window.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    e.stopPropagation();
    if (e.target === customInput) return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') close();
    else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (!mod && toolKeys[e.key]) setTool(toolKeys[e.key]);
    else if (!mod && (e.key === '[' || e.key === ']')) {
      sizes[tool] = clamp(sizes[tool] + (e.key === ']' ? 5 : -5), 1, 100);
      sizeInput.value = String(sizes[tool]);
      reflectSize();
    }
  }, true);
  window.addEventListener('keyup', (e) => { if (isOpen) e.stopPropagation(); }, true);
  window.addEventListener('pagehide', () => { if (isOpen) save(); });

  load();

  return {
    open,
    close,
    get isOpen() { return isOpen; },
  };
}

import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function srgb(tex) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Soft radial disc, used for the sun, moon and glows. */
export function makeRadialTexture(stops, size = 256) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return srgb(new THREE.CanvasTexture(c));
}

export const makeSunTexture = () =>
  makeRadialTexture([
    [0, 'rgba(255,252,235,1)'],
    [0.55, 'rgba(255,236,170,1)'],
    [0.72, 'rgba(255,214,120,0.95)'],
    [0.8, 'rgba(255,190,90,0)'],
    [1, 'rgba(255,190,90,0)'],
  ]);

export const makeGlowTexture = () =>
  makeRadialTexture([
    [0, 'rgba(255,230,180,0.55)'],
    [0.35, 'rgba(255,200,130,0.18)'],
    [1, 'rgba(255,180,100,0)'],
  ]);

export function makeMoonTexture(size = 256) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const r = size * 0.36;
  const cx = size / 2;
  const cy = size / 2;
  // soft halo
  const halo = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, size / 2);
  halo.addColorStop(0, 'rgba(210,220,255,0.35)');
  halo.addColorStop(1, 'rgba(210,220,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);
  // disc
  const disc = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  disc.addColorStop(0, '#fbfcff');
  disc.addColorStop(0.7, '#dfe5fa');
  disc.addColorStop(1, '#b9c3e6');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // a few craters
  ctx.fillStyle = 'rgba(150,160,200,0.35)';
  for (const [dx, dy, cr] of [[-0.3, 0.15, 0.16], [0.25, -0.25, 0.11], [0.2, 0.35, 0.09], [-0.1, -0.45, 0.07]]) {
    ctx.beginPath();
    ctx.arc(cx + dx * r, cy + dy * r, cr * r, 0, Math.PI * 2);
    ctx.fill();
  }
  return srgb(new THREE.CanvasTexture(c));
}

/** Warm wooden plank floor. */
export function makePlankTexture(size = 512) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const rows = 8;
  const rowH = size / rows;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < rows; i++) {
    const offset = rnd() * size;
    const shade = 0.88 + rnd() * 0.24;
    const base = [182 * shade, 128 * shade, 82 * shade].map((v) => Math.round(Math.min(255, v)));
    ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
    ctx.fillRect(0, i * rowH, size, rowH);
    // grain
    ctx.strokeStyle = 'rgba(80,45,20,0.12)';
    ctx.lineWidth = 1;
    for (let g = 0; g < 7; g++) {
      const y = i * rowH + rnd() * rowH;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.3, y + (rnd() - 0.5) * 6, size * 0.6, y + (rnd() - 0.5) * 6, size, y);
      ctx.stroke();
    }
    // plank seams
    ctx.fillStyle = 'rgba(60,35,15,0.45)';
    ctx.fillRect(0, i * rowH, size, 2);
    const seamX = (offset + size / 2) % size;
    ctx.fillRect(seamX, i * rowH, 2, rowH);
    ctx.fillRect(offset % size, i * rowH, 2, rowH);
  }
  const tex = srgb(new THREE.CanvasTexture(c));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Tiny painted "photos" for the gallery wall. */
export function makePhotoTexture(kind, w = 128, h = 128) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const grad = (stops, vertical = true) => {
    const g = vertical ? ctx.createLinearGradient(0, 0, 0, h) : ctx.createLinearGradient(0, 0, w, 0);
    for (const [o, col] of stops) g.addColorStop(o, col);
    return g;
  };
  switch (kind) {
    case 'sunset': {
      ctx.fillStyle = grad([[0, '#4a3f8a'], [0.55, '#ff9a5c'], [1, '#ffd79a']]);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff1c2';
      ctx.beginPath(); ctx.arc(w * 0.62, h * 0.52, w * 0.13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2b2440';
      ctx.fillRect(0, h * 0.72, w, h * 0.28);
      break;
    }
    case 'mountains': {
      ctx.fillStyle = grad([[0, '#9ed0ff'], [1, '#e9f4ff']]);
      ctx.fillRect(0, 0, w, h);
      const peaks = [['#5b6d9c', 0.45], ['#3f4f7a', 0.6], ['#2b3657', 0.78]];
      peaks.forEach(([col, base], i) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += w / 6) {
          const y = h * base - Math.abs(Math.sin((x / w) * Math.PI * (1.5 + i))) * h * 0.25;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
      });
      break;
    }
    case 'planet': {
      ctx.fillStyle = '#141a33';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 30; i++) ctx.fillRect(Math.random() * w, Math.random() * h * 0.7, 1.5, 1.5);
      ctx.fillStyle = '#86b55f';
      ctx.beginPath(); ctx.arc(w * 0.5, h * 1.05, w * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f4d35e';
      ctx.beginPath(); ctx.arc(w * 0.78, h * 0.22, w * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e46b6b';
      ctx.beginPath(); ctx.arc(w * 0.5, h * 0.5, w * 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#4f7a3a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.55); ctx.lineTo(w * 0.5, h * 0.75); ctx.stroke();
      break;
    }
    case 'sea': {
      ctx.fillStyle = grad([[0, '#f6d7b0'], [0.5, '#f6d7b0'], [0.5, '#5aa5c9'], [1, '#2f6f98']]);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(w * 0.3, h * 0.2, w * 0.12, w * 0.06, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff6f61';
      ctx.beginPath(); ctx.moveTo(w * 0.6, h * 0.5); ctx.lineTo(w * 0.72, h * 0.3); ctx.lineTo(w * 0.72, h * 0.5); ctx.closePath(); ctx.fill();
      break;
    }
    case 'portrait':
    default: {
      ctx.fillStyle = grad([[0, '#f3e3cc'], [1, '#e2c7a3']]);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#d98c6b';
      ctx.beginPath(); ctx.arc(w * 0.5, h * 0.42, w * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6a8f5a';
      ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.95, w * 0.35, h * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
  }
  return srgb(new THREE.CanvasTexture(c));
}

/** Vinyl record face: black with grooves and a label. */
export function makeVinylTexture(size = 256) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const cx = size / 2;
  ctx.fillStyle = '#111114';
  ctx.beginPath(); ctx.arc(cx, cx, cx, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let r = cx * 0.4; r < cx * 0.97; r += 4) {
    ctx.beginPath(); ctx.arc(cx, cx, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = '#e4ad4c';
  ctx.beginPath(); ctx.arc(cx, cx, cx * 0.33, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b3462f';
  ctx.beginPath(); ctx.arc(cx, cx, cx * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111114';
  ctx.beginPath(); ctx.arc(cx, cx, cx * 0.035, 0, Math.PI * 2); ctx.fill();
  return srgb(new THREE.CanvasTexture(c));
}

// ---------------------------------------------------------------------------
// Surface detail textures
// ---------------------------------------------------------------------------

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function repeat(tex, rx = 1, ry = rx) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.needsUpdate = true;
  return tex;
}

/** Grayscale woven-fabric bump map. */
export function makeFabricBump(size = 256, threads = 48) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const rnd = seeded(11);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  const step = size / threads;
  for (let i = 0; i < threads; i++) {
    for (let j = 0; j < threads; j++) {
      const over = (i + j) % 2 === 0;
      const shade = 128 + (over ? 38 : -30) + (rnd() - 0.5) * 24;
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      if (over) ctx.fillRect(i * step, j * step + step * 0.12, step, step * 0.76);
      else ctx.fillRect(i * step + step * 0.12, j * step, step * 0.76, step);
    }
  }
  // soft noise so it does not read as a perfect grid
  const img = ctx.getImageData(0, 0, size, size);
  for (let k = 0; k < img.data.length; k += 4) {
    const n = (rnd() - 0.5) * 18;
    img.data[k] += n; img.data[k + 1] += n; img.data[k + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return repeat(new THREE.CanvasTexture(c), 3);
}

/** Chunky knit: rows of tilted stitches. Works as a colour map and bump map. */
export function makeKnitTexture(baseHex = 0xd98c6b, size = 256, cols = 7, rows = 10) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const base = new THREE.Color(baseHex);
  const dark = base.clone().multiplyScalar(0.72);
  const light = base.clone().lerp(new THREE.Color(0xffffff), 0.22);
  const css = (col) => `rgb(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)})`;
  ctx.fillStyle = css(dark);
  ctx.fillRect(0, 0, size, size);
  const cw = size / cols;
  const rh = size / rows;
  for (let r = -1; r <= rows; r++) {
    for (let col = -1; col <= cols; col++) {
      const cx = col * cw + cw / 2;
      const cy = r * rh + rh / 2;
      for (const dir of [-1, 1]) {
        ctx.save();
        ctx.translate(cx + dir * cw * 0.22, cy);
        ctx.rotate(dir * 0.55);
        const g = ctx.createLinearGradient(0, -rh * 0.5, 0, rh * 0.5);
        g.addColorStop(0, css(light));
        g.addColorStop(0.55, css(base));
        g.addColorStop(1, css(dark));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, cw * 0.2, rh * 0.52, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
  return repeat(srgb(new THREE.CanvasTexture(c)), 2, 3);
}

/** Subtle plaster bump for the walls. */
export function makePlasterBump(size = 512) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const rnd = seeded(23);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const r = 2 + rnd() * 14;
    const shade = 128 + (rnd() - 0.5) * 26;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},0.35)`;
    ctx.beginPath();
    ctx.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return repeat(new THREE.CanvasTexture(c), 2);
}

/** Wood grain colour map. */
export function makeWoodTexture(baseHex, darkHex, size = 512, seed = 5) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const rnd = seeded(seed);
  const base = new THREE.Color(baseHex);
  const dark = new THREE.Color(darkHex);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, size, size);
  const tmp = new THREE.Color();
  for (let i = 0; i < 70; i++) {
    const y = rnd() * size;
    const amp = 4 + rnd() * 12;
    const freq = 0.004 + rnd() * 0.01;
    const width = 1 + rnd() * 2.5;
    tmp.copy(base).lerp(dark, 0.35 + rnd() * 0.5);
    ctx.strokeStyle = `rgba(${Math.round(tmp.r * 255)},${Math.round(tmp.g * 255)},${Math.round(tmp.b * 255)},${0.35 + rnd() * 0.4})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 6) {
      const yy = y + Math.sin(x * freq * 6.28 + i) * amp + Math.sin(x * 0.05 + i * 3) * 1.5;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  return repeat(srgb(new THREE.CanvasTexture(c)), 1);
}

/** A single leaf on a transparent background, tinted per instance. */
export function makeLeafTexture(size = 128) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  ctx.fillStyle = '#d8d8d8';
  ctx.beginPath();
  ctx.moveTo(cx, size * 0.04);
  ctx.bezierCurveTo(size * 0.98, size * 0.3, size * 0.9, size * 0.8, cx, size * 0.97);
  ctx.bezierCurveTo(size * 0.1, size * 0.8, size * 0.02, size * 0.3, cx, size * 0.04);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,90,90,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, size * 0.08);
  ctx.lineTo(cx, size * 0.93);
  ctx.stroke();
  ctx.lineWidth = 2;
  for (let i = 1; i < 5; i++) {
    const y = size * (0.2 + i * 0.15);
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(cx + size * 0.28, y - size * 0.1);
    ctx.moveTo(cx, y);
    ctx.lineTo(cx - size * 0.28, y - size * 0.1);
    ctx.stroke();
  }
  return srgb(new THREE.CanvasTexture(c));
}

/** Sheer linen: an irregular open weave with slubs. Used as colour and alpha map. */
export function makeLinenTexture(size = 256) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const rnd = seeded(31);
  ctx.fillStyle = 'rgb(205,205,205)';
  ctx.fillRect(0, 0, size, size);
  // warp and weft threads with uneven thickness and brightness
  for (let pass = 0; pass < 2; pass++) {
    let p = 0;
    while (p < size) {
      const w = 1 + rnd() * 1.6;
      const shade = 215 + Math.floor(rnd() * 40);
      ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.55 + rnd() * 0.4})`;
      if (pass === 0) ctx.fillRect(0, p, size, w);
      else ctx.fillRect(p, 0, w, size);
      // occasional slub: a short thicker run in the thread
      if (rnd() < 0.25) {
        const at = rnd() * size, len = 6 + rnd() * 18;
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        if (pass === 0) ctx.fillRect(at, p - 0.5, len, w + 1.2);
        else ctx.fillRect(p - 0.5, at, w + 1.2, len);
      }
      p += w + 0.8 + rnd() * 1.4;
    }
  }
  return repeat(srgb(new THREE.CanvasTexture(c)), 3, 5);
}

// ---------------------------------------------------------------------------
// Rug: a carved pile of concentric arches whose sides run on as straight lines,
// layered over a field of straight lines. Each arch is a "U": rings around a
// centre on one side, parallel lines on the other. One field drives both the
// groove colour and the bump map, so the grooves read as carved into the pile.
// ---------------------------------------------------------------------------
export function makeArchRugTextures(size = 1024) {
  const S = size;
  const rnd = seeded(53);
  const lambda = S / 46; // groove spacing

  // arches in texture space (0..1, y down). `up` arches curve toward the top and
  // their straight sides run downward; the rest are flipped. Later ones sit on top.
  const arches = [
    { x: 0.74, y: 0.6, r: 0.22, legs: 0.44, up: false },
    { x: 0.31, y: 0.3, r: 0.26, legs: 0.33, up: true },
    { x: 0.75, y: 0.3, r: 0.12, legs: 0.16, up: true },
    { x: 0.43, y: 0.93, r: 0.31, legs: 0.4, up: true },
  ].map((a) => ({ ...a, x: a.x * S, y: a.y * S, r: a.r * S, legs: a.legs * S }));

  // distance-like field whose contours are the grooves
  function field(x, y) {
    for (let k = arches.length - 1; k >= 0; k--) {
      const a = arches[k];
      const dx = x - a.x;
      const dy = (y - a.y) * (a.up ? 1 : -1); // dy < 0 is the curved side
      if (dy <= 0) {
        const d = Math.hypot(dx, dy);
        if (d <= a.r) return d;
      } else if (dy <= a.legs && Math.abs(dx) <= a.r) {
        return Math.abs(dx);
      }
    }
    return x + S * 0.37; // background: straight lines
  }

  // smooth groove profile across one spacing
  const halfWidth = 0.14;
  const groove = (d) => {
    const f = (((d / lambda) % 1) + 1) % 1;
    const e = Math.min(f, 1 - f);
    return 1 - THREE.MathUtils.smoothstep(e, halfWidth * 0.55, halfWidth);
  };

  const g = new Float32Array(S * S);
  // 2x2 supersampling keeps the curves clean
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0;
      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) v += groove(field(x + ox, y + oy));
      g[y * S + x] = v / 4;
    }
  }

  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const cream = [238, 232, 220], taupe = [186, 176, 160];
  const bc = canvas(S, S);
  const bctx = bc.getContext('2d');
  const bimg = bctx.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const t = g[i];
    const grain = (rnd() - 0.5) * 14;
    img.data[i * 4] = cream[0] + (taupe[0] - cream[0]) * t + grain;
    img.data[i * 4 + 1] = cream[1] + (taupe[1] - cream[1]) * t + grain;
    img.data[i * 4 + 2] = cream[2] + (taupe[2] - cream[2]) * t + grain;
    img.data[i * 4 + 3] = 255;
    // high pile everywhere, pressed down along the grooves, with fine tufting
    const h = 190 - t * 120 + (rnd() - 0.5) * 30;
    bimg.data[i * 4] = bimg.data[i * 4 + 1] = bimg.data[i * 4 + 2] = h;
    bimg.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  bctx.putImageData(bimg, 0, 0);
  const map = srgb(new THREE.CanvasTexture(c));
  map.anisotropy = 8;
  const bump = new THREE.CanvasTexture(bc);
  return { map, bump };
}

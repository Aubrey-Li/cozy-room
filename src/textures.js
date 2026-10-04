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

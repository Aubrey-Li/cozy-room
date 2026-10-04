import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/** Local wall-clock time as fractional hours in [0, 24). */
export function localHours(date = new Date()) {
  return (
    date.getHours() +
    date.getMinutes() / 60 +
    date.getSeconds() / 3600 +
    date.getMilliseconds() / 3_600_000
  );
}

export function formatClock(hours) {
  const total = Math.floor(hours * 60) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function phaseName(hours) {
  if (hours < 4.5) return 'Deep night';
  if (hours < 5.5) return 'Before dawn';
  if (hours < 6.75) return 'Dawn';
  if (hours < 9) return 'Morning';
  if (hours < 11.5) return 'Late morning';
  if (hours < 13.5) return 'Midday';
  if (hours < 16.5) return 'Afternoon';
  if (hours < 17.75) return 'Golden hour';
  if (hours < 18.75) return 'Sunset';
  if (hours < 20) return 'Dusk';
  if (hours < 22.5) return 'Evening';
  return 'Night';
}

/** Parse "HH:MM" or "H" or "H.5" into fractional hours; null if invalid. */
export function parseTimeParam(str) {
  if (!str) return null;
  const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(str.trim());
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    if (h >= 0 && h < 24 && min >= 0 && min < 60) return h + min / 60;
    return null;
  }
  const f = Number(str);
  if (Number.isFinite(f) && f >= 0 && f < 24) return f;
  return null;
}

// ---------------------------------------------------------------------------
// Sky state derived from the hour. Sunrise is fixed at 06:00 and sunset at
// 18:00 so the sun is at its zenith at noon and the moon at midnight.
// ---------------------------------------------------------------------------

const smoothstep = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function palette(o) {
  const out = {};
  for (const k of Object.keys(o)) {
    out[k] = typeof o[k] === 'number' && k !== 'hemiI' && k !== 'exposure'
      ? new THREE.Color(o[k])
      : o[k];
  }
  return out;
}

const PAL = {
  night: palette({
    top: 0x05081a, horizon: 0x1a2046, bottom: 0x0a0d1c,
    hemiSky: 0x2e3b70, hemiGround: 0x14171f, hemiI: 0.42,
  }),
  sunset: palette({
    top: 0x393a7c, horizon: 0xff9a58, bottom: 0x7d4468,
    hemiSky: 0xffb48c, hemiGround: 0x5a4a6a, hemiI: 0.62,
  }),
  dawn: palette({
    top: 0x5a6fb4, horizon: 0xffcdb0, bottom: 0x9d7eaa,
    hemiSky: 0xffd6c0, hemiGround: 0x6a5a72, hemiI: 0.66,
  }),
  day: palette({
    top: 0x4699e4, horizon: 0xc6e7ff, bottom: 0xa6d4f6,
    hemiSky: 0xd8edff, hemiGround: 0x8c9a76, hemiI: 0.9,
  }),
};

const KEYS = ['top', 'horizon', 'bottom', 'hemiSky', 'hemiGround'];

function blendInto(out, a, b, t) {
  for (const k of KEYS) out[k].copy(a[k]).lerp(b[k], t);
  out.hemiI = THREE.MathUtils.lerp(a.hemiI, b.hemiI, t);
}

const SUN_LOW = new THREE.Color(0xff7b2e);
const SUN_HIGH = new THREE.Color(0xfff2dd);
const GLOW_LOW = new THREE.Color(0xff9a4a);
const GLOW_HIGH = new THREE.Color(0xfff3d0);

export function createSkyState() {
  return {
    hours: 12,
    theta: 0,          // sun angle; 0 = rising at horizon, PI/2 = zenith
    elev: 1,           // sin(theta)
    morning: 1,        // 1 in the morning half, 0 in the evening half
    night: 0,          // 0 by day, 1 at full night
    indoor: 0,         // how "on" the indoor lamps are
    glow: 0,           // horizon glow around the sun
    sunIntensity: 0,
    moonIntensity: 0,
    sunColor: new THREE.Color(),
    glowColor: new THREE.Color(),
    sky: palette({ top: 0, horizon: 0, bottom: 0, hemiSky: 0, hemiGround: 0, hemiI: 0 }),
    _twilight: palette({ top: 0, horizon: 0, bottom: 0, hemiSky: 0, hemiGround: 0, hemiI: 0 }),
  };
}

export function computeSky(hours, s) {
  s.hours = hours;
  const theta = ((hours - 6) / 24) * Math.PI * 2;
  const e = Math.sin(theta);
  const c = Math.cos(theta);
  s.theta = theta;
  s.elev = e;
  s.morning = smoothstep(-0.45, 0.45, c);

  // twilight palette: pinker at dawn, more orange at sunset
  blendInto(s._twilight, PAL.sunset, PAL.dawn, s.morning);

  if (e < -0.3) {
    blendInto(s.sky, PAL.night, PAL.night, 0);
  } else if (e < 0.04) {
    blendInto(s.sky, PAL.night, s._twilight, smoothstep(-0.3, 0.04, e));
  } else if (e < 0.4) {
    blendInto(s.sky, s._twilight, PAL.day, smoothstep(0.04, 0.4, e));
  } else {
    blendInto(s.sky, PAL.day, PAL.day, 0);
  }

  s.night = 1 - smoothstep(-0.28, 0.03, e);
  s.indoor = 1 - smoothstep(-0.12, 0.22, e);
  s.glow = smoothstep(-0.22, 0.0, e) * (1 - 0.65 * smoothstep(0.08, 0.6, e));

  const warm = smoothstep(0.0, 0.45, e);
  s.sunColor.copy(SUN_LOW).lerp(SUN_HIGH, warm);
  s.glowColor.copy(GLOW_LOW).lerp(GLOW_HIGH, warm);
  s.sunIntensity = Math.pow(THREE.MathUtils.clamp(e, 0, 1), 0.55) * 2.6;
  s.moonIntensity = smoothstep(0.0, 0.35, -e) * 0.5;
  return s;
}

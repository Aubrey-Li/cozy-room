import { TZ_COORDS } from './tzcoords.js';

// ---------------------------------------------------------------------------
// Where the viewer is. The time zone's reference city is a good enough guess for
// sunrise, sunset and hemisphere, and needs no permission prompt. If the page
// already has location permission (or ?loc=lat,lon is given) the exact spot wins.
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

function zoneGuess() {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* old browser */ }
  const hit = TZ_COORDS[tz];
  if (hit) return { lat: hit[0], lon: hit[1], source: 'timezone', label: tz.split('/').pop().replace(/_/g, ' ') };
  // unknown zone: the UTC offset still pins the longitude; assume mid northern latitudes
  const offsetMin = -new Date(new Date().getFullYear(), 0, 1).getTimezoneOffset();
  return { lat: 40, lon: offsetMin / 4, source: 'offset', label: '' };
}

function parseLoc(str) {
  const parts = (str || '').split(',').map(Number);
  if (parts.length !== 2 || !parts.every(Number.isFinite)) return null;
  const [lat, lon] = parts;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, source: 'url', label: '' };
}

/**
 * Returns a location object right away and refines it in place (calling
 * onChange) if precise geolocation is already allowed for this page.
 */
export function createLocation(params, onChange = () => {}) {
  const loc = parseLoc(params.get('loc')) || zoneGuess();
  if (loc.source !== 'url' && navigator.permissions && navigator.geolocation) {
    navigator.permissions.query({ name: 'geolocation' }).then((p) => {
      if (p.state !== 'granted') return;
      navigator.geolocation.getCurrentPosition((pos) => {
        loc.lat = pos.coords.latitude;
        loc.lon = pos.coords.longitude;
        loc.source = 'device';
        onChange(loc);
      }, () => {}, { maximumAge: 6 * 3600e3, timeout: 10e3 });
    }).catch(() => {});
  }
  return loc;
}

// ---------------------------------------------------------------------------
// Sunrise and sunset (the standard sunrise equation, good to a minute or two)
// ---------------------------------------------------------------------------

const J2000 = 2451545;
const toJulian = (ms) => ms / 86400000 + 2440587.5;
const fromJulian = (j) => (j - 2440587.5) * 86400000;

/** Local midnight of the calendar day containing `date`. */
export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Sunrise and sunset for the local calendar day of `date`, as fractional local
 * hours. Polar day or night is clamped so the scene always has a little of both.
 */
export function sunTimes(date, lat, lon) {
  const midnight = startOfDay(date).getTime();
  const noon = midnight + 12 * 3600e3;
  const n = Math.round(toJulian(noon) - J2000 - 0.0008);
  const jStar = n - lon / 360;
  const M = ((357.5291 + 0.98560028 * jStar) % 360) * DEG;
  const C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * DEG;
  const lambda = (M + C + Math.PI + 102.9372 * DEG) % (2 * Math.PI);
  const jTransit = J2000 + jStar + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * lambda);
  const sinDec = Math.sin(lambda) * Math.sin(23.4397 * DEG);
  const cosDec = Math.cos(Math.asin(sinDec));
  const phi = lat * DEG;
  let cosW = (Math.sin(-0.833 * DEG) - Math.sin(phi) * sinDec) / (Math.cos(phi) * cosDec);
  const noonH = (fromJulian(jTransit) - midnight) / 3600e3;
  // half the day length in hours, kept between 45 minutes and 11h15
  cosW = Math.min(1, Math.max(-1, cosW));
  const half = Math.min(11.25, Math.max(0.75, (Math.acos(cosW) / DEG / 360) * 24));
  return { sunrise: noonH - half, sunset: noonH + half, noon: noonH };
}

/**
 * Sun angle for the scene: sunrise maps to 0, sunset to PI, and the night half
 * of the circle is spread evenly from sunset to the next sunrise.
 */
export function sunTheta(hours, { sunrise, sunset }) {
  const day = sunset - sunrise;
  const h = ((hours - sunrise) % 24 + 24) % 24; // hours since sunrise
  if (h <= day) return (h / day) * Math.PI;
  return Math.PI + ((h - day) / (24 - day)) * Math.PI;
}

// ---------------------------------------------------------------------------
// Moon phase
// ---------------------------------------------------------------------------

const SYNODIC = 29.530588853;
const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14); // a known new moon

/** 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter. */
export function moonPhase(ms) {
  const days = (ms - NEW_MOON_REF) / 86400000;
  return ((days / SYNODIC) % 1 + 1) % 1;
}

/** Fraction of the disc that is lit. */
export const moonIllumination = (phase) => (1 - Math.cos(phase * 2 * Math.PI)) / 2;

export function moonPhaseName(p) {
  if (p < 0.02 || p > 0.98) return 'New moon';
  if (p < 0.23) return 'Waxing crescent';
  if (p < 0.27) return 'First quarter';
  if (p < 0.48) return 'Waxing gibbous';
  if (p < 0.52) return 'Full moon';
  if (p < 0.73) return 'Waning gibbous';
  if (p < 0.77) return 'Last quarter';
  return 'Waning crescent';
}

// ---------------------------------------------------------------------------
// Seasons. A continuous position: 0 spring, 1 summer, 2 fall, 3 winter (wrapping).
// Each season holds for a while and then eases into the next over a few weeks,
// so the planet never jumps from one look to another overnight.
// ---------------------------------------------------------------------------

// [day of year in the northern hemisphere, season position]
const SEASON_ANCHORS = [
  [0, 3],      // Jan 1: deep winter
  [52, 3],     // late Feb: the thaw begins
  [84, 4],     // late Mar: cherry blossom
  [128, 4],    // early May: petals give way to leaves
  [158, 5],    // early Jun: full summer
  [238, 5],    // late Aug: first leaves turn
  [274, 6],    // Oct 1: peak colour
  [320, 6],    // mid Nov: first snow
  [350, 7],    // mid Dec: snowed in
  [366, 7],
];

export function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  return (startOfDay(date) - start) / 86400000 + (date.getHours() + date.getMinutes() / 60) / 24;
}

const ease = (t) => t * t * (3 - 2 * t);

export function seasonPosition(date, lat) {
  let doy = dayOfYear(date);
  if (lat < 0) doy = (doy + 182.6) % 365.25; // southern hemisphere runs half a year out
  for (let i = 1; i < SEASON_ANCHORS.length; i++) {
    const [d1, s1] = SEASON_ANCHORS[i];
    const [d0, s0] = SEASON_ANCHORS[i - 1];
    if (doy <= d1) return (s0 + (s1 - s0) * ease((doy - d0) / (d1 - d0))) % 4;
  }
  return 3;
}

const SEASON_NAMES = ['Spring', 'Summer', 'Fall', 'Winter'];

export function seasonName(pos) {
  return SEASON_NAMES[Math.round(pos) % 4];
}

/** Blend weights for each season from a position, summing to 1. */
export function seasonWeights(pos, out = { spring: 0, summer: 0, fall: 0, winter: 0 }) {
  const p = ((pos % 4) + 4) % 4;
  const i = Math.floor(p);
  const t = p - i;
  const w = [0, 0, 0, 0];
  w[i] = 1 - t;
  w[(i + 1) % 4] = t;
  [out.spring, out.summer, out.fall, out.winter] = w;
  return out;
}

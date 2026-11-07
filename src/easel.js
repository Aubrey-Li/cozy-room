import * as THREE from 'three';

// ---------------------------------------------------------------------------
// A wooden studio easel with a stretched canvas on it, a jar of brushes at its
// foot and a palette on the ledge. The canvas face shows whatever has been
// painted on it (see setPainting); until then it is bare, primed linen.
// Built at the origin with the canvas facing +z.
// ---------------------------------------------------------------------------

/** Aspect of the stretched canvas (width / height); the painting app uses the same. */
export const CANVAS_ASPECT = 0.8;
const CW = 0.66, CH = CW / CANVAS_ASPECT, CT = 0.035;
const LEDGE_Y = 0.78;
const LEAN = 0.1; // the whole front frame tips back a little, as real easels do

function part(geo, material, x, y, z) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const bx = (w, h, d, material, x = 0, y = 0, z = 0) => part(new THREE.BoxGeometry(w, h, d), material, x, y, z);

/** A bare primed canvas: warm white gesso over a fine weave. */
function primedCanvas(ctx, w, h) {
  ctx.fillStyle = '#f6f1e6';
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#8a7a60';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  for (let x = 0; x < w; x += 3) ctx.fillRect(x, 0, 1, h);
  ctx.globalAlpha = 1;
}

/** A leg from a to b, as a square-section stick. */
function stick(a, b, t, material) {
  const dir = b.clone().sub(a);
  const m = part(new THREE.BoxGeometry(t, dir.length(), t * 0.8), material, 0, 0, 0);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/**
 * An artist's swivel stool: a round seat on a black threaded spindle that winds
 * it up and down, a round collar where three splayed square legs meet, and a
 * triangular shelf bracing the legs partway down. `grain` is a straight-grained
 * wood colour map (lines along u); the room passes one in the easel's oak colours.
 * Built at the origin, standing on the floor.
 */
export function buildStool({ grain, metal = 0x1f1d1f } = {}) {
  const g = new THREE.Group();
  const beech = new THREE.MeshStandardMaterial({ map: grain ?? null, color: grain ? 0xffffff : 0xd2a874, roughness: 0.7 });
  const top = beech;
  // the legs are cut along the grain, so on them the lines run lengthwise
  let legWood = beech;
  if (grain) {
    const along = grain.clone();
    along.center.set(0.5, 0.5);
    along.rotation = Math.PI / 2;
    along.needsUpdate = true;
    legWood = new THREE.MeshStandardMaterial({ map: along, roughness: 0.7 });
  }
  const iron = new THREE.MeshStandardMaterial({ color: metal, roughness: 0.45, metalness: 0.6 });
  const add = (mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh; };
  const up = new THREE.Vector3(0, 1, 0);

  const COLLAR_Y = 0.5;  // top of the round collar the legs hang from
  const SEAT_Y = 0.68;   // top of the seat, wound up a little so the spindle shows
  const SEAT_R = 0.21, SEAT_T = 0.05;

  /** A disc with a rounded (bullnose) rim, the face in another material. */
  const roundDisc = (r, t, y, rimMat, faceMat) => {
    const e = t / 2;
    const prof = [new THREE.Vector2(0, 0), new THREE.Vector2(r - e, 0)];
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI;
      prof.push(new THREE.Vector2(r - e + Math.cos(a) * e, e + Math.sin(a) * e));
    }
    prof.push(new THREE.Vector2(0, t));
    const rim = add(new THREE.Mesh(new THREE.LatheGeometry(prof, 48), rimMat));
    rim.position.y = y - t;
    if (faceMat) {
      // a flat face so the grain lies straight across the top
      const face = add(new THREE.Mesh(new THREE.CircleGeometry(r - e * 1.1, 48), faceMat));
      face.rotation.x = -Math.PI / 2;
      face.position.y = y + 0.001;
    }
  };

  roundDisc(SEAT_R, SEAT_T, SEAT_Y, beech, top);
  roundDisc(0.18, 0.04, COLLAR_Y, beech, top);

  // three splayed legs of square section, fixed under the collar's rim
  const legAngles = [0, 1, 2].map((i) => Math.PI / 2 + (i * Math.PI * 2) / 3);
  const legTop = (a) => new THREE.Vector3(Math.cos(a) * 0.14, COLLAR_Y - 0.04, Math.sin(a) * 0.14);
  const legFoot = (a) => new THREE.Vector3(Math.cos(a) * 0.27, 0, Math.sin(a) * 0.27);
  const legAt = (a, y) => legFoot(a).lerp(legTop(a), y / (COLLAR_Y - 0.04));
  for (const a of legAngles) {
    const from = legFoot(a), to = legTop(a).add(new THREE.Vector3(0, 0.035, 0));
    const dir = to.clone().sub(from);
    const leg = add(new THREE.Mesh(new THREE.BoxGeometry(0.045, dir.length(), 0.038), legWood));
    leg.position.copy(from).addScaledVector(dir, 0.5);
    // tilt it along its splay, with its broad face turned outward
    leg.quaternion.setFromUnitVectors(up, dir.normalize());
    leg.rotateY(-a + Math.PI / 2);
  }

  // the triangular shelf between the legs
  const SHELF_Y = 0.22;
  const tri = new THREE.Shape();
  legAngles.forEach((a, i) => {
    const p = legAt(a, SHELF_Y);
    // pull the corners in a touch so they sit against the legs' inner faces
    const x = p.x * 0.9, z = p.z * 0.9;
    if (i === 0) tri.moveTo(x, -z); else tri.lineTo(x, -z);
  });
  tri.closePath();
  const shelfGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.008, bevelSegments: 2 });
  shelfGeo.rotateX(-Math.PI / 2);
  const shelf = add(new THREE.Mesh(shelfGeo, beech));
  shelf.position.y = SHELF_Y - 0.01;

  // the spindle: a black threaded rod from under the shelf up to the seat, with flanges where it passes through
  const ROD_BOTTOM = 0.1, ROD_TOP = SEAT_Y - SEAT_T;
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, ROD_TOP - ROD_BOTTOM, 10), iron)).position.y = (ROD_TOP + ROD_BOTTOM) / 2;
  const turns = Math.round((ROD_TOP - ROD_BOTTOM) / 0.012);
  const helix = [];
  for (let i = 0; i <= turns * 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    helix.push(new THREE.Vector3(Math.cos(a) * 0.012, ROD_BOTTOM + (i / (turns * 12)) * (ROD_TOP - ROD_BOTTOM), Math.sin(a) * 0.012));
  }
  add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), turns * 12, 0.0035, 4), iron));
  const flange = (y, r) => add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.012, 20), iron)).position.set(0, y, 0);
  flange(COLLAR_Y + 0.006, 0.04);
  flange(SHELF_Y + 0.016, 0.035);
  flange(ROD_TOP - 0.006, 0.05); // the plate under the seat that it turns on
  return g;
}

export function buildEasel({ wood, darkWood }) {
  const g = new THREE.Group();

  // the front frame: two splayed legs and a centre mast, leaning back
  const front = new THREE.Group();
  front.rotation.x = -LEAN;
  g.add(front);
  const top = 2.05;
  front.add(stick(new THREE.Vector3(-0.38, 0, 0), new THREE.Vector3(-0.07, top - 0.08, 0), 0.05, wood));
  front.add(stick(new THREE.Vector3(0.38, 0, 0), new THREE.Vector3(0.07, top - 0.08, 0), 0.05, wood));
  front.add(bx(0.06, top - 0.3, 0.04, wood, 0, 0.3 + (top - 0.3) / 2, -0.03));
  front.add(bx(0.16, 0.06, 0.05, wood, 0, top - 0.06, 0)); // the head where it all meets
  // a crossbar low down to brace the legs
  front.add(bx(0.62, 0.04, 0.035, wood, 0, 0.32, 0));

  // the ledge the canvas stands on, a tray with a lip
  const ledge = new THREE.Group();
  ledge.position.set(0, LEDGE_Y, 0.04);
  ledge.add(bx(0.8, 0.03, 0.12, wood, 0, 0, 0.02));
  ledge.add(bx(0.8, 0.04, 0.015, wood, 0, 0.02, 0.075));
  // a palette with a few dabs of paint, and two brushes resting in the tray
  const palette = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 0.008, 20),
    new THREE.MeshStandardMaterial({ color: 0xc89a62, roughness: 0.6 }),
  );
  palette.scale.set(1.35, 1, 0.7);
  palette.position.set(-0.24, 0.02, 0.03);
  palette.castShadow = true;
  ledge.add(palette);
  [0xd8433a, 0xf1c541, 0x3a74b8, 0xf6f1e6, 0x3f8a4a].forEach((c, i) => {
    const dab = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 }));
    dab.scale.set(1, 0.45, 1);
    dab.position.set(-0.32 + i * 0.035, 0.026, 0.02 + Math.sin(i * 2.1) * 0.02);
    ledge.add(dab);
  });
  for (const [x, c] of [[0.16, 0x2f5f8a], [0.26, 0xb04a3a]]) {
    const brush = new THREE.Group();
    brush.add(part(new THREE.CylinderGeometry(0.006, 0.009, 0.22, 6), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }), 0, 0, 0));
    brush.add(part(new THREE.CylinderGeometry(0.007, 0.007, 0.03, 6), new THREE.MeshStandardMaterial({ color: 0xb9b2a6, roughness: 0.3, metalness: 0.8 }), 0, 0.125, 0));
    brush.add(part(new THREE.ConeGeometry(0.008, 0.035, 6), darkWood, 0, 0.155, 0));
    brush.rotation.z = Math.PI / 2;
    brush.position.set(x, 0.025, 0.04);
    ledge.add(brush);
  }
  front.add(ledge);

  // the stretched canvas: painted face on +z, raw linen round the edges
  const paintCanvas = document.createElement('canvas');
  paintCanvas.width = 512;
  paintCanvas.height = Math.round(512 / CANVAS_ASPECT);
  primedCanvas(paintCanvas.getContext('2d'), paintCanvas.width, paintCanvas.height);
  const paintTex = new THREE.CanvasTexture(paintCanvas);
  paintTex.colorSpace = THREE.SRGBColorSpace;
  paintTex.anisotropy = 8;
  const face = new THREE.MeshStandardMaterial({ map: paintTex, roughness: 0.85 });
  const linen = new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 1 });
  const canvasMesh = new THREE.Mesh(new THREE.BoxGeometry(CW, CH, CT), [linen, linen, linen, linen, face, linen]);
  canvasMesh.position.set(0, LEDGE_Y + 0.02 + CH / 2, 0.06);
  canvasMesh.castShadow = true;
  canvasMesh.receiveShadow = true;
  front.add(canvasMesh);
  // the top clamp slides down the mast to hold the canvas
  front.add(bx(0.2, 0.05, 0.08, wood, 0, LEDGE_Y + 0.02 + CH + 0.02, 0.03));

  // the back leg, hinged at the head and reaching out behind
  const back = stick(new THREE.Vector3(0, top - 0.1, -0.22), new THREE.Vector3(0, 0, -0.72), 0.045, wood);
  g.add(back);

  // a jar of brushes on the floor by the right leg
  const jar = new THREE.Group();
  jar.position.set(0.5, 0, 0.12);
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe3e6, roughness: 0.15, transparent: true, opacity: 0.55 });
  jar.add(part(new THREE.CylinderGeometry(0.065, 0.06, 0.16, 16, 1, true), glass, 0, 0.08, 0));
  jar.add(part(new THREE.CircleGeometry(0.06, 16).rotateX(-Math.PI / 2), glass, 0, 0.002, 0));
  jar.add(part(new THREE.CylinderGeometry(0.058, 0.055, 0.06, 16), new THREE.MeshStandardMaterial({ color: 0x9fb4b0, roughness: 0.2, transparent: true, opacity: 0.6 }), 0, 0.04, 0));
  [[0x2f5f8a, 0.15, 0.2], [0xd9b25a, -0.2, 0.1], [0x3a3330, 0.05, -0.25], [0xb04a3a, -0.1, -0.05]].forEach(([c, tx, tz], i) => {
    const b = new THREE.Group();
    b.add(part(new THREE.CylinderGeometry(0.006, 0.009, 0.3, 6), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }), 0, 0.15, 0));
    b.add(part(new THREE.CylinderGeometry(0.008, 0.008, 0.035, 6), new THREE.MeshStandardMaterial({ color: 0xb9b2a6, roughness: 0.3, metalness: 0.8 }), 0, 0.31, 0));
    b.add(part(new THREE.ConeGeometry(0.009, 0.04 + i * 0.006, 6), darkWood, 0, 0.345, 0));
    b.position.set(Math.sin(i * 1.7) * 0.02, 0.01, Math.cos(i * 1.7) * 0.02);
    b.rotation.set(tz, 0, tx);
    jar.add(b);
  });
  g.add(jar);

  /**
   * Show an image (a canvas or bitmap) on the easel's canvas, scaled to fill it. It
   * may be just the paint with no paper behind it, so the bare primed canvas goes down first.
   */
  function setPainting(source) {
    const ctx = paintCanvas.getContext('2d');
    primedCanvas(ctx, paintCanvas.width, paintCanvas.height);
    if (source) ctx.drawImage(source, 0, 0, paintCanvas.width, paintCanvas.height);
    paintTex.needsUpdate = true;
  }

  return { group: g, setPainting };
}

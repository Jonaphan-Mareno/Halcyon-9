import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { polar, wallClear, HUB_RADIUS } from '../levels/hubGeometry.js';

// Signage and floor markings for the level 2 hub, drawn onto canvases at start-up (no
// image files). They read as paint and stencil on the metal, give the room places and names,
// and double as wayfinding: lane edges and arrows lead from the elevator, to the core, to the
// first door.
//
//   floor decal : one big top-down texture laid just above the floor (hazard ring round the
//                 core, lane edges, arrows, zone names)
//   door plaques, zone signs and wall warning labels : small planes on the wall

const FLOOR_PX = 2048;
const FLOOR_SIZE = 68; // metres across

const FONT = 'Arial, Helvetica, sans-serif';

function canvasTexture(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- floor
function floorDecal() {
  const c = document.createElement('canvas');
  c.width = c.height = FLOOR_PX;
  const ctx = c.getContext('2d');
  const k = FLOOR_PX / FLOOR_SIZE; // pixels per metre
  const px = (x) => (x + FLOOR_SIZE / 2) * k;
  const py = (z) => (z + FLOOR_SIZE / 2) * k;
  const W = (p) => ({ x: px(p.x), y: py(p.z) });

  // Hazard stripes in a ring round the raised platform
  const ring = (r0, r1) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(px(0), py(0), r1 * k, 0, Math.PI * 2);
    ctx.arc(px(0), py(0), r0 * k, 0, Math.PI * 2, true);
    ctx.clip();
    ctx.fillStyle = '#11141a';
    ctx.fillRect(0, 0, FLOOR_PX, FLOOR_PX);
    ctx.strokeStyle = '#c98a1c';
    ctx.lineWidth = 0.55 * k;
    for (let d = -FLOOR_PX; d < FLOOR_PX * 2; d += 1.1 * k) {
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d + FLOOR_PX, FLOOR_PX);
      ctx.stroke();
    }
    ctx.restore();
  };
  ring(12.05, 13.0);

  // Lane edges: thin cyan lines on both sides of the two lit lanes
  ctx.fillStyle = 'rgba(80,220,255,0.85)';
  for (const x of [-2.3, 2.3]) {
    ctx.fillRect(px(x) - 0.07 * k, py(12.6), 0.14 * k, (33 - 12.6) * k);    // elevator lane (south)
    ctx.fillRect(px(x) - 0.07 * k, py(-31), 0.14 * k, (31 - 12.6) * k);     // door A lane (north)
  }

  // Chevrons pointing along the lanes (both lanes lead north)
  const chevron = (x, z) => {
    const p = W({ x, z });
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.strokeStyle = 'rgba(255,190,70,0.9)';
    ctx.lineWidth = 0.28 * k;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(-1.0 * k, 0.6 * k);
    ctx.lineTo(0, -0.5 * k);
    ctx.lineTo(1.0 * k, 0.6 * k);
    ctx.stroke();
    ctx.restore();
  };
  for (const z of [30, 26, 22, 18, 14.5]) chevron(0, z);
  for (const z of [-16, -20, -24, -28]) chevron(0, z);

  // Words painted on the floor, readable looking outward from the core
  const patches = [];
  const word = (text, r, a, size, color, inward = false) => {
    patches.push({ r, a, w: text.length * size * 0.72 + 1.2, h: size + 0.9, rot: Math.PI / 2 - (a * Math.PI) / 180 + (inward ? Math.PI : 0) });
    const p = polar(r, a);
    const q = W(p);
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(Math.PI / 2 - (a * Math.PI) / 180 + (inward ? Math.PI : 0));
    ctx.fillStyle = color;
    ctx.font = `bold ${size * k}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  const paint = 'rgba(200,215,225,0.55)';
  word('FREIGHT YARD', 18.5, 160, 1.6, paint);
  word('MACHINERY BAY', 17.0, 350, 1.4, paint);
  word('PIPE CANYON', 19.0, 66, 1.4, paint);
  word('CARGO BAY', 27.8, 90, 1.5, 'rgba(120,235,255,0.7)');
  word('CORE ACCESS', 15.4, 270, 1.3, 'rgba(255,190,70,0.75)', true);   // read walking in from the elevator
  word('ELEVATOR', 31.0, 270, 1.3, paint, true);
  word('BAY 07', 26.5, 160, 0.9, paint);
  word('BAY 08', 22.2, 160, 0.9, paint);

  const tex = canvasTexture(c);
  const mat = new THREE.MeshStandardMaterial({
    map: tex, transparent: true, roughness: 0.75, metalness: 0.1,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  });
  // Only the painted parts of the floor are drawn (the ring, the two lanes and each word), not
  // a 68 m transparent sheet: a full sheet would re-light every floor pixel a second time.
  const pieces = [];
  const ringGeo = new THREE.RingGeometry(12.0, 13.05, 96, 1);
  ringGeo.rotateX(-Math.PI / 2);
  pieces.push(ringGeo);
  for (const [z0, z1] of [[12.4, 33.2], [-31.2, -12.4]]) {
    const lane = new THREE.PlaneGeometry(5.2, z1 - z0);
    lane.rotateX(-Math.PI / 2);
    lane.translate(0, 0, (z0 + z1) / 2);
    pieces.push(lane);
  }
  for (const p of patches) {
    const q = new THREE.PlaneGeometry(p.w, p.h);
    q.rotateX(-Math.PI / 2);
    q.rotateY(-p.rot);
    const c = polar(p.r, p.a);
    q.translate(c.x, 0, c.z);
    pieces.push(q);
  }
  // Every piece samples the one top-down texture by its position on the floor
  for (const g of pieces) {
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) + FLOOR_SIZE / 2) / FLOOR_SIZE, 1 - (pos.getZ(i) + FLOOR_SIZE / 2) / FLOOR_SIZE);
    }
  }
  const geo = mergeGeometries(pieces);
  pieces.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.008;
  mesh.renderOrder = 1;
  return mesh;
}

// ---------------------------------------------------------------- wall signs
function signCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

const plate = (ctx, w, h, bg, edge) => {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(4, h * 0.05);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
};

function bigSign(text, color, w = 768, h = 144) {
  return canvasTexture(signCanvas(w, h, (ctx) => {
    plate(ctx, w, h, 'rgba(5,10,16,0.9)', color);
    ctx.fillStyle = color;
    ctx.font = `bold ${h * 0.52}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 3);
  }));
}

// Small warning and information labels; one texture each
const LABELS = [
  { lines: ['DANGER', 'HIGH VOLTAGE'], bg: '#b88418', fg: '#10141a', edge: '#10141a', icon: '!' },
  { lines: ['NO ENTRY'], bg: '#7c2a2a', fg: '#f0d8d8', edge: '#f0d8d8' },
  { lines: ['PRESSURE', 'VALVE 12'], bg: '#3a4048', fg: '#d8e0e8', edge: '#9aa4ae' },
  { lines: ['AUTHORISED', 'PERSONNEL ONLY'], bg: '#0a1218', fg: '#7fe0ff', edge: '#2a6a80' },
  { lines: ['COOLANT', 'LINE'], bg: '#123238', fg: '#8ff0e0', edge: '#2a7a78' },
  { lines: ['HATCH 07'], bg: '#2a2f36', fg: '#e0e6ec', edge: '#7a848e', icon: '^' },
  { lines: ['FIRE', 'EXTINGUISHER'], bg: '#5a1f1f', fg: '#f4dede', edge: '#f4dede' },
  { lines: ['NO NAKED', 'FLAMES'], bg: '#b88418', fg: '#10141a', edge: '#10141a' }
];

function labelTexture(spec) {
  const w = 384, h = 256;
  return canvasTexture(signCanvas(w, h, (ctx) => {
    plate(ctx, w, h, spec.bg, spec.edge);
    ctx.fillStyle = spec.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const x0 = spec.icon ? w * 0.6 : w / 2;
    if (spec.icon) {
      ctx.font = `bold ${h * 0.55}px ${FONT}`;
      ctx.fillText(spec.icon, w * 0.2, h / 2);
    }
    const size = spec.lines.length > 1 ? h * 0.2 : h * 0.26;
    ctx.font = `bold ${size}px ${FONT}`;
    spec.lines.forEach((line, i) => {
      ctx.fillText(line, x0, h / 2 + (i - (spec.lines.length - 1) / 2) * size * 1.2);
    });
  }));
}

function placeOnWall(geo, a, y, offset) {
  const holder = new THREE.Object3D();
  holder.position.copy(polar(HUB_RADIUS - offset, a, y));
  holder.lookAt(0, y, 0);
  holder.updateMatrix();
  geo.applyMatrix4(holder.matrix);
  return geo;
}

function wallSigns(group) {
  const sign = (text, color, w, h, a, y, offset, pxW) => {
    const mat = new THREE.MeshBasicMaterial({ map: bigSign(text, color, pxW, Math.round(pxW * h / w)), transparent: true });
    const mesh = new THREE.Mesh(placeOnWall(new THREE.PlaneGeometry(w, h), a, y, offset), mat);
    group.add(mesh);
  };
  // Door plaques, in the colour of each door's glow
  sign('CARGO BAY', '#26f2ff', 4.8, 0.9, 90, 5.75, 0.25, 768);
  sign('MAINTENANCE', '#b6e0ff', 4.8, 0.9, 200, 12.75, 0.25, 768);
  sign('SECURITY', '#8a6bff', 4.8, 0.9, 320, 19.75, 0.25, 768);
  sign('ELEVATOR', '#26f2ff', 4.2, 0.9, 270, 6.3, 0.25, 768);
  // Zone signs, in front of the wall pipes so nothing hides them
  sign('FREIGHT YARD', '#cfe6f2', 6.4, 1.2, 150, 10.0, 1.2, 768);
  sign('MACHINERY BAY', '#cfe6f2', 7.6, 1.2, 352, 9.5, 1.2, 768);
  sign('PIPE CANYON', '#cfe6f2', 6.8, 1.2, 48, 11.0, 1.2, 768);

  // Small warning labels scattered between the ribs. Merged per kind to keep the draw calls few.
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const byKind = LABELS.map(() => []);
  for (let k = 0; k < 24; k++) {
    const a = 3.5 + k * 15;
    if (!wallClear(a, 4)) continue;
    for (let n = 0; n < 2; n++) {
      const y = 2.0 + rand() * 25.0;
      const kind = Math.floor(rand() * LABELS.length);
      const s = 0.8 + rand() * 0.4;
      byKind[kind].push(placeOnWall(new THREE.PlaneGeometry(1.2 * s, 0.8 * s), a, y, 0.42));
    }
  }
  byKind.forEach((geos, i) => {
    if (!geos.length) return;
    const mat = new THREE.MeshStandardMaterial({
      map: labelTexture(LABELS[i]), roughness: 0.6, metalness: 0.1,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
    group.add(new THREE.Mesh(mergeGeometries(geos), mat));
  });
}

export function createHubDecals() {
  const group = new THREE.Group();
  group.name = 'HubDecals';
  group.add(floorDecal());
  wallSigns(group);
  return group;
}

export function disposeHubDecals(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      m.map?.dispose();
      m.dispose();
    }
  });
}

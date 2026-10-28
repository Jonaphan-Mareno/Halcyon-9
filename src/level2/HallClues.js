import * as THREE from 'three';
import { withHubLighting } from '../graphics/HubMaterials.js';

// The small, optional clues in the atrium's hall (scene 2.2): the crew's photo board with its
// chore wheel, a framed crew photo on a coffee table, and a half-eaten ration tray on a sofa arm.
// All drawn here (canvas textures and a few boxes), so there is nothing extra to download.
//
// The photos have someone torn off the end: an eighth crew member, the one whose initials are
// still on the chore wheel (J.V.). ARIA cleaned up after Voss, and missed the wheel.

const CREW = ['E.K.', 'A.O.', 'T.L.', 'R.N.', 'S.P.', 'M.H.', 'D.I.', 'J.V.'];
const CHORES = ['FEED FISH', 'WATER BEDS', 'GALLEY', 'FILTERS', 'LAUNDRY', 'LOGS', 'SCRUB', 'PUMPS'];
const HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';

// Where they go. The board hangs on the wall just west of the lift, above the desk there, where
// every player sees it on arrival (the model's own board, PT_PhotoBoard, is tucked under the west
// stair in the dark). Polar: metres from the atrium's centre, degrees with north = 90.
const BOARD_AT = { r: 16.95, angle: 256, y: 2.1, w: 1.5, h: 0.94 };
// the lounge spots, found from above (the two glass coffee tables, the orange sofa arms)
const FRAME_AT = { x: -2.4, z: -1.8, turn: 0.6 };
const RATION_AT = { x: 3.9, z: -3.4, turn: -0.8 };

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A group photo of the crew: seven people, and the edge of an eighth torn away
function drawGroupPhoto(g, w, h, rand) {
  g.fillStyle = '#c9d2d8';
  g.fillRect(0, 0, w, h);
  const wall = g.createLinearGradient(0, 0, 0, h);
  wall.addColorStop(0, '#dfe6ea');
  wall.addColorStop(1, '#8f9aa3');
  g.fillStyle = wall;
  g.fillRect(0, 0, w, h);
  const skins = ['#f1c9a5', '#8d5a3b', '#e0ac7e', '#c58c63', '#5a3826', '#f3d3b5', '#a8714a'];
  const hair = ['#2a1d14', '#0f0c0a', '#6b4423', '#1b1410', '#c49a5a', '#3b2a1e', '#0f0c0a'];
  const suits = ['#e8ecef', '#1a2a44', '#e8ecef', '#1a2a44', '#e8ecef', '#f07a14', '#1a2a44'];
  const person = (x, y, s, i) => {
    g.fillStyle = suits[i];
    g.beginPath();
    g.ellipse(x, y + s * 1.25, s * 0.95, s * 0.9, 0, Math.PI, 0);
    g.fill();
    g.fillRect(x - s * 0.95, y + s * 1.25, s * 1.9, s);
    g.fillStyle = skins[i];
    g.beginPath();
    g.ellipse(x, y, s * 0.45, s * 0.55, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = hair[i];
    g.beginPath();
    g.ellipse(x, y - s * 0.28, s * 0.48, s * 0.32, 0, Math.PI, 0);
    g.fill();
  };
  // back row, then front row
  [[0.2, 0.42], [0.42, 0.4], [0.64, 0.42]].forEach(([x, y], k) => person(x * w, y * h, h * 0.12, k));
  [[0.1, 0.58], [0.31, 0.6], [0.53, 0.58], [0.75, 0.6]].forEach(([x, y], k) => person(x * w, y * h, h * 0.13, k + 3));
  // the eighth: only a sleeve left at the torn edge
  g.fillStyle = '#e8ecef';
  g.fillRect(w * 0.9, h * 0.72, w * 0.1, h * 0.3);
  // age and a slight fade
  g.fillStyle = 'rgba(120, 90, 50, 0.12)';
  g.fillRect(0, 0, w, h);
  // the torn edge, white paper fibres showing
  g.fillStyle = '#f4f1ea';
  g.beginPath();
  g.moveTo(w, 0);
  let x = w * 0.93;
  g.lineTo(x, 0);
  for (let y = 0; y <= h; y += h / 18) {
    x = w * (0.9 + rand() * 0.05);
    g.lineTo(x, y);
  }
  g.lineTo(w, h);
  g.closePath();
  g.fill();
}

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

// The photo board: notes, two pinned photos and the chore wheel
function drawBoard(g, w, h) {
  const rand = seeded(7);
  g.fillStyle = '#2a3036';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#b48a5e';          // cork
  g.fillRect(16, 16, w - 32, h - 32);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(${90 + rand() * 60}, ${60 + rand() * 40}, ${30 + rand() * 20}, 0.35)`;
    g.fillRect(16 + rand() * (w - 32), 16 + rand() * (h - 32), 2, 2);
  }
  const pin = (x, y, color = '#d8352a') => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, 7, 0, Math.PI * 2);
    g.fill();
  };
  // two photos, slightly crooked
  const photo = (x, y, pw, ph, rot, seed) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = '#f4f1ea';
    g.fillRect(-pw / 2 - 8, -ph / 2 - 8, pw + 16, ph + 34);
    g.save();
    g.translate(-pw / 2, -ph / 2);
    drawGroupPhoto(g, pw, ph, seeded(seed));
    g.restore();
    g.restore();
    pin(x, y - ph / 2 - 2);
  };
  photo(170, 170, 240, 160, -0.06, 3);
  photo(190, 440, 220, 150, 0.05, 11);
  // notes
  const note = (x, y, lines, color, rot) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = color;
    g.fillRect(-90, -60, 180, 120);
    g.fillStyle = '#1d2a36';
    g.font = `22px ${HAND}`;
    lines.forEach((l, i) => g.fillText(l, -78, -24 + i * 30));
    g.restore();
    pin(x, y - 56, '#2a6fd8');
  };
  note(395, 140, ['MOVIE NIGHT', 'Fri 2100', 'lounge'], '#f6ec9a', 0.04);
  note(390, 470, ['Filters due!!', 'not again,', 'Navarro'], '#ffd3a8', -0.05);
  // the chore wheel
  const cx = w * 0.72, cy = h * 0.53, r = Math.min(w, h) * 0.33;
  g.fillStyle = '#f4f1ea';
  g.beginPath();
  g.arc(cx, cy, r + 10, 0, Math.PI * 2);
  g.fill();
  const n = CREW.length;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
    g.fillStyle = i % 2 ? '#dfe8ee' : '#cfdde6';
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, r, a0, a1);
    g.closePath();
    g.fill();
    g.strokeStyle = '#1d2a36';
    g.lineWidth = 2;
    g.stroke();
    const am = (a0 + a1) / 2;
    g.save();
    g.translate(cx + Math.cos(am) * r * 0.62, cy + Math.sin(am) * r * 0.62);
    g.rotate(am + Math.PI / 2);
    g.fillStyle = '#1d2a36';
    g.font = `bold 16px ${HAND}`;
    g.textAlign = 'center';
    g.fillText(CHORES[i], 0, 0);
    g.restore();
    // the names round the rim
    g.fillStyle = '#1d2a36';
    g.font = `bold 24px ${HAND}`;
    g.textAlign = 'center';
    g.fillText(CREW[i], cx + Math.cos(am) * (r + 34), cy + Math.sin(am) * (r + 34) + 8);
  }
  g.fillStyle = '#d8352a';
  g.beginPath();
  g.arc(cx, cy, 14, 0, Math.PI * 2);
  g.fill();
  g.textAlign = 'left';
  g.font = `bold 30px ${HAND}`;
  g.fillStyle = '#1d2a36';
  g.fillText('CHORES', cx - 60, cy - r - 30);
}

// The y of the first surface below a point (sofa arm, table top), or null
function surfaceBelow(meshes, x, z) {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0), 0, 4);
  const hit = ray.intersectObjects(meshes, false)[0];
  return hit ? hit.point.y : null;
}

// Builds the clues. Returns the world positions of each, for the interaction spots.
export function buildHallClues(scene, atrium) {
  const meshes = [];
  atrium.traverse((o) => { if (o.isMesh && o.visible && !o.name.startsWith('COL_')) meshes.push(o); });
  const out = {};

  // the photo board, on a dark backing, facing the middle of the atrium
  {
    const a = THREE.MathUtils.degToRad(BOARD_AT.angle);
    const p = new THREE.Vector3(BOARD_AT.r * Math.cos(a), BOARD_AT.y, -BOARD_AT.r * Math.sin(a));
    const board = new THREE.Group();
    board.name = 'Clue_PhotoBoard';
    const backing = new THREE.Mesh(new THREE.BoxGeometry(BOARD_AT.w + 0.08, BOARD_AT.h + 0.08, 0.03),
      withHubLighting(new THREE.MeshStandardMaterial({ color: 0x22272c, roughness: 0.5, metalness: 0.3 })));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_AT.w, BOARD_AT.h),
      withHubLighting(new THREE.MeshStandardMaterial({ map: canvasTexture(1024, 640, drawBoard), roughness: 0.85, metalness: 0 })));
    face.position.z = 0.016;
    board.add(backing, face);
    board.position.copy(p);
    board.lookAt(0, p.y, 0);
    scene.add(board);
    out.board = p.clone();
    out.boardTop = p.clone().setY(p.y + BOARD_AT.h / 2);
  }

  // the framed photo on a coffee table, standing on its easel, a little dusty
  const fy = surfaceBelow(meshes, FRAME_AT.x, FRAME_AT.z);
  if (fy !== null) {
    const frame = new THREE.Group();
    frame.name = 'Clue_Frame';
    const black = withHubLighting(new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.45, metalness: 0.2 }));
    const tex = canvasTexture(512, 360, (g, w, h) => drawGroupPhoto(g, w, h, seeded(5)));
    const border = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.014), black);
    const picture = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.15),
      withHubLighting(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0 })));
    picture.position.z = 0.0075;
    const easel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.01), black);
    easel.position.set(0, -0.02, -0.04);
    easel.rotation.x = -0.45;
    frame.add(border, picture, easel);
    frame.rotation.set(-0.22, FRAME_AT.turn, 0, 'YXZ');
    frame.position.set(FRAME_AT.x, fy + 0.085, FRAME_AT.z);
    scene.add(frame);
    out.frame = frame.position.clone();
  }

  // a half-eaten ration tray on a sofa arm, the fork dropped beside it
  const ry = surfaceBelow(meshes, RATION_AT.x, RATION_AT.z);
  if (ry !== null) {
    const tray = new THREE.Group();
    tray.name = 'Clue_Ration';
    const foil = withHubLighting(new THREE.MeshStandardMaterial({ color: 0xb8bec4, roughness: 0.3, metalness: 0.8 }));
    const food = withHubLighting(new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.8, metalness: 0 }));
    const greens = withHubLighting(new THREE.MeshStandardMaterial({ color: 0x5c7a3a, roughness: 0.8, metalness: 0 }));
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.16), foil);
    base.position.y = 0.015;
    const lump = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), food);
    lump.scale.y = 0.5;
    lump.position.set(-0.05, 0.035, 0.02);
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.05), greens);
    side.position.set(0.06, 0.035, -0.03);
    const fork = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.006, 0.014), foil);
    fork.position.set(0.02, 0.006, 0.11);
    fork.rotation.y = 0.5;
    tray.add(base, lump, side, fork);
    tray.rotation.y = RATION_AT.turn;
    tray.position.set(RATION_AT.x, ry, RATION_AT.z);
    scene.add(tray);
    out.ration = tray.position.clone().add(new THREE.Vector3(0, 0.04, 0));
  }
  return out;
}

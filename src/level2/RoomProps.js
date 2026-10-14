import * as THREE from 'three';
import { withHubLighting } from '../graphics/HubMaterials.js';

// The things to read upstairs (scenes 2.6 to 2.8), placed on the furniture already in the
// rooms: in the crew bunk (Voss's old room, east) name plates on the bunks (one says J. VOSS),
// two bunkside terminals with audio logs, a corkboard with the scan rota, his personal log
// terminal, and a row of crew lockers, his left ajar with the letter and Kessler's card inside;
// in Kessler's room (north-east) her desk monitor and the code card pinned beside it. Smooth
// navy, soft black and orange, like the rest of the station.
//
// Returns where each one is, for the E spots. Positions are from the atrium model (floor 5.5 m).

const FLOOR = 5.5;
const BENCH = 6.66;               // the workbenches' tops, in both rooms

const NAVY = 0x16233a;
const BLACK = 0x15181c;
const ORANGE = 0xf07a14;

let mats = null;
function materials() {
  if (mats) return mats;
  const m = (color, roughness = 0.5, metalness = 0.2) => withHubLighting(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  mats = { navy: m(NAVY, 0.45), black: m(BLACK), orange: m(ORANGE, 0.4), cloth: m(0x8f969c, 0.9, 0), paper: m(0xe6e1d3, 0.9, 0), cork: m(0x8b6a47, 0.95, 0) };
  return mats;
}

// a lit screen: dark glass with lines of text (the first line is the header)
function screenTexture(lines, colour = '#00e5ff', w = 256, h = 160) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#04121a';
  g.fillRect(0, 0, w, h);
  g.fillStyle = colour;
  g.font = 'bold 20px Courier New, monospace';
  lines.forEach((line, i) => {
    g.globalAlpha = i === 0 ? 1 : 0.8;
    g.font = (i === 0 ? 'bold 20px' : '16px') + ' Courier New, monospace';
    g.fillText(line, 14, 32 + i * 26);
  });
  g.globalAlpha = 0.5;
  g.fillRect(14, h - 22, 60, 4);        // a cursor bar
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function screenMaterial(lines, colour) {
  const mat = new THREE.MeshBasicMaterial({ map: screenTexture(lines, colour) });
  mat.color.setScalar(1.25);            // a little over 1: it glows
  return mat;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

// place a group at (x, y, z), its front (+z) turned to face `yaw`; returns a point in front of it
function place(scene, group, x, y, z, yaw) {
  group.position.set(x, y, z);
  group.rotation.y = yaw;
  scene.add(group);
  group.updateMatrixWorld(true);
  return group;
}

// a desk monitor standing on a surface at y; screen centre returned
function monitor(scene, x, y, z, yaw, lines, colour) {
  const M = materials();
  const g = new THREE.Group();
  g.add(box(0.24, 0.02, 0.16, M.black, 0, 0.01, 0));
  g.add(box(0.04, 0.2, 0.04, M.black, 0, 0.11, -0.02));
  g.add(box(0.54, 0.34, 0.04, M.black, 0, 0.36, 0));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), screenMaterial(lines, colour));
  screen.position.set(0, 0.36, 0.021);
  g.add(screen);
  place(scene, g, x, y, z, yaw);
  return screen.getWorldPosition(new THREE.Vector3());
}

// a small screen on a wall or the side of a bunk; screen centre returned
function wallScreen(scene, x, y, z, yaw, lines, colour) {
  const M = materials();
  const g = new THREE.Group();
  g.add(box(0.56, 0.38, 0.04, M.black, 0, 0, 0));
  g.add(box(0.56, 0.03, 0.05, M.orange, 0, -0.205, 0));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.33), screenMaterial(lines, colour));
  screen.position.z = 0.021;
  g.add(screen);
  place(scene, g, x, y, z, yaw);
  return screen.getWorldPosition(new THREE.Vector3());
}

// the corkboard: photos and pinned sheets, the scan rota among them
function corkboard(scene, x, y, z, yaw) {
  const M = materials();
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 340;
  const g = c.getContext('2d');
  g.fillStyle = '#8b6a47';
  g.fillRect(0, 0, 512, 340);
  for (let i = 0; i < 900; i++) {                       // the cork's grain
    g.fillStyle = `rgba(${60 + Math.random() * 60},${40 + Math.random() * 40},20,0.35)`;
    g.fillRect(Math.random() * 512, Math.random() * 340, 2, 2);
  }
  const sheet = (sx, sy, w, h, rot, draw) => {
    g.save();
    g.translate(sx, sy);
    g.rotate(rot);
    g.fillStyle = '#ece7da';
    g.fillRect(-w / 2, -h / 2, w, h);
    draw?.(w, h);
    g.fillStyle = '#c0392b';
    g.beginPath();
    g.arc(0, -h / 2 + 8, 5, 0, Math.PI * 2);            // the pin
    g.fill();
    g.restore();
  };
  // photos (blurred faces: shapes, not people)
  for (const [px, py, r] of [[80, 90, -0.08], [175, 70, 0.06], [95, 230, 0.05], [420, 250, -0.07]]) {
    sheet(px, py, 86, 64, r, (w, h) => {
      g.fillStyle = '#3d4e5c';
      g.fillRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);
      g.fillStyle = '#c9a98c';
      g.beginPath();
      g.arc(-12, 2, 9, 0, Math.PI * 2);
      g.arc(14, 4, 9, 0, Math.PI * 2);
      g.fill();
    });
  }
  // the rota
  sheet(330, 120, 210, 170, 0.03, (w, h) => {
    g.fillStyle = '#20262e';
    g.font = 'bold 15px Courier New, monospace';
    g.fillText('SCAN SESSIONS', -w / 2 + 14, -h / 2 + 36);
    g.font = '13px Courier New, monospace';
    g.fillText('B-LAB, 0600-0900', -w / 2 + 14, -h / 2 + 58);
    ['MON  J. VOSS', 'TUE  J. VOSS', 'WED  J. VOSS', 'THU  J. VOSS', 'FRI  J. VOSS'].forEach((t, i) => g.fillText(t, -w / 2 + 14, -h / 2 + 84 + i * 16));
    g.fillText('OPERATOR: J. VOSS', -w / 2 + 14, h / 2 - 8);
  });
  sheet(225, 260, 110, 80, -0.1, (w, h) => {
    g.strokeStyle = '#7b8794';
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(-w / 2 + 10, -h / 2 + 22 + i * 14);
      g.lineTo(w / 2 - 12, -h / 2 + 22 + i * 14);
      g.stroke();
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group();
  grp.add(box(1.16, 0.8, 0.03, M.navy));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.73), withHubLighting(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })));
  face.position.z = 0.016;
  grp.add(face);
  place(scene, grp, x, y, z, yaw);
  return face.getWorldPosition(new THREE.Vector3());
}

// an orange name plate (on a locker door or a bunk's rail)
function nameTag(name, w = 0.3, h = 0.075) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f07a14';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#15181c';
  g.font = 'bold 66px Courier New, monospace';
  g.textAlign = 'center';
  g.fillText(name, 256, 88);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), withHubLighting(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 })));
}

// A crew locker: navy, an orange name tag. Voss's is left ajar, with a uniform and a manual
// inside, the letter on the shelf and Kessler's card taped inside the door.
// Returns { spot, body (for a collider) }.
function locker(scene, x, z, yaw, name = 'J. VOSS', ajar = true) {
  const M = materials();
  const W = 0.8, H = 1.95, D = 0.5, T = 0.025;
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.add(box(W, H, T, M.navy, 0, H / 2, -D / 2 + T / 2));          // back
  body.add(box(T, H, D, M.navy, -W / 2 + T / 2, H / 2, 0));          // sides
  body.add(box(T, H, D, M.navy, W / 2 - T / 2, H / 2, 0));
  body.add(box(W, T, D, M.navy, 0, H - T / 2, 0));                   // top, bottom, shelf
  body.add(box(W, 0.08, D, M.black, 0, 0.04, 0));
  body.add(box(W - 2 * T, T, D - T, M.navy, 0, 1.55, 0));
  g.add(body);
  if (ajar) {
    // inside: a uniform on its hanger, a dog-eared manual and the letter on the shelf
    g.add(box(0.42, 0.85, 0.12, M.cloth, -0.08, 1.02, -0.05));
    g.add(box(0.2, 0.04, 0.26, M.orange, 0.2, 1.585, -0.02));
    const letter = box(0.21, 0.004, 0.28, M.paper, -0.18, 1.57, 0.02);
    letter.rotation.y = 0.25;
    g.add(letter);
  }
  // the door, hinged on its left edge and opened a hand's width
  const hinge = new THREE.Group();
  hinge.position.set(-W / 2, 0, D / 2);
  const door = box(W - 0.01, H - 0.04, T, M.navy, W / 2, H / 2, 0);
  hinge.add(door);
  // vents, the orange name tag, and the card taped inside
  for (let i = 0; i < 4; i++) hinge.add(box(0.4, 0.02, 0.005, M.black, W / 2, H - 0.25 - i * 0.05, T / 2 + 0.002));
  const tagMesh = nameTag(name);
  tagMesh.position.set(W / 2, 1.45, T / 2 + 0.003);
  hinge.add(tagMesh);
  if (ajar) {
    const card = box(0.085, 0.054, 0.003, new THREE.MeshBasicMaterial({ color: 0x9fe8ff }), W / 2 + 0.1, 1.25, -T / 2 - 0.003);
    hinge.add(card);
    hinge.add(box(0.12, 0.05, 0.002, M.paper, W / 2 + 0.1, 1.18, -T / 2 - 0.003));
    hinge.rotation.y = -0.55;
  }
  g.add(hinge);
  place(scene, g, x, FLOOR, z, yaw);
  return { spot: new THREE.Vector3(0, 1.4, D / 2).applyMatrix4(g.matrixWorld), body };
}

export function buildRoomProps(scene) {
  const spots = {};
  // ---- the crew bunk (x 17.3 to 25.9, z -5.4 to 3.0): south wall z 3, north wall z -5.4
  spots.personalLog = monitor(scene, 24.05, BENCH, 2.3, Math.PI, ['J. VOSS', 'PERSONAL LOG', '5 ENTRIES'], '#00e5ff');
  spots.bunkLogA = wallScreen(scene, 18.35, 7.0, -5.35, 0, ['CREW LOG', 'AUDIO  0:41'], '#7fd6ff');
  spots.bunkLogB = wallScreen(scene, 21.79, 6.55, -4.1, -Math.PI / 2, ['CREW LOG', 'AUDIO  0:22'], '#7fd6ff');
  spots.corkboard = corkboard(scene, 17.46, 7.25, -3.15, Math.PI / 2);   // (the wall's face is at x 17.42)
  // the crew lockers along the south wall, Voss's in the middle, ajar
  spots.lockerBodies = [];
  for (const [x, name] of [[18.85, 'A. OKAFOR'], [19.7, 'J. VOSS'], [20.55, 'T. LINDQVIST']]) {
    const lk = locker(scene, x, 2.72, Math.PI, name, name === 'J. VOSS');
    spots.lockerBodies.push(lk.body);
    if (name === 'J. VOSS') spots.locker = lk.spot;
  }
  // name plates on the bunks' front rails (the bunk's open side faces south, at z -2.56): the
  // lower bunks' bases and the upper bunks' rails, one bunk each end
  for (const [x, y, name] of [[22.85, 5.86, 'J. VOSS'], [24.8, 5.86, 'R. NAVARRO'], [22.85, 7.38, 'S. PARK'], [24.8, 7.38, 'D. ITO']]) {
    const tag = nameTag(name, 0.52, 0.13);
    tag.position.set(x, y, -2.535);
    scene.add(tag);
    if (name === 'J. VOSS') spots.myBunk = tag.position.clone();
  }
  // ---- Kessler's room: her monitor on the workbench, facing her door; the card pinned beside it
  const desk = new THREE.Vector3(17.8, BENCH, -14.7);
  const door = new THREE.Vector3(12.1, BENCH, -12.1);
  const yaw = Math.atan2(door.x - desk.x, door.z - desk.z);
  spots.kesslerLog = monitor(scene, desk.x, desk.y, desk.z, yaw, ['DR. E. KESSLER', 'SHIP LOG', 'FINAL ENTRY  >'], '#9fe8ff');
  // the card on a little stand to the monitor's right
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const M = materials();
  const stand = new THREE.Group();
  stand.add(box(0.12, 0.012, 0.08, M.black, 0, 0.006, 0));
  const cardMesh = box(0.14, 0.09, 0.004, M.paper, 0, 0.06, 0);
  cardMesh.rotation.x = -0.3;
  stand.add(cardMesh);
  const cp = desk.clone().addScaledVector(right, 0.42);
  place(scene, stand, cp.x, cp.y, cp.z, yaw);
  spots.codeCard = cardMesh.getWorldPosition(new THREE.Vector3());
  return spots;
}

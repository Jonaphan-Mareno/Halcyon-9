import * as THREE from 'three';

// The crew quarters' shells (the bedrooms' plain painted boxes), finished as somewhere people
// live rather than in the station's steel plate: walls of warm cream panels over a wood
// wainscot with a rail, a warm carpet of tiles, a soft panelled ceiling. The textures are drawn
// once on canvases (nothing to download).
//
// Every corner is mapped in world metres, the shell's own UVs being one squash over the box: a
// wall's texture runs PANEL metres across and the room's full height up (so the wainscot and the
// rail sit at the same height everywhere), the floor's and the ceiling's lie flat, TILE metres to
// a repeat. The mesh is rebuilt unindexed (a few hundred corners), its triangles grouped by what
// they are (floor, ceiling, wall) for the three materials.

const FLOOR = 5.5;         // the bedrooms' floor, and their height to the ceiling (m)
const HEIGHT = 3.54;
const PANEL = 1.2;         // one wall panel's width; the floor's and ceiling's repeat
const TILE = 1.2;
const WAINSCOT = 1.0;      // the wood up to the rail (m)

function canvasTexture(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}

// a seeded random, so the speckle is the same every time
function random(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// one panel's width, the room's full height (the canvas's top is the ceiling)
function drawWall(g, w, h) {
  const y = (m) => h * (1 - m / HEIGHT);            // metres up the wall -> canvas
  const rnd = random(11);
  g.fillStyle = '#d6cab3';                           // the cream panel
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) {                   // a faint paint texture
    g.fillStyle = `rgba(${rnd() < 0.5 ? '255,250,240' : '120,100,80'},${0.04 + rnd() * 0.04})`;
    g.fillRect(rnd() * w, rnd() * h, 2, 2);
  }
  g.fillStyle = 'rgba(90,70,50,0.10)';               // the cove under the ceiling
  g.fillRect(0, 0, w, y(HEIGHT - 0.22));
  g.fillStyle = 'rgba(80,62,45,0.55)';               // the panel's seams: its edge and a cross joint
  g.fillRect(0, 0, 2, h);
  g.fillStyle = 'rgba(255,250,240,0.35)';
  g.fillRect(2, 0, 1, h);
  g.fillStyle = 'rgba(80,62,45,0.4)';
  g.fillRect(0, y(2.4), w, 2);

  // the wainscot: boards of warm wood, then the rail
  const top = y(WAINSCOT);
  g.fillStyle = '#6e4b31';
  g.fillRect(0, top, w, h - top);
  const boards = 4;
  for (let b = 0; b < boards; b++) {
    const x0 = (b * w) / boards;
    g.fillStyle = `rgba(${b % 2 ? '255,220,180' : '40,25,15'},0.06)`;
    g.fillRect(x0, top, w / boards, h - top);
    for (let k = 0; k < 18; k++) {                   // the grain
      g.fillStyle = `rgba(40,24,12,${0.08 + rnd() * 0.1})`;
      g.fillRect(x0 + rnd() * (w / boards), top + rnd() * (h - top), 1, 20 + rnd() * 60);
    }
    g.fillStyle = 'rgba(30,18,10,0.6)';
    g.fillRect(x0, top, 2, h - top);
  }
  g.fillStyle = '#4a3020';                           // the rail and the skirting
  g.fillRect(0, top - h * 0.012, w, h * 0.016);
  g.fillStyle = 'rgba(255,230,200,0.25)';
  g.fillRect(0, top - h * 0.012, w, 2);
  g.fillStyle = '#3e281a';
  g.fillRect(0, y(0.1), w, h - y(0.1));
}

// TILE square: four carpet tiles, each laid a shade different
function drawFloor(g, w, h) {
  const rnd = random(23);
  const tones = ['#7b6551', '#76604c', '#73604e', '#7e6852'];
  for (let i = 0; i < 4; i++) {
    g.fillStyle = tones[i];
    g.fillRect((i % 2) * (w / 2), Math.floor(i / 2) * (h / 2), w / 2, h / 2);
  }
  for (let i = 0; i < 9000; i++) {                   // the pile
    const v = rnd();
    g.fillStyle = v < 0.5 ? `rgba(40,28,20,${0.12 + rnd() * 0.12})` : `rgba(200,170,140,${0.06 + rnd() * 0.08})`;
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  g.fillStyle = 'rgba(35,25,18,0.45)';               // the tiles' joins
  g.fillRect(0, 0, w, 2);
  g.fillRect(0, h / 2, w, 2);
  g.fillRect(0, 0, 2, h);
  g.fillRect(w / 2, 0, 2, h);
}

function drawCeiling(g, w, h) {
  const rnd = random(5);
  g.fillStyle = '#d2c9b8';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1200; i++) {
    g.fillStyle = `rgba(110,95,75,${0.03 + rnd() * 0.04})`;
    g.fillRect(rnd() * w, rnd() * h, 2, 2);
  }
  g.fillStyle = 'rgba(90,75,60,0.35)';
  g.fillRect(0, 0, w, 3);
  g.fillRect(0, 0, 3, h);
}

let mats = null;
function shellMaterials() {
  if (mats) return mats;
  const m = (map, roughness) => new THREE.MeshStandardMaterial({ map, roughness, metalness: 0, side: THREE.DoubleSide });
  mats = {
    floor: m(canvasTexture(512, 512, drawFloor), 0.97),
    ceiling: m(canvasTexture(256, 256, drawCeiling), 0.9),
    wall: m(canvasTexture(256, 1024, drawWall, false), 0.85)
  };
  mats.floor.name = 'bed_shell_floor';
  mats.ceiling.name = 'bed_shell_ceiling';
  mats.wall.name = 'bed_shell_wall';
  return mats;
}

// Finish every mesh under each named object (the object, or its child meshes) as a lived-in room
export function applyBedroomShell(root, names) {
  const M = shellMaterials();
  const p = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector3();
  const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  for (const name of names) {
    const top = root.getObjectByName(name) || root.getObjectByName(name.replace(/\./g, ''));
    if (!top) {
      console.warn('applyBedroomShell: no object named', name);
      continue;
    }
    const meshes = [];
    top.traverse((m) => { if (m.isMesh) meshes.push(m); });

    for (const o of meshes) {
      if (Array.isArray(o.material) && o.material[0] === M.floor) continue;     // (done already)
      if (!o.geometry.attributes.position || !o.geometry.attributes.normal) continue;
      o.updateWorldMatrix(true, false);
      const mw = o.matrixWorld;
      const src = o.geometry.toNonIndexed();
      const pos = src.attributes.position;
      const count = pos.count / 3;

      // each triangle's facing in the world, from its corners (the shell's normals are smoothed
      // round its corners, so a wall's corner by the floor can point half up)
      const facing = (t, out) => {
        for (let k = 0; k < 3; k++) tri[k].fromBufferAttribute(pos, t * 3 + k).applyMatrix4(mw);
        return out.subVectors(tri[1], tri[0]).cross(c.subVectors(tri[2], tri[0])).normalize();
      };

      // each triangle's kind, by its facing (and, facing up or down, by its height)
      const kinds = { floor: [], ceiling: [], wall: [] };
      for (let t = 0; t < count; t++) {
        facing(t, n);
        c.copy(tri[0]).add(tri[1]).add(tri[2]).divideScalar(3);
        const flat = Math.abs(n.y) > Math.max(Math.abs(n.x), Math.abs(n.z));
        kinds[!flat ? 'wall' : c.y < FLOOR + HEIGHT / 2 ? 'floor' : 'ceiling'].push(t);
      }

      // the room's turn (Kessler's stands at an angle in the atrium), from its first wall: the
      // floor's and ceiling's tiles are laid square to the walls
      let turn = 0;
      if (kinds.wall.length) {
        facing(kinds.wall[0], n);
        turn = Math.atan2(n.z, n.x);
      }
      const cs = Math.cos(turn), sn = Math.sin(turn);

      // the triangles again, kind by kind, each corner mapped in world metres: a wall's along the
      // wall (its own horizontal) and up it, the floor's and ceiling's across them
      const order = [...kinds.floor, ...kinds.ceiling, ...kinds.wall];
      const g = new THREE.BufferGeometry();
      const P = new Float32Array(order.length * 9), N = new Float32Array(order.length * 9), U = new Float32Array(order.length * 6);
      order.forEach((t, i) => {
        facing(t, n);
        const wall = i >= kinds.floor.length + kinds.ceiling.length;
        const along = Math.hypot(n.x, n.z) || 1;                 // the wall's horizontal: (-n.z, n.x)
        // the triangle's own normal, in the mesh's space (a box: flat faces, crisp corners)
        for (let k = 0; k < 3; k++) tri[k].fromBufferAttribute(pos, t * 3 + k);
        const fn = tri[1].sub(tri[0]).cross(tri[2].sub(tri[0])).normalize();
        const fx = fn.x, fy = fn.y, fz = fn.z;
        for (let k = 0; k < 3; k++) {
          const v = t * 3 + k;
          p.fromBufferAttribute(pos, v);
          P.set([p.x, p.y, p.z], (i * 3 + k) * 3);
          N.set([fx, fy, fz], (i * 3 + k) * 3);
          p.applyMatrix4(mw);
          const uv = wall
            ? [(-n.z * p.x + n.x * p.z) / along / PANEL, (p.y - FLOOR) / HEIGHT]
            : [(cs * p.x + sn * p.z) / TILE, (-sn * p.x + cs * p.z) / TILE];
          U.set(uv, (i * 3 + k) * 2);
        }
      });
      g.setAttribute('position', new THREE.BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      let start = 0;
      [kinds.floor, kinds.ceiling, kinds.wall].forEach((list, m) => {
        g.addGroup(start * 3, list.length * 3, m);
        start += list.length;
      });
      o.geometry.dispose();
      src.dispose();
      o.geometry = g;
      o.material = [M.floor, M.ceiling, M.wall];
    }
  }
}

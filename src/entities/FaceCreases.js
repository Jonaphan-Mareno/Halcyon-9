import * as THREE from 'three';

// Creases in the skin that come and go with the face: two short upright lines between the brows
// (and a fainter one across the bridge of the nose) as the brows knit, and lines across the
// forehead as they rise. The face's morphs move the brows but cannot draw a fold, so an angry face
// read as a calm one with lowered brows.
//
// Each set is a patch cut from the head's own mesh (its vertices copied with their skin weights
// and morph deltas, so it bends and moves exactly as the face does), drawn just in front of it,
// dark lines on clear. Where the patches go is found from the brow_down morph: the vertices it
// moves most are the brows; the patches sit between and above them. Any head with brow_down works
// (Voss's crew all have his face's morphs).
//
// FaceRig drives them (attachCreases): the knit from brow_down, the forehead from the brows
// raised or worried.

const KNIT = { from: 0.12, to: 0.9, most: 0.6 };          // brow_down -> the lines between the brows
const RAISE = { from: 0.2, to: 1.0, most: 0.4 };          // brow_up / brow_inner_up -> the forehead
const INK = 0x1c0c07;                                     // a deep skin shadow, not black

export class FaceCreases {
  // head: the head's (skinned) mesh, with a brow_down morph
  constructor(head) {
    this.head = head;
    this.meshes = [];
    this.patches = {};
    this.knit = 0;
    this.raise = 0;
    const geo = head.geometry, dict = head.morphTargetDictionary;
    const bd = dict?.brow_down;
    const deltas = geo.morphAttributes.position?.[bd];
    this.ok = !!(deltas && head.isSkinnedMesh && geo.index);
    if (!this.ok) return;

    // the brows: what brow_down moves most
    const pos = geo.attributes.position;
    let most = 0;
    for (let i = 0; i < deltas.count; i++) most = Math.max(most, Math.hypot(deltas.getX(i), deltas.getY(i), deltas.getZ(i)));
    const brow = [];
    for (let i = 0; i < deltas.count; i++) {
      if (Math.hypot(deltas.getX(i), deltas.getY(i), deltas.getZ(i)) > 0.45 * most) brow.push(i);
    }
    // (the heads are built in Voss's space, square to it: the middle of the face is x 0)
    const cx = 0;
    let cy = 0, w = 0;
    for (const i of brow) {
      cy += pos.getY(i);
      w = Math.max(w, Math.abs(pos.getX(i)));
    }
    cy /= brow.length;                                    // the brows' height; w: half their span
    // the front of the face there (+z: the model's own forward)
    let front = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getX(i) - cx) < 0.15 * w && Math.abs(pos.getY(i) - cy) < 0.3 * w) front = Math.max(front, pos.getZ(i));
    }
    this.frame = { cy, w, front, brow: brow.length };

    // between the brows: a patch from the nose's bridge to a little above the brows (the texture
    // is drawn in the same shares of w: see _drawKnit)
    this._patch('knit', { x0: cx - 0.5 * w, x1: cx + 0.5 * w, y0: cy - 0.45 * w, y1: cy + 0.55 * w }, front - 0.4 * w,
      (g, s) => this._drawKnit(g, s));
    // the forehead
    this._patch('raise', { x0: cx - 0.95 * w, x1: cx + 0.95 * w, y0: cy + 0.12 * w, y1: cy + 1.05 * w }, front - 0.6 * w,
      (g, s) => this._drawRaise(g, s));
  }

  // A patch of the head inside a box (x and y, in front of minZ), with its own texture laid flat
  // across the box
  _patch(name, box, minZ, draw) {
    const head = this.head, geo = head.geometry, idx = geo.index, pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const inside = (i) => {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      return x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1 && z >= minZ && (!nrm || nrm.getZ(i) > 0.2);
    };
    const map = new Map(), tris = [];
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      if (!inside(a) || !inside(b) || !inside(c)) continue;
      for (const v of [a, b, c]) {
        if (!map.has(v)) map.set(v, map.size);
        tris.push(map.get(v));
      }
    }
    if (!tris.length) return;
    const verts = [...map.keys()];
    const out = new THREE.BufferGeometry();
    const copy = (attr) => {
      const n = attr.itemSize, src = attr.array, arr = new attr.array.constructor(verts.length * n);
      verts.forEach((v, k) => { for (let j = 0; j < n; j++) arr[k * n + j] = src[v * n + j]; });
      return new THREE.BufferAttribute(arr, n, attr.normalized);
    };
    for (const key of ['position', 'normal', 'skinIndex', 'skinWeight']) {
      if (geo.attributes[key]) out.setAttribute(key, copy(geo.attributes[key]));
    }
    for (const [key, list] of Object.entries(geo.morphAttributes)) out.morphAttributes[key] = list.map(copy);
    out.morphTargetsRelative = geo.morphTargetsRelative;
    // the texture flat across the box, as the face is seen from the front
    const uv = new Float32Array(verts.length * 2);
    verts.forEach((v, k) => {
      uv[k * 2] = (pos.getX(v) - box.x0) / (box.x1 - box.x0);
      uv[k * 2 + 1] = (pos.getY(v) - box.y0) / (box.y1 - box.y0);
    });
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setIndex(tris);

    const c = document.createElement('canvas');
    c.width = c.height = 256;
    draw(c.getContext('2d'), 256);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({
      color: INK, alphaMap: tex, transparent: true, opacity: 0, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4
    });
    const mesh = new THREE.SkinnedMesh(out, mat);
    mesh.name = 'Creases_' + name;
    mesh.morphTargetInfluences = head.morphTargetInfluences;      // (the same array: they move as one)
    mesh.morphTargetDictionary = head.morphTargetDictionary;
    mesh.position.copy(head.position);
    mesh.quaternion.copy(head.quaternion);
    mesh.scale.copy(head.scale);
    mesh.bind(head.skeleton, head.bindMatrix);
    mesh.frustumCulled = false;
    mesh.renderOrder = (head.renderOrder || 0) + 1;
    mesh.visible = false;
    head.parent.add(mesh);
    this.meshes.push(mesh);
    this.patches[name] = mesh;
  }

  // Two upright folds between the brows, leaning in at the top, a shorter one outside each, and a
  // fainter fold across the bridge of the nose (the alpha map's white is ink). The patch is a
  // brow's half-span (w) wide and tall, the brows' line at 0.45 of the way up.
  _drawKnit(g, s) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
    g.filter = 'blur(6px)';
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    const X = (share) => s * (0.5 + share);                // across, in shares of w from the middle
    const Y = (share) => s * (1 - (0.45 + share));         // up from the brows' line (canvas y runs down)
    for (const side of [-1, 1]) {
      g.lineWidth = s * 0.06;
      g.beginPath();
      g.moveTo(X(side * 0.13), Y(-0.3));
      g.quadraticCurveTo(X(side * 0.1), Y(-0.1), X(side * 0.12), Y(0.12));
      g.stroke();
      g.lineWidth = s * 0.035;
      g.globalAlpha = 0.5;
      g.beginPath();
      g.moveTo(X(side * 0.25), Y(-0.2));
      g.quadraticCurveTo(X(side * 0.22), Y(-0.08), X(side * 0.24), Y(0.04));
      g.stroke();
      g.globalAlpha = 1;
    }
    g.lineWidth = s * 0.04;
    g.globalAlpha = 0.45;
    g.beginPath();
    g.moveTo(X(-0.13), Y(-0.38));
    g.quadraticCurveTo(X(0), Y(-0.41), X(0.13), Y(-0.38));
    g.stroke();
    // fade out toward the patch's edges
    g.filter = 'none';
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-in';
    const r = g.createRadialGradient(s / 2, s * 0.6, s * 0.25, s / 2, s * 0.6, s * 0.48);
    r.addColorStop(0, '#fff');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
  }

  // Three or four shallow lines across the forehead, bowed up in the middle
  _drawRaise(g, s) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
    g.filter = 'blur(3px)';
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    const rows = [[0.62, 0.36, 0.9], [0.47, 0.42, 1], [0.32, 0.38, 0.85], [0.19, 0.28, 0.5]];
    for (const [y, half, a] of rows) {
      g.globalAlpha = a;
      g.lineWidth = s * 0.022;
      g.beginPath();
      g.moveTo(s * (0.5 - half), s * (y + 0.03));
      g.quadraticCurveTo(s * 0.5, s * (y - 0.05), s * (0.5 + half), s * (y + 0.03));
      g.stroke();
    }
    g.filter = 'none';
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-in';
    const r = g.createRadialGradient(s / 2, s * 0.45, s * 0.2, s / 2, s * 0.45, s * 0.5);
    r.addColorStop(0, '#fff');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
  }

  // knit, raise: the morphs' amounts (brow_down; the larger of brow_up and brow_inner_up)
  set(knit, raise) {
    if (!this.ok) return;
    const k = (this.knit = THREE.MathUtils.smoothstep(knit, KNIT.from, KNIT.to) * KNIT.most);
    // (a knit brow pulls the forehead down: its lines give way)
    const r = (this.raise = THREE.MathUtils.smoothstep(raise, RAISE.from, RAISE.to) * RAISE.most * (1 - k / KNIT.most));
    for (const [mesh, a] of [[this.patches.knit, k], [this.patches.raise, r]]) {
      if (!mesh) continue;
      mesh.material.opacity = a;
      mesh.visible = a > 0.01;
    }
  }

  dispose() {
    for (const m of this.meshes) {
      m.removeFromParent();
      m.geometry.dispose();
      m.material.alphaMap?.dispose();
      m.material.dispose();
    }
    this.meshes = [];
  }
}

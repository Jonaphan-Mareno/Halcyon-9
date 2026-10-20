// Voss with a face that moves and the wound on the back of his head:
//
//   node scripts/build-voss-v2.mjs [--draco]
//
// Reads public/assets/models/human_scientist.glb and Blender/voss_face.json (made by
// Blender/scripts/build_voss_face.py) and writes public/assets/models/human_scientist_v2.glb.
// Everything already in the glb is kept as it is (the rig, every clip, the materials, the body
// parts); this only adds:
//
//   - morph targets on the Head mesh (jaw_open, mouth_wide, mouth_pucker, mouth_smile, mouth_frown,
//     blink, eyes_tired, brow_up, brow_down, brow_inner_up, brow_up_L, brow_up_R), on every
//     primitive of it, named in the mesh's extras.targetNames (three.js reads them into
//     morphTargetDictionary)
//   - three more Head primitives cut out of the skin, sharing its vertices and morphs:
//       M_MouthInner  the gums, the mouth's lining and the back of the throat: plain flesh (no
//                     texture: the skin's picture on them read as pale slabs), darkened toward the
//                     throat by a vertex colour so an open mouth has depth
//       M_Teeth       the teeth: not cut out but made anew, one smooth plain band per arch following
//                     the head's own teeth, with their skinning and morphs
//       M_LipSeal     the row of faces sealing the lips (same look as the skin); the game hides it
//                     while the mouth is open (see FaceRig), so the shut mouth looks as it always did
//   - Wound: the shaved patch, gash and neural port on the back of the skull, skinned to the head
//     bone. The hair cards over it move to a primitive of their own (M_HairPatch, the same look as
//     M_HairCards), which the game shows exactly when the wound is hidden (the living Voss)
//
// --draco compresses the meshes (as scripts/optimize-models.mjs does) to keep the download small.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, sparse } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { readFileSync, statSync } from 'node:fs';

const SRC = 'public/assets/models/human_scientist.glb';
const OUT = 'public/assets/models/human_scientist_v2.glb';
const FACE = 'Blender/voss_face.json';
const DRACO = process.argv.includes('--draco');
const MOUTH_SHADE = [0.06, 0.6];    // the mouth's inside: brightness at the throat, at the lips (linear)
const MOUTH_COLOR = '#9a4a48';       // its flesh
const TEETH_COLOR = '#e8e1d2';       // the teeth: one smooth band per arch (see below), plain ivory
const TEETH_SHADE = [0.45, 1];      // brightness at the sides of the arch, at the front
const TEETH_FRONT_Z = 0.040;        // the band follows the teeth in front of this (m, glTF z); the molars are never seen
const TEETH_ARCH_R = 0.030;         // the arch is measured about a point this far behind the front teeth (m)
const TEETH_COLUMNS = 24;           // columns around each arch
const TEETH_BACK = 0.0003;          // the band's front set back this far from the teeth's (m), to stay behind the lips
const TEETH_BULGE = 0.0006;         // and leaning back this much at the gum
const TEETH_GUM = 0.001;            // its gum edge tucked this far into the gum (m)
const TEETH_DEPTH = [0.0005, 0.0018]; // the biting edge's depth, front to back (m): upper (shallow, so it stays in front of the lower band), lower
const TEETH_LONG = 0.0008;          // the upper band reaches this much below its teeth (m), clear of the lip's lining
const TEETH_HEIGHT = [0.0065, 0.0115]; // the bands' height from the biting edge to the gum (m): upper, lower
const TEETH_FWD = [0, 0.0012];       // the lower band's gum and middle rows come this far forward, over the gum's bulge and the lower lip's lining (m)
const GUM_BEHIND = 0.0008;          // the lower gum kept this far behind the lower teeth's front (m)
const TEETH_SPAN = 0.85;            // the share of the arch's sweep the bands keep (the ends, behind the cheeks, spiked)

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
if (DRACO) {
  io.registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule()
  });
}
const doc = await io.read(SRC);
const face = JSON.parse(readFileSync(FACE, 'utf8'));
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
const node = (name) => root.listNodes().find((n) => n.getName() === name);

// glTF colours are linear; these are written as the usual (sRGB) hex
const lin = (hex) => [0, 2, 4].map((i) => {
  const c = parseInt(hex.slice(1 + i, 3 + i), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const material = (name, color, { emissive = '#000000', rough = 0.85 } = {}) =>
  doc.createMaterial(name).setBaseColorFactor([...lin(color), 1]).setEmissiveFactor(lin(emissive))
    .setRoughnessFactor(rough).setMetallicFactor(0);
const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);

// ------------------------------------------------------------------ the face
const headNode = node('Head');
const headMesh = headNode.getMesh();
const [skinPrim, lashPrim] = headMesh.listPrimitives();
const counts = [skinPrim, lashPrim].map((p) => p.getAttribute('POSITION').getCount());
if (counts[0] + counts[1] !== face.vertexCount) throw new Error(`Head has ${counts} vertices, the face data ${face.vertexCount}`);
if (headMesh.listPrimitives().some((p) => p.listTargets().length)) throw new Error('Head already has morph targets');

// Blender lists the skin's vertices, then the lashes': confirm before trusting the indices
const where = (i) => (i < counts[0] ? [skinPrim, i] : [lashPrim, i - counts[0]]);
for (const [i, ...p] of face.check) {
  const [prim, k] = where(i);
  const q = prim.getAttribute('POSITION').getElement(k, []);
  if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) > 1e-4) throw new Error(`vertex ${i} does not match the face data`);
}

const targets = new Map([skinPrim, lashPrim].map((p) => [p, []]));
for (const name of face.targets) {
  const arrays = new Map([skinPrim, lashPrim].map((p, n) => [p, new Float32Array(counts[n] * 3)]));
  for (const [i, x, y, z] of face.deltas[name]) {
    const [prim, k] = where(i);
    arrays.get(prim).set([x, y, z], k * 3);
  }
  for (const [prim, array] of arrays) targets.get(prim).push(accessor('VEC3', array));
}
const addTargets = (prim, accessors) => {
  face.targets.forEach((name, t) => prim.addTarget(doc.createPrimitiveTarget(name).setAttribute('POSITION', accessors[t])));
};
addTargets(skinPrim, targets.get(skinPrim));
addTargets(lashPrim, targets.get(lashPrim));

// split the skin: the lip seal, the inside of the mouth and the teeth become primitives of their own
const seal = new Set(face.cutFaces.map((f) => f.join(',')));
const inner = new Set(face.mouthInner);
const teeth = new Set(face.teeth);
const idx = skinPrim.getIndices().getArray();
const keep = [], sealTris = [], innerTris = [], teethTris = [];
for (let t = 0; t < idx.length; t += 3) {
  const tri = [idx[t], idx[t + 1], idx[t + 2]];
  const key = [...tri].sort((a, b) => a - b).join(',');
  if (seal.has(key)) sealTris.push(...tri);
  else if (tri.every((i) => inner.has(i))) innerTris.push(...tri);
  else if (tri.every((i) => teeth.has(i))) teethTris.push(...tri);
  else keep.push(...tri);
}
if (sealTris.length / 3 !== seal.size) throw new Error(`found ${sealTris.length / 3} of the ${seal.size} lip seal faces`);
const IndexArray = idx.constructor;
skinPrim.setIndices(accessor('SCALAR', IndexArray.from(keep)));
const subPrim = (tris, mat) => {
  const p = doc.createPrimitive().setIndices(accessor('SCALAR', IndexArray.from(tris))).setMaterial(mat);
  for (const s of skinPrim.listSemantics()) p.setAttribute(s, skinPrim.getAttribute(s));
  addTargets(p, targets.get(skinPrim));
  headMesh.addPrimitive(p);
  return p;
};
const innerPrim = subPrim(innerTris, material('M_MouthInner', MOUTH_COLOR, { rough: 0.6 }));
subPrim(sealTris, skinPrim.getMaterial().clone().setName('M_LipSeal'));

// The teeth: the head's own (28 little pieces, each lit at its own angle by the toon ramp and
// textured with a scrap of the skin) read as speckled, gapped stubs, so they are left out (teethTris
// is dropped) and each arch becomes one smooth band following them: a curved front face from the gum
// to the biting edge, and a strip back from that edge. Seen from above, the band is a function of the
// angle about a point behind the front teeth. Each band vertex takes its skinning and its morphs from
// the nearest of the arch's own teeth (the lower arch is the one jaw_open moves), so it moves as they did.
// The lower gum bulged in front of the lower teeth, a strip of pink between them and the lip. Every
// gum vertex the jaw moves that stands in front of the teeth's front (radius r, per column of the
// arch, where the band is) between the band's bottom and its biting edge goes back, straight
// toward the arch's middle, to GUM_BEHIND behind it, so the band covers it all down to the lip.
function gumBehindTeeth(r, n, limit, angle, radius, jaw, cz, [low, high]) {
  const pos = skinPrim.getAttribute('POSITION');
  const column = (p) => Math.min(n, Math.max(0, Math.round((angle(p) / limit + 1) / 2 * n)));
  let moved = 0;
  for (const i of face.mouthInner) {
    if (Math.hypot(jaw[i * 3], jaw[i * 3 + 1], jaw[i * 3 + 2]) <= 1e-6) continue;
    const p = pos.getElement(i, []);
    if (Math.abs(angle(p)) > limit) continue;
    const back = r[column(p)] - GUM_BEHIND;
    if (p[1] < low || p[1] > high || radius(p) <= back) continue;
    const a = angle(p);
    pos.setElement(i, [Math.sin(a) * back, p[1], cz + Math.cos(a) * back]);
    moved++;
  }
  console.log(`  lower gum: ${moved} vertices moved behind the teeth`);
}

const teethPrim = (() => {
  const pos = skinPrim.getAttribute('POSITION');
  const jaw = targets.get(skinPrim)[face.targets.indexOf('jaw_open')].getArray();
  const P = (i) => pos.getElement(i, []);
  const visible = face.teeth.filter((i) => P(i)[2] > TEETH_FRONT_Z);
  const zFront = Math.max(...visible.map((i) => P(i)[2]));
  const cz = zFront - TEETH_ARCH_R;
  const angle = (p) => Math.atan2(p[0], p[2] - cz);
  const radius = (p) => Math.hypot(p[0], p[2] - cz);
  const smooth = (a) => a.map((v, k) => (a[Math.max(k - 1, 0)] + 2 * v + a[Math.min(k + 1, a.length - 1)]) / 4);
  const attrs = { POSITION: [], NORMAL: [], COLOR_0: [], JOINTS_0: [], WEIGHTS_0: [] };
  const deltas = face.targets.map(() => []);
  const tris = [];
  const joints = skinPrim.getAttribute('JOINTS_0'), weights = skinPrim.getAttribute('WEIGHTS_0');
  for (const lower of [false, true]) {
    const ids = visible.filter((i) => Math.hypot(jaw[i * 3], jaw[i * 3 + 1], jaw[i * 3 + 2]) > 1e-6 === lower);
    const limit = Math.max(...ids.map((i) => Math.abs(angle(P(i))))) * TEETH_SPAN;
    // the front of the teeth (the largest radius) per column, from the columns holding enough of
    // them (a column of one or two vertices may hold only a tooth's back); both edges are level:
    // the biting edge at the arch's furthest tooth tip, the gum edge a tooth's height from it
    const n = TEETH_COLUMNS;
    const cols = Array.from({ length: n + 1 }, () => []);
    for (const i of ids) {
      const k = Math.round((angle(P(i)) / limit + 1) / 2 * n);
      if (k >= 0 && k <= n) cols[k].push(P(i));
    }
    const known = cols.map((c) => (c.length >= 3 ? Math.max(...c.map(radius)) : undefined));
    let r = Array.from({ length: n + 1 }, (_, k) => {     // an empty column takes its neighbours' mean
      if (known[k] !== undefined) return known[k];
      let lo = k, hi = k;
      while (lo > 0 && known[lo] === undefined) lo--;
      while (hi < n && known[hi] === undefined) hi++;
      return ((known[lo] ?? known[hi]) + (known[hi] ?? known[lo])) / 2;
    });
    r = smooth(smooth(smooth(r)));
    const up = lower ? 1 : -1;                // from the gum toward the biting edge
    const ys = ids.map((i) => P(i)[1]);
    const bite = (lower ? Math.max(...ys) : Math.min(...ys)) + (lower ? 0 : up * TEETH_LONG);
    const gumY = bite - up * (TEETH_HEIGHT[+lower] + TEETH_GUM);     // tucked into the gum
    if (lower) gumBehindTeeth(r, n, limit, angle, radius, jaw, cz, [gumY, bite + GUM_BEHIND]);
    const base = attrs.POSITION.length;
    for (let k = 0; k <= n; k++) {
      const a = (k / n * 2 - 1) * limit;
      const [sx, sz] = [Math.sin(a), Math.cos(a)];
      const rows = [   // [radius, y, normal]
        [r[k] - TEETH_BACK - TEETH_BULGE + TEETH_FWD[+lower], gumY, [sx, 0, sz]],
        [r[k] - TEETH_BACK + TEETH_FWD[+lower], (gumY + bite) / 2, [sx, 0, sz]],
        [r[k] - TEETH_BACK, bite, [sx * 0.7, up * 0.7, sz * 0.7]],
        [r[k] - TEETH_BACK - TEETH_DEPTH[+lower], bite, [0, up, 0]]
      ];
      for (const [rad, y, nrm] of rows) {
        const p = [sx * rad, y, cz + sz * rad];
        let near = ids[0], best = Infinity;
        for (const i of ids) {
          const q = P(i), d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
          if (d < best) { best = d; near = i; }
        }
        const l = Math.hypot(...nrm);
        const t = Math.max(0, Math.min(1, (p[2] - (zFront - TEETH_ARCH_R)) / TEETH_ARCH_R));
        const s = TEETH_SHADE[0] + (TEETH_SHADE[1] - TEETH_SHADE[0]) * Math.pow(t, 0.6);
        attrs.POSITION.push(p);
        attrs.NORMAL.push(nrm.map((v) => v / l));
        attrs.COLOR_0.push([s, s, s]);
        attrs.JOINTS_0.push(joints.getElement(near, []));
        attrs.WEIGHTS_0.push(weights.getElement(near, []));
        face.targets.forEach((_, t) => deltas[t].push(targets.get(skinPrim)[t].getElement(near, [])));
      }
    }
    // quads between neighbouring columns and rows, each turned to face the way its normals do
    // (the toon material is double-sided and would light a face turned inward from behind)
    const R = 4;
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < R - 1; j++) {
        const [a, b, c, d] = [k * R + j, (k + 1) * R + j, (k + 1) * R + j + 1, k * R + j + 1].map((v) => base + v);
        for (let [x, y, z] of [[a, b, c], [a, c, d]]) {
          const [pa, pb, pc] = [x, y, z].map((v) => attrs.POSITION[v]);
          const u = pb.map((v, m) => v - pa[m]), w = pc.map((v, m) => v - pa[m]);
          const f = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
          const m = attrs.NORMAL[x];
          if (f[0] * m[0] + f[1] * m[1] + f[2] * m[2] < 0) [y, z] = [z, y];
          tris.push(x, y, z);
        }
      }
    }
  }
  const flat = (rows, Type = Float32Array) => Type.from(rows.flat());
  const p = doc.createPrimitive().setIndices(accessor('SCALAR', Uint16Array.from(tris)))
    .setMaterial(material('M_Teeth', TEETH_COLOR, { rough: 0.5 }))
    .setAttribute('POSITION', accessor('VEC3', flat(attrs.POSITION)))
    .setAttribute('NORMAL', accessor('VEC3', flat(attrs.NORMAL)))
    .setAttribute('COLOR_0', accessor('VEC3', flat(attrs.COLOR_0)))
    .setAttribute('JOINTS_0', accessor('VEC4', flat(attrs.JOINTS_0, joints.getArray().constructor)))
    .setAttribute('WEIGHTS_0', accessor('VEC4', flat(attrs.WEIGHTS_0)));
  addTargets(p, deltas.map((d) => accessor('VEC3', flat(d))));
  headMesh.addPrimitive(p);
  return p;
})();

// The inside of the mouth and the teeth are shaded darker toward the throat (COLOR_0, multiplied by
// the game: see Player.js), so an open mouth has depth instead of a flat fill. Each primitive has a
// whole-length colour of its own (they share the skin's other attributes); t is 0 at the back of
// the vertices given, 1 at the front.
const shadeBy = (prim, ids, [dark, light], curve) => {
  const pos = skinPrim.getAttribute('POSITION');
  const zs = ids.map((i) => pos.getElement(i, [])[2]);
  const front = Math.max(...zs), back = Math.min(...zs);    // glTF +z is out of the face
  const shade = new Float32Array(pos.getCount() * 3).fill(1);
  for (const i of ids) {
    const t = (pos.getElement(i, [])[2] - back) / (front - back);
    const s = dark + (light - dark) * Math.pow(t, curve);
    shade.set([s, s, s], i * 3);
  }
  prim.setAttribute('COLOR_0', accessor('VEC3', shade));
};
shadeBy(innerPrim, face.mouthInner, MOUTH_SHADE, 1.4);
headMesh.setWeights(face.targets.map(() => 0));
headMesh.setExtras({ ...headMesh.getExtras(), targetNames: face.targets });

// ------------------------------------------------------------------ the wound
const skin = headNode.getSkin();
const joint = skin.listJoints().findIndex((j) => j.getName() === face.wound.bone);
if (joint < 0) throw new Error('no joint ' + face.wound.bone);
const w = face.wound;
const n = w.positions.length;
const position = accessor('VEC3', new Float32Array(w.positions.flat()));
const normal = accessor('VEC3', new Float32Array(w.normals.flat()));
const uv = accessor('VEC2', new Float32Array(n * 2));
const joints = accessor('VEC4', new Uint16Array(n * 4).map((_, k) => (k % 4 === 0 ? joint : 0)));
const weights = accessor('VEC4', new Float32Array(n * 4).map((_, k) => (k % 4 === 0 ? 1 : 0)));
const WOUND_MATERIALS = {
  M_WoundSkin: material('M_WoundSkin', '#c7a08e'),                                   // shaved, pale scalp
  M_WoundRim: material('M_WoundRim', '#3c0d0c'),                                      // crusted edge, stitches
  M_Wound: material('M_Wound', '#8e1b1b', { emissive: '#2c0505', rough: 0.4 }),      // the open gash
  M_WoundPort: material('M_WoundPort', '#4fe3ff', { emissive: '#3fb8d0', rough: 0.3 }) // the port's light
};
// each face turned to look the way its normal does (out of the back of the head): the toon
// material is double-sided and would light a face turned inward from behind
const P = w.positions, Nm = w.normals;
const outward = (tris) => {
  const t = [...tris];
  for (let k = 0; k < t.length; k += 3) {
    const [a, b, c] = [P[t[k]], P[t[k + 1]], P[t[k + 2]]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const m = Nm[t[k]];
    if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) [t[k + 1], t[k + 2]] = [t[k + 2], t[k + 1]];
  }
  return t;
};
const woundMesh = doc.createMesh('Wound');
for (const [name, tris] of Object.entries(w.groups)) {
  woundMesh.addPrimitive(doc.createPrimitive()
    .setAttribute('POSITION', position).setAttribute('NORMAL', normal).setAttribute('TEXCOORD_0', uv)
    .setAttribute('JOINTS_0', joints).setAttribute('WEIGHTS_0', weights)
    .setIndices(accessor('SCALAR', Uint16Array.from(outward(tris)))).setMaterial(WOUND_MATERIALS[name]));
}
const woundNode = doc.createNode('Wound').setMesh(woundMesh).setSkin(skin);
headNode.getParentNode().addChild(woundNode);

// the hair over the patch: every card triangle with a corner over it (seen from behind) moves
// to the hair patch
const hairMesh = node('Hair').getMesh();
const hair = hairMesh.listPrimitives()[0];
const hairPos = hair.getAttribute('POSITION');
const c = face.hairCut;
const over = (i) => {
  const [x, y, z] = hairPos.getElement(i, []);
  return z < c.behind_z && ((x - c.center_x) / c.radius_x) ** 2 + ((y - c.center_y) / c.radius_y) ** 2 < 1;
};
const hairIdx = hair.getIndices().getArray();
const hairKeep = [], hairCut = [];
for (let t = 0; t < hairIdx.length; t += 3) {
  const cut = over(hairIdx[t]) || over(hairIdx[t + 1]) || over(hairIdx[t + 2]);
  (cut ? hairCut : hairKeep).push(hairIdx[t], hairIdx[t + 1], hairIdx[t + 2]);
}
hair.setIndices(accessor('SCALAR', hairIdx.constructor.from(hairKeep)));
const patch = doc.createPrimitive().setIndices(accessor('SCALAR', hairIdx.constructor.from(hairCut)))
  .setMaterial(hair.getMaterial().clone().setName('M_HairPatch'));
for (const s of hair.listSemantics()) patch.setAttribute(s, hair.getAttribute(s));
hairMesh.addPrimitive(patch);

// (sparse: each face shape moves only part of the head, so its targets store just those vertices)
await doc.transform(sparse({ ratio: 1 / 3 }));
if (DRACO) await doc.transform(draco({ method: 'edgebreaker' }));
await io.write(OUT, doc);
const mb = (p) => (statSync(p).size / 1048576).toFixed(2) + ' MB';
console.log(`${OUT}: ${mb(OUT)} (from ${mb(SRC)})`);
console.log(`  morph targets: ${face.targets.join(', ')}`);
console.log(`  mouth: ${innerTris.length / 3} inner triangles, ${teethPrim.getIndices().getCount() / 3} teeth (replacing ${teethTris.length / 3}), ${sealTris.length / 3} in the lip seal`);
console.log(`  wound: ${n} vertices on joint ${joint}; hair cards: ${hairCut.length / 3} triangles in the patch`);

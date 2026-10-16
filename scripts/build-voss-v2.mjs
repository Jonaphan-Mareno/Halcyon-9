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
//     blink, eyes_tired, brow_up, brow_down), on every primitive of it, named in the mesh's
//     extras.targetNames (three.js reads them into morphTargetDictionary)
//   - two more Head primitives cut out of the skin, sharing its vertices and morphs:
//       M_MouthInner  the gums, tongue and mouth lining: the skin's texture, darkened toward the
//                     throat by a vertex colour so an open mouth has depth
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
const MOUTH_SHADE = [0.15, 0.8];    // the mouth's inside: brightness at the throat, at the lips (linear)

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

// split the skin: the lip seal and the inside of the mouth become primitives of their own
const seal = new Set(face.cutFaces.map((f) => f.join(',')));
const inner = new Set(face.mouthInner);
const idx = skinPrim.getIndices().getArray();
const keep = [], sealTris = [], innerTris = [];
for (let t = 0; t < idx.length; t += 3) {
  const tri = [idx[t], idx[t + 1], idx[t + 2]];
  const key = [...tri].sort((a, b) => a - b).join(',');
  if (seal.has(key)) sealTris.push(...tri);
  else if (tri.every((i) => inner.has(i))) innerTris.push(...tri);
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
};
subPrim(innerTris, skinPrim.getMaterial().clone().setName('M_MouthInner'));
subPrim(sealTris, skinPrim.getMaterial().clone().setName('M_LipSeal'));

// the inside of the mouth keeps its own pink texture (gums, tongue), shaded darker toward the throat
// (COLOR_0, multiplied by the game: see Player.js) so an open mouth has depth instead of a flat fill
{
  const innerPrim = headMesh.listPrimitives().find((p) => p.getMaterial()?.getName() === 'M_MouthInner');
  const pos = skinPrim.getAttribute('POSITION');
  const zs = face.mouthInner.map((i) => pos.getElement(i, [])[2]);
  const front = Math.max(...zs), back = Math.min(...zs);    // glTF +z is out of the face
  const shade = new Float32Array(pos.getCount() * 3).fill(1);
  for (const i of face.mouthInner) {
    const t = (pos.getElement(i, [])[2] - back) / (front - back);   // 0 at the throat, 1 at the lips
    const s = MOUTH_SHADE[0] + (MOUTH_SHADE[1] - MOUTH_SHADE[0]) * Math.pow(t, 0.7);
    shade.set([s, s, s], i * 3);
  }
  innerPrim.setAttribute('COLOR_0', accessor('VEC3', shade));
}
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
console.log(`  mouth: ${innerTris.length / 3} inner triangles, ${sealTris.length / 3} in the lip seal`);
console.log(`  wound: ${n} vertices on joint ${joint}; hair cards: ${hairCut.length / 3} triangles in the patch`);

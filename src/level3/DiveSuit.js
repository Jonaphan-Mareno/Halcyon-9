import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// The dive suit in the EVA prep room: a hard-shell suit for the deep, safety orange over navy, with a
// round helmet (a glass visor in front), two air tanks on a backpack, a chest unit with a small lit
// display, a weight belt and black gloves. All our own work, built from primitives.
//
// The same parts dress two rigs of human_scientist.glb: the empty suit hanging on its rack (no one
// inside, so no head and no hair) and Voss once he puts it on (his face shows through the visor in
// the third-person view). The parts are fixed to the rig's bones by the bind pose, so it does not
// matter what pose the rig is in when they go on. Sizes are in the model's own units (1.39 m tall).

export const SUIT = {
  shell: 0xd9661f,       // safety orange
  lower: 0x1f2c45,       // navy
  glove: 0x1b1d21,       // soft black
  trim: 0x2a2e33,
  steel: 0x8e979e,
  visor: 0x6fa7bd
};

const HEAD = new THREE.Vector3(0, 1.285, -0.005);   // the middle of the head
const R = 0.165;                                     // the helmet's radius

// what each of the model's materials becomes in the suit
const RECOLOUR = { M_Coat: 'shell', M_Shirt: 'shell', M_Pants: 'lower', M_Hands: 'glove' };

function materials(empty) {
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05, ...extra });
  return {
    shell: std(SUIT.shell, { roughness: 0.4, side: THREE.DoubleSide }),
    lower: std(SUIT.lower, { roughness: 0.6 }),
    glove: std(SUIT.glove, { roughness: 0.7 }),
    trim: std(SUIT.trim, { roughness: 0.55, metalness: 0.3 }),
    steel: std(SUIT.steel, { roughness: 0.3, metalness: 0.8 }),
    lens: std(0xfff4dd, { emissive: 0xfff0d0, emissiveIntensity: 1.2 }),
    display: std(0x0c2230, { emissive: 0x4fd0ff, emissiveIntensity: 0.9 }),
    // an empty helmet's glass is darker, so the hollow inside does not show
    visor: new THREE.MeshStandardMaterial({
      color: empty ? 0x1d3038 : SUIT.visor, roughness: 0.05, metalness: 0.2, transparent: true,
      opacity: empty ? 0.82 : 0.32, depthWrite: false, envMapIntensity: 1.0
    })
  };
}

// The helmet: an orange shell round the head with a wide window in front, its glass, a frame round
// the window, a neck ring, a headlamp and a valve on the side
function helmet(m) {
  const g = new THREE.Group();
  const add = (geo, mat, pos) => {
    const mesh = new THREE.Mesh(geo, mat);
    if (pos) mesh.position.copy(pos);
    g.add(mesh);
    return mesh;
  };
  const FRONT = Math.PI / 2;            // a sphere's phi of pi/2 faces +z, the model's front
  const W = 0.78;                       // half the window's width (radians)
  const T0 = 0.27 * Math.PI, T1 = 0.6 * Math.PI, BOTTOM = 0.8 * Math.PI;
  add(new THREE.SphereGeometry(R, 28, 18, FRONT + W, Math.PI * 2 - W * 2, 0, BOTTOM), m.shell);
  add(new THREE.SphereGeometry(R, 12, 6, FRONT - W, W * 2, 0, T0), m.shell);
  add(new THREE.SphereGeometry(R, 12, 4, FRONT - W, W * 2, T1, BOTTOM - T1), m.shell);
  const glass = add(new THREE.SphereGeometry(R * 0.995, 16, 10, FRONT - W, W * 2, T0, T1 - T0), m.visor);
  glass.renderOrder = 4;
  // the window's frame: thin bands top and bottom, and down each side
  const F = 0.035;
  add(new THREE.SphereGeometry(R * 1.02, 16, 2, FRONT - W - F, (W + F) * 2, T0 - F, F), m.trim);
  add(new THREE.SphereGeometry(R * 1.02, 16, 2, FRONT - W - F, (W + F) * 2, T1, F), m.trim);
  add(new THREE.SphereGeometry(R * 1.02, 2, 10, FRONT - W - F, F, T0, T1 - T0), m.trim);
  add(new THREE.SphereGeometry(R * 1.02, 2, 10, FRONT + W, F, T0, T1 - T0), m.trim);
  // the neck ring, where the helmet locks onto the suit
  const ring = add(new THREE.TorusGeometry(R * Math.sin(BOTTOM) + 0.006, 0.02, 8, 28), m.trim);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = R * Math.cos(BOTTOM) - 0.004;
  // the headlamp, up on the right of the brow, and a valve on the left
  const lampDir = new THREE.Vector3(-0.45, 0.62, 0.64).normalize();
  const lamp = new THREE.Group();
  lamp.position.copy(lampDir).multiplyScalar(R + 0.012);
  lamp.lookAt(lampDir.clone().multiplyScalar(2).add(new THREE.Vector3(0, -0.4, 1)));
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.05, 14), m.trim);
  housing.rotation.x = Math.PI / 2;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.02, 14), m.lens);
  lens.position.z = 0.026;
  lamp.add(housing, lens);
  g.add(lamp);
  const valve = add(new THREE.CylinderGeometry(0.018, 0.018, 0.04, 10), m.steel, new THREE.Vector3(R * 0.98, -0.02, -0.03));
  valve.rotation.z = Math.PI / 2;
  g.position.copy(HEAD);
  return g;
}

// The backpack with its two tanks and the hose up to the helmet, and the chest unit
function backpack(m) {
  const g = new THREE.Group();
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.075), m.lower);
  pack.position.set(0, 0.98, -0.195);
  g.add(pack);
  for (const x of [-0.065, 0.065]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.3, 16), m.steel);
    tank.position.set(x, 0.97, -0.27);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.052, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.shell);
    cap.position.set(x, 1.12, -0.27);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.052, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m.steel);
    foot.position.set(x, 0.82, -0.27);
    g.add(tank, cap, foot);
  }
  // straps round the tanks
  for (const y of [0.9, 1.06]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.022, 0.12), m.trim);
    strap.position.set(0, y, -0.25);
    g.add(strap);
  }
  // the air hose from the left tank over the shoulder into the helmet
  const hose = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.065, 1.17, -0.27), new THREE.Vector3(-0.1, 1.24, -0.22),
    new THREE.Vector3(-0.13, 1.2, -0.12), new THREE.Vector3(-0.12, 1.16, -0.05)
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(hose, 16, 0.014, 8, false), m.trim));
  // the chest unit: a box with a small lit display
  const unit = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.075, 0.035), m.trim);
  unit.position.set(0.02, 1.02, 0.09);
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.032), m.display);
  display.position.set(0.012, 1.025, 0.1085);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.012, 10), m.steel);
  knob.rotation.x = Math.PI / 2;
  knob.position.set(0.064, 1.02, 0.11);
  g.add(unit, display, knob);
  return g;
}

function belt(m) {
  const g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.13, 6, 32), m.trim);
  band.rotation.x = Math.PI / 2;
  band.scale.set(0.158, 0.138, 0.16);
  band.position.set(0, 0.8, -0.01);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.015), m.steel);
  buckle.position.set(0, 0.8, 0.125);
  g.add(band, buckle);
  return g;
}

// Fix an object built in the model's own space to a bone, by the bind pose (works in any pose)
export function attachAtBind(model, boneRe, object) {
  let skinned = null;
  model.traverse((o) => { if (!skinned && o.isSkinnedMesh) skinned = o; });
  if (!skinned) return false;
  const bones = skinned.skeleton.bones;
  const i = bones.findIndex((b) => boneRe.test(b.name));
  if (i < 0) return false;
  const m = new THREE.Matrix4().multiplyMatrices(skinned.skeleton.boneInverses[i], skinned.bindMatrix);
  object.applyMatrix4(m);
  bones[i].add(object);
  return true;
}

// Dress a rig in the suit. mutate: recolour its own materials (Voss: his first-person arms share
// them, so his sleeves and gloves change too); otherwise new materials are made. empty: no one
// inside (the suit on the rack). parts: false only recolours (his first-person arms). Returns
// { helmet, parts, mats } for show/hide later.
export function dressInSuit(model, { mutate = false, empty = false, parts: withParts = true } = {}) {
  const m = materials(empty);
  model.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    // (his hair is Hair, or Hair_1 and Hair_2 in the newer model; the empty suit has no one in it.
    // Voss keeps his hair: it sits well inside the helmet, 0.136 at most from its middle)
    if (/Glasses/.test(o.name) || (empty && /^(Head|Wound|Hair)/.test(o.name))) {
      o.visible = false;
      return;
    }
    const swap = (mat) => {
      const kind = RECOLOUR[mat.name];
      if (!kind) return mat;
      if (!mutate) return m[kind];
      mat.map = null;
      mat.color.set(SUIT[kind]);
      mat.needsUpdate = true;
      return mat;
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  if (!withParts) return { helmet: null, parts: [], mats: m };
  const parts = [helmet(m), backpack(m), belt(m)];
  parts[0].name = 'SuitHelmet';             // (found by name in a copy of the rig: level3/RelayLock.js)
  attachAtBind(model, /Spine4/, parts[0]);       // the helmet rides on the shoulders, not the head
  attachAtBind(model, /Spine4/, parts[1]);
  attachAtBind(model, /Pelvis/, parts[2]);
  for (const p of parts) p.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return { helmet: parts[0], parts, mats: m };
}

// The empty suit standing in its rack, from a loaded human_scientist.glb (gltf), feet at `at`
export function rackSuit(gltf, at, yaw = 0) {
  const model = cloneSkinned(gltf.scene);
  const scale = 1.8 / 1.394;
  model.scale.setScalar(scale);
  dressInSuit(model, { empty: true });
  // arms hanging a little out from the sides, held at one moment of the idle
  const idle = gltf.animations.find((a) => a.name === 'Idle');
  if (idle) {
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(idle).play();
    mixer.update(0.01);
  }
  model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  model.position.copy(at);
  model.rotation.y = yaw;
  return model;
}

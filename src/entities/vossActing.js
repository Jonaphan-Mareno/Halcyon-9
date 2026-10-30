import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createFBXLoader } from '../core/loaders.js';
import { Animator, MODEL_HEIGHT, showWound } from './Player.js';
import { FaceRig } from './FaceRig.js';
import { ArmIK } from './ArmIK.js';

// Voss acting: the ending's body clips (an injured walk, a sad idle, a flinch, sitting down on the
// floor and getting up, sitting, and the last fall forward) on a standalone third-person Voss.
// See docs/voss-acting-report.md for the clips, the transitions and what each one was checked for.
//
//   const clips = await loadVossActing(player);    // (lazily: the six FBX files load on the first call)
//   const actor = new VossActor(player, clips);    // a copy of Voss, his own mixer and face
//   scene.add(actor.root);                         // (faces +Z; Object3D.lookAt aims it)
//   actor.play('InjuredWalk');  ...  actor.stopWalk('SadIdle');  actor.crossTo('Stagger', { then: 'SadIdle' });
//   per frame: actor.update(dt)
//
// The clips come from Mixamo's default character (bones mixamorig1:*), not Voss's own rig, so they
// are retargeted here rather than bound by name as Player._mixamoClip does. three's
// SkeletonUtils.retargetClip is not used: it copies each bone's rotation relative to its own rest
// pose, and the two rests differ (Mixamo's arms are out level in a T, Voss's hang about 50 degrees
// down, and the bones' own axes differ: Mixamo's run along +Y, Valve's along +X), so his arms came
// out half a turn wrong. Instead each frame is copied in world space: every Mixamo bone's turn away
// from its rest (world) is applied to Voss's bone as it would stand in Mixamo's rest, his rest
// first turned so the bone points where Mixamo's does (with the palm, the knee or the foot's side
// as the second axis, so the twist matches as well). The spine and head keep Voss's own posture.
// Only Voss's own bone lengths are used, so the limbs keep his proportions; the hips' travel is
// scaled by the ratio of the leg lengths.

const DIR = './assets/models/';
const FILES = {
  InjuredWalk: 'Walkinginjured.fbx',
  SadIdle: 'Sad Idle.fbx',
  Stagger: 'Reacting.fbx',
  StandUp: 'Standing Up.fbx',
  SitIdle: 'Sitting Idle.fbx',
  FallForward: 'Falling Forward Death.fbx'
};
// (SitDown is StandUp reversed)
export const ACTING_CLIPS = ['InjuredWalk', 'SadIdle', 'Stagger', 'SitDown', 'StandUp', 'SitIdle', 'FallForward'];
const LOOPS = new Set(['InjuredWalk', 'SadIdle', 'SitIdle']);

// Voss bone (ValveBipedBip01_<name>_<n>) <- Mixamo bone (mixamorig1:<name>). Spine1 sits between
// Mixamo's Spine and Spine1 (Voss has four spine bones to Mixamo's three) and takes half of each
const SPINE = [['Pelvis', 'Hips'], ['Spine', 'Spine'], ['Spine1', ['Spine', 'Spine1']], ['Spine2', 'Spine1'], ['Spine4', 'Spine2'], ['Neck1', 'Neck'], ['Head1', 'Head']];
// [voss, mixamo, voss child, mixamo child, second axis] for the limbs: the bone is turned so it
// points at its child as Mixamo's does (a last joint without a child takes its parent's turn)
function limbs(side) {
  const S = side === 'L' ? 'Left' : 'Right';
  const v = (n) => `${side}_${n}`, m = (n) => S + n;
  const rows = [
    [v('Clavicle'), m('Shoulder'), v('UpperArm'), m('Arm'), 'fwd'],
    [v('UpperArm'), m('Arm'), v('Forearm'), m('ForeArm'), 'palm'],
    [v('Forearm'), m('ForeArm'), v('Hand'), m('Hand'), 'palm'],
    [v('Hand'), m('Hand'), v('Finger2'), m('HandMiddle1'), 'palm'],
    [v('Thigh'), m('UpLeg'), v('Calf'), m('Leg'), 'fwd'],
    [v('Calf'), m('Leg'), v('Foot'), m('Foot'), 'fwd'],
    [v('Foot'), m('Foot'), v('Toe0'), m('ToeBase'), 'side'],
    [v('Toe0'), m('ToeBase'), null, null, 'side']
  ];
  ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].forEach((f, i) => {
    const vn = [`Finger${i}`, `Finger${i}1`, `Finger${i}2`];
    for (let j = 0; j < 3; j++) rows.push([v(vn[j]), m(`Hand${f}${j + 1}`), j < 2 ? v(vn[j + 1]) : null, m(`Hand${f}${j + 2}`), 'palm']);
  });
  return rows;
}
const LIMBS = [...limbs('L'), ...limbs('R')];

// Where the soles meet the floor: Mixamo's ankle sits a little lower over its sole than Voss's
// does over his, so the hips are raised by this (model metres) for his shoes to touch the floor
const GROUND_LIFT = 0.0025;
// The clips on the floor (sitting, getting up, lying) are raised as far as his body would go
// through it: his seat, coat and shoes are deeper than the Mixamo figure's. Measured on the
// skinned mesh itself when the clips load (groundLift), `true`: by as much as it needs at each
// moment, each lift reaching this many seconds ahead and behind (smoothing), or 'hold': by the most
// it ever needs, all through (a loop that sits still)
const ON_FLOOR = { SitIdle: 'hold', StandUp: 0.2, FallForward: 0.1 };
const GROUND_STEP = 1 / 10;        // seconds between the measured poses

// The stand-up starts from the sitting idle's first frame, eased into its own over SIT_JOIN
// seconds. The sit-down is the stand-up backward, but only from standing to the moment his seat
// meets the floor (SIT_CUT seconds into the stand-up): before that the stand-up rocks back onto
// his back for the swing up, which backward looks like a rewind. From there it eases into the
// sitting idle's first frame over SIT_SETTLE seconds
const SIT_JOIN = 0.5;
const SIT_CUT = 1.3;
const SIT_SETTLE = 0.8;
// Falling from the seat: a separate take, the seated pose easing over SLUMP seconds into the fall's
// frame most like it, then the rest of the fall from there, on the spot where he sat
const SLUMP = 0.8;

const smooth = (u) => u * u * (3 - 2 * u);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- Voss's rest pose

// Every bone's rest (from the skin's bind matrices, so it does not matter what the copy it is read
// from is doing now), in the model's own space (+Z forward, Y up, metres)
function vossRig(root) {
  let skel = null;
  root.traverse((o) => { if (!skel && o.isSkinnedMesh) skel = o.skeleton; });
  if (!skel) throw new Error('no skinned mesh under the Voss model');
  root.updateMatrixWorld(true);
  const rootInv = _m.copy(root.matrixWorld).invert().clone();
  const worldOf = new Map();
  skel.bones.forEach((b, i) => worldOf.set(b, new THREE.Matrix4().copy(skel.boneInverses[i]).invert()));
  const bones = [];
  const byName = new Map();
  const rest = new Map();
  const modelMatrix = (o) => {
    if (o === root || !o) return new THREE.Matrix4();
    if (worldOf.has(o)) return worldOf.get(o);
    return new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld);
  };
  root.traverse((o) => {
    if (!o.isBone) return;
    bones.push(o);
    byName.set(o.name, o);
    const world = worldOf.get(o) || modelMatrix(o);
    const local = new THREE.Matrix4().copy(modelMatrix(o.parent)).invert().multiply(world);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    local.decompose(p, q, s);
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion();
    world.decompose(wp, wq, s);
    rest.set(o.name, { p, q, wp, wq });
  });
  const find = (short) => bones.find((b) => new RegExp(`^ValveBipedBip01_${short}_\\d+$`).test(b.name)) || null;
  return { bones, byName, rest, find };
}

// ---------------------------------------------------------------- retargeting

function mixamoBone(fbx, name) {
  let found = null;
  fbx.traverse((o) => {
    if (!found && o.isBone && o.name.replace(/^mixamorig\d*:?/, '') === name) found = o;
  });
  return found;
}

// The palm's normal (the back of the hand: index and little knuckles about the wrist), world
function palmOf(pos, hand, index, little) {
  const a = _v2.subVectors(pos(index), pos(hand));
  const b = _v3.subVectors(pos(little), pos(hand));
  return new THREE.Vector3().crossVectors(a, b).normalize();
}

// The rotation that takes frame (dirA, secA) onto (dirB, secB)
function frameTurn(dirA, secA, dirB, secB) {
  const basis = (d, s) => {
    const x = d.clone().normalize();
    const z = s.clone().addScaledVector(x, -s.dot(x)).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    return new THREE.Matrix4().makeBasis(x, y, z);
  };
  const a = basis(dirA, secA), b = basis(dirB, secB);
  return new THREE.Quaternion().setFromRotationMatrix(b.multiply(a.transpose()));
}

// One FBX's animation as a take on Voss's rig: { times, q: { bone: Float32Array(n*4) local },
// p: Float32Array(n*3) the pelvis's local position }
function retarget(fbx, rig) {
  const src = fbx.animations[0];
  if (!src) throw new Error('no animation');
  const times = src.tracks.reduce((a, t) => (t.times.length > a.length ? t.times : a), []);
  const n = times.length;
  fbx.updateMatrixWorld(true);

  // Mixamo's rest (its pose at load: the T)
  const mix = new Map();
  const need = new Set();
  for (const [, m] of SPINE) for (const x of [].concat(m)) need.add(x);
  for (const [, m, , mc] of LIMBS) { need.add(m); if (mc) need.add(mc); }
  need.add('LeftUpLeg').add('RightUpLeg').add('LeftFoot');
  for (const name of need) {
    const b = mixamoBone(fbx, name);
    if (b) mix.set(name, { bone: b, wq: b.getWorldQuaternion(new THREE.Quaternion()), wp: b.getWorldPosition(new THREE.Vector3()) });
  }
  for (const k of ['Hips', 'LeftUpLeg', 'RightUpLeg', 'LeftFoot']) if (!mix.has(k)) throw new Error('not a Mixamo rig (no ' + k + ')');
  const mixPos = (name) => mix.get(name).wp;
  const restPos = (name) => rig.rest.get(name).wp;

  // Voss bones that are driven: name -> { src: [mixamo names], turn: rest correction }
  const drive = new Map();
  for (const [v, m] of SPINE) {
    const bone = rig.find(v);
    if (bone) drive.set(bone.name, { src: [].concat(m), turn: new THREE.Quaternion() });
  }
  const palms = {};
  for (const side of ['L', 'R']) {
    const S = side === 'L' ? 'Left' : 'Right';
    const vh = rig.find(`${side}_Hand`), vi = rig.find(`${side}_Finger1`), vl = rig.find(`${side}_Finger4`);
    const mh = `${S}Hand`, mi = `${S}HandIndex1`, ml = `${S}HandPinky1`;
    if (vh && vi && vl && mix.has(mh) && mix.has(mi) && mix.has(ml)) {
      palms[side] = { v: palmOf(restPos, vh.name, vi.name, vl.name), m: palmOf(mixPos, mh, mi, ml) };
    }
  }
  let lastTurn = null;
  for (const [v, m, vc, mc, axis] of LIMBS) {
    const bone = rig.find(v);
    const child = vc && rig.find(vc);
    if (!bone || !mix.has(m)) { lastTurn = null; continue; }
    let turn;
    if (child && mc && mix.has(mc)) {
      const side = v[0];
      const sec = axis === 'palm' ? palms[side] : null;
      const s = axis === 'fwd' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      turn = frameTurn(
        _v.subVectors(restPos(child.name), restPos(bone.name)).clone(), sec ? sec.v : s,
        _v.subVectors(mixPos(mc), mixPos(m)).clone(), sec ? sec.m : s
      );
    } else {
      turn = lastTurn ? lastTurn.clone() : new THREE.Quaternion();
    }
    lastTurn = turn;
    drive.set(bone.name, { src: [m], turn });
  }

  // Leg length: hips' travel is scaled by Voss's (thigh to ankle) over Mixamo's
  const vLeg = rig.find('L_Thigh'), vCalf = rig.find('L_Calf'), vFoot = rig.find('L_Foot');
  const vossLeg = restPos(vLeg.name).distanceTo(restPos(vCalf.name)) + restPos(vCalf.name).distanceTo(restPos(vFoot.name));
  const mKnee = mixamoBone(fbx, 'LeftLeg').getWorldPosition(new THREE.Vector3());
  const mixLeg = mixPos('LeftUpLeg').distanceTo(mKnee) + mKnee.distanceTo(mixPos('LeftFoot'));
  const ratio = vossLeg / mixLeg;
  const pelvis = rig.find('Pelvis');
  const restHips = _v.addVectors(mixPos('LeftUpLeg'), mixPos('RightUpLeg')).multiplyScalar(0.5).clone();
  const lift = restPos(pelvis.name).y - restHips.y * ratio + GROUND_LIFT;

  // Sample every frame
  const mixer = new THREE.AnimationMixer(fbx);
  const action = mixer.clipAction(src).play();
  const out = { times: Float32Array.from(times), duration: src.duration, q: {}, p: new Float32Array(n * 3), ratio };
  for (const name of drive.keys()) out.q[name] = new Float32Array(n * 4);
  const world = new Map();
  const delta = new Map();
  const restInv = new Map([...mix].map(([k, m]) => [k, m.wq.clone().invert()]));
  const wq = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    action.time = times[i];
    mixer.update(0);
    fbx.updateMatrixWorld(true);
    for (const [k, m] of mix) delta.set(k, m.bone.getWorldQuaternion(new THREE.Quaternion()).multiply(restInv.get(k)));
    world.clear();
    for (const b of rig.bones) {
      const r = rig.rest.get(b.name);
      const pw = world.get(b.parent?.name) || null;
      const d = drive.get(b.name);
      if (d) {
        const dq = d.src.length === 1 ? delta.get(d.src[0]) : delta.get(d.src[0]).clone().slerp(delta.get(d.src[1]), 0.5);
        wq.copy(dq).multiply(d.turn).multiply(r.wq);
        const local = pw ? _q.copy(pw).invert().multiply(wq) : _q.copy(wq);
        // (continuous with the frame before: no flips through the long way round)
        const arr = out.q[b.name];
        if (i > 0) {
          const j = (i - 1) * 4;
          if (local.x * arr[j] + local.y * arr[j + 1] + local.z * arr[j + 2] + local.w * arr[j + 3] < 0) local.set(-local.x, -local.y, -local.z, -local.w);
        }
        local.toArray(arr, i * 4);
        world.set(b.name, wq.clone());
      } else {
        world.set(b.name, pw ? pw.clone().multiply(r.q) : r.q.clone());
      }
    }
    const hips = _v.addVectors(mix.get('LeftUpLeg').bone.getWorldPosition(_v2), mix.get('RightUpLeg').bone.getWorldPosition(_v3)).multiplyScalar(0.5);
    out.p[i * 3] = hips.x * ratio;
    out.p[i * 3 + 1] = hips.y * ratio + lift;
    out.p[i * 3 + 2] = hips.z * ratio;
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(fbx);
  out.pelvis = pelvis.name;
  return out;
}

// ---------------------------------------------------------------- operations on takes

const frameOf = (take, i) => {
  const q = {};
  for (const [k, a] of Object.entries(take.q)) q[k] = new THREE.Quaternion().fromArray(a, i * 4);
  return { q, p: new THREE.Vector3().fromArray(take.p, i * 3) };
};
const last = (take) => take.times.length - 1;

// The pelvis's facing (radians about +Y, 0 = +Z), from its side-to-side axis (sound even when it
// is tipped back, sitting)
function yawAt(take, i) {
  const q = _q.fromArray(take.q[take.pelvis], i * 4);
  const left = _v.set(1, 0, 0).applyQuaternion(q);
  const fwd = _v2.crossVectors(left, UP);
  return Math.atan2(fwd.x, fwd.z);
}
function meanYaw(take) {
  let s = 0, c = 0;
  for (let i = 0; i <= last(take); i++) { const y = yawAt(take, i); s += Math.sin(y); c += Math.cos(y); }
  return Math.atan2(s, c);
}
// Turn the whole take about the vertical through `pivot` (x, z)
function turnTake(take, angle, px = 0, pz = 0) {
  const qy = _q2.setFromAxisAngle(UP, angle);
  const qa = take.q[take.pelvis];
  for (let i = 0; i <= last(take); i++) {
    _q.fromArray(qa, i * 4).premultiply(qy).toArray(qa, i * 4);
    _v.set(take.p[i * 3] - px, 0, take.p[i * 3 + 2] - pz).applyQuaternion(qy);
    take.p[i * 3] = _v.x + px;
    take.p[i * 3 + 2] = _v.z + pz;
  }
}
function moveTake(take, dx, dy, dz) {
  for (let i = 0; i <= last(take); i++) { take.p[i * 3] += dx; take.p[i * 3 + 1] += dy; take.p[i * 3 + 2] += dz; }
}
function meanXZ(take) {
  let x = 0, z = 0;
  const n = last(take) + 1;
  for (let i = 0; i < n; i++) { x += take.p[i * 3]; z += take.p[i * 3 + 2]; }
  return [x / n, z / n];
}
// A loop's last frame made the same as its first, the difference spread over the whole cycle
function closeLoop(take) {
  const n = last(take);
  if (n < 1) return;
  for (const a of Object.values(take.q)) {
    const q0 = _q.fromArray(a, 0);
    const diff = _q3.fromArray(a, n * 4).invert().premultiply(q0);     // q0 * qn^-1
    const id = new THREE.Quaternion();
    for (let i = 1; i <= n; i++) {
      const c = id.clone().slerp(diff, i / n);
      _q2.fromArray(a, i * 4).premultiply(c).toArray(a, i * 4);
    }
  }
  const d = [take.p[0] - take.p[n * 3], take.p[1] - take.p[n * 3 + 1], take.p[2] - take.p[n * 3 + 2]];
  for (let i = 1; i <= n; i++) for (let k = 0; k < 3; k++) take.p[i * 3 + k] += (d[k] * i) / n;
}
// The part of a take from `from` seconds on, starting at 0
function sliceTake(take, from) {
  const i0 = take.times.findIndex((t) => t >= from - 1e-4);
  const n = last(take) + 1 - i0;
  const r = { ...take, times: new Float32Array(n), q: {}, p: take.p.slice(i0 * 3) };
  for (let i = 0; i < n; i++) r.times[i] = take.times[i0 + i] - take.times[i0];
  for (const [k, a] of Object.entries(take.q)) r.q[k] = a.slice(i0 * 4);
  return r;
}

// Time running backward. (Quaternion signs are made continuous again afterwards)
function reverseTake(take) {
  const n = last(take) + 1;
  const T = take.times[n - 1];
  const r = { ...take, times: new Float32Array(n), q: {}, p: new Float32Array(n * 3) };
  for (let i = 0; i < n; i++) r.times[i] = T - take.times[n - 1 - i];
  for (const [k, a] of Object.entries(take.q)) {
    const b = (r.q[k] = new Float32Array(n * 4));
    for (let i = 0; i < n; i++) for (let c = 0; c < 4; c++) b[i * 4 + c] = a[(n - 1 - i) * 4 + c];
    makeContinuous(b);
  }
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) r.p[i * 3 + c] = take.p[(n - 1 - i) * 3 + c];
  return r;
}
function makeContinuous(a) {
  for (let i = 4; i < a.length; i += 4) {
    if (a[i] * a[i - 4] + a[i + 1] * a[i - 3] + a[i + 2] * a[i - 2] + a[i + 3] * a[i - 1] < 0) for (let c = 0; c < 4; c++) a[i + c] = -a[i + c];
  }
}
// Ease the take's end (or start) into a given frame over `seconds`
function blendEnd(take, frame, seconds, atStart = false) {
  const n = last(take);
  const T = take.times[n];
  for (let i = 0; i <= n; i++) {
    const t = atStart ? take.times[i] : T - take.times[i];
    if (t >= seconds) continue;
    const u = 1 - t / seconds;
    const w = u * u * (3 - 2 * u);
    for (const [k, a] of Object.entries(take.q)) {
      if (!frame.q[k]) continue;
      _q.fromArray(a, i * 4);
      const f = frame.q[k];
      if (_q.dot(f) < 0) _q2.set(-f.x, -f.y, -f.z, -f.w); else _q2.copy(f);
      _q.slerp(_q2, w).toArray(a, i * 4);
    }
    _v.fromArray(take.p, i * 3).lerp(frame.p, w).toArray(take.p, i * 3);
  }
  for (const a of Object.values(take.q)) makeContinuous(a);
}
// How far the take's body would go through the floor at each moment (model metres): a copy of
// the model posed by it, its lowest skinned vertex every GROUND_STEP seconds
function groundDepth(take, model, rig) {
  const copy = cloneSkinned(model);
  copy.position.set(0, 0, 0);
  copy.rotation.set(0, 0, 0);
  copy.scale.set(1, 1, 1);
  const bones = new Map();
  copy.traverse((o) => { if (o.isBone) bones.set(o.name, o); });
  for (const [name, r] of rig.rest) { const b = bones.get(name); if (b) { b.position.copy(r.p); b.quaternion.copy(r.q); } }
  // (not the hands: pressed flat on the floor to push up, a fingertip may touch it, and lifting
  // the whole body to keep it clear would float him)
  const meshes = [];
  copy.traverse((o) => { if (o.isSkinnedMesh && o.visible && (o.parent?.visible ?? true)) meshes.push(o); });
  const free = meshes.map((m) => {
    const hand = m.skeleton.bones.map((b) => /_(Hand|Finger\d*)_\d+$/.test(b.name));
    const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
    const keep = [];
    for (let i = 0; i < si.count; i += 7) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (hand[si.getComponent(i, k)]) w += sw.getComponent(i, k);
      if (w < 0.5) keep.push(i);
    }
    return keep;
  });
  const mixer = new THREE.AnimationMixer(copy);
  const clip = toClip('ground', take);
  const action = mixer.clipAction(clip).play();
  const T = take.times[last(take)];
  const times = [], depth = [];
  for (let t = 0; t <= T + 1e-6; t += GROUND_STEP) {
    action.time = Math.min(t, T);
    mixer.update(0);
    copy.updateMatrixWorld(true);
    let min = Infinity;
    meshes.forEach((m, k) => {
      for (const i of free[k]) {
        m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld);
        if (_v.y < min) min = _v.y;
      }
    });
    times.push(t);
    depth.push(Math.max(0, -min));
  }
  mixer.stopAllAction();
  mixer.uncacheClip(clip);
  mixer.uncacheRoot(copy);
  copy.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.dispose(); });
  return { times, depth };
}

// Raise the take's hips out of the floor: by the depth at each moment, each lift spread to the
// moments around it (a running maximum, then an average over as long, so it never dips below
// what any moment needs), or by the deepest of all (`hold`)
function groundLift(take, model, rig, how, pinStart = 0) {
  const hold = how === 'hold';
  const { times, depth } = groundDepth(take, model, rig);
  const n = times.length;
  let lift;
  if (hold) {
    const d = Math.max(...depth);
    lift = depth.map(() => d);
  } else {
    const r = Math.max(1, Math.round(how / GROUND_STEP));
    const peak = depth.map((_, i) => Math.max(...depth.slice(Math.max(0, i - r), Math.min(n, i + r + 1))));
    lift = peak.map((_, i) => {
      const w = peak.slice(Math.max(0, i - r), Math.min(n, i + r + 1));
      return w.reduce((a, b) => a + b, 0) / w.length;
    });
  }
  for (let i = 0; i <= last(take); i++) {
    const f = Math.min(n - 1, take.times[i] / GROUND_STEP);
    const j = Math.floor(f), k = Math.min(n - 1, j + 1);
    // (pinStart: none at the start, all of it after that many seconds, so the start still meets the clip before it)
    const pin = pinStart > 0 ? smooth(Math.min(1, take.times[i] / pinStart)) : 1;
    take.p[i * 3 + 1] += (lift[j] + (lift[k] - lift[j]) * (f - j)) * pin;
  }
  return { max: Math.max(...lift), end: lift[n - 1], depthMax: Math.max(...depth) };
}

// Feet kept out of the floor: wherever a shoe's heel, ball or toe tip would go below it, the
// ankle is raised that far by bending the hip and knee (two-bone IK in the leg's own bend plane),
// the foot keeping its turn. Blending two different floor poses (the sit-down settling into the
// sitting idle) swings the feet through arcs below both, which this takes out.
function feetOnFloor(take, rig) {
  const pelvis = take.pelvis;
  const legs = ['L', 'R'].map((s) => {
    const [th, ca, ft, toe] = ['Thigh', 'Calf', 'Foot', 'Toe0'].map((b) => rig.find(`${s}_${b}`).name);
    const A0 = rig.rest.get(ft).wp, T0 = rig.rest.get(toe).wp;
    const qa = rig.rest.get(ft).wq.clone().invert(), qt = rig.rest.get(toe).wq.clone().invert();
    // the shoe's sole (model rest; Voss stands with his soles on y = 0): under the heel, the ball, the toe tip
    const heel = new THREE.Vector3(A0.x, 0.004, A0.z - 0.03).sub(A0).applyQuaternion(qa);
    const ball = new THREE.Vector3(T0.x, 0.004, T0.z).sub(T0).applyQuaternion(qt);
    const tip = new THREE.Vector3(T0.x, 0.004, T0.z + 0.07).sub(T0).applyQuaternion(qt);
    return { th, ca, ft, toe, heel, ball, tip };
  });
  const H = new THREE.Vector3(), K = new THREE.Vector3(), A = new THREE.Vector3(), Tp = new THREE.Vector3();
  const qp = new THREE.Quaternion(), qth = new THREE.Quaternion(), qca = new THREE.Quaternion(), qft = new THREE.Quaternion(), qtoe = new THREE.Quaternion();
  const r = new THREE.Quaternion(), r2 = new THREE.Quaternion(), w = new THREE.Vector3();
  let fixed = 0;
  for (let i = 0; i <= last(take); i++) {
    for (const l of legs) {
      qp.fromArray(take.q[pelvis], i * 4);
      const P = _v.fromArray(take.p, i * 3);
      H.copy(rig.rest.get(l.th).p).applyQuaternion(qp).add(P);
      qth.copy(qp).multiply(_q.fromArray(take.q[l.th], i * 4));
      K.copy(rig.rest.get(l.ca).p).applyQuaternion(qth).add(H);
      qca.copy(qth).multiply(_q.fromArray(take.q[l.ca], i * 4));
      A.copy(rig.rest.get(l.ft).p).applyQuaternion(qca).add(K);
      qft.copy(qca).multiply(_q.fromArray(take.q[l.ft], i * 4));
      Tp.copy(rig.rest.get(l.toe).p).applyQuaternion(qft).add(A);
      qtoe.copy(qft).multiply(_q.fromArray(take.q[l.toe], i * 4));
      let low = w.copy(l.heel).applyQuaternion(qft).add(A).y;
      low = Math.min(low, w.copy(l.ball).applyQuaternion(qtoe).add(Tp).y, w.copy(l.tip).applyQuaternion(qtoe).add(Tp).y);
      if (low >= 0) continue;
      fixed++;
      // the ankle's goal, as far as the leg reaches
      const goal = _v2.copy(A).setY(A.y - low);
      const l1 = H.distanceTo(K), l2 = K.distanceTo(A);
      const toG = _v3.subVectors(goal, H);
      const d = THREE.MathUtils.clamp(toG.length(), Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.999);
      toG.normalize();
      const bend = new THREE.Vector3().subVectors(K, H);
      bend.addScaledVector(toG, -bend.dot(toG));
      if (bend.lengthSq() < 1e-10) bend.set(0, 0, 1).addScaledVector(toG, -toG.z);
      bend.normalize();
      const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
      const knee = new THREE.Vector3().copy(H).addScaledVector(toG, along).addScaledVector(bend, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
      r.setFromUnitVectors(new THREE.Vector3().subVectors(K, H).normalize(), new THREE.Vector3().subVectors(knee, H).normalize());
      const nth = r.clone().multiply(qth);
      const oldShin = new THREE.Vector3().subVectors(A, K).applyQuaternion(r).normalize();
      const reach = new THREE.Vector3().copy(H).addScaledVector(toG, d);
      r2.setFromUnitVectors(oldShin, reach.sub(knee).normalize());
      const nca = r2.multiply(r).multiply(qca);
      // back to locals; the foot keeps its world turn
      _q.copy(qp).invert().multiply(nth).toArray(take.q[l.th], i * 4);
      _q.copy(nth).invert().multiply(nca).toArray(take.q[l.ca], i * 4);
      _q.copy(nca).invert().multiply(qft).toArray(take.q[l.ft], i * 4);
    }
  }
  for (const a of Object.values(take.q)) makeContinuous(a);
  return fixed;
}

// Forward kinematics for a chain of driven bones (world positions, model space) at frame i
function chainAt(take, rig, names, i, out = []) {
  const p = _v.fromArray(take.p, i * 3).clone();
  const q = _q.fromArray(take.q[take.pelvis], i * 4).clone();
  let k = 0;
  for (const name of names) {
    p.add(_v2.copy(rig.rest.get(name).p).applyQuaternion(q));
    q.multiply(_q2.fromArray(take.q[name], i * 4));
    (out[k++] ||= new THREE.Vector3()).copy(p);
  }
  return out;
}

// The walk's pace and where in its cycle it can stop well: { stride: model metres per second the
// planted foot slides back, stops: [clip times], feet over the cycle }
function measureWalk(walk, idle, rig) {
  const legs = ['L', 'R'].map((s) => ['Thigh', 'Calf', 'Foot', 'Toe0'].map((b) => rig.find(`${s}_${b}`).name));
  const n = last(walk);
  const feet = [];
  for (let i = 0; i <= n; i++) feet.push(legs.map((l) => chainAt(walk, rig, l, i).map((v) => v.clone())));
  const idleFeet = legs.map((l) => chainAt(idle, rig, l, 0).map((v) => v.clone()));
  // a foot is planted while its toe is within 1.5 cm of its lowest
  const low = [0, 1].map((s) => Math.min(...feet.map((f) => f[s][3].y)));
  const speeds = [];
  for (let i = 1; i <= n; i++) {
    for (let s = 0; s < 2; s++) {
      if (feet[i][s][3].y > low[s] + 0.015 || feet[i - 1][s][3].y > low[s] + 0.015) continue;
      const dt = walk.times[i] - walk.times[i - 1];
      const a = feet[i][s][2], b = feet[i - 1][s][2];
      speeds.push(Math.hypot(a.x - b.x, a.z - b.z) / dt);
    }
  }
  speeds.sort((a, b) => a - b);
  const stride = speeds[Math.floor(speeds.length / 2)] || 0;
  // A good stop: one foot planted, both feet near where the idle has them (the moving one close)
  const score = feet.map((f) => {
    const planted = Math.min(f[0][3].y - low[0], f[1][3].y - low[1]) < 0.01;
    let d = 0;
    for (let s = 0; s < 2; s++) d += Math.hypot(f[s][2].x - idleFeet[s][2].x, f[s][2].z - idleFeet[s][2].z);
    return planted ? d : Infinity;
  });
  // the best frame of each half cycle (each step)
  const half = Math.round(n / 2);
  const stops = [];
  for (const [a, b] of [[0, half], [half, n]]) {
    let best = -1;
    for (let i = a; i < b; i++) if (best < 0 || score[i] < score[best]) best = i;
    if (best >= 0 && score[best] < Infinity) stops.push({ time: walk.times[best], score: score[best] });
  }
  return { stride, stops, feet, low };
}

function toClip(name, take) {
  const tracks = [];
  for (const [k, a] of Object.entries(take.q)) tracks.push(new THREE.QuaternionKeyframeTrack(k + '.quaternion', take.times, a));
  tracks.push(new THREE.VectorKeyframeTrack(take.pelvis + '.position', take.times, take.p));
  return new THREE.AnimationClip(name, take.times[last(take)], tracks);
}

// ---------------------------------------------------------------- loading

let loading = null;

function disposeFbx(fbx) {
  fbx?.traverse((o) => {
    o.geometry?.dispose();
    o.skeleton?.dispose();
    for (const m of [].concat(o.material || [])) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      m.dispose();
    }
  });
}

// The model a source stands for: a Player (its third-person body), or any copy of Voss's model
function modelOf(src) {
  return src?.bodyRoot || src;
}

// The acting clips, retargeted onto Voss: an array of AnimationClips named as ACTING_CLIPS, each
// with userData { loop, travel, ... } (see the report). Loads the FBX files on the first call only;
// later calls share it. `src`: the Player (after it has loaded) or a Voss model.
export function loadVossActing(src) {
  loading ||= (async () => {
    if (src?.whenReady) await src.whenReady;
    const rig = vossRig(modelOf(src));
    const loader = createFBXLoader();
    const names = Object.keys(FILES);
    const t0 = performance.now();
    const fbxs = await Promise.all(names.map((n) => loader.loadAsync(DIR + encodeURIComponent(FILES[n]))));
    const t1 = performance.now();
    const takes = {};
    try {
      names.forEach((n, i) => { takes[n] = retarget(fbxs[i], rig); });
    } finally {
      fbxs.forEach(disposeFbx);
    }
    const timing = { load: t1 - t0, retarget: performance.now() - t1 };
    const t2 = performance.now();
    const built = build(takes, rig, modelOf(src));
    timing.build = performance.now() - t2;
    return { ...built, timing };
  })();
  loading.catch(() => { loading = null; });       // (a failed load may be tried again)
  return loading.then((r) => r.clips);
}

// Details of the last load for the preview page and the checks: the takes, the walk's measures
export function vossActingInfo() {
  return loading;
}

function build(takes, rig, model) {
  const restP = rig.rest.get(takes.SadIdle.pelvis).p;
  const anchorTo = (take, i, x, z) => moveTake(take, x - take.p[i * 3], 0, z - take.p[i * 3 + 2]);

  // Facing +Z like Voss's own clips, and standing over his rest spot
  for (const n of ['InjuredWalk', 'SadIdle']) {
    const t = takes[n];
    const [cx, cz] = meanXZ(t);
    turnTake(t, -meanYaw(t), cx, cz);
    closeLoop(t);
    const [mx, mz] = meanXZ(t);
    moveTake(t, restP.x - mx, 0, restP.z - mz);
  }
  for (const [n, i] of [['Stagger', 0], ['FallForward', 0]]) {
    const t = takes[n];
    turnTake(t, -yawAt(t, i), t.p[i * 3], t.p[i * 3 + 2]);
    anchorTo(t, i, restP.x, restP.z);
  }
  // The stand-up ends standing where the idles stand, facing the same way; the seated idle sits
  // where the stand-up starts, facing as it does
  const up = takes.StandUp, sit = takes.SitIdle;
  turnTake(up, -yawAt(up, last(up)), up.p[last(up) * 3], up.p[last(up) * 3 + 2]);
  anchorTo(up, last(up), restP.x, restP.z);
  turnTake(sit, yawAt(up, 0) - yawAt(sit, 0), sit.p[0], sit.p[2]);
  anchorTo(sit, 0, up.p[0], up.p[2]);
  closeLoop(sit);
  // Out of the floor (SitIdle first: the stand-up starts from it), and the seated end of the
  // sit-down and the start of the stand-up made SitIdle's first frame
  const ground = {};
  const feet = {};
  feet.SitIdle = feetOnFloor(sit, rig);
  ground.SitIdle = groundLift(sit, model, rig, ON_FLOOR.SitIdle);
  const seated = frameOf(sit, 0);
  const mismatch = poseDistance(frameOf(up, 0), seated);
  blendEnd(up, seated, SIT_JOIN, true);
  feet.StandUp = feetOnFloor(up, rig);
  ground.StandUp = groundLift(up, model, rig, ON_FLOOR.StandUp, SIT_JOIN);
  const down = reverseTake(sliceTake(up, SIT_CUT));
  blendEnd(down, seated, SIT_SETTLE, false);
  feet.SitDown = feetOnFloor(down, rig);
  takes.SitDown = down;
  feet.FallForward = feetOnFloor(takes.FallForward, rig);
  ground.FallForward = groundLift(takes.FallForward, model, rig, ON_FLOOR.FallForward);
  ground.feet = feet;

  // Falling from sitting on the floor: the clip starts standing, so from a seat it starts at its
  // frame most like the seated pose before he hits the floor (kneeling: he gets to his knees and
  // collapses). Any later frame has him lying face down already, and blending a seat into that
  // sweeps the legs through the floor
  const fall = takes.FallForward;
  let fromSit = 0, best = Infinity;
  const landed = fall.times.findIndex((t, i) => fall.p[i * 3 + 1] < 0.3);
  for (let i = 0; i < (landed < 0 ? last(fall) + 1 : landed); i++) {
    const f = frameOf(fall, i);
    const d = poseDistance(f, seated).angle + 2 * Math.abs(f.p.y - seated.p.y);
    if (d < best) { best = d; fromSit = fall.times[i]; }
  }
  const rest = sliceTake(fall, fromSit);
  moveTake(rest, seated.p.x - rest.p[0], 0, seated.p.z - rest.p[2]);
  const target = frameOf(rest, 0);
  const steps = Math.round(SLUMP * 30);
  const n = steps + last(rest) + 1;
  const slump = { ...rest, times: new Float32Array(n), q: {}, p: new Float32Array(n * 3) };
  for (const k of Object.keys(rest.q)) slump.q[k] = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    if (i < steps) {
      const u = smooth(i / steps);
      slump.times[i] = i / 30;
      for (const k of Object.keys(rest.q)) {
        _q.copy(seated.q[k]);
        if (_q.dot(target.q[k]) < 0) _q.set(-_q.x, -_q.y, -_q.z, -_q.w);
        _q.slerp(target.q[k], u).toArray(slump.q[k], i * 4);
      }
      _v.copy(seated.p).lerp(target.p, u).toArray(slump.p, i * 3);
    } else {
      const j = i - steps;
      slump.times[i] = SLUMP + rest.times[j];
      for (const k of Object.keys(rest.q)) for (let c = 0; c < 4; c++) slump.q[k][i * 4 + c] = rest.q[k][j * 4 + c];
      for (let c = 0; c < 3; c++) slump.p[i * 3 + c] = rest.p[j * 3 + c];
    }
  }
  for (const a of Object.values(slump.q)) makeContinuous(a);
  feet.FallFromSit = feetOnFloor(slump, rig);
  ground.FallFromSit = groundLift(slump, model, rig, ON_FLOOR.FallForward, SLUMP * 0.5);
  takes.FallFromSit = slump;

  const walk = measureWalk(takes.InjuredWalk, takes.SadIdle, rig);
  const clips = ACTING_CLIPS.map((n) => {
    const take = takes[n];
    const clip = toClip(n, take);
    const s = frameOf(take, 0).p, e = frameOf(take, last(take)).p;
    clip.userData = {
      loop: LOOPS.has(n),
      // where the hips go over the clip (model metres, x and z): the clips that travel keep it
      // (nothing teleports), so the body ends this far from the actor's origin
      travel: [e.x - s.x, e.z - s.z],
      start: [s.x - restP.x, s.z - restP.z],
      end: [e.x - restP.x, e.z - restP.z]
    };
    if (n === 'FallForward') {
      clip.userData.fromSit = fromSit;
      // (VossActor plays this in its place after SitIdle)
      clip.userData.fromSeat = toClip('FallForward@sit', takes.FallFromSit);
      clip.userData.fromSeat.userData = { loop: false };
    }
    if (n === 'InjuredWalk') Object.assign(clip.userData, { stride: walk.stride, stops: walk.stops.map((s) => s.time) });
    return clip;
  });
  return { clips, takes, rig, walk, ground, sitMismatch: mismatch };
}

// How far apart two poses are: the mean angle between their bones (radians) and the hips' gap (m)
function poseDistance(a, b) {
  let s = 0, n = 0;
  for (const k of Object.keys(a.q)) { if (b.q[k]) { s += a.q[k].angleTo(b.q[k]); n++; } }
  return { angle: s / Math.max(1, n), hips: a.p.distanceTo(b.p) };
}

// ---------------------------------------------------------------- the actor

// Crossfade lengths (seconds) between clips, by "from>to"; anything else uses DEFAULT_FADE
export const TRANSITIONS = {
  'InjuredWalk>SadIdle': 0.35,     // after the walk has planted a foot (stopWalk)
  'SadIdle>InjuredWalk': 0.4,
  'InjuredWalk>Stagger': 0.2,
  'SadIdle>Stagger': 0.15,         // a flinch: it has to land at once
  'Stagger>SadIdle': 0.5,          // the recovery is slow
  'SadIdle>SitDown': 0.5,
  'Stagger>SitDown': 0.45,
  'SitDown>SitIdle': 0.3,          // (the sit-down already ends on SitIdle's first frame)
  'SitIdle>StandUp': 0.3,
  'StandUp>SadIdle': 0.4,
  'SitIdle>FallForward': 0.6,      // (from his knees: see START_AT; up from the seat takes a moment)
  'SadIdle>FallForward': 0.25,
  'Stagger>FallForward': 0.25,
  'InjuredWalk>FallForward': 0.25
};
const DEFAULT_FADE = 0.35;
// A clip played in another's place after a given one: [clip, its userData key]
const VARIANT = { 'SitIdle>FallForward': 'fromSeat' };
// The walk slows to this share of its pace over the last of its step before it stops
const STOP_SLOW = 0.45;

// Idle life (radians, seconds): breathing, the weight shifting from hip to hip, the head wandering
const BREATH_PERIOD = 4.6;
const BREATH_CHEST = 0.012;        // the chest's lift (about 2 mm at the shoulders)
const BREATH_SHOULDER = 0.012;
const SHIFT_PERIOD = 9.5;
const SHIFT_HIP = 0.018;           // the hips' tilt (about 1.5 cm at the hip joints over half a cycle)
const DRIFT = 0.025;
// A hand on the floor (sitting, pushing up, lying) is lifted until its finger joints are this far
// over the floor (world metres; the actor's root is the floor): his hands reach lower than the
// Mixamo figure's
const HAND_CLEAR = 0.03;

// The bones a caller can ask for by a short name (bone())
const SHORT = {
  pelvis: 'Pelvis', spine: 'Spine', spine1: 'Spine1', spine2: 'Spine2', spine4: 'Spine4', chest: 'Spine4', neck: 'Neck1', head: 'Head1'
};
for (const [s, S] of [['L', 'left'], ['R', 'right']]) {
  for (const [k, b] of Object.entries({ Clavicle: 'Clavicle', UpperArm: 'UpperArm', Forearm: 'Forearm', Hand: 'Hand', Thigh: 'Thigh', Calf: 'Calf', Foot: 'Foot', Toe: 'Toe0', Ulna: 'Ulna', Bicep: 'Bicep' })) {
    SHORT[S + k] = `${s}_${b}`;
  }
}

export class VossActor {
  // src: the Player (loaded) or a Voss model; clips: from loadVossActing. The copy shares the
  // source's materials and geometry (dispose() leaves them alone).
  constructor(src, clips, { preset = 'resigned', wound = true } = {}) {
    const source = modelOf(src);
    this.root = new THREE.Group();
    this.root.name = 'VossActor';
    this.scale = 1.8 / MODEL_HEIGHT;
    const model = cloneSkinned(source);
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.setScalar(this.scale);
    this.model = model;
    this.root.add(model);
    model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

    // back to his rest pose (the source may have been mid-clip, his head turned)
    this.rig = vossRig(model);
    for (const b of this.rig.bones) {
      const r = this.rig.rest.get(b.name);
      b.position.copy(r.p);
      b.quaternion.copy(r.q);
    }
    this._bones = {};
    for (const [k, v] of Object.entries(SHORT)) this._bones[k] = this.rig.find(v);

    this.face = new FaceRig(model, preset);
    showWound(model, wound);

    this.clips = Object.fromEntries(clips.map((c) => [c.name, c]));
    this.anim = new Animator(model, clips);
    // a one-shot played again while it still shows starts on a twin, so it can fade from itself
    for (const c of clips) {
      if (c.userData.fromSeat) this.anim.add(c.userData.fromSeat);
      if (!c.userData.loop) {
        const twin = c.clone();
        twin.name = c.name + '#2';
        this.anim.add(twin);
      }
    }
    this._weights = new Map();     // action -> weight now
    this._fade = null;             // { t, dur, from: Map(action -> weight), to: action }
    this.current = null;           // the action fading in or playing
    this.currentName = null;
    this._then = null;             // { name, at (clip time), opts } the clip that follows a one-shot

    // the walk
    const walk = this.clips.InjuredWalk;
    this.naturalWalkSpeed = (walk?.userData.stride || 0) * this.scale;   // m/s at the clip's own pace
    this.walkRate = 1;
    this._stop = null;             // { at: clip time, then, rate0 } a stop under way

    // layers on top of the clips
    this.breathing = true;
    this.weightShift = true;
    this.headDrift = true;
    this.faceHead = true;          // FaceRig's head motion (looks, nods, shakes, sway) on the neck and head
    this.handsOnFloor = true;      // hands kept out of the floor (HAND_CLEAR)
    this._hooks = [];
    this._poseHooks = [];
    this._undo = [];
    this._reach = { L: null, R: null };
    this._time = Math.random() * 20;
    const turn = (bone, q) => this.turnBone(bone, q);
    this._arms = { L: new ArmIK(model, 'L', turn), R: new ArmIK(model, 'R', turn) };
  }

  // ------------------------------------------------------------ clips

  // Play a clip, fading from whatever plays now (fade: seconds, default from TRANSITIONS).
  // opts: { fade, at (start time in the clip), rate, restart, then (a clip to cross to when a
  // one-shot ends), thenFade }
  play(name, opts = {}) {
    return this.crossTo(name, opts);
  }

  crossTo(name, { fade, at = null, rate = 1, restart = false, then = null, thenFade } = {}) {
    const clip = this.clips[name];
    if (!clip) { console.warn('VossActor: no clip', name); return null; }
    const loop = clip.userData.loop;
    const fromName = this.currentName;
    this._fade?.done?.();          // (a stop waiting on a fade this one replaces: it is over)
    this._stop?.resolve();
    this._stop = null;
    const variant = clip.userData[VARIANT[`${fromName}>${name}`]];
    let next = this.anim.actions[variant ? variant.name : name];
    if (!variant && !loop && (restart || next === this.current || (this._weights.get(next) || 0) > 0)) {
      // the one-shot is showing: start its twin instead and fade between the two
      const twin = this.anim.actions[name + '#2'];
      if ((this._weights.get(twin) || 0) < (this._weights.get(next) || 0) || next === this.current) next = twin;
    }
    if (next === this.current && !restart && loop) return next;
    const showing = (this._weights.get(next) || 0) > 0 && next.isRunning();
    if (!showing || restart || !loop) {
      next.reset();
      next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      next.clampWhenFinished = !loop;
      if (at !== null) next.time = at;
      next.play();
    }
    next.paused = false;
    next.timeScale = name === 'InjuredWalk' ? this.walkRate : rate;
    const dur = fade ?? TRANSITIONS[`${fromName}>${name}`] ?? DEFAULT_FADE;
    const from = new Map();
    for (const [a, w] of this._weights) if (w > 1e-4) from.set(a, w);
    if (!this.current || dur <= 0) {
      for (const a of from.keys()) this._weights.set(a, 0);
      this._weights.set(next, 1);
      this._fade = null;
    } else {
      this._fade = { t: 0, dur, from, to: next };
    }
    this.current = next;
    this.currentName = name;
    this._then = then ? { name: then, fade: thenFade ?? TRANSITIONS[`${name}>${then}`] ?? DEFAULT_FADE } : null;
    return next;
  }

  // The clip has played to its end (a one-shot), or a loop has played through once
  isFinished(name) {
    if (this.currentName !== name || !this.current) return false;
    const a = this.current;
    return a.time >= a.getClip().duration - 1e-3 || (a.loop === THREE.LoopRepeat && a._loopCount > 0);
  }

  // The walk: at `walkSpeed` m/s over the ground (the clip's pace follows, so the feet do not slide)
  get walkSpeed() { return this.naturalWalkSpeed * this.walkRate; }
  set walkSpeed(v) {
    this.walkRate = THREE.MathUtils.clamp(v / (this.naturalWalkSpeed || 1), 0.4, 1.8);
    const a = this.anim.actions.InjuredWalk;
    if (a && !this._stop) a.timeScale = this.walkRate;
  }

  // How fast the actor's root should move now (m/s, along its facing): the walk's pace times its
  // weight, slowing through a stop and nothing once the walk has stopped. The caller (or walkTo)
  // moves the root; the clips play in place
  get moveSpeed() {
    const a = this.anim.actions.InjuredWalk;
    if (!a || this.currentName !== 'InjuredWalk' || a.paused) return 0;
    return this.naturalWalkSpeed * a.timeScale * (this._weights.get(a) || 0);
  }

  // Stop walking with a foot planted: the walk carries on (slowing) to its next stop in its cycle,
  // holds there and fades to `then`. Resolves when the fade has finished.
  stopWalk(then = 'SadIdle', { fade } = {}) {
    const a = this.anim.actions.InjuredWalk;
    if (this.currentName !== 'InjuredWalk' || !a) return Promise.resolve(this.crossTo(then, { fade }));
    const { at, wait } = this._nextStop();
    return new Promise((resolve) => {
      this._stop = { at, left: wait, total: wait, then, fade, resolve, rate0: a.timeScale };
    });
  }

  // The next stop time in the walk's cycle and how much clip time is left to it
  _nextStop() {
    const a = this.anim.actions.InjuredWalk;
    const d = a.getClip().duration;
    const stops = this.clips.InjuredWalk.userData.stops || [0];
    const t = a.time % d;
    let best = null;
    for (const s of stops) {
      let w = s - t;
      if (w < 0.08) w += d;        // (too close to slow into: the next one)
      if (best === null || w < best.wait) best = { at: s, wait: w };
    }
    return best;
  }

  // How far the walk goes from now if told to stop now (m, at the actor's scale)
  stopDistance() {
    const a = this.anim.actions.InjuredWalk;
    if (!a || this.currentName !== 'InjuredWalk') return 0;
    const { wait } = this._nextStop();
    // distance = stride speed * clip time left (the slow-down changes the time, not the distance)
    return this.naturalWalkSpeed * wait;
  }

  // Walk the root straight to a point (world, on its own floor), facing it, and stop there with a
  // planted foot into `then`. Resolves when he stands. `turn`: seconds to turn to face it
  walkTo(point, { then = 'SadIdle', turn = 0.6 } = {}) {
    this._walkTo?.resolve?.();
    this.crossTo('InjuredWalk');
    return new Promise((resolve) => {
      this._walkTo = { point: point.clone(), then, turn, resolve, stopping: false };
    });
  }

  _updateWalkTo(dt) {
    const w = this._walkTo;
    if (!w) return;
    const root = this.root;
    const to = _v.copy(w.point);
    root.parent?.worldToLocal(to);
    const dx = to.x - root.position.x, dz = to.z - root.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.02) {
      const want = Math.atan2(dx, dz);
      let d = want - root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      root.rotation.y += d * (1 - Math.exp(-dt / Math.max(0.05, w.turn / 3)));
    }
    const step = Math.min(this.moveSpeed * dt, dist);
    root.position.x += Math.sin(root.rotation.y) * step;
    root.position.z += Math.cos(root.rotation.y) * step;
    if (!w.stopping && dist - step <= this.stopDistance() + 1e-3) {
      w.stopping = true;
      this.stopWalk(w.then).then(() => {
        if (this._walkTo === w) this._walkTo = null;
        w.resolve();
      });
    }
  }

  _updateStop(dt) {
    const s = this._stop;
    if (!s) return;
    const a = this.anim.actions.InjuredWalk;
    // slow over the last of the step: the pace eases from rate0 down to STOP_SLOW of it
    const u = 1 - s.left / Math.max(s.total, 1e-3);
    a.timeScale = s.rate0 * (1 - (1 - STOP_SLOW) * smooth(Math.min(1, u)));
    const step = a.timeScale * dt;
    if (step >= s.left) {
      // planted: hold the walk on its stop frame and fade to the next clip
      a.time = s.at;
      a.paused = true;
      this._stop = null;
      this.crossTo(s.then, { fade: s.fade });
      if (this._fade) this._fade.done = s.resolve;
      else s.resolve();
      return;
    }
    s.left -= step;
  }

  // ------------------------------------------------------------ per frame

  update(dt) {
    // undo last frame's procedural turns before the clips run
    this._restore();
    this._time += dt;

    this._updateStop(dt);
    this._updateWalkTo(dt);

    // a one-shot hands over to what follows it, the fade ending as it does
    if (this._then && this.current && !this._fade) {
      const a = this.current, d = a.getClip().duration;
      if (a.time >= d - this._then.fade * a.timeScale - 1e-3) {
        const { name, fade } = this._then;
        this._then = null;
        this.crossTo(name, { fade });
      }
    }

    // the weights: every clip that shows eases from its weight to 0, the new one to 1; they
    // always add up to exactly 1 (no frame of the rest pose, no half-weighted pose)
    if (this._fade) {
      const f = this._fade;
      f.t += dt;
      const u = smooth(Math.min(1, f.t / f.dur));
      const w0 = f.from.get(f.to) || 0;
      for (const [a, w] of f.from) if (a !== f.to) this._weights.set(a, w * (1 - u));
      this._weights.set(f.to, w0 + (1 - w0) * u);
      if (f.t >= f.dur) {
        this._fade = null;
        f.done?.();
      }
    }
    for (const [a, w] of this._weights) {
      if (w <= 1e-4 && a !== this.current) {
        a.stop();
        this._weights.delete(a);
      } else {
        a.enabled = true;
        a.setEffectiveWeight(w);
      }
    }
    this.anim.update(dt);

    this.model.updateMatrixWorld(true);
    this.face.update(dt);
    this._life();
    for (const fn of this._poseHooks) fn(this, dt);
    if (this.handsOnFloor) this._handsClear();
    this._applyReaches(dt);
    for (const fn of this._hooks) fn(this, dt);
  }

  // The weight of a clip now (0..1): both twins of a one-shot count
  weight(name) {
    let w = 0;
    for (const n of [name, name + '#2']) {
      const a = this.anim.actions[n];
      if (a) w += this._weights.get(a) || 0;
    }
    return w;
  }

  // Every clip showing now and its weight, for the readout: [[name, weight, time], ...]
  weights() {
    const out = [];
    for (const [a, w] of this._weights) out.push([a.getClip().name, w, a.time]);
    return out;
  }

  // ------------------------------------------------------------ procedural layers

  // fn(actor, dt) every frame after the clips (and the breathing, the face's head motion and the
  // reaches), before rendering. Bones turned with actor.turnBone are put back before the next frame's
  // clips. Returns a function that removes the hook
  onAfterMixer(fn) {
    this._hooks.push(fn);
    return () => { this._hooks = this._hooks.filter((f) => f !== fn); };
  }

  // fn(actor, dt) every frame after the clips and the idle life, but before the hands are kept off
  // the floor and the reaches are applied: for work that moves the body itself (a pose built on a
  // held clip), so the reaches land on the body where it ends up. Returns a function that removes it
  onPose(fn) {
    this._poseHooks.push(fn);
    return () => { this._poseHooks = this._poseHooks.filter((f) => f !== fn); };
  }

  // A bone by short name: pelvis, spine, spine1, spine2, spine4 (chest), neck, head, and
  // left/right + Clavicle, UpperArm, Forearm, Hand, Thigh, Calf, Foot, Toe, Ulna, Bicep
  // (leftHand, rightUpperArm, ...); or a full bone name
  bone(name) {
    return this._bones[name] || this.rig.byName.get(name) || null;
  }

  // Turn a bone about its own pivot by a world rotation (on top of the clips; undone next frame)
  turnBone(bone, rotation) {
    if (!bone) return;
    this._undo.push([bone, bone.quaternion.clone(), bone.position.clone()]);
    bone.parent.getWorldQuaternion(_q3);
    const pInv = _q3.clone().invert();
    bone.quaternion.premultiply(_q3).premultiply(rotation).premultiply(pInv);
    bone.updateWorldMatrix(false, true);
  }

  _restore() {
    for (let i = this._undo.length - 1; i >= 0; i--) {
      const [bone, q, p] = this._undo[i];
      bone.quaternion.copy(q);
      bone.position.copy(p);
    }
    this._undo.length = 0;
  }

  // An axis of the actor in world space (0: his left, 1: up, 2: forward)
  _axis(i, out) {
    this.root.getWorldQuaternion(_q);
    return out.set(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0).applyQuaternion(_q);
  }

  _life() {
    const t = this._time;
    const idle = this.weight('SadIdle') + this.weight('SitIdle') + 0.5 * this.weight('Stagger');
    const standing = this.weight('SadIdle');
    const side = this._axis(0, new THREE.Vector3());
    const fwd = this._axis(2, new THREE.Vector3());
    const q = new THREE.Quaternion();
    const b = this._bones;
    if (this.breathing && idle > 0) {
      // in a little quicker than out
      const ph = (t % BREATH_PERIOD) / BREATH_PERIOD;
      const breath = ph < 0.4 ? smooth(ph / 0.4) : 1 - smooth((ph - 0.4) / 0.6);
      const e = (breath - 0.5) * idle;
      this.turnBone(b.spine2, q.setFromAxisAngle(side, -e * BREATH_CHEST * 0.5));
      this.turnBone(b.spine4, q.setFromAxisAngle(side, -e * BREATH_CHEST));
      this.turnBone(b.leftClavicle, q.setFromAxisAngle(fwd, e * BREATH_SHOULDER));
      this.turnBone(b.rightClavicle, q.setFromAxisAngle(fwd, -e * BREATH_SHOULDER));
      // (the head stays level: the chest's lift taken back out at the neck)
      this.turnBone(b.neck, q.setFromAxisAngle(side, e * BREATH_CHEST * 1.5));
    }
    if (this.weightShift && standing > 0) {
      // the hips tip from side to side, the legs stay as they were (so the feet do not move) and
      // the back takes it out again higher up
      const s = Math.sin((t / SHIFT_PERIOD) * Math.PI * 2) * SHIFT_HIP * standing;
      this.turnBone(b.pelvis, q.setFromAxisAngle(fwd, s));
      this.turnBone(b.leftThigh, q.setFromAxisAngle(fwd, -s));
      this.turnBone(b.rightThigh, q.setFromAxisAngle(fwd, -s));
      this.turnBone(b.spine1, q.setFromAxisAngle(fwd, -s * 0.6));
      this.turnBone(b.spine4, q.setFromAxisAngle(fwd, -s * 0.3));
    }
    const up = this._axis(1, new THREE.Vector3());
    let yaw = 0, pitch = 0, roll = 0;
    if (this.headDrift && idle > 0) {
      yaw += (Math.sin(t * 0.23) * 0.6 + Math.sin(t * 0.61 + 2) * 0.4) * DRIFT * idle;
      pitch += Math.sin(t * 0.17 + 1) * DRIFT * 0.5 * idle;
    }
    if (this.faceHead) {
      const h = this.face.head;
      yaw += h.yaw;
      pitch += h.pitch;      // (a bow: + tips the head down)
      roll += h.roll;
    }
    if (yaw || pitch || roll) {
      for (const [bone, share] of [[b.neck, 0.4], [b.head, 0.6]]) {
        q.setFromAxisAngle(up, yaw * share)
          .multiply(_q2.setFromAxisAngle(side, pitch * share))
          .multiply(_q3.setFromAxisAngle(fwd, roll * share));
        this.turnBone(bone, q);
      }
    }
  }

  _handsClear() {
    const up = this._axis(1, _v3);
    const floor = this.root.getWorldPosition(_v2).dot(up);
    for (const side of ['L', 'R']) {
      const arm = this._arms[side];
      if (!arm.ok || this.reachWeight(side) >= 1) continue;
      let low = Infinity;
      for (const joints of arm.digits) for (const j of joints) low = Math.min(low, j.getWorldPosition(_v).dot(up));
      const d = HAND_CLEAR - (low - floor);
      if (d <= 0) continue;
      const fingers = new THREE.Vector3(), palm = new THREE.Vector3();
      arm.frame(fingers, palm);
      const wrist = arm.hand.getWorldPosition(new THREE.Vector3()).addScaledVector(up, d);
      const elbow = arm.fore.getWorldPosition(new THREE.Vector3());
      const pole = elbow.clone().sub(arm.upper.getWorldPosition(_v).add(wrist).multiplyScalar(0.5));
      arm.hold({ wrist, fingers, palm, pole, curl: [0, 0, 0], thumb: [0, 0, 0] });
    }
  }

  // Pull a hand to a grip (see ArmIK: { wrist, fingers, palm, pole, curl, thumb }, world space; or
  // a function returning one each frame, for a moving target), eased in over `fade` seconds.
  // reach(side, null) eases it back to the clips. `weight` caps how far it goes (0..1)
  reach(side, grip, { fade = 0.5, weight = 1 } = {}) {
    const r = this._reach[side] || (this._reach[side] = { w: 0, grip: null, target: 0, speed: 1 });
    if (grip) r.grip = grip;
    r.target = grip ? weight : 0;
    r.speed = 1 / Math.max(fade, 1e-3);
  }

  // The reach's weight now (0..1)
  reachWeight(side) {
    return this._reach[side]?.w || 0;
  }

  _applyReaches(dt) {
    for (const side of ['L', 'R']) {
      const r = this._reach[side];
      if (!r) continue;
      r.w += THREE.MathUtils.clamp(r.target - r.w, -r.speed * dt, r.speed * dt);
      if (r.w <= 0) { if (!r.target) this._reach[side] = null; continue; }
      const arm = this._arms[side];
      if (!arm.ok) continue;
      const grip = this._fullGrip(arm, typeof r.grip === 'function' ? r.grip(this) : r.grip);
      if (!grip) continue;
      // full reach, then each bone eased back toward the clips' pose by the weight
      const start = this._undo.length;
      arm.hold(grip);
      const w = smooth(r.w);
      if (w < 1) {
        for (let i = start; i < this._undo.length; i++) {
          const [bone, before] = this._undo[i];
          bone.quaternion.copy(before.clone().slerp(bone.quaternion, w));
        }
        this.model.updateMatrixWorld(true);
      }
    }
  }

  // A grip with what it leaves out filled in from the hand as the clips pose it
  _fullGrip(arm, g) {
    if (!g?.wrist) return null;
    const fingers = new THREE.Vector3(), palm = new THREE.Vector3();
    if (!g.fingers || !g.palm) arm.frame(fingers, palm);
    return {
      wrist: g.wrist,
      fingers: g.fingers || fingers,
      palm: g.palm || palm,
      pole: g.pole || this._axis(1, new THREE.Vector3()).negate().addScaledVector(this._axis(0, new THREE.Vector3()), arm === this._arms.L ? 0.6 : -0.6),
      curl: g.curl || [0.25, 0.3, 0.25],
      thumb: g.thumb || [0.15, 0.15, 0.1]
    };
  }

  // ------------------------------------------------------------ the rest

  setFacePreset(name, snap = false) {
    this.face.setPreset(name, snap);
  }

  showWound(visible) {
    showWound(this.model, visible);
  }

  // The mixer and the copy's own objects; the materials and geometry belong to the source
  dispose() {
    this.anim.mixer.stopAllAction();
    this.anim.mixer.uncacheRoot(this.model);
    this.root.removeFromParent();
    this._hooks.length = 0;
    this._poseHooks.length = 0;
    this.model.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.dispose(); });
  }
}

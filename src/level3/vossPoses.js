import * as THREE from 'three';

// Poses Voss's clips do not have, built on a held clip for Scene B (level3/SceneB.js): the kneel by
// the port, the lean back against the projector, the hand opening at the end. Each is a function
// to run in a VossActor.onPose hook (after the clips, before the reaches), turning bones with
// actor.turnBone, so it is undone before the next frame's clips and never builds up. `k` (0..1)
// is how far the pose is taken: 0 is the clip as it is.

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3();
const _up = new THREE.Vector3(), _fwd = new THREE.Vector3(), _left = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const IDENTITY = new THREE.Quaternion();

// Where the kneel puts him (metres, in the actor's root frame: +z his front, +x his left)
export const KNEEL = {
  hip: 0.6,          // the pelvis's height: up on his knees, sitting a little back
  hipZ: -0.02,       // and how far in front of the root
  knee: 0.065,       // the knee's middle over the floor (the kneecap on it)
  ankle: 0.115,      // the ankle over the floor: up on his toes, the shin nearly flat
  width: 0.115,      // each knee out from the middle
  lean: 0.42         // the back's lean forward from upright (radians): over the port
};

// Move a bone to a world position (its turn kept for undoing, like turnBone's)
function place(a, bone, world) {
  a.turnBone(bone, IDENTITY);
  bone.position.copy(bone.parent.worldToLocal(_x.copy(world)));
  bone.updateWorldMatrix(false, true);
}

// Turn a bone so the direction from it to `child` points toward `target` (world)
function aim(a, bone, child, target) {
  const from = bone.getWorldPosition(_x);
  const now = child.getWorldPosition(_y).sub(from).normalize();
  const want = _w.copy(target).sub(from).normalize();
  a.turnBone(bone, _q.setFromUnitVectors(now, want));
}

// Two-bone leg: the thigh and shin so the knee and ankle land on the targets as nearly as the
// bones' lengths let them
function leg(a, side, knee, ankle, toe) {
  const thigh = a.bone(side + 'Thigh'), calf = a.bone(side + 'Calf'), foot = a.bone(side + 'Foot'), toes = a.bone(side + 'Toe');
  aim(a, thigh, calf, knee);
  aim(a, calf, foot, ankle);
  if (toes) aim(a, foot, toes, toe);
}

// The back's lean (radians from upright, + forward), measured from one bone to another (the pelvis
// to the chest; the chest to the neck for the top of the back)
export function leanOf(a, from = 'pelvis', to = 'spine4') {
  a._axis(1, _up);
  a._axis(2, _fwd);
  const d = a.bone(to).getWorldPosition(_v).sub(a.bone(from).getWorldPosition(_w));
  return Math.atan2(d.dot(_fwd), d.dot(_up));
}

// Bend the back by `angle` (+ forward) about his left-right axis, shared out over the spine
export function bendBack(a, angle) {
  if (!angle) return;
  a._axis(0, _left);
  for (const [b, share] of [['spine', 0.3], ['spine1', 0.3], ['spine2', 0.25], ['spine4', 0.15]]) {
    a.turnBone(a.bone(b), _q.setFromAxisAngle(_left, angle * share));
  }
}

// The kneel, on a crouch (SitDown held low): the pelvis set down over his heels, both knees on the
// floor in front of it, the shins flat behind, up on his toes, the back eased to KNEEL.lean
export function kneel(a, k, o = KNEEL) {
  if (k <= 0) return;
  const r = a.root;
  a._axis(1, _up);
  a._axis(2, _fwd);
  a._axis(0, _left);
  const pelvis = a.bone('pelvis');
  // the pelvis: from where the clip has it toward the kneel's spot, keeping its own sideways place
  const now = pelvis.getWorldPosition(new THREE.Vector3());
  const local = r.worldToLocal(now.clone());
  const want = r.localToWorld(new THREE.Vector3(local.x * (1 - k), o.hip, o.hipZ));
  place(a, pelvis, now.lerp(want, k));
  for (const [side, s] of [['left', 1], ['right', -1]]) {
    const hip = a.bone(side + 'Thigh').getWorldPosition(new THREE.Vector3());
    const calf = a.bone(side + 'Calf'), foot = a.bone(side + 'Foot');
    const l1 = calf.getWorldPosition(_v).distanceTo(hip);
    const l2 = foot.getWorldPosition(_w).distanceTo(_v);
    // the knee on the floor in front of the hip, as far as the thigh reaches
    const hipLocal = r.worldToLocal(hip.clone());
    const drop = Math.max(0.01, hipLocal.y - o.knee);
    const ahead = Math.sqrt(Math.max(0.0001, l1 * l1 - drop * drop));
    const kneeAt = r.localToWorld(new THREE.Vector3(s * o.width, o.knee, hipLocal.z + ahead));
    const rise = o.ankle - o.knee;
    const ankleAt = r.localToWorld(new THREE.Vector3(s * (o.width - 0.01), o.ankle, hipLocal.z + ahead - Math.sqrt(Math.max(0.0001, l2 * l2 - rise * rise))));
    const toeAt = ankleAt.clone().addScaledVector(_fwd, -0.12).addScaledVector(_up, -o.ankle + 0.01);
    // blended from the clip's own knee and ankle
    const kneeNow = calf.getWorldPosition(new THREE.Vector3());
    const ankleNow = foot.getWorldPosition(new THREE.Vector3());
    const toeBone = a.bone(side + 'Toe');
    const toeNow = toeBone ? toeBone.getWorldPosition(new THREE.Vector3()) : toeAt.clone();
    leg(a, side, kneeNow.lerp(kneeAt, k), ankleNow.lerp(ankleAt, k), toeNow.lerp(toeAt, k));
  }
  // (a bone's turn does not move its own pivot, so the spine's turns move the lean measured from
  // the pelvis by about half as much: three passes bring it to where it should be)
  const target = leanOf(a) + (o.lean - leanOf(a)) * k;
  for (let i = 0; i < 3; i++) bendBack(a, target - leanOf(a));
  // and the top of the back (the crouch has it curled over): the chest to the neck straightened to
  // the same lean, a little more forward than the rest, as a back is
  a.turnBone(a.bone('spine4'), _q.setFromAxisAngle(_left, (o.lean + 0.12 - leanOf(a, 'spine4', 'neck')) * k));
}

// Sitting against the projector (SitIdle): the back eased back by `back` radians (it comes to rest
// on the panel behind him), the head tipped back by `head` (resting there too)
export function leanBack(a, k, { back = 0.42, head = 0.38 } = {}) {
  if (k <= 0) return;
  bendBack(a, -back * k);
  a._axis(0, _left);
  a.turnBone(a.bone('neck'), _q.setFromAxisAngle(_left, -head * 0.45 * k));
  a.turnBone(a.bone('head'), _q.setFromAxisAngle(_left, -head * 0.55 * k));
}

// A hand's fingers curled further (+) or opened (-) by `angle` (radians at each joint), on top of
// the pose: the hand opening slowly at the end is this going from a loose fist to open
export function curlFingers(a, side, angle) {
  if (!angle) return;
  const arm = a._arms[side];
  if (!arm?.ok) return;
  const fingers = _v, palm = _w;
  arm.frame(fingers, palm);
  for (let f = 1; f < 5; f++) {
    const joints = arm.digits[f];
    for (let j = 0; j < joints.length; j++) {
      const bone = joints[j], next = joints[j + 1];
      const from = bone.getWorldPosition(_x);
      const dir = next ? next.getWorldPosition(_y).sub(from) : _y.subVectors(from, (joints[j - 1] || arm.hand).getWorldPosition(new THREE.Vector3()));
      const axis = _q2;   // (reused below as a quaternion)
      const ax = new THREE.Vector3().crossVectors(dir.normalize(), palm);
      if (ax.lengthSq() < 1e-8) continue;
      a.turnBone(bone, axis.setFromAxisAngle(ax.normalize(), angle * (j === 0 ? 0.8 : 1)));
    }
  }
  const thumb = arm.digits[0];
  for (let j = 1; j < thumb.length; j++) {
    const bone = thumb[j];
    const from = bone.getWorldPosition(_x);
    const dir = _y.subVectors(from, thumb[j - 1].getWorldPosition(new THREE.Vector3()));
    const ax = new THREE.Vector3().crossVectors(dir.normalize(), palm);
    if (ax.lengthSq() < 1e-8) continue;
    a.turnBone(bone, _q2.setFromAxisAngle(ax.normalize(), angle * 0.5));
  }
}

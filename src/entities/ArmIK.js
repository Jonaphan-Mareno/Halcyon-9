import * as THREE from 'three';

// An arm reaching for something and holding it: the upper arm and forearm bend (two-bone IK) so
// the wrist lands on a point, the hand turns to a given facing, and the fingers close round what
// it holds. Everything is done in world space, on top of whatever pose the clips left, by turning
// each bone about its own pivot; the caller keeps the bones' poses beforehand (see Player.hold)
// and puts them back before the clips run again.
//
// A grip: { wrist, fingers, palm, pole, curl, thumb }
//   wrist    where the wrist (the hand bone) goes (world)
//   fingers  the way the hand points, wrist to knuckles (world, unit)
//   palm     the way the palm faces (world, unit; made square to `fingers`)
//   pole     the way the elbow points (world)
//   curl     how far each finger joint bends (radians, from the knuckle out), thumb: the thumb's

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _e = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3();
const _h = new THREE.Vector3(), _i = new THREE.Vector3(), _l = new THREE.Vector3();     // (frame's own)
const _m = new THREE.Vector3(), _t = new THREE.Vector3(), _x = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qp = new THREE.Quaternion();

export class ArmIK {
  // root: the rig; side: 'L' or 'R'. turn(bone, worldRotation): turns a bone about its pivot (and
  // remembers it, to be undone)
  constructor(root, side, turn) {
    const bone = (name) => {
      let found = null;
      root.traverse((o) => {
        if (!found && o.isBone && new RegExp(`_${side}_${name}(_\\d+)?$`).test(o.name)) found = o;
      });
      return found;
    };
    this.upper = bone('UpperArm');
    this.fore = bone('Forearm');
    this.hand = bone('Hand');
    // each finger's joints from the knuckle out (Finger0 is the thumb)
    this.digits = [0, 1, 2, 3, 4].map((f) => [bone(`Finger${f}`), bone(`Finger${f}1`), bone(`Finger${f}2`)].filter(Boolean));
    this.ok = !!(this.upper && this.fore && this.hand && this.digits[1].length && this.digits[4].length);
    this.turn = turn;
  }

  // The hand's frame as posed now: wrist to the middle knuckle, and the palm's facing (the side
  // the thumb sits on, out of the plane through the wrist and the index and little knuckles)
  frame(fingers, palm) {
    const h = this.hand.getWorldPosition(_h);
    const index = this.digits[1][0].getWorldPosition(_i).sub(h);
    const little = this.digits[4][0].getWorldPosition(_l).sub(h);
    const middle = (this.digits[2][0] || this.digits[1][0]).getWorldPosition(_m).sub(h);
    fingers.copy(middle).normalize();
    palm.crossVectors(index, little).normalize();
    if (this.digits[0][0]) {
      const thumb = this.digits[0][0].getWorldPosition(_t).sub(h);
      // the thumb's base sits on the palm's side of the hand, away from the knuckles' line
      thumb.addScaledVector(fingers, -thumb.dot(fingers));
      const across = _x.copy(index).sub(little).normalize();
      thumb.addScaledVector(across, -thumb.dot(across));
      if (thumb.dot(palm) < 0) palm.negate();
    }
    palm.addScaledVector(fingers, -palm.dot(fingers)).normalize();
  }

  hold(grip) {
    if (!this.ok) return;
    const { upper, fore, hand } = this;
    // the arm: the elbow where both bones still reach, bent toward the pole
    const s = upper.getWorldPosition(_a);
    const e = fore.getWorldPosition(_b);
    const w = hand.getWorldPosition(_c);
    const l1 = s.distanceTo(e), l2 = e.distanceTo(w);
    const toT = _d.subVectors(grip.wrist, s);
    const d = THREE.MathUtils.clamp(toT.length(), Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.999);
    toT.normalize();
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const out = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    const bend = _e.copy(grip.pole).addScaledVector(toT, -grip.pole.dot(toT));
    if (bend.lengthSq() < 1e-8) bend.copy(_g.set(0, -1, 0)).addScaledVector(toT, toT.y);
    bend.normalize();
    const elbow = _f.copy(s).addScaledVector(toT, along).addScaledVector(bend, out);

    this.turn(upper, _q.setFromUnitVectors(_g.subVectors(e, s).normalize(), elbow.sub(s).normalize()));
    fore.getWorldPosition(_b);
    hand.getWorldPosition(_c);
    const reach = _f.copy(s).addScaledVector(toT, d);      // the wrist's goal, as far as the arm goes
    this.turn(fore, _q.setFromUnitVectors(_g.subVectors(_c, _b).normalize(), reach.sub(_b).normalize()));

    // the hand: knuckles along `fingers`, then twisted about them until the palm faces `palm`
    const fingers = _a, palm = _b;
    this.frame(fingers, palm);
    _q.setFromUnitVectors(fingers, grip.fingers);
    palm.applyQuaternion(_q);
    const want = _c.copy(grip.palm).addScaledVector(grip.fingers, -grip.palm.dot(grip.fingers)).normalize();
    const twist = Math.atan2(_d.crossVectors(palm, want).dot(grip.fingers), palm.dot(want));
    _q2.setFromAxisAngle(grip.fingers, twist).multiply(_q);
    this.turn(hand, _q2);

    // the fingers close toward the palm, one joint after another
    this.frame(fingers, palm);
    for (let f = 0; f < 5; f++) {
      const joints = this.digits[f];
      const angles = f === 0 ? grip.thumb : grip.curl;
      for (let j = 0; j < joints.length && j < angles.length; j++) {
        const bone = joints[j];
        const next = joints[j + 1];
        const from = bone.getWorldPosition(_c);
        // the joint's direction: to the next joint, or (the last) the one it carries on from
        const dir = next ? next.getWorldPosition(_d).sub(from) : _d.subVectors(from, joints[j - 1]?.getWorldPosition(_e) ?? hand.getWorldPosition(_e));
        const axis = _e.crossVectors(dir.normalize(), palm);
        if (axis.lengthSq() < 1e-8) continue;
        this.turn(bone, _qp.setFromAxisAngle(axis.normalize(), angles[j]));
      }
    }
  }
}

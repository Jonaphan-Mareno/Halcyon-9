import * as THREE from 'three';

// Reaching through the cell door's broken window for the handle on the far side.
//
// The brick only makes the hole: getting out is Voss putting his arm through it and feeling for the
// lever on the other side. It is played out rather than switched on, so the first thing he does in
// the game is something he does.
//
// The handle is not behind the hole, it is off past the leaf's edge and below it - about a third of
// a metre further than the arm goes. So the hand is never shown on it. It goes through the opening,
// angled the way the handle lies, and the door covers it: the arm disappearing into the leaf and
// the clunk of the latch say the rest. Nothing of the handle itself moves.
//
// That means the arm has to be occluded rather than drawn over the world, which is the opposite of
// how the first-person arms normally work (Controls._armsOnTop clears the depth buffer so they can
// never sink into a wall). Controls.armsBehindWorld(true) leaves the depth buffer alone for the
// sequence, so the leaf hides his hand while the opening still shows his forearm.
//
// Pressed flat against the door his arm only just reaches the opening, and the handle can be used from
// a little further back than that, so he steps up to the window: as far as gets his wrist through the
// pane (measured off the rig, Player.armSpan) and no further, and never closer to the leaf than
// STAND_OFF - the view stays on his side of the door. The step is put on after his body has been
// placed and taken off before anything else moves him (pose / _unstep), so the walk never sees it.

const UP = new THREE.Vector3(0, 1, 0);

// The timeline, in seconds
const LOOK = 0.4;           // the view eases round to the window over this
const OUT = 0.8;            // his hand is through the opening
const GRIP = 0.95;          // and has found the lever
const TURN = 1.35;          // he has turned it and the latch lets go
const RELEASE = 1.5;        // he lets go
const END = 2.1;            // his arm is back, and the door can swing

const LOOK_AT_HANDLE = 0.35; // the view frames the opening, leaning this much toward the handle
const HOLE_INSET = 0.1;     // the arm threads this far inside the opening's edges, not flush with them
const IN_GAP = 0.16;        // the path's waypoint just inside the opening, so the hand goes in square
const THROUGH = 0.42;       // how far past the pane the wrist goes, if the arm has it in him (well through: the hand is on the far side)
const SIDEWAYS = 0.32;      // and how far on along the door, toward the handle (behind the leaf)
const REACH = 0.94;         // of the arm's length: at full stretch it would lock out straight
const TWIST = 0.55;         // radians his forearm rolls as he turns the latch - the part you can see
const STAND_OFF = 0.2;      // the closest his eyes come to the door's face as he steps up to it (close: his shoulder at the hole)

// The hand opens on the way out and closes as it finds the lever (ArmIK finger curls)
const OPEN = { curl: [0.12, 0.16, 0.1], thumb: [0.1, 0.1, 0.08] };
const SHUT = { curl: [0.95, 1.05, 0.7], thumb: [0.35, 0.5, 0.35] };

const smooth = (t) => t * t * (3 - 2 * t);
const ramp = (t, a, b) => smooth(THREE.MathUtils.clamp((t - a) / (b - a), 0, 1));

export class HandleReach {
  // handle: the handle's own pivot, read for where it lies - nothing turns it. hole: the window
  // pane's own bounds, which are the opening it leaves. onLatch: the latch has given (sound),
  // onDone: his arm is clear (the door may swing).
  constructor({ camera, player, handle, hole, onLatch, onDone }) {
    this.camera = camera;
    this.player = player;
    this.handle = handle;
    this.onLatch = onLatch;
    this.onDone = onDone;
    this.t = 0;
    this.done = false;
    this.ok = false;
    this._latched = false;
    this._u = 0;            // how far along the path the wrist is (0 home, 1 through the opening)
    this._turn = 0;         // how far he has turned the latch
    this._shut = 0;         // how far the fingers have closed

    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._shoulder = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._step = new THREE.Vector3();   // how far he has stepped up to the window, this frame
    this._grip = {
      wrist: new THREE.Vector3(), fingers: new THREE.Vector3(), palm: new THREE.Vector3(),
      pole: new THREE.Vector3(), curl: [0, 0, 0], thumb: [0, 0, 0]
    };
    this._q = new THREE.Quaternion();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');

    // The door's own normal (the handle pivot's local z, read off the matrix: the room may be placed
    // anywhere), pointing away from him
    handle.updateWorldMatrix(true, false);
    const lever = handle.getWorldPosition(new THREE.Vector3());
    this._out = new THREE.Vector3().setFromMatrixColumn(handle.matrixWorld, 2).normalize();
    if (this._out.dot(this._v.subVectors(lever, camera.position)) < 0) this._out.negate();

    // `_across` runs along the door from the opening toward the handle: the way his hand is angled
    // as it goes in, so it reads as reaching for something off to that side
    const centre = hole.getCenter(new THREE.Vector3());
    this._across = new THREE.Vector3().subVectors(lever, centre);
    this._across.addScaledVector(this._out, -this._across.dot(this._out)).setY(0);
    if (this._across.lengthSq() < 1e-6) {
      this._across.setFromMatrixColumn(handle.matrixWorld, 0).setY(0);
    }
    this._across.normalize();

    // His right hand does it
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
    this.side = 'R';
    this._elbowOut = right.multiplyScalar(this.side === 'R' ? 1 : -1);
    this.span = player.armSpan(this.side);
    if (!(this.span > 0)) return;      // no arm bones on this rig: the level falls back

    // Where the arm goes through: as near the handle as the opening allows, held off its edges
    const size = hole.getSize(this._v);
    const half = Math.max(0,
      (Math.abs(size.x * this._across.x) + Math.abs(size.z * this._across.z)) / 2 - HOLE_INSET);
    const tall = Math.max(0, size.y / 2 - HOLE_INSET);
    this._w.subVectors(lever, centre);
    this._entry = centre.clone()
      .addScaledVector(this._across, THREE.MathUtils.clamp(this._w.dot(this._across), -half, half));
    this._entry.y += THREE.MathUtils.clamp(this._w.y, -tall, tall);

    // Through the opening and a little past it, as far as the arm has in him
    this._near = this._entry.clone().addScaledVector(this._out, -IN_GAP);
    // (then on sideways behind the leaf, toward the handle at the door's edge, not straight on)
    this._far = this._entry.clone().addScaledVector(this._out, THROUGH).addScaledVector(this._across, SIDEWAYS);
    this._path = null;      // built on the first pose(), from where his hand actually is

    // The hand goes in pointing out through the door, angled down and toward the handle
    this._fingers = this._out.clone().multiplyScalar(0.78)
      .addScaledVector(this._across, 0.8)
      .addScaledVector(UP, -0.4)
      .normalize();
    this._palm = UP.clone().negate();

    // The view eases from where he is looking to the opening, leaning toward the handle
    this._v.copy(centre).lerp(lever, LOOK_AT_HANDLE).sub(camera.position);
    this._euler.setFromQuaternion(camera.quaternion);
    this._fromPitch = this._euler.x;
    this._fromYaw = this._euler.y;
    this._toPitch = Math.atan2(this._v.y, Math.hypot(this._v.x, this._v.z));
    const yaw = Math.atan2(-this._v.x, -this._v.z);
    // the short way round, however many turns he has made on the spot
    this._toYaw = this._fromYaw + Math.atan2(Math.sin(yaw - this._fromYaw), Math.cos(yaw - this._fromYaw));
    this.ok = true;
  }

  // One frame of the sequence, before anything reads the camera. False once it is over.
  update(dt) {
    if (this.done || !this.ok) return false;
    this._unstep();
    this.t += Math.min(dt, 0.05);

    // Round to the window, then straightening up again as the arm comes out
    const look = ramp(this.t, 0, LOOK);
    const back = ramp(this.t, RELEASE, END);
    this._euler.set(
      THREE.MathUtils.lerp(THREE.MathUtils.lerp(this._fromPitch, this._toPitch, look), this._fromPitch, back),
      THREE.MathUtils.lerp(this._fromYaw, this._toYaw, look),
      0
    );
    this.camera.quaternion.setFromEuler(this._euler);

    this._u = this.t < TURN ? ramp(this.t, 0, OUT) : 1 - ramp(this.t, RELEASE, END);
    this._turn = this.t < TURN ? ramp(this.t, GRIP, TURN) : 1 - ramp(this.t, TURN, RELEASE + 0.15);
    this._shut = this.t < RELEASE
      ? ramp(this.t, OUT - 0.3, OUT + 0.1)
      : 1 - ramp(this.t, RELEASE, RELEASE + 0.25);

    if (!this._latched && this.t >= TURN) {
      this._latched = true;
      this.onLatch?.();
    }
    if (this.t >= END) {
      this.done = true;
      this.onDone?.();
      return false;
    }
    return true;
  }

  // His hand through the opening, after his clips have run (the mixer would undo it the other way
  // round). He steps up to the window as his hand goes out, and back as it comes in.
  pose() {
    const p = this.player;
    if (this.done || !this.ok || !p?.ready) return;
    if (!this._path) {
      this._path = new THREE.CatmullRomCurve3(
        [p.handPosition(this.side, new THREE.Vector3()), this._near, this._far],
        false, 'catmullrom', 0.3
      );
    }
    p.shoulderPosition(this.side, this._shoulder);

    // The least step toward the opening that puts his wrist through the pane, held off the leaf
    this._w.subVectors(this._far, this._shoulder);
    this._dir.set(this._w.x, 0, this._w.z);
    if (this._dir.lengthSq() < 1e-8) this._dir.copy(this._out).setY(0);
    this._dir.normalize();
    const want = this.span * REACH;
    const along = this._w.dot(this._dir);
    const disc = along * along - (this._w.lengthSq() - want * want);
    const need = disc >= 0 ? along - Math.sqrt(disc) : along;
    const facing = this._dir.dot(this._out);
    const room = facing > 0.1
      ? (this._v.subVectors(this._entry, this.camera.position).dot(this._out) - STAND_OFF) / facing
      : 0;
    this._step.copy(this._dir).multiplyScalar(THREE.MathUtils.clamp(need, 0, Math.max(0, room)) * this._u);
    this.camera.position.add(this._step);
    this.camera.updateMatrixWorld();
    this._shoulder.add(this._step);
    if (p.mode === 'first') p.viewModel.position.add(this._step);

    const g = this._grip;
    this._path.getPointAt(this._u, g.wrist);
    // Never past what the arm has: at full stretch it locks out straight, which reads as a shove
    this._w.subVectors(g.wrist, this._shoulder);
    const far = this._w.length();
    const most = this.span * REACH;
    if (far > most) g.wrist.copy(this._shoulder).addScaledVector(this._w, most / far);

    // His forearm rolls as he turns the latch - with the hand behind the leaf, that roll is the
    // only part of it you see
    const q = this._q.setFromAxisAngle(this._fingers, TWIST * this._turn);
    g.fingers.copy(this._fingers);
    g.palm.copy(this._palm).applyQuaternion(q);
    // The elbow starts low and out to his side and ends up in the opening, which is what turns the
    // arm through it instead of driving it into the leaf
    g.pole.copy(UP).negate().addScaledVector(this._elbowOut, 0.4).normalize();
    g.pole.lerp(this._w.subVectors(this._entry, this._shoulder).normalize(), ramp(this._u, 0.1, 0.5));
    for (let i = 0; i < 3; i++) {
      g.curl[i] = THREE.MathUtils.lerp(OPEN.curl[i], SHUT.curl[i], this._shut);
      g.thumb[i] = THREE.MathUtils.lerp(OPEN.thumb[i], SHUT.thumb[i], this._shut);
    }
    p.hold(this.side === 'R' ? g : null, this.side === 'R' ? null : g);
  }

  // Take this frame's step back off, before the walk or anything else reads where he is
  _unstep() {
    if (this._step.lengthSq() === 0) return;
    this.camera.position.sub(this._step);
    this.camera.updateMatrixWorld();
    this._step.set(0, 0, 0);
  }

  // Dropped part way through (the level is being thrown away): his view goes back where it was
  cancel() {
    this._unstep();
    this.done = true;
  }
}

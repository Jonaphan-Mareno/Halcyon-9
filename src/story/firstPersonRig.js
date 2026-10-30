import * as THREE from 'three';
import { ArmIK } from '../entities/ArmIK.js';
import { MODEL_HEIGHT, WALK_STRIDE_SPEED } from '../entities/Player.js';

// What the first-person flashbacks share (story/BriefingFlashback: Flashback 1, level2/Flashback3D:
// Flashback 2): people on Voss's skeleton posed on top of their clips, walks with soft starts and
// stops, bodies that turn on a spring, and Voss's eyes (the camera on his head bone, looking where
// his attention goes).

export const SCALE = 1.8 / MODEL_HEIGHT;        // the people are 1.8 m, as Voss is in Levels 2 and 3

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const ease = (v) => v * v * (3 - 2 * v);
export const seg = (t, a, b) => ease(clamp((t - a) / (b - a)));
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// the yaw that faces a character (facing -z at yaw 0) along (x, z)
export const yawOf = (x, z) => Math.atan2(-x, -z);
export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------------------------
// A person: one copy of the body, its clips, and the poses on top of them (sitting, the head
// turned toward something, the hands placed by ArmIK). Everything is turned in world space about
// each bone's own pivot and undone before the clips run again.
// ---------------------------------------------------------------------------------------------
export class Person {
  constructor(name, model, clips) {
    this.name = name;
    this.model = model;
    this.group = new THREE.Group();
    this.group.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    const clip = (n) => clips.find((c) => c.name === n);
    this.idle = this.mixer.clipAction(clip('Idle'));
    this.walk = this.mixer.clipAction(clip('Walk'));
    this.idle.play();
    this.walk.play();
    this.walk.setEffectiveWeight(0);
    this.idle.time = Math.random() * this.idle.getClip().duration;   // (nobody breathes in step)

    const bone = (re) => {
      let f = null;
      model.traverse((o) => { if (!f && o.isBone && re.test(o.name)) f = o; });
      return f;
    };
    this.b = {
      pelvis: bone(/Pelvis/), spine: bone(/Spine1/), spine2: bone(/Spine2/), neck: bone(/Neck1/), head: bone(/Head1/),
      lThigh: bone(/_L_Thigh/), lCalf: bone(/_L_Calf/), rThigh: bone(/_R_Thigh/), rCalf: bone(/_R_Calf/),
      lArm: bone(/_L_UpperArm/), rArm: bone(/_R_UpperArm/)
    };
    this._saved = [];                 // [bone, quaternion] turned this frame, undone before the clips
    const turn = (b, q) => this._turnWorld(b, q);
    this.ik = { R: new ArmIK(model, 'R', turn), L: new ArmIK(model, 'L', turn) };

    // the script's state (set each frame by the scene)
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.sit = 0;
    this.lean = 0;                     // the upper body tipped forward (+, radians) or back (-)
    this.speed = 0;
    this.look = null;                  // a world point the head turns toward, or null
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.grips = { R: null, L: null };  // { wrist, fingers, palm, pole, curl, thumb, w }

    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._qp = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    this._right = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._cur = { wrist: new THREE.Vector3(), fingers: new THREE.Vector3(), palm: new THREE.Vector3(), pole: new THREE.Vector3(), curl: [0, 0, 0], thumb: [0, 0] };
  }

  _turnWorld(bone, rotation) {
    this._saved.push(bone, bone.quaternion.clone());
    bone.parent.getWorldQuaternion(this._qp);
    const inv = this._q2.copy(this._qp).invert();
    bone.quaternion.premultiply(this._qp).premultiply(rotation).premultiply(inv);
    bone.updateWorldMatrix(false, true);
  }

  // yaw about world up, then pitch about the body's right (positive: a hanging limb swings
  // forward, an upright one tips back)
  _turn(bone, yaw, pitch) {
    if (!bone || (Math.abs(yaw) < 1e-5 && Math.abs(pitch) < 1e-5)) return;
    this._q.setFromAxisAngle(this._up, yaw).multiply(Person._r.setFromAxisAngle(this._right, pitch));
    this._turnWorld(bone, this._q);
  }

  update(dt) {
    // undo last frame's turns (newest first), so the clips see only their own pose
    for (let i = this._saved.length - 2; i >= 0; i -= 2) this._saved[i].quaternion.copy(this._saved[i + 1]);
    this._saved.length = 0;

    // walking: the clip at the pace of the feet (game speed / stride speed at this scale)
    // (eased in and out: the walk carries the head somewhere a little different from standing)
    this.walkW = (this.walkW || 0) + (clamp(this.speed / 0.35) - (this.walkW || 0)) * (1 - Math.exp(-6 * dt));
    const w = this.walkW;
    this.walk.setEffectiveWeight(w);
    this.idle.setEffectiveWeight(1 - w);
    this.walk.timeScale = Math.max(0.35, this.speed / (WALK_STRIDE_SPEED * SCALE));
    this.mixer.update(dt);

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    this.group.updateMatrixWorld(true);
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    // sitting: thighs forward, shins back down, a slight lean
    const s = this.sit;
    if (s > 0.001) {
      this._turn(this.b.lThigh, 0.08 * s, 1.5 * s);
      this._turn(this.b.lCalf, 0, -1.55 * s);
      this._turn(this.b.rThigh, -0.08 * s, 1.5 * s);
      this._turn(this.b.rCalf, 0, -1.55 * s);
      this._turn(this.b.spine, 0, -0.06 * s);
    }
    // leaning: shared between the two spine bones
    if (Math.abs(this.lean) > 0.001) {
      this._turn(this.b.spine, 0, -0.55 * this.lean);
      this._turn(this.b.spine2, 0, -0.45 * this.lean);
    }

    // the head toward what it is looking at (the neck takes some of it), smoothed
    let ty = 0, tp = 0;
    if (this.look && this.b.head) {
      this.b.head.getWorldPosition(this._v);
      const d = this._v2.subVectors(this.look, this._v);
      ty = clamp(wrap(yawOf(d.x, d.z) - this.yaw), -1.2, 1.2);
      tp = clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.6, 0.5);
    }
    const k = 1 - Math.exp(-5 * dt);
    this.lookYaw += (ty - this.lookYaw) * k;
    this.lookPitch += (tp - this.lookPitch) * k;
    this.aimHead(this.lookYaw, this.lookPitch);

    for (const side of ['R', 'L']) this._hold(side, this.grips[side]);
  }

  aimHead(yaw, pitch) {
    this._turn(this.b.neck, yaw * 0.4, pitch * 0.4);
    this._turn(this.b.head, yaw * 0.6, pitch * 0.6);
  }

  // A hand on something, blended with wherever the clip has it by grip.w (0..1)
  _hold(side, grip) {
    const ik = this.ik[side];
    if (!grip || grip.w < 0.002 || !ik.ok) return;
    const c = this._cur, w = grip.w;
    const s = ik.upper.getWorldPosition(this._v);
    ik.hand.getWorldPosition(c.wrist);
    const e = ik.fore.getWorldPosition(this._v2);
    // the elbow's present bend, so the arm leaves the clip's pose without flipping
    c.pole.copy(e).sub(s.add(c.wrist).multiplyScalar(0.5)).normalize();
    ik.frame(c.fingers, c.palm);
    c.wrist.lerp(grip.wrist, w);
    c.fingers.lerp(grip.fingers, w).normalize();
    c.palm.lerp(grip.palm, w).normalize();
    c.pole.lerp(grip.pole, w).normalize();
    for (let j = 0; j < 3; j++) c.curl[j] = (grip.curl?.[j] ?? 0.25) * w;
    for (let j = 0; j < 2; j++) c.thumb[j] = (grip.thumb?.[j] ?? 0.15) * w;
    ik.hold(c);
  }

  // a point on (or over) a bone, in the world
  at(boneName, out, up = 0) {
    this.b[boneName].getWorldPosition(out);
    out.y += up;
    return out;
  }
}
Person._r = new THREE.Quaternion();

// A walk along a few points: eased away and to a stop (a speed that rises and falls, sampled
// once), facing along the way
export class Walk {
  constructor(points, t0, t1, ramp = 0.7) {
    this.curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => v3(x, 0, z)), false, 'centripetal');
    this.length = this.curve.getLength();
    this.t0 = t0;
    this.t1 = t1;
    // the share of the way done at each moment: integrate a speed with soft starts and stops
    const n = 64, r = clamp(ramp / (t1 - t0), 0.05, 0.48);
    const lut = [0];
    for (let i = 1; i <= n; i++) {
      const s = (i - 0.5) / n;
      lut.push(lut[i - 1] + ease(clamp(s / r)) * ease(clamp((1 - s) / r)));
    }
    this.lut = lut.map((x) => x / lut[n]);
  }

  // share of the way at time t (0..1)
  u(t) {
    const s = clamp((t - this.t0) / (this.t1 - this.t0)) * (this.lut.length - 1);
    const i = Math.min(this.lut.length - 2, Math.floor(s));
    return this.lut[i] + (this.lut[i + 1] - this.lut[i]) * (s - i);
  }
}

// A body turning to face a way: a critically damped spring (w: how brisk), so it gathers speed
// from rest and settles without overshoot
export function turnTo(p, want, dt, w) {
  const e = wrap(p.yaw - want);
  p.yawV = (p.yawV || 0) + (-w * w * e - 2 * w * (p.yawV || 0)) * dt;
  p.yaw += p.yawV * dt;
}

// Voss's eyes: the camera at the eye point on his head bone (eyeLocal), so his own clip carries it
// (breathing, the bob of his walk), looking at a target through two critically damped springs, one
// after the other: every glance gathers speed from rest and settles softly (one spring alone starts
// at full speed). His head turns with his eyes, so the eye point moves with it. A little wander of
// its own on top.
//
// Options (the defaults are Flashbacks 1 and 2): wander and sway scale the gaze's own wobble and
// the roll of his walk; steady (0..1) takes that much of his clip's sway out of the eye point (the
// body's own movement stays); breath (m) is a slow rise and fall while he stands.
export class Eyes {
  constructor(camera, voss, eyeLocal, { wander = 1, sway = 1, steady = 0, breath = 0 } = {}) {
    this.camera = camera;
    this.voss = voss;
    this.eyeLocal = eyeLocal;
    this.wander = wander;
    this.sway = sway;
    this.steady = steady;
    this.breath = breath;
    this.g = null;
    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._body = new THREE.Vector3();
    this._off = new THREE.Vector3();
    this._calm = null;
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  update(t, dt, target) {
    const v = this.voss;
    const eye = v.b.head.localToWorld(this._v.copy(this.eyeLocal));
    // a little wander of its own (two slow wobbles each way)
    const d = this._d.subVectors(target, eye);
    const wn = this.wander;
    const wantYaw = yawOf(d.x, d.z) + wn * (0.018 * Math.sin(t * 0.53) + 0.012 * Math.sin(t * 1.37 + 1));
    const wantPitch = Math.atan2(d.y, Math.hypot(d.x, d.z)) + wn * (0.012 * Math.sin(t * 0.71 + 2) + 0.008 * Math.sin(t * 1.9));
    const g = (this.g ||= {});
    if (t === 0 || g.yaw === undefined) Object.assign(g, { yaw: wantYaw, pitch: wantPitch, vy: 0, vp: 0, fy: wantYaw, fp: wantPitch, fvy: 0, fvp: 0 });
    const step = Math.min(dt, 0.05);
    const spring = (x, vel, goal, w) => {
      const e = wrap(x - goal);
      vel += (-w * w * e - 2 * w * vel) * step;
      return [x + vel * step, vel];
    };
    [g.fy, g.fvy] = spring(g.fy, g.fvy, wantYaw, 9);
    [g.fp, g.fvp] = spring(g.fp, g.fvp, wantPitch, 9);
    [g.yaw, g.vy] = spring(g.yaw, g.vy, g.fy, 7.5);
    [g.pitch, g.vp] = spring(g.pitch, g.vp, g.fp, 7.5);
    // (a neck turns only so far: the limit is a soft one, so a turn into it slows, never stops dead)
    const rel = 1.5 * Math.tanh(wrap(g.yaw - v.yaw) / 1.5);
    v.aimHead(rel * 0.85, g.pitch * 0.8);
    v.b.head.localToWorld(this._v.copy(this.eyeLocal));
    // breathing while he sits, and a sway as he walks
    const walking = clamp(v.speed / 0.4);
    const phase = v.walk.time / v.walk.getClip().duration * Math.PI * 2;
    this._v.y += 0.004 * Math.sin(t * 1.55) * v.sit;
    if (this.steady > 0) {
      // the eye point's offset from his body, slowed: the clip's small sways go, his steps stay
      v.group.getWorldPosition(this._body);
      const off = this._off.subVectors(this._v, this._body);
      if (!this._calm || t === 0) this._calm = off.clone();
      this._calm.lerp(off, 1 - Math.exp(-step / 0.5));
      this._v.copy(this._body).add(off.lerp(this._calm, this.steady));
    }
    if (this.breath) this._v.y += this.breath * Math.sin(t * 1.15) * (1 - walking);
    this.camera.position.copy(this._v);
    this._euler.set(g.pitch, v.yaw + rel, wn * 0.006 * Math.sin(t * 0.43) + this.sway * 0.012 * Math.sin(phase) * walking, 'YXZ');
    this.camera.quaternion.setFromEuler(this._euler);
    if (t === 0) this.g = null;
  }
}

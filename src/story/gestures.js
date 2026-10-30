import * as THREE from 'three';

// Body language for the flashbacks' people (firstPersonRig's Person): where the hands go for a
// handful of gestures, as grips for ArmIK (p.grips.R / .L). Each is placed from the body as it
// stands now (its chest, head, shoulders and hips), so it follows the person as they move.
//
//   chest   a hand flat on the breastbone (guilt, "I signed it")
//   face    a hand over the face, palm in (both: hiding his face)
//   fist    a fist clenched at the side
//   point   the arm thrust out toward a point, hand open, fingers at it (accusing)
//   open    the hands out, palms up ("who do you think you are?!")
//   cross   the arms folded across the chest (each hand to the other arm)
//   hip     a hand on the hip
//   tremble the hands up in front of the chest, a little cupped, held there (looked at)
//
// pose(p, kind, side, out, opts): writes the grip into `out` (made by grip()) and returns it;
// opts.at is the point for 'point'; opts.reach (0..1) how far the arm goes for it.

const F = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3(0, 1, 0);
const A = new THREE.Vector3(), B = new THREE.Vector3();

export function grip() {
  return { wrist: new THREE.Vector3(), fingers: new THREE.Vector3(), palm: new THREE.Vector3(), pole: new THREE.Vector3(), curl: [0.2, 0.2, 0.15], thumb: [0.15, 0.1], w: 0 };
}

const set = (v, ...terms) => {
  v.set(0, 0, 0);
  for (let i = 0; i < terms.length; i += 2) v.addScaledVector(terms[i], terms[i + 1]);
  return v;
};

export function pose(p, kind, side, out, opts = {}) {
  const s = side === 'R' ? 1 : -1;
  F.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
  R.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
  const chest = p.at('spine2', A);
  const g = out;
  const curl = (a, b, c, t0 = 0.15, t1 = 0.1) => {
    g.curl[0] = a; g.curl[1] = b; g.curl[2] = c; g.thumb[0] = t0; g.thumb[1] = t1;
  };
  switch (kind) {
    case 'chest':
      g.wrist.copy(chest).addScaledVector(F, 0.2).addScaledVector(U, -0.03).addScaledVector(R, s * 0.03);
      set(g.fingers, U, 0.5, R, -s * 0.85, F, -0.1).normalize();
      g.palm.copy(F).negate();
      set(g.pole, R, s * 0.7, U, -1, F, 0.1).normalize();
      curl(0.12, 0.15, 0.1);
      break;
    case 'face': {
      const head = p.at('head', B);
      g.wrist.copy(head).addScaledVector(F, 0.15).addScaledVector(U, -0.02).addScaledVector(R, s * 0.05);
      set(g.fingers, U, 0.95, F, 0.05, R, -s * 0.22).normalize();
      g.palm.copy(F).negate();
      set(g.pole, R, s * 0.5, U, -1, F, 0.25).normalize();
      curl(0.2, 0.25, 0.15, 0.3, 0.2);
      break;
    }
    case 'fist': {
      const hip = p.at('pelvis', B);
      g.wrist.copy(hip).addScaledVector(R, s * 0.25).addScaledVector(U, -0.1).addScaledVector(F, 0.04);
      set(g.fingers, U, -1, F, 0.15).normalize();
      g.palm.copy(R).multiplyScalar(-s);
      set(g.pole, R, s * 0.4, F, -1).normalize();
      curl(1.35, 1.45, 1.2, 0.9, 0.6);
      break;
    }
    case 'point': {
      const sh = p.at(s > 0 ? 'rArm' : 'lArm', B);
      const dir = A.subVectors(opts.at, sh).normalize();
      const reach = opts.reach ?? 1;
      g.wrist.copy(sh).addScaledVector(dir, 0.18 + 0.32 * reach).addScaledVector(U, -0.06);
      g.fingers.copy(dir).addScaledVector(U, 0.12).normalize();
      set(g.palm, R, -s, U, -0.35).normalize();       // (the hand on edge, a blade)
      set(g.pole, R, s * 0.6, U, -1).normalize();
      curl(0.05, 0.08, 0.05, 0.1, 0.05);
      break;
    }
    case 'open':
      g.wrist.copy(chest).addScaledVector(F, 0.28).addScaledVector(R, s * 0.3).addScaledVector(U, -0.22);
      set(g.fingers, F, 0.75, R, s * 0.55, U, 0.1).normalize();
      g.palm.copy(U);
      set(g.pole, R, s, U, -0.6, F, -0.3).normalize();
      curl(0.18, 0.2, 0.12, 0.1, 0.05);
      break;
    case 'cross':
      g.wrist.copy(chest).addScaledVector(F, 0.16).addScaledVector(U, s > 0 ? -0.13 : -0.09).addScaledVector(R, -s * 0.14);
      set(g.fingers, R, -s, U, 0.15).normalize();
      g.palm.copy(F).negate();
      set(g.pole, R, s, U, -0.5, F, 0.2).normalize();
      curl(0.5, 0.55, 0.4, 0.3, 0.2);
      break;
    case 'hip': {
      const hip = p.at('pelvis', B);
      g.wrist.copy(hip).addScaledVector(R, s * 0.2).addScaledVector(U, 0.06).addScaledVector(F, 0.02);
      set(g.fingers, U, -0.35, F, -0.6, R, -s * 0.4).normalize();
      g.palm.copy(R).multiplyScalar(-s);
      set(g.pole, R, s, F, -0.6).normalize();
      curl(0.3, 0.3, 0.2, 0.2, 0.1);
      break;
    }
    case 'tremble':
      g.wrist.copy(chest).addScaledVector(F, 0.33).addScaledVector(R, s * 0.16).addScaledVector(U, -0.1);
      set(g.fingers, F, 0.65, U, 0.55, R, -s * 0.15).normalize();
      set(g.palm, U, 0.55, F, -0.6, R, -s * 0.35).normalize();       // (up and toward his face: he looks into them)
      set(g.pole, R, s, U, -1).normalize();
      curl(0.3, 0.35, 0.25, 0.2, 0.15);
      break;
  }
  return g;
}

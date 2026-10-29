import * as THREE from 'three';

// Tunable constants — change these to adjust feel without hunting through logic
const HIT_RADIUS    = 0.45;   // radius of each arm capsule segment (metres)
const HIT_COOLDOWN  = 1.0;    // seconds of immunity after a hit

// Player body: a vertical capsule starting at playerPos.y, 1.7 m tall, 0.35 m radius
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.35;

// Bones in chain order (GLTFLoader strips dots, so we try both variants)
const BONE_NAMES = [
  'RoboArmRoot',
  'RoboArm00',
  'RoboArm01',
  'RoboArm02',
  'RoboArmHand00',
  'RoboArmClaw00',
  'RoboArmClaw01',
];

// --------------------------------------------------------------------------
// Helpers: capsule–capsule closest-point distance (squared), no allocations
// --------------------------------------------------------------------------
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _cd = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _onCD = new THREE.Vector3();

/**
 * Squared distance between segment AB and segment CD.
 * Also writes the closest point on AB into `outOnAB`.
 */
function segSegDistSq(a, b, c, d, outOnAB) {
  _ab.subVectors(b, a);
  _cd.subVectors(d, c);
  _ac.subVectors(a, c);

  const abab = _ab.dot(_ab);
  const cdcd = _cd.dot(_cd);
  const abcd = _ab.dot(_cd);
  const acab = _ac.dot(_ab);
  const accd = _cd.dot(_ac);

  const denom = abab * cdcd - abcd * abcd;
  let s = 0;
  let t = 0;

  if (abab < 1e-8 && cdcd < 1e-8) {
    outOnAB.copy(a);
    return a.distanceToSquared(c);
  } else if (abab < 1e-8) {
    t = THREE.MathUtils.clamp(accd / cdcd, 0, 1);
  } else if (cdcd < 1e-8) {
    s = THREE.MathUtils.clamp(-acab / abab, 0, 1);
  } else {
    if (denom > 1e-8) s = THREE.MathUtils.clamp((abcd * accd - acab * cdcd) / denom, 0, 1);
    t = (abcd * s + accd) / cdcd;
    if (t < 0) {
      t = 0;
      s = THREE.MathUtils.clamp(-acab / abab, 0, 1);
    } else if (t > 1) {
      t = 1;
      s = THREE.MathUtils.clamp((abcd - acab) / abab, 0, 1);
    }
  }

  outOnAB.copy(_ab).multiplyScalar(s).add(a);
  _onCD.copy(_cd).multiplyScalar(t).add(c);
  return outOnAB.distanceToSquared(_onCD);
}

// --------------------------------------------------------------------------

export class RoboArmHazard {
  /**
   * @param {THREE.Object3D} root  – the atrium scene (searched for the rig)
   * @param {{ onHit: (from: THREE.Vector3) => void }} opts
   */
  constructor(root, { onHit }) {
    this.onHit   = onHit;
    this.active  = false;
    this.paused  = false;
    this._cooldown = 0;
    this._bones  = [];

    // Scratch vectors reused every frame
    this._boneA  = new THREE.Vector3();
    this._boneB  = new THREE.Vector3();
    this._footA  = new THREE.Vector3();
    this._footB  = new THREE.Vector3();
    this._hitPt  = new THREE.Vector3();

    this._findBones(root);
  }

  // -----------------------------------------------------------------------
  // Rig discovery
  // -----------------------------------------------------------------------
  _findBones(root) {
    if (!root?.getObjectByName) {
      console.warn('[ARM] RoboArmHazard: atrium root is unavailable. Hazard disabled.');
      return;
    }

    // GLTFLoader strips dots: "RoboArmAture.001" may arrive as "RoboArmAture001"
    const rigNames = ['RoboArmAture001', 'RoboArmAture.001'];
    let rig = null;
    for (const name of rigNames) {
      rig = root.getObjectByName(name);
      if (rig) break;
    }
    if (!rig) {
      console.warn('[ARM] RoboArmHazard: rig not found (tried', rigNames.join(', '), '). Hazard disabled.');
      return;
    }

    const found = [];
    const missing = [];
    const exactBones = new Map();
    const renamedBones = new Map();
    rig.traverse((node) => {
      if (!node.isBone) return;
      for (const name of BONE_NAMES) {
        if (node.name === name) {
          exactBones.set(name, node);
        } else if (node.name.startsWith(`${name}_`) && /^\d+$/.test(node.name.slice(name.length + 1))) {
          renamedBones.set(name, node);
        }
      }
    });

    for (const name of BONE_NAMES) {
      const bone = exactBones.get(name) || renamedBones.get(name);
      if (bone) {
        found.push(bone.name);
        this._bones.push(bone);
      } else {
        missing.push(name);
      }
    }

    if (found.length > 0) {
      console.log('[ARM] bones found:', found.join(', '));
    }
    if (missing.length > 0) {
      console.warn('[ARM] bones missing:', missing.join(', '), '— those segments will be skipped.');
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------
  start() {
    this.active  = true;
    this.paused  = false;
    this._cooldown = 0;
  }

  stop() {
    this.active = false;
  }

  // -----------------------------------------------------------------------
  // Per-frame update (call AFTER the AnimationMixer has stepped)
  // -----------------------------------------------------------------------
  /**
   * @param {number} dt          – seconds since last frame
   * @param {THREE.Vector3} playerPos – player feet position (world space)
   */
  update(dt, playerPos) {
    if (this._cooldown > 0) {
      this._cooldown = Math.max(0, this._cooldown - dt);
    }
    if (!this.active || this.paused || this._cooldown > 0) return;
    if (this._bones.length < 2) return;

    // Player body: vertical segment from feet to head
    this._footA.copy(playerPos);                          // bottom
    this._footB.set(playerPos.x, playerPos.y + PLAYER_HEIGHT, playerPos.z); // top

    const combinedRadius = HIT_RADIUS + PLAYER_RADIUS;
    const combinedRadiusSq = combinedRadius * combinedRadius;

    for (let i = 0; i < this._bones.length - 1; i++) {
      const boneFrom = this._bones[i];
      const boneTo   = this._bones[i + 1];

      boneFrom.getWorldPosition(this._boneA);
      boneTo.getWorldPosition(this._boneB);

      const distSq = segSegDistSq(
        this._boneA, this._boneB,
        this._footA, this._footB,
        this._hitPt   // closest point on the arm segment
      );

      if (distSq < combinedRadiusSq) {
        this._cooldown = HIT_COOLDOWN;
        this.onHit(this._hitPt.clone());
        return; // one hit per frame
      }
    }
  }
}

import * as THREE from 'three';

// ============================================================================
// HAZARD CONFIGURATION CONSTANTS
// ============================================================================
// Extra margin (metres) extending beyond visible arm geometry to ensure reliable contact
export const EXTRA_MARGIN = 0.35;
// Cooldown (seconds) between hits to prevent rapid repeated damage from a single overlap
export const HIT_COOLDOWN = 1.0;
// Damage dealt per hit (matches DIRECT_HIT in HabitatSession.js)
export const ARM_DAMAGE = 15;

/**
 * RoboArmHazard
 *
 * Manages the physical hazard of the runaway robotic arm in Dr. Kessler's bedroom
 * (RoboArmAture.001 in Bedroom 2). Computes an expanded bounding volume covering
 * its full 1-second out-and-back animated sweep (24 fps), tests intersection with
 * the player when active, and triggers damage and knockback with cooldown.
 */
export class RoboArmHazard {
  /**
   * @param {THREE.Object3D} atrium - The loaded atrium scene
   * @param {THREE.AnimationMixer} mixer - AnimationMixer driving atrium actions
   * @param {THREE.AnimationAction} action - KesslerRoboArmSwing clip action
   * @param {object} options
   * @param {Function} [options.onHit] - Callback when player is struck (passes impact origin Vector3)
   */
  constructor(atrium, mixer, action, { onHit } = {}) {
    this.atrium = atrium;
    this.mixer = mixer;
    this.action = action;
    this.onHit = onHit;

    this.active = false;
    this.cooldown = 0;

    // Locate Bedroom 2 armature and skinned mesh
    this.armature = atrium.getObjectByName('RoboArmAture.001');
    this.armMesh = atrium.getObjectByName('RoboArm00.001');

    this.hitbox = new THREE.Box3();
    this._buildSweptHitbox();
  }

  /**
   * Samples the animation across its full 1-second cycle (24 fps) to compute
   * a 3D bounding box covering the entire animated sweep, plus EXTRA_MARGIN.
   */
  _buildSweptHitbox() {
    this.hitbox.makeEmpty();

    // Collect all bones and joints of the Bedroom 2 arm
    const bones = [];
    if (this.armature) {
      this.armature.traverse((node) => {
        if (node.isBone || node.name?.startsWith('RoboArm')) {
          bones.push(node);
        }
      });
    }

    const clip = this.action?.getClip();
    if (this.mixer && clip && bones.length > 0) {
      const duration = clip.duration || 1.0;
      const steps = 24; // 24 fps sampling
      const tempPos = new THREE.Vector3();

      // Temporarily sample across the out-and-back animation sweep
      for (let i = 0; i <= steps; i++) {
        const time = (i / steps) * duration;
        this.mixer.setTime(time);
        this.armature.updateMatrixWorld(true);

        for (const bone of bones) {
          bone.getWorldPosition(tempPos);
          this.hitbox.expandByPoint(tempPos);
        }
      }

      // Reset mixer back to resting frame
      this.mixer.setTime(0);
      this.armature.updateMatrixWorld(true);
    } else if (this.armature) {
      // Static fallback if clip is missing
      this.hitbox.setFromObject(this.armature);
    } else {
      // Safe hardcoded fallback around Bedroom 2 arm coordinates
      this.hitbox.set(
        new THREE.Vector3(17.2, 5.4, -16.0),
        new THREE.Vector3(19.8, 8.5, -13.2)
      );
    }

    // Expand by EXTRA_MARGIN to extend beyond the visible arm geometry
    this.hitbox.expandByScalar(EXTRA_MARGIN);

    // Ensure the bottom of the sweep volume extends down into the player's
    // torso and head space (player feet are on floor y ≈ 5.5 - 5.65, head y ≈ 7.3)
    if (this.hitbox.min.y > 5.5) {
      this.hitbox.min.y = Math.min(this.hitbox.min.y, 5.6);
    }
  }

  /**
   * Start hazard checking (when Kessler's door is unlocked)
   */
  start() {
    this.active = true;
  }

  /**
   * Stop hazard checking (e.g. after fusebox puzzle is solved)
   */
  stop() {
    this.active = false;
  }

  /**
   * Per-frame collision check against the player's position
   * @param {number} dt - Delta time in seconds
   * @param {THREE.Vector3} playerPosition - Player feet position
   */
  update(dt, playerPosition) {
    if (this.cooldown > 0) {
      this.cooldown -= dt;
    }

    if (!this.active || !playerPosition) return;

    // Player capsule bounding volume (radius 0.35m, height 1.8m)
    const px = playerPosition.x;
    const py = playerPosition.y;
    const pz = playerPosition.z;
    const pRadius = 0.35;
    const pHeight = 1.8;

    const hit = (
      (px + pRadius >= this.hitbox.min.x && px - pRadius <= this.hitbox.max.x) &&
      (py + pHeight >= this.hitbox.min.y && py <= this.hitbox.max.y) &&
      (pz + pRadius >= this.hitbox.min.z && pz - pRadius <= this.hitbox.max.z)
    );

    if (hit && this.cooldown <= 0) {
      this.cooldown = HIT_COOLDOWN;

      // Knockback origin: center of the hazard sweep / arm base
      const impactOrigin = new THREE.Vector3();
      if (this.armature) {
        this.armature.getWorldPosition(impactOrigin);
      } else {
        this.hitbox.getCenter(impactOrigin);
      }

      this.onHit?.(impactOrigin);
    }
  }

  dispose() {
    this.stop();
  }
}


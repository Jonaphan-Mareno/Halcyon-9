import * as THREE from 'three';

// Things Voss can use in Level 2. Each is a SPOT: a point in the world with a size, a label for
// the prompt ("E   Read the chore wheel") and what happens when he presses E. Spots are points
// rather than meshes because the atrium's props are merged into a few big meshes.
//
// The spot he is looking at gets the prompt: within reach of him, nearly under the crosshair
// and with nothing solid in the way. It is forgiving, like Level 1's aim assist: anything within
// max(8 degrees, its own size + 4 degrees) of the crosshair counts, and the one nearest the
// crosshair wins. Reach is measured from Voss himself, so it works in the third-person view too.

const MIN_ANGLE = THREE.MathUtils.degToRad(8);
const EXTRA_ANGLE = THREE.MathUtils.degToRad(4);

export class Interact {
  constructor(camera, physics) {
    this.camera = camera;
    this.physics = physics;
    this.spots = [];
    this.current = null;
    this._dir = new THREE.Vector3();
    this._to = new THREE.Vector3();
  }

  // spot: { id, position (Vector3), label, use: () => {}, radius = 0.4, reach = 2.6 (m from Voss),
  //         when: () => true while it can be used }
  add(spot) {
    spot.radius ??= 0.4;
    spot.reach ??= 2.6;
    this.spots.push(spot);
    return spot;
  }

  remove(id) {
    this.spots = this.spots.filter((s) => s.id !== id);
    if (this.current?.id === id) this.current = null;
  }

  // Which spot he is looking at (head: Voss's eye position). Returns it, or null.
  update(head) {
    const cam = this.camera;
    cam.getWorldDirection(this._dir);
    let best = null;
    let bestAngle = Infinity;
    for (const s of this.spots) {
      if (s.when && !s.when()) continue;
      if (head.distanceTo(s.position) - s.radius > s.reach) continue;
      this._to.subVectors(s.position, cam.position);
      const d = this._to.length();
      const angle = this._dir.angleTo(this._to);
      if (angle > Math.max(MIN_ANGLE, Math.atan(s.radius / Math.max(d, 0.01)) + EXTRA_ANGLE)) continue;
      if (angle < bestAngle && this._clear(head, s)) {
        best = s;
        bestAngle = angle;
      }
    }
    this.current = best;
    return best;
  }

  // Nothing solid between his eyes and the spot
  _clear(head, s) {
    this._to.subVectors(s.position, head);
    const d = this._to.length();
    if (d < 0.01) return true;
    this._to.divideScalar(d);
    const hit = this.physics.castRay(head, this._to, d);
    return hit === null || hit > d - s.radius - 0.15;
  }

  // E: use the spot he is looking at. Returns true if there was one.
  use() {
    const s = this.current;
    if (!s) return false;
    s.use();
    return true;
  }
}

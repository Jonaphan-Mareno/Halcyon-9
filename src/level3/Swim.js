import * as THREE from 'three';
import { dotTexture } from './SeaScene.js';

// Swimming outside the station (Level 3). The dive suit has a thruster pack on its back (real
// hard-shell diving suits have them): out in the water Voss flies slowly where he looks, drifting
// on when he lets go, sinking a little (PlayerController.setSwimming does the moving; Player plays
// the stroke while he pushes along and treads water otherwise).
//
//   - he swims once he goes off the platform through the dive gate (or presses Space on it), and
//     walks again when he settles back onto its deck or goes back into the collar
//   - the uplink cable he took from the reel pays out behind him from the collar: it is his line
//     back to the station, and it has a length (CABLE_MAX). At the end of it he can go no further.
//     It is a rope, simulated (Verlet: points joined by sticks), so it hangs and sways in the water
//   - bubbles: from the thruster nozzles while he pushes, and a breath from the helmet every few
//     seconds
//   - the HUD's carrying panel shows how much cable is out

const DECK = { minX: -36.4, maxX: -28.6, minZ: -25.5, maxZ: -19.5, y: 1.5 };   // the platform (world metres)
const HULL_X = -28.6;
const CABLE_MAX = 120;              // metres of cable on the reel (down to the relay at the trench's foot, and round the kraken's lair)
const ROPE_N = 56;                  // points along the rope
const BUBBLES = 260;

export class Swim {
  constructor(session) {
    this.s = session;
    this.c = session.controls;
    this.scene = session.game.scene;
    this.anchor = session.sea?.points.cableAnchor || new THREE.Vector3(-28.9, 1.55, -23.65);
    this.cableOut = 0;
    this.plugged = null;               // where its end is plugged in (the relay's port), once it is
    this.time = 0;
    this._d = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._nextBreath = 2;
    this._emit = 0;
    this.c.swimLimit = (pos, vel) => this._limit(pos, vel);
    this.c.character?.loadSwim();      // his stroke and treading water (Player plays them while he swims)
    this._rope();
    this._bubbles();
  }

  update(dt, playing) {
    this.time += dt;
    const c = this.c, p = c.position, prep = this.s.prep;
    // (outside is anywhere out in the sea but the collar, from the hull back in to the lock)
    const inCollar = p.x > HULL_X - 0.1 && p.y > 0.8 && p.z > DECK.minZ && p.z < DECK.maxZ;
    const out = prep.zone === 'sea' && !inCollar;
    const overDeck = p.x > DECK.minX && p.x < DECK.maxX && p.z > DECK.minZ && p.z < DECK.maxZ;
    if (!c.swimming) {
      // off the platform through the gate, or pushing off from it (Space)
      if (out && (!overDeck || (playing && c.keys.jumpHeld))) {
        c.setSwimming(true);
        if (overDeck) c.velocity.y = 1.4;
        if (!this._told) {
          this._told = true;
          this.s.game.ui.showToast('Swimming. WASD: where you look. Space: up. C: down. Shift: boost. The cable reaches ' + CABLE_MAX + ' m.', 9000);
        }
      }
    } else if (!out || (overDeck && c.grounded && p.y < DECK.y + 0.3)) {
      c.setSwimming(false);
    }

    const show = prep.zone === 'sea' && prep.cable;
    this.rope.visible = show;
    if (show) this._ropeStep(dt);
    this._bubbleStep(dt, prep.zone === 'sea' && prep.suited);
    this._hud(show);
  }

  // The cable holds him: past its length he cannot pull further out
  _limit(pos, vel) {
    this.s.trench?.limit(pos, vel);
    if (this.plugged) return;
    this._d.set(pos.x, pos.y + 1.2, pos.z).sub(this.anchor);
    const L = this._d.length();
    if (L < CABLE_MAX - 0.6) return;
    const n = this._d.divideScalar(L);
    const outward = vel.dot(n);
    if (outward > 0) vel.addScaledVector(n, -outward);
    if (L > CABLE_MAX) vel.addScaledVector(n, -(L - CABLE_MAX) * 3);
    if (!this._warned) {
      this._warned = true;
      this.s.game.ui.showToast("The cable won't reach any further.", 3500);
      setTimeout(() => { this._warned = false; }, 6000);
    }
  }

  // where the cable meets his back: the bottom of the backpack
  _backpack(target) {
    const f = this.c.facing || 0;
    return target.set(this.c.position.x + Math.sin(f) * 0.36, this.c.position.y + 1.05, this.c.position.z + Math.cos(f) * 0.36);
  }

  // ---------------------------------------------------------------- the cable
  _rope() {
    this.pts = new Float32Array(ROPE_N * 3);
    this.prev = new Float32Array(ROPE_N * 3);
    this._ropeStarted = false;
    const geo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6, 1, true);
    const mat = new THREE.MeshStandardMaterial({ color: 0xd9a21a, roughness: 0.6, metalness: 0.0 });
    this.rope = new THREE.InstancedMesh(geo, mat, ROPE_N - 1);
    this.rope.frustumCulled = false;
    this.rope.visible = false;
    this.scene.add(this.rope);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    this._dir = new THREE.Vector3();
    this._mid = new THREE.Vector3();
    this._scl = new THREE.Vector3();
  }

  _ropeStep(dt) {
    const P = this.pts, Q = this.prev, A = this.anchor, B = this.plugged ? this._b.copy(this.plugged) : this._backpack(this._b);
    if (!this._ropeStarted) {
      this._ropeStarted = true;
      for (let i = 0; i < ROPE_N; i++) {
        const t = i / (ROPE_N - 1);
        for (let k = 0; k < 3; k++) P[i * 3 + k] = Q[i * 3 + k] = A.getComponent(k) + (B.getComponent(k) - A.getComponent(k)) * t;
      }
    }
    const dist = A.distanceTo(B);
    this.cableOut = dist;
    const rest = Math.max(dist * 1.1, 1.2) / (ROPE_N - 1);   // (a little slack: it hangs)
    // move: keep going (damped), sink a little, and drift with the current
    const dt2 = dt * dt;
    const sway = Math.sin(this.time * 0.6) * 0.25;
    for (let i = 1; i < ROPE_N - 1; i++) {
      const j = i * 3;
      for (let k = 0; k < 3; k++) {
        const v = (P[j + k] - Q[j + k]) * 0.93;
        Q[j + k] = P[j + k];
        P[j + k] += v;
      }
      P[j] += (-0.35 + sway) * dt2;
      P[j + 1] += -1.4 * dt2;
    }
    // hold the ends and the lengths between the points
    for (let it = 0; it < 12; it++) {
      P[0] = A.x; P[1] = A.y; P[2] = A.z;
      const e = (ROPE_N - 1) * 3;
      P[e] = B.x; P[e + 1] = B.y; P[e + 2] = B.z;
      for (let i = 0; i < ROPE_N - 1; i++) {
        const a = i * 3, b = a + 3;
        const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const diff = (d - rest) / d * 0.5;
        const wa = i === 0 ? 0 : 1, wb = i === ROPE_N - 2 ? 0 : 1;
        const sum = wa + wb || 1;
        P[a] += dx * diff * 2 * wa / sum; P[a + 1] += dy * diff * 2 * wa / sum; P[a + 2] += dz * diff * 2 * wa / sum;
        P[b] -= dx * diff * 2 * wb / sum; P[b + 1] -= dy * diff * 2 * wb / sum; P[b + 2] -= dz * diff * 2 * wb / sum;
      }
      // it lies on the platform and the collar floor rather than sinking through them
      for (let i = 1; i < ROPE_N - 1; i++) {
        const j = i * 3, x = P[j], z = P[j + 2];
        if (x > DECK.minX && x < -25.2 && z > DECK.minZ && z < DECK.maxZ && P[j + 1] < DECK.y + 0.03 && P[j + 1] > DECK.y - 0.6) P[j + 1] = DECK.y + 0.03;
      }
    }
    // draw: one thin cylinder per stretch between points
    for (let i = 0; i < ROPE_N - 1; i++) {
      const a = i * 3, b = a + 3;
      this._dir.set(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]);
      const len = this._dir.length() || 1e-4;
      this._mid.set((P[a] + P[b]) / 2, (P[a + 1] + P[b + 1]) / 2, (P[a + 2] + P[b + 2]) / 2);
      this._q.setFromUnitVectors(this._up, this._dir.divideScalar(len));
      this._m.compose(this._mid, this._q, this._scl.set(1, len * 1.04, 1));
      this.rope.setMatrixAt(i, this._m);
    }
    this.rope.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- bubbles
  _bubbles() {
    this.bPos = new Float32Array(BUBBLES * 3).fill(-9999);
    this.bVel = new Float32Array(BUBBLES * 3);
    this.bLife = new Float32Array(BUBBLES);
    this._next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.bPos, 3));
    this.bubbleMesh = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xc6e6f2, size: 0.05, map: dotTexture(), transparent: true, opacity: 0.55, depthWrite: false
    }));
    this.bubbleMesh.frustumCulled = false;
    this.scene.add(this.bubbleMesh);
  }

  _spawn(x, y, z, vx, vy, vz, life) {
    const i = this._next;
    this._next = (this._next + 1) % BUBBLES;
    this.bPos[i * 3] = x; this.bPos[i * 3 + 1] = y; this.bPos[i * 3 + 2] = z;
    this.bVel[i * 3] = vx; this.bVel[i * 3 + 1] = vy; this.bVel[i * 3 + 2] = vz;
    this.bLife[i] = life;
  }

  _bubbleStep(dt, on) {
    const c = this.c;
    if (on) {
      const f = c.facing || 0;
      this._fwd.set(-Math.sin(f), 0, -Math.cos(f));
      this._right.set(Math.cos(f), 0, -Math.sin(f));
      const p = c.position;
      // the thrusters: two nozzles at the foot of the tanks, blowing against the way he goes
      if (c.swimming && c.thrusting) {
        this._emit += dt * (c.keys.sprint ? 70 : 42);
        const v = c.velocity;
        while (this._emit >= 1) {
          this._emit -= 1;
          const side = Math.random() < 0.5 ? -1 : 1;
          this._spawn(p.x - this._fwd.x * 0.38 + this._right.x * side * 0.09, p.y + 0.95 + Math.random() * 0.1, p.z - this._fwd.z * 0.38 + this._right.z * side * 0.09,
            -v.x * 0.5 + (Math.random() - 0.5) * 0.5, -v.y * 0.5 + 0.2, -v.z * 0.5 + (Math.random() - 0.5) * 0.5, 2 + Math.random() * 1.5);
        }
      }
      // breathing: a handful of bubbles from the helmet every few seconds
      this._nextBreath -= dt;
      if (this._nextBreath <= 0) {
        // (quicker when he is working hard: boosting, or fighting the kraken)
        const exert = this.s.trench?.stage === 'fight' || c.keys.sprint ? 1 : 0;
        this._nextBreath = (exert ? 2.3 : 3.8) + Math.random() * 0.8;
        this.s.sfx?.breath(exert);
        const n = 6 + Math.floor(Math.random() * 5);
        for (let k = 0; k < n; k++) {
          this._spawn(p.x + this._fwd.x * 0.15 + (Math.random() - 0.5) * 0.15, p.y + 1.85 + Math.random() * 0.1, p.z + this._fwd.z * 0.15 + (Math.random() - 0.5) * 0.15,
            (Math.random() - 0.5) * 0.2, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.2, 3 + Math.random() * 2);
        }
      }
    }
    // they rise, wobbling, faster as they go, and are gone after a few seconds
    const P = this.bPos, V = this.bVel, L = this.bLife;
    for (let i = 0; i < BUBBLES; i++) {
      if (L[i] <= 0) continue;
      L[i] -= dt;
      if (L[i] <= 0) { P[i * 3 + 1] = -9999; continue; }
      V[i * 3] *= Math.exp(-1.5 * dt);
      V[i * 3 + 2] *= Math.exp(-1.5 * dt);
      V[i * 3 + 1] = Math.min(1.4, V[i * 3 + 1] + 1.1 * dt);
      P[i * 3] += (V[i * 3] + Math.sin(this.time * 9 + i) * 0.12) * dt;
      P[i * 3 + 1] += V[i * 3 + 1] * dt;
      P[i * 3 + 2] += (V[i * 3 + 2] + Math.cos(this.time * 8 + i * 1.3) * 0.12) * dt;
    }
    this.bubbleMesh.geometry.attributes.position.needsUpdate = true;
  }

  _hud(out) {
    const note = this.s.prep?._carry?.querySelector('.cc-note');
    if (!note) return;
    const text = out ? `Cable out: ${Math.round(this.cableOut)} of ${CABLE_MAX} m` : 'Plug the end in at the relay station';
    if (note.textContent !== text) note.textContent = text;
  }

  dispose() {
    this.c.swimLimit = null;
    this.c.setSwimming?.(false);
    for (const o of [this.rope, this.bubbleMesh]) {
      o.removeFromParent();
      o.geometry.dispose();
      o.material.map?.dispose();
      o.material.dispose();
    }
  }
}

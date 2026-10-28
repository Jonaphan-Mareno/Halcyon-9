import * as THREE from 'three';

// The coolant hose: a tank on Voss's back, a heavy hose, and a nozzle in his hand that blasts
// frost while the trigger is held.
//
// The hose is a rope simulation (verlet integration): a chain of points that keeps its length,
// hangs under gravity and swings as the player moves, so it wobbles and trails behind
// naturally. A tube mesh is rebuilt along the chain every frame (same vertices, no allocation).
// Firing kicks the nozzle back a little and shakes it.

const POINTS = 12;          // points along the hose
const RADIAL = 8;           // sides of the tube
const HOSE_RADIUS = 0.095;
const HOSE_LENGTH = 1.9;    // longer than the gap, so it sags
const RANGE = 9;            // how far the frost reaches

export class CoolantHose {
  constructor(scene, player) {
    this.player = player;
    this.range = RANGE;
    this.gauge = 1;          // coolant left, 0..1
    this.firing = false;
    this._sinceFire = 1;
    this.recoil = 0;

    const metal = new THREE.MeshStandardMaterial({ color: 0xd4dce2, roughness: 0.3, metalness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.45, metalness: 0.4 });
    const glow = new THREE.MeshBasicMaterial({ color: 0x4ff0ff });

    // tank on the back (the body's back is +z, it faces -z)
    this.tank = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.62, 16), metal);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), metal);
    cap.position.y = 0.31;
    this.gaugeBand = new THREE.Mesh(new THREE.CylinderGeometry(0.176, 0.176, 0.07, 16), glow.clone());
    this.gaugeBand.position.y = 0.05;
    this.tank.add(shell, cap, this.gaugeBand);
    this.tank.position.set(0.0, 1.2, 0.34);
    player.body.add(this.tank);

    // the nozzle: a heavy pipe with a glowing muzzle (points along +z, so lookAt aims it)
    this.nozzle = new THREE.Group();
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.62, 12), dark);
    pipe.rotation.x = Math.PI / 2;
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.1, 14), metal);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.z = 0.32;
    this.muzzleGlow = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 6, 18), glow.clone());
    this.muzzleGlow.position.z = 0.38;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.08), dark);
    grip.position.set(0, -0.12, -0.05);
    this.nozzle.add(pipe, muzzle, this.muzzleGlow, grip);
    scene.add(this.nozzle);

    // the hose: rope points and the tube mesh drawn along them
    this.pts = [];
    this.prev = [];
    for (let i = 0; i < POINTS; i++) {
      this.pts.push(new THREE.Vector3());
      this.prev.push(new THREE.Vector3());
    }
    const geo = new THREE.BufferGeometry();
    this.tubePos = new Float32Array(POINTS * RADIAL * 3);
    const idx = [];
    for (let i = 0; i < POINTS - 1; i++) {
      for (let j = 0; j < RADIAL; j++) {
        const a = i * RADIAL + j, b = i * RADIAL + ((j + 1) % RADIAL);
        const c = a + RADIAL, d = b + RADIAL;
        idx.push(a, c, b, b, c, d);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.tubePos, 3));
    geo.setIndex(idx);
    this.tubeGeo = geo;
    this.tube = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2f6872, roughness: 0.45, metalness: 0.15 }));
    this.tube.frustumCulled = false;
    scene.add(this.tube);

    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._bn = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this.muzzle = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, -1);
    this._started = false;
  }

  // Where the frost leaves the nozzle, and which way it goes (valid after update)
  _anchors() {
    this.tank.updateWorldMatrix(true, false);
    this.tank.localToWorld(this._a.set(0, -0.28, 0.06));
    this.nozzle.updateWorldMatrix(true, false);
    this.nozzle.localToWorld(this._b.set(0, -0.02, -0.3));
  }

  // aimPoint: what the crosshair is on. wantFire: trigger held.
  update(dt, aimPoint, wantFire, visible = true) {
    const p = this.player.position;
    const f = this.player.facing;
    const fwd = this._t.set(-Math.sin(f), 0, -Math.cos(f));
    const right = this._n.set(Math.cos(f), 0, -Math.sin(f));

    // the coolant gauge: drains while spraying, refills shortly after you stop
    this.firing = wantFire && this.gauge > 0.02;
    if (this.firing) {
      this.gauge = Math.max(0, this.gauge - dt * 0.2);
      this._sinceFire = 0;
    } else {
      this._sinceFire += dt;
      if (this._sinceFire > 0.6) this.gauge = Math.min(1, this.gauge + dt * 0.35);
    }

    // the nozzle is held at the right hip, pointing at the aim; it kicks back while firing
    this.recoil += ((this.firing ? 1 : 0) - this.recoil) * (1 - Math.exp(-14 * dt));
    const baseY = this.player.renderY ?? p.y;
    this.nozzle.position.set(p.x, baseY + 1.15, p.z)
      .addScaledVector(right, 0.42).addScaledVector(fwd, 0.35 - this.recoil * 0.08);
    if (this.firing) {
      this.nozzle.position.x += (Math.random() - 0.5) * 0.02;
      this.nozzle.position.y += (Math.random() - 0.5) * 0.02;
    }
    if (aimPoint) this.nozzle.lookAt(aimPoint);
    this.nozzle.visible = visible;
    this.tube.visible = visible;

    this.nozzle.localToWorld(this.muzzle.set(0, 0, 0.4));
    if (aimPoint) this.dir.subVectors(aimPoint, this.muzzle).normalize();

    this._simulateHose(dt);
    this._buildTube();

    // the band on the tank shows the coolant left: cyan when full, red when nearly empty
    const g = this.gauge;
    this.gaugeBand.material.color.setRGB(0.3 + 0.7 * (1 - g), 0.94 * g + 0.1, 1.0 * g + 0.1);
    this.muzzleGlow.material.color.setRGB(this.firing ? 0.8 : 0.3, this.firing ? 1 : 0.9, 1);
  }

  _simulateHose(dt) {
    this._anchors();
    const pts = this.pts, prev = this.prev;
    if (!this._started) {
      for (let i = 0; i < POINTS; i++) {
        pts[i].lerpVectors(this._a, this._b, i / (POINTS - 1));
        prev[i].copy(pts[i]);
      }
      this._started = true;
    }
    const g = -9.8 * dt * dt;
    for (let i = 1; i < POINTS - 1; i++) {
      const pt = pts[i], pv = prev[i];
      const vx = (pt.x - pv.x) * 0.97, vy = (pt.y - pv.y) * 0.97, vz = (pt.z - pv.z) * 0.97;
      pv.copy(pt);
      pt.x += vx;
      pt.y += vy + g;
      pt.z += vz;
    }
    pts[0].copy(this._a);
    pts[POINTS - 1].copy(this._b);
    const seg = HOSE_LENGTH / (POINTS - 1);
    for (let it = 0; it < 8; it++) {
      for (let i = 0; i < POINTS - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const diff = (d - seg) / d;
        const wa = i === 0 ? 0 : 0.5, wb = i + 1 === POINTS - 1 ? 0 : 0.5;
        const k = wa + wb || 1;
        a.x += dx * diff * (wa / k); a.y += dy * diff * (wa / k); a.z += dz * diff * (wa / k);
        b.x -= dx * diff * (wb / k); b.y -= dy * diff * (wb / k); b.z -= dz * diff * (wb / k);
      }
      pts[0].copy(this._a);
      pts[POINTS - 1].copy(this._b);
    }
  }

  // Rings of vertices around each point, oriented along the hose
  _buildTube() {
    const pos = this.tubePos;
    const t = this._t, n = this._n, bn = this._bn;
    for (let i = 0; i < POINTS; i++) {
      const a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(POINTS - 1, i + 1)];
      t.subVectors(b, a).normalize();
      n.crossVectors(t, this._up);
      if (n.lengthSq() < 1e-6) n.set(1, 0, 0);
      n.normalize();
      bn.crossVectors(t, n).normalize();
      const c = this.pts[i];
      for (let j = 0; j < RADIAL; j++) {
        const ang = (j / RADIAL) * Math.PI * 2;
        const cs = Math.cos(ang) * HOSE_RADIUS, sn = Math.sin(ang) * HOSE_RADIUS;
        const k = (i * RADIAL + j) * 3;
        pos[k] = c.x + n.x * cs + bn.x * sn;
        pos[k + 1] = c.y + n.y * cs + bn.y * sn;
        pos[k + 2] = c.z + n.z * cs + bn.z * sn;
      }
    }
    this.tubeGeo.attributes.position.needsUpdate = true;
    this.tubeGeo.computeVertexNormals();
    this.tubeGeo.computeBoundingSphere();
  }

  reset() {
    this.gauge = 1;
    this._started = false;
  }
}

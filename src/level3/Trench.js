import * as THREE from 'three';
import { KrakenFight } from './KrakenFight.js';
import { SEA } from './SeaScene.js';

// The bottom of the trench (Level 3): the uplink relay station, the kraken's cave and the fight.
// Built in Blender/scripts/build_l3_outside.py (its points: PT_Relay*, PT_Cave*, PT_Kraken*...).
//
//   1. down from the platform to the relay station at the foot of the cliff (the cable reaches)
//   2. in through its door; plug the uplink cable into the port (and the team's puzzles: see
//      PUZZLES below). The relay tries the trunk line to the surface: no signal, it is torn
//   3. out through the back hatch: the line's torn end lies out toward the cliff, in the grip of a
//      tentacle. The tentacles draw back into the cave, dragging it: he follows them in
//   4. in its lair the kraken comes at him (KrakenFight.js). Its tentacles glow before they strike
//      (Shift to dash clear); after each blow its mouth glows: harpoon it (left click). Three hits
//   5. it lets go of the line and sinks away: he takes the line back to the socket on the relay,
//      then finishes the uplink at the console inside
//
// The relay has an air refill (the suit's four minutes run out otherwise). If his health or his air
// runs out, ARIA restores him from backup at the last safe place.

const ROPE_N = 40;                  // points along the trunk line
const ROPE_LEN = 52;                // metres of it
const TRENCH_TOP = -24;             // deeper than this (and east of the leg), the trench's lights take over
const TRENCH_LIGHTS = [             // colour, candela, range: in the relay, over its door, in the lair, at the cave's mouth
  [0xcfe8ff, 7, 9], [0xffb070, 6, 13], [0x3fffd0, 18, 30], [0x2fbfa0, 7, 16]
];
const OXYGEN_FULL = 240;            // (PrepRoom's OXYGEN)

// The team's puzzles in the relay go here: called once the uplink cable is plugged in, before the
// relay tries the trunk line. An async function given the Trench; resolve when they are solved.
export const PUZZLES = { run: null };

export class Trench {
  constructor(session) {
    this.s = session;
    this.game = session.game;
    this.sea = session.sea;
    this.scene = session.game.scene;
    const model = this.sea.model;
    const at = (name) => model.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()) || null;
    this.pts = {
      front: at('PT_RelayFront'), door: at('PT_RelayDoor'), inside: at('PT_RelayInside'), port: at('PT_RelayPort'),
      screen: at('PT_RelayScreen'), air: at('PT_AirRefill'), bay: at('PT_PuzzleBay'), hatch: at('PT_RelayHatch'),
      socket: at('PT_TrunkSocket'), mouth: at('PT_CaveMouth'), caveIn: at('PT_CaveInside'),
      lurk: at('PT_KrakenLurk'), lair: at('PT_KrakenLair'), respawn: at('PT_Respawn')
    };
    this.lightAt = [0, 1, 2, 3].map((i) => at('TRENCH_LIGHT_' + i));
    this.stage = 'descend';
    this.time = 0;
    this.shake = 0;
    this.checkpoint = null;          // where ARIA restores him (null: the platform)
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._chest = new THREE.Vector3();
    this._head = new THREE.Vector3();
    this._lineEnd = new THREE.Vector3();
    this._doors(model);
    this._heights();
    // where the torn line's end lies at first: out from the back of the relay toward the cave
    this.pts.lineStart = this.pts.socket.clone().add(new THREE.Vector3(7.5, 0, -1.2));
    this.pts.lineStart.y = this._groundAt(this.pts.lineStart.x, this.pts.lineStart.z) + 0.3;
    this._rope();
    this._spots();
    this._sign();
    this.fight = new KrakenFight(this);
    this.ready = this.fight.ready;
    if (session.harpoon) session.harpoon.hitTest = (p0, p1) => this._spear(p0, p1);
  }

  // what a harpoon spear meets between p0 and p1: the kraken, or rock
  _spear(p0, p1) {
    const hit = this.fight.spearTest(p0, p1);
    if (hit) return hit;
    const d = this._v.subVectors(p1, p0);
    const L = d.length();
    if (L < 1e-4) return null;
    d.divideScalar(L);
    const t = this.s.physics.castRay(p0, d, L);
    return t === null ? null : { point: p0.clone().addScaledVector(d, t), stick: null };
  }

  // ------------------------------------------------------------------ the doors
  _doors(model) {
    const make = (name, slide) => {
      const obj = model.getObjectByName(name);
      if (!obj) return null;
      return { obj, base: obj.position.clone(), slide, open: 0, target: 0, collider: null };
    };
    // (both slide sideways along the wall: three's z is the Blender's -y)
    this.doors = { front: make('GATE_RelayDoor', new THREE.Vector3(0, 0, -1.45)), hatch: make('GATE_RelayHatch', new THREE.Vector3(0, 0, 1.45)) };
    for (const d of Object.values(this.doors)) if (d) this._block(d, true);
  }

  _block(d, on) {
    const world = this.s.physics.world;
    if (on && !d.collider) {
      d.obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(d.obj);
      const c = box.getCenter(new THREE.Vector3()), h = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const R = this.s.physics.RAPIER;
      d.collider = world.createCollider(R.ColliderDesc.cuboid(Math.max(h.x, 0.1), h.y, Math.max(h.z, 0.1)).setTranslation(c.x, c.y, c.z));
    } else if (!on && d.collider) {
      world.removeCollider(d.collider, true);
      d.collider = null;
    }
  }

  _open(name) {
    const d = this.doors[name];
    if (!d || d.target === 1) return;
    d.target = 1;
    this._block(d, false);
  }

  _moveDoors(dt) {
    for (const d of Object.values(this.doors)) {
      if (!d || d.open === d.target) continue;
      d.open = THREE.MathUtils.clamp(d.open + Math.sign(d.target - d.open) * dt / 1.6, 0, 1);
      const e = d.open * d.open * (3 - 2 * d.open);
      d.obj.position.copy(d.base).addScaledVector(d.slide, e);
    }
  }

  // ------------------------------------------------------------------ the ground (for the line)
  // the floor's height over the area the trunk line can lie in, felt once with rays
  _heights() {
    const p = this.pts, x0 = p.socket.x - 6, x1 = p.lair.x + 10, z0 = p.inside.z - 18, z1 = p.inside.z + 18;
    const n = { x: Math.ceil(x1 - x0) + 1, z: Math.ceil(z1 - z0) + 1 };
    const h = new Float32Array(n.x * n.z);
    const down = new THREE.Vector3(0, -1, 0), from = new THREE.Vector3();
    const caveFloor = p.lurk.y - 0.6;
    for (let j = 0; j < n.z; j++) {
      for (let i = 0; i < n.x; i++) {
        const x = x0 + i, z = z0 + j;
        // (in the cave, felt from under its roof; outside, from well above the floor)
        const top = x > p.mouth.x - 2 ? caveFloor + 3.5 : caveFloor + 12;
        from.set(x, top, z);
        const d = this.s.physics.castRay(from, down, 30);
        h[j * n.x + i] = d === null ? caveFloor - 3 : top - d;
      }
    }
    this._grid = { x0, z0, n, h };
  }

  _groundAt(x, z) {
    const g = this._grid;
    const fx = THREE.MathUtils.clamp(x - g.x0, 0, g.n.x - 1.001), fz = THREE.MathUtils.clamp(z - g.z0, 0, g.n.z - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j;
    const H = (ii, jj) => g.h[jj * g.n.x + ii];
    return (H(i, j) * (1 - a) + H(i + 1, j) * a) * (1 - b) + (H(i, j + 1) * (1 - a) + H(i + 1, j + 1) * a) * b;
  }

  // ------------------------------------------------------------------ the trunk line
  // A rope like the cable (Verlet: points joined by sticks), lying on the floor: one end in the
  // relay's socket (or in his hands, at the end), the other wherever its torn end is
  _rope() {
    this.ropeP = new Float32Array(ROPE_N * 3);
    this.ropeQ = new Float32Array(ROPE_N * 3);
    const a = this.pts.socket, b = this.pts.lineStart;
    for (let i = 0; i < ROPE_N; i++) {
      const t = i / (ROPE_N - 1);
      // (laid out in a loose S from the socket to its end, the slack lying in the bends)
      const x = a.x + (b.x - a.x) * t + Math.sin(t * Math.PI * 3) * 1.2;
      const z = a.z + (b.z - a.z) * t + Math.sin(t * Math.PI * 2) * 2.2;
      const y = i === 0 ? a.y : this._groundAt(x, z) + 0.08;
      this.ropeP.set([x, y, z], i * 3);
      this.ropeQ.set([x, y, z], i * 3);
    }
    const geo = new THREE.CylinderGeometry(0.07, 0.07, 1, 6, 1, true);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.6, metalness: 0.2, emissive: 0x0a1418 });
    this.rope = new THREE.InstancedMesh(geo, mat, ROPE_N - 1);
    this.rope.frustumCulled = false;
    this.sea.group.add(this.rope);
    // its torn end: frayed copper, glinting
    this.ropeEnd = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc87533, emissive: 0x6a2e08, roughness: 0.4, metalness: 0.8 }));
    this.sea.group.add(this.ropeEnd);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    this._dir = new THREE.Vector3();
    this._mid = new THREE.Vector3();
    this._scl = new THREE.Vector3();
  }

  // where the line's far end is pinned this frame (null: it lies free)
  _ropeEndPin(out) {
    if (this.stage === 'carry' || this.stage === 'done' || this.stage === 'uplink') {
      if (this.stage !== 'carry') return out.copy(this.pts.socket).add(this._w.set(0, 0, 0.3));
      return this.s.swim._backpack(out);
    }
    return this.fight?.lineEnd(out) || null;
  }

  _ropeStep(dt) {
    const P = this.ropeP, Q = this.ropeQ, A = this.pts.socket;
    const pinned = this._ropeEndPin(this._lineEnd);
    const rest = ROPE_LEN / (ROPE_N - 1);
    const dt2 = dt * dt;
    for (let i = 1; i < ROPE_N; i++) {
      const j = i * 3;
      for (let k = 0; k < 3; k++) {
        const v = (P[j + k] - Q[j + k]) * 0.9;
        Q[j + k] = P[j + k];
        P[j + k] += v;
      }
      P[j + 1] -= 3.0 * dt2;
    }
    for (let it = 0; it < 10; it++) {
      P[0] = A.x; P[1] = A.y; P[2] = A.z;
      const e = (ROPE_N - 1) * 3;
      if (pinned) { P[e] = pinned.x; P[e + 1] = pinned.y; P[e + 2] = pinned.z; }
      for (let i = 0; i < ROPE_N - 1; i++) {
        const a = i * 3, b = a + 3;
        const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        if (d <= rest) continue;                   // (a rope: it goes slack, it does not push)
        const free = { a: i !== 0, b: !(i + 1 === ROPE_N - 1 && pinned) };
        const corr = (d - rest) / d * (free.a && free.b ? 0.5 : 1);
        if (free.a) { P[a] += dx * corr; P[a + 1] += dy * corr; P[a + 2] += dz * corr; }
        if (free.b) { P[b] -= dx * corr; P[b + 1] -= dy * corr; P[b + 2] -= dz * corr; }
      }
      // it lies on the floor, not in it
      for (let i = 1; i < ROPE_N; i++) {
        const j = i * 3;
        const g = this._groundAt(P[j], P[j + 2]) + 0.07;
        if (P[j + 1] < g) { P[j + 1] = g; Q[j + 1] = g; }
      }
    }
    // drawn as short tubes, point to point
    for (let i = 0; i < ROPE_N - 1; i++) {
      const a = this._v.fromArray(P, i * 3), b = this._w.fromArray(P, i * 3 + 3);
      this._dir.subVectors(b, a);
      const len = this._dir.length() || 1e-4;
      this._mid.addVectors(a, b).multiplyScalar(0.5);
      this._q.setFromUnitVectors(this._up, this._dir.divideScalar(len));
      this._scl.set(1, len + 0.02, 1);
      this._m.compose(this._mid, this._q, this._scl);
      this.rope.setMatrixAt(i, this._m);
    }
    this.rope.instanceMatrix.needsUpdate = true;
    this.ropeEnd.position.fromArray(P, (ROPE_N - 1) * 3);
  }

  // ------------------------------------------------------------------ E: the things he uses
  _spots() {
    const it = this.s.interact, p = this.pts;
    it.add({ id: 'relayDoor', position: p.door, radius: 0.9, label: 'Open the relay station door', when: () => this.doors.front?.target === 0, use: () => this._useDoor() });
    it.add({ id: 'relayPort', position: p.port, radius: 0.35, reach: 2.4, label: 'Plug in the uplink cable', when: () => this.stage === 'inside', use: () => this._plug() });
    it.add({
      id: 'relayAir', position: p.air, radius: 0.5, reach: 2.4, label: 'Refill your air',
      when: () => this.s.prep?.suited && this.s.prep.oxygen < OXYGEN_FULL - 2, use: () => this._refill()
    });
    it.add({
      id: 'relayHatch', position: p.hatch, radius: 0.9, label: () => (this.stage === 'trunk' ? 'Open the back hatch' : 'Back hatch'),
      when: () => this.doors.hatch?.target === 0, use: () => this._useHatch()
    });
    this._lineSpot = it.add({ id: 'trunkEnd', position: new THREE.Vector3(), radius: 0.8, reach: 2.8, label: 'Take the trunk line', when: () => this.stage === 'line', use: () => this._takeLine() });
    it.add({ id: 'trunkSocket', position: p.socket, radius: 0.5, reach: 2.6, label: 'Plug in the trunk line', when: () => this.stage === 'carry', use: () => this._connectLine() });
    it.add({ id: 'relayConsole', position: p.screen, radius: 0.7, reach: 3.0, label: 'Finish the uplink', when: () => this.stage === 'uplink', use: () => this._finish() });
  }

  _useDoor() {
    this._open('front');
    this.checkpoint = this.pts.inside.clone().add(new THREE.Vector3(0, 0.3, 0));
    if (this.stage === 'descend' || this.stage === 'front') this.stage = 'enter';
  }

  async _plug() {
    if (this.stage !== 'inside') return;
    this.stage = 'puzzles';
    this.s.swim.plugged = this.pts.port.clone();
    this.s.prep._carry?.classList.remove('on');
    this.game.ui.showToast('Uplink cable plugged in. The relay is checking the line to the surface...', 4500);
    await this.s.say('plug');
    if (PUZZLES.run) await PUZZLES.run(this);
    if (this.s.disposed) return;
    this.stage = 'trunk';
    this._screenText = ['TRUNK LINE: SEVERED', 'NO PATH TO THE SURFACE'];
    this._drawSign();
    this.game.ui.showToast("The relay can't reach the surface: its trunk line, the cable up to the surface, has been torn out. Without it the uplink goes nowhere. The line leaves through the back hatch.", 9000);
    this.s.say('trunk');
  }

  _refill() {
    const prep = this.s.prep;
    prep.oxygen = OXYGEN_FULL;
    this.game.ui.showToast('Air refilled: four minutes.', 3000);
  }

  _useHatch() {
    if (this.stage !== 'trunk') return this.s.say('portFirst');
    this._open('hatch');
    this.stage = 'out';
  }

  _takeLine() {
    if (this.stage !== 'line') return;
    this.stage = 'carry';
    this.game.ui.showToast('Trunk line taken. Bring it back to the socket on the relay.', 5000);
  }

  _connectLine() {
    if (this.stage !== 'carry') return;
    this.stage = 'uplink';
    this._screenText = ['TRUNK LINE: CONNECTED', 'SURFACE: SIGNAL. UPLINK READY'];
    this._drawSign();
    this.game.ui.showToast('Trunk line connected. Signal.', 4000);
    this.s.say('signal');
  }

  async _finish() {
    if (this.stage !== 'uplink') return;
    this.stage = 'done';
    this.game.ui.showToast('UPLINK ESTABLISHED', 5000);
    // (the endings come next: see the script, "Endings")
    await this.s.say('uplinkDone');
    this._endCard();
  }

  _endCard() {
    if (this._end) return;
    const el = document.createElement('div');
    el.id = 'l3-end';
    el.innerHTML = '<div class="l3-end-title">UPLINK ESTABLISHED</div><div class="l3-end-sub">End of Level 3 (so far). The endings come next.</div>';
    document.getElementById('ui-layer').appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    this._end = el;
  }

  // the relay's screen over the console: what it says
  _sign() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    this._signCtx = c.getContext('2d');
    this._signTex = new THREE.CanvasTexture(c);
    this._signTex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.85), new THREE.MeshBasicMaterial({ map: this._signTex, toneMapped: false }));
    m.position.copy(this.pts.screen).add(new THREE.Vector3(0, 0, 0.03));
    m.rotation.y = 0;                     // (the screen faces south, into the room: three's +z)
    this.sea.group.add(m);
    this._screenText = ['UPLINK RELAY 3', 'PORT: WAITING FOR CABLE'];
    this._drawSign();
  }

  _drawSign() {
    const g = this._signCtx;
    g.fillStyle = '#04141a';
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#2fd0ff';
    g.lineWidth = 4;
    g.strokeRect(8, 8, 496, 240);
    g.textAlign = 'center';
    g.font = 'bold 32px Courier New, monospace';
    const bad = this._screenText[0].includes('SEVERED');
    g.fillStyle = bad ? '#ff5a4a' : '#7fe8ff';
    g.fillText(this._screenText[0], 256, 110);
    g.font = 'bold 26px Courier New, monospace';
    g.fillStyle = '#cfefff';
    g.fillText(this._screenText[1], 256, 170);
    this._signTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ the fight's events
  onRoar() {
    this.stage = 'fight';
    this.shake = 1.4;
    this.game.mood?.flicker?.(0.6);
    this.s.harpoon?.draw(true);
    this.s.say('kraken').then(() => this.game.ariaAnger?.(8));
    this.game.ui.showToast('Its tentacles glow before they strike: Shift to dash clear. When its mouth glows, harpoon it (left click).', 8000);
  }

  onWindup() {}

  // the first time it lunges into his face, say what to do
  onLunge() {
    if (this._lungeTold) return;
    this._lungeTold = true;
    this.game.ui.showToast('Its mouth is right in front of you: harpoon it now, or dash away before it bites!', 4000);
  }

  onOpen(on) {
    this._mouthOpen = on;
  }

  onHitPlayer(damage, from) {
    if (this._restoring) return;
    const c = this.s.controls;
    this.s.hud.flash();
    this.shake = Math.max(this.shake, 1.0);
    // knocked away through the water
    const away = this._v.set(c.position.x - from.x, 0.4, c.position.z - from.z).normalize();
    c.velocity.addScaledVector(away, 9);
    if (this.s.player.damage(damage)) this._restore('BACKUP RESTORED', 'RESTORED: CYCLE 9');
  }

  onShrug() {
    if (this.stage !== 'fight') return;
    if (this._shrugT > 0) return;
    this._shrugT = 4;
    this.game.ui.showToast('It shrugs the spear off. Wait for its mouth to glow.', 2500);
  }

  onWounded(n, of) {
    this.shake = 1.2;
    this.game.ui.showToast(`A hit! (${n} of ${of})`, 2500);
    this.s.say(n === 1 ? 'hit1' : 'hit2');
  }

  onBeaten() {
    this.shake = 2;
    this.stage = 'line';
    this.s.harpoon?.draw(false);
    this.game.ui.showToast('It lets go of the line and sinks back into the dark.', 5000);
    this.s.say('krakenGone');
  }

  // ------------------------------------------------------------------ every frame
  inCave(p) {
    return p.x > this.pts.mouth.x + 2;
  }

  update(dt, playing) {
    if (!this.sea.group.visible) return;
    this.time += dt;
    this._shrugT = Math.max(0, (this._shrugT || 0) - dt);
    const c = this.s.controls, p = c.position;
    const chest = this._chest.set(p.x, p.y + 1.1, p.z);
    this._moveDoors(dt);
    this._stages(p);
    // (the kraken is not drawn from far off: the fog hides it there anyway)
    const k = this.fight.kraken;
    if (this.fight.state !== 'gone') k.root.visible = p.distanceTo(k.root.position) < 80;
    this.fight.update(dt, playing ? chest : null, playing && !this._restoring);
    this.shake = Math.max(this.shake, this.fight.shake);
    this._ropeStep(Math.min(dt, 1 / 30));
    if (this.stage === 'line') this._lineSpot.position.copy(this.ropeEnd.position);
    this._lights(p);
    this._air(playing);
    // the camera shakes with its blows (after the controls have placed it)
    this.shake = Math.max(0, this.shake - dt * 1.6);
    if (this.shake > 0 && playing) {
      const cam = this.game.camera.instance, k = Math.min(1, this.shake) * 0.09;
      cam.position.x += (Math.random() - 0.5) * k;
      cam.position.y += (Math.random() - 0.5) * k;
      cam.position.z += (Math.random() - 0.5) * k;
    }
  }

  // moving on when he gets where the step wants him
  _stages(p) {
    const P = this.pts;
    switch (this.stage) {
      case 'descend':
        if (p.distanceTo(P.front) < 12) {
          this.stage = 'front';
          this.s.say('relay');
        } else if (!this._toldDescend && p.y < TRENCH_TOP + 10) {
          this._toldDescend = true;
          this.s.say('descend');
        }
        break;
      case 'enter':
        if (Math.hypot(p.x - P.inside.x, p.z - P.inside.z) < 3.8) this.stage = 'inside';
        break;
      case 'out':
        if (p.x > P.hatch.x + 0.6) {
          this.stage = 'follow';
          this.fight.retreat();
          this.s.harpoon?.draw(true);
          this.checkpoint = P.respawn.clone();
          this.game.ui.showToast('Something has the end of the trunk line, and it is dragging it into the cave. No line, no uplink: follow it.', 8000);
          this.s.say('tentacles');
        }
        break;
    }
  }

  // deep in the trench, the four borrowed lights light the relay, its door, the lair and the cave
  _lights(p) {
    const deep = p.y < TRENCH_TOP && p.x > -16;
    const borrowed = this.s.prep?.borrowed;
    if (!borrowed || this.s.prep.zone !== 'sea') { this._lit = false; return; }
    if (deep !== this._lit) {
      this._lit = deep;
      borrowed.forEach((b, i) => {
        const to = deep ? this.lightAt[i] : this.sea.lights[i];
        const spec = deep ? TRENCH_LIGHTS[i] : SEA.LIGHTS[i];
        if (!to || !spec) return;
        b.light.position.copy(to);
        b.light.color.setHex(spec[0]);
        b.light.intensity = spec[1];
        b.light.distance = spec[2];
      });
    }
    if (deep && borrowed[2]) borrowed[2].light.intensity = TRENCH_LIGHTS[2][1] * (0.8 + 0.2 * Math.sin(this.time * 0.9));
  }

  // out of air: ARIA restores him too
  _air(playing) {
    const prep = this.s.prep;
    if (playing && prep?.breathing && prep.oxygen <= 0 && !this._restoring) this._restore('OXYGEN DEPLETED', 'RESTORED FROM BACKUP');
  }

  _restore(title, sub) {
    this._restoring = true;
    this.s.player.deaths++;
    this.s.hud.showDeath(title, sub);
    setTimeout(() => {
      if (this.s.disposed) return;
      this.s.hud.hideDeath();
      this.s.player.integrity = 100;
      this.s.prep.oxygen = OXYGEN_FULL;
      const at = this.checkpoint || this.sea.points.platform?.clone().add(new THREE.Vector3(0, 0.2, 0));
      if (at) this.s.controls.teleport(at);
      this.s.controls.velocity.set(0, 0, 0);
      this.fight.reset();
      this._restoring = false;
    }, 1800);
  }

  // the swimmer cannot pass into the kraken (called from Swim's limit)
  limit(pos, vel) {
    this.fight?.pushOut(pos, vel);
  }

  // the objective and the marker for this step
  guide() {
    const P = this.pts;
    switch (this.stage) {
      case 'descend': return { text: 'Swim down to the relay station at the bottom of the trench', target: P.front, label: 'RELAY' };
      case 'front': return { text: 'Open the relay station door', target: P.door, label: 'DOOR' };
      case 'enter': return { text: 'Go inside the relay station', target: P.inside, label: 'IN' };
      case 'inside': return { text: 'Plug the uplink cable into the port', target: P.port, label: 'PORT' };
      case 'puzzles': return { text: 'The relay is checking the line...', target: null };
      case 'trunk': return { text: 'The trunk line to the surface is torn out: without it, no uplink. Open the back hatch', target: P.hatch, label: 'HATCH' };
      case 'out': return { text: 'Find the torn end of the trunk line', target: this.ropeEnd.position, label: 'LINE' };
      case 'follow': return { text: 'It is dragging the trunk line into the cave. Follow it: you need that line back', target: this.ropeEnd.position, label: 'LINE' };
      case 'fight':
        if (this._mouthOpen) return { text: 'NOW: harpoon its glowing mouth (left click)', target: this.fight.kraken.mouthWorld(this._v), label: 'MOUTH' };
        return { text: 'Survive: dodge the glowing tentacles (Shift). Harpoon its mouth when it glows', target: null };
      case 'line': return { text: 'Take back the trunk line', target: this.ropeEnd.position, label: 'LINE' };
      case 'carry': return { text: "Bring the trunk line back to the relay's socket", target: P.socket, label: 'SOCKET' };
      case 'uplink': return { text: 'Finish the uplink at the console inside the relay', target: P.screen, label: 'CONSOLE' };
      default: return { text: 'Uplink established', target: null };
    }
  }

  dispose() {
    this.fight?.dispose();
    for (const d of Object.values(this.doors)) if (d) this._block(d, false);
    this.rope?.removeFromParent();
    this.rope?.geometry.dispose();
    this._end?.remove();
  }
}

import * as THREE from 'three';
import { Drone } from './Drone.js';
import { Robot } from '../entities/Robot.js';
import { FrostFX } from './FrostFX.js';
import { FrostAudio } from './FrostAudio.js';
import { Remains } from './Remains.js';
import { withHubLighting } from '../graphics/HubMaterials.js';

// The garden fight (scene 2.3). The drone glimpsed across the hall (the tease) turns and hunts
// him on his way to the hatch: one attacker, slowly, until the rest drop from the grilles above the
// beds as he nears the hatch. At the back of the garden an irrigation manifold, a wall of big pipes,
// holds a heavy hose: E pulls it out, the left mouse button sprays. Wet drones crackle and slow;
// Q asks ARIA to drop the temperature (holding Q freezes the moment one is wet enough), and every
// wet drone freezes, falls and shatters, leaving glowing remains on the floor (the organism got
// into them). When the fight ends he lets go and the nozzle drops to the floor with its hose.
//
// Two waves: two drones to learn it ("That's two. There are... a few more."), then six, never
// more than four in the air. Until he has the pipe they dive only now and then. Only one drone
// attacks at a time: a lock-on (its eye turns red), then a dive. When the last one breaks, the
// level is told (onCleared).
//
// Robots join from the second wave onward: they use the same state machine as drones but load
// the Robot.glb model. The danger signal is on the robot itself: its head lamp (node A6, mesh
// Circle.008) glows red from the moment it spawns - see Robot.js.

const WAVES = [2, 10];
const MAX_ALIVE = 4;
const WAKE_RADIUS = 4;           // he comes this close to the hatch: the drones drop
const REST_SECONDS = 6;
const COLD_SNAP_COOLDOWN = 5;
const JET_RANGE = 18;            // the water reaches about this far
const DRONE_HIT_RADIUS = 1.0;    // a water droplet this close to a drone soaks it (its whole width, arms and all)
const SOAK_PER_DROP = 0.06;      // so five droplets make it wet enough to freeze
const GRIP_TILT = 0.35;          // the nozzle's grip leans its top forward this much (radians)
const CLOSE_JET = 3;            // right in front of the nozzle (before the droplets spread out)
const SOAK_PER_SECOND = 2.2;     //   a drone in the jet's path soaks this fast
const ATTACK_GAP = [1.8, 3.2];   // seconds between one drone's dive and the next one's lock-on
const HUNT_GAP = [3.5, 5.5];     // the same before he has the pipe (one drone hunting him, slowly)
const LEASH = 15;                // drones follow him anywhere on the hall floor, this far from the garden
const FIRST_DIVE = 3;            // seconds after he takes the pipe before the first dive
const IDLE_SECONDS = 25;         // the drones are up and he still hasn't taken the pipe
const HOSE_POINTS = 18;

const rand = (a, b) => a + Math.random() * (b - a);

export class Garden {
  // opts: { scene, physics, camera, centre (the hatch), manifoldAt { r, angle },
  //         say(talk, quietOnly), isTalking(), onWake(), onPipe(), onHurt(kind, from), onCleared(), toast(text) }
  constructor(opts) {
    Object.assign(this, opts);
    this.fx = new FrostFX(this.scene);
    this.audio = new FrostAudio();
    this.drones = [];
    this._dangerActive = false;    // a robot has spawned: the warning toast has been shown
    this._spawnIndex = 0;          // tracks spawn order within a wave (for deterministic robot ratio)
    this.state = 'idle';             // idle -> fight -> rest -> fight -> done
    this.wave = -1;
    this.queue = 0;
    this.spawnTimer = 0;
    this.restTimer = 0;
    this.attackTimer = 2.5;
    this.coldSnap = 0;               // seconds until ARIA can freeze again
    this.holding = false;
    this.spraying = false;
    this.idleTime = 0;
    this.freezeHeld = false;         // Q is held down
    this._said = {};
    this._pending = [];              // remarks waiting for a quiet moment, so none cuts another off
    this._time = 0;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._tip = new THREE.Vector3();
    this._down = new THREE.Vector3(0, -1, 0);
    this._facing = new THREE.Vector3(0, 0, -1);
    this._q2 = new THREE.Quaternion();
    this.remains = new Remains(this.scene);
    this._buildManifold();
    this._buildHose();
    this._floorY = 0;
    this._floorY = this._groundBelow(this.reelOutlet);
  }

  // the height of whatever is under a point (the floor, or a bed)
  _groundBelow(p) {
    const hit = this.physics.castRay(this._v.copy(p), this._down, 12);
    return hit === null ? this._floorY : p.y - hit;
  }

  get active() {
    return this.state === 'hunt' || this.state === 'fight' || this.state === 'rest';
  }

  get alive() {
    return this.drones.filter((d) => d.alive && d.state !== 'frozen').length;
  }

  // ------------------------------------------------------------------ the manifold and its hose
  _buildManifold() {
    const { r, angle } = this.manifoldAt;
    const a = THREE.MathUtils.degToRad(angle);
    const base = new THREE.Vector3(r * Math.cos(a), 0, -r * Math.sin(a));
    const navy = withHubLighting(new THREE.MeshStandardMaterial({ color: 0x16233a, roughness: 0.45, metalness: 0.2 }));
    const pipe = withHubLighting(new THREE.MeshStandardMaterial({ color: 0x8a949c, roughness: 0.35, metalness: 0.8 }));
    const orange = withHubLighting(new THREE.MeshStandardMaterial({ color: 0xf07a14, roughness: 0.4, metalness: 0.2 }));
    const black = withHubLighting(new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.5, metalness: 0.3 }));
    const g = new THREE.Group();
    g.name = 'Garden_Manifold';
    const add = (geo, mat, x, y, z, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz);
      g.add(m);
      return m;
    };
    // the wall section, with the station's orange stripe
    add(new THREE.BoxGeometry(2.2, 2.6, 0.3), navy, 0, 1.3, -0.15);
    add(new THREE.BoxGeometry(2.22, 0.12, 0.32), orange, 0, 1.0, -0.15);
    // three big pipes running up into the gallery
    for (const x of [-0.8, 0, 0.8]) {
      add(new THREE.CylinderGeometry(0.14, 0.14, 5.4, 12), pipe, x, 2.7, 0.12);
      add(new THREE.CylinderGeometry(0.19, 0.19, 0.12, 12), black, x, 2.65, 0.12);   // a flange
    }
    // the hose reel, coiled with hose, and the hook the nozzle hangs on
    const reel = add(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 20), black, 0, 1.55, 0.45, 0, Math.PI / 2);
    reel.rotation.set(0, 0, Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const coil = add(new THREE.TorusGeometry(0.42, 0.075, 8, 24), black, -0.15 + i * 0.1, 1.55, 0.45);
      coil.rotation.y = Math.PI / 2;
    }
    add(new THREE.BoxGeometry(0.08, 0.3, 0.08), pipe, 0.75, 1.2, 0.35);
    // face the middle of the atrium
    g.position.copy(base);
    g.lookAt(0, 0, 0);
    this.scene.add(g);
    g.updateMatrixWorld(true);
    // solid: the wall section (its pipes run up out of reach)
    const block = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.6, 0.9));
    block.position.set(0, 1.3, 0.1);
    g.add(block);
    block.visible = false;
    block.updateMatrixWorld(true);
    this.physics.addStaticObject(block);
    this.manifold = g;
    this.reelOutlet = new THREE.Vector3(0, 1.2, 0.6).applyMatrix4(g.matrixWorld);
    this.hookAt = new THREE.Vector3(0.75, 1.15, 0.5).applyMatrix4(g.matrixWorld);

    // the nozzle: a heavy brass-and-orange gun with a grip, hanging on its hook until taken
    const n = new THREE.Group();
    const brass = withHubLighting(new THREE.MeshStandardMaterial({ color: 0xb08a3c, roughness: 0.3, metalness: 0.85 }));
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.55, 12), orange);
    body.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.18, 12), brass);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.36;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.08), black);
    grip.position.set(0, -0.14, -0.08);
    grip.rotation.x = GRIP_TILT;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 16), brass);
    band.position.z = -0.2;
    n.add(body, tip, grip, band);
    n.position.copy(this.hookAt);
    n.rotation.set(Math.PI / 2, 0, 0);       // hanging nose-down on the hook
    this.scene.add(n);
    this.nozzle = n;
  }

  // the hose: a chain of points that sags under its own weight between the reel and the nozzle,
  // drawn as one instanced mesh of short tube pieces (no allocation per frame)
  _buildHose() {
    this.points = Array.from({ length: HOSE_POINTS }, () => new THREE.Vector3().copy(this.reelOutlet));
    this.prev = this.points.map((p) => p.clone());
    const mat = withHubLighting(new THREE.MeshStandardMaterial({ color: 0x1c1f23, roughness: 0.7, metalness: 0.1 }));
    this.hoseMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.075, 1, 8), mat, HOSE_POINTS - 1);
    this.hoseMesh.frustumCulled = false;
    this.hoseMesh.visible = false;
    this.scene.add(this.hoseMesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  get pipeSpot() {
    return this.hookAt;
  }

  takePipe() {
    if (this.holding) return;
    this.holding = true;
    this.hoseMesh.visible = true;
    this.onPipe?.();
    if (this.state === 'fight') this.attackTimer = Math.max(this.attackTimer, FIRST_DIVE);
    this.toast?.('Hold left click to spray. When they are wet, press Q and ARIA freezes them.');
  }

  // ------------------------------------------------------------------ the fight
  _wake() {
    this.state = 'fight';
    this._startWave(0);
    this.onWake?.();
    this.say?.('gardenStart');
  }

  _startWave(i) {
    this.wave = i;
    this.queue = WAVES[i];
    this.spawnTimer = 0.4;
    this._spawnIndex = 0;
  }

  _spawn() {
    // from the grilles high above the beds, round the garden
    const a = Math.random() * Math.PI * 2;
    const r = rand(4, 7);
    const start = new THREE.Vector3(this.centre.x + Math.cos(a) * r, 8.5, this.centre.z + Math.sin(a) * r);
    // From wave 1 onward, exactly half the spawns are robots (alternating: drone, robot, drone, ...)
    const isRobot = this.wave >= 1 && (this._spawnIndex % 2 === 1);
    this._spawnIndex++;
    if (isRobot) {
      const robot = new Robot(this.scene, start);
      this.drones.push(robot);
      this._activateDangerIndicator();
    } else {
      this.drones.push(new Drone(this.scene, start));
    }
    this.queue--;
    this.fx.mist(start, 0.4, 40);
  }

  // A robot has spawned: its own A6 lamp (Circle.008) is already red - see Robot.js. Here we
  // just warn Voss once, the first time it happens in a fight.
  _activateDangerIndicator() {
    if (this._dangerActive) return;
    this._dangerActive = true;
    this.toast?.('WARNING: HOSTILE UNITS DETECTED');
  }

  // Q: ARIA drops the temperature. Every wet drone freezes and falls. While Q is held this runs
  // every frame, quietly, so it freezes the moment one is wet enough and she is ready.
  freeze(quiet = false) {
    if (!this.active) return false;
    if (this.coldSnap > 0) return false;
    const frozen = this.drones.filter((d) => d.freeze());
    if (!frozen.length) {
      if (!quiet) this.toast?.('Nothing is wet enough to freeze. Spray them first: they spark when they are ready.');
      return false;
    }
    for (const d of frozen) d.floorY = this._groundBelow(d.position);
    this.coldSnap = COLD_SNAP_COOLDOWN;
    this.idleTime = 0;
    this.audio.crackle();
    for (const d of frozen) for (let k = 0; k < 6; k++) this.fx.mist(d.position, 0.2, 40);
    return true;
  }

  _hurt(kind, from) {
    this.onHurt?.(kind, from);
    this.audio.hit();
    const key = kind === 'direct' ? 'hitDirect' : 'hitGraze';
    if (!this._said[key] || Math.random() < 0.3) {
      this._said[key] = true;
      this.say?.(key, true);
    }
  }

  _shatter(at, floorY) {
    this.fx.shatter(at, 70);
    this.fx.filaments(at);
    this.remains.add(at, floorY ?? this._floorY);
    this.audio.shatter();
  }

  // a remark that waits until nobody is talking (it is dropped if it waits too long to still make sense)
  _queue(talk, wait = 8) {
    this._pending.push({ talk, until: this._time + wait });
  }

  // ------------------------------------------------------------------ per frame
  // ctx: { dt, feet (Vector3), head (Vector3), playing (bool), canWake (bool) }
  update(ctx) {
    const { dt, head, playing } = ctx;
    this._time += dt;
    this.coldSnap = Math.max(0, this.coldSnap - dt);
    while (this._pending.length && this._pending[0].until < this._time) this._pending.shift();
    if (this._pending.length && !this.isTalking?.()) this.say?.(this._pending.shift().talk);
    if (this.freezeHeld && this.coldSnap === 0) this.freeze(true);

    if ((this.state === 'idle' || this.state === 'hunt') && playing && ctx.canWake) {
      this._v.copy(ctx.feet).setY(0);
      if (this._v.distanceTo(this._w.copy(this.centre).setY(0)) < WAKE_RADIUS) this._wake();
    }

    this._updateNozzle(ctx);
    this._updateDropped(dt);
    this.remains.update(dt);

    if (this.state === 'fight') {
      // more drones join until this wave's are all out, never more than four up at once
      if (this.queue > 0 && this.alive < MAX_ALIVE) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          this._spawn();
          this.spawnTimer = rand(0.6, 1.4);
        }
      }
      this._attacks(dt, head, playing);
      if (playing && !this.holding) {
        this.idleTime += dt;
        if (this.idleTime > IDLE_SECONDS && !this._said.idle) {
          this._said.idle = true;
          this._queue('gardenIdle');
        }
      }
      // the wave is over when nothing is left to come or flying
      if (this.queue === 0 && !this.drones.some((d) => d.alive)) {
        this.drones.length = 0;
        if (this.wave < WAVES.length - 1) {
          this.state = 'rest';
          this.restTimer = REST_SECONDS;
        } else {
          this.state = 'done';
          this._pending.length = 0;
          this._dropPipe();
          Promise.resolve(this.say?.('gardenWin')).then(() => this.onCleared?.());
        }
      }
    } else if (this.state === 'hunt') {
      this._attacks(dt, head, playing);
    } else if (this.state === 'rest') {
      this.restTimer -= dt;
      if (this.restTimer <= 0) {
        this.state = 'fight';
        this._startWave(this.wave + 1);
      }
    }

    // which way he faces (flat), so the drones keep in front of him and to the sides
    this.camera.getWorldDirection(this._facing).setY(0);
    if (this._facing.lengthSq() < 1e-4) this._facing.set(0, 0, -1);
    this._facing.normalize();
    for (const d of this.drones) {
      if (!d.alive) continue;
      // wet from the water droplets that reach it (anything the stream visibly hits)
      if (d.state !== 'frozen') {
        const drops = this.fx.waterHits(d.position, DRONE_HIT_RADIUS);
        if (drops) d.soak(drops * SOAK_PER_DROP);
      }
      d.update({
        dt, player: head, facing: this._facing, centre: this.centre, leash: LEASH,
        onHit: (kind) => this._hurt(kind, d.position),
        onShatter: (at) => this._shatter(at, d.floorY),
        onSpark: (at) => { this.fx.sparks(at, 4); if (Math.random() < 0.3) this.audio.crackle(); },
        onDrip: (at) => this.fx.drip(at)
      });
    }
    this.fx.update(dt);
  }

  // One attacker at a time: when the last has finished and the gap is up, a drone that can see him
  // locks on. Slowly until he has the pipe, then the fight's pace.
  _attacks(dt, head, playing) {
    const busy = this.drones.some((d) => d.state === 'telegraph' || d.state === 'dive');
    this.attackTimer -= dt;
    if (busy || this.attackTimer > 0 || !playing) return;
    const ready = this.drones.filter((d) => d.state === 'circle' && this._sees(d, head));
    if (!ready.length) return;
    ready[Math.floor(Math.random() * ready.length)].attack(head);
    const gap = this.holding ? ATTACK_GAP : HUNT_GAP;
    this.attackTimer = rand(gap[0], gap[1]);
  }

  // line of sight from the drone to Voss (columns and the beds hide him)
  _sees(d, head) {
    this._v.subVectors(head, d.position);
    const dist = this._v.length();
    this._v.divideScalar(dist);
    const hit = this.physics.castRay(d.position, this._v, dist);
    return hit === null || hit > dist - 0.5;
  }

  // the nozzle in his hands (or on its hook), the jet, and the hose between the reel and the nozzle
  _updateNozzle(ctx) {
    const cam = this.camera;
    if (!this.holding) {
      this.audio.hiss(false);
      return;
    }
    cam.getWorldDirection(this._dir);
    this._right.crossVectors(this._dir, this._up).normalize();
    // held low at his right side, pointing where he looks (works in either camera view)
    const fromCam = cam.position.distanceTo(ctx.head) < 0.5;
    this._v.copy(fromCam ? cam.position : ctx.head)
      .addScaledVector(this._right, 0.28).addScaledVector(this._up, -0.32).addScaledVector(this._dir, fromCam ? 0.55 : 0.45);
    this.nozzle.position.copy(this._v);
    this.nozzle.lookAt(this._w.copy(this._v).add(this._dir));
    this._tip.copy(this._v).addScaledVector(this._dir, 0.48);
    this._holdNozzle(ctx.player);

    const spraying = this.spraying && ctx.playing;
    this.audio.hiss(spraying);
    if (spraying) {
      this.fx.water(this._tip, this._dir, ctx.dt);
      // (the droplets soak whatever they reach, in update; this covers a drone right in front of
      // the nozzle, before the stream has spread)
      for (const d of this.drones) {
        if (!d.alive || d.state === 'frozen') continue;
        this._w.subVectors(d.position, this._tip);
        const along = this._w.dot(this._dir);
        if (along < 0 || along > CLOSE_JET) continue;
        if (this._w.addScaledVector(this._dir, -along).length() < 0.9) d.soak(SOAK_PER_SECOND * ctx.dt);
      }
      const hit = this.physics.castRay(this._tip, this._dir, JET_RANGE);
      if (hit !== null && Math.random() < 0.5) this.fx.mist(this._w.copy(this._tip).addScaledVector(this._dir, hit), ctx.dt, 20);
    }
    this._updateHose(ctx.dt);
  }

  // His hands on the nozzle: the right round the grip, as on a pistol (palm against its right side,
  // fingers round its front), the left over the back of the body, by the hose, fingers across the
  // top. Worked out in the nozzle's own frame (+z where it points, +x his left, +y its top)
  _holdNozzle(player) {
    if (!player?.hold) return;
    const g = this._grips || (this._grips = {
      right: { wrist: new THREE.Vector3(), fingers: new THREE.Vector3(), palm: new THREE.Vector3(), pole: new THREE.Vector3(),
        curl: [1.3, 1.4, 0.9], thumb: [0.35, 0.5, 0.4] },
      left: { wrist: new THREE.Vector3(), fingers: new THREE.Vector3(), palm: new THREE.Vector3(), pole: new THREE.Vector3(),
        curl: [0.9, 1.0, 0.7], thumb: [0.3, 0.3, 0.2] }
    });
    const n = this.nozzle;
    n.updateMatrixWorld();
    const q = n.quaternion;
    const at = (v, x, y, z) => n.localToWorld(v.set(x, y, z));
    const dirOf = (v, x, y, z) => v.set(x, y, z).applyQuaternion(q).normalize();
    // the grip leans its top forward (GRIP_TILT); the hand points forward across it
    const r = g.right;
    at(r.wrist, -0.04, -0.14 + 0.06 * Math.sin(GRIP_TILT), -0.08 - 0.06 * Math.cos(GRIP_TILT));
    dirOf(r.fingers, 0, -Math.sin(GRIP_TILT), Math.cos(GRIP_TILT));
    dirOf(r.palm, 1, 0, 0);
    r.pole.copy(this._right).multiplyScalar(0.6).addScaledVector(this._up, -1).addScaledVector(this._dir, -0.3);
    const l = g.left;
    at(l.wrist, 0.06, 0.11, -0.24);
    dirOf(l.fingers, -1, 0, 0);
    dirOf(l.palm, 0, -1, 0);
    l.pole.copy(this._right).multiplyScalar(-0.6).addScaledVector(this._up, -1).addScaledVector(this._dir, -0.3);
    player.hold(r, l);
  }

  _updateHose(dt) {
    const pts = this.points, prev = this.prev, n = pts.length;
    const end = this._w.copy(this.nozzle.position).addScaledVector(this._dir, -0.3);
    const span = this.reelOutlet.distanceTo(end);
    const rest = (span * 1.12 + 0.6) / (n - 1);
    for (let i = 1; i < n - 1; i++) {
      const p = pts[i];
      const vx = (p.x - prev[i].x) * 0.96, vy = (p.y - prev[i].y) * 0.96, vz = (p.z - prev[i].z) * 0.96;
      prev[i].copy(p);
      p.x += vx;
      p.y += vy - 9.8 * dt * dt;
      p.z += vz;
    }
    pts[0].copy(this.reelOutlet);
    pts[n - 1].copy(end);
    for (let k = 0; k < 6; k++) {
      for (let i = 0; i < n - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        this._v.subVectors(b, a);
        const d = this._v.length() || 1e-4;
        const diff = (d - rest) / d * 0.5;
        if (i > 0) a.addScaledVector(this._v, diff);
        if (i + 1 < n - 1) b.addScaledVector(this._v, -diff);
      }
      const floor = this._floorY + 0.075;
      for (let i = 1; i < n - 1; i++) if (pts[i].y < floor) pts[i].y = floor;   // it lies on the floor
    }
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      this._v.subVectors(b, a);
      const len = this._v.length();
      this._q.setFromUnitVectors(this._up, this._v.divideScalar(len || 1));
      this._s.set(1, len, 1);
      this._m.compose(this._w.addVectors(a, b).multiplyScalar(0.5), this._q, this._s);
      this.hoseMesh.setMatrixAt(i, this._m);
    }
    this.hoseMesh.instanceMatrix.needsUpdate = true;
  }

  // The fight skipped (the debug key set gardenCleared): the drones go and he lets go of the pipe
  end() {
    if (this.state === 'done') return;
    for (const d of this.drones) if (d.alive) d.remove();
    this.drones.length = 0;
    this._teaser?.d.remove();
    this._teaser = null;
    this.state = 'done';
    this._pending.length = 0;
    if (this.holding) this._dropPipe();
  }

  // The fight is over: he lets go, and the nozzle drops to the floor and settles with its hose
  _dropPipe() {
    this.holding = false;
    this.spraying = false;
    this.freezeHeld = false;
    this.audio.hiss(false);
    this._fall = { v: 0, down: false, settle: 0, floor: this._groundBelow(this.nozzle.position) };
  }

  _updateDropped(dt) {
    const f = this._fall;
    if (!f) return;
    const n = this.nozzle;
    if (!f.down) {
      // fall, tipping over onto its side (grip out) as it goes
      f.v += 9.8 * dt;
      n.position.y -= f.v * dt;
      this._dir.set(0, 0, 1).applyQuaternion(n.quaternion).setY(0);
      if (this._dir.lengthSq() < 1e-4) this._dir.set(1, 0, 0);
      this._q.copy(n.quaternion);
      n.lookAt(this._v.copy(n.position).add(this._dir.normalize()));
      n.rotateZ(Math.PI / 2);
      this._q2.copy(n.quaternion);
      n.quaternion.copy(this._q).slerp(this._q2, Math.min(1, dt * 6));
      if (n.position.y <= f.floor + 0.09) {
        n.position.y = f.floor + 0.09;
        n.quaternion.copy(this._q2);
        f.down = true;
      }
    } else {
      f.settle += dt;
    }
    this._dir.set(0, 0, 1).applyQuaternion(n.quaternion);
    this._updateHose(dt);
    if (f.settle > 4) this._fall = null;     // at rest: the hose stops being simulated
  }

  // A drone glimpsed far off across the hall, before the fight (scene 2.2's tease)
  tease(from, to, seconds = 4) {
    const d = new Drone(this.scene, from);
    d.state = 'scripted';
    this._teaser = { d, from: from.clone(), to: to.clone(), t: 0, seconds };
  }

  updateTease(dt) {
    const t = this._teaser;
    if (!t) return;
    t.t += dt;
    const k = Math.min(1, t.t / t.seconds);
    t.d.position.lerpVectors(t.from, t.to, k);
    t.d.position.y += Math.sin(t.t * 2) * 0.1;
    t.d.group.rotation.y = Math.atan2(t.to.x - t.from.x, t.to.z - t.from.z);
    for (const b of t.d.blades) b.rotation.y += dt * 38;
    t.d._twitch();
    t.d.time += dt;
    if (k >= 1) {
      this._teaser = null;
      if (this.state === 'done') {
        t.d.remove();
        return;
      }
      // it has seen him: it turns and hunts him on his way to the hatch, and joins the first wave
      t.d.state = 'circle';
      this.drones.push(t.d);
      if (this.state === 'idle') {
        this.state = 'hunt';
        this.attackTimer = 2.5;
      }
    }
  }
}

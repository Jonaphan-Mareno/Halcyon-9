import * as THREE from 'three';
import { createGLTFLoader } from '../core/loaders.js';
import { deckMaterial } from './DeckMaterials.js';

// The drowned works (Level 3): what the kraken's cave became. Behind the cliff, past the cave's
// mouth, the station's builders dug a great hall into the rock to reach the uplink relay and left
// their construction site to the sea; the kraken lives in it. Below it, down the excavation shaft
// and a tunnel half full of sand, is the buried relay room; in the cave's mouth, the works' lit
// entrance. Modelled in Blender/scripts/build_l3_works.py (its plan, MAP, is repeated here).
//
// This loads it (the outside model's old cave and relay pod are hidden: this replaces them), adds
// its collision, and moves what moves in it (the Trench and the kraken say when):
//   - the roll-up shutters (rolled up and down), the gates the kraken tears off, the wall panel it
//     bursts through, the shaft's cover
//   - the clearing's floodlights (dark until the first showdown, swinging in the finale) and the
//     pieces that come down in the finale: each on its hinge, shaking and groaning first, then
//     falling (what lands on him hurts), then lying where it fell, solid
//   - the air stations: near one, his tanks fill
//   - what is drawn: from deep in the hall nothing outside can be seen (the cliff is in the way),
//     and from out in the canyon nothing of the hall, so whichever he is not near is hidden
// It also keeps him below the open water over the maze's decks (that is the kraken's).

const MODEL = './assets/models/l3-works.glb';
// the plan, as the Blender script lays it out (world metres; three's z is the Blender's -y)
export const PLAN = { X0: 28.7, CELL: 5, COLS: 18, ROWS: 13, Y0: -10, CY: 22.5, F: -40.3, ROOF: 7.5, TALL: 17, CAP: 16 };
const MAP = [
  '##################',
  '##################',
  '###OO...##########',
  '###OO##.-----#####',
  'EEE#.hh#-----#####',
  'EEE#.w.g-----XXXX#',
  'EEE###p#-----XXsXk',
  'EEE###.#-----XXXX#',
  'EEE##..#-----#####',
  '#.#hh#.#-----#####',
  '#.#hh#.###########',
  '#..gg..###########',
  '##################'
];
// how the materials glow in here (the work lamps matter: it is dark)
const GLOW = { l3_lamp: 1.1, l3_alarm: 0.9, l3_screen: 0.9, l3_o2: 1.0, l3_flood: 0.0 };
const FLOOD_ON = 1.5;
const SHUTTER_TIME = 1.6;
// the finale's pieces: which way each falls (toward the clearing's middle, unless given), how long
// it shakes first, how far round it goes, how wide it is where it lands, how long it is
const FALLS = {
  FALL_Gantry: { axis: new THREE.Vector3(1, 0, 0), angle: -0.29, width: 1.6, len: 34.6, dir: new THREE.Vector3(0, 0, -1), warn: 1.6 },
  FALL_Crane: { angle: 1.42, width: 1.4, len: 15.5, warn: 1.5 },
  FALL_Tower: { angle: 1.45, width: 1.4, len: 13.5, warn: 1.4 },
  FALL_Scaff_0: { angle: 1.35, width: 1.4, len: 9, dir: new THREE.Vector3(0, 0, -1), warn: 1.2 },
  FALL_Scaff_1: { angle: 1.35, width: 1.4, len: 9, dir: new THREE.Vector3(0, 0, -1), warn: 1.2 },
  FALL_Scaff_2: { angle: 1.35, width: 1.4, len: 9, dir: new THREE.Vector3(0, 0, -1), warn: 1.2 }
};
const FALL_DAMAGE = 30;
const AIR_RADIUS = 2.6;
const UP = new THREE.Vector3(0, 1, 0);

export class Works {
  // sea: the SeaScene (its group and its outside model), physics: the level's
  constructor(sea, physics) {
    this.sea = sea;
    this.physics = physics;
    this.group = new THREE.Group();
    this.group.name = 'Works';
    this.inner = new THREE.Group();        // the hall and everything under it
    this.outer = new THREE.Group();        // the throat and the relay's hatch out on the trench floor
    this.group.add(this.inner, this.outer);
    this.pts = {};
    this.routes = {};
    this.doors = {};
    this.falls = {};
    this.air = [];
    this.floodLevel = 0;
    this.floodTarget = 0;
    this.time = 0;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this.ready = this._load();
  }

  async _load() {
    this._hideOldCave();
    const gltf = await createGLTFLoader().loadAsync(MODEL);
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    // the collision: static, added once
    for (const node of [...model.children]) {
      if (node.name.startsWith('COL_')) {
        this.physics.addStaticObject(node);
        model.remove(node);
      }
    }
    // the textured surfaces (the sea's versions), the glowing ones toned for the dark
    const cache = new Map();
    const swap = (m, rock) => {
      const key = m.name + (rock ? ':rock' : '');
      if (!cache.has(key)) {
        let out = deckMaterial(m.name, { sea: true });
        if (out && rock) out.side = THREE.DoubleSide;
        if (!out) {
          out = m;
          if (m.emissive && GLOW[m.name] !== undefined) m.emissiveIntensity *= GLOW[m.name];
          if (m.name === 'l3_flood') {
            this.floodMat = m;
            this._floodBase = m.emissiveIntensity / Math.max(GLOW.l3_flood, 1e-6) || 4;
            m.emissiveIntensity = 0;
          }
        }
        cache.set(key, out);
      }
      return cache.get(key);
    };
    model.traverse((o) => {
      if (!o.isMesh) return;
      const rock = o.name.startsWith('TERRAIN_') || o.name.startsWith('W_Tunnel');
      o.material = Array.isArray(o.material) ? o.material.map((m) => swap(m, rock)) : swap(o.material, rock);
    });
    if (this.floodMat) this.floodMat.emissiveIntensity = 0;
    // the points
    model.traverse((o) => {
      if (o.name.startsWith('PT_') || o.name.startsWith('WL_')) this.pts[o.name] = o.getWorldPosition(new THREE.Vector3());
    });
    for (const [name, p] of Object.entries(this.pts)) {
      const m = /^PT_H(\d)_(\d+)(?:_(\w+))?$/.exec(name);
      if (!m) continue;
      (this.routes[m[1]] ||= [])[+m[2]] = { p, event: m[3] || null, step: +m[2] };
    }
    for (let k = 0; this.pts['PT_O2_' + k]; k++) this.air.push(this.pts['PT_O2_' + k]);
    // the things that move: doors, gates, the panel, the cover; the finale's pieces
    for (const node of model.children) {
      const n = node.name;
      if (n.startsWith('GATE_') || n.startsWith('BURST_')) {
        this.doors[n] = { obj: node, base: node.position.clone(), quat: node.quaternion.clone(), collider: null, open: 0, target: 0, kind: n.startsWith('GATE_Shutter') ? 'shutter' : 'leaf' };
      } else if (FALLS[n]) {
        this.falls[n] = { obj: node, base: node.quaternion.clone(), state: 'still', t: 0, ...FALLS[n], collider: null, stand: null };
      }
    }
    for (const d of Object.values(this.doors)) {
      if (d.kind === 'shutter') {
        d.obj.updateMatrixWorld(true);
        d.box = new THREE.Box3().setFromObject(d.obj);
      }
      this._block(d, true);
    }
    // (the yard's shutter into the clearing starts rolled up: it comes down behind him)
    this.setShutter('W1', true, true);
    // the finale's pieces are solid standing, too (until they fall)
    for (const f of Object.values(this.falls)) {
      f.stand = { obj: f.obj, collider: null };
      this._block(f.stand, true);
    }
    // the throat and the hatch are seen from out in the canyon; the rest only from in here
    for (const node of [...model.children]) {
      const outside = /^(TERRAIN_WorksThroat|W_Gate)/.test(node.name);
      (outside ? this.outer : this.inner).add(node);
    }
    this.model = model;
    this.sea.group.add(this.group);
  }

  // The outside model's own cave and relay pod: this replaces them (their collision is never added:
  // SeaScene asks skipCollider), and the boulders that lay on the old lair's floor go
  _hideOldCave() {
    const m = this.sea.model;
    for (const name of ['TERRAIN_Cave', 'L3_CaveGlow', 'L3_Bones', 'L3_Relay', 'L3_RelayShell', 'GATE_RelayDoor', 'GATE_RelayHatch']) {
      const o = m.getObjectByName(name);
      if (o) o.removeFromParent();
    }
    const rocks = m.getObjectByName('TERRAIN_Rocks');
    rocks?.traverse((o) => { if (o.isMesh) cutTriangles(o, (c) => c.x > 23 && c.y < -20); });
  }

  static skipCollider(name) {
    return name === 'COL_Cave' || name === 'COL_Relay';
  }

  static get PLAN() { return PLAN; }

  // ------------------------------------------------------------------ where things are
  // the plan's cell under a point: its letter (# outside the plan)
  cellAt(p) {
    const c = Math.floor((p.x - PLAN.X0) / PLAN.CELL), r = Math.floor((-p.z - PLAN.Y0) / PLAN.CELL);
    if (c < 0 || c >= PLAN.COLS || r < 0 || r >= PLAN.ROWS) return '#';
    return MAP[PLAN.ROWS - 1 - r][c];
  }

  // in the hall (between its walls, at its height)
  inHall(p) {
    return p.x > PLAN.X0 && p.x < PLAN.X0 + 90 && p.z > -(PLAN.CY + 34) && p.z < -(PLAN.CY - 34) && p.y > PLAN.F - 2;
  }

  // in the clearing (the arena)
  inClearing(p, pad = 0) {
    const x0 = PLAN.X0 + 40, x1 = PLAN.X0 + 65, z0 = -(PLAN.Y0 + 50), z1 = -(PLAN.Y0 + 15);
    return p.x > x0 - pad && p.x < x1 + pad && p.z > z0 - pad && p.z < z1 + pad && p.y > PLAN.F - 2;
  }

  // down the shaft, in the tunnel or the relay room
  below(p) {
    return p.y < PLAN.F - 1.5 && p.x > PLAN.X0 + 65;
  }

  // inside the way down: the shaft, the tunnel or the room (outside them, under the works, is only
  // empty water: the safety net puts him back)
  inWayDown(p) {
    const P = this.pts, top = P.PT_ShaftTop, bot = P.PT_ShaftBottom, room = P.PT_RelayInside, door = P.PT_RoomDoor;
    if (!top || !bot || !room || !door) return true;
    const shaft = (Math.hypot(p.x - top.x, p.z - top.z) < 2.5 && p.y > bot.y - 3 && p.y < top.y + 3)
      || (Math.abs(p.x - top.x) < 2.7 && Math.abs(p.z - top.z) < 2.7 && p.y > bot.y - 3 && p.y < bot.y + 3.5);
    const tunnel = Math.abs(p.x - top.x) < 2.3 && p.z > top.z - 1 && p.z < door.z + 1.5 && p.y > room.y - 1.5 && p.y < bot.y + 3;
    const inRoom = Math.abs(p.x - room.x) < 5.4 && Math.abs(p.z - room.z) < 5.4 && p.y > room.y - 1.5 && p.y < room.y + 5;
    const beyond = P.PT_ContainmentBeyond;
    const vestibule = beyond && Math.abs(p.x - beyond.x) < 1.4 && Math.abs(p.z - beyond.z) < 2.2 && p.y > room.y - 1.5 && p.y < room.y + 5;
    return shaft || tunnel || inRoom || vestibule;
  }

  // the clearing's middle, its half sizes (x, z)
  get clearing() {
    return { c: this.pts.PT_Clear, rx: 12.5, rz: 17.5 };
  }

  nearestAir(p) {
    let best = null, bd = Infinity;
    for (const a of this.air) {
      const d = a.distanceTo(p);
      if (d < bd) { bd = d; best = a; }
    }
    return { at: best, dist: bd };
  }

  // is he at an air station (his tanks fill)
  atAir(p) {
    const chest = this._v.set(p.x, p.y + 1.1, p.z);
    for (const a of this.air) if (a.distanceTo(chest) < AIR_RADIUS) return true;
    const relay = this.pts.PT_AirRefill;
    return !!relay && relay.distanceTo(chest) < AIR_RADIUS;
  }

  // ------------------------------------------------------------------ doors
  // a box of collision round a door (or leaf) as it stands shut
  _block(d, on) {
    const world = this.physics.world;
    if (on && !d.collider) {
      d.obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(d.obj);
      const c = box.getCenter(new THREE.Vector3()), h = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const R = this.physics.RAPIER;
      d.collider = world.createCollider(R.ColliderDesc.cuboid(Math.max(h.x, 0.12), Math.max(h.y, 0.12), Math.max(h.z, 0.12)).setTranslation(c.x, c.y, c.z));
    } else if (!on && d.collider) {
      world.removeCollider(d.collider, true);
      d.collider = null;
    }
  }

  // roll a shutter up (open) or down; instant: no rolling
  setShutter(name, open, instant = false) {
    const d = this.doors['GATE_Shutter_' + name];
    if (!d) return;
    d.target = open ? 1 : 0;
    if (instant) d.open = d.target;
    this._placeShutter(d);
    this._block(d, !open);
    if (!instant) this.onSound?.(open ? 'shutterUp' : 'shutterDown', this.doorPoint(name));
  }

  _placeShutter(d) {
    // (it rolls up into its housing: squashed up toward its top)
    const top = d.box.max.y, s = 1 - 0.96 * d.open;
    d.obj.scale.y = s;
    d.obj.position.y = d.base.y + top * (1 - s);
  }

  doorPoint(name) {
    return this.pts['PT_Door_' + name] || this.pts.PT_Clear;
  }

  // the kraken tears a gate's two leaves away (they tumble off through the water and settle);
  // from: where the blow came from
  smashGate(name, from) {
    for (const side of ['A', 'B']) this._fling(this.doors['GATE_Gate_' + name + side], from, 7);
    this.onSound?.('gateSmash', this.doorPoint(name));
  }

  // the panel it bursts through, knocked flying into the corridor
  burstPanel(from) {
    this._fling(this.doors.BURST_0, from, 9);
    this.onSound?.('wallBurst', this.pts.PT_BurstPanel_0);
  }

  _fling(d, from, speed) {
    if (!d || d.flying || d.gone) return;
    this._block(d, false);
    d.obj.updateMatrixWorld(true);
    const c = new THREE.Box3().setFromObject(d.obj).getCenter(new THREE.Vector3());
    const away = c.clone().sub(from || c).setY(0);
    if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
    away.normalize();
    d.flying = { vel: away.multiplyScalar(speed).add(new THREE.Vector3(0, 2.5, 0)), spin: new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4), t: 0, centre: c };
  }

  // the shaft's cover swings open (both leaves up on their hinges)
  openShaft() {
    for (const side of ['A', 'B']) {
      const d = this.doors['GATE_ShaftCover' + side];
      if (!d) continue;
      d.target = 1;
      this._block(d, false);
    }
    this.onSound?.('shaftOpen', this.pts.PT_ShaftTop);
  }

  // the containment pressure seal slides the buried relay's back hatch into its wall pocket
  openRelayHatch() {
    const d = this.doors.GATE_RelayHatch;
    if (!d || d.target === 1) return false;
    d.target = 1;
    this.onSound?.('hatchOpen', this.pts.PT_RelayHatch);
    return true;
  }

  // ------------------------------------------------------------------ the clearing's lights
  floods(on) {
    this.floodTarget = on ? 1 : 0;
    this._floodFlicker = on ? 1.2 : 0;
    if (on) this.onSound?.('floodOn', this.pts.PT_Clear);
  }

  // ------------------------------------------------------------------ the finale's pieces
  // one comes down: it shakes and groans, then falls (now: no warning); returns false if it
  // already has
  drop(name, now = false) {
    const f = this.falls[name];
    if (!f || f.state !== 'still') return false;
    f.state = 'warn';
    f.t = now ? f.warn : 0;
    const pivot = f.obj.position;
    const dir = f.dir ? f.dir.clone() : this._v.subVectors(this.pts.PT_Clear, pivot).setY(0).normalize().clone();
    f.fallDir = dir;
    f.axisW = f.axis ? f.axis.clone() : new THREE.Vector3().crossVectors(UP, dir).normalize();
    this.onSound?.('groan', this.fallTip(f, 0.5));
    return true;
  }

  // a point along a piece (0 its hinge, 1 its far end), as it lies now (the gantry lies along its
  // length from its hinge; the rest stand up from theirs)
  fallTip(f, t = 1) {
    const rest = f.axis ? f.dir : UP;
    const q = f.obj.quaternion.clone().multiply(f.base.clone().invert());
    return f.obj.position.clone().addScaledVector(rest.clone().applyQuaternion(q), f.len * t);
  }

  get pieces() {
    return Object.keys(this.falls);
  }

  // ------------------------------------------------------------------ every frame
  // p: where he is; hurt(damage, from): something fell on him
  update(dt, p, hurt) {
    this.time += dt;
    this.shake = Math.max(0, (this.shake || 0) - dt * 1.5);
    // shutters roll, cover leaves swing, what was smashed tumbles and settles
    for (const [name, d] of Object.entries(this.doors)) {
      if (d.kind === 'shutter' && d.open !== d.target) {
        d.open = THREE.MathUtils.clamp(d.open + Math.sign(d.target - d.open) * dt / SHUTTER_TIME, 0, 1);
        this._placeShutter(d);
      } else if (name.startsWith('GATE_ShaftCover') && d.open !== d.target) {
        d.open = Math.min(1, d.open + dt / 2.2);
        const e = d.open * d.open * (3 - 2 * d.open);
        const sign = name.endsWith('A') ? -1 : 1;      // (each leaf up and outward)
        d.obj.quaternion.copy(d.quat).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sign * e * 1.9));
      } else if (name === 'GATE_RelayHatch' && d.open !== d.target) {
        d.open = Math.min(1, d.open + dt / 2.0);
        const e = d.open * d.open * (3 - 2 * d.open);
        d.obj.position.x = d.base.x - e * 2.15;
        // Keep the passage blocked until the leaf is fully inside its wall pocket.
        if (d.open === 1) this._block(d, false);
      }
      if (d.flying) this._tumble(d, dt);
    }
    // the floodlights: on with a stutter; in the finale they swing (the Trench moves their light)
    const flick = this._floodFlicker > 0 ? (Math.random() < 0.35 ? 0.1 : 1) : 1;
    this._floodFlicker = Math.max(0, (this._floodFlicker || 0) - dt);
    this.floodLevel += (this.floodTarget - this.floodLevel) * (1 - Math.exp(-6 * dt));
    if (this.floodMat) this.floodMat.emissiveIntensity = this._floodBase * 0.35 * FLOOD_ON * this.floodLevel * flick;
    this.floodFlick = flick;
    for (const [name, f] of Object.entries(this.falls)) {
      f.name = name;
      this._fallStep(f, dt, p, hurt);
    }
    // what is drawn: the hall hidden from out in the canyon, the outside hidden from deep in here
    const deep = p.x > PLAN.X0 + 12 || this.below(p);
    this.inner.visible = p.x > 12 || p.y < PLAN.F - 3;
    this.sea.setOutsideShown?.(!deep);
  }

  _tumble(d, dt) {
    const f = d.flying;
    f.t += dt;
    f.vel.multiplyScalar(Math.exp(-1.2 * dt));
    f.vel.y -= 3.0 * dt;
    d.obj.position.addScaledVector(f.vel, dt);
    d.obj.rotation.x += f.spin.x * dt * Math.exp(-f.t);
    d.obj.rotation.y += f.spin.y * dt * Math.exp(-f.t);
    d.obj.rotation.z += f.spin.z * dt * Math.exp(-f.t);
    // (settled on the floor)
    if (d.obj.position.y < PLAN.F - 0.3) {
      d.obj.position.y = PLAN.F - 0.3;
      f.vel.set(f.vel.x * 0.5, 0, f.vel.z * 0.5);
    }
    if (f.t > 2.5) {
      d.flying = null;
      d.gone = true;
    }
  }

  _fallStep(f, dt, p, hurt) {
    if (f.state === 'warn') {
      f.t += dt;
      // shaking on its hinge, groaning
      const s = 0.02 * Math.min(1, f.t / f.warn);
      f.obj.quaternion.copy(f.base).premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * s, 0, (Math.random() - 0.5) * s)));
      if (f.t >= f.warn) {
        if (f.stand) this._block(f.stand, false);
        f.state = 'fall';
        f.t = 0;
        f.ang = 0;
        f.speed = 0;
        this.onSound?.('creak', this.fallTip(f, 0.5));
      }
    } else if (f.state === 'fall') {
      // it tips, faster and faster, and lands with a bounce
      f.speed += Math.sign(f.angle) * 2.6 * dt;
      f.ang += f.speed * dt;
      let done = false;
      if (Math.abs(f.ang) >= Math.abs(f.angle)) {
        f.ang = f.angle;
        done = true;
      }
      f.obj.quaternion.copy(f.base).premultiply(new THREE.Quaternion().setFromAxisAngle(f.axisW, f.ang));
      if (done) {
        f.state = 'down';
        this.onSound?.('crash', this.fallTip(f, 0.6));
        this.shake = 1.2;
        // on him?
        if (p) {
          const a = f.obj.position, b = this.fallTip(f, 1);
          const chest = this._w.set(p.x, p.y + 1.1, p.z);
          if (distToSegment(chest, a, b) < f.width + 0.9) hurt?.(FALL_DAMAGE, b.clone().lerp(a, 0.5));
        }
        this._lieSolid(f);
      }
    }
  }

  // where it fell, it is in the way (a long box along it)
  _lieSolid(f) {
    const a = f.obj.position.clone(), b = this.fallTip(f, 1);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const d = b.clone().sub(a);
    const L = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize());
    const R = this.physics.RAPIER;
    f.collider = this.physics.world.createCollider(R.ColliderDesc.cuboid(L / 2, 0.6, f.width / 2)
      .setTranslation(mid.x, Math.max(mid.y, PLAN.F + 0.6), mid.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
  }

  // keeps him below the open water over the decks (and out of the kraken's way up there)
  limit(pos, vel) {
    if (!this.inHall(pos)) return;
    const top = PLAN.F + PLAN.CAP - 1.8;
    if (pos.y > top) {
      if (vel.y > 0) vel.y = 0;
      vel.y -= (pos.y - top) * 4;
    }
  }

  dispose() {
    for (const d of Object.values(this.doors)) this._block(d, false);
    for (const f of Object.values(this.falls)) {
      if (f.collider) this.physics.world.removeCollider(f.collider, true);
      if (f.stand) this._block(f.stand, false);
    }
    this.group.removeFromParent();
  }
}

function distToSegment(p, a, b) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const t = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(p, a).dot(ab) / Math.max(ab.lengthSq(), 1e-6), 0, 1);
  return a.clone().addScaledVector(ab, t).distanceTo(p);
}

// Takes out a mesh's triangles whose middle (in the world) keep(c) says to (its index is rebuilt)
export function cutTriangles(mesh, cut) {
  const g = mesh.geometry;
  mesh.updateMatrixWorld(true);
  const pos = g.attributes.position;
  const idx = g.index ? g.index.array : null;
  const n = idx ? idx.length : pos.count;
  const keep = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    const i0 = idx ? idx[i] : i, i1 = idx ? idx[i + 1] : i + 1, i2 = idx ? idx[i + 2] : i + 2;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    const m = a.add(b).add(c).multiplyScalar(1 / 3).applyMatrix4(mesh.matrixWorld);
    if (!cut(m)) keep.push(i0, i1, i2);
  }
  g.setIndex(keep);
  g.computeBoundingSphere();
}

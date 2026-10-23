import * as THREE from 'three';
import { Kraken, MOUTH } from './Kraken.js';
import { deckMaterial } from './DeckMaterials.js';

// The kraken: Level 3's final boss (the creature itself is Kraken.js).
//
//   lurk     in the front of its lair, five tentacles stretched out of the cave and along the floor
//            to the relay station and wrapped round its lower half, the door with it. Following
//            them back is how Voss finds it
//   fight    (he comes into its lair) it roars, tears its tentacles off the station and comes for
//            him, swimming after him: round its hall, and out of the cave after him if he backs off
//            or runs (through its throat, over the trench floor; not into the relay). Four hits in
//            the mouth beat it, and it
//            gets worse as it is hurt (three phases):
//              phase 1  SWEEP   an arm winds up, its tip glowing hot, and sweeps through where he is
//                       PUNCH   an arm coils back and jabs straight at him, fast. Dodged, it drives
//                               into the rock and sticks there, glowing: shoot it and the kraken
//                               shrieks, stunned, its mouth hanging open
//                       SLAM    a long tentacle rises over him and slams down
//              phase 2  THROW   a long tentacle tears a boulder off the floor and hurls it at him
//                       LUNGE   the whole body surges at him and stops with its face right in his,
//                               jaws snapping (it bites if he stays)
//              phase 3  INK     it clouds the water black round him and strikes out of the dark;
//                               everything comes faster
//            after a blow it screams, its mouth lit from inside (open to the harpoon for a moment);
//            stunned or lunging, the mouth is wide open too. A tap of Shift dashes him clear (the
//            Trench handles the dash; a hit during one misses)
//   beaten   it shrieks and sinks away into the crack at the back of its lair: the door is free
//   wait     (he was restored from backup) back where it lurks, holding the station again
// Positions are world metres; the kraken's own space is its model's units (Kraken.toLocal).

const SCALE = 1.6;                    // the model's units to metres: the body ~8 m across, each tentacle ~19 m
export const WOUNDS = 4;              // spears in its mouth to beat it
const OPEN = [2.4, 2.0, 1.7];         // seconds its mouth stays open after a blow (by phase)
const SPEED = [1, 1.15, 1.4];         // how much faster its attacks come (by phase)
const GAP = [1.5, 1.1, 0.7];          // seconds between attacks (by phase, plus up to a second)
const DAMAGE = { sweep: 22, slam: 30, punch: 20, rock: 24, bite: 28 };
const HIT_RADIUS = 1.7;               // metres from a striking tentacle that it catches him
const BITE_RADIUS = 3.6;
const MOUTH_RADIUS = 1.4;             // the weak spot, for the harpoon (metres)
const BODY_RADIUS = 3.6;              // he cannot swim into its body
const ENGAGE = 24;                    // metres from its body that it comes for him
const KEEP = [9, 13];                 // how near it keeps to him while it swims after him (metres)
const SWIM = { speed: 6.5, accel: 5.0, drag: 1.4 };   // its swimming: top speed (m/s), how fast it gets there, how it slows
const STALK = { chance: [0.35, 0.45, 0.55], time: [3.5, 6.0], far: 21 };   // slipping off into the murk to ambush him
const FLEE = 18;                      // metres: further off than this, he is running, and it comes faster
const STUCK = 2.6, STUN = 3.4, FLINCH = 1.2;
const ROCK_SPEED = 21;
export const WRAPPERS = [0, 7, 1, 6, 8];   // the tentacles wrapped round the relay until the fight
const SIDE_ARMS = { right: [0, 1, 2, 3], left: [7, 6, 5, 4] };
const WHIPS = [8, 9];
const FACE_Z = 2.8;                   // the front of its face (model units)
const LUNGE = { windup: 1.0, rush: 0.55, hold: 1.8, bite: 1.25, back: 1.0, reach: 2.0 };
// what it does, by phase: [attack, weight]
const MOVES = [
  [['sweep', 1], ['punch', 1.4], ['slam', 0.8]],
  [['sweep', 0.8], ['punch', 1.2], ['slam', 0.6], ['throw', 1.2], ['lunge', 0.9]],
  [['sweep', 0.6], ['punch', 1.1], ['slam', 0.6], ['throw', 1.0], ['lunge', 1.1], ['ink', 0.8]]
];

export class KrakenFight {
  // trench: the Trench (its points, its callbacks; wrapPaths: where its tentacles lie round the
  // relay; rockSpots: boulders on the lair's floor it can throw)
  constructor(trench) {
    this.t = trench;
    const pts = trench.pts;
    this.homeAt = pts.lurk.clone().lerp(pts.lair, 0.42);
    this.arena = { c: pts.lurk.clone().lerp(pts.lair, 0.56), rx: 13, rz: 14 };
    this.backAt = pts.lair.clone();
    this.floorY = pts.lurk.y - 0.6;
    this.kraken = new Kraken(trench.sea.group, { position: this.homeAt, yaw: -Math.PI / 2, scale: SCALE });
    // its tentacles never go through the relay station's walls
    this.kraken.avoid.push({ centre: pts.inside, radius: 5.9, top: pts.inside.y + 6.5 });
    this.state = 'lurk';
    this.time = 0;
    this.stateT = 0;
    this.wounds = 0;
    this.open = 0;                    // its mouth's glow (eased)
    this.attack = null;
    this.next = 2.5;
    this.yaw = -Math.PI / 2;
    this.pos = this.homeAt.clone();
    this.vel = new THREE.Vector3();   // its swimming
    this.stalkT = 0;                  // seconds left, slipping round him out in the murk before it ambushes
    this.shake = 0;
    this.rocks = [];                  // boulders in flight
    this.chips = [];                  // bits of them after they smash
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this.ready = this.kraken.ready.then(() => this._hold());
  }

  get phase() {
    return this.wounds < 1 ? 0 : this.wounds < 3 ? 1 : 2;
  }

  // beaten: the relay's door can open
  get free() {
    return this.state === 'beaten' || this.state === 'gone';
  }

  // its tentacles round the relay (the paths are the Trench's: they follow the floor)
  _hold() {
    const k = this.kraken;
    for (const tent of k.tents) tent.floor = this._localFloor();
    WRAPPERS.forEach((i, n) => {
      const wrap = this.t.wrapPaths?.[n];
      if (!wrap) return;
      const tent = k.tents[i];
      tent.path = wrap.points;
      tent.wrapFrom = wrap.wrapFrom;
      tent.thick = tent.kind === 'arm' ? 1.15 : 1.0;
    });
    k.update(0);
  }

  // it tears its tentacles off the station (fast)
  _release() {
    for (const tent of this.kraken.tents) {
      if (!tent.path) continue;
      tent.path = null;
      tent.releaseRate = 2.6;
      tent.thick = tent.kind === 'arm' ? 1.25 : 1.0;
    }
  }

  _localFloor() {
    const p = this.kraken.root.position;
    return (this._floorAt(p.x, p.z) - p.y) / SCALE + 0.35;
  }

  // the floor under a point: its lair's, or (out of the cave) the trench's
  _floorAt(x, z) {
    return x > this.t.pts.mouth.x + 2 ? this.floorY : Math.min(this.floorY, this.t._groundAt(x, z));
  }

  // is it (or a point) out of its cave
  _outside(p = this.pos) {
    return p.x < this.t.pts.mouth.x + 6;
  }

  // ------------------------------------------------------------------ the harpoon
  // a spear between p0 and p1 this step: what it meets
  spearTest(p0, p1) {
    if (this.state === 'gone' || !this.kraken.body) return null;
    const k = this.kraken, a = this.attack;
    // a punching arm stuck in the rock: shoot it and it is stunned
    if (this.state === 'fight' && a?.kind === 'punch' && a.phase === 'stuck') {
      const tip = k.pointOn(k.tents[a.tent], 0.85, new THREE.Vector3());
      if (segmentNear(p0, p1, tip, 1.6)) {
        this._stun();
        return { point: closest(p0, p1, tip), stick: null, flesh: true };
      }
    }
    const mouth = k.mouthWorld(this._p);
    if (segmentNear(p0, p1, mouth, MOUTH_RADIUS)) {
      if (this.open > 0.5 && (this.state === 'fight' || this.state === 'stunned')) this._wound();
      else this.t.onShrug();
      return { point: closest(p0, p1, mouth), stick: k.root, flesh: true };
    }
    const body = this._bodyCentre(this._v);
    if (segmentNear(p0, p1, body, BODY_RADIUS * 0.75)) {
      this.t.onShrug();
      return { point: closest(p0, p1, body).lerp(body, 0.35), stick: k.root, flesh: true };
    }
    for (const tent of k.tents) {
      if (k.distanceTo(tent, p1, 0.2) < 0.9) return { point: p1.clone(), stick: null, flesh: true };
    }
    return null;
  }

  _bodyCentre(out) {
    return this.kraken.toWorld(this._w.set(0, 1.6, 0.6), out);
  }

  // where its tentacle's stuck tip is (for the marker), or null
  stuckTip(out) {
    const a = this.attack;
    if (this.state !== 'fight' || a?.kind !== 'punch' || a.phase !== 'stuck') return null;
    return this.kraken.pointOn(this.kraken.tents[a.tent], 0.85, out);
  }

  // ------------------------------------------------------------------ every frame
  // player: his chest (world); alive: he can be hurt
  update(dt, player, alive) {
    if (this.state === 'gone' || !this.kraken.body) {
      this._rockStep(dt, player, alive);
      return;
    }
    this.time += dt;
    this.stateT += dt;
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const k = this.kraken;
    // (by default its mouth works slowly, half shut; in the fight it snarls)
    k.jawTarget = -0.32 + 0.14 * Math.sin(this.time * 1.1);
    k.jawRate = 6;
    k.pitch = 0;
    switch (this.state) {
      case 'lurk': case 'wait': this._lurk(dt, player); break;
      case 'fight': this._fight(dt, player, alive); break;
      case 'stunned': this._stunned(dt); break;
      case 'flinch': this._flinch(dt, player); break;
      case 'beaten': this._beaten(dt); break;
    }
    // the body: where it is, which way it faces
    k.root.position.copy(this.pos);
    k.root.rotation.y = this.yaw;
    if (this.state !== 'beaten') for (const tent of k.tents) if (tent.floor !== null) tent.floor = this._localFloor();
    const a = this.attack;
    const lit = this.state === 'stunned' || (this.state === 'fight' && (a?.phase === 'open' || a?.phase === 'hold'));
    this.open += ((lit ? 1 : 0) - this.open) * (1 - Math.exp(-6 * dt));
    k.mouthGlow = this.open;
    k.update(dt);
    this._rockStep(dt, player, alive);
  }

  _set(state) {
    this.state = state;
    this.stateT = 0;
  }

  // holding the station, the rest of it stirring; once he is in its lair it roars, tears its
  // tentacles off the station and comes for him
  _lurk(dt, player) {
    this.pos.lerp(this._w.copy(this.homeAt).add(this._p.set(0, Math.sin(this.time * 0.6) * 0.2, 0)), 1 - Math.exp(-2 * dt));
    this._face(dt, player && this.t.inCave(player) ? player : null, 0.6);
    this._menace(null, -1);
    if (player && this._bodyCentre(this._v).distanceTo(player) < ENGAGE && this.t.inCave(player)) {
      this._set('fight');
      this._release();
      this.attack = null;
      this.next = 2.6;
      this.shake = 1.6;
      this._roarT = 1.8;
      this.t.onRoar();
    }
  }

  _face(dt, player, rate) {
    if (!player) return;
    const want = Math.atan2(player.x - this.pos.x, player.z - this.pos.z);
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * (1 - Math.exp(-rate * dt));
  }

  // its tentacles not striking ripple and curl; a couple at a time feel out toward him
  _menace(player, except) {
    const k = this.kraken;
    const local = player ? k.toLocal(player) : null;
    const turn = Math.floor(this.time / 2.6);
    k.tents.forEach((tent, i) => {
      if (i === except || tent.path || i === this._holdingRock) return;
      const feels = local && i < 8 && (i === turn % 8 || i === (turn + 3) % 8) && this.stalkT <= 0;
      if (feels) tent.target = (tent.target || new THREE.Vector3()).copy(local);
      tent.reach += ((feels ? 0.35 : 0) - tent.reach) * 0.04;
      if (tent.reach < 0.02 && !feels) tent.target = null;
      tent.curl = 0.35 + 0.25 * Math.sin(this.time * 0.9 + i * 1.3);
      tent.tip = 0.5 + 0.4 * Math.sin(this.time * 0.6 + i);
      tent.wave = 1.35;
      tent.glow = Math.max(0, tent.glow - 0.05);
    });
  }

  // Swimming after him round its hall, keeping close, inside its walls; stalking, out at the edge
  // of what he can see, circling. It swims like a living thing: it speeds up and glides, its arms
  // streaming back as it goes, a pulse of its arms driving each surge (see _swimLook)
  _chase(dt, player, extra = 0) {
    if (!player) return;
    const away = this._v.subVectors(this.pos, player).setY(0);
    const d = away.length() || 1;
    away.divideScalar(d);
    let want;
    if (this.stalkT > 0) {
      // (out in the murk on the far side of him, going round)
      const a = Math.atan2(away.z, away.x) + dt * 0.35;
      want = this._w.copy(player).add(this._p.set(Math.cos(a) * STALK.far, 0, Math.sin(a) * STALK.far));
    } else {
      const keep = KEEP[0] + (KEEP[1] - KEEP[0]) * (0.5 + 0.5 * Math.sin(this.time * 0.3));
      want = this._w.copy(player).addScaledVector(away, keep - extra);
      want.addScaledVector(this._p.set(-away.z, 0, away.x), Math.sin(this.time * 0.4) * 3);
    }
    // (he is out of the cave and it is in, or the other way: it goes by the throat, not the rock)
    const mouthX = this.t.pts.mouth.x, cz = this.t.pts.inside.z;
    const kIn = this.pos.x > mouthX + 2, pIn = player.x > mouthX + 2;
    if (kIn !== pIn) want = this._w.set(pIn ? mouthX + 9 : mouthX - 7, 0, cz);
    this._inBounds(want);
    want.y = this._floorAt(want.x, want.z) + 1.4 + Math.sin(this.time * 0.9) * 0.6;
    const running = d > FLEE && this.stalkT <= 0 ? 1.55 : 1;
    this._steer(dt, want, SWIM.speed * SPEED[this.phase] * (this.stalkT > 0 ? 0.8 : running));
  }

  // accelerate toward a point, gliding, with a pulse of its arms on each surge
  _steer(dt, want, top) {
    const to = this._p.subVectors(want, this.pos);
    const dist = to.length();
    const pulse = 0.6 + 0.8 * Math.max(0, Math.sin(this.time * 3.6));
    const desired = to.multiplyScalar(Math.min(top, dist * 1.2) / Math.max(dist, 0.001));
    this.vel.addScaledVector(desired.sub(this.vel), Math.min(1, SWIM.accel * pulse * dt / Math.max(top, 1)));
    this.vel.multiplyScalar(Math.exp(-SWIM.drag * 0.2 * dt));
    this.pos.addScaledVector(this.vel, dt);
  }

  // how it looks as it swims: the arms stream back the faster it goes and gather and spread with
  // each surge, it leans into its turns and dips its head as it drives forward
  _swimLook(dt) {
    const k = this.kraken;
    const speed = this.vel.length();
    const local = this._v.copy(this.vel).applyAxisAngle(UP, -this.yaw);
    const amount = THREE.MathUtils.clamp((speed - 1.2) / 5, 0, 0.8);
    k.trail.set(-local.x, -local.y * 0.5 - 0.25, -local.z).normalize().multiplyScalar(amount);
    const turn = this.yaw - (this._lastYaw ?? this.yaw);
    this._lastYaw = this.yaw;
    k.roll += (THREE.MathUtils.clamp(-turn / Math.max(dt, 1e-3) * 0.25, -0.35, 0.35) - k.roll) * (1 - Math.exp(-3 * dt));
    k.pitch += amount * 0.15;
    if (amount > 0.2) for (const tent of k.tents) if (!tent.target) tent.curl += 0.35 * Math.max(0, Math.sin(this.time * 3.6 + 1.2));
  }

  // where it can go: its hall, the throat out of it (keeping to its middle), and the trench floor
  // round the relay station and the cave's mouth (never into the relay)
  _inBounds(p) {
    const P = this.t.pts, mouthX = P.mouth.x, cz = P.inside.z;
    if (p.x > mouthX + 6) {
      const A = this.arena;
      const dx = (p.x - A.c.x) / A.rx, dz = (p.z - A.c.z) / A.rz, r = Math.hypot(dx, dz);
      if (r > 0.85) {
        p.x = A.c.x + dx / r * 0.85 * A.rx;
        p.z = A.c.z + dz / r * 0.85 * A.rz;
      }
    } else if (p.x > mouthX - 4) {
      p.z = cz + THREE.MathUtils.clamp(p.z - cz, -3.5, 3.5);
    } else {
      p.x = THREE.MathUtils.clamp(p.x, P.inside.x - 24, mouthX - 4);
      p.z = cz + THREE.MathUtils.clamp(p.z - cz, -22, 22);
      const dx = p.x - P.inside.x, dz = p.z - P.inside.z, r = Math.hypot(dx, dz);
      if (r < 9 && r > 1e-3) {
        p.x = P.inside.x + dx / r * 9;
        p.z = P.inside.z + dz / r * 9;
      }
    }
    return p;
  }

  _fight(dt, player, alive) {
    const k = this.kraken, a = this.attack;
    // the roar as it comes for him: mouth wide, shaking
    if (this._roarT > 0) {
      this._roarT -= dt;
      k.jawTarget = 0.34 + 0.06 * Math.sin(this.time * 31);
      k.jawRate = 14;
    } else {
      // (between blows it snarls: the jaw working fast)
      k.jawTarget = -0.15 + 0.25 * Math.max(0, Math.sin(this.time * 3.3));
      k.jawRate = 9;
    }
    if (a?.kind === 'lunge') return this._lunge(dt, player, alive);
    // (swimming fast while it stalks, it faces where it goes; otherwise, him)
    if (this.stalkT > 0 && this.vel.length() > 2) this._faceDir(dt, this.vel, 2.2);
    else this._face(dt, player, 1.8);
    const hold = a && (a.phase === 'windup' || a.phase === 'strike' || a.phase === 'stuck');
    if (hold) this.vel.multiplyScalar(Math.exp(-4 * dt));
    this._chase(dt * (hold ? 0.25 : 1), player, a?.phase === 'open' ? -2 : 0);
    this._menace(player, a ? a.tent : -1);
    this._swimLook(dt);
    if (!a) {
      if (this.stalkT > 0) {
        // out in the murk: then it comes back at him, from wherever it is
        this.stalkT -= dt;
        if (this.stalkT <= 0 && player) {
          this.t.onAmbush?.();
          this._begin(player, Math.random() < 0.6 || this.phase === 0 ? 'lunge' : 'punch');
        }
        return;
      }
      this.next -= dt;
      if (this.next <= 0 && player) this._begin(player);
      return;
    }
    a.t += dt * SPEED[this.phase];
    switch (a.kind) {
      case 'sweep': case 'slam': this._strike(a, player, alive); break;
      case 'punch': this._punch(a, player, alive, dt); break;
      case 'throw': this._throw(a, player, alive); break;
      case 'ink': this._ink(a, player); break;
    }
  }

  // which blow next: by its phase, not the same one twice running (force: a given one, for testing)
  _begin(player, force = null) {
    const moves = MOVES[this.phase].filter(([m]) => (m !== this._last || this.phase === 2) && !(m === 'throw' && this._outside()));
    let r = Math.random() * moves.reduce((s, [, w]) => s + w, 0);
    let kind = moves[0][0];
    for (const [m, w] of moves) { if ((r -= w) <= 0) { kind = m; break; } }
    if (this._afterInk) { kind = 'punch'; this._afterInk = false; }
    if (force) kind = force;
    this._last = kind;
    const k = this.kraken;
    const toward = this._v.subVectors(player, this.pos).setY(0).normalize();
    const side = new THREE.Vector3(-toward.z, 0, toward.x);
    const right = k.toLocal(player).x > 0;
    const arm = () => {
      const c = right ? SIDE_ARMS.right : SIDE_ARMS.left;
      return c[Math.floor(Math.random() * c.length)];
    };
    const a = { kind, phase: 'windup', t: 0, aim: player.clone() };
    if (kind === 'sweep') {
      const s = side.clone().multiplyScalar((right ? 1 : -1) * (Math.random() < 0.5 ? 1 : -1));
      Object.assign(a, { tent: arm(), up: player.clone().addScaledVector(s, 7).add(new THREE.Vector3(0, 3.5, 0)), through: player.clone().addScaledVector(s, -8).add(new THREE.Vector3(0, -0.3, 0)) });
    } else if (kind === 'slam') {
      Object.assign(a, { tent: WHIPS[Math.floor(Math.random() * 2)], up: player.clone().add(new THREE.Vector3(0, 8.5, 0)).addScaledVector(toward, -2) });
    } else if (kind === 'punch') {
      a.tent = arm();
    } else if (kind === 'throw') {
      a.tent = WHIPS[Math.floor(Math.random() * 2)];
      a.spot = this._nearestRock();
    } else if (kind === 'lunge') {
      a.tent = -1;
    } else if (kind === 'ink') {
      a.tent = -1;
    }
    this.attack = a;
    this.t.onWindup(kind);
  }

  _nearestRock() {
    const spots = this.t.rockSpots || [];
    let best = null, bd = Infinity;
    for (const s of spots) {
      const d = s.distanceTo(this.pos);
      if (d < bd) { bd = d; best = s; }
    }
    return best ? best.clone() : this.pos.clone().add(new THREE.Vector3(0, -1, 4));
  }

  _done(open) {
    if (open) {
      this.attack.phase = 'open';
      this.attack.t = 0;
      this.shake = Math.max(this.shake, 0.5);
      this.t.onOpen(true);
    } else this._between();
  }

  // after a blow: the next one, or (now and then) it slips off into the murk to ambush him
  _between() {
    this.attack = null;
    this.next = GAP[this.phase] + Math.random();
    if (Math.random() < STALK.chance[this.phase]) {
      this.stalkT = STALK.time[0] + Math.random() * (STALK.time[1] - STALK.time[0]);
      this.t.onStalk?.();
    }
  }

  _faceDir(dt, dir, rate) {
    const want = Math.atan2(dir.x, dir.z);
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * (1 - Math.exp(-rate * dt));
  }

  // after a blow: its scream, the mouth open to the harpoon
  _openPhase(a) {
    const k = this.kraken;
    k.jawTarget = 0.3 + 0.05 * Math.sin(this.time * 27);
    k.jawRate = 12;
    if (a.tent >= 0) k.tents[a.tent].reach = Math.max(0.2, k.tents[a.tent].reach - 0.03);
    if (a.t >= OPEN[this.phase]) {
      this.t.onOpen(false);
      this._between();
    }
  }

  _hits(tent, player, alive, a, dmg, from = 0.35) {
    const k = this.kraken;
    if (!alive || a.hit || !player) return false;
    if (k.distanceTo(tent, player, from) < HIT_RADIUS) {
      a.hit = true;
      // (dodged in a dash, it misses: a punch then drives on into the rock)
      return this.t.onHitPlayer(dmg, k.pointOn(tent, 0.8, new THREE.Vector3())) !== false;
    }
    return false;
  }

  // SWEEP and SLAM: wind up (the tip glowing hot), strike, then scream
  _strike(a, player, alive) {
    const k = this.kraken, tent = k.tents[a.tent];
    const W = 1.1, S = 0.45, R = 0.5;
    if (a.phase === 'windup') {
      tent.glow = Math.min(1, a.t / W);
      tent.reach = Math.min(1, a.t / 0.5);
      tent.curl = 0.1;
      tent.wave = 0.7;
      tent.target = k.toLocal(a.up);
      if (a.t >= W) {
        a.phase = 'strike';
        a.t = 0;
        a.aim = player ? player.clone() : a.aim;
        tent.snap = 18;
        this.t.onStrike?.(a.kind, k.pointOn(tent, 0.9, new THREE.Vector3()));
      }
    } else if (a.phase === 'strike') {
      const f = Math.min(1, a.t / S);
      if (a.kind === 'sweep') tent.target = k.toLocal(this._p.copy(a.up).lerp(a.through, f));
      else tent.target = k.toLocal(this._p.copy(a.aim).setY(Math.max(this._floorAt(a.aim.x, a.aim.z) + 0.4, a.aim.y - 1.0)));
      tent.reach = 1;
      if (f > 0.35) this._hits(tent, player, alive, a, DAMAGE[a.kind]);
      if (a.kind === 'slam' && f >= 1 && !a.thud) {
        a.thud = true;
        this.shake = Math.max(this.shake, 0.9);
        this.t.onSlam?.(a.aim.clone());
      }
      if (a.t >= S) {
        a.phase = 'recover';
        a.t = 0;
      }
    } else if (a.phase === 'recover') {
      tent.snap = 0;
      tent.glow = Math.max(0, 1 - a.t / R);
      if (a.t >= R) this._done(true);
    } else if (a.phase === 'open') this._openPhase(a);
  }

  // PUNCH: the arm coils back beside the body, glowing; then a straight, fast jab at where he will
  // be. Dodged, it drives into the rock behind him and sticks there, its tip glowing: a target
  _punch(a, player, alive, dt) {
    const k = this.kraken, tent = k.tents[a.tent];
    const W = 0.85, S = 0.24;
    if (a.phase === 'windup') {
      const toward = this._v.subVectors(player || a.aim, this.pos).setY(0).normalize();
      const coil = this._w.copy(this.pos).addScaledVector(toward, -1.5).addScaledVector(this._p.set(-toward.z, 0, toward.x), (k.toLocal(player || a.aim).x > 0 ? -1 : 1) * 3.5);
      coil.y += 3;
      tent.target = k.toLocal(coil);
      tent.reach = Math.min(1, a.t / 0.4);
      tent.glow = Math.min(1, a.t / W);
      tent.curl = 0.8;
      tent.wave = 0.4;
      if (a.t >= W && player) {
        // (it leads him a little, and drives on past him)
        const lead = this.t.s.controls.velocity.clone().multiplyScalar(0.25).setY(0);
        const at = player.clone().add(lead);
        const dir = at.clone().sub(this._bodyCentre(new THREE.Vector3())).normalize();
        a.from = k.pointOn(tent, 1, new THREE.Vector3());
        a.to = at.addScaledVector(dir, 4);
        a.phase = 'strike';
        a.t = 0;
        tent.snap = 26;
        this.t.onStrike?.('punch', a.from);
      }
    } else if (a.phase === 'strike') {
      const f = Math.min(1, a.t / S);
      tent.target = k.toLocal(this._p.copy(a.from).lerp(a.to, f));
      tent.reach = 1;
      tent.curl = 0;
      if (f > 0.25 && this._hits(tent, player, alive, a, DAMAGE.punch, 0.5)) {
        a.phase = 'back';
        a.t = 0;
      } else if (f >= 1) {
        a.phase = 'stuck';
        a.t = 0;
        this.shake = Math.max(this.shake, 0.8);
        this.t.onStuck?.(a.to.clone());
      }
    } else if (a.phase === 'stuck') {
      // (still driving home for a moment: standing still, he is caught by it)
      if (a.t < 0.3 && this._hits(tent, player, alive, a, DAMAGE.punch, 0.5)) {
        a.phase = 'back';
        a.t = 0;
        return;
      }
      tent.target = k.toLocal(a.to);
      tent.reach = 1;
      tent.glow = 0.6 + 0.4 * Math.sin(this.time * 12);
      tent.wave = 0.2;
      k.jawTarget = 0.1;
      if (a.t >= STUCK) {
        a.phase = 'back';
        a.t = 0;
        this.t.onStrike?.('yank', a.to);
      }
    } else if (a.phase === 'back') {
      tent.snap = 0;
      tent.glow = Math.max(0, tent.glow - dt * 2);
      tent.reach = Math.max(0, 1 - a.t * 2);
      if (a.t >= 0.6) this._done(false);
    }
  }

  // shot in the stuck arm: it shrieks and hangs there, stunned, mouth wide open
  _stun() {
    const a = this.attack;
    if (a) Object.assign(this.kraken.tents[a.tent], { glow: 0, snap: 0 });
    this.attack = null;
    this._set('stunned');
    this.shake = 1.1;
    this.t.onStunned();
  }

  _stunned(dt) {
    const k = this.kraken;
    k.jawTarget = 0.42 + 0.05 * Math.sin(this.time * 30);
    k.jawRate = 12;
    k.pitch = 0.12;
    this.pos.y += (this._floorAt(this.pos.x, this.pos.z) + 0.9 - this.pos.y) * (1 - Math.exp(-2 * dt));
    for (const tent of k.tents) {
      tent.target = null;
      tent.reach = Math.max(0, tent.reach - dt);
      tent.curl = 0.9 + 0.2 * Math.sin(this.time * 7 + tent.slot);
      tent.wave = 0.6;
    }
    if (this.stateT >= STUN) {
      this._set('fight');
      this.next = 0.8;
    }
  }

  // THROW: a long tentacle tears a boulder off the floor, swings it up over the body, and hurls it
  _throw(a, player, alive) {
    const k = this.kraken, tent = k.tents[a.tent];
    this._holdingRock = a.tent;
    if (a.phase === 'windup') {
      // reaching for the boulder
      tent.target = k.toLocal(a.spot);
      tent.reach = Math.min(1, a.t / 0.5);
      tent.curl = 0.2;
      if (a.t >= 0.8) {
        a.phase = 'lift';
        a.t = 0;
        a.rock = this._rock(a.spot);
        this.t.onRockGrab?.(a.spot);
      }
    } else if (a.phase === 'lift') {
      const up = this._w.copy(this.pos).add(this._p.set(-Math.sin(this.yaw) * 4, 9, -Math.cos(this.yaw) * 4));
      tent.target = k.toLocal(up);
      tent.reach = 1;
      tent.glow = Math.min(1, a.t / 0.9);
      k.pointOn(tent, 1, a.rock.mesh.position);
      if (a.t >= 0.95 && player) {
        // hurled at where he will be
        const from = a.rock.mesh.position.clone();
        const at = player.clone().add(this.t.s.controls.velocity.clone().multiplyScalar(0.45));
        a.rock.vel.copy(at.sub(from).normalize().multiplyScalar(ROCK_SPEED));
        a.rock.flying = true;
        this.rocks.push(a.rock);
        a.phase = 'recover';
        a.t = 0;
        this._holdingRock = -1;
        this.t.onThrow?.(from);
      }
    } else if (a.phase === 'recover') {
      tent.glow = Math.max(0, 1 - a.t * 2);
      tent.reach = Math.max(0.2, tent.reach - 0.04);
      if (a.t >= 0.5) this._done(true);
    } else if (a.phase === 'open') this._openPhase(a);
  }

  // a boulder (built here: a lumpy rock with the canyon's own texture)
  _rock(at) {
    this._rockGeo ||= (() => {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        v.multiplyScalar(0.8 + 0.35 * Math.abs(Math.sin(v.x * 3.1 + v.y * 1.7) * Math.cos(v.z * 2.3)));
        p.setXYZ(i, v.x, v.y * 0.85, v.z);
      }
      g.computeVertexNormals();
      return g;
    })();
    this._rockMat ||= deckMaterial('l3_rock', { sea: true }) || new THREE.MeshStandardMaterial({ color: 0x55606a, roughness: 1 });
    const mesh = new THREE.Mesh(this._rockGeo, this._rockMat);
    mesh.scale.setScalar(0.9 + Math.random() * 0.3);
    mesh.position.copy(at);
    this.t.sea.group.add(mesh);
    return { mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(Math.random() * 4, Math.random() * 4, Math.random() * 4), flying: false, life: 0 };
  }

  // boulders in flight: they hit him, or smash on the rock
  _rockStep(dt, player, alive) {
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.life += dt;
      r.vel.y -= 2.0 * dt;
      const p0 = r.mesh.position.clone();
      r.mesh.position.addScaledVector(r.vel, dt);
      r.mesh.rotation.x += r.spin.x * dt;
      r.mesh.rotation.y += r.spin.y * dt;
      let smash = r.life > 4;
      if (!r.hit && player && alive && closest(p0, r.mesh.position, player).distanceTo(player) < 1.7) {
        r.hit = true;
        smash = true;
        this.t.onHitPlayer(DAMAGE.rock, p0);
      }
      const d = r.mesh.position.clone().sub(p0);
      const L = d.length();
      if (!smash && L > 1e-4 && this.t.s.physics.castRay(p0, d.divideScalar(L), L + 0.8) !== null) smash = true;
      if (smash) {
        this._smash(r.mesh.position);
        r.mesh.removeFromParent();
        this.rocks.splice(i, 1);
      }
    }
    for (let i = this.chips.length - 1; i >= 0; i--) {
      const c = this.chips[i];
      c.life += dt;
      c.vel.y -= 4 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += dt * 5;
      c.mesh.scale.setScalar(c.size * Math.max(0, 1 - c.life / 1.6));
      if (c.life > 1.6) {
        c.mesh.removeFromParent();
        this.chips.splice(i, 1);
      }
    }
  }

  _smash(at) {
    this.shake = Math.max(this.shake, 0.7);
    this.t.onRockSmash?.(at.clone());
    for (let k = 0; k < 7; k++) {
      const mesh = new THREE.Mesh(this._rockGeo, this._rockMat);
      const size = 0.15 + Math.random() * 0.25;
      mesh.scale.setScalar(size);
      mesh.position.copy(at);
      this.t.sea.group.add(mesh);
      this.chips.push({ mesh, size, life: 0, vel: new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8) });
    }
  }

  // INK: it turns its head and clouds the water round him black; then it strikes out of the dark
  _ink(a, player) {
    const k = this.kraken;
    k.jawTarget = 0.35;
    if (a.phase === 'windup' && a.t >= 0.7) {
      a.phase = 'cloud';
      a.t = 0;
      this.t.onInk(player ? player.clone() : this.pos.clone());
    } else if (a.phase === 'cloud' && a.t >= 0.6) {
      this._afterInk = true;
      this.attack = null;
      this.next = 0.6;
    }
  }

  // LUNGE: it draws back, its arms rising and spreading, mouth opening; then the whole body surges
  // at him and stops with its face right in front of his, jaws snapping and its mouth lit (open to
  // the harpoon); if he is still there when it bites, it catches him; then it falls back
  _lunge(dt, player, alive) {
    const k = this.kraken, a = this.attack;
    a.t += dt * SPEED[this.phase];
    const eye = player ? this._p.copy(player).add(this._w.set(0, 0.5, 0)) : null;
    if (a.phase !== 'rush' && a.phase !== 'hold') this._face(dt, player, 2.5);
    const toward = this._v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    k.tents.forEach((tent) => {
      tent.glow = Math.max(0, tent.glow - 0.05);
      tent.wave = 1.7;
      if (a.phase === 'windup') {
        tent.target = null;
        tent.reach = Math.max(0, tent.reach - dt * 2);
        tent.curl = -0.7;
        tent.tip = 1.0;
      } else if (eye) {
        tent.target = (tent.target || new THREE.Vector3()).copy(k.toLocal(eye));
        tent.reach += (0.4 - tent.reach) * 0.1;
        tent.curl = 0.2;
      }
    });
    if (a.phase === 'windup') {
      const want = this._w.copy(this.pos).addScaledVector(toward, -2.0 * dt);
      want.y += dt * 1.0;
      this.pos.copy(this._inBounds(want));
      k.pitch = -0.18 * Math.min(1, a.t / LUNGE.windup);
      k.jawTarget = 0.3;
      k.jawRate = 8;
      if (a.t >= LUNGE.windup && eye) {
        const f = this._w.set(eye.x - this.pos.x, 0, eye.z - this.pos.z).normalize();
        a.to = eye.clone().addScaledVector(f, -(FACE_Z * SCALE + LUNGE.reach)).add(new THREE.Vector3(0, -MOUTH.y * SCALE, 0));
        a.to.y = Math.max(a.to.y, this._floorAt(a.to.x, a.to.z) + 0.4);
        a.from = this.pos.clone();
        a.rushTime = THREE.MathUtils.clamp(a.from.distanceTo(a.to) / 24, LUNGE.rush, 1.1);
        a.phase = 'rush';
        a.t = 0;
        this.vel.set(0, 0, 0);
        this.t.onLungeRush?.();
      }
    } else if (a.phase === 'rush') {
      const f = Math.min(1, a.t / (a.rushTime || LUNGE.rush));
      this.pos.lerpVectors(a.from, a.to, 1 - (1 - f) ** 3);
      k.pitch = 0.15;
      k.jawTarget = 0.35;
      k.jawRate = 16;
      if (f >= 1) {
        a.phase = 'hold';
        a.t = 0;
        this.shake = Math.max(this.shake, 1.4);
        this.t.onOpen(true);
        this.t.onLunge?.();
      }
    } else if (a.phase === 'hold') {
      this.pos.copy(a.to).add(this._w.set(Math.sin(this.time * 23) * 0.06, Math.sin(this.time * 19) * 0.05, 0));
      k.pitch = 0.1;
      const open = Math.sin(this.time * 18) > 0;
      k.jawTarget = open ? 0.32 : -0.45;
      k.jawRate = 22;
      if (!open && a.wasOpen) this.t.onChomp?.();
      a.wasOpen = open;
      if (!a.bit && a.t >= LUNGE.bite) {
        a.bit = true;
        const mouth = k.mouthWorld(this._w);
        if (alive && player && mouth.distanceTo(player) < BITE_RADIUS) this.t.onHitPlayer(DAMAGE.bite, mouth.clone());
        this.shake = Math.max(this.shake, 0.9);
      }
      if (a.t >= LUNGE.hold) {
        this.t.onOpen(false);
        a.phase = 'back';
        a.t = 0;
      }
    } else if (a.phase === 'back') {
      if (a.t >= LUNGE.back) this._between();
      this._chase(dt, player);
    }
  }

  _wound() {
    this.wounds++;
    this.stalkT = 0;
    this.open = 0;
    this.attack = null;
    this._holdingRock = -1;
    this.shake = 1.5;
    this.t.onOpen(false);
    const k = this.kraken;
    for (const tent of k.tents) {
      tent.curl = 1.1;
      tent.wave = 2;
      tent.glow = 0;
      tent.snap = 0;
    }
    if (this.wounds >= WOUNDS) {
      this._set('beaten');
      for (const tent of k.tents) {
        tent.target = null;
        tent.reach = 0;
      }
      this.t.onBeaten();
    } else {
      this._set('flinch');
      this.t.onWounded(this.wounds, WOUNDS);
    }
  }

  _flinch(dt, player) {
    const k = this.kraken;
    const back = this._v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.pos.copy(this._inBounds(this._w.copy(this.pos).addScaledVector(back, dt * 3)));
    this._menace(null, -1);
    k.jawTarget = 0.42 + 0.08 * Math.sin(this.time * 35);       // (it shrieks)
    k.jawRate = 14;
    k.pitch = -0.15;
    for (const tent of k.tents) {
      tent.curl = 0.4 + 0.7 * Math.sin(this.time * 9 + tent.slot);
      tent.wave = 2;
    }
    if (this.stateT >= FLINCH) {
      this._set('fight');
      this.next = 1.0;
      this._face(1, player, 1);
    }
  }

  // beaten: it shrieks and sinks away into the crack at the back of its lair, tentacles last
  _beaten(dt) {
    const k = this.kraken;
    const f = Math.min(1, this.stateT / 6);
    const want = this._w.copy(this.backAt).add(this._p.set(4, -6, 0));
    this.pos.lerp(want, 1 - Math.exp(-0.8 * dt));
    k.jawTarget = f < 0.5 ? 0.4 + 0.08 * Math.sin(this.time * 35) : -0.3;
    k.jawRate = 10;
    for (const tent of k.tents) {
      tent.curl = 0.9 + 0.3 * Math.sin(this.time * 6 + tent.slot) * (1 - f);
      tent.wave = 1.5 * (1 - f) + 0.3;
    }
    if (f >= 1) {
      this.state = 'gone';
      k.root.visible = false;
    }
  }

  // he was restored from backup: it goes back to where it lurks and takes hold of the station again
  // (its wounds stay)
  reset() {
    if (this.free) return;
    this.attack = null;
    this._holdingRock = -1;
    this.t.onOpen(false);
    for (const tent of this.kraken.tents) {
      tent.glow = 0;
      tent.target = null;
      tent.reach = 0;
    }
    for (const r of this.rocks) r.mesh.removeFromParent();
    this.rocks.length = 0;
    this.pos.copy(this.homeAt);
    this.vel.set(0, 0, 0);
    this.stalkT = 0;
    this._set('wait');
    this._hold();
  }

  // he cannot swim into it
  pushOut(pos, vel) {
    if (this.state === 'gone' || !this.kraken.body) return;
    const c = this._bodyCentre(this._v);
    const d = this._w.set(pos.x - c.x, pos.y + 1.0 - c.y, pos.z - c.z);
    const L = d.length();
    if (L < BODY_RADIUS && L > 0.01) {
      d.divideScalar(L);
      const inward = vel.dot(d);
      if (inward < 0) vel.addScaledVector(d, -inward);
      vel.addScaledVector(d, (BODY_RADIUS - L) * 4);
    }
  }

  dispose() {
    this.kraken.root.removeFromParent();
    for (const r of this.rocks) r.mesh.removeFromParent();
    for (const c of this.chips) c.mesh.removeFromParent();
  }
}

// is any point of the segment p0-p1 within r of c
const UP = new THREE.Vector3(0, 1, 0);

function segmentNear(p0, p1, c, r) {
  return closest(p0, p1, c).distanceTo(c) < r;
}

function closest(p0, p1, c) {
  const d = new THREE.Vector3().subVectors(p1, p0);
  const L2 = d.lengthSq();
  const t = L2 > 0 ? THREE.MathUtils.clamp(new THREE.Vector3().subVectors(c, p0).dot(d) / L2, 0, 1) : 0;
  return p0.clone().addScaledVector(d, t);
}

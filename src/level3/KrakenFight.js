import * as THREE from 'three';
import { Kraken, MOUTH } from './Kraken.js';

// The kraken's part in Level 3 (the creature itself is Kraken.js).
//   lurk     in the front of its lair, five tentacles stretched out of the cave and along the floor
//            to the relay station and wrapped round its lower half, the door with it: nobody gets
//            in. Following those tentacles back is how Voss finds it
//   fight    (he comes into its lair) still holding the station, it comes at him with the rest:
//            a free arm winds up, its tip glowing hot, and sweeps through where he is, or the long
//            tentacle rises over him and slams down; after each blow it screams, its mouth lit from
//            inside: the weak spot, open to the harpoon for a few seconds. Now and then it lunges:
//            the whole body surges at him and stops with its face right in front of his, jaws
//            snapping and mouth lit; it bites if he stays, and it is wide open to a spear. Three
//            spears in the mouth and it is beaten
//   beaten   it shrieks, lets go of the station (its tentacles slither back through the cave) and
//            sinks away into the crack at the back of its lair: the relay's door is free
//   wait     (he was restored from backup) back where it lurks, still holding on
// Positions are world metres; the kraken's own space is its model's units (Kraken.toLocal).

const SCALE = 1.6;                    // the model's units to metres: the body ~8 m across, each tentacle ~19 m
const WOUNDS = 3;                     // spears in its mouth to beat it
const WINDUP = 1.1, STRIKE = 0.45, RECOVER = 0.6, OPEN = 2.8, FLINCH = 1.3;
const LUNGE = { windup: 1.0, rush: 0.55, hold: 1.8, bite: 1.25, back: 1.0, reach: 2.0 };   // (reach: metres between its face and his)
const GAP = [1.2, 2.2];               // seconds between one attack's end and the next one starting
const DAMAGE = { sweep: 22, slam: 30, bite: 28 };
const HIT_RADIUS = 1.7;               // metres from a striking tentacle that it catches him
const BITE_RADIUS = 3.6;              // metres from its mouth that the bite catches him
const MOUTH_RADIUS = 1.4;             // the weak spot, for the harpoon (metres)
const BODY_RADIUS = 3.6;              // he cannot swim into its body
const ENGAGE = 24;                    // metres from its body that it comes for him
export const WRAPPERS = [0, 7, 1, 6, 8];   // the tentacles wrapped round the relay (four arms and a long one)
const SWEEPERS = { right: [2, 3], left: [5, 4] };   // the free arms, by side
const SLAM_WHIP = 9;
const FACE_Z = 2.8;                   // the front of its face (model units)

export class KrakenFight {
  // trench: the Trench (its points, its callbacks, and wrapPaths: where its tentacles lie round the relay)
  constructor(trench) {
    this.t = trench;
    const pts = trench.pts;
    // (it lurks, and fights, in the front of its lair; beaten, it sinks away at the back)
    this.homeAt = pts.lurk.clone().lerp(pts.lair, 0.45);
    this.backAt = pts.lair.clone();
    this.floorY = pts.lurk.y - 0.6;
    this.kraken = new Kraken(trench.sea.group, { position: this.homeAt, yaw: -Math.PI / 2, scale: SCALE });
    // its tentacles never go through the relay station's walls
    this.kraken.avoid.push({ centre: pts.inside, radius: 5.9, top: pts.inside.y + 6.5 });
    this.state = 'lurk';
    this.time = 0;
    this.stateT = 0;
    this.wounds = 0;
    this.attacks = 0;
    this.open = 0;                    // its mouth's glow (eased)
    this.attack = null;
    this.next = 2.5;
    this.yaw = -Math.PI / 2;
    this.pos = this.homeAt.clone();
    this.shake = 0;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this.ready = this.kraken.ready.then(() => this._hold());
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
      tent.grip = 1;
      tent.thick = tent.kind === 'arm' ? 1.15 : 1.0;
    });
    k.update(0);
  }

  get holding() {
    return this.state !== 'beaten' && this.state !== 'gone';
  }

  _localFloor() {
    return (this.floorY - this.kraken.root.position.y) / SCALE + 0.35;
  }

  // a spear between p0 and p1 this step: what it meets
  spearTest(p0, p1) {
    if (this.state === 'gone' || !this.kraken.body) return null;
    const k = this.kraken;
    const mouth = k.mouthWorld(this._p);
    if (segmentNear(p0, p1, mouth, MOUTH_RADIUS)) {
      if (this.open > 0.5 && this.state === 'fight') this._wound();
      else this.t.onShrug();
      return { point: closest(p0, p1, mouth), stick: k.root };
    }
    const body = this._bodyCentre(this._v);
    if (segmentNear(p0, p1, body, BODY_RADIUS * 0.75)) {
      this.t.onShrug();
      return { point: closest(p0, p1, body).lerp(body, 0.35), stick: k.root };
    }
    for (const tent of k.tents) {
      if (k.distanceTo(tent, p1, 0.2) < 0.9) return { point: p1.clone(), stick: null };
    }
    return null;
  }

  _bodyCentre(out) {
    return this.kraken.toWorld(this._w.set(0, 1.6, 0.6), out);
  }

  // ------------------------------------------------------------------ every frame
  // player: his chest (world); alive: he can be hurt
  update(dt, player, alive) {
    if (this.state === 'gone' || !this.kraken.body) return;
    this.time += dt;
    this.stateT += dt;
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const k = this.kraken;
    // (by default its mouth works slowly, half shut, as if it were breathing through it)
    k.jawTarget = -0.32 + 0.14 * Math.sin(this.time * 1.1);
    k.jawRate = 6;
    k.pitch = 0;
    switch (this.state) {
      case 'lurk': case 'wait': this._lurk(dt, player); break;
      case 'fight': this._fight(dt, player, alive); break;
      case 'flinch': this._flinch(dt, player); break;
      case 'beaten': this._beaten(dt); break;
    }
    // the body: where it is, which way it faces
    k.root.position.copy(this.pos);
    k.root.rotation.y = this.yaw;
    if (this.state !== 'beaten') for (const tent of k.tents) if (tent.floor !== null) tent.floor = this._localFloor();
    const lit = this.state === 'fight' && (this.attack?.phase === 'open' || this.attack?.phase === 'hold');
    this.open += ((lit ? 1 : 0) - this.open) * (1 - Math.exp(-6 * dt));
    k.mouthGlow = this.open;
    k.update(dt);
  }

  _set(state) {
    this.state = state;
    this.stateT = 0;
  }

  // holding the station, the rest of it stirring; it comes for him once he is in its lair
  _lurk(dt, player) {
    this.pos.lerp(this._w.copy(this.homeAt).add(this._p.set(0, Math.sin(this.time * 0.6) * 0.2, 0)), 1 - Math.exp(-2 * dt));
    this._face(dt, player && this.t.inCave(player) ? player : null, 0.6);
    this._menace(null, -1);
    if (player && this._bodyCentre(this._v).distanceTo(player) < ENGAGE && this.t.inCave(player)) {
      this._set('fight');
      this.attack = null;
      this.next = 2.2;
      this.shake = 1.2;
      this._roarT = 1.4;
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

  // its free tentacles (not holding the station, not striking) ripple toward him, curling
  _menace(player, except) {
    const k = this.kraken;
    const local = player ? k.toLocal(player) : null;
    k.tents.forEach((tent, i) => {
      if (i === except || tent.path) return;
      tent.target = local ? (tent.target || new THREE.Vector3()).copy(local) : null;
      tent.reach += ((local ? 0.22 : 0) - tent.reach) * 0.05;
      tent.curl = 0.35 + 0.25 * Math.sin(this.time * 0.9 + i * 1.3);
      tent.tip = 0.5 + 0.4 * Math.sin(this.time * 0.6 + i);
      tent.wave = 1.25;
      tent.glow = Math.max(0, tent.glow - 0.05);
    });
  }

  _fight(dt, player, alive) {
    const k = this.kraken;
    const a = this.attack;
    // the scream as it comes for him: mouth wide, shaking
    if (this._roarT > 0) {
      this._roarT -= dt;
      k.jawTarget = 0.3 + 0.06 * Math.sin(this.time * 31);
      k.jawRate = 14;
    }
    if (a?.kind === 'lunge') return this._lunge(dt, player, alive);
    this._face(dt, player, 1.6);
    // the body: low and swaying, drifting nearer to him between blows, lunging in as it winds up,
    // rearing as it screams
    const toward = this._v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const across = this._p.set(toward.z, 0, -toward.x);
    const near = player ? Math.min(5, Math.max(0, this.homeAt.distanceTo(player) - 12)) * (0.5 + 0.5 * Math.sin(this.time * 0.35)) : 0;
    const lunge = a?.phase === 'windup' ? Math.min(1, a.t / WINDUP) * 3.2 : a?.phase === 'strike' ? 3.2 : a?.phase === 'open' ? 1.5 : 0;
    const rear = a?.phase === 'open' ? 1.6 : 0;
    const want = this._w.copy(this.homeAt).addScaledVector(toward, lunge + near).addScaledVector(across, Math.sin(this.time * 0.45) * 2.2);
    want.y += rear + Math.sin(this.time * 1.1) * 0.35;
    this.pos.lerp(want, 1 - Math.exp(-2.5 * dt));
    this._menace(player, a ? a.tent : -1);
    if (!a) {
      this.next -= dt;
      if (this.next <= 0 && player) this._begin(player);
      return;
    }
    a.t += dt;
    const tent = k.tents[a.tent];
    if (a.phase === 'windup') {
      tent.glow = Math.min(1, a.t / WINDUP);
      tent.reach = Math.min(1, a.t / 0.5);
      tent.curl = 0.1;
      tent.wave = 0.7;
      tent.target = k.toLocal(a.up);
      k.jawTarget = 0.05;
      if (a.t >= WINDUP) {
        a.phase = 'strike';
        a.t = 0;
        a.aim = player ? player.clone() : a.aim;
        this.t.onStrike?.(a.kind, k.pointOn(tent, 0.9, new THREE.Vector3()));
      }
    } else if (a.phase === 'strike') {
      const f = Math.min(1, a.t / STRIKE);
      if (a.kind === 'sweep') tent.target = k.toLocal(this._p.copy(a.up).lerp(a.through, f));
      else tent.target = k.toLocal(this._p.copy(a.aim).setY(Math.max(this.floorY + 0.4, a.aim.y - 1.0)));
      tent.reach = 1;
      if (alive && !a.hit && player && f > 0.35 && k.distanceTo(tent, player, 0.35) < HIT_RADIUS) {
        a.hit = true;
        this.t.onHitPlayer(DAMAGE[a.kind], k.pointOn(tent, 0.8, new THREE.Vector3()));
      }
      if (a.kind === 'slam' && f >= 1 && !a.thud) {
        a.thud = true;
        this.shake = Math.max(this.shake, 0.8);
        this.t.onSlam?.(a.aim.clone());
      }
      if (a.t >= STRIKE) {
        a.phase = 'recover';
        a.t = 0;
      }
    } else if (a.phase === 'recover') {
      tent.glow = Math.max(0, 1 - a.t / RECOVER);
      if (a.t >= RECOVER) {
        a.phase = 'open';
        a.t = 0;
        this.shake = Math.max(this.shake, 0.5);
        this.t.onOpen(true);
      }
    } else if (a.phase === 'open') {
      // it screams: jaw wide and shuddering
      k.jawTarget = 0.28 + 0.05 * Math.sin(this.time * 27);
      k.jawRate = 12;
      tent.reach = Math.max(0.2, tent.reach - dt);
      if (a.t >= OPEN) {
        this.t.onOpen(false);
        this.attack = null;
        this.next = GAP[0] + Math.random() * (GAP[1] - GAP[0]);
      }
    }
  }

  // a blow: a sweep with a free arm on his side, a slam from above with the long tentacle, or (now
  // and then, more once it is hurt) a lunge with its whole body
  _begin(player) {
    const k = this.kraken;
    this.attacks++;
    if (this.attacks % 3 === 0 || (this.wounds > 0 && Math.random() < 0.3)) {
      this.attack = { kind: 'lunge', tent: -1, phase: 'windup', t: 0, aim: player.clone() };
      this._lastKind = 'lunge';
      this.t.onWindup('lunge');
      return;
    }
    const toward = this._v.subVectors(player, this.pos).setY(0).normalize();
    const side = new THREE.Vector3(-toward.z, 0, toward.x);
    const slam = this.wounds > 0 ? Math.random() < 0.5 : (this._lastKind === 'sweep');
    let a;
    if (slam) {
      a = { kind: 'slam', tent: SLAM_WHIP, up: player.clone().add(new THREE.Vector3(0, 8.5, 0)).addScaledVector(toward, -2) };
    } else {
      // a free arm on whichever side of it he is
      const local = k.toLocal(player);
      const right = local.x > 0;
      const candidates = right ? SWEEPERS.right : SWEEPERS.left;
      const sgn = right ? 1 : -1;
      const s = side.clone().multiplyScalar(sgn * (Math.random() < 0.5 ? 1 : -1));
      a = {
        kind: 'sweep', tent: candidates[Math.floor(Math.random() * candidates.length)],
        up: player.clone().addScaledVector(s, 7).add(new THREE.Vector3(0, 3.5, 0)),
        through: player.clone().addScaledVector(s, -8).add(new THREE.Vector3(0, -0.3, 0))
      };
    }
    a.phase = 'windup';
    a.t = 0;
    a.aim = player.clone();
    this.attack = a;
    this._lastKind = a.kind;
    this.t.onWindup(a.kind);
  }

  // The lunge: it draws back, its free arms rising and spreading, mouth opening; then the whole
  // body surges at him and stops with its face right in front of his, jaws snapping and its mouth
  // lit (open to the harpoon); if he is still there when it bites, it catches him; then it falls back
  _lunge(dt, player, alive) {
    const k = this.kraken, a = this.attack;
    a.t += dt;
    const eye = player ? this._p.copy(player).add(this._w.set(0, 0.5, 0)) : null;
    if (a.phase !== 'rush' && a.phase !== 'hold') this._face(dt, player, 2.5);
    const toward = this._v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    k.tents.forEach((tent) => {
      if (tent.path) return;
      tent.glow = Math.max(0, tent.glow - 0.05);
      tent.wave = 1.7;
      if (a.phase === 'windup') {
        // arms up and out
        tent.target = null;
        tent.reach = Math.max(0, tent.reach - dt * 2);
        tent.curl = -0.7;
        tent.tip = 1.0;
      } else if (eye) {
        // closing round him
        tent.target = (tent.target || new THREE.Vector3()).copy(k.toLocal(eye));
        tent.reach += (0.35 - tent.reach) * 0.1;
        tent.curl = 0.2;
      }
    });
    if (a.phase === 'windup') {
      const want = this._w.copy(this.homeAt).addScaledVector(toward, -2.5);
      want.y += 1.0;
      this.pos.lerp(want, 1 - Math.exp(-3 * dt));
      k.pitch = -0.18 * Math.min(1, a.t / LUNGE.windup);
      k.jawTarget = 0.3;
      k.jawRate = 8;
      if (a.t >= LUNGE.windup && eye) {
        // where its body must be for its face to stop just in front of his
        const f = this._w.set(eye.x - this.pos.x, 0, eye.z - this.pos.z).normalize();
        a.to = eye.clone().addScaledVector(f, -((FACE_Z) * SCALE + LUNGE.reach)).add(new THREE.Vector3(0, -MOUTH.y * SCALE, 0));
        a.to.y = Math.max(a.to.y, this.floorY + 0.4);
        a.from = this.pos.clone();
        a.phase = 'rush';
        a.t = 0;
        this.t.onLungeRush?.();
      }
    } else if (a.phase === 'rush') {
      const f = Math.min(1, a.t / LUNGE.rush);
      this.pos.lerpVectors(a.from, a.to, 1 - (1 - f) ** 3);
      k.pitch = 0.15;
      k.jawTarget = 0.35;
      k.jawRate = 16;
      if (f >= 1) {
        a.phase = 'hold';
        a.t = 0;
        this.shake = Math.max(this.shake, 1.3);
        this.t.onOpen(true);
        this.t.onLunge?.();
      }
    } else if (a.phase === 'hold') {
      // in his face: trembling, jaws snapping
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
      this.pos.lerp(this.homeAt, 1 - Math.exp(-2.5 * dt));
      if (a.t >= LUNGE.back) {
        this.attack = null;
        this.next = GAP[0] + Math.random() * (GAP[1] - GAP[0]);
      }
    }
  }

  _wound() {
    this.wounds++;
    this.open = 0;
    this.attack = null;
    this.shake = 1.4;
    this.t.onOpen(false);
    const k = this.kraken;
    for (const tent of k.tents) {
      if (tent.path) continue;
      tent.curl = 1.1;
      tent.wave = 2;
      tent.glow = 0;
    }
    if (this.wounds >= WOUNDS) {
      this._set('beaten');
      // it lets go of the station: its tentacles slither back through the cave
      for (const tent of k.tents) {
        tent.path = null;
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
    const want = this._w.copy(this.homeAt).addScaledVector(back, 2.5);
    this.pos.lerp(want, 1 - Math.exp(-4 * dt));
    this._menace(null, -1);
    k.jawTarget = 0.4 + 0.08 * Math.sin(this.time * 35);       // (it shrieks)
    k.jawRate = 14;
    k.pitch = -0.15;
    for (const tent of k.tents) {
      if (tent.path) continue;
      tent.curl = 0.4 + 0.7 * Math.sin(this.time * 9 + tent.slot);
      tent.wave = 2;
    }
    if (this.stateT >= FLINCH) {
      this._set('fight');
      this.next = 1.6;
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

  // he was restored from backup: it settles back where it lurks, still holding on (its wounds stay)
  reset() {
    if (this.state === 'gone' || this.state === 'beaten') return;
    this.attack = null;
    this.t.onOpen(false);
    for (const tent of this.kraken.tents) tent.glow = 0;
    this.pos.copy(this.homeAt);
    this._set('wait');
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
  }
}

// is any point of the segment p0-p1 within r of c
function segmentNear(p0, p1, c, r) {
  return closest(p0, p1, c).distanceTo(c) < r;
}

function closest(p0, p1, c) {
  const d = new THREE.Vector3().subVectors(p1, p0);
  const L2 = d.lengthSq();
  const t = L2 > 0 ? THREE.MathUtils.clamp(new THREE.Vector3().subVectors(c, p0).dot(d) / L2, 0, 1) : 0;
  return p0.clone().addScaledVector(d, t);
}

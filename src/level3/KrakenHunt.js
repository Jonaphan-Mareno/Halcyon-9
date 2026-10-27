import * as THREE from 'three';
import { PLAN } from './Works.js';

// The kraken in the drowned works, between its showdowns in the clearing (KrakenFight.js has the
// showdowns and its blows; this drives it the rest of the time, through the fight's own moves).
//
//   shadow  it swims over the maze's decks, keeping near him, its arms above the roofs (never down
//           into the corridors); its glow shows through the grating (the Trench keeps a light on it)
//   events  at points along each hunt's route (Works: PT_H<hunt>_<step>_<event>):
//     creep   it passes low overhead: the deck rattles, grit sifts down
//     scare   its den behind the barred window: a light stutters on and there it is, all of it; it
//             hurls itself at the bars, roaring, and is gone up into the dark (it cannot reach him)
//     arm     an arm coils above the deck, glowing, and drives down at him through it (dash!); one
//             he dodges sticks in the floor: shoot it and it shrieks and pulls away
//     grab    an arm comes down through the deck and takes him: he is dragged up against the
//             grating under its face until he shoots the arm free (six shots)
//     burst   thuds on a wall panel beside him; the panel flies and its head comes through after
//             him, jaws snapping (dash!)
//     bars    an arm through the bars of its den takes him: the same grip, its mouth behind the bars
//     pocket  in an open pocket it drops in from above, all of it, and fights him for a few blows; a
//             shot in its mouth (or its stuck arm) drives it off early
//   scripts its wake (in the entry: it roars, tears its arms off the relay's hatch and is gone over
//           the maze), its entrances for the three showdowns (up out of the clearing's floor in front
//           of him; down over the north fence; crashing down through the gantry), its retreats
//           through a wing's gate, and its escape into the crack once it is beaten
// Out here it cannot be wounded: only in the clearing. Positions are world metres.

// (the fight's own measures, handed in: KrakenFight.js imports this file)
let SCALE, FACE_Z, SIDE_ARMS, WHIPS, BITE_RADIUS, SPEED, DAMAGE;
const ROOF = PLAN.F + PLAN.ROOF;
const SHADOW = { height: ROOF + 5.5, dist: 9, speed: 5.0 };
const POCKET_BLOWS = [0, 2, 3, 3];       // by hunt
const LIGHT_SCARE = 110;                 // candela of the light that finds it in its den

export class KrakenHunt {
  constructor(fight, constants) {
    ({ SCALE, FACE_Z, SIDE_ARMS, WHIPS, BITE_RADIUS, SPEED, DAMAGE } = constants);
    this.f = fight;
    this.job = null;                     // what it is doing now (null: shadowing him)
    this.queue = [];
    this.harass = false;                 // he left the clearing in a showdown: it comes after him over the decks
    this.light = null;                   // { at, power }: the Trench puts its spare light there
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._ang = Math.random() * 6.28;
  }

  get t() { return this.f.t; }
  get k() { return this.f.kraken; }
  get works() { return this.f.t.works; }
  get busy() { return !!this.job; }

  // start a job now (then: called when it is done)
  start(name, opts = {}) {
    this._endJob(false);
    this.job = { name, t: 0, phase: 'start', ...opts };
    this.f.stalkT = 0;
  }

  // an event along the route: now if it is free, or once it is
  trigger(name, at) {
    if (this.job) this.queue.push({ name, at });
    else this.start(name, { at });
  }

  clear() {
    this._endJob(false);
    this.queue.length = 0;
    this.harass = false;
  }

  _endJob(callThen = true) {
    const job = this.job;
    this.job = null;
    this.light = null;
    this.lit = false;
    this.f.floorOverride = null;
    for (const tent of this.k.tents) tent.free = false;
    if (this.f.attack && !this.f.free) this.f.attack = null;
    if (callThen) job?.then?.();
  }

  // ------------------------------------------------------------------ every frame
  update(dt, player, alive) {
    const f = this.f;
    f.stalkT = 0;
    if (this.harass && player && this.works.inClearing(player, 1)) {
      // back in the arena: it drops back in after him
      this.harass = false;
      this.clear();
      f.mode = 'arena';
      f.next = 0.6;
      return;
    }
    if (!this.job && this.queue.length) {
      const ev = this.queue.shift();
      if (!player || ev.name === 'pocket' || ev.at.distanceTo(player) < 12) this.start(ev.name, { at: ev.at });
    }
    if (!this.job) {
      this._shadow(dt, player);
      if (this.harass && player) {
        this._harassT = (this._harassT ?? 3) - dt;
        if (this._harassT <= 0) {
          this._harassT = 4 + Math.random() * 2;
          this.start('arm', { at: player.clone() });
        }
      }
      return;
    }
    const job = this.job;
    job.t += dt;
    const done = this['_' + job.name](dt, player, alive, job);
    if (done && this.job === job) this._endJob(true);
  }

  // ------------------------------------------------------------------ shadowing him
  _shadow(dt, player) {
    const f = this.f;
    f.floorOverride = ROOF + 0.5;
    if (!player) return;
    // a slowly turning spot over the decks a little way off him, rising and falling
    this._ang += dt * 0.16;
    const want = this._w.set(player.x + Math.cos(this._ang) * SHADOW.dist, SHADOW.height + Math.sin(f.time * 0.5) * 0.8,
      player.z + Math.sin(this._ang) * SHADOW.dist);
    this._inHall(want);
    f._steer(dt, want, SHADOW.speed);
    if (f.vel.length() > 1.2) f._faceDir(dt, f.vel, 1.4);
    else f._face(dt, player, 1.0);
    f._menace(null, -1);
    f._swimLook(dt);
    this._snarl(dt);
  }

  // keep a point it heads for inside the hall (its body is big: away from the walls)
  _inHall(p) {
    p.x = THREE.MathUtils.clamp(p.x, PLAN.X0 + 6, PLAN.X0 + 84);
    p.z = THREE.MathUtils.clamp(p.z, -(PLAN.CY + 28), -(PLAN.CY - 28));
    return p;
  }

  _snarl(dt) {
    const k = this.k;
    k.jawTarget = -0.2 + 0.18 * Math.max(0, Math.sin(this.f.time * 1.7));
    k.jawRate = 6;
  }

  // glide to a point (fast), or be there now (out of his sight)
  _go(dt, want, speed = 9) {
    this.f._steer(dt, want, speed);
  }

  _put(p, faceAt = null) {
    const f = this.f;
    f.pos.copy(p);
    f.vel.set(0, 0, 0);
    if (faceAt) f.yaw = Math.atan2(faceAt.x - p.x, faceAt.z - p.z);
  }

  // its arms all drawn up, curled (it is slipping through somewhere tight, or crouched)
  _gather(curl = 1.1) {
    for (const tent of this.k.tents) {
      tent.target = null;
      tent.reach = Math.max(0, tent.reach - 0.05);
      tent.curl = curl;
      tent.wave = 1.2;
    }
  }

  // run one of the fight's blows (punch, grab, sweep...) with its own code; true once it is over
  _blow(dt, player, alive, kind) {
    const f = this.f;
    if (!f.attack) return true;
    const a = f.attack;
    if (a.kind !== kind && kind) return true;
    a.t += dt * SPEED[f.phase];
    switch (a.kind) {
      case 'sweep': case 'slam': f._strike(a, player, alive); break;
      case 'punch': f._punch(a, player, alive, dt); break;
      case 'grab': f._grab(a, player, alive, dt); break;
      case 'ink': f._ink(a, player); break;
    }
    return !f.attack;
  }

  // the arm nearest him (by which side of it he is on)
  _armFor(player) {
    const right = this.k.toLocal(player).x > 0;
    const c = right ? SIDE_ARMS.right : SIDE_ARMS.left;
    return c[Math.floor(Math.random() * c.length)];
  }

  // ------------------------------------------------------------------ events
  // CREEP: low over the deck along his way, the grating rattling
  _creep(dt, player, alive, job) {
    if (!player) return true;
    if (job.phase === 'start') {
      const dir = this._v.subVectors(player, this.f.pos).setY(0);
      if (dir.lengthSq() < 1) dir.set(1, 0, 0);
      dir.normalize();
      job.from = player.clone().addScaledVector(dir, -12).setY(ROOF + 2.6);
      job.to = player.clone().addScaledVector(dir, 14).setY(ROOF + 2.4);
      this._put(job.from, job.to);
      job.phase = 'pass';
    }
    this.f.floorOverride = ROOF + 0.5;
    this._go(dt, job.to, 4.5);
    this.f._faceDir(dt, this.f.vel, 2);
    this.f._menace(null, -1);
    this.f._swimLook(dt);
    const over = Math.hypot(this.f.pos.x - player.x, this.f.pos.z - player.z) < 4;
    if (over && !job.rattled) {
      job.rattled = true;
      this.t.onCreepOver?.(this.f.pos.clone());
    }
    return job.t > 7 || this.f.pos.distanceTo(job.to) < 1.5;
  }

  // SCARE: found in its den by a stuttering light; it hurls itself at the bars
  _scare(dt, player, alive, job) {
    const f = this.f, k = this.k;
    const den = this.works.pts.PT_Den_Scare;
    if (job.phase === 'start') {
      // the window: the den's edge on his side
      job.toward = this._v.subVectors(player || den, den).setY(0).normalize().clone();
      job.home = den.clone().setY(PLAN.F + 1.6);
      job.bars = den.clone().addScaledVector(job.toward, 5.0);
      this._put(job.home, job.bars);
      f.floorOverride = PLAN.F;
      job.phase = 'dark';
      this.t.sfx?.cue('krakenGrowl', den);
      this.t.onScareLook?.(den);
    }
    f.floorOverride = PLAN.F;
    const T = job.t;
    // the light: off, stuttering, then full on it
    const lit = T < 0.6 ? 0 : T < 1.4 ? (Math.random() < 0.45 ? 1 : 0) : T < 4.6 ? 1 : Math.max(0, 1 - (T - 4.6) / 0.4);
    this.light = { at: den.clone().setY(PLAN.F + 9), power: LIGHT_SCARE * lit };
    if (T < 1.4) {
      this._gather(0.9);
      f._face(dt, job.bars, 2);
    } else if (T < 2.2) {
      if (!job.roared) {
        job.roared = true;
        this.t.sfx?.cue('lungeRoar', den);
        f.shake = Math.max(f.shake, 0.9);
      }
      // at the bars: its face right behind them, arms slamming into them
      const at = job.bars.clone().addScaledVector(job.toward, -(FACE_Z * SCALE + 0.6)).setY(PLAN.F + 1.4);
      f.pos.lerp(at, 1 - Math.exp(-9 * dt));
      f._face(dt, job.bars, 6);
      k.jawTarget = Math.sin(f.time * 18) > 0 ? 0.36 : -0.4;
      k.jawRate = 22;
      this._armsAt(job.bars, job.toward, 2.4);
      if (T > 1.9 && !job.slam) {
        job.slam = true;
        this.t.sfx?.cue('bars', job.bars);
        f.shake = Math.max(f.shake, 1.0);
      }
    } else if (T < 3.6) {
      k.jawTarget = Math.sin(f.time * 14) > 0 ? 0.32 : -0.35;
      k.jawRate = 18;
      this._armsAt(job.bars, job.toward, 2.4);
      if (Math.random() < dt * 1.5) this.t.sfx?.cue('bars', job.bars);
    } else {
      // gone, up into the dark
      this._gather(1.0);
      this._go(dt, den.clone().setY(PLAN.F + 20), 7);
    }
    return T > 5.2;
  }

  // a few arms reaching out to a line (the bars), spread along it
  _armsAt(at, toward, spread) {
    const k = this.k;
    const side = this._p.set(-toward.z, 0, toward.x);
    [1, 2, 5, 6].forEach((i, n) => {
      const tent = k.tents[i];
      const p = at.clone().addScaledVector(side, (n - 1.5) * spread * 0.7).add(this._w.set(0, 0.6 + (n % 2) * 1.5, 0));
      tent.target = k.toLocal(p);
      tent.reach = Math.min(1, tent.reach + 0.12);
      tent.snap = 18;
      tent.curl = 0.1;
      tent.free = true;
    });
  }

  // ARM: an arm drives down at him through the deck
  _arm(dt, player, alive, job) {
    return this._fromAbove(dt, player, alive, job, 'punch');
  }

  // GRAB: an arm takes him through the deck (pinned under its face)
  _grab(dt, player, alive, job) {
    return this._fromAbove(dt, player, alive, job, 'grab');
  }

  _fromAbove(dt, player, alive, job, kind) {
    const f = this.f;
    if (!player) return true;
    if (job.phase === 'start') {
      job.phase = 'come';
      job.side = Math.random() < 0.5 ? -1 : 1;
    }
    f.floorOverride = ROOF + 0.5;
    // over him, just above the deck (for a grab, low enough that its face is right over the grating)
    const want = this._w.set(player.x + job.side * 1.8, ROOF + (kind === 'grab' ? 1.6 : 3.2), player.z);
    if (job.phase === 'come') {
      this._go(dt, want, 10);
      f._face(dt, player, 3);
      this._gather(0.8);
      if (f.pos.distanceTo(want) < 2.5 || job.t > 1.6) {
        job.phase = 'blow';
        const tent = this._armFor(player);
        this.k.tents[tent].free = true;
        f.attack = { kind, phase: 'windup', t: 0, aim: player.clone(), tent };
        this.t.onWindup(kind);
      }
      return false;
    }
    if (f.attack?.kind === kind && f.attack.phase !== 'hold') f.pos.lerp(want, 1 - Math.exp(-2 * dt));
    f._face(dt, player, 2);
    f._menace(player, f.attack?.tent ?? -1);
    return this._blow(dt, player, alive, kind) || job.t > 12;
  }

  // BURST: it bursts through the wall panel beside him
  _burst(dt, player, alive, job) {
    const f = this.f, k = this.k;
    const den = this.works.pts.PT_Den_Burst, panel = this.works.pts.PT_BurstPanel_0;
    if (job.phase === 'start') {
      job.toward = this._v.subVectors(panel, den).setY(0).normalize().clone();
      job.home = den.clone().setY(PLAN.F + 1.8);
      this._put(job.home, panel);
      f.floorOverride = PLAN.F;
      job.phase = 'thud';
    }
    f.floorOverride = PLAN.F;
    const T = job.t;
    if (T < 1.5) {
      this._gather(1.0);
      for (const at of [0.25, 0.9]) {
        if (T > at && !(job['thud' + at])) {
          job['thud' + at] = true;
          this.t.sfx?.cue('thud', panel);
          f.shake = Math.max(f.shake, 0.45);
          this.t.onThud?.(panel);
        }
      }
    } else if (T < 1.85) {
      if (!job.burst) {
        job.burst = true;
        this.works.burstPanel(den);
        this.t.sfx?.cue('lungeRoar', panel);
        f.shake = Math.max(f.shake, 1.3);
        this.t.onOpen(true);
        this.lit = true;
        // (the panel itself can catch him)
        if (player && player.distanceTo(panel) < 3.0) this.t.onHitPlayer(12, den);
        job.to = panel.clone().addScaledVector(job.toward, -(FACE_Z * SCALE - 2.2)).setY(PLAN.F + 1.6);
      }
      f.pos.lerp(job.to, 1 - Math.exp(-14 * dt));
      k.jawTarget = 0.36;
      k.jawRate = 16;
    } else if (T < 3.3) {
      f.pos.copy(job.to).add(this._w.set(Math.sin(f.time * 23) * 0.06, 0, 0));
      const open = Math.sin(f.time * 18) > 0;
      k.jawTarget = open ? 0.34 : -0.45;
      k.jawRate = 22;
      if (!open && job.wasOpen) this.t.onChomp?.();
      job.wasOpen = open;
      if (!job.bit && T > 2.5) {
        job.bit = true;
        const mouth = k.mouthWorld(this._p);
        if (alive && player && mouth.distanceTo(player) < BITE_RADIUS) this.t.onHitPlayer(DAMAGE.bite, mouth.clone());
      }
      if (player) this._armsAt(player, job.toward, 1.5);
    } else {
      if (!job.closed) {
        job.closed = true;
        this.t.onOpen(false);
        this.lit = false;
      }
      this._gather(1.0);
      this._go(dt, T < 4.0 ? job.home : den.clone().setY(PLAN.F + 20), 8);
    }
    return T > 5.0;
  }

  // BARS: an arm through the bars of its den takes him
  _bars(dt, player, alive, job) {
    const f = this.f;
    const den = this.works.pts.PT_Den_Bars;
    if (!player) return true;
    if (job.phase === 'start') {
      this._put(den.clone().setY(PLAN.F + 1.8), player);
      job.phase = 'reach';
      this.t.sfx?.cue('bars', den);
      const tent = this._armFor(player);
      this.k.tents[tent].free = true;
      f.attack = { kind: 'grab', phase: 'windup', t: 0, aim: player.clone(), tent };
      this.t.onWindup('grab');
    }
    f.floorOverride = PLAN.F;
    if (job.phase === 'reach') {
      f._face(dt, player, 2);
      f._menace(player, f.attack?.tent ?? -1);
      if (this._blow(dt, player, alive, 'grab')) {
        job.phase = 'gone';
        job.goneAt = job.t;
      }
      return job.t > 14;
    }
    this._gather(1.0);
    this._go(dt, den.clone().setY(PLAN.F + 20), 7);
    return job.t - job.goneAt > 1.8;
  }

  // POCKET: it drops in from above and fights him for a few blows
  _pocket(dt, player, alive, job) {
    const f = this.f, k = this.k;
    if (!player) return true;
    if (job.phase === 'start') {
      job.centre = this._nearestPocket(job.at || player);
      job.blows = POCKET_BLOWS[this.t.huntNo || 1] || 2;
      this._put(job.centre.clone().setY(PLAN.F + 20), player);
      job.phase = 'drop';
      this.t.sfx?.cue('krakenGrowl', job.centre);
      this.t.onPocket?.(job.centre);
    }
    f.floorOverride = PLAN.F;
    // where it hangs: the pocket's far side from him, up a little
    const away = this._v.subVectors(job.centre, player).setY(0);
    if (away.lengthSq() < 0.01) away.set(1, 0, 0);
    away.normalize();
    const hang = this._w.copy(job.centre).addScaledVector(away, 3.0).setY(PLAN.F + 6.0);
    if (job.phase === 'drop') {
      f.pos.lerp(hang, 1 - Math.exp(-4 * dt));
      f._face(dt, player, 3);
      this._gather(0.4);
      if (f.pos.distanceTo(hang) < 1.2 || job.t > 2.2) {
        job.phase = 'roar';
        job.roarT = 1.4;
        this.t.sfx?.cue('krakenRoar', f.pos);
        f.shake = Math.max(f.shake, 1.3);
      }
      return false;
    }
    if (job.phase === 'roar') {
      job.roarT -= dt;
      k.jawTarget = 0.34 + 0.06 * Math.sin(f.time * 31);
      k.jawRate = 14;
      f._face(dt, player, 3);
      f._menace(player, -1);
      if (job.roarT <= 0) {
        job.phase = 'fight';
        job.next = 0.2;
        job.done = 0;
      }
      return false;
    }
    if (job.phase === 'fight') {
      f.pos.lerp(hang, 1 - Math.exp(-1.5 * dt));
      f._face(dt, player, 2.2);
      if (!f.attack) {
        if (job.done >= job.blows) {
          job.phase = 'leave';
          job.leftAt = job.t;
          return false;
        }
        job.next -= dt;
        f._menace(player, -1);
        k.jawTarget = -0.15 + 0.25 * Math.max(0, Math.sin(f.time * 3.3));
        k.jawRate = 9;
        if (job.next <= 0) {
          const kinds = ['punch', 'grab', 'sweep', 'punch'];
          const kind = kinds[job.done % kinds.length];
          f._begin(player, kind);
          if (f.attack?.tent >= 0) k.tents[f.attack.tent].free = true;
          job.next = 1.1;
          job.done++;
        }
        return false;
      }
      f._menace(player, f.attack.tent);
      this._blow(dt, player, alive, null);
      return false;
    }
    // leaving: up and out of the pocket
    this._gather(1.0);
    this.t.onOpen(false);
    this._go(dt, job.centre.clone().setY(PLAN.F + 22), 8);
    return job.t - job.leftAt > 2.2;
  }

  _nearestPocket(p) {
    let best = null, bd = Infinity;
    for (let n = 1; this.works.pts['PT_Pocket_' + n]; n++) {
      const c = this.works.pts['PT_Pocket_' + n];
      const d = c.distanceTo(p);
      if (d < bd) { bd = d; best = c; }
    }
    return (best || p).clone();
  }

  // a shot in its mouth (or its arm while it is stuck or holding him) out here: it shrieks and
  // pulls away (no wound: only in the clearing)
  driveOff() {
    const job = this.job;
    const f = this.f;
    f.attack = null;
    this.t.onOpen(false);
    this.t.sfx?.cue('stun', this.k.mouthWorld());
    f.shake = Math.max(f.shake, 0.9);
    this.t.onDrivenOff?.();
    if (job && job.name === 'pocket') {
      job.phase = 'leave';
      job.leftAt = job.t;
    } else if (job) {
      this.start('away', { from: f.pos.clone(), then: job.then });
    }
  }

  // AWAY: shrieking, up out of reach for a moment
  _away(dt, player, alive, job) {
    this._gather(1.0);
    const k = this.k;
    k.jawTarget = 0.42 + 0.08 * Math.sin(this.f.time * 35);
    k.jawRate = 14;
    this._go(dt, job.from.clone().setY(ROOF + 8), 9);
    return job.t > 2.5;
  }

  // ------------------------------------------------------------------ scripts
  // WAKE: in the entry it roars at him (the fight has torn its arms off the hatch), then is gone up
  // over the maze into the dark
  _wake(dt, player, alive, job) {
    const f = this.f, k = this.k;
    f.floorOverride = null;
    if (job.t < 3.0) {
      if (player) f._face(dt, player, 1.5);
      f._menace(player, -1);
      if (job.t > 1.8) {
        k.jawTarget = -0.1;
        k.jawRate = 8;
      }
      return false;
    }
    // up and away east over the decks
    const up = this.works.pts.PT_KrakenLurk.clone().add(this._w.set(6, 13, 0));
    const far = this.works.pts.PT_Clear.clone().add(this._p.set(0, 12, 0));
    const to = job.t < 4.6 ? up : far;
    this._go(dt, to, job.t < 4.6 ? 6 : 8);
    f._faceDir(dt, f.vel, 2);
    f._swimLook(dt);
    this._gather(0.6);
    return job.t > 9 || (job.t > 5 && player && f.pos.distanceTo(player) > 34);
  }

  // RISE: the first showdown: up out of the clearing's floor in front of him
  _rise(dt, player, alive, job) {
    const f = this.f, k = this.k;
    if (job.phase === 'start') {
      const c = this.works.pts.PT_Clear;
      const ahead = player ? this._v.subVectors(c, player).setY(0) : this._v.set(1, 0, 0);
      if (ahead.lengthSq() < 1) ahead.set(1, 0, 0);
      ahead.normalize();
      job.at = (player || c).clone().addScaledVector(ahead, 10).setY(PLAN.F + 1.6);
      job.at.x = THREE.MathUtils.clamp(job.at.x, c.x - 8, c.x + 8);
      job.at.z = THREE.MathUtils.clamp(job.at.z, c.z - 12, c.z + 12);
      this._put(job.at.clone().setY(PLAN.F - 9), player);
      job.phase = 'rumble';
      this.t.sfx?.cue('rockSmash', job.at);
      f.shake = Math.max(f.shake, 0.5);
    }
    f.floorOverride = -999;
    const T = job.t;
    this._gather(0.5);
    if (player) f._face(dt, player, 3);
    if (T > 0.7) {
      if (!job.up) {
        job.up = true;
        this.t.onRise?.(job.at.clone());
        this.t.sfx?.cue('krakenRoar', job.at);
        f.shake = Math.max(f.shake, 1.7);
      }
      const e = Math.min(1, (T - 0.7) / 0.9);
      f.pos.lerpVectors(job.at.clone().setY(PLAN.F - 9), job.at, 1 - (1 - e) ** 3);
      k.jawTarget = 0.36 + 0.05 * Math.sin(f.time * 30);
      k.jawRate = 14;
    }
    return T > 2.8;
  }

  // ENTER (second showdown): down over the north fence into the clearing
  _enter(dt, player, alive, job) {
    const f = this.f, k = this.k;
    const c = this.works.pts.PT_Clear;
    if (job.phase === 'start') {
      job.from = c.clone().add(this._v.set(0, 14, -16));        // (over the north wall)
      job.to = c.clone().add(this._w.set(0, 2.2 - (c.y - PLAN.F - 1.2), 0));
      this._put(job.from, player);
      job.phase = 'down';
      this.t.sfx?.cue('krakenGrowl', job.from);
    }
    f.floorOverride = null;
    this._go(dt, job.to, 11);
    if (player) f._face(dt, player, 2);
    f._swimLook(dt);
    if (job.t > 1.6 && !job.roared) {
      job.roared = true;
      this.t.sfx?.cue('krakenRoar', f.pos);
      f.shake = Math.max(f.shake, 1.2);
    }
    if (job.roared) {
      k.jawTarget = 0.34 + 0.05 * Math.sin(f.time * 30);
      k.jawRate = 14;
    }
    return job.t > 3.2;
  }

  // CRASH (the finale): down through the gantry, which comes down with it
  _crash(dt, player, alive, job) {
    const f = this.f, k = this.k;
    const g = this.works.pts.PT_Gantry;
    if (job.phase === 'start') {
      job.from = g.clone().add(this._v.set(-3, 9, -6));
      job.to = g.clone().add(this._w.set(0, -(g.y - PLAN.F) + 2.0, 4));
      this._put(job.from, player);
      job.phase = 'down';
      this.t.sfx?.cue('lungeRoar', job.from);
    }
    f.floorOverride = null;
    this._go(dt, job.to, 12);
    if (player) f._face(dt, player, 2);
    f._swimLook(dt);
    if (job.t > 0.8 && !job.hit) {
      job.hit = true;
      this.t.onCrash?.();
    }
    if (job.t > 1.9) {
      k.jawTarget = 0.34 + 0.05 * Math.sin(f.time * 30);
      k.jawRate = 14;
    }
    return job.t > 3.4;
  }

  // RETREAT: hurt, it shrieks, rises over the clearing's wall to a wing's gate, tears the gate away
  // with a long arm and is gone over the wing
  _retreat(dt, player, alive, job) {
    const f = this.f, k = this.k;
    const door = this.works.doorPoint(job.gate);
    const c = this.works.pts.PT_Clear;
    const into = this._v.subVectors(door, c).setY(0).normalize().clone();
    f.floorOverride = null;
    const T = job.t;
    if (T < 1.2) {
      k.jawTarget = 0.42 + 0.08 * Math.sin(f.time * 35);
      k.jawRate = 14;
      this._go(dt, f.pos.clone().setY(PLAN.F + 9), 5);
      this._gather(1.0);
    } else if (T < 2.6) {
      const over = door.clone().addScaledVector(into, -4).setY(PLAN.F + 10);
      this._go(dt, over, 9);
      f._faceDir(dt, into, 3);
      const whip = k.tents[WHIPS[0]];
      whip.target = k.toLocal(door);
      whip.reach = Math.min(1, whip.reach + dt * 2);
      whip.snap = 16;
      whip.free = true;
      if (T > 2.2 && !job.smashed) {
        job.smashed = true;
        this.works.smashGate(job.gate, f.pos.clone().addScaledVector(into, -6));
        f.shake = Math.max(f.shake, 1.2);
      }
    } else {
      this._gather(0.8);
      this._go(dt, door.clone().addScaledVector(into, 16).setY(ROOF + 6), 8);
      f._faceDir(dt, f.vel, 2);
      f._swimLook(dt);
    }
    return T > 5.5;
  }

  // FLEE: beaten, it shrieks, tears the east gate away with a long arm (the way to the shaft), then
  // digs: it rears up and drives itself down into the clearing's floor, thrashing, sand bursting
  // up round it, until it is gone into the rock
  _flee(dt, player, alive, job) {
    const f = this.f, k = this.k;
    const door = this.works.doorPoint('X'), c = this.works.pts.PT_Clear;
    const T = job.t;
    if (job.phase === 'start') {
      job.phase = 'shriek';
      // (where it digs: where it is, kept inside the clearing)
      job.at = f.pos.clone();
      job.at.x = THREE.MathUtils.clamp(job.at.x, c.x - 7, c.x + 7);
      job.at.z = THREE.MathUtils.clamp(job.at.z, c.z - 10, c.z + 10);
      job.at.y = PLAN.F + 1.5;
      job.nextSand = 0;
    }
    f.floorOverride = T > 2.8 ? -999 : null;
    k.jawTarget = T < 2.8 ? 0.42 + 0.08 * Math.sin(f.time * 35) : 0.3 + 0.1 * Math.sin(f.time * 20);
    k.jawRate = 12;
    if (T < 1.2) {
      this._go(dt, job.at.clone().setY(PLAN.F + 4), 5);
      this._gather(1.1);
    } else if (T < 2.6) {
      // its long arm tears the east gate away
      this._go(dt, job.at.clone().setY(PLAN.F + 4.5), 4);
      f._faceDir(dt, this._w.subVectors(door, f.pos).setY(0), 2);
      const whip = k.tents[WHIPS[1]];
      whip.target = k.toLocal(door);
      whip.reach = Math.min(1, whip.reach + dt * 2);
      whip.snap = 16;
      whip.free = true;
      if (T > 2.2 && !job.smashed) {
        job.smashed = true;
        this.works.smashGate('X', f.pos.clone());
        f.shake = Math.max(f.shake, 1.2);
      }
    } else if (T < 3.2) {
      // it rears up...
      k.tents[WHIPS[1]].reach = Math.max(0, k.tents[WHIPS[1]].reach - dt * 2);
      this._go(dt, job.at.clone().setY(PLAN.F + 6), 6);
      k.pitch = -0.25;
      this._gather(0.6);
    } else {
      // ...and drives itself down into the floor, thrashing, the sand bursting up round it
      const e = Math.min(1, (T - 3.2) / 3.2);
      f.vel.set(0, 0, 0);
      f.pos.set(job.at.x + Math.sin(f.time * 23) * 0.25, PLAN.F + 2.0 - e * 13, job.at.z + Math.cos(f.time * 19) * 0.25);
      k.pitch = 0.35;
      for (const tent of k.tents) {
        tent.target = null;
        tent.reach = 0;
        tent.curl = 0.4 + 0.8 * Math.sin(f.time * 9 + tent.slot);
        tent.wave = 2.2 * (1 - e) + 0.3;
      }
      job.nextSand -= dt;
      if (job.nextSand <= 0 && e < 0.85) {
        job.nextSand = 0.35;
        const at = job.at.clone().add(this._p.set((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5)).setY(PLAN.F + 0.5);
        this.t.onDig?.(at);
      }
    }
    if (T > 6.8) {
      f.state = 'gone';
      k.root.visible = false;
      return true;
    }
    return false;
  }
}

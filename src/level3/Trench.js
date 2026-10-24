import * as THREE from 'three';
import { KrakenFight, WOUNDS as WOUNDS_TOTAL } from './KrakenFight.js';
import { SEA } from './SeaScene.js';

// The bottom of the trench (Level 3): the uplink relay station, the kraken's cave and the fight.
// Built in Blender/scripts/build_l3_outside.py (its points: PT_Relay*, PT_Cave*, PT_Kraken*...).
//
//   1. down from the platform to the relay station at the foot of the cliff (the cable reaches)
//   2. the kraken's tentacles are wrapped round the whole lower half of the relay, its door too:
//      it will not open. They run back along the floor to a cave in the cliff
//   3. he follows them into the cave. In its lair the kraken roars, tears its tentacles off the
//      station and comes for him: the final fight (KrakenFight.js), with a boss bar. A tap of Shift
//      dashes him out of the way (a blow that lands during a dash misses). Its blows glow before
//      they land; a punch he dodges sticks in the rock (shoot it: the kraken is stunned); its ink
//      blinds him for a moment. Its mouth glows when it is open to the rifle. Four hits
//   4. it sinks away beaten; the relay's door opens and he goes in. What happens in there (the
//      puzzles, the uplink, the two endings) is the team's: see RELAY below
//
// If his health or his air runs out, ARIA restores him from backup at the last safe place. Every
// step has its sound (Level3Audio.js, as session.sfx). Each hit on the kraken clouds the water
// with its blood.

const TRENCH_TOP = -24;             // deeper than this (and east of the leg), the trench's lights take over
const TRENCH_LIGHTS = [             // colour, candela, range: in the relay, over its door, in the lair, at the cave's mouth
  [0xcfe8ff, 7, 9], [0xffb070, 6, 13], [0x3fffd0, 18, 30], [0x2fbfa0, 7, 16]
];
const WRAP_R = 6.0;                 // how far out round the relay its tentacles lie (its wall is at 5)
const DASH = { speed: 12, iframes: 0.4, cooldown: 0.85 };   // the dodge: a burst through the water
const INK_TIME = 4.5;               // seconds its ink blinds him
const OXYGEN_FULL = 240;            // (PrepRoom's OXYGEN)

// Inside the relay station is the team's (the puzzles, the uplink, the endings). enter(trench) is
// called once, when he first comes in through its door (the uplink cable still trails behind him:
// trench.s.swim, its end at trench.s.swim.plugged once it is plugged in somewhere). guide(trench),
// if given, returns the objective while he is in there: { text, target (a Vector3 or null), label }.
// trench.pts has the room's points (port, screen, bay: the empty corner for the puzzles, air)
export const RELAY = { enter: null, guide: null };

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
      mouth: at('PT_CaveMouth'), caveIn: at('PT_CaveInside'),
      lurk: at('PT_KrakenLurk'), lair: at('PT_KrakenLair'), respawn: at('PT_Respawn')
    };
    this.lightAt = [0, 1, 2, 3].map((i) => at('TRENCH_LIGHT_' + i));
    this.rockSpots = [];
    for (let i = 0; i < 16; i++) { const r = at('PT_LairRock_' + i); if (r) this.rockSpots.push(r); }
    this.caveFloor = this.pts.lurk.y - 0.6;
    this.stage = 'descend';
    this.time = 0;
    this.shake = 0;
    this.checkpoint = null;          // where ARIA restores him (null: the platform)
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._chest = new THREE.Vector3();
    this._doors(model);
    this._heights();
    this.wrapPaths = this._wraps();
    this._spots();
    this._sign();
    this._bossBar();
    this._dash = { cool: 0, iframes: 0 };
    this._onKey = (e) => {
      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) this._tryDash();
    };
    window.addEventListener('keydown', this._onKey);
    this.fight = new KrakenFight(this);
    this.ready = this.fight.ready;
    if (session.harpoon) session.harpoon.hitTest = (p0, p1) => this._spear(p0, p1);
  }

  get sfx() { return this.s.sfx; }

  // what a rifle's bullet meets between p0 and p1: the kraken, or rock (with the way the rock
  // faces there, for the bullet hole)
  _spear(p0, p1) {
    const hit = this.fight.spearTest(p0, p1);
    if (hit) {
      this.sfx?.cue(hit.flesh ? 'spearFlesh' : 'spearRock', hit.point);
      if (hit.flesh) {
        this._blood(hit.point, hit.big ? 2.2 : 1);
        // it screams at every one (not on top of itself, nor over the siren of a wound)
        const t = this.s.time;
        if (t >= (this._shriekAt || 0)) {
          this._shriekAt = t + 0.5;
          this.sfx?.cue('shriek' + (1 + Math.floor(Math.random() * 3)), hit.point);
        }
      }
      return hit;
    }
    const d = this._v.subVectors(p1, p0);
    const L = d.length();
    if (L < 1e-4) return null;
    d.divideScalar(L);
    const ray = this.s.physics.castRayNormal(p0, d, L);
    if (!ray) return null;
    const point = p0.clone().addScaledVector(d, ray.distance);
    this.sfx?.cue('spearRock', point);
    return { point, stick: null, normal: new THREE.Vector3(ray.normal.x, ray.normal.y, ray.normal.z) };
  }

  // ------------------------------------------------------------------ the doors
  _doors(model) {
    const make = (name, slide) => {
      const obj = model.getObjectByName(name);
      if (!obj) return null;
      return { obj, base: obj.position.clone(), slide, open: 0, target: 0, collider: null };
    };
    // (both slide sideways along the wall: three's z is the Blender's -y; the back hatch stays shut)
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
    this.sfx?.cue('relayDoor', d.obj.getWorldPosition(new THREE.Vector3()));
  }

  _moveDoors(dt) {
    for (const d of Object.values(this.doors)) {
      if (!d || d.open === d.target) continue;
      d.open = THREE.MathUtils.clamp(d.open + Math.sign(d.target - d.open) * dt / 1.6, 0, 1);
      const e = d.open * d.open * (3 - 2 * d.open);
      d.obj.position.copy(d.base).addScaledVector(d.slide, e);
    }
  }

  // ------------------------------------------------------------------ the ground
  // the floor's height between the relay and the lair, felt once with rays (every half metre)
  _heights() {
    const p = this.pts, x0 = p.inside.x - 10, x1 = p.lair.x + 10, z0 = p.inside.z - 18, z1 = p.inside.z + 18;
    const S = 0.5;
    const n = { x: Math.ceil((x1 - x0) / S) + 1, z: Math.ceil((z1 - z0) / S) + 1 };
    const h = new Float32Array(n.x * n.z);
    const down = new THREE.Vector3(0, -1, 0), from = new THREE.Vector3();
    // (the physics only finds shapes added since its last step once its queries are brought up to
    // date: the level's colliders were only just added)
    const world = this.s.physics.world;
    if (world.updateSceneQueries) world.updateSceneQueries();
    else world.step();
    for (let j = 0; j < n.z; j++) {
      for (let i = 0; i < n.x; i++) {
        const x = x0 + i * S, z = z0 + j * S;
        // (in the cave, felt from under its roof; outside, from well above the floor)
        const inCave = x > p.mouth.x - 2;
        const top = inCave ? this.caveFloor + 3.5 : this.caveFloor + 12;
        from.set(x, top, z);
        const d = this.s.physics.castRay(from, down, 30);
        let y = d === null ? this.caveFloor : top - d;
        if (inCave) y = Math.max(y, this.caveFloor - 0.1);
        h[j * n.x + i] = y;
      }
    }
    this._grid = { x0, z0, n, h, S };
  }

  _groundAt(x, z) {
    const g = this._grid;
    const fx = THREE.MathUtils.clamp((x - g.x0) / g.S, 0, g.n.x - 1.001), fz = THREE.MathUtils.clamp((z - g.z0) / g.S, 0, g.n.z - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j;
    const H = (ii, jj) => g.h[jj * g.n.x + ii];
    return (H(i, j) * (1 - a) + H(i + 1, j) * a) * (1 - b) + (H(i, j + 1) * (1 - a) + H(i + 1, j + 1) * a) * b;
  }

  // ------------------------------------------------------------------ its grip on the relay
  // Where the five tentacles holding the station lie (for KrakenFight.WRAPPERS, in order): out of
  // the lair along the cave's floor, out of its mouth, across to the relay's back, then round its
  // lower half at different heights and ways round, two of them across the door. Each: { points
  // (world), wrapFrom (the share of its length before it starts to wrap) }
  _wraps() {
    const c = this.pts.inside, F = this.caveFloor, mouth = this.pts.mouth.x;
    const RF = c.y - 0.1;
    const floor = (x, z, up) => new THREE.Vector3(x, Math.max(this._groundAt(x, z), x > mouth - 2 ? F : -999) + up, z);
    // way round (from, to: angles about the relay, 0 its back toward the cave, pi its door; north
    // is -z), heights over its floor at the start and end, and which side of the cave it keeps to
    const ways = [
      { from: 0.25, to: Math.PI + 0.55, h0: 0.4, h1: 1.3, side: 1.6 },          // south about, across the door low
      { from: -0.25, to: -Math.PI - 0.55, h0: 0.9, h1: 2.2, side: -1.6 },       // north about, across the door high
      { from: 0.5, to: 2.6, h0: 2.5, h1: 3.1, side: 3.2 },                      // high round the south wall
      { from: -0.5, to: -2.75, h0: -0.3, h1: 0.3, side: -3.2 },                 // low round the north, over its legs
      { from: -0.9, to: Math.PI - 0.1, h0: 3.0, h1: 0.7, side: -0.4 }           // the long one: over the north and down across the door
    ];
    return ways.map((w) => {
      const pts = [
        floor(mouth + 9, c.z + w.side * 0.6, 0.9),
        floor(mouth + 3, c.z + w.side * 0.8, 0.8),
        floor(mouth - 3, c.z + w.side, 0.8),
        floor(c.x + WRAP_R + 2.8, c.z + w.side * 1.2, 0.7)
      ];
      const before = pts.length;
      for (let k = 0; k <= 10; k++) {
        const f = k / 10, a = w.from + (w.to - w.from) * f;
        pts.push(new THREE.Vector3(c.x + Math.cos(a) * WRAP_R, RF + w.h0 + (w.h1 - w.h0) * f, c.z + Math.sin(a) * WRAP_R));
      }
      // (the share of its length before the wrap: measured from the lair's front)
      let lenBefore = 0, len = 0;
      const start = this.pts.lurk.clone().lerp(this.pts.lair, 0.45);
      let prev = start;
      pts.forEach((p, i) => {
        len += p.distanceTo(prev);
        if (i === before) lenBefore = len;
        prev = p;
      });
      return { points: pts, wrapFrom: lenBefore / len };
    });
  }

  // ------------------------------------------------------------------ E: the things he uses
  _spots() {
    const it = this.s.interact, p = this.pts;
    it.add({ id: 'relayDoor', position: p.door, radius: 0.9, label: 'Open the relay station door', when: () => this.doors.front?.target === 0, use: () => this._useDoor() });
  }

  // the door: held shut by its tentacles until it is beaten
  _useDoor() {
    if (!this.fight.free) {
      this.sfx?.cue('doorStuck', this.pts.door);
      this.shake = Math.max(this.shake, 0.3);
      this.s.say('doorHeld');
      if (this.stage === 'descend' || this.stage === 'front') this._toFollow();
      return;
    }
    this._open('front');
    this.checkpoint = this.pts.inside.clone().add(new THREE.Vector3(0, 0.3, 0));
    if (this.stage === 'free') this.stage = 'enter';
  }

  // the "pipes" round the relay: follow them
  _toFollow() {
    if (this.stage !== 'descend' && this.stage !== 'front') return;
    this.stage = 'follow';
    this.checkpoint = this.pts.respawn.clone();
    this.s.harpoon?.draw(true);
    this.sfx?.cue('draw');
    this.game.ui.showToast('Something is wrapped round the whole relay station, door and all. It runs back along the floor toward the cliff: follow it.', 7000);
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
    m.position.copy(this.pts.screen).add(new THREE.Vector3(0, 0, 0.03));   // (it faces south, into the room: three's +z)
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
    g.fillStyle = '#7fe8ff';
    g.fillText(this._screenText[0], 256, 110);
    g.font = 'bold 22px Courier New, monospace';
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
    this.sfx?.cue('krakenRoar', this.fight.kraken.mouthWorld());
    this.sfx?.cue('draw');
    this.s.say('kraken');
    this._showBoss(true);
    this.game.ui.showToast('It tore its tentacles off the station. TAP SHIFT to dash out of the way. Dodge its punch and shoot the arm while it is stuck; shoot its mouth when it glows (hold left click; R reloads).', 9000);
  }

  // a punch he dodged, driven into the rock
  onStuck(at) {
    this.sfx?.cue('stuck', at);
    if (!this._stuckTold) {
      this._stuckTold = true;
      this.game.ui.showToast('Its arm is stuck in the rock: SHOOT IT!', 3000);
    }
  }

  onStunned() {
    this.sfx?.cue('stun', this.fight.kraken.mouthWorld());
    this.game.ui.showToast('It is stunned, its mouth hanging open: shoot it!', 3000);
  }

  onRockGrab(at) {
    this.sfx?.cue('rockGrab', at);
  }

  onThrow(at) {
    this.sfx?.cue('rockThrow', at);
    if (!this._throwTold) {
      this._throwTold = true;
      this.game.ui.showToast('Boulder! Dash out of the way!', 2500);
    }
  }

  onRockSmash(at) {
    this.sfx?.cue('rockSmash', at);
  }

  // its ink: the water round him goes black for a while (denser, darker fog; a dark cloud; the
  // screen's edges close in)
  onInk(at) {
    this.sfx?.cue('ink', at);
    this._inkT = INK_TIME;
    if (!this._inkEl) {
      this._inkEl = document.createElement('div');
      this._inkEl.id = 'l3-ink';
      document.getElementById('ui-layer').appendChild(this._inkEl);
    }
    if (!this._inkTold) {
      this._inkTold = true;
      this.game.ui.showToast('Ink! It is coming at you out of the dark: keep moving.', 3000);
    }
  }

  _inkStep(dt) {
    this._inkT = Math.max(0, (this._inkT || 0) - dt);
    const k = Math.min(1, this._inkT / 1.0) * (this._inkT > INK_TIME - 0.6 ? (INK_TIME - this._inkT) / 0.6 : 1);
    this.sea.ink = k;                 // (SeaScene darkens its water with it)
    if (this._inkEl) this._inkEl.style.opacity = (k * 0.85).toFixed(3);
  }

  // it slips away into the murk; then it comes back at him out of the dark
  onStalk() {
    this.sfx?.cue('krakenHiss', this.fight.kraken.mouthWorld());
  }

  onAmbush() {
    this.sfx?.cue('snarl', this.fight.kraken.mouthWorld());
  }

  onWindup(kind) {
    this.sfx?.cue(kind === 'lunge' ? 'krakenGrowl' : 'windup', this.fight.kraken.mouthWorld());
  }

  onStrike(kind, at) {
    this.sfx?.cue(kind === 'punch' ? 'punchWhoosh' : kind === 'yank' ? 'stuck' : 'whoosh', at);
  }

  onSlam(at) {
    this.sfx?.cue('slam', at);
  }

  onLungeRush() {
    this._shriekAt = this.s.time + 1.5;
    this.sfx?.cue('lungeRoar', this.fight.kraken.mouthWorld());
  }

  onChomp() {
    this.sfx?.cue('chomp', this.fight.kraken.mouthWorld());
  }

  // the first time it lunges into his face, say what to do
  onLunge() {
    if (this._lungeTold) return;
    this._lungeTold = true;
    this.game.ui.showToast('Its mouth is right in front of you: shoot it now, or dash away before it bites!', 4000);
  }

  onOpen(on) {
    if (on && !this._mouthOpen && this.fight.attack?.kind !== 'lunge') this.sfx?.cue('scream', this.fight.kraken.mouthWorld());
    this._mouthOpen = on;
  }

  onHitPlayer(damage, from) {
    if (this._restoring) return;
    // (in the middle of a dash it misses him)
    if (this._dash.iframes > 0) {
      this._dodged();
      return false;
    }
    const c = this.s.controls;
    this.s.hud.flash();
    this.sfx?.cue('hurt');
    this.shake = Math.max(this.shake, 1.0);
    // knocked away through the water
    const away = this._v.set(c.position.x - from.x, 0.4, c.position.z - from.z).normalize();
    c.velocity.addScaledVector(away, 9);
    if (this.s.player.damage(damage)) this._restore('BACKUP RESTORED', 'RESTORED: CYCLE 9');
    return true;
  }

  onShrug() {
    if (this.stage !== 'fight') return;
    if (this._shrugT > 0) return;
    this._shrugT = 4;
    this.game.ui.showToast('It shrugs the spear off. Wait for its mouth to glow.', 2500);
  }

  onWounded(n, of) {
    this.shake = 1.2;
    this._shriekAt = this.s.time + 1.8;      // (its siren scream: no screeches over it)
    this._drawBoss(true);
    this.sfx?.cue('wounded', this.fight.kraken.mouthWorld());
    this.game.ui.showToast(`A hit! (${n} of ${of})`, 2500);
  }

  onBeaten() {
    this.shake = 2;
    this._drawBoss(true);
    setTimeout(() => this._showBoss(false), 2500);
    this.stage = 'free';
    this.s.harpoon?.draw(false);
    this.sfx?.cue('beaten', this.fight.kraken.mouthWorld());
    this.sfx?.setFight('over');
    this.checkpoint = this.pts.respawn.clone();
    this.game.ui.showToast('It lets go of the station and sinks back into the dark. The relay\'s door is free: get inside.', 6500);
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
    // (the kraken's body is not drawn from far off: the fog hides it there anyway. Its tentacles
    // reach the relay, so it stays on while he is anywhere near)
    const k = this.fight.kraken;
    if (this.fight.state !== 'gone') k.root.visible = p.distanceTo(this.pts.inside) < 90;
    this.fight.update(dt, playing ? chest : null, playing && !this._restoring);
    this.shake = Math.max(this.shake, this.fight.shake);
    this._lights(p);
    this._air(playing);
    this._sounds(dt, p);
    this._inkStep(dt);
    this._dashStep(dt);
    this._bloodStep(dt);
    // the camera shakes with its blows (after the controls have placed it)
    this.shake = Math.max(0, this.shake - dt * 1.6);
    if (this.shake > 0 && playing) {
      const cam = this.game.camera.instance, s = Math.min(1, this.shake) * 0.09;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
    }
  }

  // the kraken's presence and the fight's music
  _sounds(dt, p) {
    const sfx = this.sfx;
    if (!sfx) return;
    const F = this.fight;
    // in the fight it snarls between its blows, and when he is badly hurt his heart pounds
    if (F.state === 'fight' && !F.attack) {
      this._snarlT = (this._snarlT ?? 1.5) - dt;
      if (this._snarlT <= 0) {
        this._snarlT = 1.8 + Math.random() * 2.2;
        sfx.cue('snarl', F.kraken.mouthWorld());
      }
    }
    sfx.heartbeat(this.stage === 'fight' ? 1 - this.s.player.integrity / 100 : 0, dt);
    // while it lurks, now and then a growl or a hiss from the dark, if he is near; its grip on the
    // station creaks the hull
    if (F.state === 'lurk' || F.state === 'wait') {
      this._lurkT = (this._lurkT ?? 6) - dt;
      if (this._lurkT <= 0) {
        this._lurkT = 6 + Math.random() * 7;
        if (p.distanceTo(F.kraken.root.position) < 34) sfx.cue(Math.random() < 0.5 ? 'krakenHiss' : 'krakenGrowl', F.kraken.mouthWorld());
        else if (p.distanceTo(this.pts.inside) < 22) sfx.cue('hullStrain', this.pts.inside);
      }
    }
    // the music: creeping in as he follows the tentacles toward the lair, the fight's full weight,
    // the drums rising with its wounds, his injuries and its lunges
    if (this.stage === 'follow' || (this.stage === 'fight' && F.state === 'wait')) {
      sfx.setFight('dread');
      sfx.setIntensity(1 - Math.min(1, Math.max(0, (p.distanceTo(F.homeAt) - 12) / 30)));
    } else if (this.stage === 'fight') {
      sfx.setFight('fight');
      const lunging = F.attack?.kind === 'lunge' ? 0.25 : 0;
      sfx.setIntensity(F.wounds / 3 * 0.55 + (1 - this.s.player.integrity / 100) * 0.4 + lunging);
    }
  }

  // moving on when he gets where the step wants him
  _stages(p) {
    const P = this.pts;
    switch (this.stage) {
      case 'descend':
        if (p.distanceTo(P.front) < 14) {
          this.stage = 'front';
          this.s.say('relay').then(() => { if (this.stage === 'front') this._toFollow(); });
        } else if (!this._toldDescend && p.y < TRENCH_TOP + 10) {
          this._toldDescend = true;
          this.s.say('descend');
        }
        break;
      case 'enter':
        if (Math.hypot(p.x - P.inside.x, p.z - P.inside.z) < 3.8) {
          this.stage = 'inside';
          RELAY.enter?.(this);
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

  // where the marker points while he follows the tentacles: the cave's mouth, then its lair
  _followTarget(p) {
    return this.inCave(p) ? this.fight.kraken.root.position.clone().add(this._w.set(0, 3, 0)) : this.pts.mouth;
  }

  // the objective and the marker for this step
  guide() {
    const P = this.pts, p = this.s.controls.position;
    switch (this.stage) {
      case 'descend': return { text: 'Swim down to the relay station at the bottom of the trench', target: P.front, label: 'RELAY' };
      case 'front': return { text: 'Open the relay station door', target: P.door, label: 'DOOR' };
      case 'follow': return { text: 'Something huge covers the door. Follow the "pipes" and see where they go', target: this._followTarget(p), label: this.inCave(p) ? '???' : 'FOLLOW' };
      case 'fight': {
        const F = this.fight, tip = F.stuckTip(this._v);
        if (tip) return { text: 'Its arm is stuck in the rock: SHOOT IT (left click)', target: tip, label: 'ARM' };
        if (F.state === 'stunned') return { text: "It's stunned: shoot its mouth NOW", target: F.kraken.mouthWorld(this._v), label: 'MOUTH' };
        if (this._mouthOpen) return { text: 'NOW: shoot its glowing mouth (left click)', target: F.kraken.mouthWorld(this._v), label: 'MOUTH' };
        return { text: 'Beat the kraken: TAP SHIFT to dash from its blows, shoot a stuck arm, shoot its mouth when it glows', target: null };
      }
      case 'free': return { text: 'It let go. Get into the relay station', target: P.door, label: 'DOOR' };
      case 'enter': return { text: 'Go inside the relay station', target: P.inside, label: 'IN' };
      case 'inside': return RELAY.guide?.(this) || { text: 'Inside the relay station', target: null };
      default: return { text: 'Uplink established', target: null };
    }
  }

  // ------------------------------------------------------------------ its blood
  // A cloud of dark blood blooming in the water where a bolt went in (bigger for a wound), drifting
  // up and thinning away. Soft sprites, a handful a hit, kept to a few dozen at once
  _blood(at, size = 1) {
    this._bloodTex ||= bloodTexture();
    this._clouds ||= [];
    const n = Math.round(5 * size) + 2;
    for (let k = 0; k < n; k++) {
      if (this._clouds.length > 70) this._clouds.shift().sprite.removeFromParent();
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._bloodTex, color: k % 3 === 0 ? 0x9c140e : 0x5c0806, transparent: true, depthWrite: false, opacity: 0.85, rotation: Math.random() * 6.28
      }));
      sprite.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.6 * size, (Math.random() - 0.5) * 0.6 * size, (Math.random() - 0.5) * 0.6 * size));
      this.sea.group.add(sprite);
      this._clouds.push({
        sprite, life: 0, max: 2.5 + Math.random() * 1.5 * size, grow: (1.2 + Math.random()) * size,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.25 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8)
      });
    }
  }

  _bloodStep(dt) {
    if (!this._clouds) return;
    for (let i = this._clouds.length - 1; i >= 0; i--) {
      const c = this._clouds[i];
      c.life += dt;
      const f = c.life / c.max;
      c.sprite.position.addScaledVector(c.vel, dt);
      c.vel.multiplyScalar(Math.exp(-0.8 * dt));
      c.sprite.scale.setScalar(0.3 + c.grow * Math.sqrt(f) * 2.2);
      c.sprite.material.opacity = 0.85 * (1 - f) * Math.min(1, c.life * 6);
      if (f >= 1) {
        c.sprite.removeFromParent();
        c.sprite.material.dispose();
        this._clouds.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------ the dodge
  // A tap of Shift out in the water: a burst the way he is pushing (or back, away from it), and
  // for a moment blows pass through him
  _tryDash() {
    const c = this.s.controls;
    if (!c.swimming || this._dash.cool > 0 || this.game.state !== 'PLAYING' || this.stage === 'descend') return;
    const cam = this.game.camera.instance, k = c.keys;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3(Math.cos(cam.rotation.y), 0, -Math.sin(cam.rotation.y));
    const dir = new THREE.Vector3();
    if (k.forward) dir.add(fwd);
    if (k.back) dir.sub(fwd);
    if (k.right) dir.add(right);
    if (k.left) dir.sub(right);
    if (k.jumpHeld) dir.y += 1;
    if (k.crouch) dir.y -= 1;
    if (dir.lengthSq() < 0.01) dir.copy(fwd).negate();
    dir.normalize();
    c.velocity.addScaledVector(dir, DASH.speed);
    this._dash.cool = DASH.cooldown;
    this._dash.iframes = DASH.iframes;
    this._fovKick = 1;
    this.sfx?.cue('dash');
  }

  _dashStep(dt) {
    this._dash.cool = Math.max(0, this._dash.cool - dt);
    this._dash.iframes = Math.max(0, this._dash.iframes - dt);
    // (the view widens for a moment as he shoots off)
    const cam = this.game.camera.instance;
    this._fovBase ??= cam.fov;
    this._fovKick = Math.max(0, (this._fovKick || 0) - dt * 3);
    const want = this._fovBase + this._fovKick * 7;
    if (Math.abs(cam.fov - want) > 0.01) {
      cam.fov = want;
      cam.updateProjectionMatrix();
    }
  }

  _dodged() {
    this._dodgeT = performance.now();
    this.sfx?.cue('dodge');
    this.game.ui.showToast('DODGED', 900);
  }

  // ------------------------------------------------------------------ the boss bar
  _bossBar() {
    const el = document.createElement('div');
    el.id = 'l3-boss';
    el.innerHTML = '<div class="b-name">THE KRAKEN</div><div class="b-bar"></div>';
    document.getElementById('ui-layer').appendChild(el);
    this._bossEl = el;
    this._drawBoss(false);
  }

  _showBoss(on) {
    this._bossEl?.classList.toggle('on', on);
  }

  _drawBoss(flash) {
    const bar = this._bossEl?.querySelector('.b-bar');
    if (!bar) return;
    const of = WOUNDS_TOTAL, left = of - (this.fight?.wounds || 0);
    bar.innerHTML = Array.from({ length: of }, (_, i) => `<div class="${i < left ? 'on' : ''}"></div>`).join('');
    if (flash) {
      this._bossEl.classList.remove('hit');
      void this._bossEl.offsetWidth;
      this._bossEl.classList.add('hit');
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    this._bossEl?.remove();
    this._inkEl?.remove();
    this.sea.ink = 0;
    this.fight?.dispose();
    for (const d of Object.values(this.doors)) if (d) this._block(d, false);
    this._end?.remove();
  }
}

// a soft, ragged blot (for the blood clouds)
function bloodTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  for (let k = 0; k < 9; k++) {
    const x = 32 + (Math.random() - 0.5) * 22, y = 32 + (Math.random() - 0.5) * 22, r = 10 + Math.random() * 14;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

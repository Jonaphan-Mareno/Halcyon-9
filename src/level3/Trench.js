import * as THREE from 'three';
import { KrakenFight, WOUNDS as WOUNDS_TOTAL } from './KrakenFight.js';
import { SEA } from './SeaScene.js';
import { PLAN } from './Works.js';
import { PressureSeal } from './PressureSeal.js';
import { RelayLock } from './RelayLock.js';

// The bottom of the trench and the drowned works behind the cliff (Level 3): the kraken, the maze,
// the fight, and the shaft down to the buried relay. The works are Blender/scripts/build_l3_works.py
// (Works.js); the kraken is KrakenFight.js (its fight and blows) and KrakenHunt.js (what it does
// in the maze, its entrances and its escape).
//
//   1. down from the platform to the lights at the bottom of the trench: the works' entrance in
//      the cliff (ARIA: the relay is inside, at the back, down the old excavation shaft)
//   2. into the works: a maze, dark, decked over with grating, the kraken somewhere over it. Follow
//      the marker through. It stalks him over the decks (its glow through the grating), lights up
//      in its den behind bars as he passes, drives an arm down through the deck at him, takes him
//      with one (shoot the arm), bursts out of a wall beside him
//   3. the clearing: the shutter slams behind him, the floodlights stutter on and it bursts up out
//      of the floor: the fight. It comes for him (sweeps, punches, slams, boulders, grabs, lunges
//      that bite); its mouth glows after a blow: shoot it. Five wounds and the finale: it crashes
//      down through the gantry and the clearing comes down round them (the crane, a floodlight
//      mast, the scaffolding), the lights swinging. Seven and it is beaten: it tears the east gate
//      away and escapes into a crack in the rock
//   4. the shaft's cover swings open: down the shaft and the sand tunnel to the buried relay room.
//      He is spent after the fight: slower, out of breath, stopping now and then, and silent until
//      the confrontation. In the room the control room's hatch is sealed and the flood has shorted
//      the network (ARIA cannot reach it): he reroutes the power at the terminal (Simphiwe's
//      minigame), the water lock behind the hatch opens, and in it the scene that leads into the
//      confrontation (RelayLock.js). The rest of the room (the endings) is the team's: see RELAY
//
// A tap of Shift dashes him out of the way (a blow that lands during a dash misses). If his health
// or his air runs out, ARIA restores him from backup at the last safe place (the works' entry, the
// clearing). The works' air stations fill his tanks. Every step has its sound (Level3Audio.js, as
// session.sfx); each hit on the kraken clouds the water with its blood.

const TRENCH_TOP = -24;             // deeper than this (and east of the leg), the trench's lights take over
// the four borrowed lights, by where he is: their places (Works' WL_ points; null: moved here) and
// colour, candela, range
const LIGHT_SETS = {
  trench: { at: ['WL_Trench_0', 'WL_Trench_1', 'WL_Trench_2', 'WL_Trench_3'], spec: [[0xffb070, 30, 15], [0xcfe8ff, 24, 15], [0x3fffd0, 30, 26], [0x2fbfa0, 20, 16]] },
  works: { at: ['WL_Works_0', 'WL_Works_1', null, null], spec: [[0xe8f0ff, 320, 55], [0xffd8a0, 260, 55], [0xc8dcff, 22, 16], [0x3fffd0, 40, 20]] },
  relay: { at: ['WL_Relay_0', 'WL_Relay_1', 'WL_Relay_2', 'WL_Relay_3'], spec: [[0xcfe8ff, 34, 14], [0xffc890, 16, 11], [0xcfe8ff, 16, 10], [0xffc890, 24, 16]] }
};
const DASH = { speed: 12, iframes: 0.4, cooldown: 0.85 };   // the dodge: a burst through the water
const INK_TIME = 4.5;               // seconds its ink blinds him
const OXYGEN_FULL = 240;            // (PrepRoom's OXYGEN)
const AIR_RATE = 70;                // seconds of air a second at a station
const LOW_AIR = 70;                 // under this many seconds, the marker points to the nearest station
const REACH = 4.5;                  // metres from a route point that counts as there
const FINALE_AT = 5;                // the wounds at which the finale begins
// the finale: what comes down when (seconds into it), besides the gantry it crashes through
const FINALE = [[8, 'FALL_Scaff_0'], [18, 'FALL_Crane'], [27, 'FALL_Scaff_1'], [36, 'FALL_Tower'], [46, 'FALL_Scaff_2']];
// spent, after the fight: his swimming speed, and now and then a pause where he hangs in the water
// to get his breath (every `every` seconds of swimming, for `pause` seconds, at `rest` of his speed)
const SPENT = { speed: 0.8, rest: 0.18, pause: 1.1, every: [9, 14] };
// the relay room's screen: before the reroute, and after (the third line: RELAY_LOCKDOWN_LINE)
const SCREEN_SEALED = ['CONTROL ROOM SEALED', 'PUMPS: NO SIGNAL · FLOOD PROTOCOL'];
const SCREEN_WON = ['PUMPS ONLINE', 'WATER LOCK: READY'];
// Owner's choice (docs/relay-lock-plan.md, optional): the lockdown he is breaking is his own, set
// the night of Flashback 3. true adds a quiet third line to the screen once the reroute is won
const RELAY_LOCKDOWN_LINE = false;

// Inside the relay room is the team's (the puzzles, the uplink, the endings). enter(trench) is
// called once, when he first comes into the room (the uplink cable still trails behind him:
// trench.s.swim, its end at trench.s.swim.plugged once it is plugged in somewhere). guide(trench),
// if given, returns the objective while he is in there: { text, target (a Vector3 or null), label }.
// trench.pts has the room's points (port, screen, bay: the empty corner for the puzzles, air, hatch)
export const RELAY = { enter: null, guide: null };

export class Trench {
  constructor(session) {
    this.s = session;
    this.game = session.game;
    this.sea = session.sea;
    this.scene = session.game.scene;
    this.works = this.sea.works;
    const P = this.works.pts, model = this.sea.model;
    const at = (name) => (P[name] ? P[name].clone() : model.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()) || null);
    this.pts = {
      front: at('PT_WorksFront'), inside: at('PT_RelayInside'),
      port: at('PT_RelayPort'), screen: at('PT_RelayScreen'), air: at('PT_AirRefill'), bay: at('PT_PuzzleBay'), hatch: at('PT_RelayHatch'),
      mouth: at('PT_CaveMouth'), caveIn: at('PT_CaveInside'), lurk: at('PT_KrakenLurk'), lair: at('PT_KrakenLair'),
      respawn: at('PT_Respawn'), clear: at('PT_Clear'), entry: at('PT_Entry'), shaftTop: at('PT_ShaftTop'),
      shaftBottom: at('PT_ShaftBottom'), roomDoor: at('PT_RoomDoor'), crack: at('PT_Crack')
    };
    // the way down once it is beaten: the shaft, the tunnel, the room
    this._down = [this.pts.shaftTop, this.pts.shaftBottom, at('PT_Tunnel_0'), at('PT_Tunnel_1'), at('PT_Tunnel_2'), this.pts.roomDoor].filter(Boolean);
    this.rockSpots = [];
    for (let i = 0; i < 16; i++) { const r = at('PT_LairRock_' + i); if (r) this.rockSpots.push(r); }
    this.caveFloor = PLAN.F;
    this.stage = 'descend';
    this.huntNo = 0;
    this.showNo = 0;
    this.step = 0;
    this._postBossDescentPlayed = false;
    this._relayBriefingDone = false;
    this.time = 0;
    this.shake = 0;
    this.checkpoint = null;          // where ARIA restores him (null: the platform)
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this._u2 = new THREE.Vector3();
    this._chest = new THREE.Vector3();
    this.works.onSound = (name, p) => this.sfx?.cue(name, p);
    this.wrapPaths = [];             // (nothing for its arms to hold now: it is in the works)
    this._sign();
    this.pressureSeal = new PressureSeal(this);
    this.lock = new RelayLock(this);   // the water lock behind the relay room, and the scene in it
    this._spots();
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

  // what a rifle's bullet meets between p0 and p1: the kraken (if nothing solid is in the way), or
  // what is solid (with the way it faces there, for the bullet hole)
  _spear(p0, p1) {
    const d = this._v.subVectors(p1, p0);
    const L = d.length();
    if (L < 1e-4) return null;
    d.divideScalar(L);
    const ray = this.s.physics.castRayNormal(p0, d, L);
    const end = ray ? p0.clone().addScaledVector(d, ray.distance) : p1.clone();
    const normal = ray ? new THREE.Vector3(ray.normal.x, ray.normal.y, ray.normal.z) : null;
    const hit = this.fight.spearTest(p0, end);
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
    if (!ray) return null;
    this.sfx?.cue('spearRock', end);
    return { point: end, stick: null, normal };
  }

  // ------------------------------------------------------------------ the relay room's terminal
  // (Simphiwe's: the manual reroute, the submarine hack minigame in src/submarineHack, opened in a
  // window over the game; moved here from the old relay pod. Won, it brings back the water lock's
  // pumps: RelayLock)
  _spots() {
    const it = this.s.interact, p = this.pts;
    it.add({ id: 'relayScreen', position: p.screen, radius: 0.8, reach: 3.2,
      label: 'Reroute power at the relay terminal',
      when: () => this._canOpenHack(),
      use: () => this._openHack() });
  }

  _canOpenHack() {
    return this.stage === 'inside' && this.fight?.free && this._relayBriefingDone &&
      !!this.pressureSeal?.state.solved && !this._uplinkOverridden && !this._hackFrame;
  }

  _openHack() {
    if (!this._canOpenHack()) return;
    // Level 3 normally owns a locked pointer for mouse-look. Release it and freeze its controls so
    // the embedded hack gets a normal cursor and the parent camera cannot respond to mouse input.
    this.game._relayHackActive = true;
    this.s.controls.stop();
    document.exitPointerLock?.();
    const shade = document.createElement('div');
    shade.className = 'l3-hack-overlay';
    shade.innerHTML = '<section class="l3-hack-window" role="dialog" aria-modal="true" aria-label="Relay manual reroute"><button class="l3-hack-close" type="button" aria-label="Close reroute">×</button><iframe title="Relay manual reroute" src="./submarine-hack.html"></iframe></section>';
    document.body.append(shade);
    this._hackFrame = shade.querySelector('iframe');
    const close = (event) => {
      event?.stopPropagation();
      shade.remove();
      this._hackFrame = null;
      window.removeEventListener('message', onMessage);
      this.game._relayHackActive = false;
      if (!this.s.disposed) this.s.controls.instance.enabled = true;
    };
    const onMessage = (event) => {
      if (event.origin !== window.location.origin || event.source !== this._hackFrame?.contentWindow || event.data?.type !== 'halcyon-submarine-hack-won') return;
      this._uplinkOverridden = true;
      this._screenText = RELAY_LOCKDOWN_LINE ? [...SCREEN_WON, 'LOCKDOWN AUTH: VOSS, E. · RELEASED'] : SCREEN_WON;
      this._drawSign();
      close();
      // the pumps are back: the water lock opens (and in it, the way to the confrontation)
      this.lock.unseal();
      this.s.say('relayWon');
    };
    window.addEventListener('message', onMessage);
    shade.querySelector('.l3-hack-close').addEventListener('click', close);
    shade.addEventListener('click', (event) => { if (event.target === shade) close(event); });
  }

  // (the old relay pod's doors: there are none now; kept for the team's relay shortcut)
  _open() {}

  // the relay room's screen over the console: what it says
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
    this._screenText = SCREEN_SEALED;
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
    if (this._screenText[2]) {
      g.font = 'bold 16px Courier New, monospace';
      g.fillStyle = '#7fe8ff';
      g.fillText(this._screenText[2], 256, 212);
    }
    this._signTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ the maze and the fight
  // into the works: the kraken is in here with him; the marker leads through the maze
  _enterWorks() {
    this.stage = 'hunt';
    this.huntNo = 1;
    this.step = 0;
    this.fight.startHunt();
    this.checkpoint = this.pts.entry.clone();
    this._showBoss(true);
    this.s.harpoon?.draw(true);
    this.sfx?.cue('draw');
    this.s.say(['l3-cave']);
    this.game.ui.showToast('Follow the marker through the works. Watch above you.', 5000);
  }

  // he has come into the clearing: the way shut behind him, and it comes up out of the floor
  _startShow() {
    this.stage = 'show';
    this.showNo = 1;
    const W = this.works, F = this.fight;
    F.hunt.clear();
    W.setShutter('W1', false);
    W.floods(true);
    F.woundLimit = FINALE_AT;
    F.arena.c.copy(this.pts.clear).setY(F.floorY);
    F.attack = null;
    F._set('fight');
    F.mode = 'hunt';
    F.hunt.start('rise', { then: () => { F.mode = 'arena'; F.next = 0.6; F._charge = true; } });
    this.checkpoint = this._clearingEntry();
    this._topUpAir(true);
    this._showBoss(true);
    this.game.ui.showToast('The shutter slams down behind you!', 3000);
  }

  // a little way into the clearing from the door he came in by
  _clearingEntry() {
    const door = this.works.doorPoint('W1');
    const toward = this._v.subVectors(this.pts.clear, door).setY(0).normalize();
    return door.clone().addScaledVector(toward, 4).setY(PLAN.F + 1.0);
  }

  // where he is along the hunt's route: reaching its points sets off what happens there
  _huntStep(p) {
    const route = this.works.routes[this.huntNo];
    if (!route) return;
    const chest = this._chest.set(p.x, p.y + 1.1, p.z);
    // (he may cut a corner: the next few points count)
    for (let k = this.step; k < Math.min(route.length, this.step + 3); k++) {
      if (route[k] && route[k].p.distanceTo(chest) < REACH) {
        this._reach(route, k);
        break;
      }
    }
  }

  _reach(route, k) {
    for (let i = this.step; i <= k; i++) {
      const ev = route[i]?.event;
      if (!ev) continue;
      if (ev === 'end') {
        this.step = route.length;
        this._startShow();
        return;
      }
      this.fight.hunt.trigger(ev, route[i].p.clone());
    }
    this.step = k + 1;
  }

  // ------------------------------------------------------------------ the fight's events
  // (not used: it never sleeps holding anything now)
  onRoar() {}

  // five wounds: the finale. It goes up and crashes down through the gantry, and the clearing
  // starts to come down
  onPhaseEnd() {
    const F = this.fight;
    F.woundLimit = WOUNDS_TOTAL;
    this._finale = { t: 0, next: 0 };
    F.hunt.start('crash', { then: () => { F.mode = 'arena'; F.next = 0.8; } });
  }

  // (the finale: it comes down through the gantry)
  onCrash() {
    this.works.drop('FALL_Gantry', true);
    this.shake = Math.max(this.shake, 1.6);
    this.s.say('finale');
  }

  // (the first showdown: up out of the clearing's floor)
  onRise(at) {
    this._sand(at);
  }

  // (beaten: it digs down into the clearing's floor and is gone)
  onDig(at) {
    this._sand(at);
    this.shake = Math.max(this.shake, 0.8);
    this.sfx?.cue('rockSmash', at);
  }

  // (its den's window: his eyes are drawn to it; the first full sight of it)
  onScareLook(at) {
    this._look = { at: at.clone(), t: 1.1 };
    if (!this._krakenSaid) setTimeout(() => this.s.say(['l3-kraken-0']), 1500);
    this._krakenSaid = true;
  }

  // (it passes low over him: the deck rattles, grit sifts down)
  onCreepOver(at) {
    this.sfx?.cue('deckRattle', at);
    this.shake = Math.max(this.shake, 0.35);
    const p = this.s.controls.position;
    this._grit(new THREE.Vector3(p.x, PLAN.F + PLAN.ROOF - 0.3, p.z));
  }

  onThud() {
    this.shake = Math.max(this.shake, 0.4);
  }

  onPocket() {
    this.game.ui.showToast("It's coming down! Dash (Shift) from its blows, shoot its arms, shoot its mouth to drive it off.", 4500);
  }

  onDrivenOff() {
    this.game.ui.showToast('It pulls back, shrieking!', 2000);
  }

  // a punch he dodged, driven into the floor
  onStuck(at) {
    this.sfx?.cue('stuck', at);
    if (!this._stuckTold) {
      this._stuckTold = true;
      this.game.ui.showToast('Its arm is stuck: SHOOT IT!', 3000);
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
    // (in the finale, a slam near something still standing brings it down)
    if (this._finale && this.stage === 'show') {
      for (const name of this.works.pieces) {
        const f = this.works.falls[name];
        if (f.state === 'still' && f.obj.position.distanceTo(at) < 9) { this.works.drop(name); break; }
      }
    }
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
    if (this.stage !== 'show') return;
    if (this._shrugT > 0) return;
    this._shrugT = 4;
    this.game.ui.showToast('It shrugs the shot off. Wait for its mouth to glow.', 2500);
  }

  onWounded(n, of) {
    this.shake = 1.2;
    this._shriekAt = this.s.time + 1.8;      // (its siren scream: no screeches over it)
    this._drawBoss(true);
    this.sfx?.cue('wounded', this.fight.kraken.mouthWorld());
    this.game.ui.showToast(`A hit! (${n} of ${of})`, 2500);
    // (in the finale every wound brings something down)
    if (this._finale && n > FINALE_AT) this._dropNext();
  }

  onBeaten() {
    this.shake = 2;
    this._screenText = ['ARIA TERMINAL ONLINE', 'ACCESS GRANTED: UPLINK OVERRIDE'];
    this._drawSign();
    this._drawBoss(true);
    setTimeout(() => this._showBoss(false), 2500);
    this.stage = 'fleeing';
    this._finale = null;
    this.s.harpoon?.draw(false);
    this.sfx?.cue('beaten', this.fight.kraken.mouthWorld());
    this.sfx?.setFight('over');
    this.game.ui.showToast('It is beaten! It tears the east gate away and digs down into the floor.', 5000);
  }

  // it is gone into the crack: the shaft's cover opens
  onFled() {
    this.stage = 'free';
    this.step = 0;
    this.works.openShaft();
    this.checkpoint = this.pts.shaftTop.clone();
    this.game.ui.showToast("It's gone, down into the rock. The shaft's cover is open: get down to the relay.", 6000);
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
    this._stages(p);
    // (the kraken is not drawn from far off: the fog hides it there anyway)
    const k = this.fight.kraken;
    if (this.fight.state !== 'gone' && this.fight.state !== 'hidden') k.root.visible = p.distanceTo(k.root.position) < 85;
    this.fight.update(dt, playing ? chest : null, playing && !this._restoring);
    this.shake = Math.max(this.shake, this.fight.shake);
    this._held(dt, playing);
    if (playing && !this.fight.grabbing) this._solidKraken();
    this.works.update(dt, p, (dmg, from) => this.onHitPlayer(dmg, from));
    this.pressureSeal?.update(dt);
    // (the safety net under the works: outside the shaft, the tunnel and the room, he is put back
    // where he last was inside them)
    if (this.works.below(p)) {
      if (this.works.inWayDown(p) || this.lock.contains(p, 0.3)) (this._safe ||= new THREE.Vector3()).copy(p);
      else if (this._safe) {
        c.teleport(this._safe);
        c.velocity.set(0, 0, 0);
      }
    }
    this.shake = Math.max(this.shake, this.works.shake || 0);
    this._finaleStep(dt);
    this.lock.update(dt, p);
    this._spentStep(dt, playing);
    this._lights(p);
    this._air(dt, playing, p);
    this._sounds(dt, p);
    this._inkStep(dt);
    this._dashStep(dt);
    this._bloodStep(dt);
    this._lookStep(dt, playing);
    // the camera shakes with its blows (after the controls have placed it)
    this.shake = Math.max(0, this.shake - dt * 1.6);
    if (this.shake > 0 && playing) {
      const cam = this.game.camera.instance, s = Math.min(1, this.shake) * 0.09;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
    }
  }

  // moving on when he gets where the step wants him
  _stages(p) {
    const P = this.pts;
    switch (this.stage) {
      case 'descend':
        if (p.distanceTo(P.front) < 16) {
          this.stage = 'front';
          this.checkpoint = P.respawn.clone();
          this.s.say('works');
        } else if (!this._toldDescend && p.y < TRENCH_TOP + 10) {
          this._toldDescend = true;
          this.s.say('descend');
        }
        if (this.inCave(p)) this._enterWorks();
        break;
      case 'front':
        if (this.inCave(p)) this._enterWorks();
        break;
      case 'hunt':
        this._huntStep(p);
        break;
      case 'free':
      case 'down': {
        // down the shaft, along the tunnel, into the room
        this.stage = 'down';
        const at = this._down[this.step];
        const chest = this._chest.set(p.x, p.y + 1.1, p.z);
        if (at && at.distanceTo(chest) < (this.step === 0 ? 3.2 : 3.0)) {
          this.step++;
          if (this.step === 1 && !this._postBossDescentPlayed) {
            this._postBossDescentPlayed = true;
            this._postBossDescentPromise = this.s.say('postBossDescent');
          }
          if (this.step === 2) this.checkpoint = P.shaftBottom.clone();
        }
        if (Math.hypot(p.x - P.inside.x, p.z - P.inside.z) < 3.8 && Math.abs(p.y - P.inside.y) < 3) {
          this.stage = 'inside';
          this.checkpoint = P.inside.clone().add(new THREE.Vector3(0, 0.3, 0));
          RELAY.enter?.(this);
          this.s.preloadConfrontation?.();       // (the confrontation's clips and its Voss, readied now)
          this.lock.prepare();                    // (and the lock's scene: a copy of him in the suit)
          this._relayBriefingDone = false;
          (this._postBossDescentPromise || Promise.resolve()).then(() => {
            if (this.s.disposed || this.stage !== 'inside') return false;
            return this.s.say('relayEnter');
          }).then(() => {
            if (!this.s.disposed && this.stage === 'inside') this._relayBriefingDone = true;
          });
        }
        break;
      }
    }
  }

  // the finale: things come down on a schedule, and with every wound
  _finaleStep(dt) {
    const f = this._finale;
    if (!f || this.stage !== 'show' || this.fight.mode !== 'arena') return;
    f.t += dt;
    while (f.next < FINALE.length && f.t >= FINALE[f.next][0]) this._dropNext();
  }

  _dropNext() {
    const f = this._finale;
    while (f && f.next < FINALE.length) {
      const name = FINALE[f.next++][1];
      if (this.works.drop(name)) {
        this.game.ui.showToast('LOOK OUT! It is coming down!', 2000);
        return;
      }
    }
  }

  // the four borrowed lights: by where he is (the relay's hatch out on the trench floor; the works:
  // two floodlights, a light near him along his way or on what the kraken is doing, a glow on the
  // kraken; down below: the room, the tunnel, the shaft)
  _lights(p) {
    const borrowed = this.s.prep?.borrowed;
    if (!borrowed || this.s.prep.zone !== 'sea') { this._region = null; return; }
    const W = this.works;
    const region = this.lock.lit(p) ? 'lock' : W.below(p) ? 'relay' : (W.inHall(p) || this.inCave(p)) ? 'works' : (p.y < TRENCH_TOP && p.x > -16) ? 'trench' : 'sea';
    if (region !== this._region) {
      this._region = region;
      borrowed.forEach((b, i) => {
        const set = region === 'lock' ? this.lock.lightSet : LIGHT_SETS[region];
        const to = set ? (set.at[i]?.isVector3 ? set.at[i] : set.at[i] ? W.pts[set.at[i]] : null) : this.sea.lights[i];
        const spec = set ? set.spec[i] : SEA.LIGHTS[i];
        if (to) b.light.position.copy(to);
        if (!spec) return;
        b.light.color.setHex(spec[0]);
        b.light.intensity = spec[1];
        b.light.distance = spec[2];
      });
    }
    if (region === 'lock') return this.lock.lightStep(borrowed);
    if (region !== 'works') return;
    const S = LIGHT_SETS.works.spec;
    // the floodlights: on with the clearing's floods; in the finale they swing and stutter
    const fl = W.floodLevel * W.floodFlick;
    const fin = this._finale && this.stage === 'show';
    const flick = fin && Math.random() < 0.04 ? 0.2 : 1;
    for (const i of [0, 1]) {
      const b = borrowed[i];
      const base = W.pts[LIGHT_SETS.works.at[i]];
      if (!b || !base) continue;
      b.light.position.copy(base);
      if (fin) b.light.position.add(this._v.set(Math.sin(this.time * 0.9 + i * 2) * 4, -Math.abs(Math.sin(this.time * 0.9 + i * 2)) * 1.5, Math.cos(this.time * 0.7 + i) * 4));
      b.light.intensity = S[i][1] * fl * flick;
    }
    // the light near him: what the kraken shows him, else ahead along his way, under the decks
    const near = borrowed[2], hunt = this.fight.hunt;
    if (near) {
      if (hunt.light) {
        near.light.position.copy(hunt.light.at);
        near.light.intensity = hunt.light.power;
        near.light.distance = 16;
      } else if (this.stage === 'show' || W.inClearing(p)) {
        near.light.intensity = 0;
      } else {
        const next = this.stage === 'hunt' ? W.routes[this.huntNo]?.[this.step]?.p : null;
        const toward = next ? this._v.subVectors(next, p).setY(0) : this._v.set(0, 0, 0);
        if (toward.lengthSq() > 1) toward.setLength(5);
        near.light.position.set(p.x + toward.x, Math.min(p.y + 3.5, PLAN.F + PLAN.ROOF - 0.8), p.z + toward.z);
        near.light.intensity = S[2][1];
        near.light.distance = S[2][2];
      }
    }
    // its glow: a light on the kraken, so its shape shows through the grating and in the dark
    const glow = borrowed[3];
    if (glow) {
      const k = this.fight.kraken;
      const on = this.fight.state !== 'gone' && k.root.visible;
      glow.light.position.copy(k.root.position).add(this._v.set(0, -1.5, 0));
      glow.light.intensity = on ? S[3][1] * (0.85 + 0.15 * Math.sin(this.time * 1.7)) : 0;
    }
  }

  // air: the works' stations fill his tanks; running out, ARIA restores him too
  _air(dt, playing, p) {
    const prep = this.s.prep;
    if (!prep) return;
    // (the relay room has its own air line: in there, and while the terminal's hack is open, his
    // tanks stay full)
    if (this.stage === 'inside' || this.game._relayHackActive) {
      prep.oxygen = OXYGEN_FULL;
      return;
    }
    if (playing && prep.breathing && this.works.atAir(p) && prep.oxygen < OXYGEN_FULL - 0.5) {
      prep.oxygen = Math.min(OXYGEN_FULL, prep.oxygen + AIR_RATE * dt);
      if (!this._filling) {
        this._filling = true;
        this.sfx?.cue('refill');
        if (!this._airTold) {
          this._airTold = true;
          this.game.ui.showToast('An air station: your tanks are filling.', 3000);
        }
      }
    } else this._filling = false;
    if (playing && prep.breathing && prep.oxygen <= 0 && !this._restoring) this._restore('OXYGEN DEPLETED', 'RESTORED FROM BACKUP');
  }

  // (a showdown starts with his tanks topped up from the works' air line)
  _topUpAir(say) {
    const prep = this.s.prep;
    if (!prep?.breathing || prep.oxygen > OXYGEN_FULL - 20) return;
    prep.oxygen = OXYGEN_FULL;
    this.sfx?.cue('refill');
    if (say) setTimeout(() => this.game.ui.showToast('ARIA tops up your tanks from the works\' air line.', 3000), 3500);
  }

  // where the marker points when he is low on air (null: not low, or busy fighting)
  _airGuide(p) {
    const prep = this.s.prep;
    if (!prep?.breathing || prep.oxygen > LOW_AIR || !this.works.inHall(p)) return null;
    if (this.fight.grabbing || this.fight.hunt.job?.name === 'pocket') return null;
    const { at } = this.works.nearestAir(p);
    return at ? { text: 'Air running low: get to an air station (the green rings)', target: at, label: 'AIR' } : null;
  }

  // (a life spent; with none left the level starts over - except against the kraken, where he
  // starts again outside its lair with his lives back, rather than the whole level again)
  _restore(title, sub) {
    this._restoring = true;
    const p = this.s.player;
    if (p.useRestore()) {
      sub += `   |   Lives left: ${p.restores}`;
    } else if ((this.stage === 'hunt' || this.stage === 'show') && !p.difficulty.permadeath) {
      p.deaths++;
      p.restores = p.maxRestores;
      // (the fight from the start, unless the place is already coming down round it)
      if (this.stage === 'show' && this.fight.woundLimit === FINALE_AT) this.fight.wounds = 0;
      sub = 'All backups spent: starting again outside its lair';
    } else {
      this.game.sessionGameOver(this.s.hud, p);
      return;
    }
    this.s.hud.showDeath(title, sub);
    const kind = this._resetKind();
    setTimeout(() => {
      if (this.s.disposed) return;
      this.s.hud.hideDeath();
      this.s.player.integrity = 100;
      this.s.prep.oxygen = OXYGEN_FULL;
      const at = this.checkpoint || this.sea.points.platform?.clone().add(new THREE.Vector3(0, 0.2, 0));
      if (at) this.s.controls.teleport(at);
      this.s.controls.velocity.set(0, 0, 0);
      this.fight.reset(kind);
      // (back at the works' entry: the maze from the start, what is in it happens again)
      if (kind === 'hunt' && this.stage === 'hunt') this.step = 0;
      this._restoring = false;
    }, 1800);
  }

  // how the kraken starts over after he is restored
  _resetKind() {
    if (this.stage === 'show') return 'arena';
    if (this.stage === 'hunt') return 'hunt';
    return 'none';
  }

  // the swimmer cannot pass into the kraken, nor up into the open water over the maze (called
  // from Swim's limit)
  limit(pos, vel) {
    this.fight?.pushOut(pos, vel);
    this.works?.limit(pos, vel);
  }

  // the objective and the marker for this step
  guide() {
    const P = this.pts, p = this.s.controls.position, F = this.fight;
    // its arm round him or stuck in the floor comes first
    if (this.stage === 'hunt' || this.stage === 'show') {
      const held = F.grabTip(this._v);
      if (held) return { text: 'IT HAS YOU: shoot the arm!', target: held, label: 'ARM' };
      const tip = F.stuckTip(this._w);
      if (tip) return { text: 'Its arm is stuck: SHOOT IT (left click)', target: tip, label: 'ARM' };
    }
    const air = this._airGuide(p);
    if (air) return air;
    switch (this.stage) {
      case 'descend': return { text: 'Swim down to the lights at the bottom of the trench: the way to the relay', target: P.front, label: 'RELAY' };
      case 'front': return { text: 'Go into the old works in the cliff: the relay is inside', target: P.mouth, label: 'IN' };
      case 'hunt': {
        const pt = this.works.routes[this.huntNo]?.[this.step];
        return { text: 'Find your way through the works: follow the marker', target: pt?.p || this.pts.clear, label: 'GO' };
      }
      case 'show': {
        const mouth = F.kraken.mouthWorld(this._v);
        if (F.state === 'stunned') return { text: "It's stunned: shoot its mouth NOW", target: mouth, label: 'MOUTH' };
        if (this._mouthOpen) return { text: 'NOW: shoot its glowing mouth (left click)', target: mouth, label: 'MOUTH' };
        return { text: this._finale ? 'Finish it! Dash from its blows (and what falls), shoot its mouth when it glows'
          : 'Kill the kraken: TAP SHIFT to dash from its blows, shoot its mouth when it glows', target: mouth, label: 'KRAKEN' };
      }
      case 'fleeing': return { text: 'It is fleeing!', target: null };
      case 'free':
      case 'down': return { text: this.step < 2 ? 'Get down the shaft to the relay' : 'Follow the tunnel to the relay room', target: this._down[this.step] || P.inside, label: this.step < 2 ? 'SHAFT' : 'RELAY' };
      case 'inside': return RELAY.guide?.(this) || this.pressureSeal?.guide() || this.lock.guide() || {
        text: this._uplinkOverridden ? 'Pumps online' : 'Reroute power at the relay terminal',
        target: this._uplinkOverridden ? null : P.screen,
        label: 'TERMINAL'
      };
      default: return { text: 'Uplink established', target: null };
    }
  }

  // ------------------------------------------------------------------ the kraken's presence, the music
  _sounds(dt, p) {
    const sfx = this.sfx;
    if (!sfx) return;
    const F = this.fight, k = F.kraken;
    // in a showdown it snarls between its blows, and when he is badly hurt his heart pounds
    if (F.state === 'fight' && F.mode === 'arena' && !F.attack) {
      this._snarlT = (this._snarlT ?? 1.5) - dt;
      if (this._snarlT <= 0) {
        this._snarlT = 1.8 + Math.random() * 2.2;
        sfx.cue('snarl', k.mouthWorld());
      }
    }
    const fighting = this.stage === 'show' || (this.stage === 'hunt' && !!F.hunt.job);
    sfx.heartbeat(fighting ? 1 - this.s.player.integrity / 100 : 0, dt);
    // in the maze: it moves over the decks, the grating creaks
    if (this.stage === 'hunt' && !F.hunt.job) {
      this._huntT = (this._huntT ?? 4) - dt;
      if (this._huntT <= 0) {
        this._huntT = 5 + Math.random() * 5;
        if (Math.random() < 0.55) sfx.cue(Math.random() < 0.5 ? 'krakenGrowl' : 'krakenHiss', k.mouthWorld());
        else sfx.cue('deckRattle', new THREE.Vector3(p.x + (Math.random() - 0.5) * 8, PLAN.F + PLAN.ROOF, p.z + (Math.random() - 0.5) * 8));
      }
    }
    // the music: creeping in as he follows the arms; a dread through the maze, rising as it nears
    // and when it comes at him; the fight's full weight in the clearing, the drums rising with its
    // wounds, his injuries and its lunges
    if (this.stage === 'front') {
      sfx.setFight('dread');
      sfx.setIntensity(0.15);
    } else if (this.stage === 'hunt') {
      // (low and muffled, swelling as it nears, and when it comes at him)
      const near = 1 - Math.min(1, Math.max(0, (p.distanceTo(k.root.position) - 6) / 24));
      sfx.setFight('dread');
      sfx.setIntensity(Math.min(1, 0.25 + 0.55 * near + (F.hunt.job ? 0.3 : 0)));
    } else if (this.stage === 'show') {
      sfx.setFight('fight');
      const lunging = F.attack?.kind === 'lunge' ? 0.25 : 0;
      sfx.setIntensity(F.wounds / WOUNDS_TOTAL * 0.7 + (1 - this.s.player.integrity / 100) * 0.4 + lunging + (this._finale ? 0.2 : 0));
    }
  }

  // (its den's window: his view is drawn round to it for a moment)
  _lookStep(dt, playing) {
    const L = this._look;
    if (!L || !playing) return;
    L.t -= dt;
    const cam = this.s.controls.camera;
    const to = this._v.subVectors(L.at, cam.position);
    const want = Math.atan2(-to.x, -to.z);
    let d = want - cam.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    cam.rotation.y += d * (1 - Math.exp(-3.0 * dt));
    if (L.t <= 0) this._look = null;
  }

  // ------------------------------------------------------------------ blood, sand, grit
  // A cloud of dark blood blooming in the water where a bullet went in (bigger for a wound),
  // drifting up and thinning away. Soft sprites, a handful a hit, kept to a few dozen at once
  _blood(at, size = 1, colours = [0x9c140e, 0x5c0806]) {
    this._bloodTex ||= bloodTexture();
    this._clouds ||= [];
    const n = Math.round(5 * size) + 2;
    for (let k = 0; k < n; k++) {
      if (this._clouds.length > 90) this._clouds.shift().sprite.removeFromParent();
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._bloodTex, color: colours[k % 3 === 0 ? 0 : 1], transparent: true, depthWrite: false, opacity: 0.85, rotation: Math.random() * 6.28
      }));
      sprite.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.6 * size, (Math.random() - 0.5) * 0.6 * size, (Math.random() - 0.5) * 0.6 * size));
      this.sea.group.add(sprite);
      this._clouds.push({
        sprite, life: 0, max: 2.5 + Math.random() * 1.5 * size, grow: (1.2 + Math.random()) * size,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.25 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8)
      });
    }
  }

  // sand thrown up where it bursts out of the floor
  _sand(at) {
    for (let k = 0; k < 2; k++) {
      const p = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, 0.5, (Math.random() - 0.5) * 5));
      this._blood(p, 2.6, [0x6d6658, 0x4a463d]);
    }
  }

  // grit sifting down off the deck
  _grit(at) {
    for (let k = 0; k < 3; k++) {
      const p = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
      this._blood(p, 0.7, [0x5a564c, 0x3a3832]);
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

  // Caught by its arm (or the dash slips him out of it: then it misses)
  onGrab() {
    if (this._restoring) return false;
    if (this._dash.iframes > 0) {
      this._dodged();
      return false;
    }
    this.sfx?.cue('punchWhoosh');
    this.sfx?.cue('snarl', this.fight.kraken.mouthWorld());
    this.s.hud.flash();
    this.game.ui.showToast('IT HAS YOU! Shoot the arm holding you to break free!', 4000);
    return true;
  }

  onBreakFree() {
    this.game.ui.showToast(this.fight.mode === 'arena' ? 'Free! It is stunned: shoot its mouth!' : 'Free!', 2500);
    this.sfx?.cue('stuck', this.s.controls.position);
  }

  // in its grip: dragged toward its open mouth (his own swimming cannot pull him away), the view
  // shaking, a prompt to shoot
  _held(dt, playing) {
    const held = playing && this.fight.grabbing;
    if (held) {
      const c = this.s.controls;
      const to = this.fight.dragTo(this._v);
      const d = to.sub(c.position);
      const L = d.length();
      if (L > 0.05) c.velocity.copy(d.multiplyScalar(Math.min(4.5, L * 1.3) / L));
      this.shake = Math.max(this.shake, 0.35);
      this.game.ui.setPrompt('SHOOT THE ARM HOLDING YOU!');
      this._wasHeld = true;
    } else if (this._wasHeld) {
      this._wasHeld = false;
      this.game.ui.setPrompt(null);
    }
  }

  // Its body is solid: he is pushed back out of it (an egg shape round the body, a little
  // smaller than it is drawn)
  _solidKraken() {
    const k = this.fight.kraken, body = k.body;
    if (!body || !k.root.visible || this.fight.state === 'gone') return;
    if (!this._bodyBox) {
      body.geometry.computeBoundingBox();
      const b = body.geometry.boundingBox;
      this._bodyBox = { mid: b.getCenter(new THREE.Vector3()), half: b.getSize(new THREE.Vector3()).multiplyScalar(0.425), chest: new THREE.Vector3(), d: new THREE.Vector3() };
    }
    const { mid, half, chest, d } = this._bodyBox, c = this.s.controls;
    chest.copy(c.position).y += 0.9;
    body.worldToLocal(d.copy(chest)).sub(mid).divide(half);
    const L = d.length();
    if (L >= 1 || L < 1e-4) return;
    const push = body.localToWorld(d.multiplyScalar(1 / L).multiply(half).add(mid)).sub(chest);
    const depth = push.length();
    push.multiplyScalar(1 / depth);
    // (out along the push no slower than this: firm, not a fling)
    const along = c.velocity.dot(push), want = Math.min(4, depth * 6);
    if (along < want) c.velocity.addScaledVector(push, want - along);
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

  // After the fight he is spent: slower, and every so often he hangs in the water a moment to get
  // his breath (only while he is swimming along). Swim breathes harder for it too (this.spent)
  _spentStep(dt, playing) {
    const c = this.s.controls;
    const on = !!this.fight?.free && (this.stage === 'free' || this.stage === 'down' || this.stage === 'inside') && !this.lock.owns;
    this.spent = on;
    if (!on) {
      if (this._spentOn) { c.speedScale = 1; this._spentOn = false; }
      return;
    }
    this._spentOn = true;
    if (playing && c.swimming && c.thrusting) this._restIn = (this._restIn ?? 6) - dt;
    let want = SPENT.speed;
    if (this._restIn < 0) {
      want = SPENT.rest;
      if (this._restIn < -SPENT.pause) this._restIn = SPENT.every[0] + Math.random() * (SPENT.every[1] - SPENT.every[0]);
    }
    c.speedScale += (want - c.speedScale) * (1 - Math.exp(-(want < c.speedScale ? 5 : 1.5) * dt));
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    this.lock?.dispose();
    this._bossEl?.remove();
    this._inkEl?.remove();
    this.sea.ink = 0;
    this.fight?.dispose();
    this.pressureSeal?.dispose();
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

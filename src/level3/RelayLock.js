import * as THREE from 'three';
import { deckMaterial } from './DeckMaterials.js';
import { Water } from './Water.js';
import { loadVossActing, VossActor } from '../entities/vossActing.js';
import { leanBack } from './vossPoses.js';
import { clamp, seg, v3 } from '../story/firstPersonRig.js';

// The water lock behind the relay room (docs/relay-lock-plan.md): the way from the flooded relay
// room to the dry control room where the confrontation plays. The lock is Sivunile's containment
// vestibule (Blender/scripts/build_l3_works.py: the sliding hatch GATE_RelayHatch in the room's
// south wall, the sealed pocket behind it); this adds what makes it a water lock, and the scene.
//
//   sealed     the hatch shut (PressureSeal: the three valves balance the pressure and Works slides
//              it open onto the flooded vestibule); the terminal says the pumps have no signal
//   unsealing  the reroute won (Trench): the pumps thud on, the lamp over the hatch goes amber then
//              green
//   open       the lock waits, flooded, lit red
//   the scene  once he is in, the game has him (the CUTSCENE state: the level goes on updating):
//              the hatch slides shut behind him, the beacon turns, the pumps drain the lock (the
//              water falling past the camera, the sound coming out of the water), his weight comes
//              back and his boots hit the floor, his knees give and he sits back against the wall,
//              takes his helmet off (the first breath of real air), the inner door opens onto
//              ARIA's light, and the picture goes to black over his breathing. In the black, the
//              rest of the suit comes off; then the confrontation (DeckSession.startConfrontation),
//              Scene A coming up out of that same black.
//
// He says nothing from the end of the fight to Scene A: only his breathing (and two optional
// recordings, a grunt as he lands and a gasp as the helmet comes off). ARIA speaks once in here,
// as the inner door opens (lockOpen).
//
// Built in code in the vestibule: the water, the vents, the beacon, the pipes and signs, and the
// inner door, for which the vestibule's back wall is cut out of the model and its collision and
// built again round a doorway; and the dry corridor beyond. Until he lands, the scene moves the
// level's own Voss (his treading-water clip); from the landing, a copy of him in the suit
// (VossActor, with the acting clips) under a cut, which sits, and whose arms (ArmIK) lift the
// helmet off. Enter after the first two seconds skips to the black.

const LOCK = { x: 1.0, z0: 0, z1: 3.2, h: 4.5 };          // the vestibule: half its width, from and to (south of the room's wall), its ceiling
const BACK = 0.12;                                       // its back wall's thickness
const HATCH = { slide: 2.15, shut: [0.3, 2.3] };         // its sliding leaf (Works.openRelayHatch): how far it slides; the scene's shutting
const INNER = { w: 0.5, h: 2.05 };                       // the inner door: half its width, its height
const HALL = { w: 0.8, z1: 7.6, h: 2.4 };                // the dry corridor beyond it: half its width, its end, its height
const TOP = 4.6, BOTTOM = -0.3;                          // the lock's water: full (over its ceiling) and pumped out (in the sump)
const DRAIN_AT = 4.2;                                    // seconds into the scene the pumps start
const DRAIN = 13;                                        // and how long they take
const FLOAT = 0.6;                                       // his feet over the floor while he floats
const WAIST = 1.05;                                      // the water this far over his feet: too little to hold him up
const SIT = v3(0.58, 0, 1.6);                            // where he sits (lock frame): his back to the east wall
const FLOAT_AT = v3(0.2, 0, 1.6);                        // and where he floats, over the vents
const SKIP_AFTER = 2.0;
const FOV = 52;
// the scene's beats after he sits (seconds from the moment he has sat down)
const HELMET_AT = 0.9;                                   // his hands go up to the helmet
const HELMET_LEN = 7.2;                                  // from there to the inner door
const DOOR_LEN = 9.0;                                    // the door, ARIA's line, his look; then the fade
const FADE = 1.6;
const BLACK = 4.6;                                       // the black before the confrontation: the suit coming off
// optional recordings (public/assets/audio/voss/): without them, the breathing alone
const VOICE = { land: 'v-lock-land', gasp: 'v-helmet-gasp' };

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

export class RelayLock {
  constructor(trench) {
    this.t = trench;
    this.s = trench.s;
    this.game = trench.game;
    this.scene = trench.scene;
    const P = trench.pts;
    this.ok = !!(P.inside && P.hatch && trench.works?.group);
    if (!this.ok) return;
    this.floor = P.inside.y - 0.1;
    // the lock's frame: the foot of the doorway, on the room's face of its south wall (+z: into the lock)
    this.o = v3(P.hatch.x, this.floor, P.inside.z + 5);
    this.state = 'sealed';
    this.owns = false;               // the scene has him: from the hatch shutting behind him on
    this.drained = false;
    this.innerOpen = 0;              // the inner door (0 shut .. 1 open)
    this.leaf = trench.works.doors?.GATE_RelayHatch || null;   // the outer hatch (Works moves it open)
    this._t = 0;
    this._colliders = [];
    this.group = new THREE.Group();
    this.group.name = 'RelayLock';
    this.group.position.copy(this.o);
    trench.sea.group.add(this.group);
    this._cutBackWall();
    this._build();
    this.water = new Water(this.scene, { minX: this.o.x - LOCK.x, maxX: this.o.x + LOCK.x, minZ: this.o.z + LOCK.z0, maxZ: this.o.z + LOCK.z1 },
      { shared: false, level: this.o.y + TOP });
    this.water.mesh.visible = false;
    // the four borrowed lights while he is in here: the lamp, the beacon, ARIA's light down the
    // corridor (off until the inner door opens) and a soft fill
    this.lightSet = {
      at: [this.L(0, 3.9, 2.5), this.L(LOCK.x - 0.2, 3.0, 0.45), this.L(HALL.w + 0.2, 1.3, HALL.z1 - 0.7), this.L(-0.6, 1.6, 2.6)],
      spec: [[0xffd9a8, 12, 7], [0xff2a14, 0, 7], [0x6fd8ff, 0, 9], [0xcfe8ff, 3.5, 5]]
    };
    this._onKey = (e) => {
      if (e.code === 'Enter' && this.owns && this._scene && this._scene.T > SKIP_AFTER && !this._scene.skipped) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this._skip();
      }
    };
    window.addEventListener('keydown', this._onKey, true);
  }

  // a point in the lock's frame (metres from the doorway's foot: +x east, +z south into the lock)
  L(x, y, z, out = new THREE.Vector3()) {
    return out.set(this.o.x + x, this.o.y + y, this.o.z + z);
  }

  // ------------------------------------------------------------------ the inner doorway
  // The vestibule's back wall is one box in the model and in its collision: both are cut out here
  // and the wall is built again round the inner door
  _cutBackWall() {
    const o = this.o;
    const x0 = o.x - LOCK.x - 0.02, x1 = o.x + LOCK.x + 0.02, z0 = o.z + LOCK.z1 - 0.03, z1 = o.z + LOCK.z1 + BACK + 0.03;
    const inSlab = (p) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1 && p.y > o.y - 0.2 && p.y < o.y + LOCK.h + 0.2;
    const slab = new THREE.Box3(v3(x0, o.y - 0.2, z0), v3(x1, o.y + LOCK.h + 0.2, z1));
    let cut = 0;
    // (the model's meshes are in the works' own groups by now: inner and outer)
    this.t.works.group.traverse((m) => { if (m.isMesh) cut += cutTriangles(m, inSlab, slab); });
    for (const col of Object.values(this.t.works.colliders || {})) {
      if (!col.collider || !anyTriangle(col.node, inSlab)) continue;
      this.s.physics.world.removeCollider(col.collider, true);
      col.collider = trimeshFrom(this.s.physics, col.node, inSlab);
    }
    if (!cut) console.warn('RelayLock: the vestibule\'s back wall was not found to cut.');
  }

  _build() {
    const g = this.group;
    const sea = (n) => deckMaterial(n, { sea: true });
    const M = this.mats = {
      concrete: sea('l3_concrete'), wall: sea('l3_wall'), dark: sea('l3_dark'), hull: sea('l3_hull'),
      hazard: sea('l3_hazard'), rust: sea('l3_rust'), grate: sea('l3_grate')
    };
    const glow = (color, intensity) => new THREE.MeshStandardMaterial({ color: 0x0c0c0c, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
    this.glows = {
      outer: glow(0xff2a14, 2.2), inner: glow(0xff2a14, 2.2), beacon: glow(0xff2a14, 0.4),
      aria: glow(0x5fd0ff, 0), hall: glow(0xcfe8ff, 0.25), panel: glow(0x4fd0ff, 1.2)
    };
    const box = (mat, x0, y0, z0, x1, y1, z1, parent = g) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      parent.add(m);
      return m;
    };
    const solid = (mat, x0, y0, z0, x1, y1, z1) => {
      this._col(x0, y0, z0, x1, y1, z1);
      return box(mat, x0, y0, z0, x1, y1, z1);
    };

    // over the hatch, on the room's side (its frame stands 0.28 m proud and 2.81 high): the lamp
    // and the sign
    box(this.glows.outer, -0.22, 2.9, -0.31, 0.22, 3.02, -0.23);
    this._plate(['WATER LOCK 3', 'CONTROL ROOM ACCESS'], 0, 3.42, -0.135, Math.PI, 1.3, 0.38);

    // the vestibule's back wall, again, round the inner door
    const z1 = LOCK.z1, zb = LOCK.z1 + BACK;
    solid(M.wall, -LOCK.x, 0, z1, -INNER.w, LOCK.h, zb);
    solid(M.wall, INNER.w, 0, z1, LOCK.x, LOCK.h, zb);
    solid(M.wall, -INNER.w, INNER.h, z1, INNER.w, LOCK.h, zb);
    // the floor vents (the sump under their grates) and a hazard border
    for (const [x0, x1] of [[-0.8, -0.15], [0.15, 0.8]]) {
      box(M.dark, x0, 0.001, 0.85, x1, 0.006, 2.55);
      box(M.grate, x0, 0.006, 0.85, x1, 0.03, 2.55);
    }
    box(M.hazard, -LOCK.x, 0.001, z1 - 0.3, LOCK.x, 0.008, z1 - 0.2);
    // pipes along the walls, a junction box, the beacon on its bracket
    const pipe = (x, y, r) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, LOCK.z1 - LOCK.z0, 10), M.rust);
      p.rotation.x = Math.PI / 2;
      p.position.set(x, y, (LOCK.z0 + LOCK.z1) / 2);
      g.add(p);
    };
    pipe(-LOCK.x + 0.09, 2.62, 0.07);
    pipe(-LOCK.x + 0.09, 2.42, 0.045);
    pipe(LOCK.x - 0.08, 0.32, 0.06);
    box(M.hull, -LOCK.x, 1.2, 2.3, -LOCK.x + 0.14, 1.75, 2.75);
    const beacon = (this.beacon = new THREE.Group());
    beacon.position.set(LOCK.x - 0.16, 3.0, 0.45);
    g.add(beacon);
    beacon.add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.13, 14), this.glows.beacon));
    this.glows.shade = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide });
    beacon.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.095, 0.14, 14, 1, true, 0, Math.PI), this.glows.shade));
    box(M.hull, LOCK.x - 0.08, 2.86, 0.38, LOCK.x, 2.94, 0.52);
    this._plate(['WATER LOCK 3', 'PUMPS DRY BEFORE INNER DOOR OPENS'], -LOCK.x + 0.012, 1.7, 1.2, Math.PI / 2, 1.1, 0.32);

    // the inner door (it slides east along the wall), the lamp over it, its panel
    this.innerLeaf = box(M.hull, -INNER.w - 0.03, 0, z1 - 0.09, INNER.w + 0.03, INNER.h + 0.03, z1 - 0.01);
    box(M.dark, -0.22, 1.3, z1 - 0.1, 0.22, 1.36, z1 - 0.09, this.innerLeaf).position.set(0, 0.35, -0.04);
    this._innerBase = this.innerLeaf.position.clone();
    this._innerCol = this._col(-INNER.w, 0, z1 - 0.1, INNER.w, INNER.h, zb);
    box(this.glows.inner, -0.16, INNER.h + 0.13, z1 - 0.06, 0.16, INNER.h + 0.25, z1 - 0.005);
    box(M.hull, 0.6, 0.95, z1 - 0.12, 0.94, 1.5, z1);
    box(this.glows.panel, 0.66, 1.32, z1 - 0.125, 0.88, 1.44, z1 - 0.12);
    box(this.glows.inner, 0.66, 1.06, z1 - 0.125, 0.72, 1.12, z1 - 0.12);

    // the dry corridor beyond: it turns east at its end, where the control room is and her light
    const H = this.hall = new THREE.Group();
    g.add(H);
    const z0 = zb;
    box(M.concrete, -HALL.w - 0.2, -0.3, z0, HALL.w + 0.2, 0, HALL.z1 + 0.2, H);
    box(M.wall, -HALL.w - 0.2, 0, z0, -HALL.w, HALL.h, HALL.z1 + 0.2, H);
    box(M.wall, HALL.w, 0, z0, HALL.w + 0.2, HALL.h, HALL.z1 - 1.5, H);
    box(M.wall, -HALL.w - 0.2, 0, HALL.z1, HALL.w + 0.2, HALL.h, HALL.z1 + 0.2, H);
    box(M.concrete, -HALL.w - 0.2, HALL.h, z0, HALL.w + 2.2, HALL.h + 0.2, HALL.z1 + 0.2, H);
    box(M.concrete, HALL.w, -0.3, HALL.z1 - 1.5, HALL.w + 2.2, 0, HALL.z1, H);
    box(M.wall, HALL.w + 0.2, 0, HALL.z1 - 1.7, HALL.w + 2.2, HALL.h, HALL.z1 - 1.5, H);
    for (const z of [z0 + 1.0, z0 + 2.6]) box(this.glows.hall, -0.3, HALL.h - 0.04, z, 0.3, HALL.h - 0.005, z + 0.12, H);
    const ariaGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, HALL.h), this.glows.aria);
    ariaGlow.position.set(HALL.w + 1.2, HALL.h / 2, HALL.z1 - 0.75);
    ariaGlow.rotation.y = -Math.PI / 2;
    H.add(ariaGlow);
    H.visible = false;
  }

  // The outer hatch (Works' sliding leaf): 0 shut .. 1 open, set here while the scene shuts it
  _slideLeaf(open) {
    const d = this.leaf;
    if (!d) return;
    d.open = d.target = open;
    const e = open * open * (3 - 2 * open);
    d.obj.position.x = d.base.x - e * HATCH.slide;
  }

  get hatchOpen() {
    return !this.leaf || this.leaf.open >= 1;
  }

  // a cuboid collider in the lock's frame (returns it, to remove later)
  _col(x0, y0, z0, x1, y1, z1) {
    const R = this.s.physics.RAPIER, o = this.o;
    const c = this.s.physics.world.createCollider(R.ColliderDesc.cuboid((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2)
      .setTranslation(o.x + (x0 + x1) / 2, o.y + (y0 + y1) / 2, o.z + (z0 + z1) / 2));
    this._colliders.push(c);
    return c;
  }

  _uncol(c) {
    if (!c) return;
    this.s.physics.world.removeCollider(c, true);
    this._colliders = this._colliders.filter((x) => x !== c);
  }

  _plate(lines, x, y, z, yaw, w, h) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = Math.round(512 * h / w);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2b2a26';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d8c79a';
    ctx.font = `bold ${Math.round(c.height * 0.4)}px Courier New, monospace`;
    ctx.fillText(lines[0], 256, c.height * 0.46);
    ctx.fillStyle = '#ff6b4a';
    ctx.font = `bold ${Math.round(c.height * 0.2)}px Courier New, monospace`;
    ctx.fillText(lines[1], 256, c.height * 0.82);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 }));
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    this.group.add(m);
  }

  // ------------------------------------------------------------------ where he is
  // In the lock (pad: metres of slack round it)
  contains(p, pad = 0) {
    const x = p.x - this.o.x, y = p.y - this.o.y, z = p.z - this.o.z;
    return this.ok && Math.abs(x) < LOCK.x + pad && z > LOCK.z0 - pad && z < LOCK.z1 + pad && y > -0.6 && y < LOCK.h + 0.6;
  }

  // In the air: the lock once the water is below this point, or the corridor beyond it
  inAir(p) {
    if (!this.ok || !this.owns) return false;
    const x = p.x - this.o.x, z = p.z - this.o.z;
    if (this.innerOpen > 0.05 && Math.abs(x) < HALL.w + 2.2 && z > LOCK.z1 && z < HALL.z1 + 0.3) return true;
    return this.contains(p, 0.02) && p.y > this.water.level + 0.02;
  }

  // the lock's own water where he is (null: not in it)
  waterAt(p) {
    return this.contains(p) && this.owns ? this.water.level : null;
  }

  // the borrowed lights are the lock's while he is in it (Trench._lights)
  lit(p) {
    return this.ok && (this.owns || (this.state !== 'sealed' && this.contains(p, 0.4)));
  }

  // the objective once the reroute is won
  guide() {
    if (this.state === 'unsealing') return { text: 'The water lock is opening', target: this.L(0, 1.2, 1.6), label: 'LOCK' };
    if (this.state === 'open') return { text: 'Enter the water lock', target: this.L(0, 1.2, 1.6), label: 'LOCK' };
    return null;
  }

  // ------------------------------------------------------------------ readied on entering the room
  // The acting clips and a copy of him in the suit (the confrontation loads the same clips)
  prepare() {
    if (!this.ok) return null;
    this._preparing ||= (async () => {
      const player = this.s.controls.character;
      const clips = await loadVossActing(player);
      if (this.disposed) return;
      const a = (this.actor = new VossActor(player, clips, { preset: 'resigned', wound: true }));
      a.root.visible = false;
      a.model.traverse((o) => { if (o.name === 'SlungRifle') o.visible = false; });
      a.model.traverse((o) => { if (!this.helmet && o.name === 'SuitHelmet') this.helmet = o; });
      this.scene.add(a.root);
      // the optional recordings
      await Promise.all(Object.values(VOICE).map((id) => this._loadVoice(id)));
    })().catch((e) => console.warn('RelayLock: could not ready the scene; it will be cut short.', e));
    return this._preparing;
  }

  async _loadVoice(id) {
    const sfx = this.s.sfx;
    if (!sfx?.ctx || sfx.buffers[id]) return;
    try {
      const r = await fetch(`./assets/audio/voss/${id}.mp3`);
      if (!r.ok) return;
      sfx.buffers[id] = await sfx.ctx.decodeAudioData(await r.arrayBuffer());
    } catch {
      // (not recorded: the breathing alone)
    }
  }

  // ------------------------------------------------------------------ the reroute won
  // (the hatch is already open: the pressure seal opened it; this brings the pumps)
  unseal() {
    if (!this.ok || this.state !== 'sealed') return;
    this.state = 'unsealing';
    this._t = 0;
    this._events = [
      [0.1, () => this.s.sfx?.cue('floodOn', this.L(0, 1.2, -0.3))],
      [0.2, () => this.glows.outer.emissive.setHex(0xffa020)],
      [0.9, () => this.s.sfx?.cue('thud', this.L(0, 1, 1.5))],
      [1.0, () => this.s.sfx?.startLoop('lockPumps', 'machine-hum', { vol: 0.35, rate: 0.45, at: this.L(0, 1.2, 1.5) })],
      [1.7, () => { this.glows.outer.emissive.setHex(0x3dff6a); this.s.sfx?.play('confirm', { at: this.L(0, 2.9, -0.3), vol: 0.5 }); }],
      [2.2, () => { this.state = 'open'; }]
    ];
  }

  _runEvents(t) {
    while (this._events?.length && t >= this._events[0][0]) this._events.shift()[1]();
  }

  // ------------------------------------------------------------------ each frame (Trench.update)
  update(dt, p) {
    if (!this.ok || this.disposed) return;
    const show = this.owns || this.t.works.below(p);
    this.group.visible = show;
    this.water.mesh.visible = show && this.water.level < this.o.y + LOCK.h + 0.05;
    if (this.state === 'unsealing') {
      this._t += dt;
      this._runEvents(this._t);
    }
    if (this.state === 'open' && this.hatchOpen && this.contains(p) && p.z - this.o.z > 1.0) this._start();
    if (this._scene) this._sceneStep(dt);
    this.innerLeaf.position.x = this._innerBase.x + this.innerOpen * (INNER.w * 2 + 0.08);
    this.hall.visible = this.innerOpen > 0.001;
  }

  // the lights' moment: the beacon turning, her light down the corridor
  lightStep(borrowed) {
    const sc = this._scene;
    const beaconOn = sc && sc.T > 3.4 && sc.T < DRAIN_AT + DRAIN + 1.5;
    const turn = sc ? sc.T * 5.5 : 0;
    if (borrowed[1]) borrowed[1].light.intensity = beaconOn ? 2 + 7 * Math.max(0, Math.cos(turn)) ** 2 : 0;
    this.glows.beacon.emissiveIntensity = beaconOn ? 2.5 : 0.4;
    this.beacon.rotation.y = turn;
    if (borrowed[2]) borrowed[2].light.intensity = 26 * this._ariaLight;
    if (borrowed[0]) borrowed[0].light.intensity = 9 * (this._lampFlick ?? 1);
  }

  get _ariaLight() {
    return this._scene ? clamp(this._scene.ariaLight || 0) : 0;
  }

  // ------------------------------------------------------------------ the scene
  _start() {
    if (this._scene) return;
    const s = this.s, g = this.game, c = s.controls;
    this.state = 'scene';
    this.owns = true;
    g.state = 'CUTSCENE';
    c.stop?.();
    document.exitPointerLock?.();
    c.velocity?.set(0, 0, 0);
    g.reticle?.classList.remove('visible');
    document.body.classList.add('l3-cutscene');
    g.ui.setWaypoint?.(null);
    g.ui.setPrompt?.(null);
    const cam = g.camera.instance;
    this._fov = cam.fov;
    cam.fov = FOV;
    cam.updateProjectionMatrix();
    // the level's own Voss, on show, treading water (the scene moves him until he lands); his helmet
    // lamp's glass dimmed, so it does not blaze into the camera (the copy shares the material)
    c.character?.setMode?.('third');
    c.body.visible = true;
    this._lens = null;
    c.character?.bodyRoot?.traverse((o) => {
      const m = o.isMesh && o.material;
      if (!this._lens && m?.emissive && m.emissiveIntensity > 1 && m.emissive.getHex() === 0xfff0d0) this._lens = m;
    });
    if (this._lens) { this._lensWas = this._lens.emissiveIntensity; this._lens.emissiveIntensity = 0.3; }
    const from = c.position.clone();
    this._scene = {
      T: 0, from, yaw: c.facing || 0, y: from.y - this.o.y, vy: 0, landed: false,
      land: null, sat: null, ariaLight: 0, breathT: 0.6, skipped: false, shot: -1,
      lookCam: new THREE.PerspectiveCamera()
    };
    this.prepare();
    this._events = this._sceneEvents();
  }

  // the scene's sounds and moments before he lands (from its start)
  _sceneEvents() {
    const sfx = this.s.sfx, at = this.L(0, 1.1, 0.2), mid = this.L(0, 0.3, 1.6);
    return [
      [2.2, () => sfx?.cue('hatchShut', at)],
      [2.3, () => { if (this.leaf) this.t.works._block(this.leaf, true); }],
      [3.4, () => sfx?.play('latch', { at, rate: 0.8 })],
      [3.6, () => this._alarm(3)],
      [3.9, () => { sfx?.cue('thud', this.L(0, 0.2, 2.5)); this.glows.outer.emissive.setHex(0xff2a14); }],
      [DRAIN_AT, () => {
        sfx?.startLoop('lockDrain', 'water-pour', { vol: 0.8, rate: 0.45, at: mid });
        sfx?.startLoop('lockGurgle', 'bubbles-loop', { vol: 0.55, rate: 0.42, at: mid });
      }],
      [DRAIN_AT + DRAIN - 2.5, () => { sfx?.stopLoop('lockDrain', 3); sfx?.stopLoop('lockGurgle', 2.5); }],
      [DRAIN_AT + DRAIN + 0.4, () => {
        sfx?.stopLoop('lockPumps', 2.5);
        sfx?.play('clank-2', { at: mid, rate: 0.6, vol: 0.6, wet: 0.3 });
        this.drained = true;
      }]
    ];
  }

  // an alarm: a few falling whoops (Web Audio: a swept saw through a low-pass, into the world)
  _alarm(n) {
    const sfx = this.s.sfx, ctx = sfx?.ctx;
    if (!ctx || !sfx.world) return;
    const t0 = ctx.currentTime;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1700;
    const out = ctx.createGain();
    out.gain.value = 0.09;
    lp.connect(out).connect(sfx.world);
    for (let k = 0; k < n; k++) {
      const o = ctx.createOscillator(), env = ctx.createGain();
      o.type = 'sawtooth';
      const a = t0 + k * 0.8;
      o.frequency.setValueAtTime(620, a);
      o.frequency.exponentialRampToValueAtTime(330, a + 0.62);
      env.gain.setValueAtTime(0, a);
      env.gain.linearRampToValueAtTime(1, a + 0.05);
      env.gain.setValueAtTime(1, a + 0.5);
      env.gain.linearRampToValueAtTime(0, a + 0.66);
      o.connect(env).connect(lp);
      o.start(a);
      o.stop(a + 0.7);
    }
  }

  _sceneStep(dt) {
    const sc = this._scene, c = this.s.controls, cam = this.game.camera.instance;
    if (sc.done) return;
    sc.T += dt;
    if (sc.fading) sc.fading += dt;
    const T = sc.T;
    this._runEvents(T);
    // the hatch slides shut behind him
    if (T < HATCH.shut[1] + 0.2) this._slideLeaf(1 - clamp((T - HATCH.shut[0]) / (HATCH.shut[1] - HATCH.shut[0])));
    // the water: pumped down from over the ceiling into the sump, quick at first
    const u = clamp((T - DRAIN_AT) / DRAIN);
    this.water.level = this.o.y + TOP - (TOP - BOTTOM) * (1 - Math.pow(1 - u, 1.5));
    if (u > 0 && u < 1 && Math.random() < dt * 5) {
      const vx = Math.random() < 0.5 ? -0.8 : 0.8;
      this.water.ring(this.o.x + vx + (Math.random() - 0.5) * 0.6, this.o.z + 0.9 + Math.random() * 1.6, 1.2);
    }
    const level = this.water.level - this.o.y;

    if (!sc.landed) this._float(dt, level);
    else this._act(dt);
    this._breathe(dt, level);
    this._camera(dt, cam);
  }

  // Until he lands: the level's own Voss, treading water over the vents, turning to the camera;
  // riding down with the water, then, when it is down to his waist, dropping onto his boots
  _float(dt, level) {
    const sc = this._scene, c = this.s.controls, ch = c.character;
    const k = 1 - Math.exp(-1.4 * dt);
    sc.yaw += wrap(Math.PI / 2 - sc.yaw) * k * 0.6;          // (round to face the camera: west)
    const bob = Math.sin(sc.T * 1.3) * 0.05;
    let y;
    if (level > FLOAT + WAIST) {
      sc.y += (FLOAT + bob - sc.y) * (1 - Math.exp(-1.2 * dt));
      y = sc.y;
    } else {
      sc.vy -= 9.8 * 0.8 * dt;
      sc.y = Math.max(0, sc.y + sc.vy * dt);
      y = sc.y;
    }
    const at = this.L(FLOAT_AT.x, 0, FLOAT_AT.z, _v);
    const p = _w.lerpVectors(sc.from, at, seg(sc.T, 0, 3.0));
    c.body.position.set(p.x, this.o.y + y, p.z);
    c.body.rotation.y = sc.yaw;
    c.body.visible = true;
    sc.lookCam.rotation.set(-0.05, sc.yaw, 0, 'YXZ');
    sc.lookCam.updateMatrixWorld();
    ch?.update?.(dt, { grounded: true, speed: 0, verticalSpeed: 0, camera: sc.lookCam, bodyYaw: sc.yaw, swimming: true, thrusting: false });
    if (y <= 0 && sc.vy < 0) this._land();
  }

  _land() {
    const sc = this._scene, sfx = this.s.sfx, at = this.L(FLOAT_AT.x, 0.1, FLOAT_AT.z);
    sc.landed = true;
    sc.land = sc.T;
    this.water.ring(at.x, at.z, 3);
    this.water.ring(at.x + 0.3, at.z - 0.2, 2);
    sfx?.play('slam', { at, rate: 0.85, vol: 0.55, wet: 0.3 });
    sfx?.play('clank-1', { at, rate: 0.55, vol: 0.5, delay: 0.04 });
    if (sfx?.buffers[VOICE.land]) sfx.play(VOICE.land, { ui: true, vol: 1, delay: 0.1 });
    const a = this.actor;
    if (!a) {
      // (not ready: straight on to the black)
      sc.sat = sc.T;
      return this._fade();
    }
    // a cut, onto the copy of him: his knees give, and he sits back against the wall
    this.s.controls.body.visible = false;
    a.root.visible = true;
    a.root.position.copy(this.L(SIT.x, 0, SIT.z));
    a.root.rotation.y = -Math.PI / 2;
    a.setFacePreset('resigned', true);
    a.face.pose({ tired: 0.9, frown: 0.3, worry: 0.4 }, 4);
    a.face.shut = 0.35;
    a.crossTo('Stagger', { fade: 0 });
    sc.sitAt = sc.T + 0.9;
    sc.sat = sc.sitAt + 4.77 / 1.15;
    this._leanOff = a.onPose((actor) => leanBack(actor, sc.lean || 0, { back: 0.3, head: sc.head || 0 }));
    this._gripOffL = null;
  }

  // From the landing: the copy of him acts (the sit, the helmet, the door)
  _act(dt) {
    const sc = this._scene, a = this.actor, T = sc.T;
    if (!a) return;
    if (sc.sitAt && T >= sc.sitAt) {
      sc.sitAt = null;
      a.crossTo('SitDown', { fade: 0.45, rate: 1.15, then: 'SitIdle' });
    }
    // his back comes to rest on the wall, then (helmet off) his head too
    sc.lean = seg(T, sc.sat - 0.6, sc.sat + 1.2);
    const h = T - (sc.sat + HELMET_AT);
    sc.head = 0.12 + 0.3 * seg(h, 5.2, 6.8);
    this._helmet(h);
    this._door(h - HELMET_LEN);
    a.update(dt);
  }

  // His hands up to the collar ring (slow: he is spent), a slip, a quarter turn and the seal's hiss;
  // up over his head, out to his right and down; let go, and it drops and rolls
  _helmet(h) {
    const a = this.actor, hel = this.helmet, sc = this._scene, sfx = this.s.sfx;
    if (!hel || h < 0 || sc.helmetDone) return;
    const at = () => hel.getWorldPosition(new THREE.Vector3());
    if (!sc.hands) {
      sc.hands = true;
      a.reach('L', () => this._grip('L', sc), { fade: 1.4 });
      a.reach('R', () => this._grip('R', sc), { fade: 1.6 });
      a.face.pose({ tired: 1, frown: 0.45, worry: 0.3 }, 3);
      sfx?.play('cloth-1', { at: at(), vol: 0.5 });
    }
    // the slip: his left hand loses the ring and finds it again
    sc.slip = Math.sin(Math.PI * clamp((h - 1.35) / 0.3)) * 0.07;
    if (h > 1.35 && !sc.slipped) { sc.slipped = true; sfx?.play('cloth-3', { at: at(), vol: 0.45, rate: 1.2 }); }
    // the quarter turn, on his shoulders
    if (!sc.detached) {
      const turn = seg(h, 1.9, 2.5) * 0.5;
      sc.hq ||= hel.quaternion.clone();
      hel.quaternion.copy(sc.hq).multiply(_q.setFromAxisAngle(_y.set(0, 1, 0), turn));
      if (h > 1.9 && !sc.ratchet) { sc.ratchet = true; sfx?.play('ratchet-2', { at: at(), vol: 0.6, rate: 0.75 }); }
      if (h > 2.5 && !sc.sealed) {
        sc.sealed = true;
        sfx?.play('click', { at: at(), vol: 0.9 });
        sfx?.play('seal', { at: at(), vol: 0.7, rate: 0.8, delay: 0.05 });
        sfx?.play('air-hiss', { at: at(), vol: 0.6, rate: 0.75, delay: 0.1, attack: 0.05, dur: 0.9 });
      }
    }
    // off the shoulders: up and over his head, out to his right, down beside him
    if (h > 2.9 && !sc.detached) {
      sc.detached = true;
      this.scene.attach(hel);
      sc.hp0 = hel.position.clone();
      sc.hq0 = hel.quaternion.clone();
      const r = a.root;
      r.updateMatrixWorld();
      sc.up = v3(0, 1, 0);
      sc.fwd = v3(0, 0, 1).applyQuaternion(r.quaternion);
      sc.right = v3(-1, 0, 0).applyQuaternion(r.quaternion);
      sc.hold = r.position.clone().addScaledVector(sc.right, 0.36).addScaledVector(sc.fwd, 0.2).add(v3(0, 0.36, 0));
      sc.rest = r.position.clone().addScaledVector(sc.right, 0.44).addScaledVector(sc.fwd, 0.22);
      sc.rest.y = this.o.y + 0.165 * a.scale * 0.82;
    }
    if (sc.detached && !sc.dropped) {
      const lift = seg(h, 2.9, 4.3), carry = seg(h, 4.3, 5.5);
      const p = _v.copy(sc.hp0).addScaledVector(sc.up, 0.3 * lift).addScaledVector(sc.fwd, 0.12 * lift);
      p.lerp(sc.hold, carry);
      hel.position.copy(p);
      const left = _w.copy(sc.right).negate();
      hel.quaternion.copy(sc.hq0).premultiply(_q.setFromAxisAngle(left, -0.35 * lift + 0.2 * carry));
      if (h > 3.4 && !sc.gasped) this._gasp();
      if (h > 5.5) {
        sc.dropped = h;
        sc.dropFrom = hel.position.clone();
        a.reach('L', null, { fade: 1.1 });
        a.reach('R', null, { fade: 1.3 });
      }
    }
    if (sc.dropped) {
      const d = h - sc.dropped;
      const fall = clamp(d / 0.24);
      hel.position.lerpVectors(sc.dropFrom, sc.rest, fall * fall);
      if (fall >= 1 && !sc.clunk) {
        sc.clunk = true;
        sfx?.play('clank-1', { at: sc.rest, vol: 0.9, rate: 0.7, wet: 0.3 });
      }
      // a short roll away from him
      const roll = seg(d, 0.24, 1.2);
      if (roll > 0) {
        hel.position.addScaledVector(sc.right, 0.12 * roll);
        hel.rotateOnWorldAxis(sc.fwd, 0.04 * (1 - roll));
        if (!sc.rolled && roll > 0.85) { sc.rolled = true; sfx?.play('clank-2', { at: sc.rest, vol: 0.3, rate: 1.3 }); }
      }
      if (d > 1.3) sc.helmetDone = true;
    }
  }

  // a hand's grip on the helmet's collar ring (ArmIK: world space)
  _grip(side, sc) {
    const hel = this.helmet;
    hel.updateWorldMatrix(true, false);
    const c = hel.getWorldPosition(new THREE.Vector3());
    hel.getWorldQuaternion(_q);
    _x.set(1, 0, 0).applyQuaternion(_q);
    _y.set(0, 1, 0).applyQuaternion(_q);
    _z.set(0, 0, 1).applyQuaternion(_q);
    const s = side === 'L' ? 1 : -1, r = 0.165 * this.actor.scale;
    const wrist = c.clone().addScaledVector(_x, s * r * 1.12).addScaledVector(_y, -r * 0.5 - (side === 'L' ? sc.slip || 0 : 0)).addScaledVector(_z, r * 0.05);
    return {
      wrist,
      fingers: _y.clone().addScaledVector(_x, -s * 0.35).normalize(),
      palm: _x.clone().multiplyScalar(-s),
      pole: _x.clone().multiplyScalar(s).addScaledVector(_y, -0.7).addScaledVector(_z, -0.2).normalize(),
      curl: [0.45, 0.5, 0.4],
      thumb: [0.2, 0.2, 0.15]
    };
  }

  // the first breath of real air
  _gasp() {
    const sc = this._scene, a = this.actor, sfx = this.s.sfx;
    sc.gasped = true;
    sc.breathT = 2.4;
    a.face.shut = 1;
    a.face.gape = 0.75;
    setTimeout(() => { if (this.actor) a.face.gape = 0.3; }, 650);
    const at = this.actor.bone('head')?.getWorldPosition(new THREE.Vector3()) || null;
    if (sfx?.buffers[VOICE.gasp]) sfx.play(VOICE.gasp, { ui: true, vol: 1 });
    else sfx?.play('air-hiss', { at, vol: 0.55, rate: 1.05, attack: 0.04, dur: 0.5, lp: 4200 });
  }

  // His breathing: in the helmet (the regulator's ring) until it is off, then out in the air, slow
  // and heavy; the mouth opens with each breath once his face is bare
  _breathe(dt, level) {
    const sc = this._scene, sfx = this.s.sfx, a = this.actor;
    if (!sfx || sc.fading > 1.2) return;
    sc.breathT -= dt;
    const bare = sc.gasped;
    if (bare && a) {
      const phase = clamp(1 - sc.breathT / 2.4);
      a.face.gape = 0.18 + 0.22 * Math.sin(Math.PI * phase) ** 2;
    }
    if (sc.breathT > 0) return;
    if (!bare && level > FLOAT + 1.9) {
      sc.breathT = 2.2 + Math.random() * 0.4;
      sfx.breath(1);
    } else if (!bare) {
      sc.breathT = 2.1 + Math.random() * 0.4;
      sfx.play('air-hiss', { out: sfx.breathIn, vol: 0.2, rate: 0.42, attack: 0.15, dur: 0.9, lp: 1500 });
      sfx.play('air-hiss', { out: sfx.breathIn, vol: 0.26, rate: 0.68, delay: 1.0, attack: 0.25, dur: 0.9, lp: 3800 });
    } else {
      const at = a?.bone('head')?.getWorldPosition(new THREE.Vector3()) || null;
      sc.breathT = 2.4 + Math.min(0.8, (sc.T - sc.sat) * 0.04) + Math.random() * 0.3;
      sfx.play('air-hiss', { at, vol: 0.32, rate: 0.4, attack: 0.2, dur: 1.1, lp: 1300 });
      sfx.play('air-hiss', { at, vol: 0.22, rate: 0.58, delay: 1.25, attack: 0.3, dur: 0.9, lp: 2200 });
    }
  }

  // The inner door: its lamp goes green, it slides open, her light comes down the corridor and
  // falls across his face; her line; his eyes open and turn to the light. Then the fade
  _door(d) {
    const sc = this._scene, a = this.actor, sfx = this.s.sfx;
    if (d < 0 || sc.fading) return;
    const at = this.L(0, 1.1, LOCK.z1);
    if (!sc.doorLamp) {
      sc.doorLamp = true;
      this.glows.inner.emissive.setHex(0x3dff6a);
      sfx?.cue('signalGood', at);
    }
    if (d > 0.6 && !sc.doorMoving) {
      sc.doorMoving = true;
      this._uncol(this._innerCol);
      this._innerCol = null;
      sfx?.play('latch', { at, vol: 0.9, rate: 0.75 });
      sfx?.play('slide', { at, vol: 0.9, rate: 0.6, delay: 0.15 });
      sfx?.play('air-hiss', { at, vol: 0.4, rate: 0.6, delay: 0.1, attack: 0.1, dur: 1.2 });
    }
    this.innerOpen = seg(d, 0.6, 2.4);
    sc.ariaLight = seg(d, 1.0, 3.4);
    this.glows.aria.emissiveIntensity = 2.4 * sc.ariaLight;
    if (d > 2.4 && !sc.said) {
      sc.said = true;
      this.s.say('lockOpen').then(() => { sc.lineDone = sc.T; });
    }
    // after her line (or, if it never comes, a while after the door), his eyes open to the light
    const after = sc.lineDone ?? (d > 7 ? sc.T : null);
    if (after != null && !sc.looked && sc.T > after + 0.7) {
      sc.looked = sc.T;
      a.face.shut = 0;
      a.face.look(0.55, 0.06, 6, 1.5);
    }
    if (sc.looked && sc.T > sc.looked + 3.2) this._fade();
    else if (d > DOOR_LEN + 6) this._fade();
  }

  // Down to black over his breathing; in the black, the rest of the suit coming off; then Scene A
  _fade() {
    const sc = this._scene;
    if (sc.fading) return;
    sc.fading = 0.001;
    const veil = (this._veil = document.createElement('div'));
    veil.className = 'fb3d-hint on';
    veil.style.cssText = `position:fixed;inset:0;background:#000;z-index:30;pointer-events:none;opacity:0;transition:opacity ${sc.skipped ? 0.5 : FADE}s ease`;
    document.getElementById('ui-layer').appendChild(veil);
    requestAnimationFrame(() => { veil.style.opacity = '1'; });
    const sfx = this.s.sfx, at = this.actor?.root.position || this.L(SIT.x, 0.6, SIT.z);
    const black = sc.skipped ? 0.6 : FADE + 0.2;
    if (!sc.skipped) {
      const t = (dt) => black + dt;
      sfx?.play('latch', { at, vol: 0.7, delay: t(0.3) });
      sfx?.play('air-hiss', { at, vol: 0.35, rate: 0.8, delay: t(0.45), attack: 0.05, dur: 0.6 });
      sfx?.play('latch', { at, vol: 0.6, rate: 0.9, delay: t(1.0) });
      sfx?.play('cloth-1', { at, vol: 0.7, delay: t(1.4) });
      sfx?.play('cloth-3', { at, vol: 0.6, delay: t(1.9) });
      sfx?.play('belt', { at, vol: 0.6, delay: t(2.4) });
      sfx?.play('slam', { at, vol: 0.5, rate: 0.6, delay: t(2.9), wet: 0.3 });
      sfx?.play('clank-2', { at, vol: 0.45, rate: 0.7, delay: t(2.95) });
      sfx?.play('cloth-2', { at, vol: 0.6, delay: t(3.7) });
    }
    setTimeout(() => this._handOff(), (black + (sc.skipped ? 0.4 : BLACK)) * 1000);
  }

  _skip() {
    const sc = this._scene;
    sc.skipped = true;
    this.s.sfx?.stopLoop('lockDrain', 0.3);
    this.s.sfx?.stopLoop('lockGurgle', 0.3);
    this.s.sfx?.stopLoop('lockPumps', 0.3);
    if (this.s.aria?.speaking) this.s.aria.skip();
    this._fade();
  }

  async _handOff() {
    const sc = this._scene;
    if (this.disposed || sc.done) return;
    sc.done = true;
    this.s.sfx?.stopLoop('lockDrain', 0.2);
    this.s.sfx?.stopLoop('lockGurgle', 0.2);
    this.s.sfx?.stopLoop('lockPumps', 0.2);
    this.water.level = this.o.y + BOTTOM;
    this.drained = true;
    const veil = this._veil;
    // (the game's panels stay away until the confrontation has the screen)
    const panels = setInterval(() => {
      if (this.disposed || this.s.confrontation?.running || !this.owns) {
        clearInterval(panels);
        document.body.classList.remove('l3-cutscene');
      }
    }, 100);
    await this.s.startConfrontation?.({ veil });
    // (the confrontation could not start: back to the level, on his feet where he sat)
    if (this.disposed || this.s.confrontation?.running || this.s._confDone) return;
    console.warn('RelayLock: the confrontation did not start; back to the level.');
    veil?.remove();
    this._restore();
  }

  _restore() {
    const c = this.s.controls, cam = this.game.camera.instance;
    if (this.actor) this.actor.root.visible = false;
    if (this._fov) { cam.fov = this._fov; cam.updateProjectionMatrix(); }
    c.setSwimming?.(false);
    c.teleport?.(this.L(0, 0.05, 2.2));
    c.character?.setMode?.(c.view);
    if (this._lens) this._lens.emissiveIntensity = this._lensWas;
    this.owns = false;
    document.body.classList.remove('l3-cutscene');
    if (this.game.state === 'CUTSCENE') this.game.state = 'PLAYING';
  }

  // ------------------------------------------------------------------ the camera
  // Hand-held, eased, cut between a few set-ups (lock frame)
  _camera(dt, cam) {
    const sc = this._scene, T = sc.T;
    let shot = 0;
    if (T >= DRAIN_AT - 0.4) shot = 1;
    if (sc.landed) shot = 2;
    if (sc.sat != null && T > sc.sat + HELMET_AT - 0.4) shot = 3;
    if (sc.sat != null && T > sc.sat + HELMET_AT + HELMET_LEN - 0.3) shot = 4;
    if (shot !== sc.shot) { sc.shot = shot; sc.shotT = 0; }
    sc.shotT += dt;
    const u = sc.shotT;
    const eye = _v, look = _w;
    const body = this.s.controls.body.position;
    if (shot === 0) {
      // from the far corner, back at the hatch shutting behind him
      this.L(-0.8, 1.6, 3.0, eye);
      look.set(body.x - 0.1, body.y + 1.1, body.z - 0.6);
    } else if (shot === 1) {
      // close on his helmet from the hatch's corner, sinking with the water: the surface comes
      // down past him, then past the camera
      this.L(-0.8, 2.3 - 0.5 * seg(T, DRAIN_AT, DRAIN_AT + 5), 0.5, eye);
      look.set(body.x, body.y + 1.55, body.z);
    } else if (shot === 2) {
      // wide, from over the water: his knees giving, the sit against the wall, the last of the water
      // draining round him
      this.L(-0.85, 1.8 - 0.35 * seg(u, 1, 6), 0.45 + 0.15 * clamp(u / 6), eye);
      this.L(SIT.x - 0.1, 0.75 - 0.15 * seg(u, 1, 6), SIT.z + 0.1, look);
    } else if (shot === 3) {
      // close, from his left front: the helmet coming off, his face
      this.L(-0.7 + 0.15 * seg(u, 0, 9), 0.98, 2.45 - 0.12 * seg(u, 0, 9), eye);
      this.L(SIT.x - 0.15, 0.88, SIT.z + 0.05, look);
    } else {
      // the inner door and him: her light coming in across his face
      this.L(-0.8, 0.85, 0.5, eye);
      this.L(0.25, 0.95, 2.5, look);
    }
    // hand-held
    const t = T;
    eye.x += Math.sin(t * 0.7) * 0.012 + Math.sin(t * 1.9) * 0.004;
    eye.y += Math.sin(t * 0.9 + 1) * 0.01;
    cam.position.copy(eye);
    cam.lookAt(look);
    cam.updateMatrixWorld();
  }

  // ------------------------------------------------------------------ the test link (?level=3&lock)
  // The reroute won and the hatch open, Voss already in the lock: the scene starts at once
  test() {
    if (!this.ok) return;
    this.t._uplinkOverridden = true;
    this.t._screenText = ['PUMPS ONLINE', 'WATER LOCK: READY'];
    this.t._drawSign?.();
    if (this.t.pressureSeal?.state) this.t.pressureSeal.state.solved = true;
    this.state = 'open';
    this._slideLeaf(1);
    if (this.leaf) this.t.works._block(this.leaf, false);
    this.glows.outer.emissive.setHex(0x3dff6a);
    const at = this.L(0, FLOAT, 1.5);
    if (this.s._relayStart) this.s._relayStart.copy(at);
    this.s.controls.teleport(at);
    this.prepare();
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('keydown', this._onKey, true);
    if (!this.ok) return;
    for (const c of this._colliders) this.s.physics.world.removeCollider(c, true);
    this._colliders = [];
    this._leanOff?.();
    this.actor?.dispose();
    this.helmet?.removeFromParent();
    this.water.dispose();
    this._veil?.remove();
    document.body.classList.remove('l3-cutscene');
    this.group.removeFromParent();
    this.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of Object.values(this.glows)) m.dispose();
  }
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Drop a mesh's triangles that lie wholly where `inside` says (world space), keeping its material
// groups; returns how many went
function cutTriangles(mesh, inside, box) {
  const geo = mesh.geometry, pos = geo?.attributes.position;
  if (!pos) return 0;
  mesh.updateWorldMatrix(true, false);
  if (!geo.boundingBox) geo.computeBoundingBox();
  if (!new THREE.Box3().copy(geo.boundingBox).applyMatrix4(mesh.matrixWorld).intersectsBox(box)) return 0;
  const index = geo.index ? geo.index.array : null;
  const count = index ? index.length : pos.count;
  const at = (i, v) => v.fromBufferAttribute(pos, index ? index[i] : i).applyMatrix4(mesh.matrixWorld);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ranges = geo.groups.length ? geo.groups : [{ start: 0, count, materialIndex: 0 }];
  const out = [], groups = [];
  let cut = 0;
  for (const r of ranges) {
    const start = out.length;
    for (let i = r.start; i < Math.min(count, r.start + r.count); i += 3) {
      if (inside(at(i, a)) && inside(at(i + 1, b)) && inside(at(i + 2, c))) { cut++; continue; }
      out.push(index ? index[i] : i, index ? index[i + 1] : i + 1, index ? index[i + 2] : i + 2);
    }
    groups.push({ start, count: out.length - start, materialIndex: r.materialIndex });
  }
  if (!cut) return 0;
  geo.setIndex(out);
  if (geo.groups.length) {
    geo.clearGroups();
    for (const g of groups) geo.addGroup(g.start, g.count, g.materialIndex);
  }
  return cut;
}

// Whether any of a node's triangles lies wholly where `inside` says (world space, the node's meshes'
// world matrices as they were in the model)
function anyTriangle(node, inside) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let found = false;
  node.traverse((m) => {
    const geo = !found && m.isMesh && m.geometry, pos = geo?.attributes.position;
    if (!pos) return;
    const index = geo.index ? geo.index.array : null;
    const count = index ? index.length : pos.count;
    const at = (i, v) => v.fromBufferAttribute(pos, index ? index[i] : i).applyMatrix4(m.matrixWorld);
    for (let i = 0; i < count && !found; i += 3) found = inside(at(i, a)) && inside(at(i + 1, b)) && inside(at(i + 2, c));
  });
  return found;
}

// A static triangle-mesh collider from a node's meshes (their world matrices as they were in the
// model), leaving out the triangles that lie wholly where `inside` says
function trimeshFrom(physics, node, inside) {
  const R = physics.RAPIER, verts = [], indices = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  node.traverse((m) => {
    const geo = m.isMesh && m.geometry, pos = geo?.attributes.position;
    if (!pos) return;
    // (every vertex, so the triangles still share their edges: FIX_INTERNAL_EDGES needs that)
    const base = verts.length / 3;
    for (let i = 0; i < pos.count; i++) {
      a.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      verts.push(a.x, a.y, a.z);
    }
    const index = geo.index ? geo.index.array : null;
    const count = index ? index.length : pos.count;
    const vert = (i, v) => v.fromArray(verts, (base + (index ? index[i] : i)) * 3);
    for (let i = 0; i < count; i += 3) {
      if (inside(vert(i, a)) && inside(vert(i + 1, b)) && inside(vert(i + 2, c))) continue;
      for (let k = 0; k < 3; k++) indices.push(base + (index ? index[i + k] : i + k));
    }
  });
  if (!indices.length) return null;
  const flags = R.TriMeshFlags ? R.TriMeshFlags.FIX_INTERNAL_EDGES : undefined;
  return physics.world.createCollider(R.ColliderDesc.trimesh(new Float32Array(verts), new Uint32Array(indices), flags));
}

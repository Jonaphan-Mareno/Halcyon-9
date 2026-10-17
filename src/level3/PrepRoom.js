import * as THREE from 'three';
import { Water } from './Water.js';
import { dressInSuit, rackSuit } from './DiveSuit.js';
import { SEA, dotTexture } from './SeaScene.js';

// Through the first gate (scene 3.3, the airlock and the suit): the bulkhead at the end of the way
// left opens, a stairwell climbs out of the flood to the EVA prep room, and at its far end the water
// lock leads out to the sea.
//
//   1. the gate: E on the bulkhead; ARIA opens it (the wheel turns, the door lifts into the ceiling)
//   2. the suit: up the stairs ARIA tells him to put it on; hold E at the rack. The screen blinks,
//      and he is in it: the visor frames the view, the helmet lamp comes on, the oxygen gauge shows
//   3. the uplink cable: E at the reel takes its free end (it pays out behind him: the dish's plug
//      on one end, the station on the other)
//   4. the water lock: E on the inner hatch opens it; inside, E on the panel floods it. The inner
//      hatch slides shut, the red beacon turns, water pours up through the floor vents until the
//      lock is full (its pressure matches the sea's), and the outer hatch opens onto the sea
//   5. out through the outer hatch and the docking collar onto the platform outside (SeaScene.js):
//      the canyon, the vents far below. (Swimming out from there is the next part.)
//
// The status screen by the door says where he is up to (suit, cable, lock). Coming back in, the
// lock would be pumped dry before the inner hatch opens (not needed yet: the way is one way).
//
// Lights: the prep room and the lock borrow four of the deck's lights while he is up here (the
// pump room's, the first corridor lamp's, the shaft's and the engine room's, none of which can be
// seen from here), and outside they move again, to the platform's floodlight and over three of
// the vents, so the number of lights, and so the shaders, never change.

const LOCK = { minX: -25.0, maxX: -21.2, minZ: -24.0, maxZ: -21.0 };   // world metres (z = -Blender y)
const FLOOR = 1.5;                  // the prep room's and the lock's floor
const FULL = 4.45;                  // the lock's water when it is full (over its ceiling)
const FLOOD_TIME = 9;               // seconds to fill the lock
const OXYGEN = 240;                 // seconds of air in the suit (ARIA: "four minutes")
const SUIT_HOLD = 2.0;              // seconds holding E to put the suit on
const UP_HERE = -10.4, DOWN_THERE = -10.0;   // the stairwell's x where the room's lights take over (and back)
const OUT_HERE = -25.7, IN_THERE = -25.3;    // past the outer hatch: outside (and back in)
const PLATFORM_X = -28.8;                    // past the hull: on the platform
const PREP_LIGHTS = [               // colour, candela, range: the stairwell lamp, the two panels, the lock lamp
  [0xffc48a, 4, 10], [0xe2ecff, 5, 9], [0xe2ecff, 5, 9], [0xcfe2ff, 2.2, 6]
];

export class PrepRoom {
  // session: the DeckSession; deck: the loaded model; at(name): a marker's world position
  constructor(session, deck, at) {
    this.s = session;
    this.game = session.game;
    this.scene = session.game.scene;
    this.physics = session.physics;
    this.at = at;
    this.zone = 'deck';
    this.gate = 'shut';             // shut, opening, open
    this.suited = false;
    this.cable = false;
    this.lock = 'shut';             // shut, inner (inner hatch open), sealing, flooding, full, outer, open
    this.oxygen = OXYGEN;
    this.breathing = false;         // the oxygen runs down once the lock floods
    this._t = 0;
    this._fog = { color: this.scene.fog.color.clone(), density: this.scene.fog.density };

    // the moving doors, each with its own collider while it is shut
    const door = (name) => {
      const obj = deck.getObjectByName(name);
      if (!obj) return null;
      return { obj, base: obj.position.clone(), open: 0, collider: null };
    };
    this.doors = {
      gate: door('DOOR_Gate1'), wheel: door('DOOR_Gate1Wheel'),
      inner: door('DOOR_LockInner'), outer: door('DOOR_LockOuter')
    };
    for (const k of ['gate', 'inner', 'outer']) this._block(this.doors[k], true);

    // where things are
    this.pos = {
      gate: at('PT_Gate1'), prepDoor: at('PT_PrepDoor'), suit: at('PT_Suit'), cable: at('PT_Cable'),
      screen: at('PT_Screen'), panel: at('PT_LockPanel'), beacon: at('PT_LockBeacon'), mid: at('PT_LockMid')
    };
    this.pos.suitTop = this.pos.suit?.clone().add(new THREE.Vector3(0, 1.35, 0));
    this.pos.innerHatch = this.doors.inner ? this._centre(this.doors.inner.obj) : null;
    this.cableEnd = deck.getObjectByName('PROP_CableEnd');

    this._signs();
    this._screen();
    this._effects();
    this._borrowLights();
    this._spots();

    // the empty suit in its rack (built from the crew's copy of the model)
    const gltf = session.crew?.gltf;
    if (gltf && this.pos.suit) {
      this.rackSuit = rackSuit(gltf, this.pos.suit, 0);
      this.scene.add(this.rackSuit);
    }
    this._hud();
  }

  _centre(obj) {
    return new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
  }

  // a shut door blocks the way: a box collider round it (made again when it shuts)
  _block(d, on) {
    if (!d) return;
    const world = this.physics.world;
    if (on && !d.collider) {
      d.obj.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(d.obj);
      const c = box.getCenter(new THREE.Vector3()), h = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const R = this.physics.RAPIER;
      d.collider = world.createCollider(R.ColliderDesc.cuboid(Math.max(h.x, 0.05), h.y, Math.max(h.z, 0.05)).setTranslation(c.x, c.y, c.z));
    } else if (!on && d.collider) {
      world.removeCollider(d.collider, true);
      d.collider = null;
    }
  }

  // ------------------------------------------------------------------ what he can use
  _spots() {
    const it = this.s.interact;
    if (this.pos.gate) {
      it.add({
        id: 'gate1', position: this.pos.gate, radius: 0.9, label: 'Open the bulkhead',
        when: () => this.gate === 'shut', use: () => this._openGate()
      });
    }
    if (this.pos.suitTop) {
      it.add({
        id: 'suit', position: this.pos.suitTop, radius: 0.6, reach: 2.4, hold: SUIT_HOLD, label: 'Put on the dive suit',
        when: () => !this.suited, use: () => this._suitUp()
      });
    }
    if (this.pos.cable) {
      it.add({
        id: 'cable', position: this.pos.cable, radius: 0.5, label: 'Take the uplink cable',
        when: () => !this.cable, use: () => this._takeCable()
      });
    }
    if (this.pos.innerHatch) {
      it.add({
        id: 'lockInner', position: this.pos.innerHatch, radius: 0.8,
        label: () => (this.suited && this.cable ? 'Open the water lock' : 'Water lock'),
        when: () => this.lock === 'shut', use: () => this._openInner()
      });
    }
    if (this.pos.panel) {
      it.add({
        id: 'lockPanel', position: this.pos.panel, radius: 0.35, reach: 2.2, label: 'Flood the lock',
        when: () => this.lock === 'inner', use: () => this._flood()
      });
    }
  }

  _openGate() {
    if (this.gate !== 'shut') return;
    this.gate = 'opening';
    this.s.say('gateOpen').then(() => {
      if (this.s.disposed) return;
      this._gateT = 0;                     // the wheel turns, then the door lifts (update)
    });
  }

  async _suitUp() {
    if (this.suited) return;
    this.suited = true;
    this._blink.classList.add('on');
    await new Promise((r) => setTimeout(r, 650));
    if (this.s.disposed) return;
    if (this.rackSuit) this.rackSuit.visible = false;
    const player = this.s.controls.character;
    if (player?.bodyRoot) dressInSuit(player.bodyRoot, { mutate: true });
    if (player?.viewModel) dressInSuit(player.viewModel, { mutate: true, parts: false });   // (his first-person arms: gloves, orange sleeves)
    const lamp = this.game.camera.flashlight;
    lamp.intensity = 14;
    lamp.angle = Math.PI / 7;
    lamp.penumbra = 0.6;
    this._visor.classList.add('on');
    this._oxy.classList.add('on');
    this._drawScreen();
    await new Promise((r) => setTimeout(r, 450));
    this._blink.classList.remove('on');
    this.game.ui.showToast('Suit sealed. Helmet lamp on. Your air starts when the lock floods: four minutes.', 6000);
  }

  _takeCable() {
    if (this.cable) return;
    this.cable = true;
    if (this.cableEnd) this.cableEnd.visible = false;
    this._carry.classList.add('on');
    this._drawScreen();
    this.game.ui.showToast('Uplink cable taken. It pays out from the reel behind you: plug the end into the dish on the pylon.', 6500);
    this.s.say('cable');
  }

  _openInner() {
    if (this.lock !== 'shut') return;
    if (!this.suited) return this.s.say('needSuit');
    if (!this.cable) return this.s.say('needCable');
    this.lock = 'inner';
    this._move('inner', 1);
    this._drawScreen();
  }

  _flood() {
    if (this.lock !== 'inner') return;
    const p = this.s.controls.position;
    if (p.x > LOCK.maxX - 0.35) {
      this.game.ui.showToast('Step all the way into the lock first.', 3000);
      return;
    }
    this.lock = 'sealing';
    this._move('inner', 0, () => {
      this._block(this.doors.inner, true);
      this.lock = 'flooding';
      this.breathing = true;
      this._floodT = 0;
      this._drawScreen();
      this.game.ui.showToast('Inner hatch sealed. Flooding the lock to sea pressure.', 5000);
    });
    this._drawScreen();
  }

  // slide a lock hatch open (1) or shut (0) into the wall to its north, then call done
  _move(name, to, done) {
    const d = this.doors[name];
    if (!d) return done?.();
    if (to > 0) this._block(d, false);
    d.target = to;
    d.done = done;
  }

  // ------------------------------------------------------------------ each frame
  update(dt, p, playing) {
    this._t += dt;
    this._zone(p);
    // the gate: the wheel turns for a moment, then the door and its wheel lift into the ceiling
    if (this.gate === 'opening' && this._gateT !== undefined) {
      this._gateT += dt;
      const w = this.doors.wheel, g = this.doors.gate;
      if (w) w.obj.rotation.x = -Math.min(this._gateT, 1.4) * 3.2;
      const lift = THREE.MathUtils.smoothstep(this._gateT, 1.4, 3.6) * 2.5;
      if (this._gateT > 1.4) this._block(g, false);
      if (g) g.obj.position.y = g.base.y + lift;
      if (w) w.obj.position.y = w.base.y + lift;
      if (this._gateT >= 3.6) this.gate = 'open';
    }
    // the hatches slide (about 1.4 s)
    for (const name of ['inner', 'outer']) {
      const d = this.doors[name];
      if (!d || d.target === undefined || d.open === d.target) continue;
      d.open = THREE.MathUtils.clamp(d.open + Math.sign(d.target - d.open) * dt / 1.4, 0, 1);
      d.obj.position.z = d.base.z - THREE.MathUtils.smootherstep(d.open, 0, 1) * 1.45;
      if (d.open === d.target) {
        const done = d.done;
        d.done = null;
        done?.();
      }
    }
    // the lock floods from the floor vents; once full, a moment of quiet, then the outer hatch
    if (this.lock === 'flooding') {
      this._floodT += dt;
      const f = Math.min(1, this._floodT / FLOOD_TIME);
      this.lockWater.level = FLOOR - 0.3 + (FULL - FLOOR + 0.3) * (1 - Math.pow(1 - f, 1.6));
      if (Math.random() < dt * 6) this.lockWater.ring(LOCK.minX + Math.random() * 3.6, LOCK.minZ + Math.random() * 2.8, 1.5);
      if (f >= 1) {
        this.lock = 'full';
        this._fullT = 0;
        this._drawScreen();
      }
    } else if (this.lock === 'full') {
      this._fullT += dt;
      if (this._fullT > 1.6) {
        this.lock = 'outer';
        this.s.sea?.setShown(true);
        this._block(this.doors.outer, false);
        this.game.ui.showToast('Pressure equal. Outer hatch opening.', 4000);
        this._move('outer', 1, () => {
          this.lock = 'open';
          this._drawScreen();
        });
      }
    }
    // the beacon turns red while the lock is working
    const working = this.lock === 'sealing' || this.lock === 'flooding' || this.lock === 'full' || this.lock === 'outer';
    if (this.zone === 'prep' && this.beacon) this.beacon.intensity = working ? 1.5 + 2.5 * Math.max(0, Math.sin(this._t * 7)) : 0;
    // (outside, it blinks on top of the platform's mast)
    if (this.zone === 'sea' && this.beacon) this.beacon.intensity = Math.sin(this._t * 2.4) > 0.55 ? 5 : 0.3;
    this._bubbles(dt, working && this.lock !== 'outer');
    this._underwater();
    // the air, once he is breathing from the tanks
    if (this.breathing && playing) this.oxygen = Math.max(0, this.oxygen - dt);
    if (this.suited) this._drawOxygen();
    this._visor.style.display = playing ? '' : 'none';
    // (out in the sea, more than a few metres from the hatch, the inside cannot be seen at all)
    if (this.s.deck) this.s.deck.visible = !(this.zone === 'sea' && p.x < -38);
    // out on the platform for the first time
    if (!this._outside && p.x < PLATFORM_X) {
      this._outside = true;
      this.game.ui.showToast('Outside. The gap in the far rail is the dive gate: go through it to swim.', 7000);
    }
  }

  // how deep the water is where he stands: the lock's own water in the lock and outside it
  waterAt(p) {
    if (p.x < LOCK.minX) return this.lock === 'open' || this.lock === 'outer' ? 99 : -99;
    if (this._inLock(p)) return this.lockWater.level;
    return null;
  }

  _inLock(p, pad = 0) {
    return p.x > LOCK.minX - pad && p.x < LOCK.maxX + pad && p.z > LOCK.minZ - pad && p.z < LOCK.maxZ + pad;
  }

  // up the stairs, the prep room's lights take over from four of the deck's (and back down again)
  _zone(p) {
    let z = this.zone;
    if (z === 'deck' && p.x < UP_HERE) z = 'prep';
    else if (z === 'prep' && p.x > DOWN_THERE) z = 'deck';
    else if (z === 'prep' && p.x < OUT_HERE && this.s.sea) z = 'sea';
    else if (z === 'sea' && p.x > IN_THERE) z = 'prep';
    if (z === this.zone) return;
    this.zone = z;
    const sea = this.s.sea;
    // (what cannot be seen from where he is is not drawn: the drowned crew and the silt behind the
    // hull while he is outside, the whole outside while he is back down on the deck)
    for (const b of this.s.crew?.bodies || []) b.pivot.visible = z !== 'sea';
    if (this.s.silt) this.s.silt.visible = z !== 'sea';
    if (sea && (this.lock === 'outer' || this.lock === 'open')) sea.setShown(z !== 'deck');
    this.borrowed.forEach((b, i) => {
      const to = z === 'prep' ? b.to : z === 'sea' ? sea.lights[i] : null;
      const spec = z === 'prep' ? PREP_LIGHTS[i] : SEA.LIGHTS[i];
      if (to && spec) {
        b.light.position.copy(to);
        b.light.color.setHex(spec[0]);
        b.light.intensity = spec[1];
        b.light.distance = spec[2];
      } else {
        b.light.position.copy(b.home.position);
        b.light.color.copy(b.home.color);
        b.light.intensity = b.home.intensity;
        b.light.distance = b.home.distance;
      }
    });
    if (this.beacon) {
      if (z === 'prep' && this.pos.beacon) {
        this.beacon.position.copy(this.pos.beacon);
        this.beacon.distance = 5;
        this.beacon.intensity = 0;
      } else if (z === 'sea' && sea.points.beacon) {
        this.beacon.position.copy(sea.points.beacon);
        this.beacon.distance = 9;
      } else {
        this.beacon.position.copy(this._beaconHome.position);
        this.beacon.distance = this._beaconHome.distance;
      }
    }
    // (first time up the stairs, ARIA tells him to put the suit on)
    if (z === 'prep' && !this._suitTold) {
      this._suitTold = true;
      this.s.say('suit');
    }
  }

  _borrowLights() {
    const s = this.s;
    const lamp = (i) => s.lamps?.find((l) => l.i === i)?.light;
    const lights = [s.shaftLight, lamp(0), lamp(1), s.roomLight];
    this.borrowed = lights.map((light, i) => light && {
      light, to: this.at('PREP_LIGHT_' + i),
      home: { position: light.position.clone(), color: light.color.clone(), intensity: light.intensity, distance: light.distance }
    }).filter(Boolean);
    this.beacon = s.beacon || null;
    if (this.beacon) this._beaconHome = { position: this.beacon.position.clone(), distance: this.beacon.distance };
  }

  // ------------------------------------------------------------------ water, bubbles, the sea
  _effects() {
    // the lock's own water, waiting in the sump under the grating
    this.lockWater = new Water(this.scene, LOCK, { shared: false, level: FLOOR - 0.3 });
    // bubbles pouring up from the vents while it floods
    const n = 90;
    this._bub = { n, pos: new Float32Array(n * 3), speed: new Float32Array(n) };
    for (let i = 0; i < n; i++) this._resetBubble(i, true);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(this._bub.pos, 3));
    this.bubbles = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xcff5ff, size: 0.06, map: dotTexture(), transparent: true, opacity: 0.8, depthWrite: false }));
    this.bubbles.frustumCulled = false;
    this.scene.add(this.bubbles);
  }

  _resetBubble(i, hidden) {
    const b = this._bub;
    const side = Math.random() < 0.5 ? LOCK.minZ + 0.08 : LOCK.maxZ - 0.08;
    b.pos[i * 3] = LOCK.minX + 0.2 + Math.random() * 3.4;
    b.pos[i * 3 + 1] = hidden ? FLOOR - 0.6 : FLOOR + 0.1 + Math.random() * 0.2;
    b.pos[i * 3 + 2] = side + (Math.random() - 0.5) * 0.3;
    b.speed[i] = 0.8 + Math.random() * 1.4;
  }

  _bubbles(dt, on) {
    const b = this._bub, top = this.lockWater.level;
    for (let i = 0; i < b.n; i++) {
      const y = b.pos[i * 3 + 1];
      if (y < FLOOR - 0.5) {
        if (on && Math.random() < dt * 8) this._resetBubble(i, false);
        continue;
      }
      b.pos[i * 3 + 1] += b.speed[i] * dt;
      b.pos[i * 3] += Math.sin(this._t * 5 + i) * 0.15 * dt;
      b.pos[i * 3 + 2] += (b.pos[i * 3 + 2] < (LOCK.minZ + LOCK.maxZ) / 2 ? 0.25 : -0.25) * dt;
      if (b.pos[i * 3 + 1] > top - 0.02) {
        if (on) this._resetBubble(i, false);
        else b.pos[i * 3 + 1] = FLOOR - 0.6;
      }
    }
    this.bubbles.geometry.attributes.position.needsUpdate = true;
  }

  // Where the camera is: out in the sea (its fog, light from above), under the lock's water (the
  // sea's colour, closer), or in the air
  _underwater() {
    const cam = this.game.camera.instance.position;
    const open = this.lock === 'outer' || this.lock === 'open';
    const mode = cam.x < LOCK.minX ? (open ? 'sea' : 'air')
      : this._inLock(cam, 0.05) && cam.y < this.lockWater.level ? 'lock' : 'air';
    if (mode === this._fogMode) return;
    this._fogMode = mode;
    this.s.sea?.setActive(mode === 'sea');
    const fog = this.scene.fog;
    if (mode === 'lock') {
      fog.color.setHex(SEA.FOG);
      fog.density = 0.07;
    } else if (mode === 'air') {
      fog.color.copy(this._fog.color);
      fog.density = this._fog.density;
    }
    this._tint.classList.toggle('on', mode !== 'air');
  }

  // ------------------------------------------------------------------ signs and the status screen
  _plate(at, lines, { w = 1.2, h = 0.34, yaw = 0, bg = '#2b2a26', fg = '#d8c79a', accent = '#ff6b4a' } = {}) {
    if (!at) return;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = Math.round(512 * h / w);
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, c.width, c.height);
    g.textAlign = 'center';
    const big = Math.round(c.height * (lines.length > 1 ? 0.42 : 0.6));
    g.fillStyle = fg;
    g.font = `bold ${big}px Courier New, monospace`;
    g.fillText(lines[0], 256, lines.length > 1 ? big * 1.05 : c.height / 2 + big * 0.36);
    if (lines[1]) {
      g.fillStyle = accent;
      g.font = `bold ${Math.round(big * 0.48)}px Courier New, monospace`;
      g.fillText(lines[1], 256, c.height - big * 0.38);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12
    }));
    plate.position.copy(at);
    plate.rotation.y = yaw;
    plate.translateZ(0.012);
    this.scene.add(plate);
    return plate;
  }

  _signs() {
    const a = this.at;
    this._plate(a('PT_PrepSign'), ['EVA PREP', 'DIVE LOCK 2'], { w: 1.3, h: 0.4, yaw: Math.PI / 2 });
    this._plate(a('PT_LockSign'), ['WATER LOCK', 'FLOODS TO SEA PRESSURE'], { w: 1.25, h: 0.38, yaw: Math.PI / 2 });
    this._plate(a('PT_ReelSign'), ['UPLINK CABLE', 'TO DISH 2, ON THE PYLON'], { w: 0.95, h: 0.3, yaw: -Math.PI / 2 });
    for (const i of [1, 2]) {
      this._plate(a('PT_RackSign_' + i), ['EVA ' + i], { w: 0.58, h: 0.2, bg: '#d9661f', fg: '#14181f' });
    }
  }

  _screen() {
    const at = this.pos.screen;
    if (!at) return;
    this._scr = document.createElement('canvas');
    this._scr.width = 512;
    this._scr.height = 292;
    this._scrTex = new THREE.CanvasTexture(this._scr);
    this._scrTex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 0.69), new THREE.MeshBasicMaterial({ map: this._scrTex, toneMapped: false }));
    mesh.position.copy(at);
    mesh.rotation.y = Math.PI;             // it faces north, into the room
    mesh.translateZ(0.006);
    this.scene.add(mesh);
    this._drawScreen();
  }

  // the console's screen: where he is up to, in plain words
  _drawScreen() {
    if (!this._scr) return;
    const g = this._scr.getContext('2d');
    const W = this._scr.width, H = this._scr.height;
    g.fillStyle = '#04121b';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#4fd0ff';
    g.font = 'bold 26px Courier New, monospace';
    g.textAlign = 'left';
    g.fillText('EVA STATUS  /  DIVE LOCK 2', 22, 40);
    g.fillRect(22, 52, W - 44, 2);
    const lock = { shut: 'DRY, HATCHES SHUT', inner: 'DRY, INNER HATCH OPEN', sealing: 'SEALING', flooding: 'FLOODING...',
      full: 'FULL: AT SEA PRESSURE', outer: 'OUTER HATCH OPENING', open: 'OPEN TO THE SEA' }[this.lock];
    const rows = [
      ['SUIT 2', this.suited ? 'IN USE, SEALED' : 'ON RACK', this.suited],
      ['UPLINK CABLE', this.cable ? 'PAYING OUT' : 'ON REEL', this.cable],
      ['WATER LOCK', lock, this.lock === 'open'],
      ['DISH 2 (PYLON)', 'NO LINK', false]
    ];
    g.font = 'bold 24px Courier New, monospace';
    rows.forEach(([k, v, ok], i) => {
      const y = 100 + i * 46;
      g.fillStyle = '#8fb6c8';
      g.fillText(k, 22, y);
      g.fillStyle = ok ? '#3dff9a' : (k.startsWith('DISH') ? '#ff6a5a' : '#ffd23f');
      g.fillText(v, 252, y);
    });
    g.fillStyle = '#3d6a80';
    g.font = '18px Courier New, monospace';
    g.fillText('SEA PRESSURE OUTSIDE: 31 BAR', 22, H - 18);
    this._scrTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ the visor, the air, the end
  _hud() {
    const root = document.getElementById('ui-layer');
    const el = (id, html = '') => {
      const d = document.createElement('div');
      d.id = id;
      d.innerHTML = html;
      root.appendChild(d);
      return d;
    };
    this._visor = el('l3-visor');
    this._tint = el('l3-under');
    this._blink = el('l3-blink');
    this._oxy = el('l3-oxygen', '<div class="ox-label">OXYGEN</div><div class="ox-bar"><div></div></div><div class="ox-time">4:00</div>');
    this._carry = el('l3-carry', '<div class="cc-label">CARRYING</div><div class="cc-item">UPLINK CABLE</div><div class="cc-note">Plug the end into the dish on the pylon</div>');
    this._oxyBar = this._oxy.querySelector('.ox-bar div');
    this._oxyTime = this._oxy.querySelector('.ox-time');
  }

  _drawOxygen() {
    const f = this.oxygen / OXYGEN;
    this._oxyBar.style.width = (f * 100).toFixed(1) + '%';
    const s = Math.ceil(this.oxygen);
    const text = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    if (this._oxyTime.textContent !== text) this._oxyTime.textContent = text;
    this._oxy.classList.toggle('low', f < 0.25);
    this._oxy.classList.toggle('waiting', !this.breathing);
  }

  // what to do next, for the objective banner and the marker: { text, target, label }
  guide(crewSeen, windowPos) {
    const p = this.s.controls.position;
    if (this.gate !== 'open') {
      return crewSeen || !windowPos ? { text: 'Reach the airlock', target: this.pos.gate, label: 'LEFT' }
        : { text: 'Reach the airlock', target: windowPos, label: 'AHEAD' };
    }
    if (!this.suited && p.x > (this.pos.prepDoor?.x ?? -13) + 0.4) return { text: 'Reach the airlock', target: this.pos.prepDoor, label: 'UP' };
    if (!this.suited) return { text: 'Put on the dive suit', target: this.pos.suitTop, label: 'SUIT' };
    if (!this.cable) return { text: 'Take the uplink cable', target: this.pos.cable, label: 'CABLE' };
    switch (this.lock) {
      case 'shut': return { text: 'Enter the water lock', target: this.pos.innerHatch, label: 'LOCK' };
      case 'inner': return this._inLock(p) ? { text: 'Flood the lock', target: this.pos.panel, label: 'PANEL' }
        : { text: 'Enter the water lock', target: this.pos.mid, label: 'LOCK' };
      case 'sealing': case 'flooding': case 'full': return { text: 'Wait while the lock floods', target: null };
      default:
        if (!this._outside) return { text: 'Go outside', target: this.s.sea?.points.outside || null, label: 'OUT' };
        if (!this.s.swim?._told) return { text: 'Swim out through the dive gate', target: this.s.sea?.points.gate || null, label: 'GATE' };
        return { text: 'Explore outside (the dish comes next)', target: null };
    }
  }

  dispose() {
    this.lockWater?.dispose();
    for (const el of [this._visor, this._tint, this._blink, this._oxy, this._carry]) el?.remove();
    const lamp = this.game.camera.flashlight;
    lamp.intensity = 0;
  }
}

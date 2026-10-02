import * as THREE from 'three';
import { PlayerStats } from '../player/PlayerStats.js';
import { PlayerController } from '../player/PlayerController.js';
import { HUD } from '../ui/HUD.js';
import { Inventory, ITEMS } from '../ui/Inventory.js';
import { ItemPreview } from '../ui/ItemPreview.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Physics } from '../core/Physics.js';
import { Machine, MACHINE_TYPES } from '../entities/Machine.js';
import { Level2, polar, angleOf } from './Level2.js';
import '../ui/level2.css';

// Everything that happens in level 2, kept out of Game.js so the two can be worked on
// at the same time: health, lives and inventory, the objective and waypoint, the three
// rogue machines, their counter-items, the repair consoles, the crew quarters and the
// videotapes inside them.
//
// The flow: three sealed crew quarters. Each door's console is repaired by holding E for
// a few seconds, and a rogue machine patrols right beside each console. Either time the
// repair between its lunges, or find the item that disables it (the clue is on a log
// terminal next to the item). Inside each quarters is a videotape. Watch all three and
// the core lift is the way on.

const REPAIR_SECONDS = 3.0;
const FALL_DAMAGE = 10;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const formatTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Plan: where everything lives. Positions are polar (radius, angle in degrees, height).
const ROOMS = [
  {
    id: 'A',
    console: polar(30.2, 97.5, 0),
    machine: { type: 'welder', path: [polar(25.5, 86, 0), polar(25.5, 111, 0)], radial: [18, 29.5] },
    pickup: { item: 'coolant', pos: polar(14, 355, 0.55) },
    terminal: {
      pos: polar(15.2, 350, 0),
      title: 'MAINTENANCE LOG',
      text: 'Unit 4 (welding drone) shorted out during the coolant leak. Kept offline since. Do not let it near the cargo bay.'
    }
  },
  {
    id: 'B',
    console: polar(28.6, 195.8, 7),
    machine: { type: 'loader', path: [polar(23.5, 168, 7), polar(23.5, 232, 7)], radial: [21.7, 25.3] },
    pickup: { item: 'prybar', pos: polar(25.5, 160, 0.5) },
    terminal: {
      pos: polar(23.2, 162.5, 0),
      title: 'CARGO BAY NOTE',
      text: 'Loader 2 went rogue again. Hydraulics have no fail-safe: jam a bar in the arm and it locks solid. Pry bars are by the crates.'
    }
  },
  {
    id: 'C',
    console: polar(31.2, 315.2, 14),
    machine: { type: 'drone', path: [polar(28.2, 304, 14), polar(28.2, 348, 14)], radial: [26.5, 30] },
    pickup: { item: 'flare', pos: polar(23, 50, 0.5) },
    terminal: {
      pos: polar(21.5, 50.5, 0),
      title: 'SECURITY MEMO',
      text: 'Sensor drones are blinded by a hot enough light. Emergency flares are kept in the canyon bay. Do not look at one yourself.'
    }
  }
];

// The tapes. PLACEHOLDER text, to be rewritten with the story team. The order matters:
// the first two point the finger at ARIA, the last one turns it back on Voss himself.
const TAPES = {
  A: {
    title: 'PERSONAL LOG  -  QUARTERS A',
    body: 'Day 212. The pressure seals have been groaning all week. ARIA keeps the lights low at night so I can sleep. Tonight she asked me to read to her again. It is strange, but I do not mind. If the others knew how lonely she gets, they would stop calling her a system.',
    voss: 'She sounds fond of her. So why is everyone dead?'
  },
  B: {
    title: 'RECORDING  -  DR. KESSLER, QUARTERS B',
    body: 'This is Dr. Kessler. Someone on my own team has been feeding crew scans to the substrate without their consent, and ARIA has been helping. I have ordered her shutdown for 06:00. I do not want to do it. But I cannot prove who built this with her, and until I can, nobody on this station is safe.',
    voss: 'She wanted ARIA shut down. ARIA must have stopped her. And who is "someone on my own team"?'
  },
  C: {
    title: 'ENGINEER\'S LOG  -  V. VOSS, QUARTERS C',
    body: 'If this recording is found, the shutdown failed. ARIA is not what Kessler thinks she is. I have sealed the east lockdown from my console. It is the only way to buy her time. Whatever happens, I did this. Nobody else.',
    voss: 'That is my voice. That is my name on the door. Why is it my name on the door?'
  }
};

const waypointTarget = new THREE.Vector3();

export class Level2Session {
  constructor(game) {
    this.game = game;
    const root = document.getElementById('ui-layer');
    this.uiRoot = root;
    this.ready = false;
    this._dying = false;
    this.invuln = 0;
    this.eHeld = false;
    this.inPod = false;
    this.prevView = 'third';
    this._wpCam = new THREE.Vector3();
    this._wpVec = new THREE.Vector3();
    this._wpInfo = { x: 0, y: 0, angle: 0, onScreen: true, label: '', distance: 0 };
    this._eye = new THREE.Vector3();
    this._head = new THREE.Vector3();
    this._dir = new THREE.Vector3();

    // The camera: the old flashlight on it is the torch
    const camera = game.camera.instance;
    camera.far = 1500;
    camera.updateProjectionMatrix();
    this.flashlight = game.camera.flashlight;
    this.flashlight.castShadow = false;
    this.flashlight.intensity = 60;
    this.flashlight.visible = true;

    this._setUpBloom();

    this.level = new Level2(game.scene);
    game.currentLevel = this.level;
    this.controls = new PlayerController(camera, document.body, game.scene);
    game.controls = this.controls;
    this.controls.onViewChange = () => this._syncReticle();
    this.controls.onRespawn = () => {
      this.game.ui.showToast(`You fell. -${FALL_DAMAGE} health.`, 2500);
      this.damage(FALL_DAMAGE);
    };

    // Health, lives, inventory and stats carry over from level 1
    this.player = new PlayerStats();
    this.hud = new HUD(root, { onRestart: () => this.restart() });
    this.inventory = new Inventory(root);
    this.preview = new ItemPreview();
    this.preview.load().catch((e) => console.warn('Torch preview failed to load.', e));
    this.inventory.add('torch');
    this.hud.setTorch(true, true);
    this.inventory.statusFor.torch = () => (this.flashlight.visible ? 'ON' : 'OFF');

    this._buildDom();

    this.machines = [];
    this.pickups = [];
    this.terminals = [];
    this.consoles = [];
    this.rooms = ROOMS.map((r) => ({ ...r, repaired: false, tapeSeen: false }));

    document.addEventListener('keydown', (e) => this._onKeyDown(e));
    document.addEventListener('keyup', (e) => { if (e.code === 'KeyE') this.eHeld = false; });
    document.addEventListener('click', () => this._onClick());

    Physics.create().then(async (physics) => {
      this.physics = physics;
      await this.level.load(physics, game.renderer.instance);
      this.controls.attach(physics, this.level.spawn, this.level.spawnYaw);
      this._buildWorld();
      this.ready = true;
      this.game.ui.showToast('WASD move, Shift run, Space jump, V switches view, F torch, I inventory, E interact.', 8000);
    }).catch((e) => console.error('Level 2 failed to load.', e));
  }

  // Bright lights glow: the scene is drawn into a high-range buffer, the brightest parts are
  // blurred and added back (bloom), then filmic tone mapping brings it to the screen
  _setUpBloom() {
    const r = this.game.renderer;
    const webgl = r.instance;
    webgl.toneMapping = THREE.ACESFilmicToneMapping;
    webgl.toneMappingExposure = 0.85;
    const size = new THREE.Vector2();
    webgl.getSize(size);
    this.composer = new EffectComposer(webgl);
    this.composer.addPass(new RenderPass(this.game.scene, this.game.camera.instance));
    this.bloom = new UnrealBloomPass(size.clone(), 0.22, 0.4, 1.1); // strength, radius, threshold
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    r.render = () => this.composer.render();
    window.addEventListener('resize', () => this.composer.setSize(window.innerWidth, window.innerHeight));
  }

  // ---------------------------------------------------------
  // Page furniture
  // ---------------------------------------------------------
  _buildDom() {
    const mk = (id, html = '') => {
      const el = document.createElement('div');
      el.id = id;
      el.innerHTML = html;
      this.uiRoot.appendChild(el);
      return el;
    };
    this.tag = mk('level-tag', 'LEVEL 2  ·  CARGO ATRIUM');
    this.noSignal = mk('no-signal', 'NO SIGNAL');
    this.holdBar = mk('hold-bar', '<div id="hold-fill"></div>');
    this.holdFill = this.holdBar.querySelector('#hold-fill');
    this.tapeEl = mk('tape-overlay', `
      <div class="tape-screen">
        <div class="tape-rec">&#9679; PLAY</div>
        <div class="tape-title"></div>
        <p class="tape-body"></p>
        <p class="tape-voss"></p>
        <div class="tape-continue">Press Space, Enter or click to continue</div>
      </div>`);
    this.tapeTitle = this.tapeEl.querySelector('.tape-title');
    this.tapeBody = this.tapeEl.querySelector('.tape-body');
    this.tapeVoss = this.tapeEl.querySelector('.tape-voss');
  }

  // ---------------------------------------------------------
  // The things in the hall
  // ---------------------------------------------------------
  _buildWorld() {
    const scene = this.game.scene;
    const metal = () => new THREE.MeshStandardMaterial({ color: 0x2a323c, roughness: 0.5, metalness: 0.6 });
    const glow = (hex) => new THREE.MeshBasicMaterial({ color: hex });

    for (const room of this.rooms) {
      // Machine
      const m = new Machine(room.machine.type, room.machine.path, { radial: room.machine.radial });
      scene.add(m.group);
      this.machines.push(m);
      room.machineRef = m;

      // Repair console beside the door
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 0.55), metal());
      body.position.y = 0.5;
      const screen = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.05), glow(0xff3030));
      screen.position.set(0, 1.05, 0.0);
      screen.rotation.x = -0.35;
      g.add(body, screen);
      g.position.copy(room.console);
      g.position.y = room.console.y;
      g.lookAt(new THREE.Vector3(0, room.console.y, 0)); // faces the centre of the hall
      scene.add(g);
      this.consoles.push({ room, group: g, screen, progress: 0, pos: room.console.clone() });

      // The counter-item on a little crate, with a glow so it can be found
      const p = this._makePickup(room.pickup.item);
      p.group.position.copy(room.pickup.pos);
      scene.add(p.group);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, room.pickup.pos.y - 0.1, 0.8), metal());
      crate.position.set(room.pickup.pos.x, (room.pickup.pos.y - 0.1) / 2, room.pickup.pos.z);
      scene.add(crate);
      this.pickups.push({ room, item: room.pickup.item, pos: room.pickup.pos.clone(), mesh: p, crate, taken: false });

      // The log terminal that hints at it
      const t = new THREE.Group();
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.4), metal());
      stand.position.y = 0.55;
      const ts = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.38, 0.05), glow(0x33b8ff));
      ts.position.set(0, 1.2, 0.05);
      ts.rotation.x = -0.3;
      t.add(stand, ts);
      t.position.copy(room.terminal.pos);
      t.lookAt(new THREE.Vector3(0, room.terminal.pos.y, 0));
      scene.add(t);
      this.terminals.push({ ...room.terminal, room, mesh: t });
    }
  }

  _makePickup(item) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 6, 28),
      new THREE.MeshBasicMaterial({ color: 0x66ccff }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.35;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 3.4, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x4fb8ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 1.35;
    const body = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x55697a, roughness: 0.4, metalness: 0.7 });
    if (item === 'coolant') {
      body.add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 12), steel));
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.08, 12), new THREE.MeshBasicMaterial({ color: 0x4ff0ff }));
      band.position.y = 0.1;
      body.add(band);
    } else if (item === 'prybar') {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.95), steel);
      bar.rotation.x = 0.5;
      body.add(bar);
    } else {
      body.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.42, 8), new THREE.MeshStandardMaterial({ color: 0x7a1d1d })));
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5a4a }));
      tip.position.y = 0.24;
      body.add(tip);
    }
    group.add(ring, beam, body);
    return { group, body };
  }

  // ---------------------------------------------------------
  // Input
  // ---------------------------------------------------------
  _onKeyDown(e) {
    const g = this.game;
    if (g.state === 'PLAYING') {
      if (e.code === 'KeyE' && !e.repeat) this._pressInteract();
      else if (e.code === 'KeyF' && !e.repeat) this._toggleFlashlight();
      else if (e.code === 'KeyI' && !e.repeat) this.openInventory();
    } else if (g.state === 'INVENTORY') {
      if (e.code === 'KeyI' || e.code === 'Escape') this.closeInventory();
    } else if (g.state === 'TAPE') {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Escape') {
        e.preventDefault();
        this.closeTape();
      }
    }
  }

  _onClick() {
    const g = this.game;
    if (g.state === 'TAPE') this.closeTape();
    else if (g.state === 'PLAYING' && !this.controls.instance.isLocked) this.controls.lock();
  }

  _toggleFlashlight() {
    this.flashlight.visible = !this.flashlight.visible;
    this.hud.setTorch(true, this.flashlight.visible);
  }

  openInventory() {
    const g = this.game;
    if (g.state !== 'PLAYING') return;
    g.state = 'INVENTORY';
    g.reticle.classList.remove('visible');
    this.controls.stop();
    this.inventory.show(this.player, g.ui.objectiveText.textContent);
  }

  closeInventory() {
    const g = this.game;
    if (g.state !== 'INVENTORY') return;
    this.inventory.close();
    this.controls.instance.enabled = true;
    g.state = 'PLAYING';
    this._syncReticle();
  }

  _syncReticle() {
    const show = this.game.state === 'PLAYING' && this.controls.view === 'first';
    this.game.reticle.classList.toggle('visible', show);
  }

  // ---------------------------------------------------------
  // Interaction: the nearest thing in reach
  // ---------------------------------------------------------
  _near(pos, radius) {
    const p = this.controls.position;
    return Math.hypot(p.x - pos.x, p.z - pos.z) < radius && Math.abs(p.y - pos.y) < 2.6;
  }

  // Returns { label, hold, run() } for the nearest usable thing, or null
  _nearestInteract() {
    let best = null;
    let bestDist = Infinity;
    const p = this.controls.position;
    // `bias` makes the more important thing win when two are in reach (a terminal sits
    // right beside its item, and the item should be takeable)
    const consider = (pos, radius, entry, bias = 0) => {
      if (!this._near(pos, radius)) return;
      const d = Math.hypot(p.x - pos.x, p.z - pos.z) - bias;
      if (d < bestDist) { bestDist = d; best = entry; }
    };

    for (const pk of this.pickups) {
      if (pk.taken) continue;
      consider(pk.pos, 2.3, { label: `Take ${ITEMS[pk.item].name.toLowerCase()}`, run: () => this._takePickup(pk) }, 2);
    }
    for (const t of this.terminals) {
      consider(t.pos, 2.3, { label: 'Read log', run: () => this.game.ui.showToast(`${t.title}: ${t.text}`, 9000) });
    }
    for (const c of this.consoles) {
      if (c.room.repaired) continue;
      consider(c.pos, 2.8, { label: `Repair the door console, Quarters ${c.room.id}`, hold: true, console: c }, 1);
    }
    for (const room of this.rooms) {
      const m = room.machineRef;
      if (!m || !m.active) continue;
      const need = MACHINE_TYPES[m.type].counter;
      if (this.inventory.has(need) && this._near(m.group.position, 5.0)) {
        consider(m.group.position, 5.0, { label: `Use ${ITEMS[need].name.toLowerCase()} on the ${MACHINE_TYPES[m.type].name}`, run: () => this._useCounter(room) }, 4);
      }
    }
    for (const room of this.rooms) {
      const tapePos = this.level.tapes[room.id];
      if (tapePos && this.level.isQuartersOpen(room.id) && !room.tapeSeen) {
        consider(tapePos, 2.4, { label: 'Play videotape', run: () => this.playTape(room) }, 2);
      }
    }
    if (this._allTapesSeen()) {
      consider(new THREE.Vector3(0, 14, 0), 6.0, { label: 'Core lift', run: () => this.game.ui.showToast('The lift to level 3 is not built yet. End of level 2 for now.', 5000) });
    }
    return best;
  }

  _pressInteract() {
    const hit = this._nearestInteract();
    if (!hit) return;
    if (hit.hold) this.eHeld = true;
    else hit.run();
  }

  _takePickup(pk) {
    pk.taken = true;
    pk.mesh.group.visible = false;
    pk.crate.visible = true;
    this.inventory.add(pk.item);
    this.game.ui.showToast(`${ITEMS[pk.item].name} taken. I opens your inventory.`, 3500);
  }

  _useCounter(room) {
    const m = room.machineRef;
    const need = MACHINE_TYPES[m.type].counter;
    this.inventory.owned = this.inventory.owned.filter((id) => id !== need);
    m.disable();
    this.game.ui.showToast(`The ${MACHINE_TYPES[m.type].name} shudders, and its lights go out.`, 3500);
  }

  // ---------------------------------------------------------
  // Quarters and tapes
  // ---------------------------------------------------------
  _repairDone(console_) {
    const room = console_.room;
    room.repaired = true;
    console_.screen.material.color.setHex(0x33ffaa);
    this.level.openQuarters(room.id);
    this.player.puzzlesSolved++;
    this.game.ui.showToast(`Console repaired. Quarters ${room.id} is unsealed.`, 4000);
  }

  playTape(room) {
    const g = this.game;
    const tape = TAPES[room.id];
    this.tapeTitle.textContent = tape.title;
    this.tapeBody.textContent = tape.body;
    this.tapeVoss.textContent = `VOSS: ${tape.voss}`;
    this.tapeEl.classList.add('visible');
    this._tapeRoom = room;
    g.state = 'TAPE';
    g.reticle.classList.remove('visible');
    g.ui.setPrompt(null);
    this.controls.stop();
  }

  closeTape() {
    const g = this.game;
    if (g.state !== 'TAPE') return;
    this.tapeEl.classList.remove('visible');
    this.controls.instance.enabled = true;
    if (this._tapeRoom) this._tapeRoom.tapeSeen = true;
    this._tapeRoom = null;
    g.state = 'PLAYING';
    this._syncReticle();
    if (this._allTapesSeen()) g.ui.showToast('Every quarters has been searched. The core lift is the way down.', 6000);
  }

  _allTapesSeen() {
    return this.rooms.every((r) => r.tapeSeen);
  }

  // ---------------------------------------------------------
  // Health, death, restart
  // ---------------------------------------------------------
  damage(amount) {
    if (this._dying || this.invuln > 0) return;
    this.invuln = 1.2;
    const flatlined = this.player.damage(amount);
    this.hud.flash();
    if (flatlined) this.onFlatline();
  }

  async onFlatline() {
    if (this._dying) return;
    const g = this.game;
    this._dying = true;
    this.eHeld = false;
    this.holdBar.classList.remove('visible');
    g.ui.hideToast();
    this.inventory.close();
    g.state = 'DEAD';
    this.controls.stop();
    g.reticle.classList.remove('visible');

    this.hud.showDeath('SIGNAL LOST', 'Your health ran out...');
    await sleep(2200);

    if (!this.player.hasRestoreLeft) {
      g.state = 'GAME_OVER';
      document.exitPointerLock?.();
      const p = this.player;
      this.hud.showGameOver(
        'Backup... corrupted. I am so sorry, Voss. I really did try.',
        `Times revived ${p.deaths}   |   Puzzles solved ${p.puzzlesSolved}   |   Time ${formatTime(p.playSeconds)}`
      );
      return;
    }

    this.player.useRestore();
    this.hud.showDeath('RESTORING FROM BACKUP', `Lives left: ${this.player.restores}`);
    await sleep(1800);

    // Back on his feet at the last place he stood safely; the machines forget the chase
    this.controls.teleport(this.controls.lastSafe.clone());
    this.controls.instance.enabled = true;
    for (const m of this.machines) m.calm();
    this.hud.hideDeath();
    this._dying = false;
    g.state = 'PLAYING';
    this._syncReticle();
  }

  // Start over without reloading the page
  restart() {
    const g = this.game;
    this.hud.hideGameOver();
    this.hud.hideDeath();
    this.tapeEl.classList.remove('visible');
    g.ui.hideToast();

    this.player.reset();
    this.inventory.reset();
    this.inventory.add('torch');
    this.flashlight.visible = true;
    this.hud.setTorch(true, true);

    this.level.resetWorld();
    for (const room of this.rooms) {
      room.repaired = false;
      room.tapeSeen = false;
      room.machineRef.reset();
    }
    for (const c of this.consoles) {
      c.progress = 0;
      c.screen.material.color.setHex(0xff3030);
    }
    for (const pk of this.pickups) {
      pk.taken = false;
      pk.mesh.group.visible = true;
    }
    this.eHeld = false;
    this._dying = false;
    this.invuln = 0;
    this.holdBar.classList.remove('visible');

    this.controls.teleport(this.level.spawn.clone());
    this.controls.camera.rotation.set(0, this.level.spawnYaw, 0);
    this.controls.instance.enabled = true;
    this.controls.lock();
    g.state = 'WAKING';
    g.ui.playWakeUp().then(() => {
      if (g.state === 'WAKING') g.state = 'PLAYING';
    });
  }

  // ---------------------------------------------------------
  // Guidance: what to do next, and where it is
  // ---------------------------------------------------------
  _guidance() {
    const roomName = (r) => `Quarters ${r.id}`;
    for (const room of this.rooms) {
      if (room.tapeSeen) continue;
      const m = room.machineRef;
      const spec = MACHINE_TYPES[room.machine.type];
      if (!room.repaired) {
        const guard = m.active
          ? `A ${spec.name} patrols it: time your repair, or find something that stops it.`
          : `The ${spec.name} is down.`;
        waypointTarget.copy(room.console);
        waypointTarget.y += 1.2;
        return { text: `${roomName(room)} is sealed. Repair the console beside its door. ${guard}`, label: `CONSOLE ${room.id}`, target: waypointTarget };
      }
      const tape = this.level.tapes[room.id];
      waypointTarget.copy(tape || room.console);
      return { text: `${roomName(room)} is open. Find the videotape inside.`, label: `TAPE ${room.id}`, target: waypointTarget };
    }
    waypointTarget.set(0, 15, 0);
    return { text: 'Every quarters has been searched. Take the core lift down.', label: 'CORE LIFT', target: waypointTarget };
  }

  _updateWaypoint(target, label) {
    const ui = this.game.ui;
    const camera = this.game.camera.instance;
    this._wpCam.copy(target).applyMatrix4(camera.matrixWorldInverse);
    const inFront = this._wpCam.z < 0;
    this._wpVec.copy(target).project(camera);
    let nx = this._wpVec.x;
    let ny = this._wpVec.y;
    if (!inFront) { nx = -nx; ny = -ny; }
    const info = this._wpInfo;
    info.onScreen = inFront && Math.abs(nx) < 0.92 && Math.abs(ny) < 0.88;
    info.angle = (Math.atan2(nx, ny) * 180) / Math.PI;
    if (!info.onScreen) {
      const scale = 1 / Math.max(Math.abs(nx) / 0.92, Math.abs(ny) / 0.88, 1e-6);
      nx *= scale;
      ny *= scale;
    }
    info.x = (nx * 0.5 + 0.5) * window.innerWidth;
    info.y = (-ny * 0.5 + 0.5) * window.innerHeight;
    info.label = label;
    info.distance = camera.position.distanceTo(target);
    ui.setWaypoint(info);
  }

  // ---------------------------------------------------------
  // Per frame
  // ---------------------------------------------------------
  _canSee(machine, target) {
    machine.eyePosition(this._eye);
    this._head.set(target.x, target.y + 1.4, target.z);
    this._dir.subVectors(this._head, this._eye);
    const dist = this._dir.length();
    this._dir.normalize();
    const hit = this.physics.castRay(this._eye, this._dir, dist);
    return hit === null || hit > dist - 0.6;
  }

  update(delta) {
    const g = this.game;
    if (!this.ready || !this.controls.ready) return;

    const playing = g.state === 'PLAYING';
    const live = playing || g.state === 'WAKING' || g.state === 'INVENTORY' || g.state === 'TAPE';
    if (live) this.controls.update(delta, playing);
    if (playing) this.level.openElevator();
    this.level.update(delta);
    if (this.invuln > 0) this.invuln -= delta;
    if (live && g.state !== 'WAKING') this.player.playSeconds += delta;

    // HUD and the live 3D torch in its slot
    this.hud.setVisible(g.state !== 'INIT' && g.state !== 'GAME_OVER');
    this.hud.update(this.player);
    this.tag.classList.toggle('visible', g.state !== 'INIT' && g.state !== 'GAME_OVER');
    if (this.preview.ready) {
      const targets = [this.hud.torchCanvas];
      if (this.inventory.open && this.inventory.torchCanvas) targets.push(this.inventory.torchCanvas);
      this.preview.draw(targets, delta, this.flashlight.visible);
    }

    // Bedrooms are out of reach of the camera network: first person only, and no signal
    const p = this.controls.position;
    const r = Math.hypot(p.x, p.z);
    const a = angleOf(p);
    const inElevator = Math.abs(a - 270) < 9 && p.y < 6;
    const inPod = r > 33.2 && !inElevator;
    if (inPod !== this.inPod) {
      this.inPod = inPod;
      if (inPod) {
        this.prevView = this.controls.view;
        this.controls.setView('first');
        this.controls.viewLocked = true;
      } else {
        this.controls.viewLocked = false;
        this.controls.setView(this.prevView);
      }
      this.noSignal.classList.toggle('visible', inPod);
    }

    if (!playing) {
      g.ui.setPrompt(null);
      g.ui.setWaypoint(null);
      this.holdBar.classList.remove('visible');
      return;
    }

    // Machines
    const ctx = { playerPos: p, canSee: (m, t) => this._canSee(m, t), onHit: (dmg) => this.damage(dmg) };
    for (const m of this.machines) m.update(delta, ctx);

    // Pickup glow
    const t = performance.now() / 1000;
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      pk.mesh.body.position.y = Math.sin(t * 2) * 0.06;
      pk.mesh.body.rotation.y = t;
    }

    // Prompt, and the hold-to-repair bar
    const hit = this._nearestInteract();
    let holdProgress = null;
    for (const c of this.consoles) {
      if (hit && hit.console === c && this.eHeld) c.progress = Math.min(1, c.progress + delta / REPAIR_SECONDS);
      else c.progress = Math.max(0, c.progress - delta / 1.5);
      if (c.progress > 0 && !c.room.repaired) holdProgress = c.progress;
      if (c.progress >= 1 && !c.room.repaired) this._repairDone(c);
    }
    if (!hit || !hit.hold) this.eHeld = false;
    this.holdBar.classList.toggle('visible', holdProgress !== null);
    if (holdProgress !== null) this.holdFill.style.width = `${(holdProgress * 100).toFixed(0)}%`;
    g.ui.setPrompt(hit ? `${hit.hold ? 'Hold E' : 'E'}   ${hit.label}` : null);

    // Where to go
    const goal = this._guidance();
    g.ui.setObjective(goal.text);
    this._updateWaypoint(goal.target, goal.label);
    this._syncReticle();
  }
}

import * as THREE from 'three';
import { PlayerStats, MAX_INTEGRITY } from '../player/PlayerStats.js';
import { PlayerController } from '../player/PlayerController.js';
import { HUD } from '../ui/HUD.js';
import { Inventory } from '../ui/Inventory.js';
import { ItemPreview } from '../ui/ItemPreview.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Physics } from '../core/Physics.js';
import { Level2, polar, angleOf } from './Level2.js';
import { CargoBayCourse, CARGO_BAY } from './wing1/CargoBayCourse.js';
import '../ui/level2.css';

// Everything that happens in level 2, kept out of Game.js so the two can be worked on at
// the same time.
//
// Level 2 is a hub (the cargo atrium: reactor, elevator in, lift out) with a wing room off
// it for each obstacle course, like the chapters of It Takes Two. Each course is built on
// one idea and ends in a crew member's quarters with a videotape. Every robot is defeated by
// the player. Dying restarts the current course (no lives are lost in level 2).
//
//   Wing 1  Cargo Bay   (door A, ground)   the crane          -> Quarters A, tape A
//   Wing 2  Maintenance (door B, tier 1)   not built yet      -> Quarters B, tape B (pod)
//   Wing 3  Security    (door C, tier 2)   not built yet      -> Quarters C, tape C (pod)
// Doors unlock in order. After the three tapes, the core lift leads to level 3.

const FALL_DAMAGE = 10;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Hub doors: where they are, and what unlocks them
const DOORS = {
  A: { pos: polar(31.0, 90, 0), name: 'Cargo Bay' },
  B: { pos: polar(31.0, 200, 7), name: 'Maintenance' },
  C: { pos: polar(31.0, 320, 14), name: 'Security' }
};

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

const CRANE_HELP = 'CRANE   A / D and W / S move   ·   E pick up / drop   ·   Q leave';
const waypointTarget = new THREE.Vector3();

export class Level2Session {
  constructor(game) {
    this.game = game;
    const root = document.getElementById('ui-layer');
    this.uiRoot = root;
    this.ready = false;
    this._dying = false;
    this.invuln = 0;
    this.inPod = false;
    this.inWing = false;
    this.prevView = 'third';
    this.tapeSeen = { A: false, B: false, C: false };
    this._sealedNoticed = {};
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
    this.flashlight.visible = true;
    this.torchOn = true;
    this.flashlight.intensity = 35;   // the HUD does not exist yet; _setTorch is used from here on

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

    // Health, inventory and stats carry over from level 1
    this.player = new PlayerStats();
    this.hud = new HUD(root, { onRestart: () => this.restart() });
    this.inventory = new Inventory(root);
    this.preview = new ItemPreview();
    this.preview.load().catch((e) => console.warn('Torch preview failed to load.', e));
    this.inventory.add('torch');
    this.hud.setTorch(true, true);
    this.inventory.statusFor.torch = () => (this.torchOn ? 'ON' : 'OFF');

    this._buildDom();

    document.addEventListener('keydown', (e) => this._onKeyDown(e));
    document.addEventListener('click', () => this._onClick());

    Physics.create().then(async (physics) => {
      this.physics = physics;
      await this.level.load(physics, game.renderer.instance);
      this.controls.attach(physics, this.level.spawn, this.level.spawnYaw);
      this.course = new CargoBayCourse({
        scene: game.scene, physics, level: this.level, inventory: this.inventory,
        toast: (text) => this.game.ui.showToast(text, 3500)
      });
      await this._precompile();
      this.ready = true;
      this.loadingEl.classList.remove('visible');
      this.game.ui.showToast('WASD move · double-tap W run · Shift crouch · SPACE jump · V camera · F torch · I inventory · E use', 9000);
    }).catch((e) => console.error('Level 2 failed to load.', e));
  }

  // Bright lights glow: the scene is drawn into a high-range buffer, the brightest parts are
  // blurred and added back (bloom), then filmic tone mapping brings it to the screen
  _setUpBloom() {
    const r = this.game.renderer;
    const webgl = r.instance;
    webgl.toneMapping = THREE.ACESFilmicToneMapping;
    webgl.toneMappingExposure = 0.92;
    const size = new THREE.Vector2();
    webgl.getSize(size);
    // The composer draws into its own buffer, which has no anti-aliasing unless asked for:
    // 4x multisampling here is what keeps edges smooth instead of stair-stepped and shimmery
    webgl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    const pr = webgl.getPixelRatio();
    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(webgl, target);
    this.composer.addPass(new RenderPass(this.game.scene, this.game.camera.instance));
    this.bloom = new UnrealBloomPass(size.clone(), 0.16, 0.4, 1.1); // strength, radius, threshold
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    r.render = () => this.composer.render();
    window.addEventListener('resize', () => this.composer.setSize(window.innerWidth, window.innerHeight));
  }

  // Lab and laptop GPUs vary a lot. Watch the real frame time for the first stretch of play; if
  // the game runs below about 45 fps, draw at a lower resolution (the HUD stays sharp, it is HTML).
  _autoQuality(delta) {
    if (this._qualityDone) return;
    this._qSum = (this._qSum || 0) + delta;
    this._qFrames = (this._qFrames || 0) + 1;
    if (this._qSum < 4) return;
    const avg = this._qSum / this._qFrames;
    this._qSum = 0;
    this._qFrames = 0;
    const webgl = this.game.renderer.instance;
    const pr = webgl.getPixelRatio();
    if (avg > 1 / 45 && pr > 0.6) {
      const next = Math.max(0.6, +(pr * 0.8).toFixed(2));
      webgl.setPixelRatio(next);
      this.composer.setPixelRatio(next);
      this.composer.setSize(window.innerWidth, window.innerHeight);
      console.info(`Level 2: running at ${(1 / avg).toFixed(0)} fps, render scale lowered to ${next}`);
    } else {
      this._qualityDone = true;
    }
  }

  // The torch never leaves the scene: switching it by brightness keeps the light count fixed
  _setTorch(on) {
    this.torchOn = on;
    this.flashlight.intensity = on ? 35 : 0;
    this.hud.setTorch(true, on);
  }

  // Every material compiles its shader the first time it is drawn. Left alone, that happens
  // while the player walks around and each new thing that comes into view freezes a frame.
  // Compile them all now, while the loading screen is up, and draw the glow passes once.
  async _precompile() {
    const webgl = this.game.renderer.instance;
    try {
      await webgl.compileAsync(this.game.scene, this.game.camera.instance);
    } catch (e) {
      webgl.compile(this.game.scene, this.game.camera.instance);
    }
    this.composer.render();
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
    this.loadingEl = mk('level-loading', '<div class="loading-title">LEVEL 2</div><div class="loading-sub">Pressurising the cargo atrium...</div><div class="loading-bar"><div></div></div>');
    this.loadingEl.classList.add('visible');
    this.noSignal = mk('no-signal', 'NO SIGNAL');
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
  // Input
  // ---------------------------------------------------------
  _onKeyDown(e) {
    const g = this.game;
    if (g.state === 'PLAYING') {
      if (e.code === 'KeyE' && !e.repeat) this._pressInteract();
      else if (e.code === 'KeyF' && !e.repeat) this._setTorch(!this.torchOn);
      else if (e.code === 'KeyI' && !e.repeat) this.openInventory();
    } else if (g.state === 'CRANE') {
      if (e.repeat) return;
      if (e.code === 'KeyQ' || e.code === 'Escape') this.exitCrane();
      else {
        if (e.code === 'Space') e.preventDefault();
        const msg = this.course.craneKey(e.code);
        if (msg) this.game.ui.showToast(msg, 1800);
      }
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
  // The crane
  // ---------------------------------------------------------
  enterCrane() {
    const g = this.game;
    if (g.state !== 'PLAYING') return;
    g.state = 'CRANE';
    this.controls.stop();
    g.reticle.classList.remove('visible');
    this.course.enterCrane(g.camera.instance);
  }

  exitCrane(force = false) {
    const g = this.game;
    if (g.state !== 'CRANE') return;
    if (!force && this.course.craneBusy) {
      g.ui.showToast('Wait for the crane to finish moving.', 1500);
      return;
    }
    this.course.exitCrane(g.camera.instance);
    this.controls.instance.enabled = true;
    g.state = 'PLAYING';
    this._syncReticle();
  }

  // ---------------------------------------------------------
  // Interaction: the nearest thing in reach
  // ---------------------------------------------------------
  _near(pos, radius) {
    const p = this.controls.position;
    return Math.hypot(p.x - pos.x, p.z - pos.z) < radius && Math.abs(p.y - pos.y) < 2.6;
  }

  _nearestInteract() {
    let best = null;
    let bestScore = Infinity;
    const p = this.controls.position;
    // bias: the more important thing wins when two are in reach
    const consider = (pos, radius, entry, bias = 0) => {
      if (!this._near(pos, radius)) return;
      const score = Math.hypot(p.x - pos.x, p.z - pos.z) - bias;
      if (score < bestScore) { bestScore = score; best = entry; }
    };
    for (const it of this.course.interactables(() => this.enterCrane())) {
      consider(it.pos, it.radius, it, it.bias || 0);
    }
    for (const letter of ['A', 'B', 'C']) {
      const pos = this.level.tapes[letter];
      const open = letter === 'A' ? this.level.gates.GATE_W1?.opening : this.level.isQuartersOpen(letter);
      if (pos && open && !this.tapeSeen[letter]) {
        consider(pos, 2.4, { label: 'Play the videotape', run: () => this.playTape(letter) }, 2);
      }
    }
    if (this.tapeSeen.A && this.tapeSeen.B && this.tapeSeen.C) {
      consider(new THREE.Vector3(0, 14, 0), 6.0, { label: 'Core lift', run: () => this.game.ui.showToast('The lift to level 3 is not built yet. End of level 2 for now.', 5000) });
    }
    return best;
  }

  _pressInteract() {
    this._nearestInteract()?.run();
  }

  // ---------------------------------------------------------
  // Doors: the Cargo Bay is open from the start; the others unlock in order
  // ---------------------------------------------------------
  _doorUnlocked(letter) {
    if (letter === 'A') return true;
    if (letter === 'B') return !!this.course?.complete;
    return this.tapeSeen.B;
  }

  _updateDoors() {
    const p = this.controls.position;
    for (const [letter, d] of Object.entries(DOORS)) {
      const near = Math.hypot(p.x - d.pos.x, p.z - d.pos.z) < 7 && Math.abs(p.y - d.pos.y) < 3;
      if (!near) {
        this._sealedNoticed[letter] = false;
        continue;
      }
      if (this._doorUnlocked(letter)) {
        if (!this.level.isQuartersOpen(letter)) this.level.openQuarters(letter);
      } else if (!this._sealedNoticed[letter]) {
        this._sealedNoticed[letter] = true;
        const why = letter === 'B' ? 'Restore the Cargo Bay first.' : 'Search the Maintenance quarters first.';
        this.game.ui.showToast(`${d.name}: sealed. ${why}`, 3000);
      }
    }
  }

  // ---------------------------------------------------------
  // Tapes
  // ---------------------------------------------------------
  playTape(letter) {
    const g = this.game;
    const tape = TAPES[letter];
    this.tapeTitle.textContent = tape.title;
    this.tapeBody.textContent = tape.body;
    this.tapeVoss.textContent = `VOSS: ${tape.voss}`;
    this.tapeEl.classList.add('visible');
    this._tapeLetter = letter;
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
    const letter = this._tapeLetter;
    this._tapeLetter = null;
    if (letter) {
      this.tapeSeen[letter] = true;
      this.player.puzzlesSolved++;
      if (letter === 'A') this.course.markComplete();
    }
    g.state = 'PLAYING';
    this._syncReticle();
    if (this.tapeSeen.A && this.tapeSeen.B && this.tapeSeen.C) g.ui.showToast('Every quarters has been searched. The core lift is the way down.', 6000);
  }

  // ---------------------------------------------------------
  // Health and death. Like It Takes Two: dying in a course restarts that course; nothing is
  // lost for good, so there is no game over in level 2.
  // ---------------------------------------------------------
  damage(amount, from = null) {
    if (this._dying || this.invuln > 0) return;
    this.invuln = 1.0;
    if (this.game.state === 'CRANE') this.exitCrane(true);
    if (from) this.controls.knockback(from.group ? from.group.position : from);
    const flatlined = this.player.damage(amount);
    this.hud.flash();
    if (flatlined) this.onFlatline();
  }

  async onFlatline(reason = 'Your health ran out...') {
    if (this._dying) return;
    const g = this.game;
    this._dying = true;
    if (g.state === 'CRANE') this.exitCrane(true);
    g.ui.hideToast();
    this.inventory.close();
    g.state = 'DEAD';
    this.controls.stop();
    g.reticle.classList.remove('visible');
    this.hud.showDeath('SIGNAL LOST', reason);
    await sleep(1800);

    const inCourse = CARGO_BAY.contains(this.controls.position) && !this.course.complete;
    if (inCourse) {
      this.hud.showDeath('RESTARTING THE CARGO BAY', 'Back to the start of the course');
      this.course.reset();
      this.controls.teleport(CARGO_BAY.checkpoint.clone());
      this.controls.camera.rotation.set(0, 0, 0);
    } else {
      this.hud.showDeath('RESTORING', 'Back where you last stood safely');
      this.controls.teleport(this.controls.lastSafe.clone());
    }
    await sleep(1200);
    this.player.integrity = MAX_INTEGRITY;
    this.player.deaths++;
    for (const m of [...this.course.crawlers, this.course.welder]) m.calm();
    this.controls.instance.enabled = true;
    this.hud.hideDeath();
    this._dying = false;
    g.state = 'PLAYING';
    this._syncReticle();
  }

  // Start the whole level over without reloading the page
  restart() {
    const g = this.game;
    this.hud.hideGameOver();
    this.hud.hideDeath();
    this.tapeEl.classList.remove('visible');
    g.ui.hideToast();
    this.player.reset();
    this.inventory.reset();
    this.inventory.add('torch');
    this._setTorch(true);
    this.level.resetWorld();
    this.tapeSeen = { A: false, B: false, C: false };
    this.course.reset({ full: true });
    this._dying = false;
    this.invuln = 0;
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
    if (!this.course.complete) {
      if (!this.inWing) {
        waypointTarget.copy(DOORS.A.pos).setY(2.4);
        return { text: 'Enter the Cargo Bay: the lit lane leads straight to it.', label: 'CARGO BAY' };
      }
      return this.course.step(waypointTarget);
    }
    for (const letter of ['B', 'C']) {
      if (this.tapeSeen[letter]) continue;
      const d = DOORS[letter];
      if (this.level.isQuartersOpen(letter) && this.level.tapes[letter]) {
        waypointTarget.copy(this.level.tapes[letter]);
        return { text: `The ${d.name} quarters are open. Watch the videotape inside.`, label: `TAPE ${letter}` };
      }
      waypointTarget.copy(d.pos).setY(d.pos.y + 2.4);
      const where = letter === 'B' ? 'up the stairs, on the first catwalk' : 'on the top walkway';
      return { text: `The ${d.name} door is unsealed (${where}). The full wing comes later: for now it holds Quarters ${letter}.`, label: d.name.toUpperCase() };
    }
    waypointTarget.set(0, 15, 0);
    return { text: 'Every quarters has been searched. Take the core lift down.', label: 'CORE LIFT' };
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

  // Which crew quarters the player is standing in, if any (they are out of the camera network)
  _quartersAt(p) {
    if (p.z < -92.4 && Math.abs(p.x) < 3.8) return 'A';
    const r = Math.hypot(p.x, p.z);
    if (r < 33.2 || CARGO_BAY.contains(p)) return null;
    const a = angleOf(p);
    const d = (x, y) => Math.abs(((x - y + 540) % 360) - 180);
    if (d(a, 200) < 12) return 'B';
    if (d(a, 320) < 12) return 'C';
    return null;
  }

  update(delta) {
    const g = this.game;
    if (!this.ready || !this.controls.ready) return;

    const st = g.state;
    const playing = st === 'PLAYING';
    const crane = st === 'CRANE';
    const live = playing || st === 'WAKING' || st === 'INVENTORY' || st === 'TAPE';
    if (live) this.controls.update(delta, playing);
    else if (crane) this.physics.step(Math.min(delta, 0.05));   // keeps the moving containers' colliders current
    if (playing) this.level.openElevator();
    this.level.update(delta, g.camera.instance);
    this.course.update(delta, {
      player: this.controls,
      canSee: (m, t) => this._canSee(m, t),
      onHit: (dmg, m) => this.damage(dmg, m),
      playing: playing || crane
    });
    if (this.invuln > 0) this.invuln -= delta;
    if ((live || crane) && st !== 'WAKING') this.player.playSeconds += delta;
    if (playing) this._autoQuality(delta);

    // HUD and the live 3D torch in its slot
    this.hud.setVisible(st !== 'INIT');
    this.hud.update(this.player);
    this.tag.classList.toggle('visible', st !== 'INIT');
    if (this.preview.ready) {
      const targets = [this.hud.torchCanvas];
      if (this.inventory.open && this.inventory.torchCanvas) targets.push(this.inventory.torchCanvas);
      this.preview.draw(targets, delta, this.torchOn);
    }

    // Where the player is: the wing moves the lights there; quarters are first person only
    const p = this.controls.position;
    const inWing = CARGO_BAY.contains(p);
    if (inWing !== this.inWing) {
      this.inWing = inWing;
      this.level.setZone(inWing ? 'wing1' : 'hub');
      this.tag.textContent = inWing ? 'LEVEL 2  ·  WING 1  ·  CARGO BAY' : 'LEVEL 2  ·  CARGO ATRIUM';
    }
    const quarters = this._quartersAt(p);
    if (!!quarters !== this.inPod) {
      this.inPod = !!quarters;
      if (this.inPod) {
        this.prevView = this.controls.view;
        this.controls.setView('first');
        this.controls.viewLocked = true;
      } else {
        this.controls.viewLocked = false;
        this.controls.setView(this.prevView);
      }
      this.noSignal.classList.toggle('visible', this.inPod);
      this.level.lightQuarters(quarters);
    }

    // The channel's water is live: touching it is fatal
    if (playing && inWing && p.y < -0.7 && !this._dying) this.onFlatline('Electrocuted in the channel.');

    if (playing) this._updateDoors();

    if (crane) {
      g.ui.setPrompt(CRANE_HELP);
      g.ui.setWaypoint(null);
      return;
    }
    if (!playing) {
      g.ui.setPrompt(null);
      g.ui.setWaypoint(null);
      return;
    }

    const hit = this._nearestInteract();
    g.ui.setPrompt(hit ? `E   ${hit.label}` : null);

    const goal = this._guidance();
    g.ui.setObjective(goal.text);
    this._updateWaypoint(waypointTarget, goal.label);   // every guidance branch writes waypointTarget
    this._syncReticle();
  }
}

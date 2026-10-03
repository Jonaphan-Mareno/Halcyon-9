import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Physics } from '../core/Physics.js';
import { PlayerController } from '../player/PlayerController.js';
import { PlayerStats, MAX_INTEGRITY } from '../player/PlayerStats.js';
import { HUD } from '../ui/HUD.js';
import { createHubTextures, applyHubMaterials } from '../graphics/HubMaterials.js';
import { CoolantHose } from './CoolantHose.js';
import { FrostWater } from './FrostWater.js';
import { FrostFX } from './FrostFX.js';
import { FrostAudio } from './FrostAudio.js';
import { Scrubber } from './Scrubber.js';
import '../ui/level2.css';
import './hose.css';

// A test room for the coolant hose (open the game with ?level=hose). Nothing here is a real
// level: it is a sandbox to feel the hose before Level 2's rooms are built around it.
//
// In the room: a pool that freezes into walkable ice, a water-covered ramp that freezes into a
// slide, a pouring stream, a steam vent, a sparking cable across a doorway, crates that frost
// over, and three scrubbers to freeze and shatter. R resets everything.

const SPAWN = new THREE.Vector3(0, 0.1, 12);
const POOL = { x0: -7, x1: 7, z0: -14, z1: -3, water: -0.35, floor: -2.2 };
const RAMP = { x0: 11, x1: 15, zTop: -11.5, zBottom: 4.5, height: 3.5 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const named = (name, hex, emissive = null, intensity = 0) => {
  const m = new THREE.MeshStandardMaterial({ name, color: hex, roughness: 0.45, metalness: 0.3 });
  if (emissive !== null) {
    m.emissive.setHex(emissive);
    m.emissiveIntensity = intensity;
  }
  return m;
};

export class HoseTestSession {
  constructor(game) {
    this.game = game;
    this.ready = false;
    this.trigger = false;
    this.shake = 0;
    this._crackleWait = 0;
    this._dying = false;
    this.freezables = [];
    this._aim = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();

    const camera = game.camera.instance;
    camera.far = 400;
    camera.updateProjectionMatrix();
    game.camera.flashlight.intensity = 0;
    game.camera.flashlight.castShadow = false;

    this._setUpRendering();
    this.player = new PlayerStats();
    this.hud = new HUD(document.getElementById('ui-layer'), { onRestart: () => {} });
    this.controls = new PlayerController(camera, document.body, game.scene);
    game.controls = this.controls;
    this.controls.camDist = 3.6;
    this.controls.shoulder = 0.75;
    this.controls.aimFacing = true;
    this.controls.onRespawn = () => this.damage(10);
    this.audio = new FrostAudio();
    this.fx = new FrostFX(game.scene);
    this._buildDom();

    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.audio.start();
      if (game.state === 'PLAYING' && !this.controls.instance.isLocked) {
        this.controls.lock();
        return;
      }
      this.trigger = true;
    });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.trigger = false; });
    document.addEventListener('keydown', (e) => {
      this.audio.start();
      if (e.code === 'KeyR' && !e.repeat && game.state === 'PLAYING') this.resetRoom();
    });

    Physics.create().then(async (physics) => {
      this.physics = physics;
      this._buildRoom();
      this.controls.attach(physics, SPAWN.clone(), 0);
      this.hose = new CoolantHose(game.scene, this.controls);
      await this._precompile();
      this.ready = true;
      this.loadingEl.classList.remove('visible');
      game.ui.showToast('Hold LEFT CLICK to spray frost  ·  mouse to aim  ·  WASD + Space  ·  R resets the room', 9000);
    }).catch((e) => console.error('Hose test failed to load.', e));
  }

  // ---------------------------------------------------------------- rendering (as level 2)
  _setUpRendering() {
    const g = this.game;
    const webgl = g.renderer.instance;
    webgl.toneMapping = THREE.ACESFilmicToneMapping;
    webgl.toneMappingExposure = 0.95;
    webgl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    const size = new THREE.Vector2();
    webgl.getSize(size);
    const pr = webgl.getPixelRatio();
    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(webgl, target);
    this.composer.addPass(new RenderPass(g.scene, g.camera.instance));
    this.composer.addPass(new UnrealBloomPass(size.clone(), 0.18, 0.4, 1.0));
    this.composer.addPass(new OutputPass());
    g.renderer.render = () => this.composer.render();
    window.addEventListener('resize', () => this.composer.setSize(window.innerWidth, window.innerHeight));
    // something for the metal to reflect, so it reads as metal instead of going black
    const pmrem = new THREE.PMREMGenerator(webgl);
    g.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    g.scene.environmentIntensity = 0.55;
    pmrem.dispose();
    g.scene.background = new THREE.Color(0x1c252b);
    g.scene.fog = new THREE.FogExp2(0xb6c3cc, 0.006);
  }

  async _precompile() {
    const webgl = this.game.renderer.instance;
    try {
      await webgl.compileAsync(this.game.scene, this.game.camera.instance);
    } catch (e) {
      webgl.compile(this.game.scene, this.game.camera.instance);
    }
    this.composer.render();
  }

  _buildDom() {
    const root = document.getElementById('ui-layer');
    this.loadingEl = document.createElement('div');
    this.loadingEl.id = 'level-loading';
    this.loadingEl.className = 'visible';
    this.loadingEl.innerHTML = '<div class="loading-title">LEVEL 2</div><div class="loading-sub">New build: coolant hose test room</div><div class="loading-bar"><div></div></div>';
    root.appendChild(this.loadingEl);
    this.gaugeEl = document.createElement('div');
    this.gaugeEl.id = 'coolant-gauge';
    this.gaugeEl.innerHTML = '<div class="coolant-fill"></div>';
    root.appendChild(this.gaugeEl);
    this.gaugeFill = this.gaugeEl.firstChild;
  }

  // ---------------------------------------------------------------- the room
  _buildRoom() {
    const scene = this.game.scene;
    const room = new THREE.Group();
    const M = {
      wall: named('hull_light', 0xb4b8bd),
      mid: named('hull_mid', 0x767b82),
      dark: named('hull_dark', 0x26292e),
      floor: named('floor_dark', 0x3a3f46),
      trim: named('trim', 0x8b929b),
      led: named('blue_glow', 0x18c8d0, 0x18e6f0, 2.2),
      lamp: named('white_glow', 0xe6f4ff, 0xe6f4ff, 3.0)
    };
    const box = (m, x0, y0, z0, x1, y1, z1) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      room.add(mesh);
      return mesh;
    };
    // floor around the pool (solid down to the pool's bed, so its edges are walls)
    box(M.floor, -17, -2.2, -3, 17, 0, 17);
    box(M.floor, -17, -2.2, -17, POOL.x0, 0, -3);
    box(M.floor, POOL.x1, -2.2, -17, 17, 0, -3);
    box(M.floor, POOL.x0, -2.2, -17, POOL.x1, 0, POOL.z0);
    box(M.dark, POOL.x0, -2.7, POOL.z0, POOL.x1, POOL.floor, POOL.z1);
    // walls, ceiling, LED lines, ceiling lights
    box(M.wall, -17.4, 0, -17.4, 17.4, 7, -17);
    box(M.wall, -17.4, 0, 17, 17.4, 7, 17.4);
    box(M.wall, -17.4, 0, -17, -17, 7, 17);
    box(M.wall, 17, 0, -17, 17.4, 7, 17);
    box(M.mid, -17.4, 7, -17.4, 17.4, 7.4, 17.4);
    for (const y of [2.6, 5.2]) {
      box(M.led, -16.99, y, -17, -16.94, y + 0.08, 17);
      box(M.led, 16.94, y, -17, 16.99, y + 0.08, 17);
      box(M.led, -17, y, 16.94, 17, y + 0.08, 16.99);
    }
    for (let x = -12; x <= 12; x += 8) for (let z = -12; z <= 12; z += 8) box(M.lamp, x - 1, 6.94, z - 1, x + 1, 7, z + 1);
    for (let k = 0; k < 9; k++) box(M.mid, -17, 0, -15 + k * 4, -16.4, 7, -14.6 + k * 4);   // wall ribs
    // stairs up to the platform, the platform, and the ramp down from it
    const steps = 12, run = 7 / steps;
    for (let k = 0; k < steps; k++) box(M.mid, 3 + k * run, 0, -16.6, 3 + (k + 1) * run, (k + 1) * (RAMP.height / steps), -14.2);
    box(M.mid, 10, 0, -16.6, 16.6, RAMP.height, RAMP.zTop);
    const len = RAMP.zBottom - RAMP.zTop;
    const theta = Math.atan2(RAMP.height, len);
    const L = Math.hypot(len, RAMP.height);
    const surf = new THREE.Vector3((RAMP.x0 + RAMP.x1) / 2, RAMP.height / 2, (RAMP.zTop + RAMP.zBottom) / 2);
    const normal = new THREE.Vector3(0, Math.cos(theta), Math.sin(theta));
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(RAMP.x1 - RAMP.x0, 0.4, L), M.trim);
    ramp.position.copy(surf).addScaledVector(normal, -0.2);
    ramp.rotation.x = theta;
    room.add(ramp);
    this.rampPlane = { point: surf.clone().addScaledVector(normal, 0.03), normal };

    applyHubMaterials(room, createHubTextures());
    scene.add(room);
    room.updateMatrixWorld(true);
    this.physics.addStaticObject(room);
    this.room = room;

    // the water
    this.pool = new FrostWater({ physics: this.physics, width: POOL.x1 - POOL.x0, length: POOL.z1 - POOL.z0, cell: 1,
      origin: new THREE.Vector3((POOL.x0 + POOL.x1) / 2, POOL.water, (POOL.z0 + POOL.z1) / 2), kind: 'pool' });
    scene.add(this.pool.group);
    this.film = new FrostWater({ physics: this.physics, width: RAMP.x1 - RAMP.x0, length: L, cell: 1,
      origin: this.rampPlane.point, tilt: theta, kind: 'film' });
    scene.add(this.film.group);

    this._buildFreezables(scene, M);
    this.scrubbers = [
      new Scrubber(scene, new THREE.Vector3(-3, POOL.water, -8)),
      new Scrubber(scene, new THREE.Vector3(2.5, POOL.water, -11)),
      new Scrubber(scene, new THREE.Vector3(4.5, POOL.water, -5.5))
    ];
    this._buildShadow(scene);

    scene.add(new THREE.HemisphereLight(0xeaf2f8, 0x50565e, 0.95));
    for (const [x, y, z, color, intensity, dist] of [[0, 6.4, -8, 0xdff4ff, 260, 32], [10, 6.2, 6, 0xffffff, 170, 26], [-10, 6.2, 4, 0xffffff, 170, 26]]) {
      const light = new THREE.PointLight(color, intensity, dist, 2);
      light.position.set(x, y, z);
      scene.add(light);
    }
  }

  // Things that react to frost: a pouring stream, a steam vent, a live cable, crates
  _buildFreezables(scene, M) {
    const add = (f) => { this.freezables.push(f); return f; };
    const frostWhite = new THREE.Color(0xe8f6ff);

    // a broken pipe pouring into the pool; frozen, it becomes a pillar of ice and freezes its splash
    const sx = -4, sz = -13.4, top = 6.2, bottom = POOL.water;
    const streamMat = new THREE.MeshStandardMaterial({ color: 0x5cc8d8, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.7 });
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, top - bottom, 12, 1, true), streamMat);
    stream.position.set(sx, (top + bottom) / 2, sz);
    scene.add(stream);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0x8b929b, metalness: 0.7, roughness: 0.35 }));
    pipe.position.set(sx, top + 0.2, sz - 0.4);
    pipe.rotation.x = Math.PI / 2;
    scene.add(pipe);
    add({
      name: 'stream', frost: 0, frozen: false,
      a: new THREE.Vector3(sx, bottom, sz), b: new THREE.Vector3(sx, top, sz), radius: 0.6,
      onFreeze: () => {
        streamMat.color.setHex(0xcfeefa);
        streamMat.opacity = 0.92;
        streamMat.roughness = 0.05;
        this.pool.applyFrost(new THREE.Vector3(sx, bottom, sz), 1.8, 5);
      },
      onReset: () => { streamMat.color.setHex(0x5cc8d8); streamMat.opacity = 0.7; streamMat.roughness = 0.1; },
      tick: (dt, f) => { if (!f.frozen) this.fx.mist(new THREE.Vector3(sx, bottom + 0.05, sz), dt, 18); }
    });

    // a steam vent in the floor; frozen, the steam stops and frost crusts the grate
    const vent = new THREE.Vector3(12, 0, 10);
    const grate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 1.6), new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.6, roughness: 0.4 }));
    grate.position.copy(vent).setY(0.03);
    scene.add(grate);
    const crust = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 1.7), new THREE.MeshStandardMaterial({ color: 0xe6f6ff, roughness: 0.2 }));
    crust.position.copy(vent).setY(0.09);
    crust.visible = false;
    scene.add(crust);
    add({
      name: 'vent', frost: 0, frozen: false, a: vent.clone(), b: vent.clone().setY(2.5), radius: 0.9,
      onFreeze: () => { crust.visible = true; },
      onReset: () => { crust.visible = false; },
      tick: (dt, f) => {
        if (f.frozen) return;
        this.fx.steam(vent, dt, 34);
        if (this._near(vent, 0.9, 2.5)) this.damage(dt * 20, vent, false);
      }
    });

    // a doorway with a live cable across it; frozen, it stops sparking and is safe to pass
    const c0 = new THREE.Vector3(-14, 1.3, 10), c1 = new THREE.Vector3(-10, 1.3, 10);
    for (const x of [-14.2, -9.8]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.2, 0.4), M.mid);
      post.position.set(x, 1.6, 10);
      scene.add(post);
    }
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x15191d, emissive: 0xffb040, emissiveIntensity: 1.5 });
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4, 6), cableMat);
    cable.rotation.z = Math.PI / 2;
    cable.position.set(-12, 1.3, 10);
    scene.add(cable);
    add({
      name: 'cable', frost: 0, frozen: false, a: c0, b: c1, radius: 0.5,
      onFreeze: () => { cableMat.emissiveIntensity = 0; cableMat.color.copy(frostWhite); },
      onReset: () => { cableMat.emissiveIntensity = 1.5; cableMat.color.setHex(0x15191d); },
      tick: (dt, f) => {
        if (f.frozen) return;
        cableMat.emissiveIntensity = 0.8 + Math.random() * 1.6;
        if (Math.random() < dt * 14) this.fx.sparks(this._v.lerpVectors(c0, c1, Math.random()), 5);
        const p = this.controls.position;
        if (Math.abs(p.z - 10) < 0.7 && p.x > -14 && p.x < -10 && p.y < 1.6) this.damage(12, this._v.set(p.x, 1, 10));
      }
    });

    // crates that frost over
    for (const [x, z] of [[-12, -6], [-13.4, -8.2], [-11.6, -9], [-12.6, -11]]) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x1a6b70, roughness: 0.5, metalness: 0.3 });
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), mat);
      crate.position.set(x, 0.6, z);
      scene.add(crate);
      const base = mat.color.clone();
      add({
        name: 'crate', frost: 0, frozen: false, a: crate.position.clone(), b: crate.position.clone(), radius: 0.9,
        onFreeze: () => {}, onReset: () => mat.color.copy(base),
        tick: (dt, f) => mat.color.copy(base).lerp(frostWhite, f.frost * 0.8)
      });
    }
  }

  // A soft round shadow under Voss, so jumps can be judged
  _buildShadow(scene) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const geo = new THREE.CircleGeometry(0.6, 24);
    geo.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    this.shadow.renderOrder = 3;
    scene.add(this.shadow);
  }

  // ---------------------------------------------------------------- helpers
  _near(at, radius, height) {
    const p = this.controls.position;
    return Math.hypot(p.x - at.x, p.z - at.z) < radius && p.y - at.y < height && p.y >= at.y - 0.3;
  }

  // Is a point inside the frost cone? (close to the line of fire, within range; the cone widens with distance)
  _inSpray(point, extra = 0) {
    const m = this.hose.muzzle, d = this.hose.dir;
    const vx = point.x - m.x, vy = point.y - m.y, vz = point.z - m.z;
    const along = vx * d.x + vy * d.y + vz * d.z;
    if (along < 0 || along > this.hose.range) return false;
    const px = vx - d.x * along, py = vy - d.y * along, pz = vz - d.z * along;
    return Math.hypot(px, py, pz) < 0.5 + along * 0.14 + extra;
  }

  // The same for a line (a stream, a cable): test points along it
  _segmentInSpray(a, b, extra) {
    for (let k = 0; k <= 8; k++) if (this._inSpray(this._w.lerpVectors(a, b, k / 8), extra)) return true;
    return false;
  }

  // Where does the line of fire hit a plane? (null if it misses or is out of range)
  _sprayHitsPlane(point, normal, out) {
    const m = this.hose.muzzle, d = this.hose.dir;
    const denom = d.dot(normal);
    if (denom > -1e-3) return null;
    const t = this._v.subVectors(point, m).dot(normal) / denom;
    if (t < 0 || t > this.hose.range) return null;
    return out.copy(m).addScaledVector(d, t);
  }

  damage(amount, from = null, flash = true) {
    if (this._dying) return;
    if (from && flash) {
      this.controls.knockback(from, 7);
      this.audio.hit();
    }
    if (flash) this.hud.flash();
    if (this.player.damage(amount)) this._die();
  }

  async _die() {
    this._dying = true;
    this.hud.showDeath('FROZEN OUT', 'Back to the start of the room');
    await sleep(1400);
    this.player.integrity = MAX_INTEGRITY;
    this.controls.teleport(SPAWN.clone());
    this.hud.hideDeath();
    this._dying = false;
  }

  resetRoom() {
    this.pool.reset();
    this.film.reset();
    for (const s of this.scrubbers) s.reset();
    for (const f of this.freezables) { f.frost = 0; f.frozen = false; f.onReset(); }
    this.hose.reset();
    this.player.integrity = MAX_INTEGRITY;
    this.controls.teleport(SPAWN.clone());
    this.controls.camera.rotation.set(0, 0, 0);
    this.game.ui.showToast('Room reset.', 1200);
  }

  _crackle() {
    if (this._crackleWait > 0) return;
    this._crackleWait = 0.07;
    this.audio.crackle();
  }

  _shatter(s) {
    s.shatter();
    this.fx.shatter(s.position);
    this.audio.shatter();
    this.shake = 0.35;
  }

  // ---------------------------------------------------------------- per frame
  update(delta) {
    const g = this.game;
    if (!this.ready || !this.controls.ready) return;
    const dt = Math.min(delta, 0.05);
    const playing = g.state === 'PLAYING';
    this._crackleWait -= dt;

    // what Voss is standing on decides how he moves (set before he moves)
    const p = this.controls.position;
    let surface = 'normal';
    this.controls.slopeAccel.set(0, 0, 0);
    if (this.film.covers(p, 0.7)) {
      if (this.film.isFrozenNear(p)) {
        surface = 'ice';
        this.controls.slopeAccel.copy(this.film.downhill).multiplyScalar(9.8 * this.film.slope * 3.0);
      } else surface = 'wade';
    } else if (this.pool.covers(p, 0.7) && this.pool.isFrozenNear(p)) surface = 'ice';
    this.controls.surface = surface;

    if (playing || g.state === 'WAKING') this.controls.update(dt, playing);

    // aim: whatever is under the crosshair
    const cam = g.camera.instance;
    cam.getWorldDirection(this._camDir);
    const hit = this.physics.castRay(cam.position, this._camDir, 60);
    this._aim.copy(cam.position).addScaledVector(this._camDir, hit === null ? 60 : hit);

    const wantFire = playing && this.trigger && this.controls.instance.isLocked;
    this.hose.update(dt, this._aim, wantFire, this.controls.view === 'third');
    this.audio.hiss(this.hose.firing);
    if (this.hose.firing) this._applyFrost(dt);

    // scrubbers
    const sctx = {
      player: p,
      surfaceY: (pos) => (pos.x > POOL.x0 && pos.x < POOL.x1 && pos.z > POOL.z0 && pos.z < POOL.z1 ? POOL.water : 0),
      onIce: (pos) => this.pool.covers(pos, 1) && this.pool.isFrozenNear(pos, 0.5),
      onHit: (dmg, from) => this.damage(dmg, from)
    };
    if (playing) for (const s of this.scrubbers) s.update(dt, sctx);
    this._smashCheck();

    for (const f of this.freezables) f.tick(dt, f);
    this.pool.update(dt);
    this.film.update(dt);
    this.fx.update(dt);

    // fell into the open water: out you climb, colder and a bit hurt
    if (p.x > POOL.x0 && p.x < POOL.x1 && p.z > POOL.z0 && p.z < POOL.z1 && p.y < POOL.water - 0.45 && !this._dying) {
      this.audio.splash();
      this.fx.mist(this._v.set(p.x, POOL.water, p.z), 0.3, 60);
      this.controls.teleport(this.controls.lastSafe.clone());
      this.damage(8, null, true);
    }

    this._placeShadow();
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.4;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.4;
    }

    this.hud.setVisible(true);
    this.hud.update(this.player);
    this.gaugeFill.style.width = `${(this.hose.gauge * 100).toFixed(0)}%`;
    this.gaugeEl.classList.toggle('low', this.hose.gauge < 0.25);
    g.reticle.classList.add('visible');
  }

  _applyFrost(dt) {
    const m = this.hose.muzzle;
    this.fx.stream(m, this.hose.dir, dt);
    // the water: frost where the spray meets the surface
    const hitPool = this._sprayHitsPlane(this._v.set(0, POOL.water, 0), this._w.set(0, 1, 0), new THREE.Vector3());
    if (hitPool && this.pool.covers(hitPool, 0.2)) {
      if (this.pool.applyFrost(hitPool, 1.5, dt * 3.2) > 0) this._crackle();
      this.fx.mist(hitPool, dt, 30);
    }
    const hitRamp = this._sprayHitsPlane(this.rampPlane.point, this.rampPlane.normal, new THREE.Vector3());
    if (hitRamp && this.film.covers(hitRamp, 0.3)) {
      if (this.film.applyFrost(hitRamp, 1.6, dt * 3.2) > 0) this._crackle();
      this.fx.mist(hitRamp, dt, 30);
    }
    if (m.distanceTo(this._aim) < this.hose.range) this.fx.mist(this._aim, dt, 14);

    // robots in the spray
    for (const s of this.scrubbers) {
      if (!s.alive || s.frozen) continue;
      if (this._inSpray(this._w.copy(s.position).setY(s.position.y + 0.35), 0.3) && s.addFrost(dt * 1.5)) {
        this._crackle();
        this.audio.crackle();
        // the water around a freezing scrubber freezes too
        if (this.pool.covers(s.position, 1)) this.pool.applyFrost(s.position, 1.7, 5);
      }
    }
    // everything else that reacts to cold
    for (const f of this.freezables) {
      if (f.frozen) continue;
      if (this._segmentInSpray(f.a, f.b, f.radius)) {
        f.frost = Math.min(1, f.frost + dt * 1.1);
        if (f.frost >= 1 && f.name !== 'crate') {
          f.frozen = true;
          f.onFreeze();
          this.audio.crackle();
        }
      }
    }
  }

  // Frozen scrubbers shatter when Voss slides into them fast or lands on them
  _smashCheck() {
    const c = this.controls, p = c.position;
    const speed = Math.hypot(c.velocity.x, c.velocity.z);
    for (const s of this.scrubbers) {
      if (!s.frozen) continue;
      const sp = s.position;
      const flat = Math.hypot(p.x - sp.x, p.z - sp.z);
      const above = p.y - sp.y;
      if (flat < 1.0 && c.velocity.y < -2 && above > 0.25 && above < 1.6) {
        this._shatter(s);
        c.bounce(7);
      } else if (flat < 1.25 && speed > 4.5 && Math.abs(above) < 1.0) {
        this._shatter(s);
      } else if (flat < 0.95 && Math.abs(above) < 0.9) {
        // too slow: it is a solid block of ice, so it pushes you off
        c.impulse.x += ((p.x - sp.x) / (flat || 1)) * 2;
        c.impulse.z += ((p.z - sp.z) / (flat || 1)) * 2;
      }
    }
  }

  _placeShadow() {
    const p = this.controls.position;
    let y = null;
    if (this.pool.covers(p, 3) && !this.pool.isFrozenAt(p) && p.y > POOL.water - 0.4) y = POOL.water + 0.02;
    else {
      const d = this.physics.castRay(this._v.set(p.x, p.y + 0.4, p.z), this._w.set(0, -1, 0), 12);
      if (d !== null) y = p.y + 0.4 - d + 0.03;
    }
    this.shadow.visible = y !== null && this.controls.view === 'third';
    if (y === null) return;
    const h = Math.max(0, p.y - y);
    this.shadow.position.set(p.x, y, p.z);
    this.shadow.scale.setScalar(Math.max(0.45, 1 - h * 0.15));
    this.shadow.material.opacity = Math.max(0.25, 1 - h * 0.2);
  }
}

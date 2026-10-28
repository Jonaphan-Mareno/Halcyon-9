import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { frame } from '../ui/hudFrame.js';
import { mergeStatic } from '../core/mergeStatic.js';

// The rifle (Level 3): an automatic rifle, built for the deep. Voss takes it from the rack in the
// EVA prep room, beside the suit. It rides slung across his backpack (seen in third person) until
// the kraken comes; then it is in his hands: big in the bottom right of the view, as in Death in
// the Water 2, his arms out of sight. Hold the left mouse to fire (about nine rounds a second, each
// with a kick, a muzzle flash and a bright tracer); a magazine holds thirty; R reloads (and it
// reloads itself when it runs dry); there are always more magazines. Each bullet leaves a hole
// where it hits rock or metal (and the kraken bleeds).
//
// Our own model, built from bevelled boxes and cylinders: a matte black upper and lower receiver,
// a long slotted handguard, the barrel and a slotted flash hider, a rail with a red-dot sight, a
// pistol grip, a curved tan magazine, a buffer tube and stock.

const RATE = 0.11;             // seconds between rounds
const MAG = 30;                // rounds in a magazine
const RELOAD = 1.9;            // seconds
const SPEED = 180;             // m/s (a tracer you can follow)
const RANGE = 60;              // metres before a round is spent
const HOLES = 60;              // bullet holes kept (the oldest goes)
const MUZZLE = new THREE.Vector3(0, 0.085, -0.93);   // the end of the flash hider, in the model

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35, ...extra });
  MATS = {
    black: std(0x15171a, { roughness: 0.62 }),
    dark: std(0x2a2d31, { roughness: 0.45, metalness: 0.6 }),
    steel: std(0x6f777d, { roughness: 0.32, metalness: 0.85 }),
    slot: std(0x050607, { roughness: 0.9, metalness: 0 }),
    tan: std(0x9c8661, { roughness: 0.7, metalness: 0.05 }),
    rubber: std(0x0c0d0e, { roughness: 0.95, metalness: 0 }),
    glass: std(0x10202a, { roughness: 0.1, metalness: 0.6 }),
    dot: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.25, 0.15) })
  };
  return MATS;
}

// The rifle, along -z (its muzzle) with its grip at the origin; returns the group
export function harpoonModel() {
  const m = mats();
  const g = new THREE.Group();
  const box = (w, h, d, mat, x, y, z, r = 0.006) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), mat);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  const cyl = (r, len, mat, x, y, z, seg = 14) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  // the receivers: the upper (the barrel's line) over the lower
  box(0.056, 0.058, 0.3, m.black, 0, 0.085, -0.15, 0.01);
  box(0.05, 0.05, 0.25, m.dark, 0, 0.035, -0.13, 0.008);
  box(0.004, 0.022, 0.07, m.slot, 0.029, 0.088, -0.13, 0.002);         // the ejection port (right)
  box(0.02, 0.016, 0.03, m.dark, 0, 0.114, 0.012, 0.004);              // the charging handle
  box(0.006, 0.012, 0.02, m.steel, -0.028, 0.045, -0.06, 0.002);       // the selector (left)
  box(0.005, 0.016, 0.022, m.dark, -0.027, 0.03, -0.2, 0.002);         // the magazine release
  // the handguard, slotted down its sides and underneath
  box(0.062, 0.062, 0.38, m.black, 0, 0.085, -0.49, 0.012);
  for (let k = 0; k < 6; k++) {
    const z = -0.35 - k * 0.055;
    for (const s of [-1, 1]) box(0.004, 0.012, 0.036, m.slot, s * 0.0315, 0.085, z, 0.002);
    box(0.03, 0.004, 0.036, m.slot, 0, 0.0535, z, 0.002);
  }
  // the barrel, its gas block and front sight, the flash hider with its slots
  cyl(0.011, 0.2, m.steel, 0, 0.085, -0.77);
  box(0.022, 0.03, 0.025, m.black, 0, 0.1, -0.69, 0.004);
  box(0.006, 0.04, 0.008, m.black, 0, 0.132, -0.69, 0.002);
  cyl(0.016, 0.06, m.dark, 0, 0.085, -0.9, 12);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    box(0.004, 0.004, 0.04, m.slot, Math.cos(a) * 0.016, 0.085 + Math.sin(a) * 0.016, -0.905, 0.001);
  }
  // the rail along the top, ribbed, and a red-dot sight on it
  box(0.03, 0.012, 0.66, m.dark, 0, 0.122, -0.33, 0.003);
  for (let k = 0; k < 18; k++) box(0.034, 0.006, 0.01, m.black, 0, 0.13, -0.04 - k * 0.034, 0.001);
  box(0.03, 0.02, 0.05, m.black, 0, 0.138, -0.1, 0.004);
  cyl(0.024, 0.11, m.black, 0, 0.17, -0.1, 18);
  for (const z of [-0.155, -0.045]) cyl(0.027, 0.012, m.dark, 0, 0.17, z, 18);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.019, 16), m.glass);
  lens.position.set(0, 0.17, -0.044);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0025, 8), m.dot);
  dot.position.set(0, 0.17, -0.043);
  g.add(lens, dot);
  // the pistol grip and trigger guard
  const grip = box(0.034, 0.115, 0.05, m.black, 0, -0.04, -0.005, 0.01);
  grip.rotation.x = 0.32;
  box(0.01, 0.008, 0.075, m.dark, 0, -0.005, -0.075, 0.002);
  box(0.006, 0.022, 0.006, m.steel, 0, 0.004, -0.06, 0.002);           // the trigger
  // the curved magazine
  const mag1 = box(0.03, 0.09, 0.07, m.tan, 0, -0.03, -0.17, 0.006);
  mag1.rotation.x = -0.12;
  const mag2 = box(0.03, 0.08, 0.068, m.tan, 0, -0.105, -0.152, 0.006);
  mag2.rotation.x = -0.32;
  box(0.032, 0.012, 0.072, m.dark, 0, -0.145, -0.135, 0.003).rotation.x = -0.32;
  // the buffer tube and the stock, its rubber butt pad
  cyl(0.017, 0.16, m.dark, 0, 0.07, 0.08, 14);
  box(0.044, 0.085, 0.15, m.black, 0, 0.045, 0.2, 0.012);
  box(0.048, 0.1, 0.022, m.rubber, 0, 0.04, 0.283, 0.008);
  // (its seventy-odd parts drawn as a few meshes, one a material: nothing on it moves by itself;
  // each part has one material, so the shapes' per-face groups can go)
  g.traverse((o) => { if (o.isMesh) o.geometry.clearGroups(); });
  mergeStatic(g);
  g.userData = {};
  return g;
}

// the flash at the muzzle: a soft star, drawn once
let FLASH_TEX = null;
function flashTexture() {
  if (FLASH_TEX) return FLASH_TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,240,1)');
  grad.addColorStop(0.25, 'rgba(255,210,120,0.9)');
  grad.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,230,160,0.8)';
  g.lineWidth = 3;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    g.beginPath();
    g.moveTo(32, 32);
    g.lineTo(32 + Math.cos(a) * 31, 32 + Math.sin(a) * 31);
    g.stroke();
  }
  FLASH_TEX = new THREE.CanvasTexture(c);
  FLASH_TEX.colorSpace = THREE.SRGBColorSpace;
  return FLASH_TEX;
}

// a bullet hole: a dark pit with a scorched, chipped ring round it
let HOLE_TEX = null;
function holeTexture() {
  if (HOLE_TEX) return HOLE_TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.28, 'rgba(8,8,8,1)');
  grad.addColorStop(0.42, 'rgba(70,64,58,0.9)');
  grad.addColorStop(0.6, 'rgba(25,22,20,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  HOLE_TEX = new THREE.CanvasTexture(c);
  HOLE_TEX.colorSpace = THREE.SRGBColorSpace;
  return HOLE_TEX;
}

export class Harpoon {
  constructor(session) {
    this.s = session;
    this.taken = false;
    this.drawn = false;
    this.cool = 0;
    this.ammo = MAG;
    this.reloading = 0;
    this.firing = false;
    this.bolts = [];                   // the rounds in flight
    this.holes = [];
    this.hitTest = null;               // (p0, p1) -> { point, stick, flesh, normal } or null: what a round meets this step
    const cam = session.game.camera.instance;
    this.cam = cam;
    // in his hands (first person): big in the bottom right, pointing where he looks
    this.fp = harpoonModel();
    this.fp.position.set(0.24, -0.23, -0.46);
    this.fp.rotation.set(0.03, 0.07, 0.02);
    this.fp.visible = false;
    // the muzzle flash: two crossed planes at the flash hider, lit for a moment each shot
    const flashMat = new THREE.MeshBasicMaterial({ map: flashTexture(), color: new THREE.Color(2.2, 1.7, 1.1),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.flash = new THREE.Group();
    for (const r of [0, Math.PI / 2]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
      p.rotation.y = Math.PI / 2;
      p.rotation.x = r;
      this.flash.add(p);
    }
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), flashMat);
    this.flash.add(front);
    this.flash.position.copy(MUZZLE).add(new THREE.Vector3(0, 0, -0.08));
    this.flash.visible = false;
    this.fp.add(this.flash);
    this.fp.traverse((o) => { if (o.isMesh) { o.renderOrder = 5; o.frustumCulled = false; } });
    // (the camera may not be in the scene: the gun rides on a holder that follows it each frame)
    this.holder = new THREE.Group();
    this.holder.add(this.fp);
    session.game.scene.add(this.holder);
    // tracers and holes share their shapes and materials
    this._tracerGeo = new THREE.CylinderGeometry(0.006, 0.006, 1.6, 5).rotateX(Math.PI / 2);
    this._tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.9, 0.9), transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending });
    this._holeGeo = new THREE.CircleGeometry(0.05, 12);
    this._holeMat = new THREE.MeshBasicMaterial({ map: holeTexture(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    // (a hidden tracer and hole ride along, so their shaders are compiled with the level's, not
    // at the first shot)
    for (const [geo, mat] of [[this._tracerGeo, this._tracerMat], [this._holeGeo, this._holeMat]]) {
      const ghost = new THREE.Mesh(geo, mat);
      ghost.visible = false;
      this.holder.add(ghost);
    }
    this._kick = 0;
    this._dip = 0;
    this._flashT = 0;
    this._hud();
    this._drawCount();
    this._onDown = (e) => {
      if (e.button !== 0 || !this.drawn || this.s.game.state !== 'PLAYING') return;
      if (!this.s.controls.instance.isLocked) return;
      this.firing = true;
    };
    this._onUp = (e) => { if (e.button === 0) this.firing = false; };
    this._onKey = (e) => {
      if (e.code === 'KeyR' && !e.repeat && this.drawn && this.s.game.state === 'PLAYING') this.startReload();
    };
    document.addEventListener('mousedown', this._onDown);
    document.addEventListener('mouseup', this._onUp);
    window.addEventListener('keydown', this._onKey);
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
  }

  // the HUD's ammo count, bottom right (while it is drawn)
  _hud() {
    const el = document.createElement('div');
    el.id = 'l3-ammo';
    el.innerHTML = '<div class="am-count"><span class="am-n">' + MAG + '</span><span class="am-of">/ &infin;</span></div><div class="am-label">RIFLE</div><div class="am-reload">RELOADING</div>';
    document.getElementById('ui-layer').appendChild(el);
    frame(el, { shape: 'panel' });
    this.hudEl = el;
  }

  // slung across the backpack once it is his (his third-person body), from the suit's parts
  sling(model, attach) {
    if (!model || this.slung) return;
    const g = harpoonModel();
    // (the model's own units: across his back from the right hip up over the left shoulder)
    g.scale.setScalar(0.62);
    g.position.set(0.02, 0.98, -0.27);
    g.rotation.set(0, 0, 0.95);
    g.rotateX(Math.PI / 2);
    g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    attach(model, /Spine4/, g);
    this.slung = g;
  }

  draw(on) {
    if (on === this.drawn) return;
    this.drawn = on;
    this.firing = false;
    if (this.slung) this.slung.visible = !on;
    this.hudEl.classList.toggle('on', on);
    // (his first-person arms are put away while it is in his hands, as in the game it is modelled on)
    const vm = this.s.controls.character?.viewModel;
    if (vm && !on) vm.visible = this.s.controls.view === 'first';
  }

  startReload() {
    if (this.reloading > 0 || this.ammo === MAG) return;
    this.reloading = RELOAD;
    this.firing = false;
    this.hudEl.classList.add('reloading');
    this.s.sfx?.cue('rifleOut');
    this._inSound = RELOAD * 0.55;    // (the fresh magazine goes in part way through)
  }

  fire() {
    const cam = this.cam;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const muzzle = this.fp.visible ? this.fp.localToWorld(MUZZLE.clone()) : cam.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 0.8);
    // (it fires where he looks: from the muzzle toward what is under the crosshair, 30 m out, with
    // a little spread)
    const aim = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 30);
    aim.x += (Math.random() - 0.5) * 0.35;
    aim.y += (Math.random() - 0.5) * 0.35;
    aim.z += (Math.random() - 0.5) * 0.35;
    const fly = aim.sub(muzzle).normalize();
    const tracer = new THREE.Mesh(this._tracerGeo, this._tracerMat);
    tracer.frustumCulled = false;
    tracer.position.copy(muzzle).addScaledVector(fly, 0.8);
    tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), fly);
    this.s.game.scene.add(tracer);
    this.bolts.push({ mesh: tracer, dir: fly, travelled: 0 });
    this.ammo--;
    this.cool = RATE;
    this._kick = 1;
    this._flashT = 0.05;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.5);
    this._drawCount();
    this.s.sfx?.cue('rifleShot' + (1 + Math.floor(Math.random() * 3)));
    // a few bubbles from the muzzle
    const swim = this.s.swim;
    if (swim?._spawn) {
      for (let k = 0; k < 3; k++) {
        swim._spawn(muzzle.x, muzzle.y, muzzle.z,
          fly.x * 1.2 + (Math.random() - 0.5) * 0.8, fly.y * 1.2 + 0.4 + Math.random() * 0.5, fly.z * 1.2 + (Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 0.6);
      }
    }
    if (this.ammo <= 0) this._autoReload = 0.25;
  }

  _drawCount() {
    const n = this.hudEl?.querySelector('.am-n');
    if (n) {
      n.textContent = this.ammo;
      this.hudEl.classList.toggle('low', this.ammo <= 5);
    }
  }

  update(dt) {
    const first = this.s.controls.view === 'first';
    this.fp.visible = this.drawn && first;
    const vm = this.s.controls.character?.viewModel;
    if (vm && this.drawn && first) vm.visible = false;
    if (this.fp.visible) {
      this.holder.position.copy(this.cam.position);
      this.holder.quaternion.copy(this.cam.quaternion);
      this.holder.updateMatrixWorld(true);
    }
    // firing, reloading (on the game's clock, so a pause holds it)
    this.cool = Math.max(0, this.cool - dt);
    if (this._autoReload > 0 && (this._autoReload -= dt) <= 0) this.startReload();
    if (this._inSound > 0 && (this._inSound -= dt) <= 0 && this.reloading > 0) this.s.sfx?.cue('rifleIn');
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        this.ammo = MAG;
        this.hudEl.classList.remove('reloading');
        this._drawCount();
      }
    } else if (this.drawn && this.firing && this.cool <= 0) {
      if (this.ammo > 0) this.fire();
      else if (!this._emptyT) {
        this._emptyT = 0.5;
        this.s.sfx?.cue('rifleEmpty');
      }
    }
    this._emptyT = Math.max(0, (this._emptyT || 0) - dt);
    this._flashT = Math.max(0, this._flashT - dt);
    this.flash.visible = this._flashT > 0;
    // the kick of each shot (back and up, a little to one side), and the gun dipping away to be
    // reloaded
    this._kick = Math.max(0, this._kick - dt * 14);
    this._dip += ((this.reloading > 0 ? 1 : 0) - this._dip) * (1 - Math.exp(-8 * dt));
    const sway = Math.sin(performance.now() * 0.0012) * 0.006;
    const jitter = this._kick * (Math.random() - 0.5) * 0.006;
    this.fp.position.set(0.24 + this._dip * 0.05 + jitter, -0.23 - this._dip * 0.14 + sway, -0.46 + this._kick * 0.05);
    this.fp.rotation.set(0.03 + this._kick * 0.07 - this._dip * 0.5, 0.07 + this._dip * 0.3, 0.02 + this._dip * 0.4 + jitter * 4);
    this._rounds(dt);
  }

  // the rounds in flight: a hit leaves a hole in rock or metal (the kraken bleeds instead: Trench)
  _rounds(dt) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      const step = Math.min(SPEED * dt, RANGE - b.travelled);
      const p0 = this._v.copy(b.mesh.position);
      const p1 = this._w.copy(p0).addScaledVector(b.dir, step);
      const hit = this.hitTest?.(p0, p1, b);
      if (hit || b.travelled + step >= RANGE) {
        if (hit && !hit.flesh) this._hole(hit.point, hit.normal || b.dir.clone().negate());
        b.mesh.removeFromParent();
        this.bolts.splice(i, 1);
        continue;
      }
      b.mesh.position.copy(p1);
      b.travelled += step;
    }
  }

  _hole(point, normal) {
    const hole = new THREE.Mesh(this._holeGeo, this._holeMat);
    hole.position.copy(point).addScaledVector(normal, 0.006);
    hole.lookAt(this._v.copy(hole.position).add(normal));
    hole.rotateZ(Math.random() * Math.PI * 2);
    hole.scale.setScalar(0.8 + Math.random() * 0.5);
    this.s.game.scene.add(hole);
    this.holes.push(hole);
    if (this.holes.length > HOLES) this.holes.shift().removeFromParent();
    // a puff of grit and bubbles off the rock
    const swim = this.s.swim;
    if (swim?._spawn) {
      for (let k = 0; k < 4; k++) {
        swim._spawn(point.x, point.y, point.z, normal.x * 0.8 + (Math.random() - 0.5) * 0.6, normal.y * 0.8 + 0.3,
          normal.z * 0.8 + (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.4);
      }
    }
  }

  dispose() {
    document.removeEventListener('mousedown', this._onDown);
    document.removeEventListener('mouseup', this._onUp);
    window.removeEventListener('keydown', this._onKey);
    this.holder.removeFromParent();
    this.slung?.removeFromParent();
    this.hudEl?.remove();
    for (const b of this.bolts) b.mesh.removeFromParent();
    for (const h of this.holes) h.removeFromParent();
    this._tracerGeo.dispose();
    this._tracerMat.dispose();
    this._holeGeo.dispose();
    this._holeMat.dispose();
  }
}

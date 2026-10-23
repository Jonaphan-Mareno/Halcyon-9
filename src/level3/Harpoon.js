import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// The spear rifle (Level 3): an automatic underwater gun that fires steel bolts on a gas charge.
// Voss takes it from the rack in the EVA prep room, beside the suit. It rides slung across his
// backpack (seen in third person) until the kraken comes; then it is in his hands: big in the
// bottom right of the view, as in Death in the Water 2, his arms out of sight. Hold the left mouse
// to fire (about four bolts a second, each with a kick and a burst of bubbles from the muzzle);
// a magazine holds eight; R reloads (and it reloads itself when it runs dry); there are always
// more magazines. The bolts streak away trailing bubbles and stick in what they hit.
//
// Our own model, built from bevelled boxes and cylinders: a matte black receiver and stock, a long
// vented barrel shroud with a muzzle brake, a rail and a small sight on top, red gas canisters
// down its left side, a box magazine, yellow chevrons that light up for the bolts left, and a
// little screen showing the count.

const RATE = 0.26;             // seconds between bolts
const MAG = 8;                 // bolts in a magazine
const RELOAD = 1.7;            // seconds
const SPEED = 60;              // m/s
const RANGE = 34;              // metres before a bolt falls away

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35, ...extra });
  MATS = {
    black: std(0x17191c, { roughness: 0.6 }),
    dark: std(0x2a2d31, { roughness: 0.45, metalness: 0.6 }),
    steel: std(0x9aa3a8, { roughness: 0.3, metalness: 0.85 }),
    red: std(0xc0261c, { roughness: 0.35, metalness: 0.4 }),
    cap: std(0xd8d2c4, { roughness: 0.35, metalness: 0.6 }),
    yellow: std(0xe8b81c, { roughness: 0.5, metalness: 0.1 }),
    lit: std(0xffa31a, { emissive: 0xff8a10, emissiveIntensity: 1.6, roughness: 0.4, metalness: 0 }),
    unlit: std(0x3a2a12, { roughness: 0.5, metalness: 0 }),
    lens: std(0xff5a2a, { emissive: 0xff3a10, emissiveIntensity: 1.2, roughness: 0.2, metalness: 0 })
  };
  return MATS;
}

// The rifle, along -z (its muzzle) with its grip at the origin; returns the group, with its parts
// that change (the chevrons, the screen) in userData
export function harpoonModel() {
  const m = mats();
  const g = new THREE.Group();
  const box = (w, h, d, mat, x, y, z, r = 0.01) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), mat);
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
  box(0.085, 0.115, 0.44, m.black, 0, 0.06, -0.2, 0.018);           // the receiver
  box(0.07, 0.075, 0.5, m.dark, 0, 0.075, -0.66, 0.012);            // the barrel shroud
  for (let k = 0; k < 6; k++) box(0.072, 0.02, 0.045, m.black, 0, 0.1, -0.48 - k * 0.07, 0.004);   // its vents
  cyl(0.017, 0.16, m.steel, 0, 0.075, -0.98);                        // the barrel
  cyl(0.03, 0.09, m.dark, 0, 0.075, -1.06, 10);                      // the muzzle brake
  for (const s of [-1, 1]) box(0.012, 0.03, 0.05, m.black, s * 0.03, 0.075, -1.06, 0.003);
  box(0.03, 0.016, 0.62, m.dark, 0, 0.128, -0.42, 0.004);           // the top rail
  for (let k = 0; k < 12; k++) box(0.034, 0.008, 0.012, m.black, 0, 0.14, -0.14 - k * 0.05, 0.002);
  box(0.05, 0.05, 0.11, m.black, 0, 0.165, -0.14, 0.012);            // the sight
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.014, 12), m.lens);
  lens.position.set(0, 0.17, -0.08);
  g.add(lens);
  // red gas canisters down its left side (the side he sees), white caps
  for (let k = 0; k < 3; k++) {
    const z = -0.12 - k * 0.075;
    cyl(0.021, 0.07, m.red, -0.06, 0.05, z);
    cyl(0.022, 0.012, m.cap, -0.06, 0.05, z - 0.04);
  }
  box(0.06, 0.15, 0.08, m.dark, 0, -0.05, -0.3, 0.01);               // the magazine
  box(0.062, 0.02, 0.082, m.yellow, 0, -0.1, -0.3, 0.005);
  const grip = box(0.05, 0.13, 0.06, m.black, 0, -0.04, -0.02, 0.012);   // the grip
  grip.rotation.x = 0.28;
  box(0.012, 0.012, 0.09, m.dark, 0, -0.01, -0.09, 0.003);           // the trigger guard
  box(0.07, 0.1, 0.22, m.black, 0, 0.05, 0.12, 0.02);                // the stock
  box(0.07, 0.03, 0.12, m.dark, 0, 0.11, 0.1, 0.01);
  box(0.004, 0.012, 0.16, m.yellow, -0.044, 0.105, -0.2, 0.002);     // a yellow line down the receiver
  // chevrons for the bolts left (lit), and a little screen with the count
  const chevrons = [];
  for (let k = 0; k < 4; k++) {
    const c = box(0.004, 0.022, 0.016, m.lit, -0.037, 0.075, -0.56 - k * 0.04, 0.002);
    c.rotation.x = 0.6;
    chevrons.push(c);
  }
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 32;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.025), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.set(-0.0436, 0.06, -0.02);
  screen.rotation.y = -Math.PI / 2;
  g.add(screen);
  g.userData = { chevrons, screen: { cv, tex } };
  return g;
}

// a bolt: a steel shaft with a barbed tip and fins
function boltModel() {
  const m = mats();
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.55, 6), m.steel);
  shaft.rotation.x = Math.PI / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 8), m.steel);
  tip.rotation.x = -Math.PI / 2;
  tip.position.z = -0.3;
  const fins = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.004, 0.05), m.red);
  fins.position.z = 0.25;
  g.add(shaft, tip, fins);
  g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return g;
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
    this.bolts = [];
    this.hitTest = null;               // (p0, p1) -> { point, stick } or null: what a bolt meets this step
    const cam = session.game.camera.instance;
    this.cam = cam;
    // in his hands (first person): big in the bottom right, pointing where he looks
    this.fp = harpoonModel();
    this.fp.position.set(0.24, -0.23, -0.46);
    this.fp.rotation.set(0.03, 0.07, 0.02);
    this.fp.visible = false;
    this.fp.traverse((o) => { if (o.isMesh) { o.renderOrder = 5; o.frustumCulled = false; } });
    // (the camera may not be in the scene: the gun rides on a holder that follows it each frame)
    this.holder = new THREE.Group();
    this.holder.add(this.fp);
    session.game.scene.add(this.holder);
    this._kick = 0;
    this._dip = 0;
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
    el.innerHTML = '<div class="am-count"><span class="am-n">8</span><span class="am-of">/ &infin;</span></div><div class="am-label">SPEAR RIFLE</div><div class="am-reload">RELOADING</div>';
    document.getElementById('ui-layer').appendChild(el);
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
    const muzzle = this.fp.visible ? this.fp.localToWorld(new THREE.Vector3(0, 0.075, -1.1)) : cam.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 0.8);
    // (it fires where he looks: from the muzzle toward what is under the crosshair, 30 m out)
    const aim = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 30);
    const fly = aim.sub(muzzle).normalize();
    const bolt = boltModel();
    bolt.position.copy(muzzle);
    bolt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), fly);
    this.s.game.scene.add(bolt);
    this.bolts.push({ mesh: bolt, dir: fly, travelled: 0, stuck: null, life: 0, trail: 0 });
    this.ammo--;
    this.cool = RATE;
    this._kick = 1;
    this._drawCount();
    this.s.sfx?.cue('rifleShot');
    // a burst of bubbles from the muzzle
    const swim = this.s.swim;
    if (swim?._spawn) {
      for (let k = 0; k < 7; k++) {
        swim._spawn(muzzle.x, muzzle.y, muzzle.z,
          fly.x * 1.5 + (Math.random() - 0.5) * 1.2, fly.y * 1.5 + 0.4 + Math.random() * 0.6, fly.z * 1.5 + (Math.random() - 0.5) * 1.2, 0.8 + Math.random());
      }
    }
    if (this.ammo <= 0) this._autoReload = 0.25;
  }

  _drawCount() {
    const ud = this.fp.userData;
    const left = this.ammo / MAG;
    ud.chevrons.forEach((c, k) => { c.material = left > k / ud.chevrons.length ? mats().lit : mats().unlit; });
    const { cv, tex } = ud.screen, g = cv.getContext('2d');
    g.fillStyle = '#120a02';
    g.fillRect(0, 0, 64, 32);
    g.fillStyle = this.ammo <= 2 ? '#ff4a2a' : '#ffb03a';
    g.font = 'bold 24px Courier New, monospace';
    g.textAlign = 'center';
    g.fillText(String(this.ammo).padStart(2, '0'), 32, 24);
    tex.needsUpdate = true;
    const n = this.hudEl?.querySelector('.am-n');
    if (n) {
      n.textContent = this.ammo;
      this.hudEl.classList.toggle('low', this.ammo <= 2);
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
    // the kick of each shot, and the gun dipping away to be reloaded
    this._kick = Math.max(0, this._kick - dt * 9);
    this._dip += ((this.reloading > 0 ? 1 : 0) - this._dip) * (1 - Math.exp(-8 * dt));
    const sway = Math.sin(performance.now() * 0.0012) * 0.006;
    this.fp.position.set(0.24 + this._dip * 0.05, -0.23 - this._dip * 0.14 + sway, -0.46 + this._kick * 0.07);
    this.fp.rotation.set(0.03 + this._kick * 0.1 - this._dip * 0.5, 0.07 + this._dip * 0.3, 0.02 + this._dip * 0.4);
    this._bolts(dt);
  }

  _bolts(dt) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life += dt;
      if (!b.stuck) {
        const step = Math.min(SPEED * dt, RANGE - b.travelled);
        const p0 = this._v.copy(b.mesh.position);
        const p1 = this._w.copy(p0).addScaledVector(b.dir, step);
        const hit = this.hitTest?.(p0, p1, b);
        if (hit) {
          b.mesh.position.copy(hit.point);
          b.stuck = hit.stick || this.s.game.scene;
          b.stuck.attach(b.mesh);
          b.life = 0;
        } else {
          b.mesh.position.copy(p1);
          b.travelled += step;
          if (b.travelled >= RANGE) b.stuck = 'spent';
          // (a thin trail of bubbles behind it)
          b.trail += dt;
          if (b.trail > 0.03 && this.s.swim?._spawn) {
            b.trail = 0;
            this.s.swim._spawn(p1.x, p1.y, p1.z, (Math.random() - 0.5) * 0.3, 0.3, (Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.5);
          }
        }
      }
      if (b.stuck === 'spent') b.mesh.position.y -= dt * 2;
      // stuck or spent, it stays a while and goes
      if (b.stuck && b.life > 3) {
        b.mesh.removeFromParent();
        this.bolts.splice(i, 1);
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
  }
}

import * as THREE from 'three';
import { SUIT } from './DiveSuit.js';

// The harpoon gun (Level 3). Voss takes it from the rack in the EVA prep room, beside the suit.
// He cannot hold it and swim with the cable at once, and he does not have to: the cable is clipped
// to the suit's belt, and the gun rides slung across the backpack (seen in third person) until the
// kraken comes. Then he draws it: it is in his hands in first person, the left mouse fires a barbed
// spear on a thin line, and it takes a moment to reload. Our own model, built from primitives: a
// pneumatic speargun, a steel barrel over an orange-and-navy body, a pistol grip, a reel under the
// barrel and the spear riding on top.

const SPEED = 42;              // m/s
const RANGE = 32;              // metres before the line runs out (the spear falls away)
const RELOAD = 1.1;            // seconds
const LINE_SAG = 0.04;         // how far the line droops behind the spear (metres per metre)

// The gun, built along -z (its muzzle) with its grip at the origin
export function harpoonModel() {
  const g = new THREE.Group();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1, ...extra });
  const shell = std(SUIT.shell, { roughness: 0.4 }), navy = std(SUIT.lower, { roughness: 0.6 });
  const steel = std(SUIT.steel, { roughness: 0.3, metalness: 0.85 }), dark = std(SUIT.trim, { roughness: 0.55, metalness: 0.3 });
  const add = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
    return m;
  };
  const along = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.028, 0.028, 0.62, 12), shell, 0, 0.045, -0.2, along);        // the body
  add(new THREE.CylinderGeometry(0.032, 0.032, 0.12, 12), navy, 0, 0.045, 0.1, along);          // its back cap
  add(new THREE.CylinderGeometry(0.014, 0.014, 0.5, 8), steel, 0, 0.045, -0.75, along);         // the barrel
  add(new THREE.CylinderGeometry(0.022, 0.018, 0.05, 10), dark, 0, 0.045, -1.0, along);         // the muzzle
  add(new THREE.BoxGeometry(0.04, 0.13, 0.05), dark, 0, -0.04, 0.0).rotation.x = 0.25;          // the grip
  add(new THREE.BoxGeometry(0.012, 0.03, 0.09), steel, 0, -0.005, -0.06);                       // the trigger guard
  const reel = add(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 14), navy, 0, -0.01, -0.3);   // the line's reel
  reel.rotation.z = Math.PI / 2;
  const spear = new THREE.Group();                                                               // the spear on top
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.05, 6), steel);
  shaft.rotation.x = along;
  shaft.position.z = -0.45;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.07, 8), steel);
  tip.rotation.x = -along;
  tip.position.z = -1.0;
  spear.add(shaft, tip);
  for (const s of [-1, 1]) {
    const barb = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.04), steel);
    barb.position.set(s * 0.012, 0, -0.95);
    barb.rotation.y = s * 0.5;
    spear.add(barb);
  }
  spear.position.y = 0.09;
  g.add(spear);
  g.userData.spear = spear;
  return g;
}

export class Harpoon {
  // session: the DeckSession; onShot(from, dir, hitTest): Trench decides what the spear meets
  constructor(session) {
    this.s = session;
    this.taken = false;
    this.drawn = false;
    this.reload = 0;
    this.spears = [];
    this.hitTest = null;               // (p0, p1) -> { point, stick } or null: what a spear meets this step
    const cam = session.game.camera.instance;
    // in his hands (first person): low on the right, pointing where he looks
    this.fp = harpoonModel();
    this.fp.position.set(0.2, -0.23, -0.38);
    this.fp.rotation.set(0.04, 0.05, 0);
    this.fp.scale.setScalar(0.72);
    this.fp.visible = false;
    this.fp.traverse((o) => { if (o.isMesh) { o.renderOrder = 5; o.frustumCulled = false; } });
    // (the camera is not in the scene, so the gun rides on a holder that follows it each frame)
    this.holder = new THREE.Group();
    this.holder.add(this.fp);
    session.game.scene.add(this.holder);
    this.cam = cam;
    this._kick = 0;
    this._onDown = (e) => {
      if (e.button !== 0 || !this.drawn || this.s.game.state !== 'PLAYING') return;
      if (!this.s.controls.instance.isLocked) return;
      this.fire();
    };
    document.addEventListener('mousedown', this._onDown);
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
  }

  // slung across the backpack once it is his (his third-person body), from the suit's parts
  sling(model, attach) {
    if (!model || this.slung) return;
    const g = harpoonModel();
    // (the model's own units: across his back from the right hip up over the left shoulder)
    g.scale.setScalar(0.78);
    g.position.set(0.02, 0.98, -0.255);
    g.rotation.set(0, 0, 0.95);
    g.rotateX(Math.PI / 2);
    g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    attach(model, /Spine4/, g);
    this.slung = g;
  }

  draw(on) {
    if (on === this.drawn) return;
    this.drawn = on;
    this.fp.visible = on && this.s.controls.view === 'first';
    if (this.slung) this.slung.visible = !on;
  }

  fire() {
    if (this.reload > 0) return;
    const cam = this.s.game.camera.instance;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const from = this.fp.visible ? this.fp.localToWorld(new THREE.Vector3(0, 0.09, -1.0)) : cam.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 0.6);
    const spear = harpoonModel().userData.spear;
    spear.position.copy(from);
    spear.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    spear.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    this.s.game.scene.add(spear);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, from]), new THREE.LineBasicMaterial({ color: 0xd8d0c0, transparent: true, opacity: 0.7 }));
    line.frustumCulled = false;
    this.s.game.scene.add(line);
    this.spears.push({ mesh: spear, line, from: from.clone(), dir, travelled: 0, stuck: null, life: 0 });
    this.reload = RELOAD;
    this._kick = 1;
    if (this.fp.userData.spear) this.fp.userData.spear.visible = false;
  }

  update(dt) {
    this.fp.visible = this.drawn && this.s.controls.view === 'first';
    if (this.fp.visible) {
      this.holder.position.copy(this.cam.position);
      this.holder.quaternion.copy(this.cam.quaternion);
      this.holder.updateMatrixWorld(true);
    }
    if (this.reload > 0) {
      this.reload = Math.max(0, this.reload - dt);
      if (this.reload === 0 && this.fp.userData.spear) this.fp.userData.spear.visible = true;
    }
    // the kick back as it fires, easing out
    this._kick = Math.max(0, this._kick - dt * 5);
    this.fp.position.z = -0.38 + this._kick * 0.08;
    this.fp.rotation.x = 0.04 + this._kick * 0.12;
    for (let i = this.spears.length - 1; i >= 0; i--) {
      const sp = this.spears[i];
      sp.life += dt;
      if (!sp.stuck) {
        const step = Math.min(SPEED * dt, RANGE - sp.travelled);
        const p0 = this._v.copy(sp.mesh.position);
        const p1 = this._w.copy(p0).addScaledVector(sp.dir, step);
        const hit = this.hitTest?.(p0, p1, sp);
        if (hit) {
          sp.mesh.position.copy(hit.point);
          sp.stuck = hit.stick || this.s.game.scene;
          sp.stuck.attach(sp.mesh);
        } else {
          sp.mesh.position.copy(p1);
          sp.travelled += step;
          if (sp.travelled >= RANGE) sp.stuck = 'spent';
        }
      }
      // the line from where it was fired to the spear, drooping a little
      const a = sp.from, b = sp.mesh.getWorldPosition(this._v);
      const pos = sp.line.geometry.attributes.position;
      pos.setXYZ(0, a.x, a.y, a.z);
      pos.setXYZ(1, b.x, b.y - a.distanceTo(b) * LINE_SAG, b.z);
      pos.needsUpdate = true;
      // stuck or spent, it hangs a while and goes
      const fade = sp.stuck ? Math.max(0, 1 - (sp.life - 2.5) / 1.5) : 1;
      sp.line.material.opacity = 0.7 * Math.min(1, fade);
      if (sp.stuck === 'spent') sp.mesh.position.y -= dt * 2;
      if (fade <= 0) {
        sp.mesh.removeFromParent();
        sp.line.removeFromParent();
        sp.line.geometry.dispose();
        sp.line.material.dispose();
        this.spears.splice(i, 1);
      }
    }
  }

  dispose() {
    document.removeEventListener('mousedown', this._onDown);
    this.holder.removeFromParent();
    this.slung?.removeFromParent();
    for (const sp of this.spears) {
      sp.mesh.removeFromParent();
      sp.line.removeFromParent();
    }
  }
}

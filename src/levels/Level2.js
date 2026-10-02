import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Level 2: the cargo atrium. A huge circular hall with a glowing core, three tiers
// of catwalks, three sealed bedroom doors and the arrival elevator. The model is
// built by Blender/scripts/build_level2_hub.py and uses these name prefixes:
//   COL_*   invisible collision proxy        MOVE_*  platforms the game moves
//   ROT_*   ring pieces the game rotates     DOOR_*  sealed bedroom doors
//   GLASS_* the big window                   SPAWN_* where the player arrives
// Lighting and materials here are placeholders until the custom shaders land.

const SOLID_PREFIXES = ['COL_', 'MOVE_', 'ROT_', 'DOOR_', 'LIFT_'];
const HIDDEN_PREFIXES = ['COL_', 'REF_'];
const startsWithAny = (name, list) => list.some((p) => name.startsWith(p));

export class Level2 {
  constructor(scene) {
    this.scene = scene;
    this.name = 'Cargo Atrium';
    this.root = new THREE.Group();
    scene.add(this.root);

    this.spawn = new THREE.Vector3(0, 0.1, 0);
    this.spawnYaw = 0;
    this.doors = [];
    this.doorOpen = 0;        // 0 closed .. 1 open
    this.doorOpening = false;
    this.ready = false;
  }

  async load(physics) {
    const gltf = await new GLTFLoader().loadAsync('./assets/models/level2-hub.glb');
    const hub = gltf.scene;
    hub.updateMatrixWorld(true);

    // Everything the player can stand on or bump into becomes a physics collider
    for (const node of [...hub.children]) {
      if (startsWithAny(node.name, SOLID_PREFIXES)) physics.addStaticObject(node);
      if (startsWithAny(node.name, HIDDEN_PREFIXES)) hub.remove(node);
    }

    this._tameMaterials(hub);
    this._setUpElevator(hub);
    this.root.add(hub);
    this.hub = hub;

    this._addLights();
    this._addStars();
    this.scene.background = new THREE.Color(0x04060a);
    this.scene.fog = new THREE.FogExp2(0x070a10, 0.007);

    this.ready = true;
  }

  // The Blender materials are PBR; with no environment map metal renders black, so
  // keep them mostly diffuse for now. The window glass stays see-through.
  _tameMaterials(hub) {
    hub.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.metalness !== undefined) m.metalness = Math.min(m.metalness, 0.15);
        if (m.color && !(m.emissiveIntensity > 0 && m.emissive && m.emissive.getHex() !== 0)) m.color.multiplyScalar(0.55);
        if (m.opacity < 1) {
          m.transparent = true;
          m.depthWrite = false;
        }
      }
    });
  }

  // Spawn inside the elevator cab, facing the core; the two doors slide apart once the
  // player can move
  _setUpElevator(hub) {
    const spawnNode = hub.getObjectByName('SPAWN_Arrival');
    const p = new THREE.Vector3();
    if (spawnNode) spawnNode.getWorldPosition(p);
    const radial = new THREE.Vector3(p.x, 0, p.z).normalize();
    this.spawn.set(radial.x * 36.2, p.y + 0.1, radial.z * 36.2);
    this.spawnYaw = Math.atan2(radial.x, radial.z); // look toward the centre of the hall

    const left = hub.getObjectByName('ELEVATOR_Door_L');
    const right = hub.getObjectByName('ELEVATOR_Door_R');
    if (left && right) {
      const mid = left.position.clone().add(right.position).multiplyScalar(0.5);
      for (const door of [left, right]) {
        const away = door.position.clone().sub(mid);
        away.y = 0;
        away.normalize().multiplyScalar(1.3);
        this.doors.push({ node: door, closed: door.position.clone(), open: door.position.clone().add(away) });
      }
    }
  }

  // Placeholder lighting: a cool fill plus lamps around the core and the tiers
  _addLights() {
    this.root.add(new THREE.HemisphereLight(0x7f95b8, 0x0c0e14, 0.45));
    const lamps = [
      [0, 27, 0, 0x9fc8ff, 1500],
      [0, 10, 0, 0x8fb8ff, 800],
      [22, 9, 0, 0xbcd4ff, 550], [-22, 9, 0, 0xbcd4ff, 550],
      [0, 9, 22, 0xbcd4ff, 550], [0, 9, -22, 0xbcd4ff, 550],
      [18, 4, 18, 0xffb070, 420], [-18, 4, -18, 0xffb070, 420],
      [18, 4, -18, 0xffb070, 420], [-18, 4, 18, 0xffb070, 420],
      [0, 16, 24, 0xbcd4ff, 550], [0, 16, -24, 0xbcd4ff, 550]
    ];
    for (const [x, y, z, color, intensity] of lamps) {
      const light = new THREE.PointLight(color, intensity, 0, 2);
      light.position.set(x, y, z);
      this.root.add(light);
    }
  }

  // Something for the big window to look out on
  _addStars() {
    const count = 1800;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      v.normalize().multiplyScalar(700);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xcfe0ff, size: 1.6, sizeAttenuation: false, fog: false
    }));
    this.root.add(this.stars);
  }

  openElevator() {
    this.doorOpening = true;
  }

  update(delta) {
    if (this.doorOpening && this.doorOpen < 1) {
      this.doorOpen = Math.min(1, this.doorOpen + delta / 1.8);
      const t = this.doorOpen * this.doorOpen * (3 - 2 * this.doorOpen); // ease in and out
      for (const d of this.doors) d.node.position.lerpVectors(d.closed, d.open, t);
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) m.dispose();
    });
    this.scene.remove(this.root);
  }
}

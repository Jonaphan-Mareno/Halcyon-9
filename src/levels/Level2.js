import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createHubTextures, applyHubMaterials, hubTime } from '../graphics/HubMaterials.js';

// Level 2 ("Logs"): the cargo atrium of the deep-sea station. A huge circular hall
// with a glowing core, three tiers of catwalks, three sealed crew quarters and the
// arrival elevator. The model is built by Blender/scripts/build_level2_hub.py and uses
// these name prefixes:
//   COL_*   invisible collision proxy        MOVE_*  platforms the game moves
//   ROT_*   ring pieces the game rotates     DOOR_*  sealed bedroom doors
//   GLASS_* the big window (it looks out on the dark ocean)
//   SPAWN_* / TAPE_* empties: where things go
// Lighting and materials are placeholders until the custom shaders land.

const SOLID_PREFIXES = ['COL_', 'MOVE_', 'ROT_', 'DOOR_', 'LIFT_'];
const HIDDEN_PREFIXES = ['COL_', 'REF_'];
const startsWithAny = (name, list) => list.some((p) => name.startsWith(p));

// The model's plan view: radius and angle in degrees (0 = east, counter-clockwise, as in
// Blender), height up. Handy for placing things in a round room.
export const polar = (r, aDeg, y = 0) => {
  const a = (aDeg * Math.PI) / 180;
  return new THREE.Vector3(r * Math.cos(a), y, -r * Math.sin(a));
};

// The reverse: the angle (degrees, 0..360) of a point as seen from the hub's centre
export const angleOf = (p) => ((Math.atan2(-p.z, p.x) * 180) / Math.PI + 360) % 360;

export class Level2 {
  constructor(scene) {
    this.scene = scene;
    this.name = 'Cargo Atrium';
    this.root = new THREE.Group();
    scene.add(this.root);

    this.spawn = new THREE.Vector3(0, 0.1, 0);
    this.spawnYaw = 0;
    this.elevatorDoors = [];
    this.elevatorOpen = 0;       // 0 closed .. 1 open
    this.elevatorOpening = false;
    this.quarters = {};          // 'A' | 'B' | 'C' -> { node, collider, closedY, open }
    this.tapes = {};             // 'A' | 'B' | 'C' -> world position of the tape player
    this.ready = false;
  }

  async load(physics, renderer) {
    this.physics = physics;
    const gltf = await new GLTFLoader().loadAsync('./assets/models/level2-hub.glb');
    const hub = gltf.scene;
    hub.updateMatrixWorld(true);

    // Everything the player can stand on or bump into becomes a physics collider
    for (const node of [...hub.children]) {
      if (startsWithAny(node.name, SOLID_PREFIXES)) {
        const collider = physics.addStaticObject(node);
        const door = /^DOOR_([ABC])$/.exec(node.name);
        if (door) this.quarters[door[1]] = { node, collider, closedY: node.position.y, open: 0, opening: false };
      }
      if (startsWithAny(node.name, HIDDEN_PREFIXES)) hub.remove(node);
    }

    this._tameMaterials(hub);
    this.textures = createHubTextures();
    applyHubMaterials(hub, this.textures);
    this.halos = [
      { node: hub.getObjectByName('FX_CoreHalo20'), speed: 0.35 },
      { node: hub.getObjectByName('FX_CoreHalo25'), speed: -0.22 }
    ].filter((h) => h.node);
    this._setUpElevator(hub);
    for (const letter of ['A', 'B', 'C']) {
      const node = hub.getObjectByName(`TAPE_${letter}`);
      if (node) this.tapes[letter] = node.getWorldPosition(new THREE.Vector3());
    }
    this.root.add(hub);
    this.hub = hub;

    this._addEnvironment(renderer);
    this._addLights();
    this._addDeepSea();
    this.scene.background = new THREE.Color(0x02080c);
    this.scene.fog = new THREE.FogExp2(0x03090e, 0.011);

    this.ready = true;
  }

  // Metal needs something to reflect or it renders black. A dim neutral room environment
  // gives the dark steel its sheen without lighting the hall up.
  _addEnvironment(renderer) {
    if (!renderer) return;
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.14;
    pmrem.dispose();
  }

  // The window glass stays see-through; the rest is the model's own dark metal
  _tameMaterials(hub) {
    hub.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
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
        this.elevatorDoors.push({ node: door, closed: door.position.clone(), open: door.position.clone().add(away) });
      }
    }
  }

  // Placeholder lighting: cold blue, dim, with pools of light round the core and the tiers
  _addLights() {
    this.root.add(new THREE.HemisphereLight(0x4d6688, 0x05070a, 0.16));
    const lamps = [
      [0, 27, 0, 0x7fb4ff, 800],
      [0, 10, 0, 0x6fa4ff, 420],
      [22, 9, 0, 0x8fbcff, 240], [-22, 9, 0, 0x8fbcff, 240],
      [0, 9, 22, 0x8fbcff, 240], [0, 9, -22, 0x8fbcff, 240],
      [18, 4, 18, 0x5f95e8, 180], [-18, 4, -18, 0x5f95e8, 180],
      [18, 4, -18, 0x5f95e8, 180], [-18, 4, 18, 0x5f95e8, 180],
      [0, 16, 24, 0x8fbcff, 240], [0, 16, -24, 0x8fbcff, 240]
    ];
    for (const [x, y, z, color, intensity] of lamps) {
      const light = new THREE.PointLight(color, intensity, 0, 2);
      light.position.set(x, y, z);
      this.root.add(light);
    }
    // Light for each crew quarters, so stepping inside is a change
    for (const [letter, a, y] of [['A', 90, 0], ['B', 200, 7], ['C', 320, 14]]) {
      const light = new THREE.PointLight(0x7fa8e8, 28, 12, 2);
      light.position.copy(polar(38.5, a, y + 3.6));
      this.root.add(light);
      this[`podLight${letter}`] = light;
    }
  }

  // What the big window looks out on: the dark water around a deep-sea station, with
  // drifting marine snow and the faint glow of the hydrothermal vent far below
  _addDeepSea() {
    const count = 700;
    this._snow = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) this._respawnSnow(i, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this._snow, 3));
    this.snow = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x9fd4e6, size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0.55, fog: false, depthWrite: false
    }));
    this.snow.frustumCulled = false;
    this.root.add(this.snow);

    // A soft glow in the deep: the vent
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(120,200,220,0.55)');
    grad.addColorStop(0.35, 'rgba(40,110,150,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false
    }));
    glow.scale.set(150, 80, 1);
    glow.position.copy(polar(170, 42, -22));
    this.root.add(glow);
  }

  // Marine snow lives in the water beyond the window (angles 5..85 degrees)
  _respawnSnow(i, anywhere) {
    const a = 5 + Math.random() * 80;
    const r = 36 + Math.random() * 110;
    const p = polar(r, a, anywhere ? -10 + Math.random() * 60 : 50);
    this._snow[i * 3] = p.x;
    this._snow[i * 3 + 1] = p.y;
    this._snow[i * 3 + 2] = p.z;
  }

  openElevator() {
    this.elevatorOpening = true;
  }

  // The quarters door slides up into the wall; its collider goes so you can walk in
  openQuarters(letter) {
    const q = this.quarters[letter];
    if (!q || q.opening) return;
    q.opening = true;
    if (q.collider) {
      this.physics.world.removeCollider(q.collider, true);
      q.collider = null;
    }
  }

  isQuartersOpen(letter) {
    return !!this.quarters[letter]?.opening;
  }

  // Back to the start (restart without reloading the page)
  resetWorld() {
    this.elevatorOpening = false;
    this.elevatorOpen = 0;
    for (const d of this.elevatorDoors) d.node.position.copy(d.closed);
    for (const q of Object.values(this.quarters)) {
      q.node.position.y = q.closedY;
      q.open = 0;
      if (q.opening) q.collider = this.physics.addStaticObject(q.node);
      q.opening = false;
    }
  }

  update(delta) {
    hubTime.value += delta;                                 // drives the flowing light in the shaders
    for (const h of this.halos || []) h.node.rotation.y += h.speed * delta;
    if (this.elevatorOpening && this.elevatorOpen < 1) {
      this.elevatorOpen = Math.min(1, this.elevatorOpen + delta / 1.8);
      const t = this.elevatorOpen * this.elevatorOpen * (3 - 2 * this.elevatorOpen);
      for (const d of this.elevatorDoors) d.node.position.lerpVectors(d.closed, d.open, t);
    }
    for (const q of Object.values(this.quarters)) {
      if (q.opening && q.open < 1) {
        q.open = Math.min(1, q.open + delta / 1.4);
        const t = q.open * q.open * (3 - 2 * q.open);
        q.node.position.y = q.closedY + 4.7 * t;
      }
    }
    if (this.snow) {
      const pos = this._snow;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i + 1] -= delta * 0.5;
        pos[i] += Math.sin(i + pos[i + 1] * 0.3) * delta * 0.15;
        if (pos[i + 1] < -12) this._respawnSnow(i / 3, false);
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        m.map?.dispose?.();
        m.dispose();
      }
    });
    for (const set of Object.values(this.textures || {})) {
      set.albedo.dispose();
      set.height.dispose();
    }
    this.scene.environment = null;
    this.scene.remove(this.root);
  }
}

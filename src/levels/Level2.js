import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createHubTextures, applyHubMaterials, hubTime } from '../graphics/HubMaterials.js';
import { createHubDecals, disposeHubDecals } from '../graphics/HubDecals.js';
import { DeepSeaWindow } from '../graphics/DeepSeaWindow.js';
import { polar } from './hubGeometry.js';

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

export { polar, angleOf } from './hubGeometry.js';

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

    this.decals = createHubDecals();
    this.root.add(this.decals);
    this._addEnvironment(renderer);
    this._addLights(hub);
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
  _addLights(hub) {
    // The hall is dark; the reactor is what lights it. A low cool fill keeps the shapes readable.
    this.root.add(new THREE.HemisphereLight(0x7f94b4, 0x0b0e14, 0.3));

    // The reactor: a strong light at its heart and one at its crown, so everything near it is
    // bright and everything far from it falls away into the dark (the inverse-square falloff
    // does the rest). Cool white-cyan, like the energy in its conduits.
    const reactor = [
      [0, 12, 0, 0x9fdcff, 650],
      [0, 27, 0, 0x8fc8ff, 420],
      [0, 3, 0, 0x7fd0ff, 160]
    ];
    for (const [x, y, z, color, intensity] of reactor) {
      const light = new THREE.PointLight(color, intensity, 0, 2);
      light.position.set(x, y, z);
      this.root.add(light);
    }

    // Four dim fills around the walls so the edges of the hall are not pitch black
    for (const [x, y, z] of [[24, 9, 0], [-24, 9, 0], [0, 9, 24], [0, 9, -24]]) {
      const light = new THREE.PointLight(0x6f92c8, 70, 40, 2);
      light.position.set(x, y, z);
      this.root.add(light);
    }

    // Warm work lamps, one at each LAMP_ marker in the model: each only makes a small pool of
    // orange on the floor around its stand, a bit of life against the cool blue
    hub.traverse((o) => {
      if (!o.name.startsWith('LAMP_')) return;
      const light = new THREE.PointLight(0xffc48a, 20, 8, 2);
      light.position.copy(o.getWorldPosition(new THREE.Vector3()));
      this.root.add(light);
    });

    // Light for each crew quarters, so stepping inside is a change
    for (const [letter, a, y] of [['A', 90, 0], ['B', 200, 7], ['C', 320, 14]]) {
      const light = new THREE.PointLight(0xa8c4f0, 25, 12, 2);
      light.position.copy(polar(38.5, a, y + 3.6));
      this.root.add(light);
      this['podLight' + letter] = light;
    }
  }

  // What the big window looks out on: the dark water around a deep-sea station, with creatures
  // drifting past (an animated projection, see graphics/DeepSeaWindow.js)
  _addDeepSea() {
    this.seaWindow = new DeepSeaWindow();
    this.root.add(this.seaWindow.mesh);
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
    this.seaWindow?.update(delta);
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
    if (this.decals) disposeHubDecals(this.decals);
    this.seaWindow?.dispose();
    for (const set of Object.values(this.textures || {})) {
      set.albedo.dispose();
      set.height.dispose();
    }
    this.scene.environment = null;
    this.scene.remove(this.root);
  }
}

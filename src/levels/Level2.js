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

const SOLID_PREFIXES = ['COL_', 'MOVE_', 'ROT_', 'DOOR_', 'LIFT_', 'GATE_'];

// The wings: each is its own model, built in the hub's coordinates so it lines up
const WINGS = ['./assets/models/wing1-cargo.glb'];

// The same six lights serve every zone: entering a zone moves them there (moving a light is
// free; adding or removing one would recompile every shader). [x, y, z, intensity, distance]
const LIGHT_ZONES = {
  hub: [[0, 11, 0, 760, 0], [0, 27, 0, 420, 0], [17, 9, 17, 110, 45], [-17, 9, -17, 110, 45]],
  wing1: [[0, 11, -62, 700, 0], [0, 10, -84, 380, 0], [0, 4.2, -38, 45, 18], [0, 7, -48, 160, 30]]
};
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

    // The wings (their own models), handled exactly like the hub
    this.gates = {};
    for (const url of WINGS) {
      const wing = (await new GLTFLoader().loadAsync(url)).scene;
      wing.updateMatrixWorld(true);
      for (const node of [...wing.children]) {
        if (startsWithAny(node.name, SOLID_PREFIXES)) {
          const collider = physics.addStaticObject(node);
          if (node.name.startsWith('GATE_')) this.gates[node.name] = { node, collider, closedY: node.position.y, open: 0, opening: false };
        }
        if (startsWithAny(node.name, HIDDEN_PREFIXES)) wing.remove(node);
      }
      this._tameMaterials(wing);
      applyHubMaterials(wing, this.textures);
      for (const letter of ['A', 'B', 'C']) {
        const node = wing.getObjectByName(`TAPE_${letter}`);
        if (node) this.tapes[letter] = node.getWorldPosition(new THREE.Vector3());
      }
      const cp = wing.getObjectByName('PT_Checkpoint');
      if (cp) this.wingCheckpoint = cp.getWorldPosition(new THREE.Vector3());
      this.root.add(wing);
    }

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
      [0, 11, 0, 0x9fdcff, 760],
      [0, 27, 0, 0x8fc8ff, 420]
    ];
    this.zoneLights = [];
    for (const [x, y, z, color, intensity] of reactor) {
      const light = new THREE.PointLight(color, intensity, 0, 2);
      light.position.set(x, y, z);
      this.root.add(light);
      this.zoneLights.push(light);
    }

    // Two dim fills on opposite walls so the edges of the hall are not pitch black
    for (const [x, y, z] of [[17, 9, 17], [-17, 9, -17]]) {
      const light = new THREE.PointLight(0x6f92c8, 110, 45, 2);
      light.position.set(x, y, z);
      this.root.add(light);
      this.zoneLights.push(light);
    }
    this.zone = 'hub';

    // Warm work lamps, one at each LAMP_ marker in the model. These are NOT real lights: every
    // real light makes every surface's shader slower to compile and to draw. Instead each lamp
    // paints a soft pool of warm light on the floor below it (an additive glow decal), which
    // reads the same and costs almost nothing.
    const pool = this._lightPoolMaterial();
    const poolGeo = new THREE.CircleGeometry(3.2, 32);
    poolGeo.rotateX(-Math.PI / 2);
    hub.traverse((o) => {
      if (!o.name.startsWith('LAMP_')) return;
      const p = o.getWorldPosition(new THREE.Vector3());
      const spot = new THREE.Mesh(poolGeo, pool);
      spot.position.set(p.x, 0.035, p.z);
      spot.renderOrder = 2;
      this.root.add(spot);
    });

    // One light for the crew quarters, moved into whichever one the player is in (moving a light
    // is free; adding or removing one would recompile every shader)
    this.podLight = new THREE.PointLight(0xa8c4f0, 0, 12, 2);
    this.podLight.position.copy(polar(38.5, 90, 3.6));
    this.root.add(this.podLight);
  }

  _lightPoolMaterial() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,190,120,0.55)');
    g.addColorStop(0.45, 'rgba(255,160,90,0.2)');
    g.addColorStop(1, 'rgba(255,140,70,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
    });
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

  // Move the zone lights to where the player is ('hub' or 'wing1')
  setZone(name) {
    const preset = LIGHT_ZONES[name];
    if (!preset || name === this.zone) return;
    this.zone = name;
    preset.forEach(([x, y, z, intensity, distance], i) => {
      const l = this.zoneLights[i];
      l.position.set(x, y, z);
      l.intensity = intensity;
      l.distance = distance;
    });
  }

  // Light the quarters the player is standing in (null: none). A is at the end of Wing 1.
  lightQuarters(letter) {
    if (!letter) {
      this.podLight.intensity = 0;
      return;
    }
    if (letter === 'A') this.podLight.position.set(0, 3.6, -96.6);
    else {
      const at = { B: [200, 7], C: [320, 14] }[letter];
      this.podLight.position.copy(polar(38.5, at[0], at[1] + 3.6));
    }
    this.podLight.intensity = 25;
  }

  // Gates inside the wings: slide up into the wall; the collider goes so you can walk through
  openGate(name) {
    const g = this.gates[name];
    if (!g || g.opening) return;
    g.opening = true;
    if (g.collider) {
      this.physics.world.removeCollider(g.collider, true);
      g.collider = null;
    }
  }

  closeGate(name) {
    const g = this.gates[name];
    if (!g || !g.opening) return;
    g.node.position.y = g.closedY;
    g.open = 0;
    g.opening = false;
    g.collider = this.physics.addStaticObject(g.node);
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

  update(delta, camera = null) {
    hubTime.value += delta;                                 // drives the flowing light in the shaders
    for (const h of this.halos || []) h.node.rotation.y += h.speed * delta;
    if (this.elevatorOpening && this.elevatorOpen < 1) {
      this.elevatorOpen = Math.min(1, this.elevatorOpen + delta / 1.8);
      const t = this.elevatorOpen * this.elevatorOpen * (3 - 2 * this.elevatorOpen);
      for (const d of this.elevatorDoors) d.node.position.lerpVectors(d.closed, d.open, t);
    }
    for (const q of [...Object.values(this.quarters), ...Object.values(this.gates || {})]) {
      if (q.opening && q.open < 1) {
        q.open = Math.min(1, q.open + delta / 1.4);
        const t = q.open * q.open * (3 - 2 * q.open);
        q.node.position.y = q.closedY + 4.7 * t;
      }
    }
    this.seaWindow?.update(delta, camera);
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

import * as THREE from 'three';
import { createGLTFLoader } from '../core/loaders.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { Physics } from '../core/Physics.js';
import { PlayerController } from '../player/PlayerController.js';
import { createHubTextures, applyHubMaterials, surfaceMaterial, hubLighting, withHubLighting, bakeShadeMap, HUB_POOLS } from '../graphics/HubMaterials.js';
import { surfaceFor, SURFACE } from '../levels/level1Look.js';
import { makeLiftScreen } from '../levels/liftCabin.js';
import { VideoWindow } from '../graphics/VideoWindow.js';
import { AriaManager } from '../entities/AriaManager.js';
import { makeToonRamp, toonFrom } from '../entities/Player.js';
import { Organism } from './Organism.js';
import { LabScreens } from './LabScreens.js';
import { HoloScreens } from './HoloScreens.js';
import { Sparks } from './Sparks.js';
import { Level2Story } from './Level2Story.js';
import { projectWaypoint } from '../ui/waypoint.js';
import { Interact } from './Interact.js';
import { LINES, TALKS, CUES } from './Level2Lines.js';
import { buildHallClues } from './HallClues.js';
import { Gates } from './Gates.js';
import { KeypadUI } from '../ui/KeypadUI.js';
import { Garden } from './Garden.js';
import { PlayerStats, MAX_INTEGRITY } from '../player/PlayerStats.js';
import { HUD } from '../ui/HUD.js';
import '../ui/level2.css';

// Level 2, the new build: the habitat atrium (Blender/scripts/build_l2_atrium.py), shown as an
// ENVIRONMENT PREVIEW. You arrive in the lift, the doors open, and you can walk the whole space.
// No gameplay yet: that is designed and added after the environment is approved.

const SOLID = ['COL_', 'DOOR_'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The lift is level 1's (lift.glb, see levels/liftCabin.js), its origin the middle of the door
// sill at the front of the frame. Set there, the frame's front corners sit on the curved inside
// of the wall (radius 17 m) in the middle of the lift opening (south, so +z).
const LIFT_FRONT_Z = 16.94;
const LIFT_OPENING = { halfWidth: 2.2, top: 3.62, back: 17.52 };   // a little past the wall's gap
// Inside the cabin the room's reflected light is turned up (1.5, against the scene's 0.32) in place
// of a lamp: level 1 lights the cabin with the control room's lamps, and a real light here would
// be worked out for every pixel on screen (~3 ms a frame on Intel UHD 620)
const LIFT_INSIDE_FILL = 1.5;

// The atrium's broken lighting (see hubLighting in HubMaterials): the lamps that still work make
// soft pools, and some areas have gone dead. Positions in metres (north is -z, the lift +z).
const LAMP_POOLS = [
  { at: [0, 3.2, 14], reach: 6.5, color: [1.0, 0.88, 0.72], power: 1.8 },      // the lift approach: warm, welcoming
  { at: [-7, 3.6, 3], reach: 6.5, color: [1.0, 0.9, 0.76], power: 1.6 },         // one lounge lamp left working
  { at: [9.5, 4.5, -6.5], reach: 8.5, color: [0.86, 0.95, 1.0], power: 2.2, flicker: true },  // the garden: flickers with the dangling light
  { at: [0, 2.6, -14.2], reach: 7, color: [0.5, 0.78, 1.0], power: 1.5 },    // cold sea-glow from the window
  { at: [-15.4, 4.2, 0.6], reach: 5.5, color: [1.0, 0.45, 0.16], power: 1.6, flicker: true }, // the sparking wires, west
  { at: [11.5, 2.4, 11.5], reach: 5, color: [1.0, 0.16, 0.1], power: 1.4 },  // a red emergency lamp at the east stair
  { at: [-3.9, 2.9, 15.6], reach: 3.4, color: [1.0, 0.9, 0.74], power: 1.5 },  // a desk lamp by the crew's photo board
  { at: [15.6, 7.3, 0], reach: 3.6, color: [1.0, 0.86, 0.66], power: 1.8 }     // upstairs, the crew quarters' lights still on
];
const DEAD_ZONES = [
  { at: [-13, 1.5, -6], reach: 7, depth: 0.6 },     // west, by the sealed pods
  { at: [-8, 1, -12.5], reach: 6, depth: 0.5 },     // north-west, behind the beds
  { at: [12.5, 1, 5.5], reach: 5.5, depth: 0.45 },  // behind the east stair
  { at: [-10, 7, -10], reach: 7, depth: 0.55 }      // the gallery, north-west
];
const GRIME = 0.48;          // how dark the patches of soot and dead panels get
const UNDER_GALLERY = 0.58;  // how much darker it is under the gallery ring
const ATRIUM_DIM = 0.82;     // the atrium's share of the room light: the lamp pools stand out against it
const DAMAGED_BASE = 0.8;    // the mood's normal brightness on arrival (the power is failing)
// When the garden's pumps restart, most of the atrium's light comes back: the dark, damaged
// arrival gives way to the room as it was meant to look (still a little under strain)
const RESTORED_LIGHT = 0.6;  // how far towards clean the shade goes (uRestore)
const RESTORED_BASE = 0.92;  // the mood's normal brightness after the restart (DAMAGED_BASE before)
const HATCH_CODE = '471902'; // Kessler's override (placeholder, see the script's open decisions)
const DIRECT_HIT = 20;       // a drone's dive, straight into him (health is out of 100)
const GRAZE = 6;             // a dive that only clips him
const MANIFOLD_AT = { r: 14.6, angle: 30 };   // the garden's wall of pipes, behind the hatch

// Glass everywhere (the sea window, railings, the lab's tubes and beakers): dark and one-sided, so
// it adds reflections without laying a milky white film over what is behind it, and clear face-on
// but bright and nearly solid at its edges, as real glass is (Fresnel)
function realGlass(m, opacity = 0.18) {
  m.color.set(0x0a1414);
  m.opacity = opacity;
  m.roughness = 0.08;
  m.envMapIntensity = 0.9;
  m.side = THREE.FrontSide;
  m.transparent = true;
  m.depthWrite = false;
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float glassRim = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);
      diffuseColor.a = mix(diffuseColor.a, 0.85, glassRim);
      outgoingLight += vec3(0.75, 0.88, 0.95) * glassRim * 0.5;
      #include <opaque_fragment>`);
  };
  m.needsUpdate = true;
}

export class HabitatSession {
  constructor(game) {
    this.game = game;
    this.ready = false;
    this.doorOpen = 0;
    this.doors = [];
    this.doorColliders = {};   // DOOR_ nodes keep their collider here so it can be removed on open
    const camera = game.camera.instance;
    camera.far = 300;
    camera.updateProjectionMatrix();
    game.camera.flashlight.intensity = 0;
    game.camera.flashlight.castShadow = false;

    if (game.mood) game.mood.base = DAMAGED_BASE;    // under strain, never fully clean
    this._setUpRendering();
    this.controls = new PlayerController(camera, document.body, game.scene);
    game.controls = this.controls;
    this.controls.camDist = 3.8;

    const root = document.getElementById('ui-layer');
    // Voss's health (integrity), the same as in Level 1, on the same HUD
    this.player = new PlayerStats();
    this.hud = new HUD(root, { onRestart: () => {} });
    this.loadingEl = document.createElement('div');
    this.loadingEl.id = 'level-loading';
    this.loadingEl.className = 'visible';
    this.loadingEl.innerHTML = '<div class="loading-title">LEVEL 2</div><div class="loading-sub">The habitat deck</div><div class="loading-bar"><div></div></div>';
    root.appendChild(this.loadingEl);

    document.addEventListener('click', () => {
      if (game.state === 'PLAYING' && !this.controls.instance.isLocked) this.controls.lock();
    });

    // E uses what Voss is looking at; Enter skips a line of dialogue
    this._wpInfo = { x: 0, y: 0, angle: 0, onScreen: true, label: '', distance: 0 };
    this._head = new THREE.Vector3();
    this._talkToken = 0;
    window.addEventListener('keydown', (e) => {
      if (this.keypad?.isOpen) {
        if (e.code === 'Escape') this._closeKeypad();
        return;
      }
      if (game.state !== 'PLAYING' || !this.ready) return;
      if (e.code === 'KeyE' && !e.repeat) this.interact?.use();
      if (e.code === 'Enter') this.skipLine();
      if (e.code === 'KeyQ' && !e.repeat) this.garden?.freeze();
    });
    // the left mouse button sprays the garden's water pipe while he holds it
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.garden?.audio.start();
      if (game.state === 'PLAYING' && this.controls.instance.isLocked && this.garden?.holding) this.garden.spraying = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.garden) this.garden.spraying = false;
    });

    // ?debug in the address: ] sets the next story flag (to walk the objectives through the
    // route), [ plays the next of ARIA's exchanges (to hear every line). (Not F7: in Edge and
    // Chrome it turns on caret browsing and steals the keyboard.)
    if (new URLSearchParams(window.location.search).has('debug')) {
      let nextTalk = 0;
      window.addEventListener('keydown', (e) => {
        if (!this.story) return;
        if (e.code === 'BracketRight') {
          e.preventDefault();
          const flag = this.story.next();
          if (flag) this.story.set(flag);
          game.ui.showToast(flag ? 'Debug: ' + flag : 'Debug: every flag is set', 1500);
        } else if (e.code === 'BracketLeft') {
          e.preventDefault();
          const names = Object.keys(TALKS);
          const name = names[nextTalk++ % names.length];
          game.ui.showToast('Debug: ' + name + ' (' + nextTalk + '/' + names.length + ')', 2000);
          this.say(name);
        }
      });
    }

    Physics.create().then(async (physics) => {
      this.physics = physics;
      await this._load();
      await this._precompile();
      this.ready = true;
      this.loadingEl.classList.remove('visible');
      game.ui.showToast('WASD to move, Space to jump, E to use things, V to switch camera.', 7000);
    }).catch((e) => console.error('Level 2 atrium failed to load.', e));
  }

  _setUpRendering() {
    const g = this.game;
    const webgl = g.renderer.instance;
    webgl.toneMapping = THREE.ACESFilmicToneMapping;
    webgl.toneMappingExposure = 0.75;
    // shadows from the lab's ceiling light only, drawn once (nothing in the lab moves), so they cost
    // almost nothing per frame
    webgl.shadowMap.enabled = true;
    webgl.shadowMap.type = THREE.PCFShadowMap;
    webgl.shadowMap.autoUpdate = false;
    // Performance (measured on Intel UHD 620): 4x MSAA cost ~9 ms a frame, so edges are smoothed
    // by FXAA instead (~1 ms). The glow (bloom) is dropped automatically on slow machines.
    // at most one rendered pixel per screen pixel (Windows display scaling would multiply them)
    webgl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
    const size = new THREE.Vector2();
    webgl.getSize(size);
    const pr = webgl.getPixelRatio();
    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(webgl, target);
    this.composer.addPass(new RenderPass(g.scene, g.camera.instance));
    this.bloom = new UnrealBloomPass(size.clone().multiplyScalar(0.5), 0.12, 0.4, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaa);
    const fitFxaa = () => {
      const p = webgl.getPixelRatio();
      this.fxaa.material.uniforms.resolution.value.set(1 / (window.innerWidth * p), 1 / (window.innerHeight * p));
    };
    fitFxaa();
    this.frame = 0;
    g.renderer.render = () => {
      // ARIA's face is drawn offscreen for the monitors; half rate is plenty for a slow idle face
      if (this.aria && (this.frame++ & 1) === 0) this.aria.renderHead(webgl);
      this.composer.render();
    };
    window.addEventListener('resize', () => {
      this.composer.setSize(window.innerWidth, window.innerHeight);
      fitFxaa();
    });
    const pmrem = new THREE.PMREMGenerator(webgl);
    g.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    g.scene.environmentIntensity = 0.32;
    pmrem.dispose();
    g.scene.background = new THREE.Color(0xdfe7ee);
    g.scene.fog = null;
  }

  // Loads one of the level's models: collision into the physics world, then the game's materials
  async _loadModel(url) {
    const gltf = await createGLTFLoader().loadAsync(url);
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    for (const node of [...model.children]) {
      if (SOLID.some((p) => node.name.startsWith(p))) {
        const collider = this.physics.addStaticObject(node);
        if (node.name.startsWith('DOOR_')) this.doorColliders[node.name] = collider;
      }
      if (node.name.startsWith('COL_')) model.remove(node);
    }
    // glass and leaves: see-through glass, leaves cut out by their alpha
    const leafCache = new Map();
    model.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.name === 'white_glow') m.emissiveIntensity = 0.24;  // the skylight panel: soft, not blinding
        if (m.name === 'blue_glow') m.emissiveIntensity *= 0.55;  // LED lines: a calm accent
        if (m.name === 'aria_screen') m.emissiveIntensity *= 0.7;
        if (m.name === 'panel_mint' || m.name === 'panel_blue') m.emissiveIntensity *= 0.3;   // soft tint, not white
        if (m.name.startsWith('palm_leaf') || m.name.startsWith('veg_') || o.name.startsWith('PLANT_')) {
          // leaves: cut out by their alpha, both sides drawn. They get the cheaper Lambert lighting
          // (measured: plants cost ~5 ms a frame with full PBR)
          if (!leafCache.has(m)) {
            leafCache.set(m, withHubLighting(new THREE.MeshLambertMaterial({
              name: m.name, color: m.color, map: m.map || null, alphaTest: 0.25, side: THREE.DoubleSide
            })));
          }
        } else if (m.name === 'glass' || m.name === 'glass_broken') {
          realGlass(m, m.name === 'glass' ? 0.18 : 0.4);
        } else if (m.opacity < 1) {
          m.transparent = true;
          m.depthWrite = false;
        }
      }
    });
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material) ? o.material.map((m) => leafCache.get(m) || m) : (leafCache.get(o.material) || o.material);
    });
    this.hubTextures = this.hubTextures || createHubTextures();
    applyHubMaterials(model, this.hubTextures);
    // the bedrooms take the toon treatment the player wears: the cel banding and cyan rim
    // (the team's toon look), under this level's own lights. Scoped by material name - VCol.* /
    // Material.00* are the bedroom set the exporter writes, so the atrium's own materials
    // are untouched. Their paint lives in vertex colours, so those are only enabled for
    // meshes that actually carry a COLOR_0 attribute (the shells have none)
    const ramp = makeToonRamp();
    const isBedroom = (m) => m.name.startsWith('VCol.') || m.name.startsWith('Material.');
    const toonCache = new Map();
    const toon = (m, vertexColors) => {
      const key = m.name + ':' + vertexColors;
      if (!toonCache.has(key)) toonCache.set(key, toonFrom(m, ramp, { vertexColors }));
      return toonCache.get(key);
    };
    model.traverse((o) => {
      if (!o.isMesh) return;
      const swap = (m) => (isBedroom(m) ? toon(m, !!o.geometry.attributes.color) : m);
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
    // the light panels glow but a glow lights nothing, and the toon look drops the
    // environment fill the standard materials had - so the rooms need real lights. One
    // warm point light per room at the centre of that room's panels; rooms are found by
    // clustering the panels by proximity, so a future bedroom gets its light too
    const litRooms = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!mats.some((m) => isBedroom(m) && m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0)) return;
      const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
      const room = litRooms.find((k) => k.centre.distanceTo(c) < 8);
      if (room) {
        room.centre.multiplyScalar(room.n).add(c).divideScalar(room.n + 1);
        room.n += 1;
      } else {
        litRooms.push({ centre: c, n: 1 });
      }
    });
    this.roomLights = this.roomLights || [];
    for (const room of litRooms) {
      const l = new THREE.PointLight(0xffeeda, 30, 10, 2);
      l.position.copy(room.centre);
      this.game.scene.add(l);
      this.roomLights.push({ light: l, base: l.intensity, color: l.color.clone() });
    }
    this.game.scene.add(model);
    return model;
  }

  async _load() {
    const scene = this.game.scene;
    // Voss's quarter is authored inside l2-atrium.blend (the Bedroom1 collection), so it ships
    // in the atrium model rather than as a separate file
    const [atrium, lab, lift] = await Promise.all([
      this._loadModel('./assets/models/l2-atrium.glb'),
      this._loadModel('./assets/models/l2-lab.glb'),
      createGLTFLoader().loadAsync('./assets/models/lift.glb').catch((e) => {
        console.error('lift.glb failed to load; arriving in the old atrium lift instead.', e);
        return null;
      })
    ]);
    this.atrium = atrium;
    this.lab = lab;

    // arrive in the lift, facing the hall (north)
    const spawn = atrium.getObjectByName('SPAWN_Lift').getWorldPosition(new THREE.Vector3());
    this.controls.attach(this.physics, spawn.setY(spawn.y + 0.1), 0);
    if (lift) {
      this._placeLift(lift.scene, atrium);
    } else {
      for (const name of ['ELEVATOR_Door_L', 'ELEVATOR_Door_R']) {
        const n = atrium.getObjectByName(name);
        if (n) this.doors.push({ node: n, closed: n.position.clone(), open: n.position.clone().add(new THREE.Vector3(name.endsWith('L') ? -1.9 : 1.9, 0, 0)) });
      }
    }

    // the lab's sliding double doors open as you walk up to them
    this.labDoors = [];
    for (const name of ['LABDOOR_L', 'LABDOOR_R']) {
      const n = atrium.getObjectByName(name);
      if (n) this.labDoors.push({ node: n, closed: n.position.clone(), open: n.position.clone().add(new THREE.Vector3(Math.sign(n.position.x) * 1.8, 0, 0)) });
    }
    this.labDoorCentre = new THREE.Vector3(0, 5.5, -17.25);
    this.labDoorOpen = 0;

    // the quarter doors (Voss east, Kessler north-east): each slides up into the wall as you
    // come near and back down as you leave. The DOOR_ empties sit at the origin (their panels
    // are world-placed children), so take the trigger point from the panels' bounds, 2.2 m
    // out into the hall from them
    this.quarterDoors = [];
    for (const name of ['DOOR_VOSS', 'DOOR_KESSLER']) {
      const node = atrium.getObjectByName(name);
      if (!node) continue;
      const centre = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
      centre.add(new THREE.Vector3(-centre.x, -centre.y, 0).normalize().multiplyScalar(2.2));
      this.quarterDoors.push({ node, centre, closedY: node.position.y, solid: true, open: 0 });
    }

    // the story so far, and where the objective marker points (the model's marker empties: the
    // nameplates sit above their doors, so the marker drops to the doorway)
    const at = (name, dy) => {
      const o = atrium.getObjectByName(name);
      return o ? o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, dy, 0)) : null;
    };
    this.story = new Level2Story({
      hatch: at('PT_Hatch', 0.8),
      quarters: at('PT_Plate_VOSS', -2.2),
      lab: at('PT_Plate_LAB', -2.4),
      kessler: at('PT_Plate_KESSLER', -2.2)
    });
    this.story.onChange = (flag) => this._onStory(flag);

    // things Voss can use (E): the hall's optional clues, scene 2.2
    this.interact = new Interact(this.game.camera.instance, this.physics);
    const clues = buildHallClues(scene, atrium);
    if (clues.board) this.interact.add({ id: 'board', position: clues.board, radius: 0.9, label: 'Look at the photo board', use: () => this.say('chore') });
    if (clues.frame) this.interact.add({ id: 'frame', position: clues.frame, radius: 0.2, label: 'Look at the photo', use: () => this.say('photo') });
    if (clues.ration) this.interact.add({ id: 'ration', position: clues.ration, radius: 0.2, label: 'Look at the tray', use: () => this.say('ration') });
    const pods = at('PT_PodDoor', 0);
    if (pods) this.interact.add({ id: 'pods', position: pods, radius: 1.2, label: 'Read the sign on the pod door', use: () => this.say('pods') });

    // what holds him back (scenes 2.2 to 2.9): the stair bulkheads, the hatch and its keypad,
    // Kessler's door (it wants her card and the lab's authorisation)
    this.gates = new Gates({ scene, atrium, physics: this.physics });
    this.gates.bulkheadSpots.forEach((p, i) => this.interact.add({
      id: 'bulkhead' + i, position: p, radius: 1.4, label: 'Look through the bulkhead',
      when: () => this.gates.bulkheadsSealed, use: () => this.say('stairs')
    }));
    if (this.gates.keypadSpot) {
      this.interact.add({
        id: 'hatch', position: this.gates.keypadSpot, radius: 0.35, reach: 2.2,
        label: () => (this.story.has('gardenCleared') ? 'Use the hatch keypad' : 'Hatch keypad (no power)'),
        when: () => !this.story.has('hatchOpen'), use: () => this._useHatch()
      });
    }
    this.keypad = new KeypadUI({ onSubmit: (code) => this._hatchCode(code), onCancel: () => this._closeKeypad() });
    this.keypad.root.querySelector('.keypad-brand').textContent = 'MAINTENANCE HATCH 4';
    this.keypad.root.querySelector('.keypad-instruction').textContent = 'EMERGENCY OVERRIDE: CREW LEADER KEY (DR. E. KESSLER)';
    const kessler = atrium.getObjectByName('DOOR_KESSLER');
    if (kessler) {
      this.interact.add({
        id: 'kesslerDoor', position: new THREE.Box3().setFromObject(kessler).getCenter(new THREE.Vector3()), radius: 1.3,
        label: "Dr. Kessler's door (locked)", when: () => !this._kesslerUnlocked(), use: () => this._tryKesslerDoor()
      });
    }
    this.restore = 0;

    // the garden fight (scene 2.3): the drones, the wall of pipes and its hose
    this.garden = new Garden({
      scene, physics: this.physics, camera: this.game.camera.instance,
      centre: this.gates.hatchCentre || new THREE.Vector3(10.9, 0, -6.3), manifoldAt: MANIFOLD_AT,
      say: (talk, quietOnly) => (quietOnly && this._talking()) ? Promise.resolve(false) : this.say(talk),
      isTalking: () => this._talking(),
      onWake: () => this.story.set('dronesWoken'),
      onHurt: (kind, from) => this._hurt(kind, from),
      onCleared: () => this.story.set('gardenCleared'),
      toast: (text) => this.game.ui.showToast(text, 6500)
    });
    this.interact.add({
      id: 'pipe', position: this.garden.pipeSpot, radius: 0.5, label: 'Pull out the water pipe',
      when: () => !this.garden.holding && this.garden.state !== 'done', use: () => this.garden.takePipe()
    });

    this._addAriaScreens([atrium, lab]);
    this._setUpLab(lab);

    // the sea outside the big window: a looping video, the window's exact shape (16:9: 4.2 m tall,
    // 7.47 m wide along the inside of the 17 m wall, so 12.58 degrees either side of north)
    const winHalf = THREE.MathUtils.radToDeg((4.2 * 16 / 9) / 17) / 2;
    this.sea = new VideoWindow({ src: './assets/video/sea_loop.mp4', radius: 17.9, wallRadius: 17,
      a0: 90 - winHalf, a1: 90 + winHalf, bottom: 0.8, height: 4.2 });
    scene.add(this.sea.mesh);

    // Two lights only: a soft sky light and the sun through the skylight (which also casts every
    // shadow, the lab's included). Measured on Intel UHD 620: three extra fill lights and the lab's
    // spotlight cost ~14 ms a frame, because every light is worked out for every pixel on screen.
    // The room's reflections (environment) fill in the rest.
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8c949c, 0.42);
    scene.add(this.hemi);
    // daylight-like light from the skylight: even, no hot spot on the ceiling
    // (the main light, so its shadows read; the sky light and reflections are the soft fill)
    const sky = new THREE.DirectionalLight(0xfaf6ee, 1.9);
    this.sun = sky;
    sky.position.set(4, 20, 6);
    // it casts the hall's shadows (pillars, gallery, furniture, the clutter on the floor), drawn
    // once like the lab's. The ceiling and skylight do not block it.
    sky.castShadow = true;
    sky.shadow.mapSize.set(2048, 2048);
    sky.target.position.set(0, 0, -5);                     // aimed a little north so the lab is covered too
    Object.assign(sky.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 60 });
    scene.add(sky.target);
    sky.shadow.bias = -0.0005;
    sky.shadow.normalBias = 0.03;
    scene.add(sky);
    atrium.traverse((o) => {
      if (!o.isMesh) return;
      const base = o.name.replace(/_\d+$/, '');
      const see = Array.isArray(o.material) ? o.material : [o.material];
      if (see.some((m) => m.transparent)) return;            // glass casts no shadow
      o.receiveShadow = true;
      o.castShadow = !['Atrium_Ceiling', 'Atrium_Wall', 'Atrium_Floor'].includes(base);
    });

    // damaged wiring that sparks, and the dangling ceiling light that flickers with it
    const sparkAt = [];
    atrium.traverse((o) => { if (o.name.startsWith('PT_Sparks_')) sparkAt.push(o.getWorldPosition(new THREE.Vector3())); });
    this.sparks = new Sparks(scene, sparkAt);
    this.flickerMats = [];
    atrium.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.name === 'flicker_glow' && !this.flickerMats.includes(m)) this.flickerMats.push(m);
      }
    });
    this.flicker = 0;
    this._setUpBrokenLighting();
  }

  // The lamp pools go into the surfaces' shader (one shared set of uniforms); the dead zones,
  // soot and gallery shadow are baked once into the shade map
  _setUpBrokenLighting() {
    this.pools = LAMP_POOLS.slice(0, HUB_POOLS).map((p, i) => {
      hubLighting.uPools.value[i].set(p.at[0], p.at[1], p.at[2], p.reach);
      return { color: new THREE.Color(...p.color).multiplyScalar(p.power), flicker: !!p.flicker };
    });
    bakeShadeMap({ zones: DEAD_ZONES, grime: GRIME, gallery: { edge: 13.6, strength: UNDER_GALLERY }, dim: ATRIUM_DIM });
  }

  // The lift: the same cabin Voss rode down from the control room, in the control room's own
  // surfaces, set into the opening in the south wall in place of the atrium's plain cab. Its
  // doors are the ones that slide open as you arrive, and ARIA is on a screen on its back wall.
  _placeLift(lift, atrium) {
    const scene = this.game.scene;
    for (const name of ['Atrium_LiftCab', 'ELEVATOR_Door_L', 'ELEVATOR_Door_R', 'ARIA_Lift']) {
      atrium.getObjectByName(name)?.removeFromParent();
    }
    lift.position.set(0, 0, LIFT_FRONT_Z);
    scene.add(lift);
    lift.updateMatrixWorld(true);

    // level 1's surfaces (white walls, soft black ceiling and frame, the tiled floor, steel
    // buttons, orange hazard strips); the light strip, blue trim and call panel screen keep
    // their own colours, as in level 1
    const mats = new Map();
    this.liftInsideMats = [];
    const material = (spec, inside = false) => {
      const key = spec.kind + spec.color + inside;
      if (!mats.has(key)) {
        const m = surfaceMaterial(spec, this.hubTextures);
        if (inside) {
          m.envMap = scene.environment;    // (a material's own env map takes its own intensity)
          m.envMapIntensity = LIFT_INSIDE_FILL;
          this.liftInsideMats.push(m);
        }
        mats.set(key, m);
      }
      return mats.get(key);
    };
    const inside = new Set();
    lift.getObjectByName('ElevatorCabin').traverse((o) => inside.add(o));
    lift.traverse((o) => {
      if (!o.isMesh) return;
      const spec = surfaceFor(o.name.replace(/\./g, ''), o.material);
      // (not the floor: the sun reaches it, and it would glare)
      if (spec) o.material = material(spec, inside.has(o) && spec !== SURFACE.floor);
      o.receiveShadow = true;
    });

    // the opening in the wall is wider and taller than the lift's door frame: the gap round
    // it is filled in soft black, so the frame reads as one deep surround
    const frame = new THREE.Box3().setFromObject(lift.getObjectByName('Door_Frame'));
    const { halfWidth, top, back } = LIFT_OPENING;
    const front = frame.min.z + 0.02;
    const surround = new THREE.Group();
    surround.name = 'Lift_Surround';
    const fill = (x0, x1, y0, y1) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, back - front), material(SURFACE.softBlack));
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (front + back) / 2);
      m.receiveShadow = true;
      surround.add(m);
    };
    fill(frame.max.x - 0.01, halfWidth, 0, top);
    fill(-halfWidth, frame.min.x + 0.01, 0, top);
    fill(frame.min.x, frame.max.x, frame.max.y - 0.01, top);
    scene.add(surround);

    // solid: the cabin, its frame and the surround (the atrium's old cab colliders are left
    // behind, outside these walls)
    this.physics.addStaticObject(lift.getObjectByName('ElevatorCabin'));
    this.physics.addStaticObject(lift.getObjectByName('Door_Frame'));
    this.physics.addStaticObject(surround);

    // the doors slide apart into the wall (by as much as level 1's door animation moves them)
    for (const [name, dx] of [['Door_Left', 1.56], ['Door_Right', -1.58]]) {
      const n = lift.getObjectByName(name);
      if (n) this.doors.push({ node: n, closed: n.position.clone(), open: n.position.clone().add(new THREE.Vector3(dx, 0, 0)) });
    }

    const parts = makeLiftScreen(lift, material(SURFACE.softBlack, true));
    if (parts) {
      scene.add(parts.bezel);
      this.liftScreen = parts.screen;
    }
    this.liftStripMat = lift.getObjectByName('Cabin_LightStrip')?.material || null;
    this.lift = lift;
  }

  // Voss is out of the lift: its doors shut behind him and its lights die (it is flooded below)
  _shutLift() {
    this.liftShut = true;
    if (this.liftStripMat) this.liftStripMat.emissiveIntensity = 0.1;
    for (const m of this.liftInsideMats || []) m.envMapIntensity = 0.3;
    this.say('liftShut');
  }

  _setLiftDoors(open) {
    const t = open * open * (3 - 2 * open);
    for (const d of this.doors) d.node.position.lerpVectors(d.closed, d.open, t);
  }

  // ARIA on every monitor (the ARIA_ markers from the model), idling for now. Same face and
  // hologram shader as Level 1; one shared material, so more screens cost almost nothing.
  _addAriaScreens(models) {
    const SIZES = { ARIA_M1: [4.2, 2.3], ARIA_Lift: [1.3, 0.73], ARIA_M10: [0.8, 0.45], ARIA_Lab: [1.4, 0.8] };
    const screens = new THREE.Group();
    const markers = [];
    for (const m of models) m.traverse((o) => { if (o.name.startsWith('ARIA_') && !o.isMesh) markers.push(o); });
    for (const marker of markers) {
      const [w, h] = SIZES[marker.name] || [1.5, 0.84];
      const geo = new THREE.PlaneGeometry(w, h);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));   // the shader expects glTF-style UVs
      const screen = new THREE.Mesh(geo);
      screen.name = marker.name + '_monitor';
      const p = marker.getWorldPosition(new THREE.Vector3());
      screen.position.copy(p);
      // the big screen over the lounge faces the lift, the lab's faces into the lab (north),
      // the rest face the middle of the hall
      if (marker.name === 'ARIA_M1') screen.lookAt(p.x, p.y, p.z + 1);
      else if (marker.name === 'ARIA_Lab') screen.lookAt(p.x, p.y, p.z - 1);
      else screen.lookAt(0, p.y, 0);
      screens.add(screen);
    }
    if (this.liftScreen) screens.add(this.liftScreen);
    this.game.scene.add(screens);
    this.aria = new AriaManager(this.game.scene);
    this.aria.collectMonitors(screens);
    for (const m of this.aria.monitors) m.material = this.aria.ariaMaterial;
    this.aria.playIdle();
  }

  // The lab: the organism in its tubes (and the pieces in the spills), the workstation screens,
  // the glowing spills, and the lab's one light (in the budget: 6 lights in the whole level)
  _setUpLab(lab) {
    const find = (prefix) => {
      const out = [];
      lab.traverse((o) => { if (o.name.startsWith(prefix)) out.push(o); });
      return out.sort((a, b) => a.name.localeCompare(b.name));
    };
    const tubes = find('ORG_').map((o) => ({
      base: o.getWorldPosition(new THREE.Vector3()),
      radius: o.name === 'ORG_2' ? 0.8 : 0.55,
      height: 3.0,
      broken: o.name.endsWith('_broken')
    }));
    const frags = find('ORGFRAG_').map((o) => o.getWorldPosition(new THREE.Vector3()));
    this.organism = new Organism(this.game.scene, tubes, frags);
    this.labScreens = new LabScreens(this.game.scene, find('PT_LabScreen_'));
    this.holoScreens = new HoloScreens(this.game.scene, find('PT_Holo_'));
    this.gooMats = [];
    lab.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name === 'Lab_Glass') o.renderOrder = 3;     // glass drawn over the liquid and the organism
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.name === 'goo_glow' && !this.gooMats.includes(m)) this.gooMats.push(m);
      }
    });
    // the lab's things cast and catch the sun's shadows (no light of its own: see the lights in _load)
    lab.traverse((o) => {
      if (!o.isMesh) return;
      // (meshes with several materials load as numbered parts, e.g. Lab_Furniture_3)
      const base = o.name.replace(/_\d+$/, '');
      const solid = ['Lab_Furniture', 'Lab_Clutter', 'Lab_Tubes', 'Lab_ChairFallen', 'Lab_ScopeFallen'].includes(base);
      if (solid) o.castShadow = true;
      if (solid || base === 'Lab_Room') o.receiveShadow = true;
    });
  }

  async _precompile() {
    const webgl = this.game.renderer.instance;
    try {
      await webgl.compileAsync(this.game.scene, this.game.camera.instance);
    } catch (e) {
      webgl.compile(this.game.scene, this.game.camera.instance);
    }
    this.game.renderer.instance.shadowMap.needsUpdate = true;   // draw the shadows once (nothing casting them moves)
    this.composer.render();
  }

  update(delta) {
    if (!this.ready || !this.controls.ready) return;
    const g = this.game;
    const dt = Math.min(delta, 0.05);
    const playing = g.state === 'PLAYING';
    if (playing || g.state === 'WAKING') this.controls.update(dt, playing);
    // the lift: ARIA welcomes Voss on the way down, the doors open once she has finished, and
    // they shut behind him once he is a step out (scene 2.1)
    const p = this.controls.position;
    if (playing && !this._arrivalStarted) {
      this._arrivalStarted = true;
      this.say('arrival').then(() => { this._arrivalDone = true; });
    }
    if (this._arrivalDone && !this.liftShut && this.doorOpen < 1) {
      this.doorOpen = Math.min(1, this.doorOpen + dt / 1.6);
      this._setLiftDoors(this.doorOpen);
    }
    if (playing && this.lift && !this.liftShut && this.story.has('leftLift') && p.z < LIFT_FRONT_Z - 1) this._shutLift();
    if (this.liftShut && this.doorOpen > 0) {
      this.doorOpen = Math.max(0, this.doorOpen - dt / 1.6);
      this._setLiftDoors(this.doorOpen);
      // shut: solid, unless he slipped back inside while they closed
      if (this.doorOpen === 0 && p.z < LIFT_FRONT_Z - 0.4) for (const d of this.doors) this.physics.addStaticObject(d.node);
    }
    this.sea.update(dt, g.camera.instance);
    // the lab doors slide open when you are near them
    const near = this.controls.position.distanceTo(this.labDoorCentre) < 4;
    this.labDoorOpen = THREE.MathUtils.clamp(this.labDoorOpen + (near ? dt : -dt) / 0.7, 0, 1);
    const ld = this.labDoorOpen * this.labDoorOpen * (3 - 2 * this.labDoorOpen);
    for (const d of this.labDoors) d.node.position.lerpVectors(d.closed, d.open, ld);

    // the quarter doors: slide up into the wall as you come near, back down as you leave.
    // Solid only while fully closed, since that is where their collider is baked.
    for (const d of this.quarterDoors) {
      const allowed = d.node.name !== 'DOOR_KESSLER' || this._kesslerUnlocked();
      const near = allowed && this.controls.position.distanceTo(d.centre) < 4;
      d.open = THREE.MathUtils.clamp(d.open + (near ? dt : -dt) / 1.2, 0, 1);
      const t = d.open * d.open * (3 - 2 * d.open);
      d.node.position.y = d.closedY + 3.4 * t;
      if (d.open > 0 && d.solid) {
        const c = this.doorColliders[d.node.name];
        if (c) {
          this.physics.world.removeCollider(c, true);
          delete this.doorColliders[d.node.name];
        }
        d.solid = false;
      } else if (d.open === 0 && !d.solid) {
        this.doorColliders[d.node.name] = this.physics.addStaticObject(d.node);
        d.solid = true;
      }
    }

    // the organism, its readings and the spills follow its surges. Only animate while you are in
    // or near the lab (redrawing the screens costs time); the lab is north of the gallery door.
    const nearLab = p.y > 4 && p.z < -12;
    if (nearLab) {
      this.organism.update(dt);
      const surge = this.organism.surge;
      this.labScreens.update(dt, surge);
      this.holoScreens.update(dt, surge);
      for (const m of this.gooMats) m.emissiveIntensity = 0.3 + 0.12 * Math.sin(this.organism.time * 2.3) + surge * 0.7;
    }

    // sparks crackle from the damaged wiring; the dangling light stutters, cutting out on each crackle
    this.gates?.update(dt);
    if (this.garden) {
      this._head.set(p.x, p.y + 1.6, p.z);
      this.garden.update({ dt, feet: p, head: this._head, playing,
        canWake: this.story.has('leftLift') && !this.story.has('gardenCleared') });
      this.garden.updateTease(dt);
      // a drone glimpsed far across the hall the first time he walks into it (scene 2.2)
      if (playing && !this._teased && this.story.has('leftLift') && !this.story.has('dronesWoken') && p.z < 9) {
        this._teased = true;
        this.garden.tease(new THREE.Vector3(-8, 4.2, -8), new THREE.Vector3(7, 4.2, -11), 5);
        setTimeout(() => this.say('tease'), 1200);
      }
      // the fight's music: pressure, harder the more drones are up
      const fighting = this.garden.active;
      this.musicMood = fighting ? 'pressure' : null;
      this.musicIntensity = fighting ? 0.35 + 0.65 * Math.min(1, this.garden.alive / 4) : 0;
      this.musicTension = 0.4 + 0.5 * this.musicIntensity;
    }
    this.hud.setVisible(playing || g.state === 'KEYPAD');
    this.hud.update(this.player);
    if (this.restore < this._restoreTarget) {
      this.restore = Math.min(this._restoreTarget, this.restore + dt / 3);
      hubLighting.uRestore.value = this.restore * RESTORED_LIGHT;
      if (g.mood) g.mood.base = THREE.MathUtils.lerp(DAMAGED_BASE, RESTORED_BASE, this.restore);
    }
    this._applyMood();
    this.sparks.update(dt);
    if (this.sparks.burstNow) this.flicker = 0.35;
    this.flicker = Math.max(0, this.flicker - dt);
    const buzz = this.flicker > 0 ? (Math.random() < 0.5 ? 0.05 : 1.6) : (Math.random() < 0.015 ? 0.1 : 1.0);
    for (const m of this.flickerMats) m.emissiveIntensity = buzz * 1.4;
    // ARIA idles on every screen (not AriaManager.update, which shows her on the nearest one only)
    this.aria.ariaMaterial.uniforms.uTime.value += dt;
    if (this.aria.useHead) this.aria.head.update(dt);
    g.reticle.classList.toggle('visible', this.controls.view === 'first');
    if (playing && !this.story.has('leftLift') && p.z < LIFT_FRONT_Z) this.story.set('leftLift');
    g.music?.setScene(this._sceneAt(p));
    this._guide(playing);
    this._perf(delta, playing);
  }

  // ARIA and Voss speak: a list of line ids, or the name of one of the exchanges in
  // Level2Lines.js. The lines play one after another: Voss's as text that stays up for a reading
  // time, ARIA's with her voice (or a subtitle until it is recorded), her face's expression and
  // her colour. Starting a new exchange cuts the current one short. Resolves true when finished,
  // false when cut short.
  async say(talk) {
    const ids = Array.isArray(talk) ? talk : TALKS[talk];
    if (!ids) {
      console.warn('Level 2: no exchange called "' + talk + '".');
      return false;
    }
    const ui = this.game.ui;
    const token = ++this._talkToken;
    if (this.aria.speaking) this.aria.skip();
    for (const id of ids) {
      if (token !== this._talkToken) return false;
      const line = LINES[id];
      if (!line) {
        console.warn('Level 2: no line "' + id + '".');
        continue;
      }
      if (line.who === 'voss') {
        const shown = ui.showVossLine(line.text, { timed: true });
        await Promise.race([shown, sleep(Math.max(2200, line.text.length * 60))]);
        continue;
      }
      // a long silence before she answers: the music drops out and the lights stutter
      if (line.pause) {
        ui.hideDialogue();
        this.game.holdMusic?.('silence', line.pause + 1.5);
        this.game.mood?.flicker(0.45);
        await sleep(line.pause * 1000);
        if (token !== this._talkToken) return false;
      }
      const cue = CUES[line.cue] || CUES.guarded;
      if (line.anger) this.game.ariaAnger?.(line.anger);
      else this.aria.updateAriaState(cue.mood);
      ui.showAriaLine(line.text, 'Enter: skip');
      await this.aria.speak(id, Math.max(2.5, line.text.length * 0.055), cue.expression);
      if (!line.anger) this.aria.updateAriaState('neutral');
    }
    if (token === this._talkToken) ui.hideDialogue();
    return token === this._talkToken;
  }

  // ---------------------------------------------------------
  // The story's consequences: whatever sets a flag (the fight, the keypad, F7 in debug), the
  // level reacts here
  // ---------------------------------------------------------
  _onStory(flag) {
    console.log('Level 2 story:', flag);
    if (flag === 'gardenCleared') this._powerReturns();
    if (flag === 'hatchOpen') {
      this.gates?.openHatch();
      this.say('hatchOpen');
    }
  }

  // The last drone is down and the pumps restart (end of scene 2.3): a stutter and a deep hit,
  // the atrium's light comes back, the stair bulkheads sink into the floor, and ARIA denies it
  _powerReturns() {
    const g = this.game;
    g.mood?.flicker(0.9);
    setTimeout(() => {
      g.music?.stinger('reveal');
      this._restoreTarget = 1;
      this.gates?.openBulkheads();
      this.gates?.setKeypadPowered(true);
    }, 700);
    setTimeout(() => this.say('bulkhead'), 2600);
  }

  // A drone's dive: a direct hit knocks him back; at zero ARIA restores him from backup
  _hurt(kind, from) {
    if (this._restoring) return;
    this.hud.flash();
    if (kind === 'direct' && from) this.controls.knockback?.(from, 6);
    if (this.player.damage(kind === 'direct' ? DIRECT_HIT : GRAZE)) this._restoreFromBackup();
  }

  _restoreFromBackup() {
    this._restoring = true;
    this.player.deaths++;
    this.hud.showDeath('BACKUP RESTORED', 'RESTORED: CYCLE 9');
    setTimeout(() => {
      this.hud.hideDeath();
      this.player.integrity = MAX_INTEGRITY;
      // back at the edge of the garden, facing it
      this.controls.teleport?.(new THREE.Vector3(4, 0.1, -2));
      this._restoring = false;
    }, 1800);
  }

  // Is anyone talking right now? (a hit's remark waits for a quiet moment)
  _talking() {
    return this.aria.speaking || this.game.ui.dialogue.classList.contains('visible');
  }

  _kesslerUnlocked() {
    return this.story.has('cardTaken') && this.story.has('labDone');
  }

  _tryKesslerDoor() {
    const ui = this.game.ui;
    if (!this.story.has('cardTaken')) ui.showToast('ACCESS: CARD REQUIRED', 2500);
    else ui.showToast('CARD ACCEPTED. LAB AUTHORISATION REQUIRED', 3000);
  }

  // The hatch keypad: dead until the pumps restart, then it wants Kessler's code
  _useHatch() {
    if (!this.story.has('gardenCleared')) {
      this.say(['v-dead-keypad']);
      return;
    }
    this.game.state = 'KEYPAD';
    this.controls.instance.unlock?.();
    this.game.ui.setPrompt(null);
    this.keypad.open();
  }

  _closeKeypad() {
    if (!this.keypad.isOpen) return;
    this.keypad.close();
    this.game.state = 'PLAYING';
  }

  _hatchCode(code) {
    if (code === HATCH_CODE) {
      this.keypad.setStatus('ACCESS GRANTED', 'success');
      setTimeout(() => {
        this._closeKeypad();
        this.story.set('hatchOpen');
      }, 900);
      return;
    }
    this.keypad.setStatus('ACCESS DENIED', 'error');
    setTimeout(() => {
      this._closeKeypad();
      // the first refusal: ARIA explains whose lock it is, and tells him not to go upstairs
      if (this.story.set('hatchTried')) this.say('hatchLocked');
    }, 1200);
  }

  // Enter: skip ARIA's line, or move on from Voss's
  skipLine() {
    const ui = this.game.ui;
    if (ui.isAriaLine()) this.aria.skip();
    else ui.advance();
  }

  // Where he is, for the background sound: the lab (north, beyond the gallery), one of the rooms
  // off the gallery or the lift (enclosed and quiet), the gallery, or the open atrium
  _sceneAt(p) {
    const r = Math.hypot(p.x, p.z);
    if (p.y > 4.5 && p.z < -17.3 && Math.abs(p.x) < 7) return 'lab';
    if (r > 17.2) return 'room';
    if (p.y > 4) return 'upstairs';
    return 'open';
  }

  // The objective banner and the marker on the next place to go, both from the story's flags
  _guide(playing) {
    const ui = this.game.ui;
    if (!playing) {
      ui.setWaypoint(null);
      ui.setPrompt(null);
      return;
    }
    const p = this.controls.position;
    // the thing he is looking at, if he can use it
    const hit = this.interact ? this.interact.update(this._head.set(p.x, p.y + 1.6, p.z)) : null;
    ui.setPrompt(hit ? 'E   ' + (typeof hit.label === 'function' ? hit.label() : hit.label) : null);
    const goal = this.story.objective(p);
    ui.setObjective(goal.text);
    // no marker during a fight (it stays up close, as Level 1's does)
    if (!goal.target) {
      ui.setWaypoint(null);
      return;
    }
    ui.setWaypoint(projectWaypoint(this.game.camera.instance, goal.target, goal.label, this._wpInfo));
  }

  // The game's mood (see MoodLight): the whole atrium a little dimmer than clean, and red when
  // an alarm sounds or ARIA snaps. The light panels glow white on their own, so while red they
  // are tinted too.
  _applyMood() {
    const mood = this.game.mood;
    if (!mood) return;
    const dim = mood.dim;
    const hemi = this.hemi, sun = this.sun, scene = this.game.scene;
    if (!this._moodBase) {
      this._moodBase = {
        hemiSky: hemi.color.clone(), hemiGround: hemi.groundColor.clone(), sun: sun.color.clone(),
        glow: [], hemi: hemi.intensity, sunI: sun.intensity, env: scene.environmentIntensity
      };
      const wanted = ['white_glow', 'tile_glow', 'blue_glow', 'accent_glow'];
      const seen = new Set();
      this.atrium.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (wanted.includes(m.name) && !seen.has(m)) { seen.add(m); this._moodBase.glow.push({ m, color: m.emissive.clone() }); }
        }
      });
    }
    const b = this._moodBase;
    hemi.intensity = b.hemi * mood.ambient;
    sun.intensity = b.sunI * dim;
    scene.environmentIntensity = b.env * mood.ambient;
    hemi.color.copy(b.hemiSky);
    hemi.groundColor.copy(b.hemiGround);
    sun.color.copy(b.sun);
    for (const r of this.roomLights || []) { r.light.intensity = r.base * dim; r.light.color.copy(r.color); }
    // the lamp pools: dimmed with the room, the faulty ones stuttering with the dangling light
    const buzz = this.flicker > 0 ? (Math.random() < 0.5 ? 0.15 : 1.2) : 1;
    (this.pools || []).forEach((p, i) => {
      const c = hubLighting.uPoolColors.value[i].copy(p.color).multiplyScalar(dim * (p.flicker ? buzz : 1));
      mood.tint(c);
    });
    if (mood.red > 0 || this._wasRed) {
      mood.tint(hemi.color);
      mood.tint(hemi.groundColor);
      mood.tint(sun.color);
      for (const r of this.roomLights || []) mood.tint(r.light.color);
      for (const g of b.glow) { g.m.emissive.copy(g.color); mood.tint(g.m.emissive); }
      this._wasRed = mood.red > 0;
    }
  }

  // A small frame counter (top right; F3 hides it), and automatic quality: if the first few
  // seconds of play run slowly, the glow is switched off, then the resolution lowered a little.
  _perf(delta, playing) {
    if (!this.fpsEl) {
      this.fpsEl = document.createElement('div');
      this.fpsEl.style.cssText = 'position:fixed;top:8px;right:10px;z-index:50;font:12px monospace;color:#cfefff;' +
        'background:rgba(4,18,27,0.7);padding:3px 7px;border-radius:4px;pointer-events:none';
      document.body.appendChild(this.fpsEl);
      window.addEventListener('keydown', (e) => {
        if (e.code === 'F3') { e.preventDefault(); this.fpsEl.style.display = this.fpsEl.style.display === 'none' ? '' : 'none'; }
      });
      this.fpsFrames = 0;
      this.fpsTime = 0;
      this.qualityTime = 0;
      this.qualityFrames = 0;
      this.qualityStep = 0;
    }
    this.fpsFrames++;
    this.fpsTime += delta;
    if (this.fpsTime >= 0.5) {
      const fps = this.fpsFrames / this.fpsTime;
      this.fpsEl.textContent = Math.round(fps) + ' fps  ' + (1000 / fps).toFixed(1) + ' ms' +
        (this.qualityStep ? '  (quality ' + ['', 'medium', 'low'][this.qualityStep] + ')' : '');
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    // automatic quality: judge each 4 seconds of play, at most twice
    // (not while the tab is hidden, and ignoring one-off stalls: the browser slows hidden tabs down)
    if (!playing || this.qualityStep >= 2 || document.hidden || delta > 0.2) return;
    this.qualityTime += delta;
    this.qualityFrames++;
    if (this.qualityTime < 4) return;
    const avg = this.qualityTime / this.qualityFrames;
    this.qualityTime = 0;
    this.qualityFrames = 0;
    if (avg <= 1 / 40) { this.qualityStep = 2; return; }      // smooth enough: stop checking
    const webgl = this.game.renderer.instance;
    if (this.bloom.enabled) {
      this.bloom.enabled = false;
      this.qualityStep = 1;
    } else {
      webgl.setPixelRatio(Math.min(webgl.getPixelRatio(), 0.8));
      // (the composer keeps its own copy of the pixel ratio: without this the step did nothing)
      this.composer.setPixelRatio(webgl.getPixelRatio());
      this.composer.setSize(window.innerWidth, window.innerHeight);
      const pr = webgl.getPixelRatio();
      this.fxaa.material.uniforms.resolution.value.set(1 / (window.innerWidth * pr), 1 / (window.innerHeight * pr));
      this.qualityStep = 2;
    }
  }
}

import { playClip, preloadAudio, CLIPS } from '../audio/AudioCache.js';
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
import { precompile } from '../core/precompile.js';
import { mergeStatic } from '../core/mergeStatic.js';
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
import { VisorAria } from '../level3/VisorAria.js';
import { buildHallClues } from './HallClues.js';
import { Gates } from './Gates.js';
import { KeypadUI } from '../ui/KeypadUI.js';
import { Garden } from './Garden.js';
import { Robot } from '../entities/Robot.js';
import { PlayerStats, MAX_INTEGRITY } from '../player/PlayerStats.js';
import { HUD } from '../ui/HUD.js';
import { FightHelp } from '../ui/FightHelp.js';
import { Readables } from './Readables.js';
import { Flashback } from './Flashback.js';
import { LogHead, tallyInRoom } from './LogHead.js';
import { Flashback3D } from './Flashback3D.js';
import { Inventory } from '../ui/Inventory.js';
import { sleep, pauseClock } from '../core/PauseClock.js';
import { vossSays, vossVoice } from '../audio/VossVoice.js';
import { buildRoomProps } from './RoomProps.js';
import { codeCardCanvas } from './CodeCard.js';
import { applyBedroomShell } from './BedroomShell.js';
import { disposeScene } from '../core/disposeScene.js';
import '../ui/level2.css';
import { RoboArmHazard } from './RoboArmHazard.js';
import { FuseboxPuzzle } from './FuseboxPuzzle.js';

// Level 2, the new build: the habitat atrium (Blender/scripts/build_l2_atrium.py), shown as an
// ENVIRONMENT PREVIEW. You arrive in the lift, the doors open, and you can walk the whole space.
// No gameplay yet: that is designed and added after the environment is approved.

// The 3D flashback (Flashback3D, Flashback 2 in first person) plays when it is ready and the machine
// keeps up; the 2D one otherwise
const FLASHBACK_3D = true;
const SOLID = ['COL_', 'DOOR_'];
// what the code finds by name, moves or hides: never joined with the still meshes round it
const KEEP_SEPARATE = /^(DOOR_|LABDOOR_|ELEVATOR_|ARIA_|PT_|SPAWN_|ORG|FuseBox|COL_|Atrium_Hatch|Atrium_LiftCab|Cabin_|Door_)/;

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
const MEMORIES = ['letter', 'log-0', 'log-1', 'log-2', 'log-5', 'log-8'];   // Voss's personal logs, as one run of memories
const LAB_FILES = ['directive', 'research', 'subjects'];            // the lab terminal
const IDLE_LINE = 50;        // seconds lingering in the bunk or the lab before ARIA's remark
const DIRECT_HIT = 15;       // a drone's dive, straight into him (health is out of 100)
const GRAZE = 5;             // a dive that only clips him
const FUSE_MISS = 8;         // a miss at Kessler's fusebox: the surge stings
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
    this.roboArmMixer = null;
    this.roboArmClip = null;
    this.roboArmAction = null;
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
    // ARIA keeps Voss in first person until she explains the damaged lighting and visor.
    this.controls.viewLocked = true;
    this._visorOn = false;
    this.controls.onViewChange = () => { this._visorOn = true; };

    const root = document.getElementById('ui-layer');
    // Voss's health (integrity), the same as in Level 1, on the same HUD
    this.player = new PlayerStats();
    this.hud = new HUD(root, { onRestart: () => this.game.restartSession() });
    this.fightHelp = new FightHelp(root);
    // everything he reads, hears or watches upstairs (the game waits while it is open)
    this.reader = new Readables(root, {
      onOpen: () => {
        game.state = 'READING';
        this.controls.instance.enabled = false;      // the view stays put behind the panel
      },
      onClose: () => {
        game.state = 'PLAYING';
        this.controls.instance.enabled = true;
      },
      onShown: (id) => this._readShown(id),
      onFinished: (id) => this._readFinished(id),
      // a video log's live head: Voss, copied from the one the player walks around as
      head: (name) => (name === 'voss' ? LogHead.fromPlayer(this.controls.character, this.atrium) : null)
    });
    this.flashback = new Flashback(root);
    // the full flashback, in 3D (Kessler, through Voss's eyes); the 2D one above stays as the fallback
    this.flashback3d = new Flashback3D(root, null, this);
    // for poking at from the dev console, e.g. __level2.reader.read('log-8') or __level2.flashback.play()
    if (import.meta.env.DEV) window.__level2 = this;
    // the inventory (I): Kessler's card and the hatch code go in it
    this.inventory = new Inventory(root);
    this.inventory.statusFor.hatchcode = () => HATCH_CODE.split('').join(' ');
    // the hatch code, kept in the top left from the moment he finds it until the hatch is open:
    // Kessler's card itself, as he picked it up
    this.codeNote = document.createElement('div');
    this.codeNote.id = 'code-note';
    this.codeNote.innerHTML = '<div class="cn-label">KESSLER\'S CARD</div>';
    const card = new Image();
    card.className = 'cn-paper';
    card.alt = 'HATCH 4 OVERRIDE: ' + HATCH_CODE.split('').join('-');
    card.src = codeCardCanvas(HATCH_CODE).toDataURL();
    this.codeNote.appendChild(card);
    document.body.appendChild(this.codeNote);
    this.loadingEl = document.createElement('div');
    this.loadingEl.id = 'level-loading';
    this.loadingEl.className = 'visible';
    this.loadingEl.innerHTML = '<div class="loading-title">LEVEL 2</div><div class="loading-sub">The habitat deck</div><div class="loading-bar"><div></div></div>';
    root.appendChild(this.loadingEl);

    document.addEventListener('click', () => {
      if (this.disposed) return;
      if (game.state === 'PLAYING' && !this.controls.instance.isLocked) this.controls.lock();
    });

    // E uses what Voss is looking at; Enter skips a line of dialogue
    this._wpInfo = { x: 0, y: 0, angle: 0, onScreen: true, label: '', distance: 0 };
    this._head = new THREE.Vector3();
    this._talkToken = 0;
    window.addEventListener('keydown', (e) => {
      if (this.disposed) return;
      if (this.fuseboxPuzzle?.isOpen) return;
      if (this.keypad?.isOpen) {
        if (e.code === 'Escape') this._closeKeypad();
        return;
      }
      if (this.reader?.isOpen) {
        if (e.code === 'Enter' || e.code === 'Escape' || e.code.startsWith('Arrow')) e.preventDefault();
        this.reader.key(e);
        return;
      }
      if (game.state === 'INVENTORY') {
        if (e.code === 'KeyI' || e.code === 'Escape') this._closeInventory();
        return;
      }
      if (game.state !== 'PLAYING' || !this.ready) return;
      if (e.code === 'KeyI' && !e.repeat) {
        this._openInventory();
        return;
      }
      if (e.code === 'Digit9' && !e.repeat) this._debugUnlockKessler(); // TEMP DEBUG
      if (e.code === 'KeyE' && !e.repeat) this.interact?.use();
      if (e.code === 'Enter') this.skipLine();
      if (e.code === 'KeyQ' && !e.repeat && this.garden) {
        this.garden.freeze();
        this.garden.freezeHeld = true;
      }
    });
    // holding Q keeps asking ARIA: she freezes the moment one is wet enough
    document.addEventListener('keyup', (e) => {
      if (this.disposed) return;
      if (e.code === 'KeyQ' && this.garden) this.garden.freezeHeld = false;
    });
    // the left mouse button sprays the garden's water pipe while he holds it; with nothing in
    // hand Voss just reaches out, so the click is acknowledged
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || this.disposed) return;
      this.garden?.audio.start();
      if (game.state !== 'PLAYING' || !this.controls.instance.isLocked) return;
      if (this.garden?.holding) this.garden.spraying = true;
      else this.controls.character.reach();
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
        if (!this.story || this.disposed) return;
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
      // the still meshes that share a material are drawn as one (core/mergeStatic.js)
      for (const model of [this.atrium, this.lab]) if (model) mergeStatic(model, KEEP_SEPARATE);
      // behind the title: only the lift he arrives in; the rest of the level is readied while ARIA
      // talks to him in it, its doors shut (_readyWorld)
      const held = this._holdWorld();
      await this._precompile();
      this.ready = true;
      this.game.applySettings?.();
      this.loadingEl.classList.remove('visible');
      this.worldReady = this._readyWorld(held);     // (Flashback 3D waits for it: the rooms are in the scene)
      this.worldReady.then(() => this._setUpRooms());
      game.ui.showToast('WASD to move, Space to jump, E to use things, V to switch camera.', 7000);
      // ?flashback in the address (with ?level=2): Kessler's flashback plays as soon as the level is
      // in, for testing it (?flashback=2d: the drawn one)
      const fb = new URLSearchParams(window.location.search).get('flashback');
      if (fb !== null) this._testFlashback(fb === '2d');
      // ?arm (with ?level=2): straight to Kessler's room, the garden and the rooms before it done,
      // the arm swinging and him standing at its fusebox (for testing the breaker puzzle)
      if (new URLSearchParams(window.location.search).has('arm')) this.worldReady.then(() => this._testArm());
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
      // the 3D flashback draws itself instead of the level while it plays
      if (this.flashback3d?.running) {
        this.flashback3d.render(webgl);
        return;
      }
      if (this.aria && (this.frame++ & 1) === 0) this.aria.renderHead(webgl);
      // a video log's live head, drawn into the reader's screen before the frame covers it
      this.reader?.liveHead?.render(webgl);
      this.composer.render();
      this.visorAria?.render(webgl);
    };
    window.addEventListener('resize', () => {
      if (this.disposed) return;
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
    model.animations = gltf.animations || [];
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
    // the bedroom shells ship as plain painted boxes: both quarters (Kessler's Cube.009, Voss's
    // crew room Cube) and the west wall closures (Kess_WallW, Voss_WallW) are finished as rooms
    // people live in: cream panels over a wood wainscot, a carpet, a soft ceiling
    applyBedroomShell(model, ['Cube009', 'Cube', 'Kess_WallW', 'Voss_WallW']);
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
      const l = new THREE.PointLight(0xffeeda, 30, 10, 1.5);
      l.intensity = 10;
      l.position.copy(room.centre);
      l.position.y -= 0.7; // offset down from ceiling panels so light illuminates ceiling, walls, and floor
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

    // Retain atrium animation mixer and find Kessler bedroom robo arm swing clip
    this.roboArmMixer = new THREE.AnimationMixer(atrium);
    const clip = atrium.animations?.find((c) => c.name === 'KesslerRoboArmSwing');
    if (clip) {
      this.roboArmClip = clip;
      this.roboArmAction = this.roboArmMixer.clipAction(clip);
      this.roboArmAction.setLoop(THREE.LoopRepeat, Infinity);
    } else {
      console.warn('[HabitatSession] Animation clip "KesslerRoboArmSwing" not found in atrium animations.');
      this.roboArmClip = null;
      this.roboArmAction = null;
    }

    // Damaging hazard: read the arm's live bone positions every frame and hurt Voss on contact
    this.roboArmHazard = new RoboArmHazard(atrium, {
      onHit: (from) => {
        if (this._restoring) return;
        playClip(CLIPS.metalHit ?? CLIPS.tech, 0.9);
        this._hurt('direct', from);
      }
    });

    // his tally on his bunk's locker, in his quarter (the logs show it growing up to Cycle 8)
    scene.add(tallyInRoom());

    // Preload the robot model so the first spawn is instant
    Robot.preload().catch((e) => console.warn('Robot preload failed:', e));

    // arrive in the lift, facing the hall (north) 
    const spawn = atrium.getObjectByName('SPAWN_Lift').getWorldPosition(new THREE.Vector3());
    this.controls.attach(this.physics, spawn.setY(spawn.y + 0.1), 0);
    // Temporary test spawn: inside Dr.Kessler's room facing into the room
    // const spawn = new THREE.Vector3(14.0, 5.65, -15.5);
    // this.controls.attach(this.physics, spawn, -2.35);
    if (lift) {
      this._placeLift(lift.scene, atrium);
    } else {
      for (const name of ['ELEVATOR_Door_L', 'ELEVATOR_Door_R']) {
        const n = atrium.getObjectByName(name);
        if (n) this.doors.push({ node: n, closed: n.position.clone(), open: n.position.clone().add(new THREE.Vector3(name.endsWith('L') ? -1.9 : 1.9, 0, 0)) });
      }
    }
    // the closed doors are solid until ARIA has finished
    this._blockLiftDoors();

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
      const door = { node, centre, closedY: node.position.y, solid: true, open: 0 };
      this._slidingDoor(door);
      this.quarterDoors.push(door);
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
    const pods = at('PT_PodDoor', 0);
    this._looked = new Set();
    preloadAudio([CLIPS.paper, CLIPS.tech, CLIPS.ding]);
    // (each with where its diamond floats: over the board's top edge, over the pod door's sign)
    this._hallClues = [
      ['board', clues.board, 0.9, 'Look at the photo board', 'chore', clues.boardTop],
      ['frame', clues.frame, 0.2, 'Look at the photo', 'photo'],
      ['ration', clues.ration, 0.2, 'Look at the tray', 'ration'],
      ['pods', pods, 1.2, 'Read the sign on the pod door', 'pods', pods?.clone().add(new THREE.Vector3(0, 0.35, 0))]
    ].filter(([, p]) => p);
    for (const [id, position, radius, label, talk] of this._hallClues) {
      const paper = id === 'board' || id === 'frame';
      this.interact.add({ id, position, radius, label, use: () => {
        if (paper) playClip(CLIPS.paper, 0.85);
        this._looked.add(id);
        this.say(talk);
      } });
    }
    // FuseBox interaction (Bedroom 2)
    const fuseBoxObj = atrium.getObjectByName('FuseBox00001') || atrium.getObjectByName('FuseBox00.001') || atrium.getObjectByName('COL_Kess_FuseBox00');
    if (fuseBoxObj) {
      const fusePos = new THREE.Box3().setFromObject(fuseBoxObj).getCenter(new THREE.Vector3());
      // Move the interaction point into the room so the wall-mounted mesh cannot block its raycast.
      fusePos.x += 0.7;
      this.fuseboxSpot = this.interact.add({
        id: 'fusebox',
        position: fusePos,
        radius: 1.0,
        reach: 3.2,
        label: () => {
          if (!this._armStarted) return 'FuseBox (no reason to touch it yet)';
          if (this.story.has('fuseSolved')) return 'FuseBox (stable)';
          return 'Use FuseBox';
        },
        use: () => {
          if (!this._armStarted) return;
          if (this.story.has('fuseSolved')) {
            this.game.ui.showToast('FUSEBOX STABLE.', 2500);
            return;
          }
          this.game.state = 'PUZZLE';
          this.controls.instance.unlock?.();
          this.game.ui.setPrompt(null);
          this.roboArmHazard.paused = true;
          this.fuseboxPuzzle.open();
        }
      });
    }

    // what holds him back (scenes 2.2 to 2.9): the stair bulkheads, the hatch and its keypad,
    // Kessler's door (it wants her card and the lab's authorisation)
    this.gates = new Gates({ scene, atrium, physics: this.physics });
    this.gates.bulkheadSpots.forEach((p, i) => this.interact.add({
      id: 'bulkhead' + i, position: p, radius: 1.4, label: 'Look through the bulkhead',
      when: () => this.gates.bulkheadsSealed, use: () => this.say('stairs')
    }));
    if (this.gates.keypadSpot) {
      const hatchLabel = () => (this.story.has('gardenCleared') ? 'Use the hatch keypad' : 'Hatch keypad (no power)');
      this.interact.add({
        id: 'hatch', position: this.gates.keypadSpot, radius: 0.35, reach: 2.2,
        label: hatchLabel, when: () => !this.story.has('hatchOpen'), use: () => this._useHatch()
      });
      // the hatch itself works too (the keypad is on its deck plate)
      if (this.gates.hatchCentre) {
        this.interact.add({
          id: 'hatchSlab', position: this.gates.hatchCentre.clone().add(new THREE.Vector3(0, 0.15, 0)), radius: 1.0, reach: 2.8,
          label: hatchLabel, when: () => !this.story.has('hatchOpen'), use: () => this._useHatch()
        });
        // once it is open: down into the shaft, and on to Level 3
        this.interact.add({
          id: 'shaft', position: this.gates.hatchCentre.clone().add(new THREE.Vector3(0, 0.15, 0)), radius: 1.0, reach: 2.8,
          label: 'Climb down into the shaft', when: () => this.gates.hatchIsOpen, use: () => this._climbDown()
        });
      }
    }
    // the things to read upstairs (scenes 2.6 to 2.8)
    this._buildReadables(scene, lab);

    this.keypad = new KeypadUI({ onSubmit: (code) => this._hatchCode(code), onCancel: () => this._closeKeypad() });
    this.keypad.root.querySelector('.keypad-brand').textContent = 'MAINTENANCE HATCH 4';
    this.keypad.root.querySelector('.keypad-instruction').textContent = 'EMERGENCY OVERRIDE: CREW LEADER KEY (DR. E. KESSLER)';
    this.fuseboxPuzzle = new FuseboxPuzzle(document.getElementById('ui-layer'), {
      onSolved: () => {
        this.story.set('fuseSolved');
        const action = this.roboArmAction;
        action?.fadeOut(0.5);
        setTimeout(() => action?.stop(), 500);
        this.roboArmHazard?.stop();
        this.game.ui.showToast('ARM POWER CUT. LOGS UNLOCKED.', 4000);
      },
      onFailed: () => this.game.ui.showToast('FUSE SEQUENCE FAILED. TRY AGAIN.', 3500),
      // a miss: the surge stings him (out of health, he is restored and the panel shuts)
      onMiss: () => {
        this.hud.flash();
        if (this.player.damage(FUSE_MISS)) {
          this.fuseboxPuzzle.close();
          this._restoreFromBackup();
        }
      },
      onClose: () => {
        if (this.disposed) return;
        this.game.state = 'PLAYING';
        if (this.roboArmHazard) this.roboArmHazard.paused = false;
      }
    });
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
      onPipe: () => this.story.set('pipeTaken'),
      onHurt: (kind, from) => this._hurt(kind, from),
      onCleared: () => this.story.set('gardenCleared'),
      toast: (text) => this.game.ui.showToast(text, 6500)
    });
    this.story.targets.pipe = this.garden.pipeSpot;
    this.interact.add({
      id: 'pipe', position: this.garden.pipeSpot, radius: 0.5, label: 'Pull out the water pipe',
      when: () => !this.garden.holding && this.garden.state !== 'done', use: () => this.garden.takePipe()
    });

    this._addAriaScreens([atrium, lab]);
    this._setUpLab(lab);

    // the sea outside the big window: the glass runs 62 to 118 degrees (4.2 m tall), in four bays
    // split by posts at 76, 90 and 104: one looping video, a different part of it in each bay
    this.sea = new VideoWindow({
      src: './assets/video/sea_loop.mp4', radius: 17.9, wallRadius: 17,
      bays: [[62, 76], [76, 90], [90, 104], [104, 118]], bottom: 0.8, height: 4.2
    });
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
    this._liftParts = [surround];

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
      this._liftParts?.push(parts.bezel);
      this.liftScreen = parts.screen;
    }
    this.liftStripMat = lift.getObjectByName('Cabin_LightStrip')?.material || null;
    this.lift = lift;
  }

  // A quarter door made to look and open like the lab's: two panels (a slab, a glowing blue edge
  // strip and an orange line, in the lab doors' own materials) that slide apart sideways into the
  // wall. The model's single slab is hidden; its collider stays until the doors have opened.
  _slidingDoor(d) {
    const lab = this.labDoors[0]?.node;
    if (!lab || lab.children.length < 3) return;
    const [slabMat, glowMat, accentMat] = lab.children.map((c) => c.material);
    const box = new THREE.Box3().setFromObject(d.node);
    const c = box.getCenter(new THREE.Vector3());
    const height = box.max.y - box.min.y;
    const n = new THREE.Vector3(c.x, 0, c.z).normalize();              // out of the hall, through the door
    const width = 4.24, pw = width / 2, depth = 0.2;
    const group = new THREE.Group();
    group.name = d.node.name + '_sliding';
    group.position.set(c.x, box.min.y, c.z);
    group.rotation.y = Math.atan2(n.x, n.z);                           // local +z is out of the hall
    const mesh = (w, h, dd, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), mat);
      m.position.set(x, y, z);
      return m;
    };
    d.panels = [];
    for (const s of [-1, 1]) {
      const panel = new THREE.Group();
      const inner = -s * pw / 2;                                       // the edge that meets the other panel
      const face = -(depth / 2 + 0.02);                                // the hall side
      panel.add(mesh(pw, height, depth, slabMat, 0, height / 2, 0));
      panel.add(mesh(0.06, height - 0.8, 0.04, glowMat, inner + s * 0.05, height / 2, face));
      panel.add(mesh(pw * 0.667, 0.08, 0.04, accentMat, 0, height - 0.84, face));
      panel.position.set(s * pw / 2, 0, 0);
      group.add(panel);
      d.panels.push({ obj: panel, s });
    }
    d.pw = pw;
    d.node.visible = false;
    this.game.scene.add(group);
  }

  // An invisible wall across the closed lift doors (the doors themselves are not solid while they
  // can still slide): he cannot step out before ARIA has told him about the drones
  _blockLiftDoors() {
    if (!this.doors.length) return;
    const box = new THREE.Box3();
    for (const d of this.doors) {
      d.node.updateWorldMatrix(true, true);
      box.expandByObject(d.node);
    }
    const size = box.getSize(new THREE.Vector3());
    const wall = new THREE.Mesh(new THREE.BoxGeometry(Math.max(size.x, 0.2), Math.max(size.y, 2.5), Math.max(size.z, 0.3)));
    box.getCenter(wall.position);
    this._liftGate = this.physics.addStaticObject(wall);
  }

  // In the lift (scene 2.1): ARIA's welcome, then her warning about the drones with the fight's
  // controls on screen. The doors stay shut until she has finished (Enter skips her lines).
  async _arrive() {
    await this.say('arrival');
    await this.say('visor');
    this.controls.viewLocked = false;
    this._fightHelpOn = true;
    await this.say('briefing');
    this._arrivalDone = true;
  }

  // Voss is out of the lift: its doors shut behind him and its lights die (it is flooded below)
  _shutLift() {
    this.liftShut = true;
    playClip(CLIPS.ding, 0.8);
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
    this._ariaScreens = screens;
    this.aria = new AriaManager(this.game.scene);
    this.visorAria = new VisorAria(this);
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

  // In the lift, doors shut, he sees only the lift: everything else (the hall, the garden, the
  // rooms upstairs) is taken out of the scene for now, so the title only waits for the lift's
  // shaders. (The lights stay: they change every shader. So does anything with a light in it.)
  _holdWorld() {
    const scene = this.game.scene;
    const keep = new Set([this.lift, this.controls.body, this.controls.character?.viewModel, this._ariaScreens, ...(this._liftParts || [])]);
    const held = [];
    for (const c of [...scene.children]) {
      if (keep.has(c) || c.isLight || c.isCamera) continue;
      let lit = false;
      c.traverse((o) => { if (o.isLight) lit = true; });
      if (lit) continue;
      scene.remove(c);
      held.push(c);
    }
    return held;
  }

  // ...and readied while ARIA talks: its shaders compiled (off the main thread), its textures sent
  // to the graphics card a few a frame (update(): _warmTextures), then it is put back, behind the
  // shut doors, and its shadows drawn. The doors open only once this is done.
  async _readyWorld(held) {
    if (held.length && !this.disposed) {
      const g = new THREE.Group();
      for (const o of held) g.add(o);
      const webgl = this.game.renderer.instance;
      await precompile(webgl, this.game.scene, this.game.camera.instance, this.composer.renderTarget1, { root: g });
      const textures = new Set();
      g.traverse((o) => {
        for (const m of [].concat(o.material || [])) {
          for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
          for (const u of Object.values(m.uniforms || {})) if (u?.value?.isTexture) textures.add(u.value);
        }
      });
      await new Promise((resolve) => {
        this._texQueue = [...textures];
        this._texDone = resolve;
      });
      if (this.disposed) return;
      for (const o of [...g.children]) this.game.scene.add(o);
      webgl.shadowMap.needsUpdate = true;
    }
    this._worldReady = true;
  }

  _warmTextures() {
    if (!this._texQueue) return;
    const webgl = this.game.renderer.instance;
    for (let i = 0; i < 2 && this._texQueue.length; i++) webgl.initTexture(this._texQueue.shift());
    if (!this._texQueue.length) {
      this._texQueue = null;
      this._texDone?.();
    }
  }

  async _precompile() {
    await precompile(this.game.renderer.instance, this.game.scene, this.game.camera.instance, this.composer.renderTarget1);
    this.game.renderer.instance.shadowMap.needsUpdate = true;   // draw the shadows once (nothing casting them moves)
    this.composer.render();
  }

  update(delta) {
    if (!this.ready || !this.controls.ready) return;
    if (this.game.state === 'PUZZLE') {
      const dt = Math.min(delta, 0.05);
      this.roboArmMixer?.update(dt);
      this.fuseboxPuzzle?.update(dt);
      this._perf(delta, false);
      return;
    }
    if (this.game.state === 'PAUSED' || this.game.state === 'INVENTORY') {
      this.garden?.hushRobots?.();
      this._perf(delta, false);
      return;
    }
    const g = this.game;
    const dt = Math.min(delta, 0.05);
    const playing = g.state === 'PLAYING';
    if (this.roboArmMixer) this.roboArmMixer.update(dt);
    this._cullRooms();
    // Bones are current after mixer.update; test contact now
    if (playing) this.roboArmHazard?.update(dt, this.controls.position);
    this._warmTextures();
    // dropping into the shaft: the view sinks into the hole while the screen fades
    if (this._drop) this._updateDrop(dt);
    // stepping into the open hatch drops him in too (once the lid is all the way open)
    if (playing && this.gates?.hatchIsOpen && !this._leaving) {
      const c = this.gates.hatchCentre, q = this.controls.position;
      if (Math.hypot(q.x - c.x, q.z - c.z) < 0.6) this._climbDown();
    }
    if (playing || g.state === 'WAKING') this.controls.update(dt, playing);
    // the lift: ARIA welcomes Voss on the way down, the doors open once she has finished, and
    // they shut behind him once he is a step out (scene 2.1)
    const p = this.controls.position;
    if (playing && !this._arrivalStarted) {
      this._arrivalStarted = true;
      this._arrive();
    }
    if (this._arrivalDone && this._worldReady && !this.liftShut && this.doorOpen < 1) {
      if (this.doorOpen === 0) playClip(CLIPS.ding, 0.9);      // (the lift's ding as its doors open)
      this.doorOpen = Math.min(1, this.doorOpen + dt / 1.6);
      this._setLiftDoors(this.doorOpen);
      // open wide enough to walk through: the invisible wall goes
      if (this._liftGate && this.doorOpen > 0.7) {
        this.physics.world.removeCollider(this._liftGate, true);
        this._liftGate = null;
      }
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
      // Flashback 2 scripts Kessler's door while it is running. A stale `false` left in
      // flashbackDoors must not override the normal proximity trigger after the scene ends.
      const inFlashback = d.node.name === 'DOOR_KESSLER' && this.flashback3d?.running;
      const approach = d.node.name === 'DOOR_KESSLER' ? this.story.targets.kessler : d.centre;
      const near = inFlashback
        ? (this.flashbackDoors?.[d.node.name] ?? false)
        : (allowed && this.controls.position.distanceTo(approach) < 6);
      d.open = THREE.MathUtils.clamp(d.open + (near ? dt : -dt) / (d.panels ? 0.7 : 1.2), 0, 1);
      const t = d.open * d.open * (3 - 2 * d.open);
      if (d.panels) for (const pn of d.panels) pn.obj.position.x = pn.s * (d.pw / 2 + d.pw * t);
      else d.node.position.y = d.closedY + 3.4 * t;
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
      this.garden.update({
        dt, feet: p, head: this._head, playing, player: this.controls.character,
        canWake: this._arrivalDone && this.story.has('leftLift') && !this.story.has('gardenCleared')
      });
      // while he holds the nozzle (it points where the camera looks) his body turns that way too
      this.controls.aimFacing = this.garden.holding;
      this.garden.updateTease(dt);
      // a drone glimpsed far across the hall the first time he walks into it (scene 2.2)
      if (playing && !this._teased && this.story.has('leftLift') && !this.story.has('dronesWoken') && p.z < 9) {
        this._teased = true;
        this.garden.tease(new THREE.Vector3(-8, 4.2, -8), new THREE.Vector3(7, 4.2, -11), 5);
        setTimeout(() => this.say('tease'), 1200);
      }
      // the fight's music (level2-fight.mp3) and a tenser mood, harder the more drones are up
      const fighting = this.garden.active;
      this.musicMood = fighting ? 'pressure' : null;
      this.musicTension = fighting ? 0.6 + 0.3 * Math.min(1, this.garden.alive / 4) : 0;
    }
    this.hud.setVisible(playing || g.state === 'KEYPAD');
    this.hud.update(this.player);
    if (playing) this.player.playSeconds += dt;
    this.codeNote.classList.toggle('visible', this.story.has('codeFound') && !this.story.has('hatchOpen') &&
      (playing || g.state === 'KEYPAD'));
    this.reader.update(dt);
    this._idleLines(dt, playing, p);
    for (const k of this._markers || []) {
      const show = !k.done() && k.m.position.distanceToSquared(p) < k.range2;
      k.m.visible = show;
      if (show) {
        k.m.rotation.y += dt * 1.6;
        k.m.position.y = k.y + Math.sin(performance.now() * 0.0025 + k.phase) * 0.04;
      }
    }
    // the fight's controls, from ARIA's warning in the lift until the garden is clear
    const helpOn = this._fightHelpOn && playing && this.garden && this.garden.state !== 'done';
    this.fightHelp.setVisible(!!helpOn);
    if (helpOn) this.fightHelp.update(this.garden.holding, this.garden.coldSnap, this.garden.active);
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
    this.visorAria?.update(dt, this._visorOn && playing);
    g.reticle.classList.toggle('visible', this.controls.view === 'first' && g.state !== 'READING');
    if (playing && !this.story.has('leftLift') && p.z < LIFT_FRONT_Z) this.story.set('leftLift');
    this._guide(playing);
    this._perf(delta, playing);
  }

  // ARIA and Voss speak: a list of line ids, or the name of one of the exchanges in
  // Level2Lines.js. The lines play one after another: Voss's as text that stays up for a reading
  // time, ARIA's with her voice (or a subtitle until it is recorded), her face's expression and
  // her colour. Starting a new exchange cuts the current one short. Resolves true when finished,
  // false when cut short.
  async say(talk) {
    if (this.disposed) return false;
    const ids = Array.isArray(talk) ? talk : TALKS[talk];
    if (!ids) {
      console.warn('Level 2: no exchange called "' + talk + '".');
      return false;
    }
    const ui = this.game.ui;
    const token = ++this._talkToken;
    if (this.aria.speaking) this.aria.skip();
    vossVoice.stop();
    for (const id of ids) {
      if (token !== this._talkToken) return false;
      const line = LINES[id];
      if (!line) {
        console.warn('Level 2: no line "' + id + '".');
        continue;
      }
      if (line.who === 'voss') {
        await vossSays(ui, line.text, line.thought ? null : line.clip || id, { thought: line.thought });
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
    if ((flag === 'cardTaken' || flag === 'labDone') && this._kesslerUnlocked()) {
      this._startRoboArm();
    }
    // on the way to Kessler's room: load her for the flashback ahead of time
    if (FLASHBACK_3D && (flag === 'cardTaken' || flag === 'labDone')) {
      this.flashback3d.player = this.controls.character;
      this.flashback3d.preload(this.game.renderer.instance);
    }
    if (flag === 'gardenCleared') {
      this.garden?.end();
      this._powerReturns();
    }
    if (flag === 'pipeTaken' && !this.garden?.holding) this.garden?.takePipe();   // (the debug key)
    if (flag === 'codeFound') {
      this.inventory.add('hatchcode');
      this.game.ui.showToast('THE HATCH CODE IS SHOWN TOP LEFT, AND KEPT IN YOUR INVENTORY (I)', 6000);
    }
    if (flag === 'hatchOpen') {
      this.gates?.openHatch();
      this._downTheHatch();
    }
  }

  // The last drone is down and the pumps restart (end of scene 2.3): a stutter and a deep hit,
  // the atrium's light comes back and the stair bulkheads sink into the floor
  _powerReturns() {
    const g = this.game;
    g.mood?.flicker(0.9);
    setTimeout(() => {
      this._restoreTarget = 1;
      this.gates?.openBulkheads();
      this.gates?.setKeypadPowered(true);
      g.ui.showToast('POWER RESTORED. THE STAIR BULKHEADS ARE OPEN.', 5000);
    }, 700);
  }

  // ---------------------------------------------------------
  // Upstairs: the bunk's logs, the corkboard, Voss's personal log, the lab's
  // terminal, Kessler's final log and the code card (scenes 2.6 to 2.8)
  // ---------------------------------------------------------
  _buildReadables(scene, lab) {
    const spots = buildRoomProps(scene, { code: HATCH_CODE });
    for (const body of spots.lockerBodies) this.physics.addStaticObject(body);
    const r = this.reader;
    const add = (id, position, radius, label, use, when) => this.interact.add({ id, position, radius, label, use, when, reach: 2.2 });
    const gateKesslerRead = (read) => () => {
      if (this._armStarted && !this.story.has('fuseSolved')) {
        this.game.ui.showToast("LOCKED: CUT THE ARM'S POWER AT THE FUSEBOX FIRST.", 3500);
        return;
      }
      read();
    };
    add('bunkLogA', spots.bunkLogA, 0.25, 'Play the crew log', () => r.read('bunkLogA'));
    add('bunkLogB', spots.bunkLogB, 0.25, 'Play the crew log', () => r.read('bunkLogB'));
    add('corkboard', spots.corkboard, 0.55, 'Look at the corkboard', () => r.read('rota', () => this.say('corkboard')));
    add('personalLog', spots.personalLog, 0.3,
      () => (this.story.has('logWatched') ? 'Watch the memories again' : "Watch Voss's personal logs"),
      () => r.montage(MEMORIES, () => this._memoriesWatched()));
    // the lab terminal is the workstation on the lab's west wall
    const screen = lab.getObjectByName('PT_LabScreen_0');
    if (screen) {
      add('labTerminal', screen.getWorldPosition(new THREE.Vector3()), 0.45, 'Use the terminal',
        () => r.terminal('B-LAB: RESTRICTED DIRECTORY', LAB_FILES));
    }
    add('kesslerLog', spots.kesslerLog, 0.3, 'Play the final log', gateKesslerRead(() => r.read('kesslerLog')));
    add('codeCard', spots.codeCard, 0.15, 'Read the card',
      gateKesslerRead(() => (this._kesslerDone ? r.read('codeCard') : r.read('codeCard', () => this._kesslerScene()))),
      () => r.seen.has('kesslerLog'));       // her log first: it is what leads him to the card
    this._idle = { bunk: 0, lab: 0, kessler: 0 };
    // where the objective's marker points inside the rooms
    const t = this.story.targets;
    t.personalLog = spots.personalLog;
    t.labTerminal = screen ? screen.getWorldPosition(new THREE.Vector3()) : null;
    t.kesslerLog = spots.kesslerLog;
    t.codeCard = spots.codeCard;
    this.story.seen = (id) => r.seen.has(id);
    // a small glowing diamond floats over everything not read yet, so nothing is missed
    const seen = (id) => () => r.seen.has(id);
    const kesslerLocked = () => this._armStarted && !this.story.has('fuseSolved');
    this._markers = [
      [spots.bunkLogA, seen('bunkLogA')], [spots.bunkLogB, seen('bunkLogB')], [spots.corkboard, seen('rota')],
      [spots.personalLog, () => this.story.has('logWatched')],
      [t.labTerminal, () => this.story.has('labDone')],
      [spots.kesslerLog, () => kesslerLocked() || seen('kesslerLog')()],
      [spots.codeCard, () => kesslerLocked() || seen('codeCard')()],
      [this.fuseboxSpot?.position, () => !this._armStarted || this.story.has('fuseSolved')],
      // and the hall's optional clues, until he has looked at each (seen from further off: the hall is big)
      ...this._hallClues.map(([id, p, , , , over]) => [over || p, () => this._looked.has(id), 16])
    ].filter(([p]) => p).map(([p, done, range = 10], i) => {
      const m = new THREE.Mesh(this._markerGeo ??= new THREE.OctahedronGeometry(0.085), this._markerMat ??= new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.5, 1.8) }));
      m.position.copy(p).add(new THREE.Vector3(0, 0.32, 0));
      m.scale.set(1, 1.5, 1);
      scene.add(m);
      return { m, y: m.position.y, done, phase: i, range2: range * range };
    });
  }

  // Scene 2.8: he reads the code card. The full flashback plays (Flashback 2: Kessler at the
  // workbench in this room, Voss arguing for the work, she walks out to the engine room), then ARIA: "You weren't
  // supposed to find that so soon", Voss's "What did I do?", the snap (the room goes red), the
  // silence and the lights coming back slowly, her apology. Only then does the code count.
  async _kesslerScene() {
    this._kesslerDone = true;
    const g = this.game;
    g.state = 'FLASHBACK';
    this.garden?.audio.hiss(false);
    await this._dizzy();
    // the 3D flashback if it is ready and the machine keeps up (normal play above ~24 fps), else 2D
    const slow = this.frameAverage > 1 / 24;
    if (FLASHBACK_3D && this.flashback3d.ready && !slow) {
      document.body.classList.add('fb3d');
      await this.flashback3d.play();
      document.body.classList.remove('fb3d');
    } else {
      await this.flashback.play();
    }
    this.flashback3d.dispose();      // (it plays once)
    g.state = 'PLAYING';
    await sleep(700);
    await this.say('kessler');
    this.story.set('codeFound');
  }

  // Before the flashback: the card in his hand, his head starts to pound. Through his eyes the room
  // sways and blurs, goes dark and comes back twice, and on the third it stays dark: the memory.
  async _dizzy() {
    const g = this.game, cam = g.camera.instance;
    const canvas = g.renderer.instance.domElement;
    const veil = document.createElement('div');
    veil.style.cssText = 'position:fixed;inset:0;z-index:18;pointer-events:none;opacity:0;' +
      'background:radial-gradient(ellipse at center, rgba(0,0,0,0) 15%, rgba(0,0,0,0.92) 70%, #000 100%)';
    document.body.appendChild(veil);
    g.ui.hideDialogue();
    const said = vossSays(g.ui, 'Ah... my head.', 'fb1-voss-head', { readMs: 2200 });
    // [time, how dark (0 clear, 1 black), blur px]: dark at the edges, a blink, a deeper one, black
    const keys = [[0, 0, 0], [0.8, 0.45, 3], [1.2, 0.15, 2], [2.0, 0.75, 6], [2.4, 0.3, 4], [3.3, 1, 10], [3.8, 1, 10]];
    const yaw0 = cam.rotation.y, pitch0 = cam.rotation.x;
    const t0 = performance.now();
    await new Promise((resolve) => {
      const step = () => {
        const t = (performance.now() - t0) / 1000;
        let i = 1;
        while (i < keys.length - 1 && t > keys[i][0]) i++;
        const [ta, da, ba] = keys[i - 1], [tb, db, bb] = keys[i];
        const k = THREE.MathUtils.smoothstep(t, ta, tb);
        veil.style.opacity = (da + (db - da) * k).toFixed(3);
        canvas.style.filter = `blur(${(ba + (bb - ba) * k).toFixed(1)}px)`;
        // (the view sways and sags as his balance goes)
        const sway = Math.min(1, t / 1.5);
        cam.rotation.order = 'YXZ';
        cam.rotation.z = Math.sin(t * 1.7) * 0.06 * sway;
        cam.rotation.y = yaw0 + Math.sin(t * 1.1) * 0.05 * sway;
        cam.rotation.x = pitch0 - 0.12 * sway;
        if (t < keys[keys.length - 1][0]) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    await said;
    g.ui.hideDialogue();
    canvas.style.filter = '';
    cam.rotation.set(pitch0, yaw0, 0);
    // the black hangs on over the start of the flashback, then lifts
    setTimeout(() => { veil.style.transition = 'opacity 0.8s'; veil.style.opacity = '0'; }, 300);
    setTimeout(() => veil.remove(), 1300);
  }

  // The flashback alone, straight away (?flashback in the address): the 3D one, or the drawn one
  // when asked for (flat) or when Kessler's model fails to load
  async _testFlashback(flat) {
    if (!flat) {
      await this.controls.character.whenReady;
      this.flashback3d.player = this.controls.character;
      await this.flashback3d.preload(this.game.renderer.instance);
    }
    const g = this.game;
    g.state = 'FLASHBACK';
    if (!flat && this.flashback3d.ready) {
      document.body.classList.add('fb3d');
      await this.flashback3d.play();
      document.body.classList.remove('fb3d');
    } else {
      await this.flashback.play();
    }
    if (import.meta.env.DEV) console.info('Flashback 2:', this.flashback3d.stats);
    this.flashback3d.dispose();
    g.state = 'PLAYING';
  }

  // The personal logs have played through, as one run of memories ending on Cycle 8 ("take the
  // card"). He has Kessler's card now (it was in his own locker), Voss recognises the handwriting,
  // and ARIA breaks in.
  _memoriesWatched() {
    const firstWatch = this.story.set('logWatched');
    if (this.story.set('cardTaken')) {
      this.inventory.add('card');
      this.game.ui.showToast("DR. KESSLER'S ACCESS CARD ADDED TO YOUR INVENTORY (I)", 6000);
    }
    if (firstWatch) setTimeout(() => this.say([...TALKS.letter, ...TALKS.bunkInterrupt]), 800);
  }

  // an entry was opened: the lab's first file gets ARIA's longest pause
  _readShown(id) {
    if (id === 'directive' && !this._saidLabFiles) {
      this._saidLabFiles = true;
      this.say('labFiles');
    }
  }

  // an entry was read or played to the end
  _readFinished(id) {
    if (id === 'subjects' && !this._saidCycle9) {
      this._saidCycle9 = true;
      this.say('cycle9');
    }
    if (LAB_FILES.every((f) => this.reader.seen.has(f))) this.story.set('labDone');
  }

  // ARIA's remarks when he lingers: in the bunk without watching the logs, in the lab without
  // using the terminal (once each)
  _idleLines(dt, playing, p) {
    if (!playing || !this._idle) return;
    const inLab = p.y > 4.5 && p.z < -17.3 && Math.abs(p.x) < 7;
    if (this.story._inBunk(p) && !this.story.has('logWatched')) this._idle.bunk += dt;
    if (inLab && !this.reader.seen.has('directive')) this._idle.lab += dt;
    if (this._idle.bunk > IDLE_LINE && !this._idle.bunkSaid && !this._talking()) {
      this._idle.bunkSaid = true;
      this.say('bunkIdle');
    }
    if (this.story._inKessler(p) && this.story.has('codeFound')) this._idle.kessler += dt;
    if (this._idle.kessler > IDLE_LINE && !this._idle.kesslerSaid && !this._talking()) {
      this._idle.kesslerSaid = true;
      this.say('kesslerIdle');
    }
    if (this._idle.lab > IDLE_LINE && !this._idle.labSaid && !this._talking()) {
      this._idle.labSaid = true;
      this.say('labIdle');
    }
  }

  // A drone's dive: a direct hit knocks him back; at zero ARIA restores him from backup
  _hurt(kind, from) {
    if (this._restoring) return;
    this.hud.flash();
    if (kind === 'direct' && from) this.controls.knockback?.(from, 6);
    if (this.player.damage(kind === 'direct' ? DIRECT_HIT : GRAZE)) this._restoreFromBackup();
  }

  // (a life spent; with none left, the level starts over)
  _restoreFromBackup() {
    this._restoring = true;
    if (!this.player.useRestore()) {
      this.game.sessionGameOver(this.hud, this.player);
      return;
    }
    this.hud.showDeath('BACKUP RESTORED', `RESTORED: CYCLE 9   |   Lives left: ${this.player.restores}`);
    setTimeout(() => {
      this.hud.hideDeath();
      this.player.integrity = MAX_INTEGRITY;
      // back at the edge of the garden, facing it
      this.controls.teleport?.(new THREE.Vector3(4, 0.1, -2));
      this._restoring = false;
    }, 1800);
  }

  // Room culling: what is inside the upstairs rooms (the bunk room, Kessler's room, the lab) is only
  // drawn when he is upstairs and near that room. From the hall their walls hide them anyway, and
  // drawing them cost about 40% of the frame's draw calls (measured: 329 -> 197 looking across the
  // hall). Only things wholly inside a room are taken, and only ones that were showing. A room's
  // shell stays: its doors, and anything big (walls, floor, ceiling), so a doorway never shows a
  // hole through to the sky while its room is hidden.
  _setUpRooms() {
    const rooms = [
      { min: [17.0, 4.6, -5.8], max: [26.2, 99, 3.3] },     // the crew bunk room
      { min: [8.0, 4.6, -22.4], max: [20.6, 99, -9.8] },    // Kessler's room
      { min: [-7.3, 4.2, -99], max: [7.3, 99, -17.0] }      // the lab
    ].map((r) => ({ box: new THREE.Box3(new THREE.Vector3(...r.min), new THREE.Vector3(...r.max)), meshes: [], shown: true }));
    const b = new THREE.Box3(), size = new THREE.Vector3();
    const isDoor = (m) => { for (let o = m; o; o = o.parent) if (/door/i.test(o.name)) return true; return false; };
    const claim = (m, room) => {
      if (!m.visible || isDoor(m)) return;
      if (b.setFromObject(m).getSize(size).x > 2.5 || size.y > 2.5 || size.z > 2.5) return;   // (the shell)
      room.meshes.push(m);
    };
    this.game.scene.traverse((m) => {
      if (!m.isMesh || m.isSkinnedMesh) return;
      b.setFromObject(m);
      if (b.isEmpty()) return;
      const room = rooms.find((r) => r.box.containsBox(b));
      if (room) claim(m, room);
    });
    // the lab's own model is all lab
    this.lab?.traverse((m) => { if (m.isMesh && !rooms[2].meshes.includes(m)) claim(m, rooms[2]); });
    this._rooms = rooms;
    this._roomNear = new THREE.Box3();
  }

  _cullRooms() {
    if (!this._rooms) return;
    const p = this.controls.position;
    const upstairs = p.y > 3.0;
    for (const r of this._rooms) {
      const show = upstairs && this._roomNear.copy(r.box).expandByScalar(12).containsPoint(p);
      if (show === r.shown) continue;
      r.shown = show;
      for (const m of r.meshes) m.visible = show;
    }
  }

  // Is anyone talking right now? (a hit's remark waits for a quiet moment)
  _talking() {
    return this.aria.speaking || this.game.ui.dialogue.classList.contains('visible');
  }

  _startRoboArm() {
    if (this._armStarted || !this.roboArmAction) {
      console.log('[ARM] not started', { already: this._armStarted, action: !!this.roboArmAction });
      return;
    }
    this._armStarted = true;
    this.roboArmAction.reset().play();
    this.roboArmHazard?.start();
    console.log('[ARM] started');
  }

  _testArm() {
    for (const f of ['leftLift', 'dronesWoken', 'pipeTaken', 'gardenCleared', 'hatchTried', 'cardTaken', 'logWatched', 'labDone']) {
      if (!this.story.has(f)) this.story.set(f);
    }
    this._startRoboArm();
    const at = this.fuseboxSpot?.position;
    if (!at) return;
    // a step out from the fusebox into the room, facing it (he drops onto the floor below)
    this.controls.teleport(new THREE.Vector3(at.x + 0.9, at.y, at.z));
    this.controls.camera.rotation.set(0, Math.PI / 2, 0);
    this.controls.facing = Math.PI / 2;
  }

  // TEMP DEBUG: remove before submitting
  _debugUnlockKessler() {
    this.story.set('cardTaken');
    this.story.set('labDone');
    this._startRoboArm();
    this.game.ui.showToast('DEBUG: arm started [9]', 2000);
  }
  _kesslerUnlocked() {
    return this.story.has('cardTaken') && this.story.has('labDone');
  }

  _tryKesslerDoor() {
    playClip(CLIPS.tech, 0.8);
    const ui = this.game.ui;
    if (!this.story.has('cardTaken')) ui.showToast('ACCESS: CARD REQUIRED', 2500);
    else ui.showToast('CARD ACCEPTED. LAB AUTHORISATION REQUIRED', 3000);
  }

  // The hatch keypad: dead until the pumps restart, then it wants Kessler's code
  _useHatch() {
    if (!this.story.has('gardenCleared')) {
      this.game.ui.showToast('The keypad is dead. There is no power to it yet.', 3000);
      return;
    }
    this.game.state = 'KEYPAD';
    this.controls.instance.unlock?.();
    this.game.ui.setPrompt(null);
    this.keypad.open();
  }

  // opened: the right code went in. Otherwise, the first time he walks away from it, ARIA explains
  // whose lock it is and begs him not to go upstairs (scene 2.4)
  _closeKeypad(opened = false) {
    if (!this.keypad.isOpen) return;
    this.keypad.close();
    this.game.state = 'PLAYING';
    if (!opened && this.story.has('gardenCleared') && this.story.set('hatchTried')) this.say('hatchLocked');
  }

  _hatchCode(code) {
    if (code === HATCH_CODE) {
      this.keypad.setStatus('ACCESS GRANTED', 'success');
      setTimeout(() => {
        this._closeKeypad(true);
        this.story.set('hatchOpen');
      }, 900);
      return;
    }
    this.keypad.setStatus('ACCESS DENIED', 'error');
    setTimeout(() => this._closeKeypad(), 1200);
  }

  // Enter: skip ARIA's line, or move on from Voss's
  skipLine() {
    const ui = this.game.ui;
    if (ui.isAriaLine()) this.aria.skip();
    else ui.advance();
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
    let hit = this.interact ? this.interact.update(this._head.set(p.x, p.y + 1.6, p.z)) : null;
    if (this.fuseboxSpot && this.story._inKessler(p) && p.distanceTo(this.fuseboxSpot.position) < 3.2) {
      hit = this.fuseboxSpot;
      this.interact.current = hit;
    }
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

  // The inventory (I): the world waits, as it does for the pause menu
  _openInventory() {
    const g = this.game;
    g.state = 'INVENTORY';
    pauseClock.paused = true;
    this.controls.stop?.();
    this.controls.instance.enabled = false;
    g.reticle.classList.remove('visible');
    this.codeNote.classList.remove('visible');       // (it would sit over the slots)
    this.onPause();
    this.inventory.show(this.player, g.ui.objectiveText.textContent);
  }

  _closeInventory() {
    const g = this.game;
    if (g.state !== 'INVENTORY') return;
    this.inventory.close();
    pauseClock.paused = false;
    this.controls.instance.enabled = true;
    this.onResume();
    g.state = 'PLAYING';
  }

  // The code is in: the hatch swings open, ARIA sends him down ("Down you go...") and down he goes,
  // with no button to press
  async _downTheHatch() {
    await this.say('hatchOpen');
    for (let i = 0; i < 40 && !this.gates?.hatchIsOpen && !this.disposed; i++) await sleep(100);
    // (if something else has him, a menu or a reader, he goes once it is done)
    while (!this.disposed && !this._leaving && this.game.state !== 'PLAYING') await sleep(200);
    if (!this.disposed) this._climbDown();
  }

  // Through the hatch, the end of Level 2: Voss drops into the shaft, the screen goes black, and
  // the game builds Level 3 in this level's place (game.enterLevel3, which calls dispose below)
  _climbDown() {
    if (this._leaving) return;
    this._leaving = true;
    const g = this.game;
    g.state = 'DEPARTING';
    this.controls.stop?.();
    this.onPause();
    g.ui.hideDialogue();
    g.ui.setPrompt(null);
    g.ui.setWaypoint(null);
    this.codeNote.classList.remove('visible');
    // his view goes over to the opening, tips down to look into it, then drops through; the screen
    // fades to black on the way down
    const cam = g.camera.instance;
    const c = this.gates?.hatchCentre || cam.position;
    this._drop = {
      t: 0, from: cam.position.clone(), to: new THREE.Vector3(c.x, cam.position.y, c.z),
      pitch: cam.rotation.x, yaw: cam.rotation.y
    };
    const fade = document.createElement('div');
    fade.id = 'level-fade';
    document.getElementById('ui-layer').appendChild(fade);
    setTimeout(() => fade.classList.add('on'), 900);
    setTimeout(() => g.enterLevel3?.(), 2300);
  }

  // The way down the hatch: over to it (0.8 s), looking down into it, then through it
  _updateDrop(dt) {
    const d = this._drop, cam = this.game.camera.instance;
    d.t += dt;
    const k = Math.min(1, d.t / 0.8), e = k * k * (3 - 2 * k);
    cam.position.x = THREE.MathUtils.lerp(d.from.x, d.to.x, e);
    cam.position.z = THREE.MathUtils.lerp(d.from.z, d.to.z, e);
    cam.rotation.order = 'YXZ';
    cam.rotation.x = THREE.MathUtils.lerp(d.pitch, -1.35, Math.min(1, d.t / 0.7));
    cam.rotation.y = d.yaw;
    cam.rotation.z = 0;
    if (d.t > 0.65) cam.position.y -= dt * 3.2 * Math.min(1, (d.t - 0.65) / 0.3);
  }

  // Torn down on the way to Level 3: everything this level put in the scene, its physics world,
  // its screens, its video and its sounds go, so memory does not climb from level to level. (Its
  // listeners stay attached but do nothing once disposed is set.)
  dispose() {
    this.disposed = true;
    this.ready = false;
    this.controls.instance.unlock?.();
    this.controls.instance.dispose?.();
    this.sea?.dispose?.();
    this.visorAria?.dispose?.();
    this.aria?.dispose?.();
    this.flashback3d?.dispose();
    this.roboArmMixer?.stopAllAction();
    this.roboArmHazard?.stop();
    this.garden?.hushRobots?.(true);
    this.fuseboxPuzzle?.dispose();
    try { this.garden?.audio?.ctx?.close(); } catch (e) { /* already closed */ }
    for (const el of [this.codeNote, this.fpsEl, this.keypad?.root, this.flashback?.el]) el?.remove();
    this.composer?.dispose?.();
    disposeScene(this.game.scene);
    this.physics?.world?.free?.();
    pauseClock.paused = false;
  }

  // The pause menu opened or closed: hold ARIA's line and let go of the pipe
  onPause() {
    this.aria?.pause();
    if (this.garden) {
      this.garden.spraying = false;
      this.garden.freezeHeld = false;
      this.garden.audio.hiss(false);
    }
  }

  onResume() {
    this.aria?.resume();
  }

  // The graphics quality chosen in Options: 'auto' (it lowers itself if the game runs slowly), or a
  // fixed 'high' (glow and full resolution), 'medium' (no glow) or 'low' (no glow, 80% resolution)
  setQualityMode(mode) {
    this._qualityMode = mode;
    if (!this.bloom) return;           // (applied once the level has loaded)
    const webgl = this.game.renderer.instance;
    const pr = mode === 'low' ? 0.8 : 1;
    this.bloom.enabled = mode === 'high' || mode === 'auto';
    webgl.setPixelRatio(Math.min(window.devicePixelRatio || 1, pr));
    this.composer.setPixelRatio(webgl.getPixelRatio());
    this.composer.setSize(window.innerWidth, window.innerHeight);
    const p = webgl.getPixelRatio();
    this.fxaa.material.uniforms.resolution.value.set(1 / (window.innerWidth * p), 1 / (window.innerHeight * p));
    this.qualityStep = mode === 'medium' ? 1 : mode === 'low' ? 2 : 0;
    this.qualityTime = 0;
    this.qualityFrames = 0;
    this._qualityDone = false;
  }

  // A small frame counter (top right; F3 hides it), and automatic quality: while play runs slowly,
  // the glow is switched off, then the resolution lowered to 80%, then (still under ~28 fps) 67%.
  _perf(delta, playing) {
    if (!this.fpsEl) {
      this.fpsEl = document.createElement('div');
      this.fpsEl.className = 'fps-counter';
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
    // a running average of the frame time in play (the flashback picks 3D or 2D by it)
    if (playing && delta < 0.2) this.frameAverage = this.frameAverage ? this.frameAverage * 0.98 + delta * 0.02 : delta;
    if (this.fpsTime >= 0.5) {
      const fps = this.fpsFrames / this.fpsTime;
      this.fpsEl.textContent = Math.round(fps) + ' fps  ' + (1000 / fps).toFixed(1) + ' ms' +
        (this.qualityStep ? '  (quality ' + ['', 'medium', 'low', 'lowest'][this.qualityStep] + ')' : '');
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    // automatic quality: judge each 4 seconds of play, a step at a time until it is smooth enough
    // (not while the tab is hidden, and ignoring one-off stalls: the browser slows hidden tabs down)
    if (!playing || this._qualityDone || document.hidden || delta > 0.2) return;
    if (this._qualityMode && this._qualityMode !== 'auto') return;      // the player chose a quality
    this.qualityTime += delta;
    this.qualityFrames++;
    if (this.qualityTime < 4) return;
    const avg = this.qualityTime / this.qualityFrames;
    this.qualityTime = 0;
    this.qualityFrames = 0;
    if (avg <= 1 / 40) { this._qualityDone = true; return; }      // smooth enough: stop checking
    const webgl = this.game.renderer.instance;
    const scale = (pr) => {
      webgl.setPixelRatio(Math.min(webgl.getPixelRatio(), pr));
      // (the composer keeps its own copy of the pixel ratio: without this the step did nothing)
      this.composer.setPixelRatio(webgl.getPixelRatio());
      this.composer.setSize(window.innerWidth, window.innerHeight);
      const p = webgl.getPixelRatio();
      this.fxaa.material.uniforms.resolution.value.set(1 / (window.innerWidth * p), 1 / (window.innerHeight * p));
    };
    if (this.bloom.enabled) {
      this.bloom.enabled = false;
      this.qualityStep = 1;
    } else if (webgl.getPixelRatio() > 0.8) {
      scale(0.8);
      this.qualityStep = 2;
    } else if (avg > 1 / 28 && webgl.getPixelRatio() > 0.67) {
      scale(0.67);
      this.qualityStep = 3;
      this._qualityDone = true;
    } else {
      this._qualityDone = true;
    }
  }
}

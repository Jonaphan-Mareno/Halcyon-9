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
import { clearPrefetched } from '../core/Prefetch.js';
import { mergeStatic } from '../core/mergeStatic.js';
import { PlayerController } from '../player/PlayerController.js';
import { AriaManager } from '../entities/AriaManager.js';
import { createSessionPlayer } from '../player/PlayerStats.js';
import { HUD } from '../ui/HUD.js';
import { Interact } from '../level2/Interact.js';
import { projectWaypoint } from '../ui/waypoint.js';
import { CUES } from '../level2/Level2Lines.js';
import { sleep } from '../core/PauseClock.js';
import { vossSays, vossVoice } from '../audio/VossVoice.js';
import { deckMaterial, deckUniforms, withMurk } from './DeckMaterials.js';
import { Water } from './Water.js';
import { DrownedCrew } from './DrownedCrew.js';
import { PrepRoom } from './PrepRoom.js';
import { SeaScene } from './SeaScene.js';
import { Swim } from './Swim.js';
import { VisorAria } from './VisorAria.js';
import { Harpoon } from './Harpoon.js';
import { Trench, RELAY } from './Trench.js';
import { WOUNDS } from './KrakenFight.js';
import { dressInSuit, attachAtBind } from './DiveSuit.js';
import { Level3Audio } from './Level3Audio.js';
import { Headlamp } from './Headlamp.js';
import { Chute } from './Chute.js';
import { LockFlashback } from './LockFlashback.js';
import { Confrontation } from './Confrontation.js';
import { SceneB } from './SceneB.js';
import { EndingNarration } from './EndingNarration.js';
import { SceneC } from './scene-c.js';
import { NarrationC } from './narration-c.js';
import { showEndCredits, CREDITS_SONG } from '../ui/EndCredits.js';
import { preloadAudio } from '../audio/AudioCache.js';
import { buildLockPanel, Sparks, crackle, PANEL_SIZE } from './LockPanel.js';
import '../ui/level3.css';
import { LINES, TALKS } from './Level3Lines.js';
import { disposeScene } from '../core/disposeScene.js';

// Level 3, the drowned deck (Blender/scripts/build_l3_drowned.py): the lowest deck, flooded.
// Voss drops in through the shaft from the hatch in the garden and lands in the pump room, in
// water to his waist. ARIA, in his earpiece now, sends him straight ahead, then left. Straight
// ahead, at the end of the corridor, is the engine room door; through its window, the engine room
// is flooded to the ceiling and four of the crew, locked in, float in it. The way on turns left, to
// a sealed bulkhead that ARIA opens; past it, stairs climb out of the water to the EVA prep room,
// where he puts on the dive suit, takes the uplink cable and goes out through the water lock
// (PrepRoom.js) onto a platform on the station's flank, over the canyon and its vents
// (SeaScene.js). (The flooded hall's other gates and its logs are still to come.)
//
// The first time he looks through the window (E), his head pounds and Flashback 3 plays
// (LockFlashback.js): the moment he locked them in. Back in the corridor he names them. Beside the
// door, on the corridor side, the lock panel he tore out still hangs sparking (LockPanel.js, placed
// here in code).
// (?level=3&flashback3: straight to it, for testing.)
//
// Its own renderer settings, physics world, player and HUD, like Level 2's session; the game keeps
// whichever session is running in game.level2 and calls update() on it every frame.

const WATER_LEVEL = 0.9;                // metres over the floor: to Voss's waist
const WATER_BOUNDS = { minX: -12.4, maxX: 3.2, minZ: -24.0, maxZ: 3.2 };   // (to the stairwell's top)
const LAMP_LIGHT = 4;                   // a working caged lamp (candela): soft, and it carries far
const GLOW_SCALE = 0.35;                // the lamp lenses and strips glow, but do not glare
const FLICKER_LAMP = 2;                 // the corridor lamp that stutters
const DEAD_LAMPS = [4];                 // no light left in them
const WINDOW_NEAR = 3.0;                // this close to the window, the crew are seen
// what the code finds by name, moves or hides: never joined with the still meshes round it
// (core/mergeStatic.js). The sea's plants sway by their own shape, so they stay apart too.
const DECK_KEEP = /^(DOOR_|PROP_|GATE_|PT_|SPAWN_|COL_)/;
// ?flashback3 (with ?level=3): Flashback 3 at once, for testing; ?flashback3=still: its slow-machine stills
const TEST_FLASHBACK = new URLSearchParams(window.location.search).get('flashback3');
// ?confrontation (with ?level=3): straight into the relay and the confrontation (Confrontation.js);
// ?confrontation=still: its slow-machine stills
const TEST_CONFRONTATION = new URLSearchParams(window.location.search).get('confrontation');
// ?ending=yes (with ?level=3): the confrontation run through out of sight to its choice, "Yes"
// chosen, and the Save-ARIA ending from there (SceneB.js, then the narration and the credits)
const TEST_ENDING = new URLSearchParams(window.location.search).get('ending');
// ?ending=narration-no (with ?level=3): the confrontation run through out of sight, "No" chosen, and
// straight to the Stay ending's narration (narration-c.js; Scene C itself goes before it)
const TEST_NARRATION_C = TEST_ENDING === 'narration-no';
// ?ending=no (with ?level=3): the same, and the Stay ending from the choice (scene-c.js, then its
// narration and the credits)
const TEST_STAY = TEST_ENDING === 'no' || TEST_NARRATION_C;
// ?lock (with ?level=3): the reroute won and Voss already in the water lock: its scene at once, then
// the confrontation (RelayLock.js)
const TEST_LOCK = new URLSearchParams(window.location.search).has('lock');
const SEA_KEEP = /^(GATE_|PT_|SEA_Life|TERRAIN_Cave|TRENCH_|COL_|SPAWN_)/;
// the drowned works: its doors, gates, the panel it bursts and the finale's pieces move; its weed sways
const WORKS_KEEP = /^(GATE_|BURST_|FALL_|PT_|WL_|COL_|SEA_Weed|PRESSURE_)/;

export class DeckSession {
  constructor(game) {
    this.game = game;
    this.ready = false;
    this.disposed = false;
    this.time = 0;
    this._talkToken = 0;
    const camera = game.camera.instance;
    camera.far = 120;
    camera.updateProjectionMatrix();
    game.camera.flashlight.intensity = 0;
    if (game.mood) game.mood.base = 0.75;
    this._setUpRendering();
    this.controls = new PlayerController(camera, document.body, game.scene);
    game.controls = this.controls;
    this.controls.camDist = 3.2;

    const root = document.getElementById('ui-layer');
    this.player = createSessionPlayer(game.player);
    this.hud = new HUD(root, { onRestart: () => this.game.restartAfterGameOver() });
    this.loadingEl = document.createElement('div');
    this.loadingEl.id = 'level-loading';
    this.loadingEl.className = 'visible';
    this.loadingEl.innerHTML = '<div class="loading-title">LEVEL 3</div><div class="loading-sub">The drowned deck</div><div class="loading-bar"><div></div></div>';
    root.appendChild(this.loadingEl);

    this._wpInfo = { x: 0, y: 0, angle: 0, onScreen: true, label: '', distance: 0 };
    this._head = new THREE.Vector3();
    this._onClick = () => {
      if (!this.disposed && game.state === 'PLAYING' && !this.controls.instance.isLocked) this.controls.lock();
    };
    this._onKey = (e) => {
      if (this.disposed || game.state !== 'PLAYING' || !this.ready) return;
      if (e.code === 'KeyE' && !e.repeat) {
        // some things take a moment (hold E: the suit); the rest happen at once
        const spot = this.interact?.current;
        if (spot?.hold) this._hold = { spot, t: 0 };
        else this.interact?.use();
      }
      if (e.code === 'Enter') this.skipLine();
    };
    this._onKeyUp = (e) => {
      if (e.code === 'KeyE') this._hold = null;
    };
    document.addEventListener('click', this._onClick);
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('keyup', this._onKeyUp);
    this.holdEl = document.createElement('div');
    this.holdEl.id = 'l3-hold';
    this.holdEl.innerHTML = '<div></div>';
    root.appendChild(this.holdEl);

    Physics.create().then(async (physics) => {
      if (this.disposed) return;
      this.physics = physics;
      await this._load();
      // the still meshes that share a material are drawn as one
      if (this.deck) mergeStatic(this.deck, DECK_KEEP);
      if (this.sea?.model) mergeStatic(this.sea.model, SEA_KEEP);
      if (this.sea?.works) for (const part of [this.sea.works.inner, this.sea.works.outer]) mergeStatic(part, WORKS_KEEP);
      // behind the title: only what he sees first (the chute, the deck, the crew); the outside
      // (hidden till the outer hatch opens) is readied while he rides the chute
      this.sea?.setShown(false);
      // Only what he sees first is made ready before the level starts: with the chute, just the
      // chute (the rest of the deck and the crew are readied during the ride, below). Compiling
      // every shader of the level up front was most of the wait at the hatch.
      const chute = this.chute?.group;
      const later = chute ? this.game.scene.children.filter((o) => o !== chute && !o.isLight && !o.isCamera) : [this.sea?.group];
      await this._precompile(later);
      this.ready = true;
      game.applySettings?.();
      this.loadingEl.classList.remove('visible');
      // (the Flashback 3 test link waits for the outside to be readied: in play, the chute ride covers it)
      // the deck and the crew during the ride, then the outside (hidden till the outer hatch opens)
      // (hidden meanwhile: anything of it in view during the ride would be compiled on the spot, a stall)
      const waiting = chute ? later.filter((o) => o !== this.sea?.group && o.visible) : [];
      for (const o of waiting) o.visible = false;
      this._deckReady = (chute ? this._precompile([this.sea?.group]) : Promise.resolve())
        .then(() => { for (const o of waiting) o.visible = true; });
      const outside = this._deckReady.then(() => this._readyOutside());
      if (this._skipRelay) {
        this._skipToRelay();
        if (TEST_CONFRONTATION !== null || TEST_ENDING === 'yes' || TEST_STAY) this.startConfrontation();
        else if (TEST_LOCK) this.trench.lock.test();
      }
      else if (TEST_FLASHBACK !== null) outside.then(() => this._testLockFlashback());
      else this._arrive();
    }).catch((e) => console.error('Level 3 failed to load.', e));
  }

  _setUpRendering() {
    const g = this.game;
    const webgl = g.renderer.instance;
    webgl.toneMapping = THREE.ACESFilmicToneMapping;
    webgl.toneMappingExposure = 1.0;
    webgl.shadowMap.enabled = false;
    webgl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
    const size = new THREE.Vector2();
    webgl.getSize(size);
    const pr = webgl.getPixelRatio();
    this.composer = new EffectComposer(webgl, new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType }));
    this.composer.addPass(new RenderPass(g.scene, g.camera.instance));
    this.bloom = new UnrealBloomPass(size.clone().multiplyScalar(0.5), 0.12, 0.35, 1.0);
    this.composer.addPass(this.bloom);
    // out in the sea the colour drains away toward a murky grey-green (and the darks deepen)
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uAmount: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uAmount;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
          vec3 murk = mix(c.rgb, vec3(l) * vec3(0.9, 1.0, 0.96), 0.6);
          murk = pow(max(murk, 0.0), vec3(1.12));
          gl_FragColor = vec4(mix(c.rgb, murk, uAmount), c.a);
        }`
    });
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaa);
    this._fitFxaa();
    // (after the frame, ARIA in the visor's corner once he is suited: VisorAria)
    g.renderer.render = () => {
      // (Flashback 3 draws its own scene instead of the deck while it plays)
      if (this.lockFlashback?.running) return this.lockFlashback.render(webgl);
      // (and the ending once it takes over: Scene B, then black under the narration and credits)
      if (this.ending?.running) return this.ending.render(webgl);
      // (and the confrontation, from its start until the ending takes over)
      if (this.confrontation?.running) return this.confrontation.render(webgl);
      this.composer.render();
      this.visorAria?.render(webgl);
    };
    this._onResize = () => {
      if (this.disposed) return;
      this.composer.setSize(window.innerWidth, window.innerHeight);
      this._fitFxaa();
    };
    window.addEventListener('resize', this._onResize);
    g.scene.background = new THREE.Color(0x000000);
    // a soft environment for the metal to reflect (without it, rusted metal reads as black)
    const pmrem = new THREE.PMREMGenerator(webgl);
    g.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    g.scene.environmentIntensity = 0.35;
    pmrem.dispose();
    g.scene.fog = new THREE.FogExp2(0x0a0e0d, 0.028);
  }

  _fitFxaa() {
    const p = this.game.renderer.instance.getPixelRatio();
    this.fxaa.material.uniforms.resolution.value.set(1 / (window.innerWidth * p), 1 / (window.innerHeight * p));
  }

  async _load() {
    const g = this.game;
    const scene = g.scene;
    const gltf = await createGLTFLoader().loadAsync('./assets/models/l3-drowned.glb');
    const deck = gltf.scene;
    deck.updateMatrixWorld(true);
    // collision, then drop the collision meshes from what is drawn
    for (const node of [...deck.children]) {
      if (node.name.startsWith('COL_')) {
        this.physics.addStaticObject(node);
        deck.remove(node);
      }
    }
    // the deck's surfaces: textured rust and concrete; the flooded room is drawn through water
    const cache = new Map();
    deck.traverse((o) => {
      if (!o.isMesh) return;
      const murk = o.name.startsWith('FLOOD_');
      const swap = (m) => {
        const key = m.name + (murk ? ':murk' : '');
        if (!cache.has(key)) {
          let out = deckMaterial(m.name, { murk });
          if (!out) {
            out = m;
            if (m.name === 'l3_glass') out = this._glass(m);
            else if (murk) out = withMurk(m);
          }
          cache.set(key, out);
        }
        return cache.get(key);
      };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
      if (o.name.startsWith('GLASS_')) o.renderOrder = 3;
    });
    scene.add(deck);
    this.deck = deck;

    const at = (name) => deck.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()) || null;
    this.spawn = at('SPAWN_L3') || new THREE.Vector3(0, 0.05, 0);
    this.windowPos = at('PT_Window');
    this.gatePos = at('PT_Gate1');
    if (this.windowPos) deckUniforms.uWindow.value.copy(this.windowPos);
    // drop him from above the water, facing up the corridor (north)
    this.controls.attach(this.physics, this.spawn.clone().add(new THREE.Vector3(0, 2.2, 0)), 0);

    this._lights(deck, at);
    deckUniforms.uWaterLevel.value = WATER_LEVEL;
    this.water = new Water(scene, WATER_BOUNDS);
    this.water.level = WATER_LEVEL;
    const bodies = [0, 1, 2, 3].map((i) => at('PT_Body_' + i)).filter(Boolean);
    this.crew = new DrownedCrew(scene, bodies);
    this._sediment(at('PT_EngineRoom'));
    this._signs(at);

    // ARIA, in his earpiece (no screens down here: her voice and her subtitles)
    this.aria = new AriaManager(scene);
    this.interact = new Interact(g.camera.instance, this.physics);
    if (this.windowPos) {
      this.interact.add({ id: 'window', position: this.windowPos, radius: 0.6, label: 'Look through the window', use: () => this._seeCrew() });
      this._lockPanel();
    }
    await this.crew.ready;
    // outside the station: the platform, the canyon, the vents (hidden until the outer hatch opens)
    this.sea = new SeaScene(this);
    await this.sea.ready;
    // the level's sound: creaks, drips, the sea, the kraken, the fight's music (Level3Audio.js)
    this.sfx = new Level3Audio(this);
    // the helmet lamp: out in the murk nearly the only light (Headlamp.js)
    this.headlamp = new Headlamp(this);
    // the harpoon gun (taken from its rack in the prep room; slung on his back, drawn for the kraken)
    this.harpoon = new Harpoon(this);
    // through the gate: the stairs, the EVA prep room, the suit, the cable and the water lock
    this.prep = new PrepRoom(this, deck, at);
    // out in the water: the thruster pack, the cable, the bubbles (Swim.js)
    this.swim = new Swim(this);
    // at the bottom of the trench: the relay station, the kraken's cave and the fight (Trench.js)
    this.trench = new Trench(this);
    await this.trench.ready;
    this.visorAria = new VisorAria(this);
    // the way down from the garden's hatch: ridden first, then taken down (Chute.js)
    // (?nochute skips the ride; ?relay skips the whole level and starts inside the relay; so does
    // ?flashback3, which starts at the engine room window)
    const params = new URLSearchParams(window.location.search);
    // (?afterkraken: the same, but standing in the clearing the moment the kraken has fled)
    this._afterKraken = params.has('afterkraken');
    this._skipRelay = params.has('relay') || this._afterKraken || TEST_CONFRONTATION !== null || TEST_ENDING === 'yes' || TEST_STAY || TEST_LOCK;
    if (!params.has('nochute') && !this._skipRelay && TEST_FLASHBACK === null) this.chute = new Chute(this);
  }

  // the window's glass: a faint green tint with a brighter rim, so the room behind reads as water
  _glass(src) {
    const m = new THREE.MeshStandardMaterial({ color: 0x5f8f80, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.18, depthWrite: false, envMapIntensity: 0.1 });
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        float rim = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.5);
        diffuseColor.a = mix(diffuseColor.a, 0.75, rim);
        #include <opaque_fragment>`);
    };
    return m;
  }

  // a few caged lamps (one stutters, some are dead), the shaft's blue light, the red beacon over
  // the crew room door and the sick green glow inside the flooded room
  _lights(deck, at) {
    const scene = this.game.scene;
    this.hemi = new THREE.HemisphereLight(0x75838c, 0x2a2219, 1.0);
    scene.add(this.hemi);
    this.lamps = [];
    for (let i = 0; i < 8; i++) {
      const p = at('LAMP_' + i);
      if (!p || DEAD_LAMPS.includes(i)) continue;
      const light = new THREE.PointLight(0xffc48a, LAMP_LIGHT, 13, 1.3);
      light.position.copy(p);
      scene.add(light);
      this.lamps.push({ light, i });
    }
    const shaft = at('PT_Shaft');
    if (shaft) {
      this.shaftLight = new THREE.PointLight(0x7fd2ff, 2.5, 8, 1.4);
      this.shaftLight.position.copy(shaft).add(new THREE.Vector3(0, -0.3, 0));
      scene.add(this.shaftLight);
    }
    const beacon = at('PT_Beacon');
    if (beacon) {
      // (its light hangs a little out in the corridor, so it reddens the door and not the room behind)
      this.beacon = new THREE.PointLight(0xff2a14, 2.5, 3.4, 2);
      this.beacon.position.copy(beacon).add(new THREE.Vector3(0, -0.2, 0.9));
      scene.add(this.beacon);
    }
    const room = at('PT_EngineRoom');
    if (room) {
      this.roomLight = new THREE.PointLight(0x7affd0, 16, 13, 1.3);
      this.roomLight.position.copy(room).add(new THREE.Vector3(0, 1.3, 0));
      scene.add(this.roomLight);
    }
    this.glowMats = [];
    deck.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.emissive && m.emissiveIntensity > 0 && !this.glowMats.includes(m)) {
          m.emissiveIntensity *= GLOW_SCALE;
          this.glowMats.push(m);
        }
      }
    });
  }

  // silt and specks hanging in the flooded engine room, drifting
  _sediment(centre) {
    if (!centre) return;
    const n = 260;
    const pos = new Float32Array(n * 3);
    this._silt = { pos, n, centre };
    for (let i = 0; i < n; i++) {
      pos[i * 3] = centre.x + (Math.random() - 0.5) * 9.6;
      pos[i * 3 + 1] = Math.random() * 4.5;
      pos[i * 3 + 2] = centre.z + (Math.random() - 0.5) * 9.4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.silt = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x9fd6bf, size: 0.03, transparent: true, opacity: 0.55, depthWrite: false, fog: false
    }));
    this.silt.frustumCulled = false;
    this.game.scene.add(this.silt);
  }

  // the stencilled plate over the engine room door
  _signs(at) {
    const p = at('PT_CrewSign');
    if (!p) return;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#2b2a26';
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#d8c79a';
    g.font = 'bold 50px Courier New, monospace';
    g.textAlign = 'center';
    g.fillText('ENGINE ROOM 2', 256, 58);
    g.font = 'bold 30px Courier New, monospace';
    g.fillStyle = '#ff6b4a';
    g.fillText('LOCKDOWN: DO NOT OPEN', 256, 104);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    plate.position.copy(p).add(new THREE.Vector3(0, 0, 0.02));
    this.game.scene.add(plate);
  }

  async _precompile(skip) {
    await precompile(this.game.renderer.instance, this.game.scene, this.game.camera.instance, this.composer.renderTarget1, { skip });
    this.composer.render();
  }

  // The outside (the sea, the trench, the kraken), readied in the background long before the outer
  // hatch opens: its shaders compiled (off the main thread), then its textures sent to the graphics
  // card a few at a time (update(): _warmTextures), so nothing stalls when he swims out
  async _readyOutside() {
    const group = this.sea?.group;
    if (!group || this.disposed) return;
    const webgl = this.game.renderer.instance;
    await precompile(webgl, this.game.scene, this.game.camera.instance, this.composer.renderTarget1, { root: group });
    if (this.disposed) return;
    const textures = new Set();
    group.traverse((o) => {
      for (const m of [].concat(o.material || [])) {
        for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
        for (const u of Object.values(m.uniforms || {})) if (u?.value?.isTexture) textures.add(u.value);
      }
    });
    if (this.sea.sky?.isTexture) textures.add(this.sea.sky);
    this._texQueue = [...textures];
  }

  _warmTextures() {
    if (!this._texQueue?.length) return;
    const webgl = this.game.renderer.instance;
    for (let i = 0; i < 2 && this._texQueue.length; i++) webgl.initTexture(this._texQueue.shift());
  }

  // He slides down the chute from the garden's hatch (?nochute skips it), shoots out over the pump
  // room and drops into its water; a moment after he lands, ARIA, through the static in his ear
  async _arrive() {
    if (this.chute) {
      await this.chute.ride();
      this.chute = null;
      // (the deck is readied during the ride; on a slow machine it may need a moment more)
      await Promise.race([this._deckReady, sleep(15000)]);
      if (this.disposed) return;
      this.controls.teleport(this.spawn.clone().add(new THREE.Vector3(0, 2.2, 0)));
    }
    this._falling = true;
    await sleep(2600);
    if (!this.disposed) this.say('landing');
    // Flashback 3 got ready in good time (it plays at the window, at the end of the corridor)
    await this.controls.character.whenReady;
    if (!this._lockDone && !this.disposed) this._getLockFlashback()?.preload(this.game.renderer.instance);
  }

  // ?level=3&relay: skip the chute, the deck, the prep room and the sea; start suited, with the
  // cable in hand, inside the relay station, and the kraken already beaten
  _skipToRelay() {
    const prep = this.prep, trench = this.trench;
    if (!prep || !trench || !trench.pts?.inside) return this._arrive();
    // the prep room, as if he had done it all (no sounds, no dialogue, no waits)
    prep.suited = true;
    prep.cable = true;
    prep.harpoon = true;
    prep.gate = 'open';
    prep.lock = 'open';
    prep.breathing = true;
    prep.oxygen = 240;
    prep._outside = true;
    prep._suitTold = true;
    if (this.swim) this.swim._told = true;   // (past the dive gate: the objective is the trench's, not "swim out through the gate")
    if (prep.rackSuit) prep.rackSuit.visible = false;
    if (prep.cableEnd) prep.cableEnd.visible = false;
    if (prep.rackGun) prep.rackGun.visible = false;
    const player = this.controls.character;
    if (player?.bodyRoot) dressInSuit(player.bodyRoot, { mutate: true });
    if (player?.viewModel) dressInSuit(player.viewModel, { mutate: true, parts: false });
    this.harpoon.taken = true;
    this.harpoon.sling(player?.bodyRoot, attachAtBind);
    prep._visor.classList.add('on');
    prep._oxy.classList.add('on');
    prep._carry.classList.add('on');
    prep._drawScreen();
    // the kraken is already beaten; the relay's door is free
    const fight = trench.fight;
    fight.wounds = WOUNDS;
    fight.state = 'gone';
    fight.kraken.root.visible = false;
    if (this._afterKraken) {
      // just after the fight: it has dug away, the shaft's cover opens, ARIA says her line
      trench._open('front');
      trench._showBoss(false);
      trench.onFled();
    } else {
      trench.stage = 'inside';
      trench._relayBriefingDone = true;
      trench._open('front');
      trench._showBoss(false);
    }
    // Hide the deck and activate the sea environment: this spawn is far beyond the outer hatch,
    // so the position-based zone transition would not fire from the relay's coordinates.
    if (this.deck) this.deck.visible = false;
    prep._setZone('sea');
    // hand the game state over before teleporting so that _swim()'s first frame gets canMove=true
    // (?relay is instant: the wake-up blink may not have run yet)
    if (this.game.state === 'WAKING' || this.game.state === 'INIT') this.game.state = 'PLAYING';
    // PT_RelayInside is the Blender screenshot location, already converted by the GLB loader to
    // Three.js axes (10.729, -41.708, -22.5).
    const spawn = this._afterKraken
      ? trench._clearingEntry?.() || trench.pts.shaftTop.clone().add(new THREE.Vector3(0, 1, 3))
      : trench.pts.inside.clone().add(new THREE.Vector3(0, 0.3, 0));
    this._relayStart = spawn.clone();
    this._relayStartPending = true;
    trench.checkpoint = spawn.clone();
    // the uplink cable is already run in and plugged at the relay's port, so its tether no longer
    // holds him back (Swim._limit returns early once the end is plugged)
    if (this.swim) this.swim.plugged = (trench.pts.port || spawn).clone();
    this.controls.teleport(spawn);
    const toDoor = (trench.pts.roomDoor || trench.pts.door).clone().sub(spawn);
    const yaw = Math.atan2(-toDoor.x, -toDoor.z);
    this.controls.camera.rotation.set(0, yaw, 0);
    this.controls.facing = yaw;
    this.controls.setSwimming(true);
    RELAY.enter?.(trench);
    this.preloadConfrontation();
    this.game.ui.showToast('Skipped inside the relay station. The kraken is beaten.', 6000);
  }

  update(delta) {
    if (!this.ready || this.disposed) return;
    const g = this.game;
    if (g.state === 'PAUSED' || g.state === 'INVENTORY') {
      this._perf(delta, false);
      return;
    }
    const dt = Math.min(delta, 0.05);
    const playing = g.state === 'PLAYING';
    // Apply the relay teleport again on the first live frame, after the physics world and all
    // colliders are mounted. This keeps the camera/body together when the shortcut runs during load.
    if (this._relayStartPending) {
      this.controls.teleport(this._relayStart);
      this.controls.camera.position.set(
        this._relayStart.x,
        this._relayStart.y + this.controls.eye,
        this._relayStart.z
      );
      this.controls.camera.updateMatrixWorld(true);
      this.physics.world.propagateModifiedBodyPositionsToColliders();
      if (this.physics.world.updateSceneQueries) this.physics.world.updateSceneQueries();
      this._relayStartPending = false;
    }
    this.time += dt;
    deckUniforms.uTime.value = this.time;
    if (!this.lockFlashback?.running) this._warmTextures();     // (not while Flashback 3 has the card)
    // on the chute: it has the camera, and he is not on his feet yet (and the deck's drips and
    // creaks wait till he is down in it: only the chute's own metal sounds)
    if (this.chute?.active) {
      this.chute.update(dt, playing);
      this.hud.setVisible(playing);
      this.hud.update(this.player);
      g.reticle.classList.remove('visible');
      this._perf(delta, playing);
      return;
    }
    const p = this.controls.position;
    // in the water he wades (slower), and every few steps the water rings round his legs (in the
    // water lock, its own water)
    const lockLevel = this.prep?.waterAt(p) ?? this.trench?.lock?.waterAt(p) ?? null;
    const level = lockLevel ?? this.water.level;
    const inWater = p.y < level - 0.15;
    this.controls.surface = inWater ? 'wade' : 'normal';
    if (playing || g.state === 'WAKING') this.controls.update(dt, playing);
    const moving = Math.hypot(this.controls.velocity.x, this.controls.velocity.z) > 0.6;
    this._stepRing = (this._stepRing || 0) - dt;
    // and the sound of wading, while he moves through it
    const wading = inWater && moving && playing && !this.controls.swimming;
    if (wading && !this._wading) this.sfx?.startLoop('wade', 'water-wade', { ui: true, vol: 3.2 });
    else if (!wading && this._wading) this.sfx?.stopLoop('wade', 0.35);
    this._wading = wading;
    if (inWater && moving && this._stepRing <= 0) {
      (lockLevel !== null && this.prep?._inLock(p) ? this.prep.lockWater : this.water).ring(p.x, p.z, 0.8);
      this._stepRing = 0.45;
    }
    // the splash as he drops into the water from the chute, and the rings as he lands
    if (this._falling && !this._splashed && p.y < WATER_LEVEL) {
      this._splashed = true;
      this.sfx?.play('water-splash', { ui: true, vol: 1.2 });
      this.water.ring(p.x, p.z, 2);
    }
    if (this._falling && this.controls.grounded) {
      this._falling = false;
      this.water.ring(p.x, p.z, 3);
      this.water.ring(p.x + 0.3, p.z - 0.2, 2);
      g.mood?.flicker(0.25);
    }

    // the lamps: one stutters; the beacon throbs red
    for (const l of this.lamps) {
      if (l.i === FLICKER_LAMP) l.light.intensity = Math.random() < 0.07 ? 0.2 : LAMP_LIGHT * (0.85 + 0.15 * Math.sin(this.time * 31));
    }
    // (up in the prep room these two are lighting it instead: PrepRoom drives them)
    const below = !this.prep || this.prep.zone === 'deck';
    if (this.beacon && below) this.beacon.intensity = 1.2 + 1.6 * Math.max(0, Math.sin(this.time * 3.2));
    if (this.roomLight && below) this.roomLight.intensity = 16 * (0.85 + 0.15 * Math.sin(this.time * 0.7));

    // the crew: one comes up to the glass while he stands at the window
    const nearWindow = this.windowPos && p.distanceTo(this.windowPos) < WINDOW_NEAR;
    this.crew.approach(dt, nearWindow);
    this.crew.update(dt);
    this._panelSparks(dt, p);
    this._driftSilt(dt);
    this.prep?.update(dt, p, playing);
    this.swim?.update(dt, playing);
    this.harpoon?.update(dt);
    this.trench?.update(dt, playing);
    this.sfx?.update(dt);
    this.visorAria?.update(dt, playing && !!this.prep?.suited);
    // (the plankton stirs round him as he swims; in the relay's water lock once it is drained, and
    // the corridor beyond, he is out of the sea)
    const lockAir = !!this.trench?.lock?.inAir(g.camera.instance.position);
    const outside = this.prep?.zone === 'sea' && !lockAir;
    const stir = this.controls.swimming ? Math.min(1, this.controls.velocity.length() / 4.6) : 0;
    const suited = !!this.prep?.suited;
    this.sea?.update(dt, g.camera.instance, outside ? p : null, stir, suited);
    // (the lamp's beam shows in the murk: out in the sea and in the flooded lock)
    this.headlamp?.update(dt, suited && !this.trench?.lock?.owns, outside ? 1 : this.prep?._fogMode === 'lock' ? 0.6 : 0);
    if (this.grade) this.grade.uniforms.uAmount.value += ((outside ? 1 : 0) - this.grade.uniforms.uAmount.value) * (1 - Math.exp(-2 * dt));
    this._holding(dt, playing);

    this.hud.setVisible(playing);
    this.hud.update(this.player);
    if (playing) this.player.playSeconds += dt;
    if (this.aria?.useHead) this.aria.head.update(dt);
    g.reticle.classList.toggle('visible', this.controls.view === 'first' && playing);
    this._guide(playing);
    this._perf(delta, playing);
  }

  // holding E on something that takes a moment: a bar fills under the crosshair; looking away or
  // letting go stops it
  _holding(dt, playing) {
    const h = this._hold;
    if (h && (!playing || this.interact?.current !== h.spot)) this._hold = null;
    if (this._hold) {
      h.t += dt;
      if (h.t >= h.spot.hold) {
        this._hold = null;
        h.spot.use();
      }
    }
    this.holdEl.classList.toggle('on', !!this._hold);
    if (this._hold) this.holdEl.firstChild.style.width = Math.min(100, (h.t / h.spot.hold) * 100).toFixed(1) + '%';
  }

  _driftSilt(dt) {
    if (!this.silt) return;
    const { pos, n } = this._silt;
    const t = this.time;
    for (let i = 0; i < n; i++) {
      pos[i * 3] += Math.sin(t * 0.3 + i) * 0.02 * dt;
      pos[i * 3 + 1] += (Math.sin(t * 0.2 + i * 0.7) * 0.03 - 0.008) * dt;
      if (pos[i * 3 + 1] < 0.02) pos[i * 3 + 1] = 4.5;
    }
    this.silt.geometry.attributes.position.needsUpdate = true;
  }

  // Looking through the window: the first time, the memory (Flashback 3), then Voss names them and
  // ARIA tells him not to look; after that, he names them again
  _seeCrew() {
    if (this._lockBusy) return;
    if (this._crewSeen) return this.say(['v-window-2']);
    this._crewSeen = true;
    this._lockMemory();
  }

  // ------------------------------------------------------------------ the lock panel (Flashback 3)
  // On the wall right of the door, on the corridor side (under the pipe there): torn out, its module
  // hanging on its wires; now and then it sparks. (Only to be seen: the window plays the memory.)
  _lockPanel() {
    const at = this.windowPos.clone().add(new THREE.Vector3(1.34, 1.12 - this.windowPos.y, PANEL_SIZE.d / 2));
    this.panel = buildLockPanel({ broken: true });
    this.panel.group.position.copy(at);
    this.game.scene.add(this.panel.group);
    this.panelSparks = new Sparks(32, { size: 0.025 });
    this.game.scene.add(this.panelSparks.points);
    this._panelAt = at.clone().add(new THREE.Vector3(0, -0.02, PANEL_SIZE.d / 2));
    this._sparkDir = new THREE.Vector3(0.1, 0.2, 1).normalize();
    this._sparkIn = 3;
  }

  _panelSparks(dt, p) {
    const s = this.panelSparks;
    if (!s) return;
    s.update(dt);
    this._sparkIn -= dt;
    const d = p.distanceTo(this._panelAt);
    if (this._sparkIn > 0 || d > 14) return;
    this._sparkIn = 2.2 + Math.random() * 4;
    const big = Math.random() < 0.3;
    s.burst(this._panelAt, this._sparkDir, big ? 10 : 4, big ? 1.8 : 1.1);
    const ctx = this.sfx?.ctx;
    if (!ctx || ctx.state !== 'running' || this.game.state !== 'PLAYING') return;
    if (!this._sparkOut) {
      this._sparkOut = ctx.createGain();
      this._sparkOut.connect(this.sfx.world);
    }
    this._sparkOut.gain.value = 0.9 / (1 + d * 0.6);
    crackle(ctx, this._sparkOut, ctx.currentTime + 0.01, big ? 0.8 : 0.35);
  }

  _getLockFlashback() {
    const c = this.controls.character;
    if (!c?.ready || this.disposed) return null;
    return (this.lockFlashback ||= new LockFlashback(document.getElementById('ui-layer'), c));
  }

  // Flashback 3, at the window: his head pounds ("Ah... my head", as in the lift) and his sight goes
  // black, the memory plays, then back up out of black into the corridor, where he names them
  async _lockMemory() {
    if (this._lockBusy || this._lockDone) return;
    const g = this.game, webgl = g.renderer.instance, ui = document.getElementById('ui-layer');
    this._lockBusy = true;
    this._talkToken++;
    if (this.aria.speaking) this.aria.skip();
    vossVoice.stop();
    g.ui.hideDialogue();
    g.state = 'FLASHBACK';
    await this.controls.character.whenReady;
    const fb = this._getLockFlashback();
    fb?.preload(webgl);              // (if it is not ready yet, it has the headache and a little more)
    const head = LINES['v-window-head'];
    const [, black] = await Promise.all([
      vossSays(g.ui, head.text, head.clip, { readMs: 2200 }),
      fb ? fb.headache(this.composer, ui) : sleep(2400).then(() => this._veil(1))
    ]);
    g.ui.hideDialogue();
    this.sfx?.setMuted(true);
    const ready = !!fb && await Promise.race([fb.preload(webgl).then(() => fb.ready), sleep(10000).then(() => false)]);
    let back = black;
    if (ready && !this.disposed) {
      document.body.classList.add('fb3d');
      g.holdMusic?.('silence', fb.T.end + 4);
      fb.warm(webgl);                // (its textures up to the card, behind the black)
      await sleep(50);
      black.remove();
      // (as stills if the deck was already slow on this machine: judged on a few seconds of play)
      const slow = this._avgFrames > 120 && this.frameAverage > 1 / 24;
      await fb.play({ still: slow || TEST_FLASHBACK === 'still' });
      if (import.meta.env.DEV) {
        const s = fb.stats;
        console.info('Flashback 3:', s.frames, 'frames,', (s.frames / Math.max(0.01, s.seconds)).toFixed(1), 'fps, worst',
          (s.worst * 1000).toFixed(0), 'ms at', s.worstAt, s.still ? '(stills: ' + s.still + ')' : '');
      }
      document.body.classList.remove('fb3d');
      back = this._veil(1);
    }
    fb?.dispose();                   // (it plays once)
    this.lockFlashback = null;
    this._lockDone = true;
    this._lockBusy = false;
    if (this.disposed) return back.remove();
    this.sfx?.setMuted(false);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      back.style.transition = 'opacity 1.4s ease';
      back.style.opacity = '0';
    }));
    await sleep(1450);
    back.remove();
    if (this.disposed) return;
    g.state = 'PLAYING';
    this._afterLockFlashback();
  }

  // Back at the window: he names them, and ARIA tells him not to look (Level3Lines: 'window')
  _afterLockFlashback() {
    this.game.holdMusic?.('silence', 8);
    this.say('window');
  }

  // a black sheet over the frame (under the flashback's subtitles): fading in, or at `opacity`
  _veil(opacity = null) {
    const el = document.createElement('div');
    el.className = 'fb3d-hint on';
    el.style.cssText = 'position:fixed;inset:0;background:#000;z-index:30;pointer-events:none;' +
      (opacity === null ? 'opacity:0;transition:opacity .4s ease' : 'opacity:' + opacity);
    document.getElementById('ui-layer').appendChild(el);
    if (opacity === null) requestAnimationFrame(() => { el.style.opacity = '1'; });
    return el;
  }

  // ?level=3&flashback3: at the window, as if E had been pressed there: Flashback 3, then his lines
  async _testLockFlashback() {
    if (this.windowPos) {
      this.controls.teleport(new THREE.Vector3(this.windowPos.x + 0.2, this.spawn.y + 0.1, this.windowPos.z + 1.4));
      this.controls.camera.rotation.set(0, 0, 0);
      this.controls.facing = 0;
    }
    while (!this.disposed && this.game.state !== 'PLAYING') await sleep(200);
    if (!this.disposed) this._seeCrew();
  }

  // ------------------------------------------------------------------ the confrontation
  // Readied in good time: on entering the relay room (it loads Voss's acting clips and a fresh copy
  // of him: a second or two of work)
  preloadConfrontation() {
    if (this.disposed || this._confDone) return null;
    this.confrontation ||= new Confrontation(document.getElementById('ui-layer'));
    return this.confrontation.preload(this.game.renderer.instance);
  }

  // The confrontation (Confrontation.js, Scene A of docs/ending-confrontation-script.md), after the
  // water lock's scene (RelayLock: the reroute won, the lock drained, his helmet off, the black).
  // Down to black (or on from the lock's black: `veil`, taken away as the scene starts), the scene
  // in the relay's control room, then the choice; the choice goes to onChoice. The scene stays on
  // its last shot until the ending takes over and disposes it.
  async startConfrontation({ veil = null } = {}) {
    if (this._confBusy || this._confDone || this.disposed) return;
    const g = this.game, webgl = g.renderer.instance;
    this._confBusy = true;
    this._talkToken++;
    if (this.aria.speaking) this.aria.skip();
    vossVoice.stop();
    g.ui.hideDialogue();
    g.state = 'FLASHBACK';
    this.controls.stop?.();
    document.exitPointerLock?.();
    // (out of the suit: it came off in the lock's black)
    const black = veil || this._veil();
    if (!veil) await sleep(500);
    this.sfx?.setMuted(true);
    const conf = this.preloadConfrontation();
    const ready = !!conf && await Promise.race([conf.then(() => this.confrontation?.ready), sleep(15000).then(() => false)]);
    if (!ready || this.disposed) {
      console.warn('Confrontation: not ready; back to the level.');
      this._confBusy = false;
      this.sfx?.setMuted(false);
      black.remove();
      if (!this.disposed) g.state = 'PLAYING';
      return;
    }
    const scene = this.confrontation;
    document.body.classList.add('fb3d');
    g.holdMusic?.('silence', 600);
    scene.warm(webgl);
    await sleep(50);
    black.remove();
    const slow = this._avgFrames > 120 && this.frameAverage > 1 / 24;
    const playing = scene.play({ still: slow || TEST_CONFRONTATION === 'still' });
    // (the Save-ARIA ending readied while it plays: its recordings and its few new shaders)
    this._preloadEnding();
    if (TEST_ENDING === 'yes' || TEST_STAY) this._testChoice(scene, TEST_STAY ? 'no' : 'yes');
    const choice = await playing;
    if (import.meta.env.DEV) {
      const s = scene.stats;
      console.info('Confrontation:', s.frames, 'frames,', (s.frames / Math.max(0.01, s.seconds)).toFixed(1), 'fps, worst',
        (s.worst * 1000).toFixed(0), 'ms at', s.worstAt, s.still ? '(stills: ' + s.still + ')' : '');
    }
    this._confDone = true;
    this._confBusy = false;
    if (!this.disposed) this.onChoice(choice);
  }

  // The confrontation is still drawing its last shot (the high wide) when this is called: an ending
  // takes over from it and calls this.confrontation.dispose() when it no longer needs it.
  onChoice(choice /* 'yes' | 'no' */) {
    console.info('Confrontation: the player chose', choice);
    if (choice === 'yes') return this.playEnding();
    if (TEST_NARRATION_C) return this.playNarrationC();
    return this.playStay();
  }

  // ------------------------------------------------------------------ the Save-ARIA ending
  // Scene B and the narration, readied while the confrontation plays
  _preloadEnding() {
    const webgl = this.game.renderer.instance;
    if (!this.confrontation?.ready) return null;
    preloadAudio([CREDITS_SONG]);                  // (the credits' song, for either ending)
    this.sceneB ||= new SceneB(this.confrontation);
    this.narration ||= new EndingNarration(document.body);
    this.narration.preload();
    // (Scene C: only its recordings; its narration loads while the scene plays)
    this.sceneC ||= new SceneC(this.confrontation);
    this.sceneC.preload();
    return this.sceneB.preload(webgl);
  }

  // ?level=3&ending=yes: the confrontation run through out of sight (as its skip does), the prompt
  // shown for a moment, and Yes chosen
  async _testChoice(scene, choice = 'yes') {
    scene._skip = { t: 0 };
    while (!scene._choiceShown && !this.disposed) await sleep(100);
    await sleep(1400);
    if (!this.disposed && !scene.choice) scene._choose(choice);
  }

  // "No": Scene C in the confrontation's room (from its high wide shot), then its narration
  // (playNarrationC), which goes on in the same room after a moment of black. The narration's rooms
  // and recordings load while the scene plays.
  async playStay() {
    const g = this.game, conf = this.confrontation;
    if (this._endingBusy || this.disposed || !conf?.ready) return;
    this._endingBusy = true;
    g.holdMusic?.('silence', 900);
    const sceneC = (this.sceneC ||= new SceneC(conf));
    await Promise.race([sceneC.preload(), sleep(8000)]);
    if (this.disposed) return;
    (this.narrationC ||= new NarrationC(conf, this)).preload(g.renderer.instance);
    if (sceneC.ready) {
      this.ending = { running: true, render: (r) => sceneC.render(r) };
      const how = await sceneC.play();
      if (import.meta.env.DEV) {
        const s = sceneC.stats;
        console.info('Scene C:', how, s.frames, 'frames,', (s.frames / Math.max(0.01, s.seconds)).toFixed(1), 'fps, worst',
          (s.worst * 1000).toFixed(0), 'ms at', s.worstAt, s.still ? '(stills: ' + s.still + ')' : '');
      }
    } else {
      console.warn('Scene C: not ready; on to the narration.');
    }
    if (this.disposed) return;
    this.ending = { running: true, render: (r) => { r.setRenderTarget(null); r.setClearColor(0x000000, 1); r.clear(); } };
    sceneC.dispose();
    this.sceneC = null;
    this._endingBusy = false;
    return this.playNarrationC();
  }

  // The Stay ending's narration (narration-c.js), in the confrontation's room, then the credits.
  // Scene C plays first (playStay) and calls this at its black. As playEnding: only once
  // the credits have closed is the confrontation disposed and the state restored.
  async playNarrationC() {
    const g = this.game, conf = this.confrontation;
    if (this._endingBusy || this.disposed || !conf?.ready) return;
    this._endingBusy = true;
    g.holdMusic?.('silence', 900);
    const narration = (this.narrationC ||= new NarrationC(conf, this));
    await Promise.race([narration.preload(g.renderer.instance), sleep(8000)]);
    if (this.disposed) return;
    this.ending = { running: true, render: (r) => narration.render(r) };
    await narration.play();
    if (this.disposed) return;
    this.ending = { running: true, render: (r) => { r.setRenderTarget(null); r.setClearColor(0x000000, 1); r.clear(); } };
    const credits = showEndCredits(document.body, () => g.audio?.musicMuted);
    await sleep(1700);
    narration.dispose();
    this.narrationC = null;
    await credits;
    if (this.disposed) return;
    conf.dispose();
    this.ending = null;
    document.body.classList.remove('fb3d');
    g.state = 'PLAYING';
    this.sfx?.setMuted(false);
    this._endingBusy = false;
    this._afterCredits();
  }

  // "Yes": Scene B in the confrontation's room (from its high wide shot), then the narration over
  // black, then the credits. Only once the credits have closed is the confrontation disposed, the
  // state restored and the level's sound unmuted (the report's order).
  async playEnding() {
    const g = this.game, webgl = g.renderer.instance;
    if (this._endingBusy || this.disposed) return;
    this._endingBusy = true;
    g.holdMusic?.('silence', 900);
    const sceneB = this.sceneB || (this._preloadEnding(), this.sceneB);
    if (sceneB) await Promise.race([sceneB.preload(webgl), sleep(8000)]);
    if (sceneB?.ready && !this.disposed) {
      this.ending = { running: true, render: (r) => sceneB.render(r) };
      const how = await sceneB.play();
      if (import.meta.env.DEV) {
        const s = sceneB.stats;
        console.info('Scene B:', how, s.frames, 'frames,', (s.frames / Math.max(0.01, s.seconds)).toFixed(1), 'fps, worst',
          (s.worst * 1000).toFixed(0), 'ms at', s.worstAt, s.still ? '(stills: ' + s.still + ')' : '');
      }
    } else {
      console.warn('Scene B: not ready; on to the narration.');
    }
    if (this.disposed) return;
    // the narration over black (nothing drawn under it)
    this.ending = { running: true, render: (r) => { r.setRenderTarget(null); r.setClearColor(0x000000, 1); r.clear(); } };
    const narration = this.narration || (this.narration = new EndingNarration(document.body));
    await Promise.race([narration.preload(), sleep(8000)]);
    if (this.disposed) return;
    await narration.play();
    if (this.disposed) return;
    // the credits; behind them, what is left of the ending is freed
    const credits = showEndCredits(document.body, () => g.audio?.musicMuted);
    await sleep(1700);
    narration.dispose();
    sceneB?.dispose();
    this.narration = null;
    this.sceneB = null;
    await credits;
    if (this.disposed) return;
    this.confrontation?.dispose();
    this.ending = null;
    document.body.classList.remove('fb3d');
    g.state = 'PLAYING';
    this.sfx?.setMuted(false);
    this._endingBusy = false;
    this._afterCredits();
  }

  // TODO(owner): what comes after the credits. For now: back to the title (the opening), as a new
  // game would start.
  _afterCredits() {
    window.location.href = window.location.pathname;
  }

  // The objective and the marker: up the corridor to the window, then left to the bulkhead
  _guide(playing) {
    const ui = this.game.ui;
    if (!playing) {
      ui.setWaypoint(null);
      ui.setPrompt(null);
      return;
    }
    const p = this.controls.position;
    const hit = this.interact ? this.interact.update(this._head.set(p.x, p.y + 1.6, p.z)) : null;
    const label = hit && (typeof hit.label === 'function' ? hit.label() : hit.label);
    ui.setPrompt(hit ? (hit.hold ? 'Hold E   ' : 'E   ') + label : null);
    // the window, the gate, then the prep room's steps (PrepRoom.guide)
    const step = this.prep ? this.prep.guide(this._crewSeen, this.windowPos)
      : { text: 'Reach the airlock', target: this._crewSeen ? this.gatePos : this.windowPos, label: this._crewSeen ? 'LEFT' : 'AHEAD' };
    ui.setObjective(step.text);
    if (!step.target) return ui.setWaypoint(null);
    ui.setWaypoint(projectWaypoint(this.game.camera.instance, step.target, step.label, this._wpInfo));
  }

  // ARIA and Voss speak (as in Level 2): a list of line ids or the name of an exchange
  async say(talk) {
    if (this.disposed) return false;
    const ids = Array.isArray(talk) ? talk : TALKS[talk];
    if (!ids) return false;
    const ui = this.game.ui;
    const token = ++this._talkToken;
    if (this.aria.speaking) this.aria.skip();
    vossVoice.stop();
    for (const id of ids) {
      if (token !== this._talkToken || this.disposed) return false;
      const line = LINES[id];
      if (!line) continue;
      if (line.who === 'voss') {
        await vossSays(ui, line.text, line.clip || id);   // (his recording: public/assets/audio/voss/<id>.mp3)
        continue;
      }
      const cue = CUES[line.cue] || CUES.guarded;
      this.aria.updateAriaState(cue.mood);
      ui.showAriaLine(line.text, 'Enter: skip');
      await this.aria.speak(id, Math.max(2.5, line.text.length * 0.055), cue.expression);
      this.aria.updateAriaState('neutral');
    }
    if (token === this._talkToken) ui.hideDialogue();
    return token === this._talkToken;
  }

  skipLine() {
    const ui = this.game.ui;
    if (ui.isAriaLine()) this.aria.skip();
    else ui.advance();
  }

  // the pause menu and the inventory hold ARIA's line
  // (while the kraken's music plays, the lighting's tension holds)
  get musicMood() {
    return this.sfx?.musicBusy ? 'silence' : null;
  }

  onPause() {
    this.sfx?.setPaused(true);
    this.aria?.pause();
  }

  onResume() {
    this.sfx?.setPaused(false);
    this.aria?.resume();
  }

  // Options > Graphics quality: 'auto' and 'high' keep the glow; 'medium' drops it; 'low' also
  // draws at 80% resolution
  setQualityMode(mode) {
    this._qualityMode = mode;
    this._quality = { step: 0, time: 0, frames: 0, done: false };
    if (!this.bloom) return;
    this.bloom.enabled = mode === 'high' || mode === 'auto';
    this._scale(mode === 'low' ? 0.8 : 1, true);
  }

  _scale(pr, set = false) {
    const webgl = this.game.renderer.instance;
    const want = Math.min(window.devicePixelRatio || 1, pr);
    webgl.setPixelRatio(set ? want : Math.min(webgl.getPixelRatio(), want));
    this.composer.setPixelRatio(webgl.getPixelRatio());
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this._fitFxaa();
  }

  // Automatic quality (Options: Auto), as in Level 2: every 4 seconds of play the frame rate is
  // judged, and while it is slow one more step is taken: the glow off, 80% resolution, then (still
  // under ~28 fps) 67%. Once it is smooth enough it stops judging.
  _autoQuality(delta, playing) {
    const q = this._quality ??= { step: 0, time: 0, frames: 0, done: false };
    if (!playing || q.done || document.hidden || delta > 0.2 || !this.bloom) return;
    if (this._qualityMode && this._qualityMode !== 'auto') return;
    q.time += delta;
    q.frames++;
    if (q.time < 4) return;
    const avg = q.time / q.frames;
    q.time = 0;
    q.frames = 0;
    const pr = this.game.renderer.instance.getPixelRatio();
    // (it keeps watching: a heavy part later on, the drowned works, steps it down then; it never
    // steps back up, so the picture does not keep changing)
    if (avg <= 1 / 40) return;
    if (this.bloom.enabled) { this.bloom.enabled = false; q.step = 1; }
    else if (pr > 0.8) { this._scale(0.8); q.step = 2; }
    else if (avg > 1 / 28 && pr > 0.67) { this._scale(0.67); q.step = 3; }
    else if (avg > 1 / 24 && pr > 0.55) { this._scale(0.55); q.step = 4; q.done = true; }
  }

  // a frame counter in the top right (F3 or Options hide it)
  _perf(delta, playing) {
    this._autoQuality(delta, playing);
    // a running average of the frame time in play (Flashback 3 starts as stills when it is slow)
    if (playing && delta < 0.2) {
      this.frameAverage = this.frameAverage ? this.frameAverage * 0.98 + delta * 0.02 : delta;
      this._avgFrames = (this._avgFrames || 0) + 1;
    }
    if (!this.fpsEl) {
      this.fpsEl = document.createElement('div');
      this.fpsEl.className = 'fps-counter';
      this.fpsEl.style.cssText = 'position:fixed;top:8px;right:10px;z-index:50;font:12px monospace;color:#cfefff;' +
        'background:rgba(4,18,27,0.7);padding:3px 7px;border-radius:4px;pointer-events:none';
      document.body.appendChild(this.fpsEl);
      this._fps = { frames: 0, time: 0 };
    }
    this._fps.frames++;
    this._fps.time += delta;
    if (this._fps.time >= 0.5) {
      const fps = this._fps.frames / this._fps.time;
      const step = this._quality?.step;
      this.fpsEl.textContent = Math.round(fps) + ' fps  ' + (1000 / fps).toFixed(1) + ' ms' +
        (step ? '  (quality ' + ['', 'medium', 'low', 'lower', 'lowest'][step] + ')' : '');
      this._fps.frames = 0;
      this._fps.time = 0;
    }
  }

  dispose() {
    clearPrefetched();     // (the models Level 2 fetched ahead for this level)
    this.disposed = true;
    this.ready = false;
    document.removeEventListener('click', this._onClick);
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('resize', this._onResize);
    this.chute?.dispose();
    this.swim?.dispose();
    this.trench?.dispose();
    this.harpoon?.dispose();
    this.sfx?.dispose();
    this.headlamp?.dispose();
    this.visorAria?.dispose();
    this.prep?.dispose();
    this.sea?.dispose();
    this.holdEl?.remove();
    this.controls.instance.unlock?.();
    this.controls.instance.dispose?.();
    this.aria?.dispose?.();
    this.crew?.dispose();
    this.lockFlashback?.dispose();
    this.narration?.dispose();
    this.sceneB?.dispose();
    this.sceneC?.dispose();
    this.narrationC?.dispose();
    this.confrontation?.dispose();
    this.panel?.dispose();
    this.panelSparks?.dispose();
    this.water?.dispose();
    this.fpsEl?.remove();
    this.loadingEl?.remove();
    this.composer?.dispose?.();
    disposeScene(this.game.scene);
    this.physics?.world?.free?.();
  }
}

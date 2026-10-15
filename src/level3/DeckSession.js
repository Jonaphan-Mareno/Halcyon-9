import * as THREE from 'three';
import { createGLTFLoader } from '../core/loaders.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { Physics } from '../core/Physics.js';
import { PlayerController } from '../player/PlayerController.js';
import { AriaManager } from '../entities/AriaManager.js';
import { PlayerStats } from '../player/PlayerStats.js';
import { HUD } from '../ui/HUD.js';
import { Interact } from '../level2/Interact.js';
import { projectWaypoint } from '../ui/waypoint.js';
import { CUES } from '../level2/Level2Lines.js';
import { sleep } from '../core/PauseClock.js';
import { deckMaterial, deckUniforms, withMurk } from './DeckMaterials.js';
import { Water } from './Water.js';
import { DrownedCrew } from './DrownedCrew.js';
import { LINES, TALKS } from './Level3Lines.js';
import { disposeScene } from '../core/disposeScene.js';

// Level 3, the drowned deck (Blender/scripts/build_l3_drowned.py): the lowest deck, flooded.
// Voss drops in through the shaft from the hatch in the garden and lands in the pump room, in
// water to his knees. ARIA, in his earpiece now, sends him straight ahead, then left. Straight
// ahead, at the end of the corridor, is the door to crew quarters C; through its window, the room
// beyond is flooded to the ceiling and four of the crew float in it. The way on turns left, to a
// sealed bulkhead (the first gate of the flooded hall, built next).
//
// Its own renderer settings, physics world, player and HUD, like Level 2's session; the game keeps
// whichever session is running in game.level2 and calls update() on it every frame.

const WATER_LEVEL = 0.55;               // metres over the floor: to Voss's knees
const WATER_BOUNDS = { minX: -9.4, maxX: 3.2, minZ: -24.0, maxZ: 3.2 };
const LAMP_LIGHT = 7;                   // a working caged lamp (candela)
const FLICKER_LAMP = 2;                 // the corridor lamp that stutters
const DEAD_LAMPS = [4];                 // no light left in them
const WINDOW_NEAR = 3.0;                // this close to the window, the crew are seen

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
    this.player = new PlayerStats();
    this.hud = new HUD(root, { onRestart: () => {} });
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
      if (e.code === 'KeyE' && !e.repeat) this.interact?.use();
      if (e.code === 'Enter') this.skipLine();
    };
    document.addEventListener('click', this._onClick);
    window.addEventListener('keydown', this._onKey);

    Physics.create().then(async (physics) => {
      if (this.disposed) return;
      this.physics = physics;
      await this._load();
      await this._precompile();
      this.ready = true;
      game.applySettings?.();
      this.loadingEl.classList.remove('visible');
      this._arrive();
    }).catch((e) => console.error('Level 3 failed to load.', e));
  }

  _setUpRendering() {
    const g = this.game;
    const webgl = g.renderer.instance;
    webgl.toneMapping = THREE.ACESFilmicToneMapping;
    webgl.toneMappingExposure = 1.05;
    webgl.shadowMap.enabled = false;
    webgl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
    const size = new THREE.Vector2();
    webgl.getSize(size);
    const pr = webgl.getPixelRatio();
    this.composer = new EffectComposer(webgl, new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType }));
    this.composer.addPass(new RenderPass(g.scene, g.camera.instance));
    this.bloom = new UnrealBloomPass(size.clone().multiplyScalar(0.5), 0.35, 0.5, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaa);
    this._fitFxaa();
    g.renderer.render = () => this.composer.render();
    this._onResize = () => {
      if (this.disposed) return;
      this.composer.setSize(window.innerWidth, window.innerHeight);
      this._fitFxaa();
    };
    window.addEventListener('resize', this._onResize);
    g.scene.background = new THREE.Color(0x000000);
    g.scene.environment = null;
    g.scene.fog = new THREE.FogExp2(0x060908, 0.045);
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
    this._sediment(at('PT_CrewRoom'));
    this._signs(at);

    // ARIA, in his earpiece (no screens down here: her voice and her subtitles)
    this.aria = new AriaManager(scene);
    this.interact = new Interact(g.camera.instance, this.physics);
    if (this.windowPos) {
      this.interact.add({ id: 'window', position: this.windowPos, radius: 0.6, label: 'Look through the window', use: () => this._seeCrew() });
    }
    if (this.gatePos) {
      this.interact.add({ id: 'gate1', position: this.gatePos, radius: 0.9, label: 'Sealed bulkhead', use: () => this.say('sealedGate') });
    }
    await this.crew.ready;
  }

  // the window's glass: a faint green tint with a brighter rim, so the room behind reads as water
  _glass(src) {
    const m = new THREE.MeshStandardMaterial({ color: 0x5f8f80, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.18, depthWrite: false });
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
    this.hemi = new THREE.HemisphereLight(0x5d6a74, 0x1c1610, 0.5);
    scene.add(this.hemi);
    this.lamps = [];
    for (let i = 0; i < 8; i++) {
      const p = at('LAMP_' + i);
      if (!p || DEAD_LAMPS.includes(i)) continue;
      const light = new THREE.PointLight(0xffc48a, LAMP_LIGHT, 10, 2);
      light.position.copy(p);
      scene.add(light);
      this.lamps.push({ light, i });
    }
    const shaft = at('PT_Shaft');
    if (shaft) {
      this.shaftLight = new THREE.PointLight(0x7fd2ff, 3.5, 7, 2);
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
    const room = at('PT_CrewRoom');
    if (room) {
      this.roomLight = new THREE.PointLight(0x7affd0, 16, 11, 1.4);
      this.roomLight.position.copy(room).add(new THREE.Vector3(0, 0.9, 0));
      scene.add(this.roomLight);
    }
    this.glowMats = [];
    deck.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.emissive && m.emissiveIntensity > 0 && !this.glowMats.includes(m)) this.glowMats.push(m);
      }
    });
  }

  // silt and specks hanging in the flooded room, drifting
  _sediment(centre) {
    if (!centre) return;
    const n = 260;
    const pos = new Float32Array(n * 3);
    this._silt = { pos, n, centre };
    for (let i = 0; i < n; i++) {
      pos[i * 3] = centre.x + (Math.random() - 0.5) * 7.6;
      pos[i * 3 + 1] = Math.random() * 3.3;
      pos[i * 3 + 2] = centre.z + (Math.random() - 0.5) * 6.2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.silt = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x9fd6bf, size: 0.03, transparent: true, opacity: 0.55, depthWrite: false, fog: false
    }));
    this.silt.frustumCulled = false;
    this.game.scene.add(this.silt);
  }

  // the stencilled plate over the crew room door
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
    g.fillText('CREW QUARTERS C', 256, 58);
    g.font = 'bold 30px Courier New, monospace';
    g.fillStyle = '#ff6b4a';
    g.fillText('FLOODED: DO NOT OPEN', 256, 104);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    plate.position.copy(p).add(new THREE.Vector3(0, 0, 0.02));
    this.game.scene.add(plate);
  }

  async _precompile() {
    const webgl = this.game.renderer.instance;
    try {
      await webgl.compileAsync(this.game.scene, this.game.camera.instance);
    } catch (e) {
      webgl.compile(this.game.scene, this.game.camera.instance);
    }
    this.composer.render();
  }

  // He drops in from the shaft; a moment after he lands, ARIA, through the static in his ear
  async _arrive() {
    this._falling = true;
    await sleep(2600);
    if (!this.disposed) this.say('landing');
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
    this.time += dt;
    deckUniforms.uTime.value = this.time;
    const p = this.controls.position;
    // in the water he wades (slower), and every few steps the water rings round his legs
    const inWater = p.y < this.water.level - 0.15;
    this.controls.surface = inWater ? 'wade' : 'normal';
    if (playing || g.state === 'WAKING') this.controls.update(dt, playing);
    const moving = Math.hypot(this.controls.velocity.x, this.controls.velocity.z) > 0.6;
    this._stepRing = (this._stepRing || 0) - dt;
    if (inWater && moving && this._stepRing <= 0) {
      this.water.ring(p.x, p.z, 0.8);
      this._stepRing = 0.45;
    }
    // the splash as he lands from the shaft
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
    if (this.beacon) this.beacon.intensity = 1.2 + 1.6 * Math.max(0, Math.sin(this.time * 3.2));
    if (this.roomLight) this.roomLight.intensity = 16 * (0.85 + 0.15 * Math.sin(this.time * 0.7));

    // the crew: one comes up to the glass while he stands at the window
    const nearWindow = this.windowPos && p.distanceTo(this.windowPos) < WINDOW_NEAR;
    if (nearWindow && !this._crewSeen) this._seeCrew();
    this.crew.approach(dt, nearWindow);
    this.crew.update(dt);
    this._driftSilt(dt);

    this.hud.setVisible(playing);
    this.hud.update(this.player);
    if (playing) this.player.playSeconds += dt;
    if (this.aria?.useHead) this.aria.head.update(dt);
    g.reticle.classList.toggle('visible', this.controls.view === 'first' && playing);
    this._guide(playing);
    this._perf(delta, playing);
  }

  _driftSilt(dt) {
    if (!this.silt) return;
    const { pos, n } = this._silt;
    const t = this.time;
    for (let i = 0; i < n; i++) {
      pos[i * 3] += Math.sin(t * 0.3 + i) * 0.02 * dt;
      pos[i * 3 + 1] += (Math.sin(t * 0.2 + i * 0.7) * 0.03 - 0.008) * dt;
      if (pos[i * 3 + 1] < 0.02) pos[i * 3 + 1] = 3.3;
    }
    this.silt.geometry.attributes.position.needsUpdate = true;
  }

  // The first look through the window: Voss names them, ARIA tells him not to look
  _seeCrew() {
    if (this._crewSeen) return this.say(['v-window-2']);
    this._crewSeen = true;
    this.game.holdMusic?.('silence', 8);
    this.say('window');
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
    ui.setPrompt(hit ? 'E   ' + (typeof hit.label === 'function' ? hit.label() : hit.label) : null);
    ui.setObjective('Reach the airlock');
    const target = this._crewSeen ? this.gatePos : this.windowPos;
    if (!target) return ui.setWaypoint(null);
    ui.setWaypoint(projectWaypoint(this.game.camera.instance, target, this._crewSeen ? 'LEFT' : 'AHEAD', this._wpInfo));
  }

  // ARIA and Voss speak (as in Level 2): a list of line ids or the name of an exchange
  async say(talk) {
    if (this.disposed) return false;
    const ids = Array.isArray(talk) ? talk : TALKS[talk];
    if (!ids) return false;
    const ui = this.game.ui;
    const token = ++this._talkToken;
    if (this.aria.speaking) this.aria.skip();
    for (const id of ids) {
      if (token !== this._talkToken || this.disposed) return false;
      const line = LINES[id];
      if (!line) continue;
      if (line.who === 'voss') {
        const shown = ui.showVossLine(line.text, { timed: true });
        await Promise.race([shown, sleep(Math.max(2200, line.text.length * 60))]);
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
  onPause() {
    this.aria?.pause();
  }

  onResume() {
    this.aria?.resume();
  }

  // Options > Graphics quality: 'auto' and 'high' keep the glow; 'medium' drops it; 'low' also
  // draws at 80% resolution
  setQualityMode(mode) {
    this._qualityMode = mode;
    if (!this.bloom) return;
    const webgl = this.game.renderer.instance;
    this.bloom.enabled = mode === 'high' || mode === 'auto';
    webgl.setPixelRatio(Math.min(window.devicePixelRatio || 1, mode === 'low' ? 0.8 : 1));
    this.composer.setPixelRatio(webgl.getPixelRatio());
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this._fitFxaa();
  }

  // a frame counter in the top right (F3 or Options hide it)
  _perf(delta, playing) {
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
      this.fpsEl.textContent = Math.round(fps) + ' fps  ' + (1000 / fps).toFixed(1) + ' ms';
      this._fps.frames = 0;
      this._fps.time = 0;
    }
  }

  dispose() {
    this.disposed = true;
    this.ready = false;
    document.removeEventListener('click', this._onClick);
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('resize', this._onResize);
    this.controls.instance.unlock?.();
    this.controls.instance.dispose?.();
    this.aria?.dispose?.();
    this.crew?.dispose();
    this.water?.dispose();
    this.fpsEl?.remove();
    this.loadingEl?.remove();
    this.composer?.dispose?.();
    disposeScene(this.game.scene);
    this.physics?.world?.free?.();
  }
}

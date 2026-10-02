import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Physics } from '../core/Physics.js';
import { PlayerController } from '../player/PlayerController.js';
import { createHubTextures, applyHubMaterials } from '../graphics/HubMaterials.js';
import { DeepSeaWindow } from '../graphics/DeepSeaWindow.js';
import { AriaManager } from '../entities/AriaManager.js';
import { Organism } from './Organism.js';
import { LabScreens } from './LabScreens.js';
import '../ui/level2.css';

// Level 2, the new build: the habitat atrium (Blender/scripts/build_l2_atrium.py), shown as an
// ENVIRONMENT PREVIEW. You arrive in the lift, the doors open, and you can walk the whole space.
// No gameplay yet: that is designed and added after the environment is approved.

const SOLID = ['COL_', 'DOOR_'];

export class HabitatSession {
  constructor(game) {
    this.game = game;
    this.ready = false;
    this.doorOpen = 0;
    this.doors = [];
    const camera = game.camera.instance;
    camera.far = 300;
    camera.updateProjectionMatrix();
    game.camera.flashlight.intensity = 0;
    game.camera.flashlight.castShadow = false;

    this._setUpRendering();
    this.controls = new PlayerController(camera, document.body, game.scene);
    game.controls = this.controls;
    this.controls.camDist = 3.8;

    const root = document.getElementById('ui-layer');
    this.loadingEl = document.createElement('div');
    this.loadingEl.id = 'level-loading';
    this.loadingEl.className = 'visible';
    this.loadingEl.innerHTML = '<div class="loading-title">LEVEL 2</div><div class="loading-sub">Habitat atrium (environment preview)</div><div class="loading-bar"><div></div></div>';
    root.appendChild(this.loadingEl);

    document.addEventListener('click', () => {
      if (game.state === 'PLAYING' && !this.controls.instance.isLocked) this.controls.lock();
    });

    Physics.create().then(async (physics) => {
      this.physics = physics;
      await this._load();
      await this._precompile();
      this.ready = true;
      this.loadingEl.classList.remove('visible');
      game.ui.showToast('Environment preview: WASD + mouse, Space jump, V switches camera. Rooms and gameplay come next.', 8000);
    }).catch((e) => console.error('Level 2 atrium failed to load.', e));
  }

  _setUpRendering() {
    const g = this.game;
    const webgl = g.renderer.instance;
    webgl.toneMapping = THREE.ACESFilmicToneMapping;
    webgl.toneMappingExposure = 0.75;
    webgl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    const size = new THREE.Vector2();
    webgl.getSize(size);
    const pr = webgl.getPixelRatio();
    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(webgl, target);
    this.composer.addPass(new RenderPass(g.scene, g.camera.instance));
    this.composer.addPass(new UnrealBloomPass(size.clone(), 0.12, 0.4, 1.0));
    this.composer.addPass(new OutputPass());
    g.renderer.render = () => {
      if (this.aria) this.aria.renderHead(webgl);   // ARIA's face, drawn offscreen for the monitors
      this.composer.render();
    };
    window.addEventListener('resize', () => this.composer.setSize(window.innerWidth, window.innerHeight));
    const pmrem = new THREE.PMREMGenerator(webgl);
    g.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    g.scene.environmentIntensity = 0.45;
    pmrem.dispose();
    g.scene.background = new THREE.Color(0xdfe7ee);
    g.scene.fog = null;
  }

  // Loads one of the level's models: collision into the physics world, then the game's materials
  async _loadModel(url) {
    const gltf = await new GLTFLoader().loadAsync(url);
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    for (const node of [...model.children]) {
      if (SOLID.some((p) => node.name.startsWith(p))) this.physics.addStaticObject(node);
      if (node.name.startsWith('COL_')) model.remove(node);
    }
    // glass and leaves: see-through glass, leaves cut out by their alpha
    model.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.name === 'white_glow') m.emissiveIntensity = 0.24;  // the skylight panel: soft, not blinding
        if (m.name === 'blue_glow') m.emissiveIntensity *= 0.55;  // LED lines: a calm accent
        if (m.name === 'aria_screen') m.emissiveIntensity *= 0.7;
        if (m.name === 'panel_mint' || m.name === 'panel_lilac') m.emissiveIntensity *= 0.3;   // soft tint, not white
        if (m.name.startsWith('palm_leaf') || m.name.startsWith('veg_') || o.name.startsWith('PLANT_')) {
          m.envMapIntensity = 0.35;     // leaves catch less of the room's reflections, so they don't look lit up
          m.roughness = Math.max(m.roughness, 0.75);
          // leaves: cut out by alpha. A low threshold plus alpha-to-coverage (the anti-aliasing blends
          // the cut edges) keeps thin leaflets from vanishing at a distance
          m.alphaTest = 0.25;
          m.alphaToCoverage = true;
          m.transparent = false;
          m.side = THREE.DoubleSide;
        } else if (m.opacity < 1) {
          m.transparent = true;
          m.depthWrite = false;
        }
      }
    });
    this.hubTextures = this.hubTextures || createHubTextures();
    applyHubMaterials(model, this.hubTextures);
    this.game.scene.add(model);
    return model;
  }

  async _load() {
    const scene = this.game.scene;
    const [atrium, lab] = await Promise.all([
      this._loadModel('./assets/models/l2-atrium.glb'),
      this._loadModel('./assets/models/l2-lab.glb')
    ]);
    this.atrium = atrium;
    this.lab = lab;

    // arrive in the lift, facing the hall (north)
    const spawn = atrium.getObjectByName('SPAWN_Lift').getWorldPosition(new THREE.Vector3());
    this.controls.attach(this.physics, spawn.setY(spawn.y + 0.1), 0);
    for (const name of ['ELEVATOR_Door_L', 'ELEVATOR_Door_R']) {
      const n = atrium.getObjectByName(name);
      if (n) this.doors.push({ node: n, closed: n.position.clone(), open: n.position.clone().add(new THREE.Vector3(name.endsWith('L') ? -1.9 : 1.9, 0, 0)) });
    }

    // the lab's sliding double doors open as you walk up to them
    this.labDoors = [];
    for (const name of ['LABDOOR_L', 'LABDOOR_R']) {
      const n = atrium.getObjectByName(name);
      if (n) this.labDoors.push({ node: n, closed: n.position.clone(), open: n.position.clone().add(new THREE.Vector3(Math.sign(n.position.x) * 1.8, 0, 0)) });
    }
    this.labDoorCentre = new THREE.Vector3(0, 5.5, -17.25);
    this.labDoorOpen = 0;

    this._addAriaScreens([atrium, lab]);
    this._setUpLab(lab);

    // the sea outside the window wall
    this.sea = new DeepSeaWindow({ radius: 17.9, a0: 62, a1: 118, bottom: 0.8, height: 4.2 });
    scene.add(this.sea.mesh);

    // soft, calm light (not glaring): a gentle sky light, the skylight panel, two fills, the lift
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8c949c, 0.38));
    // daylight-like light from the skylight: even, no hot spot on the ceiling
    const sky = new THREE.DirectionalLight(0xfaf6ee, 0.85);
    sky.position.set(4, 20, 6);
    scene.add(sky);
    for (const [x, y, z, intensity, dist] of [[10, 7, 6, 55, 30], [-10, 7, -6, 55, 30], [0, 3.2, 19.1, 10, 6]]) {
      const l = new THREE.PointLight(0xf4f9ff, intensity, dist, 2);
      l.position.set(x, y, z);
      scene.add(l);
    }
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
      height: 3.0
    }));
    const frags = find('ORGFRAG_').map((o) => o.getWorldPosition(new THREE.Vector3()));
    this.organism = new Organism(this.game.scene, tubes, frags);
    this.labScreens = new LabScreens(this.game.scene, find('PT_LabScreen_'));
    this.gooMats = [];
    lab.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name === 'Lab_Glass') {                       // glass drawn over the liquid and the organism, kept clear
        o.renderOrder = 3;
        // dark and one-sided, so it adds reflections without a milky white layer over the organism
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          m.color.set(0x0a1414);
          m.opacity = 0.2;
          m.roughness = 0.08;
          m.envMapIntensity = 0.9;
          m.side = THREE.FrontSide;
        }
      }
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.name === 'goo_glow' && !this.gooMats.includes(m)) this.gooMats.push(m);
      }
    });
    const marker = lab.getObjectByName('PT_LabLight');
    this.labLight = new THREE.PointLight(0xc8ffe8, 16, 13, 2);
    if (marker) marker.getWorldPosition(this.labLight.position);
    this.game.scene.add(this.labLight);
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

  update(delta) {
    if (!this.ready || !this.controls.ready) return;
    const g = this.game;
    const dt = Math.min(delta, 0.05);
    const playing = g.state === 'PLAYING';
    if (playing || g.state === 'WAKING') this.controls.update(dt, playing);
    // the lift doors slide open once you can move
    if (playing && this.doorOpen < 1) {
      this.doorOpen = Math.min(1, this.doorOpen + dt / 1.6);
      const t = this.doorOpen * this.doorOpen * (3 - 2 * this.doorOpen);
      for (const d of this.doors) d.node.position.lerpVectors(d.closed, d.open, t);
    }
    this.sea.update(dt, g.camera.instance);
    // the lab doors slide open when you are near them
    const near = this.controls.position.distanceTo(this.labDoorCentre) < 4;
    this.labDoorOpen = THREE.MathUtils.clamp(this.labDoorOpen + (near ? dt : -dt) / 0.7, 0, 1);
    const ld = this.labDoorOpen * this.labDoorOpen * (3 - 2 * this.labDoorOpen);
    for (const d of this.labDoors) d.node.position.lerpVectors(d.closed, d.open, ld);
    // the organism, its readings, the spills and the lab light all follow its surges
    this.organism.update(dt);
    const surge = this.organism.surge;
    this.labScreens.update(dt, surge);
    for (const m of this.gooMats) m.emissiveIntensity = 0.3 + 0.12 * Math.sin(this.organism.time * 2.3) + surge * 0.7;
    this.labLight.intensity = 16 + surge * 22;
    // ARIA idles on every screen (not AriaManager.update, which shows her on the nearest one only)
    this.aria.ariaMaterial.uniforms.uTime.value += dt;
    if (this.aria.useHead) this.aria.head.update(dt);
    g.reticle.classList.toggle('visible', this.controls.view === 'first');
  }
}

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
    g.renderer.render = () => this.composer.render();
    window.addEventListener('resize', () => this.composer.setSize(window.innerWidth, window.innerHeight));
    const pmrem = new THREE.PMREMGenerator(webgl);
    g.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    g.scene.environmentIntensity = 0.45;
    pmrem.dispose();
    g.scene.background = new THREE.Color(0xdfe7ee);
    g.scene.fog = null;
  }

  async _load() {
    const scene = this.game.scene;
    const gltf = await new GLTFLoader().loadAsync('./assets/models/l2-atrium.glb');
    const atrium = gltf.scene;
    atrium.updateMatrixWorld(true);
    for (const node of [...atrium.children]) {
      if (SOLID.some((p) => node.name.startsWith(p))) this.physics.addStaticObject(node);
      if (node.name.startsWith('COL_')) atrium.remove(node);
    }
    // glass and leaves: see-through glass, leaves cut out by their alpha
    atrium.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.name === 'white_glow') m.emissiveIntensity = 0.24;  // the skylight panel: soft, not blinding
        if (m.name === 'blue_glow') m.emissiveIntensity *= 0.55;  // LED lines: a calm accent
        if (m.name === 'aria_screen') m.emissiveIntensity *= 0.7;
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
    applyHubMaterials(atrium, createHubTextures());
    scene.add(atrium);
    this.atrium = atrium;

    // arrive in the lift, facing the hall (north)
    const spawn = atrium.getObjectByName('SPAWN_Lift').getWorldPosition(new THREE.Vector3());
    this.controls.attach(this.physics, spawn.setY(spawn.y + 0.1), 0);
    for (const name of ['ELEVATOR_Door_L', 'ELEVATOR_Door_R']) {
      const n = atrium.getObjectByName(name);
      if (n) this.doors.push({ node: n, closed: n.position.clone(), open: n.position.clone().add(new THREE.Vector3(name.endsWith('L') ? -1.9 : 1.9, 0, 0)) });
    }

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
    g.reticle.classList.toggle('visible', this.controls.view === 'first');
  }
}

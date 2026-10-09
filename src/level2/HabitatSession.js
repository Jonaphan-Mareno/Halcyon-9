import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { Physics } from '../core/Physics.js';
import { PlayerController } from '../player/PlayerController.js';
import { createHubTextures, applyHubMaterials } from '../graphics/HubMaterials.js';
import { VideoWindow } from '../graphics/VideoWindow.js';
import { AriaManager } from '../entities/AriaManager.js';
import { Organism } from './Organism.js';
import { LabScreens } from './LabScreens.js';
import { HoloScreens } from './HoloScreens.js';
import { Sparks } from './Sparks.js';
import '../ui/level2.css';

// Level 2, the new build: the habitat atrium (Blender/scripts/build_l2_atrium.py), shown as an
// ENVIRONMENT PREVIEW. You arrive in the lift, the doors open, and you can walk the whole space.
// No gameplay yet: that is designed and added after the environment is approved.

const SOLID = ['COL_', 'DOOR_'];

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
    // shadows from the lab's ceiling light only, drawn once (nothing in the lab moves), so they cost
    // almost nothing per frame
    webgl.shadowMap.enabled = true;
    webgl.shadowMap.type = THREE.PCFShadowMap;
    webgl.shadowMap.autoUpdate = false;
    // Performance (measured on Intel UHD 620): 4x MSAA cost ~9 ms a frame, so edges are smoothed
    // by FXAA instead (~1 ms). The glow (bloom) is dropped automatically on slow machines.
    webgl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
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
    const gltf = await new GLTFLoader().loadAsync(url);
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    for (const node of [...model.children]) {
      if (SOLID.some((p) => node.name.startsWith(p))) this.physics.addStaticObject(node);
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
            leafCache.set(m, new THREE.MeshLambertMaterial({
              name: m.name, color: m.color, map: m.map || null, alphaTest: 0.25, side: THREE.DoubleSide
            }));
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
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8c949c, 0.42));
    // daylight-like light from the skylight: even, no hot spot on the ceiling
    // (the main light, so its shadows read; the sky light and reflections are the soft fill)
    const sky = new THREE.DirectionalLight(0xfaf6ee, 1.9);
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
    // the organism, its readings and the spills follow its surges. Only animated while you are in
    // or near the lab (redrawing the screens costs time); the lab is north of the gallery door.
    const p = this.controls.position;
    const nearLab = p.y > 4 && p.z < -12;
    if (nearLab) {
      this.organism.update(dt);
      this.labScreens.update(dt, this.organism.surge);
      this.holoScreens.update(dt, this.organism.surge);
      for (const m of this.gooMats) m.emissiveIntensity = 0.3 + 0.12 * Math.sin(this.organism.time * 2.3) + this.organism.surge * 0.7;
    }
    // sparks crackle from the damaged wiring; the dangling light stutters, cutting out on each crackle
    this.sparks.update(dt);
    if (this.sparks.burstNow) this.flicker = 0.35;
    this.flicker = Math.max(0, this.flicker - dt);
    const buzz = this.flicker > 0 ? (Math.random() < 0.5 ? 0.05 : 1.6) : (Math.random() < 0.015 ? 0.1 : 1.0);
    for (const m of this.flickerMats) m.emissiveIntensity = buzz * 1.4;
    // ARIA idles on every screen (not AriaManager.update, which shows her on the nearest one only)
    this.aria.ariaMaterial.uniforms.uTime.value += dt;
    if (this.aria.useHead) this.aria.head.update(dt);
    g.reticle.classList.toggle('visible', this.controls.view === 'first');
    this._perf(delta, playing);
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
      this.composer.setSize(window.innerWidth, window.innerHeight);
      const pr = webgl.getPixelRatio();
      this.fxaa.material.uniforms.resolution.value.set(1 / (window.innerWidth * pr), 1 / (window.innerHeight * pr));
      this.qualityStep = 2;
    }
  }
}

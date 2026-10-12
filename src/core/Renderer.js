import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

// The WebGL renderer, shared by both levels.
//
// Performance (measured on Intel UHD 620, the weakest machine we target): 4x MSAA cost about a
// third of a level 1 frame at 1080p, so it is off; edges are smoothed by FXAA (about 1 ms)
// instead, as level 2 already did. The resolution can be scaled down on the fly (setScale) when a
// machine cannot keep up (see PerfMonitor).
export class Renderer {
  constructor() {
    const container = document.getElementById('app');

    this.instance = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    // At most one rendered pixel per screen pixel: Windows display scaling (125%, 150%) would
    // otherwise multiply the pixels drawn by 1.5-2x, for detail FXAA mostly smooths away anyway
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1);
    this.scale = 1;
    this.instance.setPixelRatio(this.maxPixelRatio);
    this.instance.setSize(window.innerWidth, window.innerHeight);
    this.instance.shadowMap.enabled = true;
    this.instance.shadowMap.type = THREE.PCFShadowMap;
    this.composer = null;

    container.appendChild(this.instance.domElement);

    window.addEventListener('resize', () => this.onWindowResize(), false);
  }

  // Level 1's frame: the scene into an offscreen image, the output pass (colour space) and FXAA.
  // (Half-float image: the dark power-off scenes would band in 8 bits.)
  usePost(scene, camera) {
    const r = this.instance;
    const size = r.getSize(new THREE.Vector2());
    const pr = r.getPixelRatio();
    this._target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(r, this._target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(new OutputPass());
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaa);
    this._fitFxaa();
  }

  // Level 2 brings its own post-processing
  disposePost() {
    if (!this.composer) return;
    for (const pass of this.composer.passes) pass.dispose?.();
    this.composer.dispose();
    this.composer = null;
  }

  // Render at a fraction of full resolution (1 = full; FXAA and the browser smooth the upscale)
  setScale(scale) {
    this.scale = scale;
    this.instance.setPixelRatio(this.maxPixelRatio * scale);
    if (this.composer) {
      this.composer.setPixelRatio(this.instance.getPixelRatio());
      this.composer.setSize(window.innerWidth, window.innerHeight);
      this._fitFxaa();
    }
  }

  _fitFxaa() {
    const p = this.instance.getPixelRatio();
    this.fxaa?.material.uniforms.resolution.value.set(1 / (window.innerWidth * p), 1 / (window.innerHeight * p));
  }

  onWindowResize() {
    this.instance.setSize(window.innerWidth, window.innerHeight);
    if (this.composer) {
      this.composer.setSize(window.innerWidth, window.innerHeight);
      this._fitFxaa();
    }
  }

  render(scene, camera) {
    if (this.composer) this.composer.render();
    else this.instance.render(scene, camera);
  }
}

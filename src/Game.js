import * as THREE from 'three';
import { Renderer } from './core/Renderer.js';
import { Camera } from './core/Camera.js';
import { Controls } from './core/Controls.js';
import { Level1 } from './levels/Level1.js';

export class Game {
  constructor() {
    this.state = 'INIT'; // INIT, PLAYING, GAME_OVER
    this.lastTime = performance.now();

    this.width = window.innerWidth;
    this.height = window.innerHeight;
  }

  init() {
    console.log('Halcyon-9 initialized.');

    // Core systems
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.05);

    this.camera = new Camera(this.width / this.height);
    this.camera.instance.position.set(0, 3, 0); // adjust ctor args to match your Camera class
    this.renderer = new Renderer();

    // Load first level
    this.currentLevel = new Level1(this.scene);

    // Controls
    this.controls = new Controls(this.camera.instance, document.body, this.currentLevel);

    // Handle resize
    window.addEventListener('resize', () => this.onResize());

    this.raycaster = new THREE.Raycaster();
    this.center = new THREE.Vector2(0, 0);
    this.reticle = document.getElementById('reticle');

     document.addEventListener('click', () => this.onClick());

    this.startLoop();
  }

  onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.camera.instance.aspect = this.width / this.height;
    this.camera.instance.updateProjectionMatrix();
  }

  lockControls() {
    if (this.controls) {
      this.controls.lock();
      this.state = 'PLAYING';
      this.reticle.classList.add('visible');
    }
  }

  startLoop() {
    const loop = (time) => {
      requestAnimationFrame(loop);
      const delta = (time - this.lastTime) / 1000;
      this.lastTime = time;
      this.update(delta);
      this.renderer.render(this.scene, this.camera.instance);
    };
    requestAnimationFrame(loop);
  }

  update(delta) {
    if (this.state === 'PLAYING') {
      this.controls.update(delta);
      if (this.currentLevel) {
        this.currentLevel.update(delta);
      }
      this.updateReticle();
    }
  }

  updateReticle() {
    this.raycaster.setFromCamera(this.center, this.camera.instance);
    const targets = this.currentLevel.interactables || [];
    const hits = this.raycaster.intersectObjects(targets, true);
    this.reticle.classList.toggle('active', hits.length > 0);
  }

  onClick() {
    if (this.state !== 'PLAYING') return;
    this.raycaster.setFromCamera(this.center, this.camera.instance);
    const targets = this.currentLevel.interactables || [];
    const hits = this.raycaster.intersectObjects(targets, true);
    if (hits.length > 0) {
      console.log("You clicked", hits[0].object.name);
      this.currentLevel.onInteract?.(hits[0].object);
    }
  }



}
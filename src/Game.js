import * as THREE from 'three';
import { Renderer } from './core/Renderer.js';
import { Camera } from './core/Camera.js';
import { Controls } from './core/Controls.js';
import { Level1 } from './levels/Level1.js';

export class Game {
  constructor() {
    this.state = 'INIT'; // INIT, PLAYING, GAME_OVER
    this.lastTime = performance.now();
  }

  init() {
    console.log('Halcyon-9 initialized.');
    
    // Core systems
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.05);
    
    this.camera = new Camera();
    this.renderer = new Renderer();
    
    // Controls
    this.controls = new Controls(this.camera.instance, document.body);
    
    // Load first level
    this.currentLevel = new Level1(this.scene);
    
    this.startLoop();
  }
  
  lockControls() {
    if (this.controls) {
      this.controls.lock();
      this.state = 'PLAYING';
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
    }
  }
}

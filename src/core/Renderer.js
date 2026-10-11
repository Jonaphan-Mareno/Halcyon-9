import * as THREE from 'three';

export class Renderer {
  constructor() {
    const container = document.getElementById('app');
    
    this.instance = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    // Capped: on high-DPI laptop screens the full ratio costs far more than it shows
    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.instance.setSize(window.innerWidth, window.innerHeight);
    this.instance.shadowMap.enabled = true;
    this.instance.shadowMap.type = THREE.PCFShadowMap;
    
    container.appendChild(this.instance.domElement);

    window.addEventListener('resize', () => this.onWindowResize(), false);
  }

  onWindowResize() {
    this.instance.setSize(window.innerWidth, window.innerHeight);
  }

  render(scene, camera) {
    this.instance.render(scene, camera);
  }
}

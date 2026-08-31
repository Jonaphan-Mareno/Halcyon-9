import * as THREE from 'three';

export class Renderer {
  constructor() {
    const container = document.getElementById('app');
    
    this.instance = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.instance.setPixelRatio(window.devicePixelRatio);
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

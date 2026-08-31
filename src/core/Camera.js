import * as THREE from 'three';

export class Camera {
  constructor() {
    this.instance = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.instance.position.set(0, 1.6, 0); // Average eye height

    // Add a flashlight (SpotLight) attached to the camera
    this.flashlight = new THREE.SpotLight(0xffffff, 100);
    this.flashlight.position.set(0, 0, 0);
    this.flashlight.angle = Math.PI / 6;
    this.flashlight.penumbra = 0.5;
    this.flashlight.decay = 2;
    this.flashlight.distance = 50;
    this.flashlight.castShadow = true;
    
    // Attach flashlight to camera
    this.instance.add(this.flashlight);
    this.instance.add(this.flashlight.target);
    this.flashlight.target.position.set(0, 0, -1);

    window.addEventListener('resize', () => this.onWindowResize(), false);
  }

  onWindowResize() {
    this.instance.aspect = window.innerWidth / window.innerHeight;
    this.instance.updateProjectionMatrix();
  }
}

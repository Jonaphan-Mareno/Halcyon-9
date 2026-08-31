import * as THREE from 'three';

export class Level1 {
  constructor(scene) {
    this.name = 'Reboot';
    this.scene = scene;
    
    this.buildRoom();
    this.addLighting();
  }

  buildRoom() {
    // Create a 10x10x4 room
    const roomGeometry = new THREE.BoxGeometry(10, 4, 10);
    // Render inside of the box
    const roomMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x223344,
      roughness: 0.8,
      metalness: 0.2,
      side: THREE.BackSide 
    });
    
    this.room = new THREE.Mesh(roomGeometry, roomMaterial);
    this.room.position.set(0, 2, 0); // Floor at y=0
    this.room.receiveShadow = true;
    this.scene.add(this.room);

    // Add a simple object to interact with/look at (placeholder)
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    this.box = new THREE.Mesh(boxGeo, boxMat);
    this.box.position.set(0, 0.5, -3);
    this.box.castShadow = true;
    this.box.receiveShadow = true;
    this.scene.add(this.box);
  }

  addLighting() {
    // Dim ambient light (increased to make room visible)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(ambientLight);

    // Emergency red light (higher intensity for physically correct lighting)
    this.emergencyLight = new THREE.PointLight(0xff0000, 50, 10);
    this.emergencyLight.position.set(2, 3.5, 2);
    this.emergencyLight.castShadow = true;
    this.scene.add(this.emergencyLight);
    
    // Animate emergency light
    this.time = 0;
  }

  update(delta) {
    // Flicker emergency light
    this.time += delta;
    this.emergencyLight.intensity = 50 + Math.sin(this.time * 5) * 10;
  }
}

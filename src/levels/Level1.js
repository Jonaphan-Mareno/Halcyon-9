
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/Addons.js";



export class Level1{

  constructor(scene){
    this.name = 'Control Room';
    this.scene = scene;

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.room = null;
    this.bounds = null;

    this.lights = [];
    this.LightsPuzzle = [];

    this.buildRoom();
    this.addLighting();
  }

  defaultRoom(){
    //Default room
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

    const box = new THREE.Box3().setFromObject(this.room);
    this.bounds = { minX: box.min.x, maxX: box.max.x, 
          minY: box.min.y , maxY: box.min.y,
          minZ: box.min.z, maxZ: box.max.z };

    // Add a simple object to interact with/look at (placeholder)
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    this.box = new THREE.Mesh(boxGeo, boxMat);
    this.box.position.set(0, 0.5, -3);
    this.box.castShadow = true;
    this.box.receiveShadow = true;
    this.scene.add(this.box);

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

  async buildRoom(){
    try {
      const gltfLoader = new GLTFLoader();
      const roomGlb = await gltfLoader.loadAsync('/assets/models/controlroom.glb');
      const ctrlRoom = roomGlb.scene;
      
      const box = new THREE.Box3().setFromObject(ctrlRoom);
      this.bounds = { minX: box.min.x, maxX: box.max.x, 
        minY: box.min.y , maxY: box.min.y,
        minZ: box.min.z, maxZ: box.max.z };

      // some checks
      console.log(ctrlRoom);
      // console.log('min:', box.min, 'max:', box.max);
      //

      this.room = ctrlRoom;
      this.room.position.set(0, 0, 0);
      
      ctrlRoom.traverse((child) => {
        if(child.isMesh){
          child.castShadow = true;
          child.receiveShadow = true;
        }
        
        //for now but when puzzle has been implemented do this dynamically
        if(child.isLight){
          this.lights.push(child);
          child.intensity = 5; // set to five for checking , set to zero when done later
        }
        
        //the interactables for lights
        if(child.name == "Plane066"){
          this.LightsPuzzle.push(child);
        }

      });

      console.log('LightsPuzzle found:', this.LightsPuzzle);
      this.scene.add(this.room);

    } catch (error) {
        console.error('Failed to load controlroom.glb:', error);
        console.log('Stuck in purgatory')
        this.defaultRoom();
    }
    
  }

  getBounds(){
    return this.bounds;
  }

  get interactables() {
    return this.LightsPuzzle;
  }

  onInteract(object) {
    if (this.LightsPuzzle.includes(object)) {
      console.log("You clicked on one of the puzzle fixtures", object.name);
    }
  }


  addLighting(){
    // implement later
  }

  update(delta) {
    this.time += delta;
    if (this.emergencyLight) {
      this.emergencyLight.intensity = 50 + Math.sin(this.time * 5) * 10;
    }
  }


}
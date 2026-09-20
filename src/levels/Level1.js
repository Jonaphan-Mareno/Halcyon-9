import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import { Shaders } from "../graphics/Shaders";

// Must match MAX_LIGHTS in Shaders.js
const MAX_LIGHTS = 8;

export class Level1{

  constructor(scene){
    this.name = 'Control Room';
    this.scene = scene;

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.room = null;
    this.bounds = null;

    this.shaderMaterials = []
    this.lights = [];
    this.LightsPuzzle = [];

    // Reusable light data for update() so it doesn't allocate every frame
    this._lightWorldPos = new THREE.Vector3();
    this._lightWorldPositions = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3());
    this._lightWorldColors = Array.from({ length: MAX_LIGHTS }, () => new THREE.Color());
    this._lightWorldIntensities = new Array(MAX_LIGHTS).fill(0);

    this.time = 0;

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
          minY: box.min.y, maxY: box.max.y,
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
        minY: box.min.y, maxY: box.max.y,
        minZ: box.min.z, maxZ: box.max.z };

      // some checks
     console.log(ctrlRoom);
      // console.log('min:', box.min, 'max:', box.max);
      //

      this.room = ctrlRoom;
      this.room.position.set(0, 0, 0);

      console.log(Shaders.vertexShader);
      console.log(Shaders.fragmentShader);

      ctrlRoom.traverse((child) => {
        // GLTFLoader strips dots from node names ("Plane.066" -> "Plane066")
        const cleanName = child.name.replace(/\./g, '');

        if(child.isMesh){

          //material log
          console.log(child.name, {
            map: child.material.map,
            color: child.material.color,
            materialType: child.material.type
          });
          //

          child.castShadow = true;
          // NOTE: ShaderMaterial has no shadow chunks yet, so nothing actually
          // receives shadows; flags kept for when the shader supports it
          child.receiveShadow = true;

          const originalColor = child.material.color
          ? child.material.color.clone()
          : new THREE.Color(0xffffff);

          // Plane.066-.071 are six meshes stacked on the exact same transform
          // in the GLB, which z-fights and flickers. A deterministic per-layer
          // depth offset makes one layer win the depth test consistently.
          const stackMatch = cleanName.match(/^Plane0(6[6-9]|7[01])$/);
          const stackLayer = stackMatch ? Number(cleanName.slice(-2)) - 66 : -1;

          const shaderMat = new THREE.ShaderMaterial({
            uniforms: {
              baseColor: { value: originalColor },
              ambientColor: { value: new THREE.Color(0x222222) },
              numLights: { value: 0 },
              lightPositions: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()) },
              lightColors: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Color()) },
              lightIntensities: { value: new Array(MAX_LIGHTS).fill(0) }
            },
            // GLB materials are all double-sided; the default FrontSide would
            // cull wall/panel faces seen from behind and make them vanish
            side: THREE.DoubleSide,
            vertexShader: Shaders.vertexShader,
            fragmentShader: Shaders.fragmentShader,
            ...(stackLayer >= 0 ? {
              polygonOffset: true,
              polygonOffsetFactor: stackLayer + 1,
              polygonOffsetUnits: stackLayer + 1
            } : {})
          });

          child.material = shaderMat;
          this.shaderMaterials.push(shaderMat);
        }
        
        //for now but when puzzle has been implemented do this dynamically
        // (GLB has 7 point lights + 1 directional "Sun"; the shader treats
        // every light as positional, so the far Sun contributes almost nothing)
        if(child.isLight){
          this.lights.push(child);
          child.intensity = 15; // set to five for checking , set to zero or -5 when done later
        }
        
        //the interactables for lights
        if(cleanName == "Plane066"){
          this.LightsPuzzle.push(child);
        }

      });

      //console.log('LightsPuzzle found:', this.LightsPuzzle);
      console.log(this.lights.length);
      if (this.lights.length > MAX_LIGHTS) {
        console.warn(`Control room has ${this.lights.length} lights but the shader supports ${MAX_LIGHTS}; extra lights are ignored.`);
      }
      this.scene.add(this.room);

      // Populate the light uniforms right away: update() only runs while
      // PLAYING, so otherwise the room pops from ambient-only to lit on start
      this.update(0);

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

    const count = Math.min(this.lights.length, MAX_LIGHTS);

    // Gather light data once per frame instead of once per material
    for (let i = 0; i < count; i++) {
      const light = this.lights[i];
      light.getWorldPosition(this._lightWorldPos);
      this._lightWorldPositions[i].copy(this._lightWorldPos);
      this._lightWorldColors[i].copy(light.color);
      this._lightWorldIntensities[i] = light.intensity;
    }

    for (const mat of this.shaderMaterials) {
      mat.uniforms.numLights.value = count;
      for (let i = 0; i < count; i++) {
        mat.uniforms.lightPositions.value[i].copy(this._lightWorldPositions[i]);
        mat.uniforms.lightColors.value[i].copy(this._lightWorldColors[i]);
        mat.uniforms.lightIntensities.value[i] = this._lightWorldIntensities[i];
      }
    }
  }


}
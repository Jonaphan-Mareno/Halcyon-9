import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Shaders } from "../graphics/Shaders";
import { AriaManager } from "../entities/AriaManager.js";
import { Sparks } from "../effects/Sparks.js";
import { RingPuzzle } from "../entities/RingPuzzle.js";

// Must match MAX_LIGHTS in Shaders.js (the room's 8 lights + the flashlight)
const MAX_LIGHTS = 9;

// Brightness of each room light at full power. Before the generator is fixed
// the lights sit at DIM_LEVEL of this, except two emergency lights that stutter.
const LIGHT_FULL = 5;
const DIM_LEVEL = 0.04;

// Flashlight: a spotlight that follows the camera once the torch is picked up
const FLASH_INTENSITY = 26;
const FLASH_OUTER_COS = Math.cos(THREE.MathUtils.degToRad(30));
const FLASH_INNER_COS = Math.cos(THREE.MathUtils.degToRad(13));

// The power relay: four linked rings around the generator. Each turns in
// 45-degree steps; the puzzle is solved when every marker faces the rail.
const RELAY_RING_HEIGHTS = [1.3, 1.95, 2.6, 3.25];
const RELAY_RADIUS = 1.95;
const RELAY_STEPS = 8;

// Where the torch lies: on the floor in front of ARIA's wall monitor
const TORCH_XZ = new THREE.Vector2(1.2, -7.3);

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
    //this.keypadInteractables = [];
    this.keypad = null;
    this.doorMixer = null;
    this.doorActions = [];
    this.doorOpened = false;

    this.ringPuzzle = null;          // the wall panel puzzle (RingPuzzle)
    this.ringPuzzleSolved = false;   // ARIA stays off until this is true
    this.onOpenRingPuzzle = null;    // set by the Game: zooms in on the panel
    this.onRingPuzzleSolved = null;  // set by the Game

    // Clickable things in range: the generator pad, ARIA's wall monitor and
    // the torch. Built after the models load (the Game reads it every frame).
    this._interactables = [];
    this.wallMonitor = null;
    this.talkEnabled = true;       // false once the intro conversation is done
    this.onTalkToAria = null;      // set by the Game
    this.onInspectGenerator = null; // set by the Game: opens the cable puzzle
    this.onLockedHint = null;      // set by the Game: shows a "do this first" message
    
    this.onUseKeypad = null;

    // Torch and flashlight
    this.torch = null;             // group lying on the floor until picked up
    this.hasTorch = false;
    this.flashlightOn = false;
    this.onTorchPickedUp = null;   // set by the Game (shows a hint)

    // Reusable light data for update() so it doesn't allocate every frame
    this._lightWorldPos = new THREE.Vector3();
    this._lightWorldPositions = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3());
    this._lightWorldDirs = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3(0, -1, 0));
    this._lightCones = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector2(-2, -2));
    this._lightWorldColors = Array.from({ length: MAX_LIGHTS }, () => new THREE.Color());
    this._lightWorldIntensities = new Array(MAX_LIGHTS).fill(0);
    this._flashColor = new THREE.Color(0xfff2d8);
    this._torchGlowPos = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
    this._camRight = new THREE.Vector3();
    this._camUp = new THREE.Vector3();

    // The broken generator: its glowing rings pulse and stutter and sparks fly,
    // until power is restored
    this.cables = [];              // { mat, phase } for each glowing ring mesh
    this.generatorParts = [];      // the pillar meshes the player inspects
    this.sparks = new Sparks(scene);
    this._generatorCentre = new THREE.Vector3();
    this._monitorCentre = new THREE.Vector3();
    this._waypoint = { position: new THREE.Vector3(), label: '' };

    // The cable puzzle's effects on the world
    this.failures = 0;             // failed attempts: the sparking gets more frantic
    this.stress = 0;               // 0..1 as the countdown runs down
    this._pulseTime = 0;           // pulses faster the more stress there is
    this._blackoutUntil = 0;       // game time the lights come back after an overload
    this._overloadUntil = 0;       // game time the rings stop flashing red

    // Two stages of repair: the wiring (cable puzzle), then the relay rings
    this.cablesFixed = false;
    this.relaySolved = false;
    this.relay = null;             // { root, rings: [{ group, marker... }] }
    this._relayCheckAt = -1;       // game time to check the alignment (after the turn animation)
    this._sequenceStart = -1;      // game time the lights start coming back one by one
    this.onRingTurned = null;      // set by the Game (sound)
    this.onRelayAligned = null;    // set by the Game (ARIA reacts)
    this._generatorRadius = 0;
    this._sparkTimer = 1;
    this._sparkOrigin = new THREE.Vector3();
    this._sparkOutward = new THREE.Vector3();

    // Which room lights keep working (stuttering) while the power is out
    this._flicker = new Set();

    this.time = 0;

    // Station power: 0 = dead (dim room, few LED strips flicker), 1 = fully lit.
    // The power puzzle calls setPower(1); update() eases power toward the target.
    this.power = 0;
    this.powerTarget = 0;

    this.buildRoom();
    this.addLighting();

    // Initialize ARIA System globally for this level
    this.ariaManager = new AriaManager(this.scene);
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

  // The look shared by everything in the level: the team's toon shader, driven
  // by the level's lights. Carries over textures from the GLB material.
  _makeLevelMaterial(originalMat, stackLayer = -1) {
    const originalColor = originalMat.color
      ? originalMat.color.clone()
      : new THREE.Color(0xffffff);

    // Carry the GLB material's textures into the custom shader so maps
    // baked in Blender show up without extra wiring
    const map = originalMat.map || null;
    const normalMap = originalMat.normalMap || null;
    const emissiveMap = originalMat.emissiveMap || null;

    const shaderMat = new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: originalColor },
        ambientColor: { value: new THREE.Color(0x222222) },
        map: { value: map },
        hasMap: { value: map ? 1 : 0 },
        normalMap: { value: normalMap },
        hasNormalMap: { value: normalMap ? 1 : 0 },
        normalScale: { value: 1.0 },
        emissiveMap: { value: emissiveMap },
        hasEmissiveMap: { value: emissiveMap ? 1 : 0 },
        emissiveColor: { value: originalMat.emissive ? originalMat.emissive.clone() : new THREE.Color(0x33ccff) },
        uvRepeat: { value: new THREE.Vector2(1, 1) },
        glowColor: { value: new THREE.Color(0, 0, 0) },
        glowAmount: { value: 0 },
        uPower: { value: this.power },
        uTime: { value: 0 },
        numLights: { value: 0 },
        lightPositions: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()) },
        lightDirs: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3(0, -1, 0)) },
        lightCones: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector2(-2, -2)) },
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

    this.shaderMaterials.push(shaderMat);
    return shaderMat;
  }

  async buildRoom(){
    try {
      const gltfLoader = new GLTFLoader();
      const roomGlb = await gltfLoader.loadAsync('./assets/models/controlroom.glb');
      const ctrlRoom = roomGlb.scene;

      const box = new THREE.Box3().setFromObject(ctrlRoom);
      this.bounds = { minX: box.min.x, maxX: box.max.x,
        minY: box.min.y, maxY: box.max.y,
        minZ: box.min.z, maxZ: box.max.z };

      this.room = ctrlRoom;
      this.room.position.set(0, 0, 0);
      this.setupDoorAnimation(roomGlb.animations);

      ctrlRoom.traverse((child) => {
        // GLTFLoader strips dots from node names ("Plane.066" -> "Plane066")
        const cleanName = child.name.replace(/\./g, '');

        if (child.isMesh) {
          const worldPos = new THREE.Vector3();
          child.getWorldPosition(worldPos);

          console.log(
            'ROOM MESH:',
            child.name,
            worldPos
          );
        }
        if(child.isMesh){
          child.castShadow = true;
          // NOTE: ShaderMaterial has no shadow chunks yet, so nothing actually
          // receives shadows; flags kept for when the shader supports it
          child.receiveShadow = true;

          // Plane.066-.071 are six meshes stacked on the exact same transform
          // in the GLB, which z-fights and flickers. A deterministic per-layer
          // depth offset makes one layer win the depth test consistently.
          const stackMatch = cleanName.match(/^Plane0(6[6-9]|7[01])$/);
          const stackLayer = stackMatch ? Number(cleanName.slice(-2)) - 66 : -1;

          child.material = this._makeLevelMaterial(child.material, stackLayer);

          // The generator's glowing rings (Circle001-004: cyan, green, cyan and a
          // green base ring). Unlit by default, they glow in their own colour so
          // they can pulse like failing power couplings.
          if (/^Circle00[1-4]$/.test(cleanName)) {
            const u = child.material.uniforms;
            u.ambientColor.value.setScalar(0.02);
            u.glowColor.value.copy(u.baseColor.value).multiplyScalar(1.5);
            this.cables.push({ mat: child.material, phase: this.cables.length * 1.9, base: u.glowColor.value.clone() });
          }
        }

        // (GLB has 7 point lights + 1 directional "Sun"; the shader treats
        // every light as positional, so the far Sun contributes almost nothing.
        // Brightness is set every frame in update(), from the power level.)
        if(child.isLight){
          this.lights.push(child);
        }

        //the interactables for lights (the wall pad next to the monitor)
        if(cleanName == "Plane066"){
          this.LightsPuzzle.push(child);
        }

        // The generator pillar the player walks up to and inspects
        if (child.isMesh && (cleanName === 'Circle' || cleanName === 'pillar' || cleanName === 'pillar002')) {
          this.generatorParts.push(child);
        }

      });

      if (this.lights.length > MAX_LIGHTS - 1) {
        console.warn(`Control room has ${this.lights.length} lights but the shader has room for ${MAX_LIGHTS - 1} plus the flashlight; extra lights are ignored.`);
      }
      this.scene.add(this.room);
      this.buildKeypad();
      this.room.updateMatrixWorld(true);

      // Collect monitor screens from the 3D model
      if (this.ariaManager) {
        this.ariaManager.collectMonitors(this.room);
        // Voss wakes up with ARIA on the wall monitor in front of him;
        // call unpinMonitor() after the intro so she follows the player
        this.ariaManager.pinMonitor('Monitor_wall_01');
        this.wallMonitor = this.ariaManager.pinnedMonitor;
      }

      this._measureGenerator();
      if (this.wallMonitor) new THREE.Box3().setFromObject(this.wallMonitor).getCenter(this._monitorCentre);
      this._pickFlickeringLights();
      try { this._buildRingPuzzle(); } catch (e) { console.error('Ring puzzle failed to build:', e); }
      this._rebuildInteractables();
      this._loadTorch();
      this._buildRelay();

      // Populate the light uniforms right away: update() only runs while
      // PLAYING, so otherwise the room pops from ambient-only to lit on start
      this.update(0, new THREE.Vector3());

    } catch (error) {
        console.error('Failed to load controlroom.glb:', error);
        console.log('Stuck in purgatory')
        this.defaultRoom();
    }

  }

  // Where the glowing rings sit on the generator: sparks fly from around here
  _measureGenerator() {
    const box = new THREE.Box3();
    this.room.traverse((c) => {
      if (c.isMesh && /^Circle00[1-3]$/.test(c.name.replace(/\./g, ''))) box.expandByObject(c);
    });
    if (box.isEmpty()) return;
    box.getCenter(this._generatorCentre);
    const size = box.getSize(new THREE.Vector3());
    this._generatorRadius = Math.max(size.x, size.z) * 0.5;
  }

  // With the power out, the light nearest the player's start and the one
  // nearest ARIA's monitor keep working (stuttering): they lead the way.
  _pickFlickeringLights() {
    const nearest = (target) => {
      let best = -1;
      let bestDist = Infinity;
      this.lights.forEach((light, i) => {
        light.getWorldPosition(this._lightWorldPos);
        const d = this._lightWorldPos.distanceTo(target);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      return best;
    };
    this._flicker.clear();
    this._flicker.add(nearest(new THREE.Vector3(0, 3, 0)));
    if (this.wallMonitor) {
      // Box centre, not getWorldPosition: the mesh's node origin sits at the
      // generator, since Blender gave these objects a shared origin
      const centre = new THREE.Box3().setFromObject(this.wallMonitor).getCenter(new THREE.Vector3());
      this._flicker.add(nearest(centre));
    }
  }

  // The torch, modelled in Blender, lying on the floor near ARIA
  async _loadTorch() {
    try {
      const glb = await new GLTFLoader().loadAsync('./assets/models/torch.glb');
      const model = glb.scene;
      model.traverse((child) => {
        if (child.isMesh) child.material = this._makeLevelMaterial(child.material);
      });

      // The model keeps its Blender offset, so centre it in a wrapper group
      // (resting on y = 0) and move the wrapper instead
      model.updateMatrixWorld(true);
      const modelBox = new THREE.Box3().setFromObject(model);
      const modelCentre = modelBox.getCenter(new THREE.Vector3());
      model.position.set(-modelCentre.x, -modelBox.min.y, -modelCentre.z);
      const group = new THREE.Group();
      group.name = 'Torch';
      group.add(model);

      // Find the floor under the spot. The ray starts at head height: from
      // the top of the building it would hit the roof.
      const ray = new THREE.Raycaster(
        new THREE.Vector3(TORCH_XZ.x, 3, TORCH_XZ.y),
        new THREE.Vector3(0, -1, 0)
      );
      const hit = ray.intersectObject(this.room, true)[0];
      const floorY = hit ? hit.point.y : this.bounds.minY;
      group.rotation.y = 0.55;
      group.position.set(TORCH_XZ.x, floorY, TORCH_XZ.y);

      this.torch = group;
      this.scene.add(group);
      this._rebuildInteractables();
    } catch (error) {
      console.error('Failed to load torch.glb:', error);
    }
  }

  _buildRingPuzzle() {
    const makeMaterial = (hex, { glow = 0, glowHex = hex, lit = 0.45 } = {}) => {
    const m = this._makeLevelMaterial({ color: new THREE.Color(hex) });
    m.uniforms.ambientColor.value.setScalar(lit);
    m.uniforms.glowColor.value.set(glowHex);
    m.uniforms.glowAmount.value = glow;
    return m;
  };

  this.ringPuzzle = new RingPuzzle(this.scene, {
    targets: [2, 5, 1],
    coupling: 'oneWay',
    makeMaterial,
    onSolved: () => this.onRingPuzzleComplete(),
  });
  this.ringPuzzle.hub.position.set(-0.147, 1.701, -3.535);
  this.ringPuzzle.hub.rotation.y = 1.571;
  this.ringPuzzle.hub.scale.setScalar(0.092);

  console.log('panel:', this.ringPuzzle.panel.material.type,
            '| ring:', this.ringPuzzle.ringMeshes[0].material.type);
}

_isRingPuzzlePart(object) {
  if (this.LightsPuzzle.includes(object)) return true;
  for (let o = object; o; o = o.parent) {
    if (o === this.ringPuzzle?.hub) return true;
  }
  return false;
}

onRingPuzzleComplete() {
  if (this.ringPuzzleSolved) return;
  this.ringPuzzleSolved = true;
  this._rebuildInteractables();
  this.ariaManager?.activate();
  this.onRingPuzzleSolved?.();
}

  _rebuildInteractables() {
    this._interactables = [...this.LightsPuzzle];
    if (this.wallMonitor) this._interactables.push(this.wallMonitor);
    this._interactables.push(...this.generatorParts);
    if (this.relay) this._interactables.push(this.relay.root);
    if (this.torch && !this.hasTorch) this._interactables.push(this.torch);
    if (this.ringPuzzle) this._interactables.push(this.ringPuzzle.hub);
    if (this.keypad) {
      this._interactables.push(this.keypad);
    }
  }


  _isGeneratorPart(object) {
    return this.generatorParts.includes(object);
  }

  _isTorchPart(object) {
    for (let o = object; o; o = o.parent) {
      if (o === this.torch) return true;
    }
    return false;
  }
  _isKeypadPart(object) {
    for (let o = object; o; o = o.parent) {
      if (o === this.keypad) {
        return true;
      }
    }

    return false;
  }

  // Free everything this level created (used when the game restarts). Removing a
  // mesh from the scene does not free its GPU memory: geometries and
  // materials have to be disposed explicitly.
  dispose() {
    this.ariaManager?.dispose();
    this.sparks.dispose();
    for (const object of [this.room, this.torch, this.relay?.root, this.ringPuzzle?.hub, this.keypad]) {
      if (!object) continue;
      object.traverse((o) => o.geometry?.dispose?.());
      this.scene.remove(object);
    }
    for (const material of this.shaderMaterials) material.dispose();
    
    this.shaderMaterials.length = 0;
    this.lights.length = 0;
    this._interactables.length = 0;
  }
  _makeKeypadMaterial(
    color,
    {
      glow = 0x000000,
      glowAmount = 0
    } = {}
  ) {
    const material = this._makeLevelMaterial({
      color: new THREE.Color(color)
    });

    // Keep the casing quite dark even in the powered room.
    material.uniforms.ambientColor.value.setScalar(0.015);

    material.uniforms.glowColor.value.set(glow);
    material.uniforms.glowAmount.value = glowAmount;

    return material;
  }

  setupDoorAnimation(clips = []) {
    this.doorMixer = new THREE.AnimationMixer(this.room);

    this.doorActions = clips
      .filter((clip) =>
        clip.tracks.some((track) =>
          track.name.includes('Door_Left') ||
          track.name.includes('Door_Right')
        )
      )
      .map((clip) => {
        const action = this.doorMixer.clipAction(clip);

        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;

        return action;
      });

    console.log(
      'Door animations:',
      this.doorActions.length,
      clips.map((clip) => clip.name)
    );
  }

  openElevatorDoor() {
    if (this.doorOpened) return;

    if (!this.doorActions.length) {
      console.warn('No elevator door animation found.');
      return;
    }

    this.doorOpened = true;

    for (const action of this.doorActions) {
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
    }

    console.log('Elevator door opening');
  }

  buildKeypad() {
    const keypad = new THREE.Group();
    keypad.name = 'SecurityKeypad';
    keypad.scale.setScalar(0.34);

    /*
    * TEMP position — move later when the double door is built.
    */
    const keypadHeight = 2.15;

    keypad.position.set(
      1.0,
      keypadHeight,
      1.80
    );

    keypad.rotation.y = Math.PI;

    keypad.userData.interactionType = 'keypad';
    keypad.userData.maxInteractionDistance = 3.25;
    keypad.userData.focusDistance = 0.55;

    // =========================================================
    // Materials
    // =========================================================
    const mountMat =
      this._makeKeypadMaterial(0x070a0c);

    const housingMat =
      this._makeKeypadMaterial(0x0c1115);

    const bezelMat =
      this._makeKeypadMaterial(0x030608);

    const darkMetalMat =
      this._makeKeypadMaterial(0x0a0f12);

    const boltMat =
      this._makeKeypadMaterial(0x283238);

    const trimMat =
      this._makeKeypadMaterial(
        0x071317,
        {
          glow: 0x00a6b8,
          glowAmount: 0.12
        }
      );

    const screenGlassMat =
      new THREE.MeshBasicMaterial({
        color: 0x010507
      });

    const ledMat =
      this._makeKeypadMaterial(
        0x07171b,
        {
          glow: 0x22d5e5,
          glowAmount: 0.65
        }
      );
    // =========================================================
    // Back mounting plate
    // =========================================================
    const mountPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.98, 1.56, 0.06),
      mountMat
    );
    mountPlate.position.z = -0.015;
    mountPlate.name = 'SecurityKeypadMountPlate';
    keypad.add(mountPlate);

    // =========================================================
    // Main keypad housing
    // =========================================================
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 1.34, 0.18),
      housingMat
    );
    housing.position.z = 0.055;
    housing.name = 'SecurityKeypadHousing';
    keypad.add(housing);

    // Slightly inset inner face panel
    const facePanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.74, 1.22, 0.04),
      darkMetalMat
    );
    facePanel.position.z = 0.14;
    facePanel.name = 'SecurityKeypadFacePanel';
    keypad.add(facePanel);

    // Thin emissive trim border
    const trimTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.01, 0.008),
      trimMat
    );
    trimTop.position.set(0, 0.56, 0.163);

    const trimBottom = trimTop.clone();
    trimBottom.position.set(0, -0.56, 0.163);

    const trimLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 1.12, 0.008),
      trimMat
    );
    trimLeft.position.set(-0.36, 0, 0.163);

    const trimRight = trimLeft.clone();
    trimRight.position.set(0.36, 0, 0.163);

    keypad.add(trimTop, trimBottom, trimLeft, trimRight);

    // =========================================================
    // Corner bolts
    // =========================================================
    const boltPositions = [
      [-0.43,  0.67, 0.165],
      [ 0.43,  0.67, 0.165],
      [-0.43, -0.67, 0.165],
      [ 0.43, -0.67, 0.165]
    ];

    boltPositions.forEach(([x, y, z]) => {
      const bolt = this.createKeypadBolt(boltMat);
      bolt.position.set(x, y, z);
      keypad.add(bolt);
    });

    // =========================================================
    // Screen bezel + glass
    // =========================================================
    const screenBezel = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.26, 0.035),
      bezelMat
    );
    screenBezel.position.set(0, 0.36, 0.16);
    keypad.add(screenBezel);

    const screenGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.50, 0.20),
      screenGlassMat
    );
    screenGlass.position.set(0, 0.36, 0.179);
    keypad.add(screenGlass);

    const screenTexture = this.createKeypadScreenTexture();
    const screenUI = new THREE.Mesh(
      new THREE.PlaneGeometry(0.48, 0.18),
      new THREE.MeshBasicMaterial({
        map: screenTexture,
        transparent: false
      })
    );
    screenUI.position.set(0, 0.36, 0.1805);
    screenUI.name = 'SecurityKeypadScreenUI';
    keypad.add(screenUI);

    // =========================================================
    // Status light
    // =========================================================
    const ledHousing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.02, 20),
      bezelMat
    );
    ledHousing.rotation.x = Math.PI / 2;
    ledHousing.position.set(0, 0.12, 0.17);
    keypad.add(ledHousing);

    const led = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.016, 20),
      ledMat
    );
    led.rotation.x = Math.PI / 2;
    led.position.set(0, 0.12, 0.182);
    keypad.add(led);

    // =========================================================
    // Speaker grille
    // =========================================================
    const grilleBarMat =
      this._makeKeypadMaterial(0x11191d);

    for (let i = 0; i < 5; i++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.007, 0.008),
        grilleBarMat
      );
      bar.position.set(0, -0.49 + i * 0.02, 0.171);
      keypad.add(bar);
    }

    // =========================================================
    // Physical raised buttons
    // =========================================================
    const labels = [
      '1', '2', '3',
      '4', '5', '6',
      '7', '8', '9',
      'CLR', '0', 'ENT'
    ];

    const startX = -0.19;
    const startY = 0.0;
    const gapX = 0.19;
    const gapY = 0.16;

    labels.forEach((label, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);

      const isEnter = label === 'ENT';
      const isClear = label === 'CLR';

      const key = this.createKeypadButton(label, {
        isEnter,
        isClear
      });

      key.position.set(
        startX + col * gapX,
        startY - row * gapY,
        0.175
      );

      keypad.add(key);
    });

    // =========================================================
    // Small printed plate / serial text area
    // =========================================================
    const badgeTexture = this.createKeypadBadgeTexture();
    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.06),
      new THREE.MeshBasicMaterial({
        map: badgeTexture,
        transparent: false
      })
    );
    badge.position.set(0, -0.57, 0.181);
    keypad.add(badge);

    // Raycast should hit the group via parent traversal
    keypad.traverse((child) => {
      child.userData.interactionOwner = keypad;
    });

    console.log('ROOM BOUNDS:', this.bounds);
    console.log('KEYPAD POSITION:', keypad.position);
    this.scene.add(keypad);
    this.keypad = keypad;
    this._rebuildInteractables();
  }

  createKeypadBolt(material) {
    const bolt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.014, 20),
      material
    );

    bolt.rotation.x = Math.PI / 2;

    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.004, 0.003),
      this._makeKeypadMaterial(0x151c20)
    );

    slot.position.z = 0.0075;
    bolt.add(slot);

    return bolt;
  }

  createKeypadButton(label, { isEnter = false, isClear = false } = {}) {
    const group = new THREE.Group();

    const buttonMat =
      isEnter
        ? this._makeKeypadMaterial(
            0x0b1714,
            {
              glow: 0x1a8063,
              glowAmount: 0.12
            }
          )
        : isClear
          ? this._makeKeypadMaterial(
              0x1c110d,
              {
                glow: 0x7a341c,
                glowAmount: 0.08
              }
            )
          : this._makeKeypadMaterial(
              0x0b1114
            );

    const button = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.105, 0.035),
      buttonMat
    );
    group.add(button);

    const labelTexture = this.createKeypadButtonLabelTexture(label, {
      isEnter,
      isClear
    });

    const labelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.08, 0.042),
      new THREE.MeshBasicMaterial({
        map: labelTexture,
        transparent: true
      })
    );

    labelMesh.position.z = 0.0185;
    group.add(labelMesh);

    return group;
  }

  createKeypadScreenTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;

    const ctx = canvas.getContext('2d');

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, '#08171d');
    bg.addColorStop(1, '#030a0d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Inner border
    ctx.strokeStyle = '#1ddff2';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    // Subtle scanlines
    for (let y = 0; y < canvas.height; y += 4) {
      ctx.fillStyle = 'rgba(0, 229, 255, 0.03)';
      ctx.fillRect(0, y, canvas.width, 1);
    }

    // Header line
    ctx.fillStyle = '#58f4ff';
    ctx.font = 'bold 25px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SECURITY ACCESS', canvas.width / 2, 68);

    // Status line
    ctx.fillStyle = '#76a8b0';
    ctx.font = '16px monospace';
    ctx.fillText('AUTH // 6 DIGIT', canvas.width / 2, 95);

    // Code slots
    const slotY = 145;
    const slotW = 40;
    const slotH = 28;
    const gap = 14;
    const totalW = 6 * slotW + 5 * gap;
    const startX = (canvas.width - totalW) / 2;

    for (let i = 0; i < 6; i++) {
      const x = startX + i * (slotW + gap);

      ctx.strokeStyle = 'rgba(0, 229, 255, 0.65)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, slotY, slotW, slotH);

      ctx.fillStyle = 'rgba(0, 229, 255, 0.04)';
      ctx.fillRect(x, slotY, slotW, slotH);
    }

    // Locked status
    ctx.fillStyle = '#f0a15d';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('STATUS: LOCKED', canvas.width / 2, 204);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;

    return texture;
  }

  createKeypadButtonLabelTexture(label, { isEnter = false, isClear = false } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;

    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = label.length > 1
      ? 'bold 24px monospace'
      : 'bold 32px monospace';

    ctx.fillStyle = isEnter
      ? '#7affd8'
      : isClear
        ? '#ffb08a'
        : '#d9fbff';

    ctx.shadowColor = isEnter
      ? 'rgba(122,255,216,0.35)'
      : isClear
        ? 'rgba(255,176,138,0.25)'
        : 'rgba(0,229,255,0.18)';

    ctx.shadowBlur = 8;
    ctx.fillText(label, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    return texture;
  }

  createKeypadBadgeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;

    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0b1215';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

    ctx.fillStyle = '#7eaab2';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H9 ACCESS NODE // PRESSURE SAFE', canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    return texture;
  }
  
  getBounds(){
    return this.bounds;
  }

  get interactables() {
    return this._interactables;/*[
      ...this.LightsPuzzle,
      ...this.keypadInteractables
    ];*/
  }

  // How close the player must be to use things (world units)
  static MONITOR_RANGE = 5;
  static TORCH_RANGE = 4.5;
  static GENERATOR_RANGE = 5.5;
  static RELAY_RANGE = 6.5;
  static RING_PANEL_RANGE = 5;

  // Text for the on-screen prompt while looking at an object, or null for none.
  // The torch and the generator stay locked until the player has talked to ARIA.
  getInteractPrompt(object, distance) {
    if (this._isKeypadPart(object)) {
      if (distance > this.keypad.userData.maxInteractionDistance) {
        return null;
      }

      return 'Click or press E to use keypad';
    }
    if (object === this.wallMonitor) {
  if (!this.ringPuzzleSolved) {
    return distance <= Level1.MONITOR_RANGE ? 'The monitor is dead. No power' : null;
  }
  return this.canInteract(object, distance) ? 'Click or press E to talk to ARIA' : null;
  }
  if (this._isRingPuzzlePart(object)) {
    if (distance > Level1.RING_PANEL_RANGE || this.ringPuzzleSolved) return null;
    return 'Click or press E to inspect the panel';
  }
    const torch = this._isTorchPart(object);
    const generator = this._isGeneratorPart(object);
    if (torch || generator) {
      if (distance > (torch ? Level1.TORCH_RANGE : Level1.GENERATOR_RANGE)) return null;
      if (torch && this.hasTorch) return null;
      if (generator && this.cablesFixed) return null;
      if (this.talkEnabled) return 'Talk to ARIA first';
      if (generator && !this.hasTorch) return 'Too dark to see the wiring. Find a light first';
      return torch ? 'Click or press E to pick up the torch' : 'Click or press E to inspect the generator';
    }
    if (this._isRelayPart(object) && this._ringIndexOf(object) >= 0) {
      if (distance > Level1.RELAY_RANGE || this.relaySolved) return null;
      if (this.talkEnabled) return 'Talk to ARIA first';
      if (!this.cablesFixed) return 'The ring is locked. The generator has no power';
      return 'Click to turn the ring (Shift + click: turn back)';
    }
    return null;
  }

  // Range checks only: the "locked" messages are shown from onInteract
  canInteract(object, distance) {
    if (this._isKeypadPart(object)) {
      return distance <= this.keypad.userData.maxInteractionDistance;
    }
    if (object === this.wallMonitor) {
      return this.talkEnabled && distance <= Level1.MONITOR_RANGE;
    }
    if (this._isRingPuzzlePart(object)) {
      return !this.ringPuzzleSolved && distance <= Level1.RING_PANEL_RANGE;
    }
    if (this._isTorchPart(object)) {
      return !this.hasTorch && distance <= Level1.TORCH_RANGE;
    }
    if (this._isGeneratorPart(object)) {
      return distance <= Level1.GENERATOR_RANGE;
    }
    if (this._isRelayPart(object)) {
      return distance <= Level1.RELAY_RANGE;
    }
    return true;
  }

  onInteract(object, options = {}) {
    if (this._isKeypadPart(object)) {
      this.onUseKeypad?.(this.keypad);
      return;
    }
    if (object === this.wallMonitor) {
  if (!this.ringPuzzleSolved) {
    this.onLockedHint?.('The monitor is dead. Something on the wall panel controls its power.');
    return;
  }
  this.onTalkToAria?.();
      return;
    }
    if (this._isRingPuzzlePart(object)) {
      if (!this.ringPuzzleSolved) this.onOpenRingPuzzle?.();
      return;
    }
    if (this._isTorchPart(object)) {
      if (this.talkEnabled) {
        this.onLockedHint?.('Talk to ARIA first. She is waiting at the glowing monitor.');
        return;
      }
      this.pickUpTorch();
      return;
    }
    if (this._isGeneratorPart(object)) {
      if (this.talkEnabled) {
        this.onLockedHint?.('Talk to ARIA first. She is waiting at the glowing monitor.');
      } else if (!this.hasTorch) {
        this.onLockedHint?.('It is too dark to read the wiring. Find the torch first.');
      } else if (!this.cablesFixed) {
        this.onInspectGenerator?.();
      }
      return;
    }
    const ring = this._isRelayPart(object) ? this._ringIndexOf(object) : -1;
    if (ring >= 0) {
      if (this.talkEnabled) {
        this.onLockedHint?.('Talk to ARIA first. She is waiting at the glowing monitor.');
      } else if (!this.cablesFixed) {
        this.onLockedHint?.('The rings are locked: the generator has no power. Fix the wiring first.');
      } else {
        this.turnRing(ring, options.reverse ? -1 : 1);
      }
      return;
    }
  }

  // What the on-screen waypoint should point at right now (or null)
  getWaypoint() {
    const w = this._waypoint;
    if (!this.ringPuzzleSolved && this.ringPuzzle) {
      w.position.copy(this.ringPuzzle.hub.position);
      w.label = 'Panel';
    } else if (this.talkEnabled) {
      w.position.copy(this._monitorCentre);
      w.label = 'ARIA';
    } else if (this.torch && !this.hasTorch) {
      w.position.copy(this.torch.position);
      w.position.y += 0.3;
      w.label = 'Torch';
    } else if (!this.cablesFixed) {
      w.position.copy(this._generatorCentre);
      w.label = 'Generator';
    } else if (!this.relaySolved) {
      w.position.copy(this._generatorCentre);
      w.label = 'Relay rings';
    } else {
      return null;
    }
    return w;
  }

  pickUpTorch() {
    if (this.hasTorch || !this.torch) return;
    this.hasTorch = true;
    this.flashlightOn = true;
    this.torch.visible = false;
    this._rebuildInteractables();
    this.onTorchPickedUp?.();
  }

  toggleFlashlight() {
    if (this.hasTorch) this.flashlightOn = !this.flashlightOn;
  }

  addLighting(){
    // implement later
  }

  setPower(target) {
    const wasBroken = this.powerTarget < 0.99;
    this.powerTarget = THREE.MathUtils.clamp(target, 0, 1);
    // Power surge: a big shower of sparks as the generator comes back
    if (wasBroken && this.powerTarget >= 0.99) this._surgeSparks();
  }

  // ---------------------------------------------------------
  // The power relay: three linked rings
  //
  // Scene graph: ring 2 is a CHILD of ring 1 and ring 3 a child of ring 2, and
  // every bolt, light and marker is a child of its ring. Turning a ring
  // therefore carries everything above it (and all of its own parts) round with
  // it: each ring's real orientation is the sum of its own turn and all the
  // turns below it. That is what makes it a puzzle.
  // ---------------------------------------------------------
  _buildRelay() {
    if (this._generatorRadius <= 0) return;
    const centre = this._generatorCentre;

    const plain = (hex) => this._makeLevelMaterial({ color: new THREE.Color(hex) });
    const glowing = (hex, glow) => {
      const m = plain(hex);
      m.uniforms.ambientColor.value.setScalar(0.03);
      m.uniforms.glowColor.value.set(glow);
      return m;
    };
    const ringMaterial = plain(0x5b6773);
    const ledMaterial = glowing(0x103040, 0x33e6ff);
    ledMaterial.uniforms.glowAmount.value = 0.55;
    const boltMaterial = plain(0x2a3037);
    const boltGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.42, 10);
    const ledGeometry = new THREE.SphereGeometry(0.055, 12, 10);
    const torusGeometry = new THREE.TorusGeometry(RELAY_RADIUS, 0.14, 14, 72);
    const markerGeometry = new THREE.BoxGeometry(0.34, 0.38, 0.26);
    const slotGeometry = new THREE.BoxGeometry(0.16, 0.3, 0.3);

    const root = new THREE.Group();
    root.name = 'PowerRelay';
    root.position.set(centre.x, 0, centre.z);

    const rings = [];
    let parent = root;
    let previousY = 0;
    RELAY_RING_HEIGHTS.forEach((y, index) => {
      const group = new THREE.Group();
      group.position.y = y - previousY; // relative to the parent ring
      previousY = y;
      group.userData.ringIndex = index;
      parent.add(group);
      parent = group;

      const torus = new THREE.Mesh(torusGeometry, ringMaterial);
      torus.rotation.x = Math.PI / 2;
      group.add(torus);

      // Bolts through the ring and small lights between them (all children)
      for (let i = 0; i < RELAY_STEPS; i++) {
        const a = (i / RELAY_STEPS) * Math.PI * 2;
        const bolt = new THREE.Mesh(boltGeometry, boltMaterial);
        bolt.position.set(Math.cos(a) * RELAY_RADIUS, 0, Math.sin(a) * RELAY_RADIUS);
        group.add(bolt);

        const led = new THREE.Mesh(ledGeometry, ledMaterial);
        const b = a + Math.PI / RELAY_STEPS;
        led.position.set(Math.cos(b) * (RELAY_RADIUS + 0.14), 0, Math.sin(b) * (RELAY_RADIUS + 0.14));
        group.add(led);
      }

      // The marker faces the rail (world -X) when the ring is lined up
      const markerMaterial = glowing(0x40300a, 0xffb020);
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.set(-RELAY_RADIUS - 0.03, 0, 0);
      group.add(marker);

      // The matching slot on the fixed rail
      const slotMaterial = glowing(0x303840, 0xbfd8e0);
      const slot = new THREE.Mesh(slotGeometry, slotMaterial);
      slot.position.set(-(RELAY_RADIUS + 0.64), y, 0);
      root.add(slot);

      rings.push({ group, markerMaterial, slotMaterial, steps: 0, angle: 0, aligned: false });
    });

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.16), boltMaterial);
    rail.position.set(-(RELAY_RADIUS + 0.72), 2.3, 0);
    root.add(rail);

    // Start scrambled: every ring out of line, and not all by the same amount
    let steps;
    do {
      steps = rings.map((_, i) => (i === 0 ? 1 : 0) + Math.floor(Math.random() * (i === 0 ? 7 : 8)));
    } while (this._absoluteSteps(steps).some((a) => a === 0) || new Set(this._absoluteSteps(steps)).size === 1);
    rings.forEach((ring, i) => {
      ring.steps = steps[i];
      ring.angle = (steps[i] * Math.PI * 2) / RELAY_STEPS;
      ring.group.rotation.y = ring.angle;
    });

    this.relay = { root, rings };
    this.scene.add(root);
    this._rebuildInteractables();
  }

  // The real (absolute) orientation of each ring, in steps: the running sum of the turns
  _absoluteSteps(steps) {
    let total = 0;
    return steps.map((s) => {
      total += s;
      return ((total % RELAY_STEPS) + RELAY_STEPS) % RELAY_STEPS;
    });
  }

  _isRelayPart(object) {
    if (!this.relay) return false;
    for (let o = object; o; o = o.parent) {
      if (o === this.relay.root) return true;
    }
    return false;
  }

  // Which ring a clicked object belongs to: the nearest ring group above it
  // (a bolt on ring 2 sits below ring 1 in the tree, but belongs to ring 2)
  _ringIndexOf(object) {
    for (let o = object; o; o = o.parent) {
      if (o.userData && o.userData.ringIndex !== undefined) return o.userData.ringIndex;
    }
    return -1;
  }

  // Turn one ring a step. Every ring above it in the tree turns with it.
  turnRing(index, direction = 1) {
    if (!this.relay || !this.cablesFixed || this.relaySolved) return;
    this.relay.rings[index].steps += direction;
    this.onRingTurned?.();
    this._relayCheckAt = this.time + 0.6; // after the turn has finished animating
  }

  _updateRelay(delta) {
    if (!this.relay) return;
    const rings = this.relay.rings;
    const ease = 1 - Math.exp(-9 * delta);
    const absolute = this._absoluteSteps(rings.map((r) => r.steps));

    rings.forEach((ring, i) => {
      // Ease toward the target turn. The child rings inherit the parent's
      // motion on top of this, purely through the scene graph.
      const target = (ring.steps * Math.PI * 2) / RELAY_STEPS;
      ring.angle += (target - ring.angle) * ease;
      ring.group.rotation.y = ring.angle;

      // The marker and its rail slot show whether this ring is in line
      ring.aligned = absolute[i] === 0;
      const pulse = 0.55 + 0.45 * Math.sin(this.time * 5 + i);
      const marker = ring.markerMaterial.uniforms;
      const slot = ring.slotMaterial.uniforms;
      if (ring.aligned) {
        marker.glowColor.value.set(0x2fae62);
        marker.glowAmount.value = 0.75;
        slot.glowColor.value.set(0x2fae62);
        slot.glowAmount.value = 0.75;
      } else {
        marker.glowColor.value.set(0xb8791a);
        marker.glowAmount.value = this.cablesFixed ? 0.3 + 0.4 * pulse : 0.12;
        slot.glowColor.value.set(0xbfd8e0);
        slot.glowAmount.value = 0.25;
      }
    });

    // All three in line: the relay engages
    if (this._relayCheckAt >= 0 && this.time >= this._relayCheckAt) {
      this._relayCheckAt = -1;
      if (!this.relaySolved && absolute.every((a) => a === 0)) this.finalRepair();
    }
  }

  // Stage one done (the cable puzzle): the wiring holds and the generator
  // comes back partway. The rings are still locked out of phase.
  partialRepair() {
    this.cablesFixed = true;
    this.powerTarget = 0.4;
    this._surgeSparks();
  }

  // Stage two done (the rings): full power. The lights surge back on one after
  // another, floor by floor, instead of all at once.
  finalRepair() {
    this.relaySolved = true;
    this.powerTarget = 1;
    this._sequenceStart = this.time;
    this._surgeSparks();
    this.onRelayAligned?.();
  }

  // 0..1 while the puzzle countdown runs: the more stress, the faster the rings
  // pulse, the harder the lights stutter and the more often it sparks
  setStress(value) {
    this.stress = THREE.MathUtils.clamp(value, 0, 1);
  }

  // The countdown ran out: the generator trips. A big burst of sparks, the rings
  // flash red and the room blacks out for three seconds (the torch still works).
  overload() {
    this.failures++;
    this._blackoutUntil = this.time + 3;
    this._overloadUntil = this.time + 2.2;
    for (let i = 0; i < 10; i++) this._sparkAt((i / 10) * Math.PI * 2, 16, i % 3 === 0);
  }

  // A wrong plug: a small shower of sparks out at the generator
  mistakeSparks() {
    this._sparkAt(Math.random() * Math.PI * 2, 12);
    this._sparkAt(Math.random() * Math.PI * 2, 10, true);
  }

  // A burst of sparks around the generator: from the glowing rings up the
  // pillar, or (baseLevel) from the thick cables looping at its foot
  _sparkAt(angle, count, baseLevel = false) {
    if (this._generatorRadius <= 0) return;
    const r = this._generatorRadius * (baseLevel ? 2.0 : 1.85); // outside the pillar body (radius ~1.07), so the sparks are not hidden inside it
    this._sparkOutward.set(Math.cos(angle), 0, Math.sin(angle));
    this._sparkOrigin.copy(this._generatorCentre);
    this._sparkOrigin.x += this._sparkOutward.x * r;
    this._sparkOrigin.z += this._sparkOutward.z * r;
    this._sparkOrigin.y = baseLevel ? 1.15 : this._generatorCentre.y + (Math.random() - 0.4) * 0.5;
    this.sparks.burst(this._sparkOrigin, count, this._sparkOutward);
  }

  _surgeSparks() {
    for (let i = 0; i < 8; i++) this._sparkAt((i / 8) * Math.PI * 2, 14, i % 2 === 1);
  }

  // Broken-generator behaviour each frame: pulsing / stuttering rings and
  // random sparks. All of it fades out as power returns.
  _updateGenerator(delta) {
    const broken = 1 - this.power;
    this._pulseTime += delta * (1 + 2.2 * this.stress);
    const t = this._pulseTime;
    const overloading = this.time < this._overloadUntil;
    const blackout = this.time < this._blackoutUntil;

    for (const cable of this.cables) {
      const u = cable.mat.uniforms;
      if (overloading) {
        // Tripped: every ring flashes red
        u.glowColor.value.set(1.0, 0.12, 0.08);
        u.glowAmount.value = 0.5 + 0.5 * Math.sin(this.time * 28 + cable.phase);
        continue;
      }
      u.glowColor.value.copy(cable.base);
      if (blackout) {
        u.glowAmount.value = 0;
        continue;
      }
      // Slow throb, with sudden dark drop-outs like a failing connection
      const throb = 0.5 + 0.5 * Math.sin(t * 2.6 + cable.phase);
      const dropout = Math.sin(t * 29 + cable.phase * 4.1) * Math.sin(t * 8.3 + cable.phase * 2.2) > 0.6 ? 0.05 : 1;
      const faulty = 0.12 + 0.88 * throb * dropout;
      u.glowAmount.value = faulty * broken + 0.75 * this.power;
    }

    // Random sparks while it is still broken. More often the more broken it is,
    // after each failed attempt, and as the countdown runs down.
    if (this.power < 0.85 && delta > 0 && !blackout && !this.cablesFixed) {
      this._sparkTimer -= delta;
      if (this._sparkTimer <= 0) {
        this._sparkAt(Math.random() * Math.PI * 2, 8 + Math.floor(Math.random() * 8), Math.random() < 0.4);
        const frenzy = 1 + this.failures * 0.5 + this.stress * 1.2;
        this._sparkTimer = (0.5 + Math.random() * 1.8) / ((0.4 + broken) * frenzy);
      }
    }
    this.sparks.update(delta);
  }

  // How bright room light `i` is right now: mostly dark until power returns,
  // except the two emergency lights that stutter. Power blends everything to full.
  _lightFactor(i) {
    if (this.time < this._blackoutUntil) return 0; // the generator has tripped
    const stress = this.stress;
    let dead = DIM_LEVEL;
    if (this._flicker.has(i)) {
      const stutter = Math.sin(this.time * 23 * (1 + 2.5 * stress) + i * 3.1) * Math.sin(this.time * 7.7 + i);
      dead = stutter > 0.25 - 0.3 * stress ? 0.55 : 0.05;
    }
    // After the relay engages each light comes back in turn (and they all go
    // briefly dark first, so the surge reads)
    let power = this.power;
    if (this._sequenceStart >= 0) {
      const sequence = THREE.MathUtils.clamp((this.time - this._sequenceStart - i * 0.4) / 0.3, 0, 1);
      power = Math.min(power, sequence);
      if (this.time > this._sequenceStart + this.lights.length * 0.4 + 1.5) this._sequenceStart = -1;
    }
    let factor = dead + (1 - dead) * power;
    if (stress > 0) {
      // As the countdown runs low, every light drops out in sharp stutters
      const drop = Math.sin(this.time * (17 + 30 * stress) + i * 2.3) * Math.sin(this.time * 5.1 + i) > 0.35;
      if (drop) factor *= 1 - 0.9 * stress;
    }
    return factor;
  }

  update(delta, playerPosition, camera) {
    
    this.doorMixer?.update(delta);
    this.time += delta;
    this.power += (this.powerTarget - this.power) * Math.min(1, delta * 1.5);
    if (this.ariaManager) {
      this.ariaManager.update(delta, playerPosition);
    }
    if (this.emergencyLight) {
      this.emergencyLight.intensity = 50 + Math.sin(this.time * 5) * 10;
    }

    this._updateGenerator(delta);
    this._updateRelay(delta);
    this.ringPuzzle?.update(delta);

    const flash = this.flashlightOn && camera;
    const roomCount = Math.min(this.lights.length, MAX_LIGHTS - 1);
    let count = 0;

    // Gather light data once per frame instead of once per material
    for (let i = 0; i < roomCount; i++) {
      const light = this.lights[i];
      light.getWorldPosition(this._lightWorldPos);
      this._lightWorldPositions[count].copy(this._lightWorldPos);
      this._lightWorldColors[count].copy(light.color);
      this._lightWorldIntensities[count] = LIGHT_FULL * this._lightFactor(i);
      this._lightCones[count].set(-2, -2); // plain point light
      count++;
    }

    if (this.torch && !this.hasTorch) {
      // A soft pulsing glow on the torch so the player can spot it in the dark
      // (uses the light slot the flashlight takes over after pickup)
      this._torchGlowPos.copy(this.torch.position);
      this._torchGlowPos.y += 0.3;
      this._lightWorldPositions[count].copy(this._torchGlowPos);
      this._lightCones[count].set(-2, -2);
      this._lightWorldColors[count].copy(this._flashColor);
      this._lightWorldIntensities[count] = 1.7 + Math.sin(this.time * 3) * 0.6;
      count++;
    }

    if (flash) {
      // Just below and to the right of the eyes, pointing where the player looks
      camera.getWorldDirection(this._camDir);
      this._camRight.crossVectors(this._camDir, camera.up).normalize();
      this._camUp.crossVectors(this._camRight, this._camDir).normalize();
      this._lightWorldPositions[count]
        .copy(camera.position)
        .addScaledVector(this._camRight, 0.25)
        .addScaledVector(this._camUp, -0.2);
      this._lightWorldDirs[count].copy(this._camDir);
      this._lightCones[count].set(FLASH_OUTER_COS, FLASH_INNER_COS);
      this._lightWorldColors[count].copy(this._flashColor);
      this._lightWorldIntensities[count] = FLASH_INTENSITY;
      count++;
    }

    for (const mat of this.shaderMaterials) {
      mat.uniforms.numLights.value = count;
      mat.uniforms.uPower.value = this.power;
      mat.uniforms.uTime.value = this.time;
      for (let i = 0; i < count; i++) {
        mat.uniforms.lightPositions.value[i].copy(this._lightWorldPositions[i]);
        mat.uniforms.lightDirs.value[i].copy(this._lightWorldDirs[i]);
        mat.uniforms.lightCones.value[i].copy(this._lightCones[i]);
        mat.uniforms.lightColors.value[i].copy(this._lightWorldColors[i]);
        mat.uniforms.lightIntensities.value[i] = this._lightWorldIntensities[i];
      }
    }
  }


}

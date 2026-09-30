import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// A slowly turning 3D preview of an inventory item (the torch), drawn with one
// small off-screen renderer and copied onto whichever 2D canvases want it: the
// corner slot in the HUD and the slot in the inventory screen. Uses the same
// Blender model as the torch on the floor.

const SIZE = 192;

export class ItemPreview {
  constructor(url = './assets/models/torch.glb') {
    this.url = url;
    this.ready = false;
    this.time = 0;
    this.lens = null;

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(SIZE, SIZE);
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    this.camera.position.set(0, 0.15, 2.3);

    // Cool key light from the upper left, a warm kick from behind, soft fill
    const key = new THREE.DirectionalLight(0xdff4ff, 2.6);
    key.position.set(-1.5, 2, 2.5);
    const back = new THREE.DirectionalLight(0xffc488, 1.4);
    back.position.set(2, 0.5, -2);
    this.scene.add(key, back, new THREE.AmbientLight(0xffffff, 0.7));

    this.turntable = new THREE.Group();   // spins about the vertical axis
    this.tilt = new THREE.Group();        // holds the torch at a three-quarter angle
    this.tilt.rotation.set(0.5, 0, -0.45);
    this.tilt.add(this.turntable);
    this.scene.add(this.tilt);
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(this.url);
    const model = gltf.scene;

    // The model keeps its Blender offset: centre it and scale it to fit
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(centre);
    const scale = 1.35 / Math.max(size.x, size.y, size.z);
    this.turntable.scale.setScalar(scale);

    model.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of materials) {
        m.metalness = 0.55;
        m.roughness = 0.42;
        if (m.name === 'torch_lens') this.lens = m;
      }
    });
    this.turntable.add(model);
    this.ready = true;
  }

  // Turn the torch and copy the frame onto each target canvas
  draw(targets, delta, lit = false) {
    if (!this.ready || !targets.length) return;
    this.time += delta;
    this.turntable.rotation.y = this.time * 0.9;
    if (this.lens) {
      // The lens glows warm while the torch is switched on
      this.lens.emissive = new THREE.Color(lit ? 0xffe2a0 : 0x000000);
      this.lens.emissiveIntensity = lit ? 1.6 : 0;
    }
    this.renderer.render(this.scene, this.camera);
    for (const canvas of targets) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const fit = Math.min(canvas.width, canvas.height);
      ctx.drawImage(this.renderer.domElement, (canvas.width - fit) / 2, (canvas.height - fit) / 2, fit, fit);
    }
  }

  dispose() {
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
    this.renderer.dispose();
  }
}

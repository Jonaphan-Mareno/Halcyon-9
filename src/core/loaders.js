import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

// Every model loader in the game. The big models are Draco-compressed (see
// scripts/optimize-models.mjs) to be much smaller to download from the school server; the decoder
// ships with three.js (Vite copies it into the build) and runs in web workers while loading.
// Uncompressed models load as before.
let draco = null;

export function createGLTFLoader() {
  if (!draco) {
    draco = new DRACOLoader();
    draco.preload();
  }
  return new GLTFLoader().setDRACOLoader(draco);
}

import { LoadingManager } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// Every model loader in the game. The big models are Draco-compressed (see
// scripts/optimize-models.mjs) to be much smaller to download from the school server; the decoder
// ships with three.js (Vite copies it into the build) and runs in web workers while loading.
// The animated characters (ARIA's face, Voss, the crew) are meshopt-compressed instead: Draco cannot
// carry their face shapes (morph targets). Uncompressed models load as before.
let draco = null;

export function createGLTFLoader() {
  if (!draco) {
    draco = new DRACOLoader();
    draco.preload();
  }
  return new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
}

// For animation-only FBX files (Mixamo exports): the textures they point at are not shipped,
// so every request other than the FBX itself gets a blank 1x1 image instead of a 404
const BLANK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export function createFBXLoader() {
  const manager = new LoadingManager();
  manager.setURLModifier((url) => (/\.fbx$/i.test(url) ? url : BLANK_IMAGE));
  return new FBXLoader(manager);
}

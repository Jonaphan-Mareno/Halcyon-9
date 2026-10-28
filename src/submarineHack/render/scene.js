import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040912);
  scene.fog = new THREE.FogExp2(0x040912, 0.018);

  // The board is laid out in XY, so the camera looks straight down the Z axis.
  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 17);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.enableRotate = true;
  controls.minPolarAngle = Math.PI / 2 - 0.16;
  controls.maxPolarAngle = Math.PI / 2 + 0.16;
  controls.minAzimuthAngle = -0.18;
  controls.maxAzimuthAngle = 0.18;
  controls.minDistance = 12;
  controls.maxDistance = 23;
  controls.target.set(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0x74dfff, 0x07101d, 1.4));
  const keyLight = new THREE.PointLight(0x158bc1, 18, 24, 2);
  keyLight.position.set(-5, 6, 7);
  scene.add(keyLight);
  const fillLight = new THREE.PointLight(0x153e9a, 12, 22, 2);
  fillLight.position.set(5, -5, 4);
  scene.add(fillLight);

  // A quiet technical grid gives the network a surface without competing with it.
  const grid = new THREE.GridHelper(18, 36, 0x123348, 0x0a1c2a);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -0.75;
  grid.material.transparent = true;
  grid.material.opacity = 0.28;
  scene.add(grid);

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  window.addEventListener("resize", resize);

  return { renderer, scene, camera, controls, resize };
}

import * as THREE from 'three';
import { Renderer } from './core/Renderer.js';
import { Camera } from './core/Camera.js';
import { Controls } from './core/Controls.js';
import { Level1 } from './levels/Level1.js';

export class Game {
  constructor() {
    this.state = 'INIT'; // INIT, PLAYING, GAME_OVER
    this.lastTime = performance.now();

    this.width = window.innerWidth;
    this.height = window.innerHeight;
  }

  init() {
    console.log('Halcyon-9 initialized.');

    // Core systems
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.05);

    this.camera = new Camera(this.width / this.height);
    this.camera.instance.position.set(0, 3, 0); // adjust ctor args to match your Camera class
    this.renderer = new Renderer();

    // Load first level
    this.currentLevel = new Level1(this.scene);

    // Controls
    this.controls = new Controls(this.camera.instance, document.body, this.currentLevel);

    // Handle resize
    window.addEventListener('resize', () => this.onResize());

    this.raycaster = new THREE.Raycaster();
    this.center = new THREE.Vector2(0, 0);
    this.reticle = document.getElementById('reticle');

     document.addEventListener('click', () => this.onClick());

    this.mouse = new THREE.Vector2();
this.camAnim = null;
this.savedCam = null;
this.createPuzzleUI();

window.addEventListener('mousemove', (e) => {
  this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

document.addEventListener('keydown', (e) => {
  if (this.state === 'PUZZLE' && (e.code === 'KeyE' || e.code === 'Escape')) {
    this.exitPuzzleMode();
  }
});

document.addEventListener('puzzle:open', () => this.enterPuzzleMode());
document.addEventListener('puzzle:lights-fixed', () => {
  setTimeout(() => this.exitPuzzleMode(), 1200); // let the green ticks show first
}); 

    this.startLoop();
  }

  onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.camera.instance.aspect = this.width / this.height;
    this.camera.instance.updateProjectionMatrix();
  }

  lockControls() {
    if (this.controls) {
      this.controls.lock();
      this.state = 'PLAYING';
      this.reticle.classList.add('visible');
    }
  }

  startLoop() {
    const loop = (time) => {
      requestAnimationFrame(loop);
      const delta = (time - this.lastTime) / 1000;
      this.lastTime = time;
      this.update(delta);
      this.renderer.render(this.scene, this.camera.instance);
    };
    requestAnimationFrame(loop);
  }

  update(delta) {
  if (this.state === 'PLAYING') {
    this.controls.update(delta);
    this.updateReticle();
  }
  if (this.state === 'PLAYING' || this.state === 'PUZZLE') {
    this.currentLevel?.update(delta);
  }
  if (this.state === 'PUZZLE') this.updatePuzzleHover();
  this.updateCamAnim(delta);
}

updateReticle() {
  this.raycaster.setFromCamera(this.center, this.camera.instance);
  const targets = this.currentLevel.interactables || [];
  const hits = this.raycaster.intersectObjects(targets, true);
  this.reticle.classList.toggle('active', hits.length > 0 && hits[0].distance < 4);
}

onClick() {
  if (this.state === 'PUZZLE') {
    if (this.camAnim) return; // ignore clicks while the camera is moving
    const puzzle = this.currentLevel.ringPuzzle;
    this.raycaster.setFromCamera(this.mouse, this.camera.instance);
    const hits = this.raycaster.intersectObjects(puzzle.ringMeshes, true);
    if (hits.length > 0) puzzle.handleClick(hits[0].object);
    return;
  }

  if (this.state !== 'PLAYING') return;
  this.raycaster.setFromCamera(this.center, this.camera.instance);
  const targets = this.currentLevel.interactables || [];
  const hits = this.raycaster.intersectObjects(targets, true);
  if (hits.length > 0 && hits[0].distance < 4) {
    console.log("You clicked", hits[0].object.name);
    this.currentLevel.onInteract?.(hits[0].object);
  }
}

createPuzzleUI() {
  const btn = document.createElement('button');
  btn.textContent = '✕ Close (E)';
  Object.assign(btn.style, {
    position: 'fixed', top: '20px', right: '20px', zIndex: 10, display: 'none',
    padding: '8px 14px', background: '#0b1a22', color: '#66ddff',
    border: '1px solid #66ddff', borderRadius: '6px', cursor: 'pointer',
    font: '14px monospace',
  });
  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // don't let this count as a ring click
    this.exitPuzzleMode();
  });
  document.body.appendChild(btn);
  this.closeBtn = btn;
}

enterPuzzleMode() {
  const puzzle = this.currentLevel.ringPuzzle;
  if (this.state !== 'PLAYING' || !puzzle || puzzle.solved) return;

  const cam = this.camera.instance;
  this.state = 'PUZZLE';
  this.controls.instance.unlock();
  this.reticle.classList.remove('visible');
  this.closeBtn.style.display = 'block';

  this.savedCam = { pos: cam.position.clone(), quat: cam.quaternion.clone() };

  // Stand in front of the dials, far enough back that the whole panel fits
  const hub = puzzle.hub;
  const center = hub.getWorldPosition(new THREE.Vector3());
  const normal = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(hub.getWorldQuaternion(new THREE.Quaternion()));

  const size = puzzle.panel.geometry.parameters.height * hub.scale.y;
  const dist = (size * 1.3) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));

  const toPos = center.clone().addScaledVector(normal, dist);
  const look = cam.clone();
  look.position.copy(toPos);
  look.lookAt(center);

  this.startCamAnim(toPos, look.quaternion, null);
}

exitPuzzleMode() {
  if (this.state !== 'PUZZLE' || !this.savedCam) return;
  this.closeBtn.style.display = 'none';
  document.body.style.cursor = 'default';

  const { pos, quat } = this.savedCam;
  this.startCamAnim(pos, quat, () => {
    this.savedCam = null;
    this.lockControls(); // re-locks, sets state back to PLAYING, shows reticle
  });
}

startCamAnim(toPos, toQuat, onDone) {
  const cam = this.camera.instance;
  this.camAnim = {
    t: 0, duration: 0.6,
    fromPos: cam.position.clone(), toPos: toPos.clone(),
    fromQuat: cam.quaternion.clone(), toQuat: toQuat.clone(),
    onDone,
  };
}

updateCamAnim(delta) {
  const a = this.camAnim;
  if (!a) return;
  a.t = Math.min(a.t + delta / a.duration, 1);
  const e = a.t * a.t * (3 - 2 * a.t); // smoothstep easing
  const cam = this.camera.instance;
  cam.position.lerpVectors(a.fromPos, a.toPos, e);
  cam.quaternion.copy(a.fromQuat).slerp(a.toQuat, e);
  if (a.t >= 1) {
    this.camAnim = null;
    a.onDone?.();
  }
}

updatePuzzleHover() {
  const puzzle = this.currentLevel.ringPuzzle;
  if (!puzzle || this.camAnim) return;
  this.raycaster.setFromCamera(this.mouse, this.camera.instance);
  const hits = this.raycaster.intersectObjects(puzzle.ringMeshes, true);
  document.body.style.cursor = hits.length ? 'pointer' : 'default';
}



}
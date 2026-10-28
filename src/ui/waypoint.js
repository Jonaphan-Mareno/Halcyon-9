import * as THREE from 'three';

// Where to draw the objective marker for a point in the world: on the point itself when it is
// in view, otherwise on the screen edge with an arrow pointing the way. Fills `info` in the form
// UIManager.setWaypoint takes ({ x, y, angle, onScreen, label, distance }). The same sums as
// Level 1's guidance; no allocation per frame.

const _view = new THREE.Vector3();
const _ndc = new THREE.Vector3();

export function projectWaypoint(camera, target, label, info) {
  _view.copy(target).applyMatrix4(camera.matrixWorldInverse);
  const inFront = _view.z < 0;
  _ndc.copy(target).project(camera);
  let nx = _ndc.x;
  let ny = _ndc.y;
  if (!inFront) { nx = -nx; ny = -ny; }
  info.onScreen = inFront && Math.abs(nx) < 0.92 && Math.abs(ny) < 0.88;
  info.angle = (Math.atan2(nx, ny) * 180) / Math.PI;   // 0 = up, clockwise
  if (!info.onScreen) {
    const scale = 1 / Math.max(Math.abs(nx) / 0.92, Math.abs(ny) / 0.88, 1e-6);
    nx *= scale;
    ny *= scale;
  }
  info.x = (nx * 0.5 + 0.5) * window.innerWidth;
  info.y = (-ny * 0.5 + 0.5) * window.innerHeight;
  info.label = label;
  info.distance = camera.position.distanceTo(target);
  return info;
}

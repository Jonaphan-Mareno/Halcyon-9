// Contact sheets and measurements of Voss's acting clips (driven by check.mjs, in a headless
// browser): window.__sheet(spec) renders a grid of frames and returns it as a PNG data URL,
// window.__measure() the numbers.
import * as THREE from 'three';
import { Player } from '/src/entities/Player.js';
import { loadVossActing, vossActingInfo, VossActor } from '/src/entities/vossActing.js';

const W = 220, H = 300;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x30343a);
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x404040, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(2, 4, 3);
scene.add(sun);
// a floor with a 10 cm grid
scene.add(new THREE.GridHelper(6, 60, 0x6a7a8a, 0x48505a));
const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 50);

const player = new Player(scene);
await player.load();
player.viewModel.removeFromParent();
const clips = await loadVossActing(player);
const info = await vossActingInfo();
const actor = new VossActor(player, clips);
scene.add(actor.root);
window.__actor = actor;
window.__info = info;

// The lowest point of the skinned body (world y) and the mesh it is on
const tmp = new THREE.Vector3();
function lowest(stride = 3) {
  actor.root.updateMatrixWorld(true);
  let min = Infinity, part = '';
  actor.model.traverse((o) => {
    if (!o.isSkinnedMesh || !o.visible) return;
    const n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i += stride) {
      o.getVertexPosition(i, tmp);
      o.localToWorld(tmp);
      if (tmp.y < min) {
        min = tmp.y;
        // the bone that carries the vertex most
        const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
        let bi = 0;
        for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, bi)) bi = k;
        part = o.skeleton.bones[si.getComponent(i, bi)]?.name.replace(/^ValveBipedBip01_|_\d+$/g, '');
      }
    }
  });
  return [min, part];
}

// One clip alone at time t
function pose(name, t) {
  const m = actor.anim.mixer;
  m.stopAllAction();
  actor._weights.clear();
  const a = actor.anim.actions[name];
  a.reset();
  a.setLoop(THREE.LoopRepeat, Infinity);
  a.setEffectiveWeight(1);
  a.play();
  a.time = t;
  m.update(0);
  actor.root.updateMatrixWorld(true);
}

const views = {
  side: [new THREE.Vector3(3.4, 1.0, 0), new THREE.Vector3(0, 0.75, 0)],
  front: [new THREE.Vector3(0.2, 1.0, 3.4), new THREE.Vector3(0, 0.75, 0)],
  back: [new THREE.Vector3(-0.2, 1.2, -3.4), new THREE.Vector3(0, 0.75, 0)],
  three: [new THREE.Vector3(2.4, 1.3, 2.4), new THREE.Vector3(0, 0.75, 0)],
  low: [new THREE.Vector3(2.6, 0.25, 0.4), new THREE.Vector3(0, 0.25, 0.2)],
  lowfront: [new THREE.Vector3(0.4, 0.3, 2.6), new THREE.Vector3(0, 0.25, 0)],
  feet: [new THREE.Vector3(1.6, 0.12, 0.3), new THREE.Vector3(0, 0.1, 0)],
  arms: [new THREE.Vector3(0.6, 1.3, 1.6), new THREE.Vector3(0, 1.15, 0)]
};
function shoot(view, ctx, x, y, label, follow) {
  const [p, l] = views[view];
  const off = follow ? new THREE.Vector3(follow.x, 0, follow.z) : new THREE.Vector3();
  camera.position.copy(p).add(off);
  camera.lookAt(l.clone().add(off));
  renderer.render(scene, camera);
  ctx.drawImage(renderer.domElement, x, y);
  ctx.fillStyle = '#fff';
  ctx.font = '12px monospace';
  ctx.fillText(label, x + 4, y + 14);
}

// spec: { clip, frames | times, views, follow } or { steps: [[time, 'code'], ...], duration, every, views }
window.__sheet = async (spec) => {
  const vs = spec.views || ['side', 'front'];
  const rows = vs.length;
  const canvas = document.createElement('canvas');
  const pelvisAt = () => actor.bone('pelvis').getWorldPosition(new THREE.Vector3());
  if (spec.clip) {
    const d = actor.clips[spec.clip].duration;
    const n = spec.times ? spec.times.length : spec.frames || 10;
    canvas.width = W * n; canvas.height = H * rows;
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < n; i++) {
      const t = spec.times ? spec.times[i] : (d * i) / (n - 1);
      pose(spec.clip, Math.min(t, d - 1e-4));
      const [lo] = lowest(6);
      vs.forEach((v, r) => shoot(v, ctx, i * W, r * H, `${spec.clip} ${t.toFixed(2)}s y${(lo * 100).toFixed(1)}`, spec.follow ? pelvisAt() : null));
    }
    return canvas.toDataURL('image/png');
  }
  // a sequence through the actor itself (its transitions), sampled every `every` seconds
  actor.anim.mixer.stopAllAction();
  actor._weights.clear(); actor._fade = null; actor.current = null; actor.currentName = null; actor._then = null; actor._stop = null; actor._walkTo = null;
  actor.root.position.set(0, 0, 0); actor.root.rotation.set(0, 0, 0);
  const dt = spec.dt || 1 / 30;
  const shots = [];
  let t = 0, next = 0;
  const steps = spec.steps.slice();
  while (t <= spec.duration + 1e-6) {
    while (steps.length && steps[0][0] <= t + 1e-6) new Function('actor', 'THREE', steps.shift()[1])(actor, THREE);
    actor.update(t === 0 ? 0 : dt);
    if (spec.move) { actor.root.position.z += actor.moveSpeed * dt; }
    if (t >= next - 1e-6) {
      const w = actor.weights().filter(([, w]) => w > 0.01).map(([n, w]) => `${n.replace('#2', "'")}:${w.toFixed(2)}`).join(' ');
      const pelvis = pelvisAt();
      const img = vs.map((v) => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        shoot(v, c.getContext('2d'), 0, 0, `${t.toFixed(2)}s y${(lowest(8)[0] * 100).toFixed(1)}`, spec.follow ? pelvis : null);
        return c;
      });
      shots.push({ w, img });
      next += spec.every;
    }
    t += dt;
  }
  canvas.width = W * shots.length; canvas.height = H * rows + 34;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  shots.forEach((s, i) => {
    s.img.forEach((c, r) => ctx.drawImage(c, i * W, r * H));
    ctx.fillStyle = '#ff8'; ctx.font = '11px monospace';
    s.w.split(' ').forEach((line, k) => ctx.fillText(line, i * W + 4, H * rows + 11 + k * 11));
  });
  return canvas.toDataURL('image/png');
};

// Numbers: the load's timing, the walk's measures, each clip's lowest point over time
window.__measure = () => {
  const out = { timing: info.timing, sitMismatch: info.sitMismatch, walk: { stride: info.walk.stride, stops: info.walk.stops, speed: actor.naturalWalkSpeed } };
  out.clips = {};
  for (const c of clips) {
    const d = c.duration;
    const lows = [];
    for (let i = 0; i <= 24; i++) {
      pose(c.name, Math.min((d * i) / 24, d - 1e-4));
      const [y, p] = lowest(4);
      const pel = actor.bone('pelvis').getWorldPosition(new THREE.Vector3());
      lows.push([+((d * i) / 24).toFixed(2), +(y * 100).toFixed(1), p, +(pel.y * 100).toFixed(1)]);
    }
    out.clips[c.name] = { duration: d, frames: info.takes[c.name].times.length, userData: c.userData, lows };
  }
  return out;
};
window.__ready = true;

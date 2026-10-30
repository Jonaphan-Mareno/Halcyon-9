import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Player } from '../entities/Player.js';
import { loadVossActing, vossActingInfo, VossActor, ACTING_CLIPS } from '../entities/vossActing.js';

// ?voss-anim (dev builds only, see main.js): Voss's acting clips on one lit Voss, in the game's
// toon look, on a floor with a 10 cm grid. Buttons play each clip (crossfading as the cutscene
// would) and the transitions in a row; the readout shows the clip and the blend weights.

const FACES = ['resigned', 'neutral', 'tense', 'strained', 'calm', 'arguing', 'whisper'];

// Sequences: [seconds after the last step, what to do]
const SEQUENCES = {
  'walk then stop': (a) => [[0, () => walkIn(a)]],
  'sad > stagger > sad': () => [[0, (a) => a.crossTo('SadIdle')], [0.6, (a) => a.crossTo('Stagger', { then: 'SadIdle' })]],
  'sit down': () => [[0, (a) => a.crossTo('SitDown', { then: 'SitIdle' })]],
  'stand up': () => [[0, (a) => a.crossTo('StandUp', { then: 'SadIdle' })]],
  'sit then fall': () => [[0, (a) => a.crossTo('SitDown', { then: 'SitIdle' })], [7.5, (a) => a.crossTo('FallForward')]],
  'stand then fall': () => [[0, (a) => a.crossTo('SadIdle')], [1.5, (a) => a.crossTo('FallForward')]],
  'hand to head': () => [[0, (a) => a.crossTo('SadIdle')], [0.5, (a) => a.reach('L', backOfHead(a), { fade: 0.8 })], [3, (a) => a.reach('L', null, { fade: 0.8 })]]
};

// From 3.5 m behind his spot, walking in and stopping on it
function walkIn(actor) {
  actor.root.position.set(0, 0, -3.5);
  actor.root.rotation.set(0, 0, 0);
  actor.crossTo('InjuredWalk', { fade: 0 });
  return actor.walkTo(new THREE.Vector3(0, 0, 0), { then: 'SadIdle' });
}

// The left hand to the back of his head, palm on it (an example of reach(), as beat 6 needs)
function backOfHead(actor) {
  const head = actor.bone('head');
  const v = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3();
  return () => {
    actor.root.getWorldQuaternion(_q);
    up.set(0, 1, 0).applyQuaternion(_q);
    fwd.set(0, 0, 1).applyQuaternion(_q);
    head.getWorldPosition(v);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(_q);
    return {
      wrist: v.clone().addScaledVector(fwd, -0.17).addScaledVector(up, 0.02).addScaledVector(side, 0.05),
      fingers: up.clone().addScaledVector(fwd, 0.3).addScaledVector(side, -0.4).normalize(),
      palm: fwd.clone().negate(),
      pole: side.clone().addScaledVector(up, 0.3)
    };
  };
}
const _q = new THREE.Quaternion();

export async function startVossAnimPreview() {
  document.documentElement.classList.remove('cine');
  for (const id of ['ui-layer', 'app']) document.getElementById(id)?.remove();
  document.body.style.cssText = 'margin:0;overflow:hidden;background:#1b1e23;font:13px sans-serif;color:#ddd';

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2e34);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3a3a, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x3b4048 });
  const floorGeo = new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2);
  scene.add(new THREE.Mesh(floorGeo, floorMat));
  const grid = new THREE.GridHelper(12, 120, 0x6a7a8a, 0x4a525c);
  grid.position.y = 0.001;
  scene.add(grid);

  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 60);
  camera.position.set(2.6, 1.6, 3.2);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 0.9, 0);
  orbit.enableDamping = true;

  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:8px;left:8px;width:300px;max-height:calc(100vh - 16px);overflow:auto;background:rgba(0,0,0,.6);padding:8px;border-radius:6px';
  panel.innerHTML = '<b>Voss acting</b> <span id="va-status">loading...</span>';
  document.body.appendChild(panel);
  const readout = document.createElement('pre');
  readout.style.cssText = 'position:fixed;bottom:8px;left:8px;margin:0;background:rgba(0,0,0,.6);padding:8px;border-radius:6px;font:12px monospace;color:#ff9';
  document.body.appendChild(readout);

  const player = new Player(scene);
  await player.load();
  player.viewModel.removeFromParent();
  const clips = await loadVossActing(player);
  const info = await vossActingInfo();
  const actor = new VossActor(player, clips);
  scene.add(actor.root);
  actor.crossTo('SadIdle', { fade: 0 });
  if (import.meta.env.DEV) window.__actor = actor;
  panel.querySelector('#va-status').textContent = `(${Math.round(info.timing.load)} ms load, ${Math.round(info.timing.retarget + info.timing.build)} ms build)`;

  let timeScale = 1;
  let queue = [];          // [[time, fn]] of the running sequence
  let seqT = 0;
  let follow = true;

  const section = (title) => {
    const h = document.createElement('div');
    h.style.cssText = 'margin:10px 0 4px;color:#9cf';
    h.textContent = title;
    panel.appendChild(h);
    const box = document.createElement('div');
    box.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px';
    panel.appendChild(box);
    return box;
  };
  const button = (box, label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'font:12px sans-serif;padding:3px 6px';
    b.onclick = fn;
    box.appendChild(b);
  };
  const toggle = (box, label, get, set) => {
    const l = document.createElement('label');
    l.style.cssText = 'margin-right:8px';
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.checked = get();
    c.onchange = () => set(c.checked);
    l.append(c, ' ' + label);
    box.appendChild(l);
  };

  const clipsBox = section('Clips (crossfades from what plays now)');
  for (const name of ACTING_CLIPS) {
    button(clipsBox, name, () => {
      queue = [];
      const loop = actor.clips[name].userData.loop;
      actor.crossTo(name, loop ? {} : { restart: true });
    });
  }
  const seqBox = section('Transitions');
  for (const [label, make] of Object.entries(SEQUENCES)) {
    button(seqBox, label, () => {
      seqT = 0;
      let t = 0;
      queue = make(actor).map(([dt, fn]) => [(t += dt), fn]);
    });
  }
  button(seqBox, 'reset', () => {
    queue = [];
    actor.root.position.set(0, 0, 0);
    actor.root.rotation.set(0, 0, 0);
    actor.crossTo('SadIdle', { fade: 0 });
  });

  const opts = section('Options');
  toggle(opts, 'wound', () => true, (v) => actor.showWound(v));
  toggle(opts, 'breathing', () => actor.breathing, (v) => (actor.breathing = v));
  toggle(opts, 'weight shift', () => actor.weightShift, (v) => (actor.weightShift = v));
  toggle(opts, 'head drift', () => actor.headDrift, (v) => (actor.headDrift = v));
  toggle(opts, 'face head', () => actor.faceHead, (v) => (actor.faceHead = v));
  toggle(opts, 'hands off floor', () => actor.handsOnFloor, (v) => (actor.handsOnFloor = v));
  toggle(opts, 'camera follows', () => follow, (v) => (follow = v));
  const speedRow = document.createElement('div');
  speedRow.innerHTML = 'time scale <input type="range" min="0.05" max="2" step="0.05" value="1" style="width:140px"> <span>1.00</span>';
  const [slider, shown] = [speedRow.querySelector('input'), speedRow.querySelector('span')];
  slider.oninput = () => { timeScale = +slider.value; shown.textContent = timeScale.toFixed(2); };
  opts.appendChild(speedRow);
  const faceRow = document.createElement('div');
  faceRow.innerHTML = 'face <select>' + FACES.map((f) => `<option>${f}</option>`).join('') + '</select>';
  faceRow.querySelector('select').onchange = (e) => actor.setFacePreset(e.target.value);
  opts.appendChild(faceRow);
  const actBox = section('Face acting');
  button(actBox, 'nod', () => actor.face.gesture('nod', 0.7));
  button(actBox, 'shake', () => actor.face.gesture('shake', 0.7));
  button(actBox, 'tic', () => actor.face.tic());
  button(actBox, 'look left', () => actor.face.look(0.5, 0, 1.5));
  button(actBox, 'stare 3 s', () => actor.face.stare(3));

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  let then = performance.now();
  const pelvis = new THREE.Vector3();
  let fps = 0;
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const raw = Math.min((now - then) / 1000, 0.1);
    then = now;
    fps += (1 / Math.max(raw, 1e-3) - fps) * 0.05;
    const dt = raw * timeScale;
    seqT += dt;
    while (queue.length && queue[0][0] <= seqT) queue.shift()[1](actor);
    // a walk played from its button: the root walks on, and comes round again
    if (actor.currentName === 'InjuredWalk' && !actor._walkTo) {
      actor.root.position.x += Math.sin(actor.root.rotation.y) * actor.moveSpeed * dt;
      actor.root.position.z += Math.cos(actor.root.rotation.y) * actor.moveSpeed * dt;
      if (actor.root.position.length() > 4) actor.root.position.multiplyScalar(-0.99);
    }
    actor.update(dt);
    if (follow) {
      actor.bone('pelvis').getWorldPosition(pelvis);
      const goal = new THREE.Vector3(pelvis.x, Math.max(0.5, pelvis.y), pelvis.z);
      const move = goal.sub(orbit.target).multiplyScalar(1 - Math.exp(-4 * raw));
      orbit.target.add(move);
      camera.position.add(move);
    }
    orbit.update();
    renderer.render(scene, camera);
    const w = actor.weights().map(([n, w, t]) => `${n.padEnd(16)} ${w.toFixed(2)}  t ${t.toFixed(2)}`).join('\n');
    readout.textContent = `clip   ${actor.currentName}${actor.isFinished(actor.currentName) ? ' (finished)' : ''}\n${w}\n`
      + `walk   ${actor.walkSpeed.toFixed(2)} m/s, moving ${actor.moveSpeed.toFixed(2)} m/s\n`
      + `reach  L ${actor.reachWeight('L').toFixed(2)}  R ${actor.reachWeight('R').toFixed(2)}\n${fps.toFixed(0)} fps`;
  });
}

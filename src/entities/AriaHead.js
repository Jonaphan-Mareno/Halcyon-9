import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ARIA's 3D face, modelled in Blender (aria-head.glb) with morph targets:
// jaw_open, mouth_smile, mouth_pucker, mouth_wide, blink, brow_up, brow_down.
//
// The head is rendered into a small offscreen texture each frame. AriaManager
// feeds that texture to the hologram shader (dot matrix, scanlines, glitch) in
// place of the old video, so the monitors show a live, animated 3D face.
//
// Lip sync: while a voice line plays, its loudness and tone (via a Web Audio
// analyser) drive the jaw and mouth shape. With no audio yet the mouth is
// driven procedurally instead.

const HEAD_MODEL = './assets/models/aria-head.glb';
const TARGET_WIDTH = 512;
const TARGET_HEIGHT = 288;

// Facial expression targets, blended smoothly. tilt/nod are head movements,
// gaze turns the eyes sideways (0 = straight at the player).
const EXPRESSIONS = {
  neutral:   { brow_up: 0.0,  brow_down: 0.0,  smile: 0.0,  tilt: 0.0,  gaze: 0.0, nod: false },
  relief:    { brow_up: 0.35, brow_down: 0.0,  smile: 0.25, tilt: 0.0,  gaze: 0.0, nod: false },
  robotic:   { brow_up: 0.0,  brow_down: 0.0,  smile: 0.0,  tilt: 0.14, gaze: 0.0, nod: false },
  hesitant:  { brow_up: 0.55, brow_down: 0.0,  smile: 0.0,  tilt: 0.0,  gaze: 0.45, nod: false },
  deadpan:   { brow_up: 0.0,  brow_down: 0.0,  smile: 0.0,  tilt: 0.0,  gaze: 0.0, nod: true },
  directive: { brow_up: 0.0,  brow_down: 0.28, smile: 0.0,  tilt: 0.0,  gaze: 0.0, nod: false },
  // ARIA's bubbly personality, with a few half-true, slightly-too-bright moods
  bubbly:    { brow_up: 0.18, brow_down: 0.0,  smile: 0.45, tilt: 0.0,  gaze: 0.0, nod: false },
  sly:       { brow_up: 0.25, brow_down: 0.0,  smile: 0.30, tilt: 0.10, gaze: 0.25, nod: false },
  watching:  { brow_up: 0.0,  brow_down: 0.12, smile: 0.25, tilt: 0.06, gaze: 0.0, nod: false }
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export class AriaHead {
  constructor() {
    this.ready = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(25, TARGET_WIDTH / TARGET_HEIGHT, 0.1, 50);
    this.camera.position.set(0, 0, 6);

    // Grayscale studio lighting: bright key from the upper front, dim fill
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(-1.5, 2.5, 4);
    const rim = new THREE.DirectionalLight(0xffffff, 0.8);
    rim.position.set(2, 1, -2);
    this.scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.9));

    this.target = new THREE.WebGLRenderTarget(TARGET_WIDTH, TARGET_HEIGHT, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false
    });
    this.texture = this.target.texture;

    this.root = new THREE.Group(); // idle sway / tilt / nod applied here
    this.scene.add(this.root);
    this.head = null;               // mesh with the morph targets
    this.eyes = [];
    this.morph = {};                // name -> index

    // Animation state
    this.time = 0;
    this.expr = { ...EXPRESSIONS.neutral };
    this.exprTarget = { ...EXPRESSIONS.neutral };
    this.tilt = 0;
    this.gaze = 0;
    this.nodTime = -1;
    this.blinkValue = 0;
    this.nextBlink = 2.5;
    this.blinkTime = -1;

    // Speech
    this.speaking = false;
    this.speechTime = 0;
    this.jaw = 0;
    this.wide = 0;
    this.pucker = 0;
    this.audioCtx = null;
    this.analyser = null;
    this._timeData = null;
    this._freqData = null;
  }

  // Resolves when the model is loaded, rejects if it cannot be
  async load() {
    const gltf = await new GLTFLoader().loadAsync(HEAD_MODEL);

    // Find the head mesh (the one with morph targets)
    gltf.scene.traverse((child) => {
      if (child.isMesh && child.morphTargetDictionary) this.head = child;
    });

    // Centre the head on the origin and frame it. Measured from the base
    // vertices only: Box3.setFromObject also counts every morph target's
    // extent, which would make the head look bigger than it is.
    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3()
      .setFromBufferAttribute(this.head.geometry.attributes.position)
      .applyMatrix4(this.head.matrixWorld);
    const centre = box.getCenter(new THREE.Vector3());
    gltf.scene.position.sub(centre);
    const size = box.getSize(new THREE.Vector3());
    const fov = THREE.MathUtils.degToRad(this.camera.fov);

    // Frame the visible face, not the whole skull: the top third of the head is
    // black hair (invisible in the hologram) and the chin is the bottom. The
    // face spans about two thirds of the head's height, from the chin up, so it
    // is centred a little below the head's middle.
    const faceHeight = size.y * 0.674;
    const faceCentreY = -size.y * 0.5 + faceHeight * 0.5;
    const viewHeight = faceHeight / 0.78;             // the face fills 78% of the frame
    this.camera.position.set(0, faceCentreY, (viewHeight * 0.5) / Math.tan(fov / 2));

    gltf.scene.traverse((child) => {
      if (!child.isMesh) return;
      // Painted grayscale lives in the vertex colours; light it simply
      // FrontSide on the head: the mouth and eye openings then show pure black
      // (the inside of the hollow head is culled) instead of the inner surface
      child.material = new THREE.MeshLambertMaterial({ vertexColors: true });
      if (child === this.head) {
        this.morph = child.morphTargetDictionary;
      } else if (child.name.startsWith('ARIA_Eye')) {
        this.eyes.push(child); // turn with the gaze; the ears and neck stay put
      }
    });

    this.root.add(gltf.scene);
    this.ready = true;
  }

  // ---------------------------------------------------------
  // Voice: connect a playing <audio> element to the lip sync
  // ---------------------------------------------------------
  attachAudio(audio) {
    try {
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

      const source = this.audioCtx.createMediaElementSource(audio);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.3;
      // The lip sync reads the untouched signal; what the player hears is
      // boosted, since the recordings are quiet (peaks at about -5 dB)
      const gain = this.audioCtx.createGain();
      gain.gain.value = 1.8;
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(this.audioCtx.destination); // keep it audible

      this.analyser = analyser;
      this._timeData = new Uint8Array(analyser.fftSize);
      this._freqData = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) {
      this.analyser = null; // fall back to the procedural mouth
    }
  }

  detachAnalyser() {
    this.analyser = null;
  }

  startSpeaking() {
    this.speaking = true;
    this.speechTime = 0;
  }

  stopSpeaking() {
    this.speaking = false;
    this.analyser = null;
  }

  setExpression(name) {
    const target = EXPRESSIONS[name] || EXPRESSIONS.neutral;
    this.exprTarget = { ...target };
    if (target.nod) this.nodTime = 0;
  }

  // ---------------------------------------------------------
  // Per frame
  // ---------------------------------------------------------
  update(delta) {
    if (!this.ready || !this.head) return;
    this.time += delta;

    this._updateSpeech(delta);
    this._updateBlink(delta);

    // Ease the expression toward its target
    const k = 1 - Math.exp(-6 * delta);
    for (const key of ['brow_up', 'brow_down', 'smile', 'tilt', 'gaze']) {
      this.expr[key] += (this.exprTarget[key] - this.expr[key]) * k;
    }

    this._setMorph('jaw_open', Math.min(1, this.jaw * 1.35)); // a little extra range so the mouth reads on the small screen
    this._setMorph('mouth_wide', this.wide);
    this._setMorph('mouth_pucker', this.pucker);
    this._setMorph('mouth_smile', this.expr.smile);
    this._setMorph('brow_up', this.expr.brow_up);
    this._setMorph('brow_down', this.expr.brow_down);
    // Eyelids rest half-lowered: calm and composed instead of startled
    this._setMorph('blink', Math.max(this.blinkValue, 0.34));

    // Idle: slow breathing and a faint sway, plus tilt / nod / gaze
    let nod = 0;
    if (this.nodTime >= 0) {
      this.nodTime += delta;
      nod = Math.sin(Math.min(1, this.nodTime / 1.4) * Math.PI) * 0.16;
      if (this.nodTime > 1.4) this.nodTime = -1;
    }
    this.root.rotation.y = Math.sin(this.time * 0.35) * 0.05;
    this.root.rotation.x = Math.sin(this.time * 0.5) * 0.015 + nod;
    this.root.rotation.z = this.expr.tilt;
    this.root.scale.setScalar(1 + Math.sin(this.time * 1.1) * 0.006);
    for (const eye of this.eyes) eye.rotation.y = this.expr.gaze;
  }

  _setMorph(name, value) {
    const i = this.morph[name];
    if (i !== undefined) this.head.morphTargetInfluences[i] = value;
  }

  _updateBlink(delta) {
    this.nextBlink -= delta;
    if (this.nextBlink <= 0 && this.blinkTime < 0) {
      this.blinkTime = 0;
      this.nextBlink = 3 + Math.random() * 4; // ARIA blinks rarely
    }
    if (this.blinkTime >= 0) {
      this.blinkTime += delta;
      this.blinkValue = Math.sin(clamp01(this.blinkTime / 0.18) * Math.PI);
      if (this.blinkTime > 0.18) {
        this.blinkTime = -1;
        this.blinkValue = 0;
      }
    }
  }

  _updateSpeech(delta) {
    let jaw = 0;
    let wide = 0;
    let pucker = 0;

    if (this.speaking && this.analyser) {
      // Loudness -> jaw opening
      this.analyser.getByteTimeDomainData(this._timeData);
      let sum = 0;
      for (let i = 0; i < this._timeData.length; i++) {
        const v = (this._timeData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this._timeData.length);
      jaw = Math.pow(clamp01(rms * 5.5), 0.8);

      // Tone: bright sounds (ee, s) stretch the mouth, dark ones (oo) round it
      this.analyser.getByteFrequencyData(this._freqData);
      let low = 0;
      let high = 0;
      for (let i = 2; i <= 12; i++) low += this._freqData[i];
      for (let i = 46; i <= 116; i++) high += this._freqData[i];
      const ratio = high / (low + high + 1);
      wide = jaw * smoothstep(0.35, 0.65, ratio) * 0.8;
      pucker = jaw * (1 - smoothstep(0.12, 0.35, ratio)) * 0.45;
    } else if (this.speaking) {
      // No audio for this line yet: believable talking from layered sine waves
      this.speechTime += delta;
      const t = this.speechTime;
      jaw = clamp01(0.35 + 0.35 * Math.sin(t * 11) * Math.sin(t * 3.1) + 0.2 * Math.sin(t * 17));
      wide = clamp01(0.5 * Math.sin(t * 5.3)) * jaw;
      pucker = clamp01(0.5 * Math.sin(t * 4.1 + 2)) * jaw * 0.6;
    }

    // Smooth: quick to open, a little slower to close
    const rate = jaw > this.jaw ? 30 : 16;
    const k = 1 - Math.exp(-rate * delta);
    this.jaw += (jaw - this.jaw) * k;
    this.wide += (wide - this.wide) * k;
    this.pucker += (pucker - this.pucker) * k;
  }

  // Render the head into the offscreen texture (call before the main render)
  render(renderer) {
    if (!this.ready) return;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(previous);
  }

  dispose() {
    this.stopSpeaking();
    this.target.dispose();
    this.scene.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
    if (this.audioCtx) this.audioCtx.close();
  }
}

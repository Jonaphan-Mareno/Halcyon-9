import * as THREE from 'three';
import { createGLTFLoader } from '../core/loaders.js';

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

// Facial expressions, blended smoothly. brow_up, brow_down and smile are morph amounts; lids is
// how far the upper eyelids rest down (lower: eyes wider, higher: narrowed); tilt and pitch are
// head movements (pitch > 0: chin down); gaze turns the eyes sideways (0 = straight at the
// player). life is how much the face moves while she talks: brows lifting on stressed words (or,
// angry, the frown deepening), the eyes widening with them, little nods. Brow amounts a little
// over 1 push the frown further than the sculpted target.
const EXPRESSIONS = {
  neutral:   { brow_up: 0.0,  brow_down: 0.0,  smile: 0.05, lids: 0.28, tilt: 0.0,   pitch: 0.0,   gaze: 0.0,  life: 1.0 },
  relief:    { brow_up: 0.55, brow_down: 0.0,  smile: 0.55, lids: 0.16, tilt: 0.05,  pitch: -0.03, gaze: 0.0,  life: 1.0 },
  robotic:   { brow_up: 0.0,  brow_down: 0.0,  smile: 0.0,  lids: 0.34, tilt: 0.14,  pitch: 0.0,   gaze: 0.0,  life: 0.3 },
  // worried: brows up, eyes sliding away, head down a little
  hesitant:  { brow_up: 0.9,  brow_down: 0.0,  smile: 0.0,  lids: 0.24, tilt: -0.05, pitch: 0.05,  gaze: 0.45, life: 0.8 },
  deadpan:   { brow_up: 0.0,  brow_down: 0.1,  smile: 0.0,  lids: 0.48, tilt: 0.0,   pitch: 0.0,   gaze: 0.0,  life: 0.4, nod: true },
  directive: { brow_up: 0.0,  brow_down: 0.45, smile: 0.0,  lids: 0.32, tilt: 0.0,   pitch: 0.02,  gaze: 0.0,  life: 0.9 },
  // ARIA's bubbly personality, with a few half-true, slightly-too-bright moods: happy is wide
  // eyes, raised brows and a real smile
  bubbly:    { brow_up: 0.6,  brow_down: 0.0,  smile: 0.85, lids: 0.06, tilt: 0.07,  pitch: -0.03, gaze: 0.0,  life: 1.4 },
  sly:       { brow_up: 0.25, brow_down: 0.3,  smile: 0.5,  lids: 0.5,  tilt: 0.12,  pitch: 0.03,  gaze: 0.25, life: 0.9 },
  watching:  { brow_up: 0.0,  brow_down: 0.25, smile: 0.25, lids: 0.42, tilt: 0.06,  pitch: 0.02,  gaze: 0.0,  life: 0.6 },
  // hiding something: a thin smile, eyes sliding away (level 2)
  guarded:   { brow_up: 0.2,  brow_down: 0.3,  smile: 0.1,  lids: 0.38, tilt: 0.04,  pitch: 0.03,  gaze: 0.35, life: 0.7 },
  // the mask slips: a hard frown, narrowed eyes, chin down, staring straight out (level 2's snap)
  hostile:   { brow_up: 0.0,  brow_down: 1.25, smile: 0.0,  lids: 0.46, tilt: 0.0,   pitch: 0.09,  gaze: 0.0,  life: 1.2, angry: true }
};
const EASED = ['brow_up', 'brow_down', 'smile', 'lids', 'tilt', 'pitch', 'gaze', 'life'];

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
    this.exprName = 'neutral';
    this.nodTime = -1;
    this.blinkValue = 0;
    this.nextBlink = 2.5;
    this.blinkTime = -1;
    // the eyes' small darting moves, and how much she is talking (eased 0..1)
    this.saccade = { x: 0, y: 0, tx: 0, ty: 0, next: 1 };
    this.talk = 0;
    // a stressed syllable: a quick pulse the brows, eyes and head answer
    this.emphasis = 0;
    this._loudAvg = 0;

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
    const gltf = await createGLTFLoader().loadAsync(HEAD_MODEL);

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
    // a change of mood comes with a blink, as a person's does
    if (name !== this.exprName && this.blinkTime < 0) this.blinkTime = 0;
    this.exprName = name;
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
    this._updateEyes(delta);

    // Ease the expression toward its target (the brows move quicker than the rest)
    const k = 1 - Math.exp(-6 * delta), kb = 1 - Math.exp(-10 * delta);
    for (const key of EASED) {
      const rate = key === 'brow_up' || key === 'brow_down' ? kb : k;
      this.expr[key] += (this.exprTarget[key] - this.expr[key]) * rate;
    }
    this.talk += ((this.speaking ? 1 : 0) - this.talk) * (1 - Math.exp(-4 * delta));
    const e = this.emphasis * this.expr.life;
    const angry = !!this.exprTarget.angry;
    // a faint drift in the brows even when still: a face is never quite frozen
    const drift = Math.sin(this.time * 0.7) * 0.03 + Math.sin(this.time * 1.9 + 1) * 0.02;

    this._setMorph('jaw_open', Math.min(1, this.jaw * 1.35)); // a little extra range so the mouth reads on the small screen
    this._setMorph('mouth_wide', this.wide);
    this._setMorph('mouth_pucker', this.pucker);
    this._setMorph('mouth_smile', this.expr.smile * (1 - this.jaw * 0.4));
    this._setMorph('brow_up', Math.max(0, this.expr.brow_up + (angry ? 0 : e * 0.45) + drift));
    this._setMorph('brow_down', this.expr.brow_down + (angry ? e * 0.35 : 0));
    // the eyelids: where the mood rests them (stressed words open them, or angry, narrow them),
    // and the blinks
    const lids = clamp01(this.expr.lids + (angry ? e * 0.06 : -e * 0.12));
    this._setMorph('blink', Math.max(this.blinkValue, lids));

    // the head: slow breathing and sway; nods and tilts of the mood; while she talks it moves with
    // her words (a dip on each syllable, a lift on stressed ones, a slow turn back and forth)
    let nod = 0;
    if (this.nodTime >= 0) {
      this.nodTime += delta;
      nod = Math.sin(Math.min(1, this.nodTime / 1.4) * Math.PI) * 0.16;
      if (this.nodTime > 1.4) this.nodTime = -1;
    }
    const t = this.time, talk = this.talk;
    this.root.rotation.y = Math.sin(t * 0.35) * 0.05 + Math.sin(t * 0.13 + 2) * 0.03 + Math.sin(t * 1.7) * 0.035 * talk;
    this.root.rotation.x = Math.sin(t * 0.5) * 0.015 + nod + this.expr.pitch + this.jaw * 0.03 * talk - e * 0.045;
    this.root.rotation.z = this.expr.tilt + Math.sin(t * 1.1 + 0.5) * 0.02 * talk;
    this.root.scale.setScalar(1 + Math.sin(t * 1.1) * 0.006);
    for (const eye of this.eyes) {
      eye.rotation.y = this.expr.gaze + this.saccade.x;
      eye.rotation.x = this.saccade.y;
    }
  }

  // The eyes dart a little every second or two, as eyes do, quick to move and still between; while
  // she talks they come back to the player more often
  _updateEyes(delta) {
    const s = this.saccade;
    s.next -= delta;
    if (s.next <= 0) {
      const toPlayer = this.speaking && Math.random() < 0.6;
      s.tx = toPlayer ? 0 : (Math.random() - 0.5) * 0.18;
      s.ty = toPlayer ? 0 : (Math.random() - 0.5) * 0.08;
      s.next = this.speaking ? 0.5 + Math.random() * 1.2 : 0.9 + Math.random() * 2.2;
    }
    const k = 1 - Math.exp(-30 * delta);
    s.x += (s.tx - s.x) * k;
    s.y += (s.ty - s.y) * k;
  }

  _setMorph(name, value) {
    const i = this.morph[name];
    if (i !== undefined) this.head.morphTargetInfluences[i] = value;
  }

  _updateBlink(delta) {
    this.nextBlink -= delta;
    if (this.nextBlink <= 0 && this.blinkTime < 0) {
      this.blinkTime = 0;
      // every few seconds, more often while she talks
      this.nextBlink = this.speaking ? 1.8 + Math.random() * 2.5 : 3 + Math.random() * 4;
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

    // a stressed syllable: the voice jumping well above its recent loudness
    this._loudAvg += (jaw - this._loudAvg) * (1 - Math.exp(-3 * delta));
    const rise = jaw - this._loudAvg;
    if (this.speaking && rise > 0.16 && this.emphasis < 0.35) this.emphasis = Math.min(1, rise * 2.5);
    this.emphasis = Math.max(0, this.emphasis - delta * 2.2);

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

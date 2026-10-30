import * as THREE from 'three';
import { SHOTS, paintFamilies, finish as paintFinish } from './EndingNarration.js';

// The "Stay" ending's narration, its last lines (narration-c.js plays them, times them and draws them
// through the confrontation's look):
//
//   4   "Voss's research was used to help countless people bring back a lifetime of memories..."
//       The families of the Save-ARIA narration (its renders, EndingNarration's paintFamilies).
//       "...and his mother was the first person to be cured."
//       The film: his mother, old, in a chair in the memory care ward, a moment from the front; then
//       close over her shoulder onto her hands, slowly going through the prologue's six Polaroids,
//       each looked at, drawn off and tucked behind. A long silence, the music box under it.
//   11  "He kept his promise to his mother after all."
//       The last of the six is drawn off: the photo the player has never seen, Voss in his lab coat with
//       her, old: "Voss, my hero". She brings it a little nearer. A pause.
//       "Sorry... I always get a bit teary when this story comes to an end."
//       It is held, very slowly closer, then black. Then its caption alone, on the black.
//
// The film is rendered (Blender/scripts/render_ending_chair.py) and kept to the narration's clock. It
// goes straight to the screen with its own bars and vignette, not through the confrontation's look:
// that look's tone mapping and drained colour wash the photos out.

const VIDEO = './assets/textures/ending/chair/chair.mp4';
const CAPTION = './assets/textures/ending/chair/caption.webp';
// (as in render_ending_chair.py) FRONT: her, from the front; FLIP: each photo; LAST: when "Voss, my
// hero" is uncovered; LENGTH: where the film stops, on its last frame
const FRONT = 2.6, FLIP = 2.4, FLIPS = 6, TAIL = 4.6;
export const FILM = {
  flips: Array.from({ length: FLIPS }, (_, i) => FRONT + FLIP * (i + 0.3)),   // when each photo is taken
  last: FRONT + FLIP * (FLIPS - 1) + FLIP * 0.62,
  length: FRONT + FLIP * FLIPS + TAIL
};
const SEEK_OFF = 0.25;                            // seconds out from the clock before it is put right
const PUSH = 0.1, PUSH_FOR = 14;                  // the very slow push on the last photo, and how long it takes
const PUSH_AT = [0.5, 0.48];                      // toward the photo (0..1 of the picture)
const CAPTION_WIDTH = 0.5;                        // its width, on the black (share of the picture's width)
const BARS = 0.07;                                // the bars, top and bottom, as in the rest of the ending

function image(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

export class ChairShot {
  constructor() {
    this.ready = false;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.scene = new THREE.Scene();
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this._size = new THREE.Vector2();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.camera.position.z = 0.5;
    this.times = null;
  }

  async preload() {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = VIDEO;
    const loaded = new Promise((resolve, reject) => {
      video.addEventListener('canplaythrough', resolve, { once: true });
      video.addEventListener('error', () => reject(new Error('no chair film')), { once: true });
    });
    video.load();
    const [families, caption] = await Promise.all([Promise.all(SHOTS.families.map(image)), image(CAPTION), loaded]);
    Object.assign(this, { video, families, caption });
    this.ready = true;
  }

  // when things happen, in seconds from the families' start: { chair (the film starts: the pause in
  // line 4), last (the film's LAST), caption, captionEnd }
  setTimes(times) {
    this.times = times;
  }

  // Draws the frame at time t (from the families' start) to the screen, faded by black (0..1).
  draw(renderer, t, black) {
    // (the canvas takes the picture's shape, so nothing is stretched)
    renderer.getDrawingBufferSize(this._size);
    const shape = Math.round(this.canvas.width * this._size.y / Math.max(1, this._size.x));
    if (this.canvas.height !== shape) {
      this.canvas.height = shape;
      this.texture.dispose();
    }
    const g = this.g, w = this.canvas.width, h = this.canvas.height, T = this.times;
    if (t < T.caption) {
      if (t < T.chair) paintFamilies(g, w, h, Math.max(0, t), T.chair, this.families);
      else this._film(t - T.chair, t - T.last);
      paintFinish(g, w, h, t, 1);
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h * BARS);
      g.fillRect(0, h * (1 - BARS), w, h * BARS);
    } else {
      this.video.pause();
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
      const a = Math.min(1, (t - T.caption) / 1.2) * Math.min(1, (T.captionEnd - t) / 0.9);
      if (this.caption && a > 0) {
        const cw = w * CAPTION_WIDTH, ch = cw * (this.caption.naturalHeight / this.caption.naturalWidth);
        g.globalAlpha = a;
        g.drawImage(this.caption, (w - cw) / 2, (h - ch) / 2, cw, ch);
        g.globalAlpha = 1;
      }
    }
    this.texture.needsUpdate = true;
    this.material.color.setScalar(1 - black);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  // The film at s seconds, kept to the clock; after its last photo (since: seconds), very slowly closer
  _film(s, since) {
    const v = this.video, g = this.g, w = this.canvas.width, h = this.canvas.height;
    const want = Math.min(s, FILM.length);
    if (s < FILM.length) {
      if (v.paused && !v.ended) v.play().catch(() => {});
      if (Math.abs(v.currentTime - want) > SEEK_OFF) v.currentTime = want;
    }
    const k = 1 + PUSH * Math.max(0, Math.min(1, since / PUSH_FOR));
    const vw = v.videoWidth || 1280, vh = v.videoHeight || 720;
    const base = Math.max(w / vw, h / vh) * k;
    // (so PUSH_AT stays where it is on the screen as the picture grows)
    const fit = Math.max(w / vw, h / vh);
    const fx = (w - vw * fit) / 2 + PUSH_AT[0] * vw * fit, fy = (h - vh * fit) / 2 + PUSH_AT[1] * vh * fit;
    g.drawImage(v, fx - PUSH_AT[0] * vw * base, fy - PUSH_AT[1] * vh * base, vw * base, vh * base);
  }

  dispose() {
    this.video?.pause();
    this.video?.removeAttribute('src');
    this.video?.load();
    this.texture.dispose();
    this.scene.children[0].geometry.dispose();
    this.scene.children[0].material.dispose();
    this.ready = false;
    this.video = this.families = this.caption = null;
  }
}

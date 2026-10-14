import * as THREE from 'three';

// The mood of the lighting, shared by every level: how dark and cold the clinical white is on
// an ordinary day, and the red that takes over when the station raises an alarm or ARIA
// snaps. A level reads three numbers each frame and applies them to its own lights:
//
//   dim     multiplies every light's brightness (below 1 = the ship is under strain). It
//           breathes very slowly and now and then stutters, like failing power.
//   red     0..1 how far lights and ambient are pushed to blood red
//   pulse   0..1 a slow throb that rides on the red
//   tint(c) pushes a THREE.Color towards red by `red` (and makes it darker as it goes)
//
// Two screen-edge layers (plain CSS, nearly free to draw) add to it: a dark vignette that
// closes in a little in tense moments, and a red one that throbs with the alarm.

const RED = new THREE.Color(1.0, 0.05, 0.03);
const _target = new THREE.Color();

export class MoodLight {
  // base: how much dimmer than clean the normal lighting is, 1 = unchanged
  constructor({ base = 0.86 } = {}) {
    this.base = base;
    this.tension = 0;          // 0..1: the vignette closes in as this rises (set by the level)
    this.dim = base;
    this.ambient = base * base;   // the fill light drops faster than the lamps: deeper shadows
    this.red = 0;
    this.pulse = 0;
    this._redTarget = 0;
    this._holdUntil = 0;
    this._time = 0;
    this._stutterAt = 6 + Math.random() * 10;
    this._stutter = 0;
    this._buildLayers();
  }

  _buildLayers() {
    const make = (id, css) => {
      const el = document.createElement('div');
      el.id = id;
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;opacity:0;' + css;
      document.body.appendChild(el);
      return el;
    };
    this.vignette = make('mood-vignette',
      'background:radial-gradient(ellipse at center, rgba(0,0,0,0) 52%, rgba(0,3,8,0.8) 100%);');
    this.redLayer = make('mood-red',
      'background:radial-gradient(ellipse at center, rgba(255,20,10,0.05) 38%, rgba(190,0,0,0.62) 100%);');
  }

  // Red lights for `seconds` (ARIA snaps, or a generator alarm), fading in and out
  alert(seconds = 4, strength = 1) {
    this._redTarget = strength;
    this._holdUntil = this._time + seconds;
  }

  // Back to normal at once
  clear() {
    this._redTarget = 0;
    this._holdUntil = 0;
  }

  update(delta) {
    this._time += delta;
    if (this._redTarget > 0 && this._time > this._holdUntil) this._redTarget = 0;
    // red comes in quickly (a snap) and drains out slowly
    const rate = this._redTarget > this.red ? 7 : 1.6;
    this.red += (this._redTarget - this.red) * Math.min(1, delta * rate);
    if (this.red < 0.002) this.red = 0;
    this.pulse = this.red > 0 ? 0.5 + 0.5 * Math.sin(this._time * 6.2) : 0;

    // the occasional stutter of failing power (not while the alarm is on)
    this._stutter = Math.max(0, this._stutter - delta);
    if (this._time > this._stutterAt && this.red === 0) {
      this._stutter = 0.12 + Math.random() * 0.18;
      this._stutterAt = this._time + 9 + Math.random() * 16;
    }
    const breath = 1 + 0.035 * Math.sin(this._time * 0.45);
    const stutter = this._stutter > 0 ? 0.62 + 0.3 * Math.random() : 1;
    // under red the room is darker overall: a red alarm should feel menacing, not bright
    this.dim = this.base * breath * stutter * (1 - 0.45 * this.red * (0.6 + 0.4 * this.pulse));

    this.ambient = this.dim * this.dim * (this.red > 0 ? 1.0 : 1.12);
    const v = this.vignette.style;
    v.opacity = String(Math.min(1, 0.5 + 0.55 * this.tension).toFixed(3));
    const r = this.redLayer.style;
    r.opacity = this.red > 0 ? (this.red * (0.45 + 0.4 * this.pulse)).toFixed(3) : '0';
  }

  // Push a light colour towards red (in place) by the current red amount. The light keeps its
  // brightness (a dim ambient colour becomes a dim red one, not a bright one).
  tint(color) {
    if (this.red > 0) {
      const brightness = color.r * 0.3 + color.g * 0.59 + color.b * 0.11;
      _target.copy(RED).multiplyScalar(brightness * 1.1);
      color.lerp(_target, 0.85 * this.red);
    }
    return color;
  }

  dispose() {
    this.vignette.remove();
    this.redLayer.remove();
  }
}

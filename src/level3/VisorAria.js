import * as THREE from 'three';

// ARIA in the dive suit's visor (Level 3): once Voss is suited, her face sits in the top right
// corner of the glass, the same hologram as on the station's monitors (her face rendered off
// screen, then this small pass draws it in a box after the frame), so he can see her moods: blue,
// warm yellow, red. When she turns hostile the edges of the visor flush red too, leaving the middle
// of the view clear.

const SIZE = 0.15;          // the box's width, as a share of the screen's width
const MIN_PX = 130, MAX_PX = 230;
const TOP_PX = 62, RIGHT_PX = 24;
const PLANE_W = 2.3;        // her picture's width, in widths of the box

export class VisorAria {
  constructor(session) {
    this.s = session;
    this.on = false;
    this.anger = 0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 2);
    this.camera.position.z = 1;
    this.plane = null;
    const root = document.getElementById('ui-layer');
    this.frame = document.createElement('div');
    this.frame.id = 'l3-aria-frame';
    this.frame.innerHTML = '<div class="af-label">ARIA</div>';
    root.appendChild(this.frame);
    this.edge = document.createElement('div');
    this.edge.id = 'l3-anger';
    root.appendChild(this.edge);
  }

  _ensurePlane() {
    const aria = this.s.aria;
    if (this.plane || !aria?.ariaMaterial) return;
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), aria.ariaMaterial);
    this.scene.add(this.plane);
  }

  // on: shown (suited, playing)
  update(dt, on) {
    this.on = on && !!this.s.aria?.useHead;
    this.frame.classList.toggle('on', this.on);
    // her mood colour: red means hostile
    const c = this.s.aria?.ariaMaterial?.uniforms?.colorState?.value;
    const hostile = c && c.r > 0.9 && c.g < 0.2 && c.b < 0.2 ? 1 : 0;
    this.anger += ((this.on ? hostile : 0) - this.anger) * (1 - Math.exp(-(hostile ? 4 : 1.5) * dt));
    this.edge.style.opacity = this.anger.toFixed(3);
    // in the suit the visor's red edges take the place of the full-screen red (the middle stays clear)
    const red = document.getElementById('mood-red');
    if (red) red.style.visibility = this.on ? 'hidden' : '';
    this.frame.classList.toggle('angry', hostile === 1);
  }

  _rect() {
    const w = Math.round(THREE.MathUtils.clamp(window.innerWidth * SIZE, MIN_PX, MAX_PX));
    const h = Math.round(w * 1.15);
    return { x: window.innerWidth - RIGHT_PX - w, y: TOP_PX, w, h };
  }

  // after the frame: her face into its box (the renderer's own viewport, so it costs a small pass)
  render(webgl) {
    if (!this.on) return;
    this._ensurePlane();
    if (!this.plane) return;
    this.s.aria.head.render(webgl);
    const r = this._rect();
    this.frame.style.cssText = `left:${r.x - 6}px;top:${r.y - 6}px;width:${r.w + 12}px;height:${r.h + 12}px`;
    const glY = window.innerHeight - r.y - r.h;
    // (her face is drawn 16:9 and her shader flips it for model UVs, so the plane is 16:9 and
    // flipped; wider than the box, closer in on her face)
    this.plane.scale.set(PLANE_W, -PLANE_W * 9 / 16, 1);
    this.camera.left = -0.5; this.camera.right = 0.5;
    const aspect = r.w / r.h;
    this.camera.top = 0.5 / aspect; this.camera.bottom = -0.5 / aspect;
    this.camera.updateProjectionMatrix();
    const autoClear = webgl.autoClear;
    const toneMapping = webgl.toneMapping;
    webgl.autoClear = false;
    webgl.toneMapping = THREE.NoToneMapping;
    webgl.setRenderTarget(null);
    webgl.setScissorTest(true);
    webgl.setScissor(r.x, glY, r.w, r.h);
    webgl.setViewport(r.x, glY, r.w, r.h);
    webgl.clearDepth();
    webgl.render(this.scene, this.camera);
    webgl.setScissorTest(false);
    webgl.setViewport(0, 0, window.innerWidth, window.innerHeight);
    webgl.autoClear = autoClear;
    webgl.toneMapping = toneMapping;
  }

  dispose() {
    const red = document.getElementById('mood-red');
    if (red) red.style.visibility = '';
    this.frame.remove();
    this.edge.remove();
    this.plane?.geometry.dispose();
  }
}

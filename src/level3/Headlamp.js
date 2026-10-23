import * as THREE from 'three';

// The dive suit's helmet lamp (Level 3). Out in the murk it is nearly the only light: a strong,
// narrow beam from his head that lights what it falls on and shows as a shaft of light in the
// water (a soft cone drawn along it, brightest at its middle and fading with distance), with the
// specks of marine snow catching it (SeaScene's snow).
//
// The lamp itself is the camera's spotlight (core/Camera.js). Level 3 puts the camera in the scene
// so that its light is lit at all, and turns off its shadows (a second render of the whole scene
// every frame: too much for the school computers).

const LAMP = { colour: 0xfff1dc, intensity: 70, distance: 38, angle: Math.PI / 7.5, penumbra: 0.55 };
const BEAM = { length: 16, radius: 3.2, strength: 0.07 };

export class Headlamp {
  constructor(session) {
    this.s = session;
    const g = session.game, cam = g.camera.instance;
    this.cam = cam;
    this.light = g.camera.flashlight;
    this.light.castShadow = false;
    this.light.intensity = 0;
    if (!cam.parent) g.scene.add(cam);
    // the beam: a cone from his head, seen from inside (its far walls), added on top
    const geo = new THREE.ConeGeometry(BEAM.radius, BEAM.length, 24, 1, true);
    geo.translate(0, -BEAM.length / 2, 0);
    geo.rotateX(-Math.PI / 2);                    // (its tip at the eye, opening along -z)
    this.uniforms = { uStrength: { value: 0 }, uColour: { value: new THREE.Color(LAMP.colour) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        varying vec3 vLocal;
        varying float vDepth;
        void main() {
          vLocal = position;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uStrength;
        uniform vec3 uColour;
        varying vec3 vLocal;
        varying float vDepth;
        void main() {
          // the length of beam the eye looks through here (its far wall's distance), fading out
          float along = clamp(-vLocal.z / ${BEAM.length.toFixed(1)}, 0.0, 1.0);
          float glow = (1.0 - exp(-vDepth * 0.22)) * (1.0 - along) * (1.0 - along);
          gl_FragColor = vec4(uColour * glow * uStrength, 1.0);
        }`,
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    });
    this.beam = new THREE.Mesh(geo, mat);
    this.beam.frustumCulled = false;
    this.beam.renderOrder = 6;
    this.beam.visible = false;
    g.scene.add(this.beam);
    this.on = false;
  }

  // on: the suit is on; murk: 0..1, how much of the beam shows (out in the sea, the flooded lock)
  update(dt, on, murk) {
    if (on !== this.on) {
      this.on = on;
      Object.assign(this.light, { intensity: on ? LAMP.intensity : 0, distance: LAMP.distance, angle: LAMP.angle, penumbra: LAMP.penumbra });
      this.light.color.setHex(LAMP.colour);
    }
    const u = this.uniforms.uStrength;
    u.value += ((on ? murk * BEAM.strength : 0) - u.value) * (1 - Math.exp(-3 * dt));
    this.beam.visible = u.value > 0.002;
    if (this.beam.visible) {
      // (from just under the helmet's brim, where the lamp is)
      this.beam.position.copy(this.cam.position);
      this.beam.quaternion.copy(this.cam.quaternion);
      this.beam.translateY(-0.12);
    }
  }

  dispose() {
    this.beam.removeFromParent();
    this.beam.geometry.dispose();
    this.light.intensity = 0;
    this.cam.parent?.remove(this.cam);
  }
}

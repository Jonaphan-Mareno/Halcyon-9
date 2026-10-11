import * as THREE from 'three';

// The sea outside the atrium's big window: a looping video on a curved screen just behind the
// glass. The video is decoded by the graphics chip's video hardware, which is far cheaper than
// drawing the scene. It is paused while the window is off screen.
//
// The screen is a little larger than the opening (it sits behind the glass, so from off-centre
// you would otherwise see past its edges), and sized so the video keeps its own 16:9 shape.

export class VideoWindow {
  // radius: screen distance from the hall's centre; a0/a1: the window's angles (degrees, as in the
  // Blender build: 90 = north); bottom/height: the window opening; eye: viewing height
  constructor({ src, radius, wallRadius, a0, a1, bottom, height, eye = 1.7, overscan = 1.05 }) {
    this.video = document.createElement('video');
    Object.assign(this.video, { src, muted: true, loop: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous' });
    this.video.play().catch(() => {});            // muted videos may autoplay; retried on the first click
    window.addEventListener('pointerdown', () => this.video.play().catch(() => {}), { once: true });

    this.texture = new THREE.VideoTexture(this.video);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    // seen from the middle of the hall, the screen must cover the opening: scale it out by the
    // ratio of the distances, plus a little extra
    const k = (radius / wallRadius) * overscan;
    const mid = (a0 + a1) / 2;
    const half = ((a1 - a0) / 2) * overscan;
    const h = height * k;
    const centre = eye + (bottom + height / 2 - eye) * (radius / wallRadius);
    const geo = new THREE.CylinderGeometry(radius, radius, h, 48, 1, true,
      THREE.MathUtils.degToRad(mid - half + 90), THREE.MathUtils.degToRad(half * 2));
    // seen from inside, the cylinder's texture runs right to left: flip it so the video is not mirrored
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.repeat.x = -1;
    this.texture.offset.x = 1;
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.BackSide, toneMapped: false, fog: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = centre;
    this.mesh.name = 'SeaVideo';

    this._frustum = new THREE.Frustum();
    this._viewProj = new THREE.Matrix4();
    this._check = 0;
  }

  // Pause the video while the window is off screen (checked a few times a second)
  update(dt, camera) {
    this._check -= dt;
    if (this._check > 0) return;
    this._check = 0.25;
    this._viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._viewProj);
    const visible = this._frustum.intersectsObject(this.mesh);
    if (visible && this.video.paused) this.video.play().catch(() => {});
    else if (!visible && !this.video.paused) this.video.pause();
  }

  dispose() {
    this.video.pause();
    this.video.removeAttribute('src');
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

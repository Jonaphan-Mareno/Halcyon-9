import * as THREE from 'three';

// The sea outside the atrium's big window: a looping video on curved screens just behind the
// glass. The video is decoded by the graphics chip's video hardware, which is far cheaper than
// drawing the scene. It is paused while the window is off screen.
//
// The window is a band of bays split by posts. Each bay gets its own screen, a little larger than
// the bay (they sit behind the glass, so from off-centre you would otherwise see past their edges),
// all showing the same video, each a different part of it, so together they read as one sea
// seen past the posts. The joins sit behind the posts, and a slim metal mullion in front of each
// post makes sure no seam shows. Two copies of the video play, half a loop apart, taking turns
// bay by bay, so neighbouring bays never show the same fish at the same moment.

const VIDEO_ASPECT = 16 / 9;

export class VideoWindow {
  // radius: screen distance from the hall's centre; bays: [[a0, a1], ...] the bays' angles (degrees,
  // as in the Blender build: 90 = north); bottom/height: the window opening; eye: viewing height
  constructor({ src, radius, wallRadius, bays, bottom, height, eye = 1.7, overscan = 1.05 }) {
    this.videos = [0, 0.5].map((lag) => {
      const v = document.createElement('video');
      Object.assign(v, { src, muted: true, loop: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous' });
      if (lag) v.addEventListener('loadedmetadata', () => { v.currentTime = v.duration * lag; }, { once: true });
      v.play().catch(() => {});                   // muted videos may autoplay; retried on the first click
      window.addEventListener('pointerdown', () => v.play().catch(() => {}), { once: true });
      return v;
    });
    this.video = this.videos[0];
    this.textures = this.videos.map((v) => {
      const t = new THREE.VideoTexture(v);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    });
    this.materials = this.textures.map((map) =>
      new THREE.MeshBasicMaterial({ map, side: THREE.BackSide, toneMapped: false, fog: false }));

    // seen from the middle of the hall, a screen must cover its bay: scale it out by the ratio of
    // the distances, plus a little extra
    const k = (radius / wallRadius) * overscan;
    const h = height * k;
    const centre = eye + (bottom + height / 2 - eye) * (radius / wallRadius);

    this.mesh = new THREE.Group();
    this.mesh.name = 'SeaVideo';
    this.mesh.position.y = centre;
    bays.forEach(([a0, a1], i) => {
      const mid = (a0 + a1) / 2;
      const half = ((a1 - a0) / 2) * overscan;
      // (neighbours overlap a touch behind their post: one sits a few centimetres further out)
      const r = radius + (i % 2) * 0.05;
      const geo = new THREE.CylinderGeometry(r, r, h, 16, 1, true,
        THREE.MathUtils.degToRad(mid - half + 90), THREE.MathUtils.degToRad(half * 2));
      // which part of the video this bay shows: a slice the bay's own shape, the slices spread
      // left to right across the video. Seen from inside, the cylinder runs right to left, so the
      // slice is flipped to keep the video unmirrored.
      const w = Math.min(1, (r * THREE.MathUtils.degToRad(half * 2)) / h / VIDEO_ASPECT);
      // (each copy's two bays take opposite ends of the video)
      const u0 = (Math.floor(i / 2) % 2 === i % 2 ? 0 : 1) * (1 - w);
      const uv = geo.attributes.uv;
      for (let j = 0; j < uv.count; j++) uv.setX(j, u0 + (1 - uv.getX(j)) * w);
      const screen = new THREE.Mesh(geo, this.materials[i % 2]);
      screen.name = 'SeaVideo_' + i;
      this.mesh.add(screen);
    });

    // a slim brushed-metal mullion in front of each post between bays
    const metal = new THREE.MeshStandardMaterial({ color: 0x5d6770, metalness: 0.85, roughness: 0.35 });
    const postGeo = new THREE.BoxGeometry(0.34, height + 0.1, 0.22);
    for (let i = 1; i < bays.length; i++) {
      const a = THREE.MathUtils.degToRad(bays[i][0]);
      const r = wallRadius + 0.22;
      const post = new THREE.Mesh(postGeo, metal);
      post.position.set(Math.cos(a) * r, bottom + height / 2 - centre, -Math.sin(a) * r);
      post.rotation.y = a - Math.PI / 2;
      post.name = 'SeaWindowMullion';
      this.mesh.add(post);
    }

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
    const visible = this.mesh.children.some((c) => c.name.startsWith('SeaVideo_') && this._frustum.intersectsObject(c));
    for (const v of this.videos) {
      if (visible && v.paused) v.play().catch(() => {});
      else if (!visible && !v.paused) v.pause();
    }
  }

  dispose() {
    for (const v of this.videos) {
      v.pause();
      v.removeAttribute('src');
      v.load();
    }
    for (const t of this.textures) t.dispose();
    for (const m of this.materials) m.dispose();
    for (const c of this.mesh.children) {
      c.geometry.dispose();
      if (!this.materials.includes(c.material)) c.material.dispose();
    }
  }
}

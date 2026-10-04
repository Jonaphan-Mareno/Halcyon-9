import * as THREE from 'three';
import { AriaHead } from './AriaHead.js';

const ARIA_VIDEO_PATH = './assets/textures/aria_components/';
const ARIA_AUDIO_PATH = './assets/audio/aria/';
const ARIA_IDLE_CLIP = 'aria-idle.mp4';

export class AriaManager {

  constructor(scene) {
    this.scene = scene;
    
    // ---------------------------------------------------------
    // Memory Optimization: Shared Video Element & Texture
    // ---------------------------------------------------------
    this.video = document.createElement('video');
    this.video.src = ARIA_VIDEO_PATH + ARIA_IDLE_CLIP; // Default idle video
    this.video.crossOrigin = 'anonymous';
    this.video.loop = true;
    this.video.muted = true;
    this.video.playsInline = true;
    
    // Muted videos are allowed to autoplay in most browsers
    this.video.play().catch(e => {
      console.warn("Video autoplay blocked by browser.", e);
    });
    
    this.videoTexture = new THREE.VideoTexture(this.video);
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;
    
    // ---------------------------------------------------------
    // Shared Custom Shader Material: ARIA Matrix Face
    // ---------------------------------------------------------
    this.ariaMaterial = new THREE.ShaderMaterial({
      uniforms: {
        colorState: { value: new THREE.Color(0x2f7cff) }, // Blue default (mood colour)
        uVideoTexture: { value: this.videoTexture },
        uTime: { value: 0.0 },
        // Dot-matrix resolution; 16:9 so the cells come out square on the screen
        uGrid: { value: new THREE.Vector2(128, 72) }
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;

        float hash11(float n) {
          return fract(sin(n * 12.9898) * 43758.5453);
        }

        void main() {
          // glTF UVs run top-down, video textures bottom-up: flip V
          vUv = vec2(uv.x, 1.0 - uv.y);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

          // Subtle constant wobble in screen-space X
          float wobble = sin(uTime * 2.0 + uv.y * 8.0) * 0.0015;

          // Occasional glitch: 4 checks a second, roughly 1 in 14 fires a short
          // burst that shears the rows sideways (kept small so the face stays readable)
          float burst = step(0.93, hash11(floor(uTime * 4.0)));
          float tear = burst * sin(uv.y * 40.0 + uTime * 60.0) * 0.004;

          mvPosition.x += wobble + tear;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 colorState;
        uniform sampler2D uVideoTexture;
        uniform float uTime;
        uniform vec2 uGrid;
        varying vec2 vUv;

        void main() {
          // Sample the video once per grid cell so the face is built from dots
          vec2 cell = floor(vUv * uGrid);
          vec2 cellCenter = (cell + 0.5) / uGrid;
          vec3 videoColor = texture2D(uVideoTexture, cellCenter).rgb;

          float luminance = dot(videoColor, vec3(0.299, 0.587, 0.114));

          // Dark video background: add no light at all
          if (luminance < 0.05) {
            gl_FragColor = vec4(0.0);
            return;
          }

          // Lift the shadows so the jaw and neck stay readable
          luminance = pow(luminance, 0.7);

          // Dot radius grows with brightness, but even dim areas keep a dot
          vec2 local = fract(vUv * uGrid) - 0.5;
          float radius = mix(0.22, 0.5, luminance);
          float dotMask = smoothstep(radius, radius - 0.12, length(local));

          // CRT scanlines: thin black bars that slide down the screen
          float scanline = 1.0 - 0.55 * step(0.6, fract(vUv.y * 60.0 + uTime * 1.5));
          // One slow, broad dark band rolling down as well
          float roll = 1.0 - 0.3 * smoothstep(0.0, 0.08, fract(vUv.y * 1.5 + uTime * 0.25));

          float intensity = dotMask * luminance * scanline * roll;
          // Bright areas glow toward white-blue so the face reads clearly
          vec3 glow = mix(colorState, vec3(0.85, 0.95, 1.0), smoothstep(0.5, 1.0, luminance));
          gl_FragColor = vec4(glow * intensity * 1.9, 1.0);
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    // ---------------------------------------------------------
    // Shared Idle Material (for inactive monitors)
    // ---------------------------------------------------------
    this.idleMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x001133, // Dim, dark blue
      side: THREE.DoubleSide 
    });

    // Black layer under each screen: the additive ARIA shader adds light on top
    // of whatever is behind the glass, which would otherwise show through grey.
    // polygonOffset pushes it back so the shader always draws in front.
    this.backingMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });

    // 3D animated face. Once its model has loaded, its offscreen render replaces
    // the video as the hologram source. If it fails to load, the video stays.
    this.useHead = false;
    this.head = new AriaHead();
    this.head.load().then(() => {
      this.ariaMaterial.uniforms.uVideoTexture.value = this.head.texture;
      this.useHead = true;
      this.video.pause(); // no need to decode video any more
    }).catch((e) => console.warn('AriaHead failed to load, using video.', e));

    this.monitors = [];
    // When set, ARIA stays on this monitor instead of following the player
    this.pinnedMonitor = null;
    this.active = false;   // ARIA stays dark until the wall panel puzzle is solved
    this._worldPos = new THREE.Vector3(); // reused every frame

    // Current spoken line (video clip + voice audio), if any
    this._endSpeech = null;
  }

  activate() {
    this.active = true;
  }

  // Keep ARIA on this monitor (e.g. the wake-up scene). Accepts the mesh itself
  // or its name: model re-exports keep renaming this object, so callers that
  // resolved the screen themselves should pass the mesh.
  pinMonitor(meshOrName) {
    this.pinnedMonitor = typeof meshOrName === 'string'
      ? this.monitors.find((m) => m.name === meshOrName) || null
      : this.monitors.find((m) => m === meshOrName) || null;
    if (!this.pinnedMonitor) {
      console.warn(`AriaManager: no monitor named "${meshOrName}" to pin.`);
    }
  }

  // Go back to ARIA jumping to the screen closest to the player
  unpinMonitor() {
    this.pinnedMonitor = null;
  }

  // ---------------------------------------------------------
  // Proximity-based "Following" Mechanic
  // ---------------------------------------------------------
  
  // Traverse the loaded GLB model and collect all screen meshes.
  //
  // `screen` is the wall screen the caller resolved by geometry rather than by
  // name (see Level1._resolveWallScreen). Re-exports keep renaming that object,
  // and the name it loses can land on the bezel around it, so a name scan alone
  // can pick the wrong mesh. `ignore` lists meshes the scan must skip for the
  // same reason — those bezels are part of the room, not screens.
  collectMonitors(glbScene, { screen = null, ignore = [] } = {}) {
    const add = (mesh) => {
      if (!mesh || !mesh.isMesh || this.monitors.includes(mesh)) return;
      this.monitors.push(mesh);
      mesh.material = this.idleMaterial; // Start all screens as idle

      const backing = new THREE.Mesh(mesh.geometry, this.backingMaterial);
      backing.raycast = () => {}; // clicks and collisions still hit the monitor itself
      mesh.add(backing);
    };

    // The resolved wall screen first, so it is the fallback when nothing is
    // pinned and no player position has been supplied yet
    add(screen);

    glbScene.traverse((child) => {
      // Look for any mesh whose name contains 'Monitor' (case-insensitive)
      if (!child.isMesh || !child.name.toLowerCase().includes('monitor')) return;
      if (ignore.includes(child)) return;
      add(child);
    });

    console.log(`AriaManager: Found ${this.monitors.length} monitors in the room.`);
  }

  // Back to the silent looping idle face
  playIdle() {
    if (this.useHead) {
      this.head.setExpression('neutral');
      return;
    }
    this.video.loop = true;
    this.video.src = ARIA_VIDEO_PATH + ARIA_IDLE_CLIP;
    this.video.play().catch(() => {});
  }

  // Is one of her lines playing right now?
  get speaking() {
    return this._endSpeech !== null;
  }

  // Cut her current line short (the player pressed skip). The line's promise
  // resolves as if it had finished, so the conversation carries straight on.
  skip() {
    if (this._endSpeech) this._endSpeech();
  }

  // Play one of ARIA's lines: the face clip on the monitors and her voice
  // audio together. Resolves when the voice finishes, then goes back to idle.
  // If a clip has no video or audio yet (or fails to load) the line still
  // completes: no video keeps the idle loop, no audio waits fallbackSeconds
  // so the subtitle stays up long enough to read.
  speak(clipName, fallbackSeconds = 4, expression = 'neutral') {
    if (this._endSpeech) this._endSpeech(); // never overlap two lines

    return new Promise((resolve) => {
      let finished = false;
      let timer = null;
      const audio = new Audio(ARIA_AUDIO_PATH + clipName + '.mp3');

      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        audio.pause();
        this.video.onerror = null;
        this._endSpeech = null;
        if (this.useHead) this.head.stopSpeaking();
        this.playIdle();
        resolve();
      };
      this._endSpeech = finish;

      const startFallbackTimer = () => {
        if (!timer && !finished) timer = setTimeout(finish, fallbackSeconds * 1000);
      };
      // No usable audio: time the subtitle, and let the face talk on its own
      // (a failed file would otherwise leave the lip sync reading silence)
      const useProcedural = () => {
        if (this.useHead) this.head.detachAnalyser();
        startFallbackTimer();
      };
      audio.addEventListener('ended', finish);
      audio.addEventListener('error', useProcedural);

      // 3D face: expression for this line, mouth follows the voice audio
      if (this.useHead) {
        this.head.setExpression(expression);
        this.head.attachAudio(audio);
        this.head.startSpeaking();
        audio.play().catch(useProcedural);
        return;
      }

      // Video fallback. Face clip: if it is missing, stay on the idle loop
      this.video.loop = false;
      this.video.onerror = () => {
        this.video.onerror = null;
        this.playIdle();
      };
      this.video.src = ARIA_VIDEO_PATH + clipName + '.mp4';

      // Start face and voice together once the video can play (or has failed)
      const start = () => {
        if (finished) return;
        this.video.play().catch(() => {});
        audio.play().catch(startFallbackTimer);
      };
      const ready = () => {
        this.video.removeEventListener('canplay', ready);
        this.video.removeEventListener('error', ready);
        start();
      };
      this.video.addEventListener('canplay', ready);
      this.video.addEventListener('error', ready);
      setTimeout(ready, 1500); // do not hang if neither event fires
    });
  }

  // Swap out the video being played across all monitors
  playVideo(videoFileName) {
    this.video.src = ARIA_VIDEO_PATH + videoFileName;
    this.video.play().catch(e => {
      console.warn("Video autoplay blocked by browser.", e);
    });
  }

  // Mood State Logic
  updateAriaState(mood) {
    switch (mood) {
      case 'neutral':
        this.ariaMaterial.uniforms.colorState.value.setHex(0x2f7cff); // Blue
        break;
      case 'warm':
        this.ariaMaterial.uniforms.colorState.value.setHex(0xffff00); // Yellow
        break;
      case 'hostile':
        this.ariaMaterial.uniforms.colorState.value.setHex(0xff0000); // Red
        break;
    }
  }

  // Update time for shader animations and calculate proximity jumping
  update(delta, playerPosition) {
    if (this.ariaMaterial) {
      this.ariaMaterial.uniforms.uTime.value += delta;
    }
    if (this.useHead) this.head.update(delta);
    if (!this.active) {
      for (const monitor of this.monitors) {
        if (monitor.material !== this.idleMaterial) monitor.material = this.idleMaterial;
      }
      return;
    }

    // Proximity logic: ARIA jumps to the screen closest to the player
    if (this.monitors.length > 0 && playerPosition) {
      let closestMonitor = this.pinnedMonitor;
      let minDistance = Infinity;

      // 1. Find the closest monitor (skipped while one is pinned)
      for (const monitor of this.pinnedMonitor ? [] : this.monitors) {
        // We must extract the world position, as monitors might be nested in parents
        monitor.getWorldPosition(this._worldPos);

        const dist = this._worldPos.distanceTo(playerPosition);
        if (dist < minDistance) {
          minDistance = dist;
          closestMonitor = monitor;
        }
      }

      // 2. Apply ARIA to the closest monitor, reset all others to idle
      for (const monitor of this.monitors) {
        if (monitor === closestMonitor) {
          if (monitor.material !== this.ariaMaterial) {
            monitor.material = this.ariaMaterial;
          }
        } else {
          if (monitor.material !== this.idleMaterial) {
            monitor.material = this.idleMaterial;
          }
        }
      }
    }
  }

  // Draw the 3D face into its offscreen texture (call before the main render)
  renderHead(renderer) {
    if (this.useHead) this.head.render(renderer);
  }

  // Free GPU/video resources when the level is torn down
  dispose() {
    if (this._endSpeech) this._endSpeech();
    this.head.dispose();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.videoTexture.dispose();
    this.ariaMaterial.dispose();
    this.idleMaterial.dispose();
    this.backingMaterial.dispose();
    this.monitors = [];
    this.pinnedMonitor = null;
  }
}

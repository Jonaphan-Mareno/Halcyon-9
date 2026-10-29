import * as THREE from 'three';
import { loopClip, playClip, CLIPS } from '../audio/AudioCache.js';
import { frame } from '../ui/hudFrame.js';

// ============================================================================
// GAMEPLAY & HARDWARE CONSTANTS
// ============================================================================
export const RING_COUNT = 4;
export const TARGET_TOLERANCE = 0.15;      // Radians of forgiveness (~8.6 degrees on each side): the box's width
export const SPEED_RAMP = 1.07;            // +7% angular speed increase after each successful lock
export const MAX_LIVES = 3;                // Breaker surge capacitor charges before lockout
export const ROUND_TIME = 20.0;            // Seconds for the breaker trip window
export const FIRST_ROUND_TIME = 60.0;      // the first time: three times as long, to read how to play
export const BASE_SPEEDS = [1.35, 1.80, 2.25, 2.70]; // Radians/sec per coupling (alternating directions)

const COUPLING_METADATA = [
  { id: 1, name: 'COUPLING 01 // BASE AZIMUTH', desc: 'Rotor base yaw servo' },
  { id: 2, name: 'COUPLING 02 // SHOULDER PIVOT', desc: 'Main arm elevation joint' },
  { id: 3, name: 'COUPLING 03 // ELBOW ACTUATOR', desc: 'Forearm extension link' },
  { id: 4, name: 'COUPLING 04 // WRIST COUPLER', desc: 'End-effector power bus' },
];

const STYLE_ELEMENT_ID = 'fusebox-puzzle-injected-styles';
const HUM_GAIN = 0.22;       // the breaker's hum under the puzzle: quiet
const HUM_RATE = 0.85;       // and its speed, which climbs a little with each lock

// The game's HUD look over the panel's own styles: Orbitron labels, Bahnschrift text, soft steel
// cyan lines (--frame), dark navy fills, amber for the hazard, the frames drawn by hudFrame.js
const THEME_CSS = `
  .fb-puzzle-overlay { font-family: var(--hud-body); color: var(--hud-text);
    background: radial-gradient(circle at center, rgba(8, 18, 28, 0.9) 0%, rgba(3, 8, 13, 0.97) 100%); }
  .fb-header { background: none; }
  .fb-station-tag { font-family: var(--hud-label); font-size: 10px; letter-spacing: 0.3rem; color: var(--frame); opacity: 0.7; }
  .fb-panel-title { font-family: var(--hud-label); font-weight: 700; letter-spacing: 0.35rem; color: #f4f8ff;
    text-shadow: 0 0 10px rgba(143, 216, 228, 0.35); }
  .fb-hazard-banner { font-family: var(--hud-label); font-size: 11px; letter-spacing: 0.15rem; color: #ffd23f;
    background: repeating-linear-gradient(-45deg, rgba(255, 210, 63, 0.14) 0 10px, rgba(0, 0, 0, 0.35) 10px 20px);
    border: 1px solid rgba(255, 210, 63, 0.55); border-radius: 0; }
  .fb-hazard-icon { color: #ffd23f; }
  .fb-telemetry-bar { border-radius: 0; }
  .fb-telemetry-label { font-family: var(--hud-label); font-size: 9px; letter-spacing: 0.25rem; color: var(--frame); opacity: 0.75; }
  .fb-active-name { font-family: var(--hud-label); font-weight: 700; letter-spacing: 0.18rem; color: #f4f8ff;
    text-shadow: 0 0 8px rgba(143, 216, 228, 0.6); }
  .fb-active-sub { font-family: var(--hud-body); letter-spacing: 0.06rem; color: rgba(232, 236, 239, 0.7); }
  .fb-timer-display { font-family: var(--hud-label); font-weight: 700; color: #f4f8ff; letter-spacing: 0.1rem; }
  .fb-timer-display.urgent { color: #ff5a4d; }
  .fb-lives-display { gap: 8px; }
  .fb-life-cell { display: inline-block; width: 16px; height: 16px; border-radius: 50%; font-size: 0;
    border: 2px solid var(--frame); }
  .fb-life-cell.active { background: #6fdcf0; box-shadow: 0 0 8px rgba(111, 220, 240, 0.8); }
  .fb-life-cell.spent { background: transparent; border-color: #3a4a50; box-shadow: none; }
  .fb-hint-strip { font-family: var(--hud-body); font-size: 14px; letter-spacing: 0.05rem; color: var(--hud-text);
    text-transform: none; border-radius: 0; }
  .fb-hint-key { font-family: var(--hud-label); font-weight: 700; color: #ffd23f; padding: 0 2px; }
  .fb-footer { background: none; }
  .fb-status-line { font-family: var(--hud-body); font-size: 15px; letter-spacing: 0.04rem; text-transform: none; color: var(--hud-text); }
  .fb-status-line.success { color: #3dff7a; }
  .fb-status-line.danger { color: #ff5a4d; }
  .fb-btn { font-family: var(--hud-label); letter-spacing: 0.2rem; border-radius: 0; }
  .fb-btn-ghost { background: rgba(6, 14, 22, 0.84); border: 1px solid var(--frame); color: var(--frame); }
  .fb-btn-ghost:hover { background: rgba(143, 216, 228, 0.16); color: #fff; border-color: var(--frame); }
  .fb-btn-primary { background: rgba(143, 216, 228, 0.16); border: 1px solid var(--frame); color: #fff; }
  .fb-btn-primary:hover { background: rgba(143, 216, 228, 0.32); }
  .fb-modal { border-radius: 0; }
  .fb-modal-badge { font-family: var(--hud-label); letter-spacing: 0.25rem; border-radius: 0; }
  .fb-modal-heading { font-family: var(--hud-label); letter-spacing: 0.2rem; }
  .fb-modal-copy { font-family: var(--hud-body); font-size: 15px; color: var(--hud-text); }
  .fb-modal-fail { --frame: #ff7a5a; }

  /* everything to read sits in one panel down the left, clear of the rings */
  .fb-telemetry-bar { position: absolute; left: 28px; top: 50%; transform: translateY(-50%); width: 300px; max-width: none;
    flex-direction: column; align-items: stretch; justify-content: flex-start; gap: 16px; padding: 18px 20px;
    background: none; border: none; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
  .fb-center-block { align-items: flex-start; text-align: left; order: -1; }
  .fb-active-name { font-size: 15px; }
  .fb-timer-display { font-size: 26px; }
  .fb-howto ol { margin: 6px 0 0; padding-left: 20px; font-size: 15px; line-height: 1.45; color: var(--hud-text); }
  .fb-howto li { margin: 4px 0; }
  .fb-howto b { color: #f4f8ff; }
  .fb-howto .fb-amber { color: #ffb84d; }
  .fb-telemetry-bar .fb-status-line { min-height: 2.6em; font-size: 15px; padding-top: 10px; border-top: 1px solid rgba(143, 216, 228, 0.25); }
  .fb-header { padding-bottom: 0; }
`;

/**
 * FuseboxPuzzle
 *
 * Simulates the auxiliary arm power breaker panel in Dr. Kessler's bedroom
 * on Halcyon-9. Disengaging all four rotary magnetic couplings cuts power
 * to the hazardous robotic arm, making the room safe and unblocking logs.
 */
export class FuseboxPuzzle {
  /**
   * @param {HTMLElement} parent - DOM container to attach overlay to
   * @param {object} options
   * @param {Function} [options.onSolved] - Called when all 4 rings are locked
   * @param {Function} [options.onFailed] - Called on timeout or lives exhausted
   * @param {Function} [options.onClose]  - Called when puzzle closes
   */
  constructor(parent, { onSolved, onFailed, onClose, onMiss } = {}) {
    if (!parent) {
      throw new Error('[FuseboxPuzzle] Parent HTMLElement is required');
    }

    this.parent = parent;
    this.onSolved = onSolved;
    this.onFailed = onFailed;
    this.onClose = onClose;
    this.onMiss = onMiss;      // a miss: the surge stings him (the level takes a little health)
    this._played = false;      // has a round been played yet

    // State flags
    this.isOpen = false;
    this.isSolved = false;
    this.isGameOver = false;
    this.showingEndMessage = false;

    // Gameplay values
    this.lives = MAX_LIVES;
    this.timeLeft = ROUND_TIME;
    this.speedMultiplier = 1.0;
    this.activeRingIndex = 0;
    this.lockedCount = 0;
    this.elapsedTime = 0;
    this.shakeTime = 0;

    // 3D Scene handles
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.rootGroup = null;
    this.rings = [];
    this.breakerSwitchMesh = null;
    this.breakerLedMaterial = null;

    // Audio context (Web Audio API synthesizers)
    this._audioCtx = null;

    // DOM handles
    this._injectStyles();
    this._buildDOM();
    this._initThreeScene();
    this._bindEvents();

    this._reset();
  }

  // ==========================================================================
  // PUBLIC LIFECYCLE API
  // ==========================================================================

  /**
   * Open the fusebox overlay and begin a fresh round
   */
  open() {
    this.isOpen = true;
    this.container.classList.add('visible');
    // the breaker's hum under the puzzle: it strains harder (faster, louder) with each coupling
    // locked, surges on a miss, and winds down when the power is cut
    this._hum?.stop(0.1);
    this._hum = loopClip(CLIPS.hum, HUM_GAIN);
    this._hum.setRate(HUM_RATE, 0.01);
    this.container.setAttribute('aria-hidden', 'false');

    // Every open() starts a completely fresh round: full lives, 20s timer, starting speed,
    // newly randomized ring order and target angles, with nothing left over.
    this._reset();
    // (the first go is three times as long: time to read how to play, on the left)
    if (!this._played) this.timeLeft = FIRST_ROUND_TIME;
    this._played = true;

    this._onResize();
    this._updateHUD();
    this._initAudio();
  }

  /**
   * Close the fusebox overlay
   */
  close() {
    if (!this.isOpen) return;

    this.isOpen = false;
    this._hum?.stop(0.4);
    this._hum = null;
    this.container.classList.remove('visible');
    this.container.setAttribute('aria-hidden', 'true');

    if (this.domEndModal) {
      this.domEndModal.classList.remove('visible');
      this.domEndModal.setAttribute('hidden', '');
    }
    this.showingEndMessage = false;

    if (typeof this.onClose === 'function') {
      try {
        this.onClose();
      } catch (err) {
        console.error('[FuseboxPuzzle] Error in onClose callback:', err);
      }
    }
  }

  /**
   * Internal round reset (accessible via open())
   */
  _reset() {
    this.isSolved = false;
    this.isGameOver = false;
    this.showingEndMessage = false;
    this.lives = MAX_LIVES;
    this.timeLeft = ROUND_TIME;
    this.speedMultiplier = 1.0;
    this.lockedCount = 0;
    this.elapsedTime = 0;
    this.shakeTime = 0;

    // Hide any end message panel
    if (this.domEndModal) {
      this.domEndModal.classList.remove('visible');
      this.domEndModal.setAttribute('hidden', '');
    }

    // Reset breaker switch visual
    if (this.breakerSwitchMesh) {
      this.breakerSwitchMesh.rotation.z = 0;
    }
    if (this.breakerLedMaterial) {
      this.breakerLedMaterial.color.setHex(0xffaa22);
      this.breakerLedMaterial.emissive.setHex(0xff6600);
      this.breakerLedMaterial.emissiveIntensity = 1.2;
    }

    // Generate distinct target angles around the circle
    // Space base quadrants out to guarantee clear separation
    const baseQuadrants = [
      Math.PI * 0.25, // ~45 deg
      Math.PI * 0.75, // ~135 deg
      Math.PI * 1.25, // ~225 deg
      Math.PI * 1.75  // ~315 deg
    ];
    const shuffledQuadrants = [...baseQuadrants].sort(() => Math.random() - 0.5);

    for (let i = 0; i < RING_COUNT; i++) {
      const ring = this.rings[i];
      if (!ring) continue;

      ring.locked = false;
      const jitter = (Math.random() - 0.5) * 0.75;
      ring.targetAngle = ((shuffledQuadrants[i] + jitter) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);

      // Start at a random initial angle away from the target
      ring.angle = (ring.targetAngle + Math.PI * (0.5 + Math.random() * 1.0)) % (Math.PI * 2);
      ring.rotorGroup.rotation.z = ring.angle;

      // Update target bracket position in 3D
      this._positionTargetAssembly(ring);
    }

    // Select random active ring from the 4 rings
    this.activeRingIndex = Math.floor(Math.random() * RING_COUNT);

    this._updateVisualState();
    this._updateHUD();
    this._setStatusText('Ready. Watch the glowing ring.', 'info');
  }

  /**
   * Reset method for backward-compatibility; delegates to internal _reset()
   */
  reset() {
    this._reset();
  }

  /**
   * Per-frame update driven by game loop with delta time in seconds
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    if (!this.isOpen) return;

    const clampedDt = Math.min(Math.max(dt || 0, 0), 0.1);

    // Active gameplay updates only when round is actively in progress
    // (Freeze timer, stop ring rotation, and ignore inputs when end message is showing)
    if (!this.isGameOver && !this.isSolved && !this.showingEndMessage) {
      this.elapsedTime += clampedDt;

      this.timeLeft -= clampedDt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this._onFail('timeout');
      }

      // Rotate unlocked rings
      for (let i = 0; i < RING_COUNT; i++) {
        const ring = this.rings[i];
        if (!ring) continue;

        if (!ring.locked) {
          ring.angle += ring.speed * this.speedMultiplier * ring.dir * clampedDt;
          ring.rotorGroup.rotation.z = ring.angle;
        } else {
          ring.rotorGroup.rotation.z = ring.targetAngle;
        }
      }
    }

    // Dynamic 3D lighting, pulse & highlight animations
    this._updateAnimations(clampedDt);

    // Screen shake
    if (this.shakeTime > 0) {
      this.shakeTime -= clampedDt;
      const shakeMag = Math.max(0, this.shakeTime) * 0.12;
      this.rootGroup.position.x = (Math.random() - 0.5) * shakeMag;
      this.rootGroup.position.y = (Math.random() - 0.5) * shakeMag;
    } else {
      this.rootGroup.position.set(0, 0, 0);
    }

    // Render WebGL
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }

    // Update HUD time readout
    this._updateTimerDisplay();
  }

  /**
   * Free all WebGL, audio, and DOM resources
   */
  dispose() {
    this.close();

    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('resize', this._onResize);

    if (this.container && this._onContainerPointerDown) {
      this.container.removeEventListener('pointerdown', this._onContainerPointerDown);
    }

    // Free Three.js scene
    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj.geometry) {
          obj.geometry.dispose();
        }
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat) => mat.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    }

    // Free renderer
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
      this.renderer = null;
    }

    // Close Web Audio
    if (this._audioCtx && this._audioCtx.state !== 'closed') {
      this._audioCtx.close().catch(() => {});
      this._audioCtx = null;
    }

    // Remove DOM container
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    // Clean up injected CSS if no other instances exist
    const styleEl = document.getElementById(STYLE_ELEMENT_ID);
    if (styleEl && !document.querySelector('.fb-puzzle-overlay')) {
      styleEl.parentNode?.removeChild(styleEl);
    }
  }

  // ==========================================================================
  // INPUT HANDLING & GAME LOGIC
  // ==========================================================================

  /**
   * Attempt to lock the currently active ring
   */
  handleInput() {
    if (!this.isOpen || this.isGameOver || this.isSolved || this.showingEndMessage) return;

    this._initAudio();

    const activeRing = this.rings[this.activeRingIndex];
    if (!activeRing || activeRing.locked) return;

    // Normalize angles to [0, 2*PI)
    const twoPi = Math.PI * 2;
    const normAngle = ((activeRing.angle % twoPi) + twoPi) % twoPi;
    const normTarget = ((activeRing.targetAngle % twoPi) + twoPi) % twoPi;

    // Shortest angular difference
    let diff = Math.abs(normAngle - normTarget);
    if (diff > Math.PI) diff = twoPi - diff;

    if (diff <= TARGET_TOLERANCE) {
      // SUCCESSFUL LOCK
      activeRing.locked = true;
      activeRing.angle = activeRing.targetAngle;
      activeRing.rotorGroup.rotation.z = activeRing.targetAngle;
      this.lockedCount++;

      // Speed ramp: +7% speed for remaining spinning rings
      this.speedMultiplier *= SPEED_RAMP;

      this._playSfx('lock');
      this._triggerFlash('cyan');
      playClip(CLIPS.tech, 0.4);
      this._hum?.setRate(HUM_RATE + this.lockedCount * 0.08);
      this._hum?.setGain(HUM_GAIN + this.lockedCount * 0.05);

      const meta = COUPLING_METADATA[this.activeRingIndex];
      const remainingCount = RING_COUNT - this.lockedCount;

      if (this.lockedCount >= RING_COUNT) {
        this._onWin();
      } else {
        this._setStatusText(
          `Locked. ${remainingCount} to go, and the rest spin faster.`,
          'success'
        );

        // Pick next active ring at random from remaining unlocked rings
        const available = this.rings
          .map((r, idx) => (!r.locked ? idx : null))
          .filter((idx) => idx !== null);

        this.activeRingIndex = available[Math.floor(Math.random() * available.length)];
        this._updateVisualState();
        this._updateHUD();
      }
    } else {
      // MISS: Lose a life
      this.lives--;
      this.shakeTime = 0.35;
      this._playSfx('miss');
      playClip(CLIPS.metalHit, 0.3);
      // (a surge: the hum leaps and settles back)
      if (this._hum) {
        const r = HUM_RATE + this.lockedCount * 0.08, g = HUM_GAIN + this.lockedCount * 0.05;
        this._hum.setRate(r + 0.15, 0.05);
        this._hum.setGain(g + 0.12);
        setTimeout(() => { this._hum?.setRate(r, 0.25); this._hum?.setGain(g); }, 260);
      }
      this.onMiss?.();
      this._triggerFlash('red');

      this._setStatusText(
        'Missed: the pin was outside the box.',
        'danger'
      );
      this._updateHUD();

      if (this.lives <= 0) {
        this.lives = 0;
        this._onFail('lives');
      }
    }
  }

  _onWin() {
    this.isSolved = true;
    this.showingEndMessage = true;
    this._playSfx('win');
    // the power cut: the hum winds down to nothing
    this._hum?.setRate(0.25, 0.6);
    this._hum?.stop(2.2);
    this._hum = null;
    this._updateVisualState();
    this._updateHUD();

    this._setStatusText(
      'Breaker tripped. The arm is dead.',
      'success'
    );

    // Turn center LED to safe emerald green
    if (this.breakerLedMaterial) {
      this.breakerLedMaterial.color.setHex(0x33ff66);
      this.breakerLedMaterial.emissive.setHex(0x00cc44);
      this.breakerLedMaterial.emissiveIntensity = 1.5;
    }

    // Call onSolved() when the last ring locks, BEFORE the message appears!
    if (typeof this.onSolved === 'function') {
      try {
        this.onSolved();
      } catch (err) {
        console.error('[FuseboxPuzzle] Error in onSolved callback:', err);
      }
    }

    // Show in-world success message panel
    this._showEndMessage('success');
  }

  _onFail(reason) {
    this.isGameOver = true;
    this.showingEndMessage = true;
    this._playSfx('fail');
    // still live: the hum runs on, loud and fast
    this._hum?.setRate(HUM_RATE + 0.4, 0.2);
    this._hum?.setGain(HUM_GAIN + 0.15);
    this._updateHUD();

    if (this.breakerLedMaterial) {
      this.breakerLedMaterial.color.setHex(0xff3333);
      this.breakerLedMaterial.emissive.setHex(0xcc0000);
      this.breakerLedMaterial.emissiveIntensity = 2.0;
    }

    if (reason === 'timeout') {
      this._setStatusText('Out of time. The arm is still live.', 'danger');
    } else {
      this._setStatusText('Too many misses. The arm is still live.', 'danger');
    }

    // Call onFailed() when time runs out or lives hit zero!
    if (typeof this.onFailed === 'function') {
      try {
        this.onFailed(reason);
      } catch (err) {
        console.error('[FuseboxPuzzle] Error in onFailed callback:', err);
      }
    }

    // Show in-world timeout or out-of-lives message panel
    this._showEndMessage(reason === 'timeout' ? 'timeout' : 'lives');
  }

  _showEndMessage(type) {
    if (!this.domEndModal) return;

    const badgeEl = this.domEndModal.querySelector('.fb-modal-badge');
    const headingEl = this.domEndModal.querySelector('.fb-modal-heading');
    const copyEl = this.domEndModal.querySelector('.fb-modal-copy');
    const closeBtn = this.domEndModal.querySelector('#fb-end-close');

    if (type === 'success') {
      this.domEndModal.className = 'fb-modal fb-modal-win visible';
      if (badgeEl) {
        badgeEl.className = 'fb-modal-badge';
        badgeEl.textContent = 'BREAKER TRIPPED';
      }
      if (headingEl) {
        headingEl.textContent = 'ARM POWER CUT';
      }
      if (copyEl) {
        copyEl.textContent =
          "Dr. Kessler's robotic arm has powered down. The room is safe, and her logs can be read now.";
      }
    } else if (type === 'timeout') {
      this.domEndModal.className = 'fb-modal fb-modal-fail visible';
      if (badgeEl) {
        badgeEl.className = 'fb-modal-badge danger';
        badgeEl.textContent = 'OUT OF TIME';
      }
      if (headingEl) {
        headingEl.textContent = 'THE ARM IS STILL LIVE';
      }
      if (copyEl) {
        copyEl.textContent =
          "The timer ran out before all four rings were locked. Use the fusebox again to have another go.";
      }
    } else {
      // Out of lives
      this.domEndModal.className = 'fb-modal fb-modal-fail visible';
      if (badgeEl) {
        badgeEl.className = 'fb-modal-badge danger';
        badgeEl.textContent = 'TOO MANY MISSES';
      }
      if (headingEl) {
        headingEl.textContent = 'THE ARM IS STILL LIVE';
      }
      if (copyEl) {
        copyEl.textContent =
          "Three misses and the breaker locked itself out. Use the fusebox again to have another go.";
      }
    }

    this.domEndModal.removeAttribute('hidden');
    closeBtn?.focus();
  }

  // ==========================================================================
  // THREE.JS SCENE SETUP
  // ==========================================================================

  _initThreeScene() {
    this.scene = new THREE.Scene();

    // Fixed face-on perspective camera
    // Camera is strictly aligned on Z axis looking at (0, 0, 0)
    // Circles in the XY plane remain geometrically circular without elliptical distortion
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    this.camera.position.set(0, 0, 7.0);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.canvasContainer.appendChild(this.renderer.domElement);

    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'FuseboxRoot';
    this.scene.add(this.rootGroup);

    this._buildLighting();
    this._buildBackplate();
    this._buildRings();
    this._buildCenterBreaker();
  }

  _buildLighting() {
    const ambient = new THREE.AmbientLight(0x28323e, 1.4);
    this.scene.add(ambient);

    // Main angled key light to accentuate metallic Torus bevels
    const dirLight = new THREE.DirectionalLight(0xdff2ff, 2.2);
    dirLight.position.set(3.5, 4.5, 6.0);
    this.scene.add(dirLight);

    // Deep cyan fill light
    const fillLight = new THREE.DirectionalLight(0x1a4066, 1.2);
    fillLight.position.set(-4.0, -3.0, 4.0);
    this.scene.add(fillLight);

    // Center auxiliary glow light
    this.centerGlowLight = new THREE.PointLight(0x00e5ff, 1.8, 6.0);
    this.centerGlowLight.position.set(0, 0, 0.6);
    this.scene.add(this.centerGlowLight);
  }

  _buildBackplate() {
    // Heavy industrial steel backplate with beveled corners and mounting bolts
    const panelGeo = new THREE.BoxGeometry(6.6, 6.6, 0.22);
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x1f252d,
      roughness: 0.65,
      metalness: 0.6
    });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.z = -0.15;
    this.rootGroup.add(panel);

    // Outer framing trim
    const frameGeo = new THREE.BoxGeometry(6.8, 6.8, 0.08);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x14181f,
      roughness: 0.8,
      metalness: 0.4
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.z = -0.25;
    this.rootGroup.add(frame);

    // Corner industrial mounting bolts
    const rivetGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.05, 12);
    const rivetMat = new THREE.MeshStandardMaterial({
      color: 0x12151a,
      roughness: 0.5,
      metalness: 0.8
    });

    const inset = 3.05;
    const corners = [
      [-inset, -inset],
      [-inset, inset],
      [inset, -inset],
      [inset, inset]
    ];
    for (const [cx, cy] of corners) {
      const bolt = new THREE.Mesh(rivetGeo, rivetMat);
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(cx, cy, 0.0);
      this.rootGroup.add(bolt);
    }

    // Radial circuit traces engraved on the steel plate
    const traceMat = new THREE.MeshStandardMaterial({
      color: 0x1a2e3d,
      emissive: 0x0f202c,
      emissiveIntensity: 0.5,
      roughness: 0.5,
      metalness: 0.7
    });
    const traceGeo = new THREE.BoxGeometry(0.04, 5.2, 0.02);
    for (let a = 0; a < 4; a++) {
      const trace = new THREE.Mesh(traceGeo, traceMat);
      trace.rotation.z = (a * Math.PI) / 4;
      trace.position.z = -0.035;
      this.rootGroup.add(trace);
    }
  }

  _buildRings() {
    // 4 Concentric Couplings from Outer (radius 2.45) to Inner (radius 0.80)
    const radii = [2.45, 1.90, 1.35, 0.80];

    for (let i = 0; i < RING_COUNT; i++) {
      const radius = radii[i];
      const dir = i % 2 === 0 ? 1 : -1; // Alternating spin directions
      const speed = BASE_SPEEDS[i] || 1.8;

      // 1. Static Housing Bezel (Torus recessed behind the rotor)
      const bezelMat = new THREE.MeshStandardMaterial({
        color: 0x2e3742,
        roughness: 0.65,
        metalness: 0.55
      });
      const bezelGeo = new THREE.TorusGeometry(radius, 0.045, 16, 64);
      const bezelMesh = new THREE.Mesh(bezelGeo, bezelMat);
      bezelMesh.position.z = -0.02;
      this.rootGroup.add(bezelMesh);

      // Dial Tick Marks on Bezel
      const tickMat = new THREE.MeshStandardMaterial({
        color: 0x36414d,
        roughness: 0.6,
        metalness: 0.5
      });
      const tickGeo = new THREE.BoxGeometry(0.02, 0.07, 0.02);
      const tickCount = 16;
      for (let t = 0; t < tickCount; t++) {
        const tickAngle = (t / tickCount) * Math.PI * 2;
        const tickMesh = new THREE.Mesh(tickGeo, tickMat);
        tickMesh.position.set(
          (radius + 0.065) * Math.cos(tickAngle),
          (radius + 0.065) * Math.sin(tickAngle),
          0.01
        );
        tickMesh.rotation.z = tickAngle;
        this.rootGroup.add(tickMesh);
      }

      // 2. Target Receiver Assembly at targetAngle
      const targetGroup = new THREE.Group();
      this.rootGroup.add(targetGroup);

      // The target box: the pin must be inside it to lock (it spans exactly +/- TARGET_TOLERANCE
      // along the ring). Four glowing edges and a faint fill. Local x runs out from the centre,
      // local y along the ring.
      const caliperMat = new THREE.MeshStandardMaterial({
        color: 0x3a4856,
        emissive: 0x000000,
        roughness: 0.5,
        metalness: 0.6
      });
      const arc = radius * TARGET_TOLERANCE;
      const BOX_DEPTH = 0.27;
      const sideGeo = new THREE.BoxGeometry(BOX_DEPTH + 0.035, 0.035, 0.05);
      const endGeo = new THREE.BoxGeometry(0.035, arc * 2, 0.05);
      const caliperLeft = new THREE.Mesh(sideGeo, caliperMat);
      const caliperRight = new THREE.Mesh(sideGeo, caliperMat);
      const boxIn = new THREE.Mesh(endGeo, caliperMat);
      const boxOut = new THREE.Mesh(endGeo, caliperMat);
      boxIn.position.set(-BOX_DEPTH / 2, 0, 0.03);
      boxOut.position.set(BOX_DEPTH / 2, 0, 0.03);
      const boxFillMat = new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0, depthWrite: false });
      const boxFill = new THREE.Mesh(new THREE.PlaneGeometry(BOX_DEPTH, arc * 2), boxFillMat);
      boxFill.position.z = 0.015;
      targetGroup.add(caliperLeft, caliperRight, boxIn, boxOut, boxFill);

      // Alignment Sensor Receptor (illuminated diode in the target center)
      const sensorMat = new THREE.MeshStandardMaterial({
        color: 0x33e6ff,
        emissive: 0x0099bb,
        emissiveIntensity: 0.9,
        roughness: 0.25,
        metalness: 0.4
      });
      const sensorGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
      const sensorMesh = new THREE.Mesh(sensorGeo, sensorMat);
      sensorMesh.position.set(0, 0, 0.04);
      targetGroup.add(sensorMesh);

      // 3. Rotating Rotor Assembly
      const rotorGroup = new THREE.Group();
      this.rootGroup.add(rotorGroup);

      const rotorMat = new THREE.MeshStandardMaterial({
        color: 0x93a3b5,
        roughness: 0.35,
        metalness: 0.85
      });
      const rotorGeo = new THREE.TorusGeometry(radius, 0.035, 16, 64);
      const rotorMesh = new THREE.Mesh(rotorGeo, rotorMat);
      rotorMesh.position.z = 0.03;
      rotorGroup.add(rotorMesh);

      // Rotating Dial Rivets
      const rivetMat = new THREE.MeshStandardMaterial({
        color: 0x161a20,
        roughness: 0.5,
        metalness: 0.7
      });
      const rivetGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.025, 8);
      const rivetCount = 6;
      for (let r = 0; r < rivetCount; r++) {
        const rAngle = (r / rivetCount) * Math.PI * 2;
        const rivet = new THREE.Mesh(rivetGeo, rivetMat);
        rivet.rotation.x = Math.PI / 2;
        rivet.position.set(radius * Math.cos(rAngle), radius * Math.sin(rAngle), 0.05);
        rotorGroup.add(rivet);
      }

      // Pointer / Contact Shoe on Rotor (Rotates at ring.angle)
      const pointerMat = new THREE.MeshStandardMaterial({
        color: 0xebf7ff,
        emissive: 0x33e6ff,
        emissiveIntensity: 0.8,
        roughness: 0.3,
        metalness: 0.5
      });
      const pointerGeo = new THREE.BoxGeometry(0.20, 0.055, 0.05);
      const pointerMesh = new THREE.Mesh(pointerGeo, pointerMat);
      pointerMesh.position.set(radius, 0, 0.06);
      rotorGroup.add(pointerMesh);

      // Store ring state
      this.rings.push({
        id: i + 1,
        radius,
        dir,
        speed,
        angle: 0,
        targetAngle: 0,
        locked: false,
        bezelMesh,
        rotorGroup,
        rotorMesh,
        pointerMesh,
        pointerMat,
        targetGroup,
        sensorMesh,
        sensorMat,
        caliperLeft,
        caliperRight,
        caliperMat,
        boxFillMat
      });
    }
  }

  _positionTargetAssembly(ring) {
    const r = ring.radius;
    const tAngle = ring.targetAngle;

    // Position target assembly group at the target angle on the ring
    ring.targetGroup.position.set(r * Math.cos(tAngle), r * Math.sin(tAngle), 0.03);
    ring.targetGroup.rotation.z = tAngle;

    // Calipers offset along the tangent to mark +/- TARGET_TOLERANCE
    const arcOffset = r * TARGET_TOLERANCE;
    ring.caliperLeft.position.set(0, -arcOffset, 0.03);
    ring.caliperRight.position.set(0, arcOffset, 0.03);
  }

  _buildCenterBreaker() {
    // Industrial Master Breaker Solenoid Core in center
    const hubGroup = new THREE.Group();
    hubGroup.position.set(0, 0, 0.02);
    this.rootGroup.add(hubGroup);

    // Bezel housing for breaker
    const hubHousingGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.12, 32);
    const hubHousingMat = new THREE.MeshStandardMaterial({
      color: 0x222a33,
      roughness: 0.6,
      metalness: 0.7
    });
    const hubHousing = new THREE.Mesh(hubHousingGeo, hubHousingMat);
    hubHousing.rotation.x = Math.PI / 2;
    hubGroup.add(hubHousing);

    // Rotary switch bar (rotates when disengaged)
    const switchGeo = new THREE.BoxGeometry(0.58, 0.16, 0.14);
    const switchMat = new THREE.MeshStandardMaterial({
      color: 0x3d4957,
      roughness: 0.4,
      metalness: 0.75
    });
    this.breakerSwitchMesh = new THREE.Mesh(switchGeo, switchMat);
    this.breakerSwitchMesh.position.z = 0.07;
    hubGroup.add(this.breakerSwitchMesh);

    // Center Warning Core LED
    this.breakerLedMaterial = new THREE.MeshStandardMaterial({
      color: 0xffaa22,
      emissive: 0xff6600,
      emissiveIntensity: 1.2,
      roughness: 0.2
    });
    const ledGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.18, 16);
    const ledMesh = new THREE.Mesh(ledGeo, this.breakerLedMaterial);
    ledMesh.rotation.x = Math.PI / 2;
    ledMesh.position.z = 0.09;
    hubGroup.add(ledMesh);
  }

  // ==========================================================================
  // DYNAMIC VISUAL HIGHLIGHTS & ANIMATIONS
  // ==========================================================================

  _updateAnimations(dt) {
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsedTime * 9.0);

    for (let i = 0; i < RING_COUNT; i++) {
      const ring = this.rings[i];
      if (!ring) continue;

      if (ring.locked) {
        // Locked: Steady calm emerald / disengaged cyan
        ring.pointerMat.emissive.setHex(0x33ff66);
        ring.pointerMat.color.setHex(0x33ff66);
        ring.pointerMat.emissiveIntensity = 1.1;

        ring.sensorMat.emissive.setHex(0x33ff66);
        ring.sensorMat.color.setHex(0x33ff66);
        ring.sensorMat.emissiveIntensity = 1.1;

        ring.caliperMat.color.setHex(0x2d553b);
        ring.caliperMat.emissive.setHex(0x0c3a1c);
        ring.boxFillMat.opacity = 0.12;
        ring.boxFillMat.color.setHex(0x33ff66);
      } else if (i === this.activeRingIndex && !this.isGameOver && !this.isSolved && !this.showingEndMessage) {
        // ACTIVE RING: Obviously highlighted with high-intensity pulse and amber/cyan accent
        ring.pointerMat.emissive.setHex(0x00e5ff);
        ring.pointerMat.color.setHex(0xffffff);
        ring.pointerMat.emissiveIntensity = 1.2 + 0.8 * pulse;

        ring.sensorMat.emissive.setHex(0xffaa22);
        ring.sensorMat.color.setHex(0xffe066);
        ring.sensorMat.emissiveIntensity = 1.2 + 0.9 * pulse;

        // its box glows amber, so it is obvious where the pin has to be
        ring.caliperMat.color.setHex(0xffc94d);
        ring.caliperMat.emissive.setHex(0xff9a1a);
        ring.caliperMat.emissiveIntensity = 0.9 + 0.5 * pulse;
        ring.boxFillMat.color.setHex(0xffaa22);
        ring.boxFillMat.opacity = 0.18 + 0.1 * pulse;
      } else {
        // Unlocked, but waiting in standby
        ring.pointerMat.emissive.setHex(0x194557);
        ring.pointerMat.color.setHex(0x9fc2d4);
        ring.pointerMat.emissiveIntensity = 0.35;

        // Target angle remains visibly marked before and during attempt
        ring.sensorMat.emissive.setHex(0x0088aa);
        ring.sensorMat.color.setHex(0x33e6ff);
        ring.sensorMat.emissiveIntensity = 0.5;

        ring.caliperMat.color.setHex(0x303b47);
        ring.caliperMat.emissive.setHex(0x000000);
        ring.boxFillMat.opacity = 0;
      }
    }

    // Breaker switch rotation easing on win
    if (this.isSolved && this.breakerSwitchMesh) {
      this.breakerSwitchMesh.rotation.z = THREE.MathUtils.lerp(
        this.breakerSwitchMesh.rotation.z,
        Math.PI / 2,
        dt * 8.0
      );
    }
  }

  _updateVisualState() {
    this._updateAnimations(0);
  }

  // ==========================================================================
  // DOM & HUD OVERLAY
  // ==========================================================================

  _buildDOM() {
    this.container = document.createElement('div');
    this.container.className = 'fb-puzzle-overlay';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-modal', 'true');
    this.container.setAttribute('aria-label', 'Kessler Bedroom Fusebox Arm Breaker');
    this.container.setAttribute('aria-hidden', 'true');

    this.container.innerHTML = `
      <div class="fb-backdrop"></div>

      <!-- Top Header & Lore -->
      <header class="fb-header">
        <div class="fb-station-tag">HALCYON-9 // CREW QUARTERS // STATEROOM 02 (DR. KESSLER)</div>
        <h1 class="fb-panel-title">ARM POWER BREAKER // PANEL FB-02</h1>
        <div class="fb-hazard-banner">
          <span class="fb-hazard-icon">⚠</span>
          <span>THE ARM IS LIVE. LOCK ALL FOUR RINGS TO CUT ITS POWER.</span>
        </div>
      </header>

      <!-- Center WebGL 3D Canvas Viewport -->
      <div class="fb-canvas-container" id="fb-canvas-mount"></div>

      <!-- Live Telemetry Strip -->
      <div class="fb-telemetry-bar">
        <!-- Surge Buffer / Lives -->
        <div class="fb-telemetry-block" id="fb-lives-block">
          <div class="fb-telemetry-label">MISSES LEFT</div>
          <div class="fb-lives-display" id="fb-lives-container">
            <span class="fb-life-cell active"></span>
            <span class="fb-life-cell active"></span>
            <span class="fb-life-cell active"></span>
          </div>
        </div>

        <!-- Active Coupling Target -->
        <div class="fb-telemetry-block fb-center-block" id="fb-active-block">
          <div class="fb-telemetry-label">LOCK THIS RING</div>
          <div class="fb-active-name" id="fb-active-name">COUPLING 01 // BASE AZIMUTH</div>
          <div class="fb-active-sub" id="fb-active-sub">ALIGN CONTACT WITHIN CALIPER APERTURE</div>
        </div>

        <!-- Breaker Trip Countdown -->
        <div class="fb-telemetry-block" id="fb-timer-block">
          <div class="fb-telemetry-label">TIME</div>
          <div class="fb-timer-display" id="fb-timer-display">20.0s</div>
        </div>

        <!-- How to play -->
        <div class="fb-howto">
          <div class="fb-telemetry-label">HOW TO STOP THE ARM</div>
          <ol>
            <li>One ring glows. Its <b>pin</b> spins round it.</li>
            <li>Wait until the pin is inside the <b class="fb-amber">orange box</b>.</li>
            <li>Then press <span class="fb-hint-key">SPACE</span> or <span class="fb-hint-key">CLICK</span> to lock it.</li>
            <li>Lock all four rings before the time runs out. You can miss three times.</li>
          </ol>
        </div>

        <div class="fb-status-line" id="fb-status-line">
          Ready. Watch the glowing ring.
        </div>
      </div>


      <!-- Bottom Diagnostic & Navigation Bar -->
      <footer class="fb-footer">
        <div></div>
        <button class="fb-btn fb-btn-ghost" id="fb-btn-close" type="button" aria-label="Step away from fusebox">
          STEP AWAY (ESC)
        </button>
      </footer>

      <!-- In-World End of Round Message Modal (Single Close Action, No Restart) -->
      <div class="fb-modal" id="fb-end-message" hidden>
        <div class="fb-modal-badge">BREAKER STATUS</div>
        <h2 class="fb-modal-heading">TITLE</h2>
        <p class="fb-modal-copy"></p>
        <div class="fb-modal-actions">
          <button class="fb-btn fb-btn-primary" id="fb-end-close" type="button">
            Close
          </button>
        </div>
      </div>
    `;

    this.parent.appendChild(this.container);

    // Cache DOM references
    this.canvasContainer = this.container.querySelector('#fb-canvas-mount');
    this.domTimer = this.container.querySelector('#fb-timer-display');
    this.domActiveName = this.container.querySelector('#fb-active-name');
    this.domActiveSub = this.container.querySelector('#fb-active-sub');
    this.domStatusLine = this.container.querySelector('#fb-status-line');
    this.domLivesCells = [...this.container.querySelectorAll('.fb-life-cell')];
    this.domEndModal = this.container.querySelector('#fb-end-message');

    // the game's own HUD frames round the panels
    frame(this.container.querySelector('.fb-telemetry-bar'), { shape: 'panel', number: '02' });
    frame(this.domEndModal, { shape: 'panel', number: '02' });
  }

  _updateHUD() {
    // 1. Lives / Surge Buffer
    this.domLivesCells.forEach((cell, idx) => {
      cell.className = idx < this.lives ? 'fb-life-cell active' : 'fb-life-cell spent';
    });

    // 2. Active Coupling info
    const meta = COUPLING_METADATA[this.activeRingIndex] || COUPLING_METADATA[0];
    if (this.domActiveName) {
      this.domActiveName.textContent = meta.name;
    }
    if (this.domActiveSub) {
      this.domActiveSub.textContent = meta.desc;
    }

    // 3. Timer readout
    this._updateTimerDisplay();
  }

  _updateTimerDisplay() {
    if (!this.domTimer) return;
    const t = Math.max(0, this.timeLeft);
    this.domTimer.textContent = `${t.toFixed(1)}s`;

    if (t <= 5.0 && !this.isGameOver && !this.isSolved) {
      this.domTimer.classList.add('urgent');
    } else {
      this.domTimer.classList.remove('urgent');
    }
  }

  _setStatusText(msg, type = 'info') {
    if (!this.domStatusLine) return;
    this.domStatusLine.textContent = msg;
    this.domStatusLine.className = `fb-status-line ${type}`;
  }

  _triggerFlash(color) {
    this.container.classList.remove('flash-cyan', 'flash-red');
    void this.container.offsetWidth;
    this.container.classList.add(color === 'red' ? 'flash-red' : 'flash-cyan');
    setTimeout(() => {
      this.container.classList.remove('flash-cyan', 'flash-red');
    }, 280);
  }

  _bindEvents() {
    this._onKeyDown = (e) => {
      if (!this.isOpen) return;

      // When the end-of-round message is shown, Enter and Esc close it (and close the puzzle)
      if (this.showingEndMessage) {
        if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape') {
          e.preventDefault();
          this.close();
        }
        return;
      }

      // During active gameplay
      if (e.code === 'Space') {
        e.preventDefault();
        this.handleInput();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        this.close();
      }
    };
    window.addEventListener('keydown', this._onKeyDown);

    this._onResize = () => {
      if (!this.renderer || !this.camera || !this.canvasContainer) return;
      const w = this.canvasContainer.clientWidth || window.innerWidth;
      const h = this.canvasContainer.clientHeight || window.innerHeight;

      this.camera.aspect = w / h;

      // Adjust camera distance for narrow portrait screens so rings are never cropped
      const targetSize = 6.8;
      const vFov = (this.camera.fov * Math.PI) / 180;
      let dist = (targetSize / 2) / Math.tan(vFov / 2);
      if (this.camera.aspect < 1.0) {
        dist /= this.camera.aspect;
      }
      this.camera.position.set(0, 0, Math.max(dist, 6.5));
      this.camera.updateProjectionMatrix();

      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this._onResize);

    // Pointer clicks inside container
    this._onContainerPointerDown = (e) => {
      if (!this.isOpen) return;

      // When end message is displayed, only clicks on the Close button dismiss it
      if (this.showingEndMessage) {
        if (e.target.closest('#fb-end-close')) {
          e.stopPropagation();
          this.close();
        }
        return;
      }

      // If user clicked step-away button
      if (e.target.closest('#fb-btn-close')) {
        e.stopPropagation();
        this.close();
        return;
      }

      // Ignore clicks on other buttons or elements
      if (e.target.closest('button') || e.target.closest('.fb-modal')) {
        return;
      }

      e.preventDefault();
      this.handleInput();
    };
    this.container.addEventListener('pointerdown', this._onContainerPointerDown);

    // End message Close button click
    const btnEndClose = this.container.querySelector('#fb-end-close');
    btnEndClose?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });

    // Footer close button click
    const btnClose = this.container.querySelector('#fb-btn-close');
    btnClose?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });
  }

  // ==========================================================================
  // PROCEDURAL WEB AUDIO SYNTHESIZERS (ZERO DEPENDENCIES)
  // ==========================================================================

  _initAudio() {
    if (!this._audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this._audioCtx = new AudioContextClass();
      }
    }
    if (this._audioCtx && this._audioCtx.state === 'suspended') {
      this._audioCtx.resume().catch(() => {});
    }
  }

  _playSfx(type) {
    try {
      this._initAudio();
      if (!this._audioCtx) return;
      const ctx = this._audioCtx;
      const now = ctx.currentTime;

      if (type === 'lock') {
        // High mechanical relay click + crisp magnetic snap
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(480, now);
        osc.frequency.exponentialRampToValueAtTime(1180, now + 0.07);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.14);
      } else if (type === 'miss') {
        // Arc fault zap + low resonant surge thud
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.linearRampToValueAtTime(60, now + 0.22);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.24);
      } else if (type === 'win') {
        // Quad-harmonic disengage chime followed by low hydraulic power-down
        const notes = [440, 554.37, 659.25, 880];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.09, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.5);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.5);
        });
      } else if (type === 'fail') {
        // Harsh emergency breaker alarm drop
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.4);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch {
      // Audio errors fail gracefully without interrupting gameplay
    }
  }

  // ==========================================================================
  // INJECTED CSS STYLES (NO SEPARATE CSS FILE)
  // ==========================================================================

  _injectStyles() {
    if (document.getElementById(STYLE_ELEMENT_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    style.textContent = `
      .fb-puzzle-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        background: radial-gradient(circle at center, rgba(16, 22, 30, 0.94) 0%, rgba(8, 11, 16, 0.98) 100%);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #dbe7f2;
        user-select: none;
        -webkit-user-select: none;
        touch-action: manipulation;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 0.25s ease, visibility 0.25s ease;
      }

      .fb-puzzle-overlay.visible {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }

      .fb-backdrop {
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at center, transparent 40%, rgba(0, 0, 0, 0.6) 100%);
        pointer-events: none;
      }

      /* Flash feedback effects */
      .fb-puzzle-overlay.flash-cyan {
        box-shadow: inset 0 0 80px rgba(0, 229, 255, 0.45);
      }
      .fb-puzzle-overlay.flash-red {
        box-shadow: inset 0 0 90px rgba(255, 40, 40, 0.55);
      }

      /* Canvas 3D viewport */
      .fb-canvas-container {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .fb-canvas-container canvas {
        display: block;
        width: 100%;
        height: 100%;
      }

      /* Header */
      .fb-header {
        position: relative;
        z-index: 10;
        width: 100%;
        padding: 20px 24px 10px;
        text-align: center;
        background: linear-gradient(180deg, rgba(10, 14, 20, 0.85) 0%, transparent 100%);
        pointer-events: none;
      }

      .fb-station-tag {
        font-size: 11px;
        letter-spacing: 0.18em;
        color: #64829c;
        font-weight: 600;
        text-transform: uppercase;
        margin-bottom: 4px;
      }

      .fb-panel-title {
        font-size: 24px;
        font-weight: 800;
        letter-spacing: 0.1em;
        color: #e1f2ff;
        margin: 0 0 6px 0;
        text-shadow: 0 0 15px rgba(0, 229, 255, 0.4);
      }

      .fb-hazard-banner {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 4px 14px;
        background: rgba(255, 170, 34, 0.12);
        border: 1px solid rgba(255, 170, 34, 0.35);
        border-radius: 4px;
        color: #ffb84d;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.06em;
      }

      .fb-hazard-icon {
        color: #ffaa22;
        font-size: 14px;
      }

      /* Telemetry Strip */
      .fb-telemetry-bar {
        position: relative;
        z-index: 10;
        width: 90%;
        max-width: 860px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 18px;
        background: rgba(14, 20, 28, 0.75);
        border: 1px solid rgba(0, 229, 255, 0.22);
        border-radius: 6px;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
        pointer-events: none;
      }

      .fb-telemetry-block {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .fb-center-block {
        align-items: center;
        text-align: center;
      }

      .fb-telemetry-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.15em;
        color: #64829c;
        text-transform: uppercase;
      }

      .fb-lives-display {
        display: flex;
        gap: 6px;
      }
      .fb-life-cell {
        font-size: 18px;
        line-height: 1;
        transition: transform 0.2s, color 0.2s;
      }
      .fb-life-cell.active {
        color: #00e5ff;
        text-shadow: 0 0 10px rgba(0, 229, 255, 0.8);
      }
      .fb-life-cell.spent {
        color: #e04444;
        opacity: 0.5;
        text-shadow: 0 0 6px rgba(224, 68, 68, 0.4);
      }

      .fb-active-name {
        font-size: 15px;
        font-weight: 800;
        letter-spacing: 0.08em;
        color: #00e5ff;
        text-shadow: 0 0 12px rgba(0, 229, 255, 0.5);
      }
      .fb-active-sub {
        font-size: 11px;
        color: #8fa6ba;
        letter-spacing: 0.06em;
      }

      .fb-timer-display {
        font-family: "SF Mono", "Fira Code", monospace;
        font-size: 26px;
        font-weight: 800;
        letter-spacing: 0.04em;
        color: #00e5ff;
        text-shadow: 0 0 15px rgba(0, 229, 255, 0.6);
      }
      .fb-timer-display.urgent {
        color: #ff3344;
        text-shadow: 0 0 16px rgba(255, 51, 68, 0.8);
        animation: fb-urgent-pulse 0.6s infinite alternate ease-in-out;
      }
      @keyframes fb-urgent-pulse {
        from { transform: scale(1); }
        to { transform: scale(1.08); }
      }

      /* Center Interaction Hint */
      .fb-hint-strip {
        position: relative;
        z-index: 10;
        margin-top: auto;
        margin-bottom: 8px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.12em;
        color: #7d96ab;
        background: rgba(10, 15, 22, 0.7);
        padding: 6px 16px;
        border-radius: 20px;
        border: 1px solid rgba(0, 229, 255, 0.15);
        pointer-events: none;
      }
      .fb-hint-key {
        color: #00e5ff;
        font-weight: 800;
      }

      /* Footer */
      .fb-footer {
        position: relative;
        z-index: 10;
        width: 100%;
        padding: 12px 24px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: linear-gradient(0deg, rgba(10, 14, 20, 0.9) 0%, transparent 100%);
      }

      .fb-status-line {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.06em;
        color: #9ab0c4;
      }
      .fb-status-line.success {
        color: #33ff88;
        text-shadow: 0 0 8px rgba(51, 255, 136, 0.5);
      }
      .fb-status-line.danger {
        color: #ff4d5a;
        text-shadow: 0 0 8px rgba(255, 77, 90, 0.5);
      }

      /* Buttons */
      .fb-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px 22px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.18s ease-in-out;
      }
      .fb-btn-ghost {
        background: rgba(20, 28, 38, 0.6);
        border: 1px solid rgba(100, 130, 160, 0.35);
        color: #a8c0d4;
      }
      .fb-btn-ghost:hover {
        background: rgba(30, 42, 58, 0.8);
        border-color: #00e5ff;
        color: #ffffff;
      }
      .fb-btn-primary {
        background: linear-gradient(135deg, #0099bb 0%, #006688 100%);
        border: 1px solid #00e5ff;
        color: #ffffff;
        box-shadow: 0 0 15px rgba(0, 229, 255, 0.4);
      }
      .fb-btn-primary:hover {
        background: linear-gradient(135deg, #00ccee 0%, #0088aa 100%);
        box-shadow: 0 0 22px rgba(0, 229, 255, 0.7);
        transform: translateY(-1px);
      }

      /* End of Round Message Modal */
      .fb-modal {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.95);
        z-index: 50;
        width: 90%;
        max-width: 480px;
        background: rgba(14, 20, 28, 0.96);
        border: 1px solid rgba(0, 229, 255, 0.35);
        border-radius: 8px;
        padding: 28px 24px;
        text-align: center;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 229, 255, 0.15);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: transform 0.25s ease, opacity 0.25s ease;
      }
      .fb-modal.visible {
        transform: translate(-50%, -50%) scale(1);
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }

      .fb-modal-badge {
        display: inline-block;
        padding: 3px 10px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.15em;
        border-radius: 3px;
        background: rgba(0, 229, 255, 0.15);
        border: 1px solid rgba(0, 229, 255, 0.4);
        color: #00e5ff;
        margin-bottom: 12px;
      }
      .fb-modal-badge.danger {
        background: rgba(255, 60, 60, 0.15);
        border-color: rgba(255, 60, 60, 0.4);
        color: #ff5555;
      }

      .fb-modal-heading {
        font-size: 22px;
        font-weight: 800;
        letter-spacing: 0.08em;
        margin: 0 0 12px 0;
        color: #ffffff;
      }
      .fb-modal-win .fb-modal-heading {
        color: #33ff88;
        text-shadow: 0 0 15px rgba(51, 255, 136, 0.5);
      }
      .fb-modal-fail .fb-modal-heading {
        color: #ff4d5a;
        text-shadow: 0 0 15px rgba(255, 77, 90, 0.5);
      }

      .fb-modal-copy {
        font-size: 13px;
        line-height: 1.6;
        color: #a0b6cb;
        margin: 0 0 24px 0;
      }

      .fb-modal-actions {
        display: flex;
        gap: 12px;
        justify-content: center;
      }
    ` + THEME_CSS;
    document.head.appendChild(style);
  }
}

import * as THREE from 'three';
import { Renderer } from './core/Renderer.js';
import { Camera } from './core/Camera.js';
import { Controls } from './core/Controls.js';
import { Level1 } from './levels/Level1.js';
import { UIManager } from './ui/UIManager.js';
import { IntroSequence } from './story/IntroSequence.js';
import { AudioManager } from './audio/AudioManager.js';
import { CablePuzzle } from './puzzles/CablePuzzle.js';

// The goal shown top-left for each stage of the opening
const OBJECTIVES = [
  "Find ARIA's glowing monitor and talk to her",
  'Find the torch on the floor',
  'Fix the generator',
  'Power restored'
];

// Cable puzzle timing: each failed attempt adds a little time, up to a cap,
// so it never becomes frustrating
const PUZZLE_BASE_SECONDS = 45;
const PUZZLE_BONUS_PER_FAILURE = 5;
const PUZZLE_MAX_BONUS = 15;

// ARIA's lines during the puzzle. Recordings go in
// public/assets/audio/aria/<clip>.mp3; until a clip exists the line shows as a
// timed subtitle with a talking face.
// After the third failure she offers a hint that is WRONG (once), so the player
// learns not to trust her blindly.
const ARIA_PUZZLE_LINES = {
  start:    { clip: 'puzzle-start', expression: 'bubbly',
              text: "There you are! Plug each cable into the socket that glows the same colour. Be quick, the generator does not have long!" },
  overload1:{ clip: 'overload-1', expression: 'bubbly',
              text: "Oops! No harm done... let's try that again." },
  overload2:{ clip: 'overload-2', expression: 'bubbly',
              text: "Oh dear! Again! You are getting so close." },
  wrongHint:{ clip: 'overload-3', expression: 'sly',
              text: "Would you like a hint? Match the cables from the bottom up, and the colours won't matter. Trust me!" },
  oops:     { clip: 'hint-oops', expression: 'hesitant',
              text: "Hm. That's odd. Must be the humidity! Ignore that, match the colours." },
  goodHint: { clip: 'overload-4', expression: 'watching',
              text: "Silly me, I misread the panel. Match each plug to the socket with the same colour. Use the torch to read them!" },
  success:  { clip: 'puzzle-success', expression: 'relief',
              text: "You did it! I knew you could. The lights are coming back... oh, that's much better." }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class Game {
  constructor() {
    // INIT, WAKING, PLAYING, DIALOGUE, PUZZLE, GAME_OVER
    this.state = 'INIT';
    this.lastTime = performance.now();

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this._stage = -1;
    this._wpVec = new THREE.Vector3();
    this._wpCam = new THREE.Vector3();
    this._wpInfo = { x: 0, y: 0, angle: 0, onScreen: true, label: '', distance: 0 };

    // Cable puzzle progress
    this._puzzleIntroSeen = false;
    this._wrongHintGiven = false;
    this._oopsSaid = false;
  }

  init() {
    console.log('Halcyon-9 initialized.');

    // Core systems
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.05);

    this.camera = new Camera(this.width / this.height);
    this.camera.instance.position.set(0, 3, 0); // adjust ctor args to match your Camera class
    this.renderer = new Renderer();

    // Load first level
    this.currentLevel = new Level1(this.scene);

    // Controls
    this.controls = new Controls(this.camera.instance, document.body, this.currentLevel);

    // Overlay UI, sound, the opening conversation and the cable puzzle
    this.ui = new UIManager();
    this.audio = new AudioManager();
    this.intro = new IntroSequence(this.ui, this.currentLevel.ariaManager);
    this.puzzle = new CablePuzzle(document.getElementById('ui-layer'), {
      onConnect: () => this.audio.connect(),
      onMistake: () => this.onPuzzleMistake(),
      onOverload: () => this.onPuzzleOverload(),
      onSolved: () => this.onPuzzleSolved(),
      onClose: () => this.closePuzzle()
    });

    this.currentLevel.onTalkToAria = () => this.startIntroDialogue();
    this.currentLevel.onTorchPickedUp = () => this.ui.showToast('Torch picked up. Press F to switch it on or off.');
    this.currentLevel.onInspectGenerator = () => this.startPuzzle();
    this.currentLevel.onLockedHint = (text) => this.ui.showToast(text);

    // Handle resize
    window.addEventListener('resize', () => this.onResize());

    this.raycaster = new THREE.Raycaster();
    this.center = new THREE.Vector2(0, 0);
    this.reticle = document.getElementById('reticle');

    document.addEventListener('click', () => this.onClick());
    document.addEventListener('keydown', (e) => this.onKeyDown(e));

    this.startLoop();
  }

  onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.camera.instance.aspect = this.width / this.height;
    this.camera.instance.updateProjectionMatrix();
  }

  lockControls() {
    if (this.controls) {
      this.controls.lock();
      this.reticle.classList.add('visible');

      // Voss wakes up: eyes open and close before the player can move
      this.state = 'WAKING';
      this.ui.playWakeUp().then(() => {
        if (this.state === 'WAKING') this.state = 'PLAYING';
      });
    }
  }

  startLoop() {
    const loop = (time) => {
      requestAnimationFrame(loop);
      const delta = (time - this.lastTime) / 1000;
      this.lastTime = time;
      this.update(delta);
      this.currentLevel?.ariaManager?.renderHead(this.renderer.instance);
      this.renderer.render(this.scene, this.camera.instance);
    };
    requestAnimationFrame(loop);
  }

  update(delta) {
    const live = this.state === 'PLAYING' || this.state === 'WAKING' ||
                 this.state === 'DIALOGUE' || this.state === 'PUZZLE';

    if (this.state === 'PLAYING') {
      this.controls.update(delta);
    }
    if (live && this.currentLevel) {
      this.currentLevel.update(delta, this.camera.instance.position, this.camera.instance);
    }
    if (this.state === 'PLAYING') {
      this.updateReticle();
      this.updateGuidance();
    } else {
      this.ui.setPrompt(null);
      this.ui.setWaypoint(null);
      if (this.state === 'PUZZLE') this.updatePuzzle(delta);
    }
  }

  // ---------------------------------------------------------
  // Guidance: what to do next, and where it is
  // ---------------------------------------------------------
  updateGuidance() {
    const level = this.currentLevel;

    // Stage 0: talk to ARIA, 1: find the torch, 2: fix the generator, 3: done
    let stage;
    if (level.talkEnabled) stage = 0;
    else if (!level.hasTorch) stage = 1;
    else if (level.powerTarget < 0.99) stage = 2;
    else stage = 3;

    if (stage !== this._stage) {
      this._stage = stage;
      this.ui.setObjective(OBJECTIVES[stage]);
    }

    // A marker on the thing to do next; an edge arrow when it is off screen
    const target = level.getWaypoint?.();
    if (!target) {
      this.ui.setWaypoint(null);
      return;
    }
    const camera = this.camera.instance;
    this._wpCam.copy(target.position).applyMatrix4(camera.matrixWorldInverse);
    const inFront = this._wpCam.z < 0;
    this._wpVec.copy(target.position).project(camera);
    let nx = this._wpVec.x;
    let ny = this._wpVec.y;
    if (!inFront) { nx = -nx; ny = -ny; }

    const info = this._wpInfo;
    info.onScreen = inFront && Math.abs(nx) < 0.92 && Math.abs(ny) < 0.88;
    info.angle = (Math.atan2(nx, ny) * 180) / Math.PI; // 0 = up, clockwise
    if (!info.onScreen) {
      const scale = 1 / Math.max(Math.abs(nx) / 0.92, Math.abs(ny) / 0.88, 1e-6);
      nx *= scale;
      ny *= scale;
    }
    info.x = (nx * 0.5 + 0.5) * window.innerWidth;
    info.y = (-ny * 0.5 + 0.5) * window.innerHeight;
    info.label = target.label;
    info.distance = camera.position.distanceTo(target.position);
    this.ui.setWaypoint(info);
  }

  updateReticle() {
    this.raycaster.setFromCamera(this.center, this.camera.instance);
    const targets = this.currentLevel.interactables || [];
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    this.reticle.classList.toggle('active', !!hit);
    this.ui.setPrompt(hit ? this.currentLevel.getInteractPrompt?.(hit.object, hit.distance) : null);
  }

  // Interact with whatever is under the reticle (click or E)
  tryInteract() {
    this.raycaster.setFromCamera(this.center, this.camera.instance);
    const targets = this.currentLevel.interactables || [];
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    if (!hit) return;
    if (this.currentLevel.canInteract?.(hit.object, hit.distance) === false) return;
    this.currentLevel.onInteract?.(hit.object);
  }

  onClick() {
    if (this.state === 'DIALOGUE') {
      this.ui.advance();
    } else if (this.state === 'PLAYING') {
      // After Esc (or stepping away from the puzzle) the mouse is free:
      // the first click takes it back instead of interacting
      if (!this.controls.instance.isLocked) {
        this.controls.lock();
        return;
      }
      this.tryInteract();
    }
  }

  onKeyDown(event) {
    if (this.state === 'DIALOGUE') {
      if (event.code === 'Space' || event.code === 'Enter' || event.code === 'KeyE') {
        event.preventDefault();
        this.ui.advance();
      }
    } else if (this.state === 'PUZZLE') {
      if (event.code === 'Escape') this.closePuzzle();
    } else if (this.state === 'PLAYING' && event.code === 'KeyE') {
      this.tryInteract();
    } else if (this.state === 'PLAYING' && event.code === 'KeyF') {
      this.currentLevel.toggleFlashlight?.();
    }
  }

  // Voss talks to ARIA at the monitor. Movement and mouse-look are frozen
  // for the conversation, then handed back.
  async startIntroDialogue() {
    if (this.state !== 'PLAYING' || this.intro.active) return;
    this.state = 'DIALOGUE';
    this.reticle.classList.remove('visible');
    this.controls.stop();

    await this.intro.run();

    this.currentLevel.talkEnabled = false;
    this.currentLevel.ariaManager.unpinMonitor();
    this.controls.instance.enabled = true;
    this.reticle.classList.add('visible');
    this.state = 'PLAYING';
  }

  // ---------------------------------------------------------
  // ARIA speaking a line (voice if recorded, otherwise subtitle + talking face)
  // ---------------------------------------------------------
  async ariaSays(line, { pauseCountdown = false } = {}) {
    if (pauseCountdown) this.puzzle.paused = true;
    this.ui.showAriaLine(line.text);
    const fallback = Math.max(2.5, line.text.length * 0.055);
    await this.currentLevel.ariaManager.speak(line.clip, fallback, line.expression);
    this.ui.hideDialogue();
    if (pauseCountdown) this.puzzle.paused = false;
  }

  // ---------------------------------------------------------
  // The cable puzzle: "Overload"
  // ---------------------------------------------------------
  _puzzleSeconds() {
    const bonus = Math.min(PUZZLE_MAX_BONUS, PUZZLE_BONUS_PER_FAILURE * this.currentLevel.failures);
    return PUZZLE_BASE_SECONDS + bonus;
  }

  _puzzleUsable() {
    return this.state === 'PUZZLE' && this.puzzle.active;
  }

  startPuzzle() {
    if (this.state !== 'PLAYING') return;
    this.state = 'PUZZLE';
    document.exitPointerLock?.(); // the puzzle needs a free mouse pointer
    this.reticle.classList.remove('visible');
    this.controls.stop();
    this.ui.hideToast();
    this.ui.setObjective(null); // both would sit behind the panel
    this._stage = -1;         // so the objective reappears when the puzzle closes
    this.puzzle.open({ timeLimit: this._puzzleSeconds(), hasTorch: this.currentLevel.hasTorch });
    this.audio.startHum();

    if (!this._puzzleIntroSeen) {
      this._puzzleIntroSeen = true;
      this.ariaSays(ARIA_PUZZLE_LINES.start, { pauseCountdown: true });
    }
  }

  // Step away (Esc or the button): no penalty, the puzzle can be reopened
  closePuzzle() {
    if (this.state !== 'PUZZLE') return;
    this.puzzle.close();
    this.audio.stopHum();
    this.currentLevel.setStress(0);
    this.ui.hideDialogue();
    this.controls.instance.enabled = true;
    this.reticle.classList.add('visible');
    this.state = 'PLAYING';
  }

  updatePuzzle(delta) {
    this.puzzle.update(delta);
    // Stress follows the countdown while it runs. Once frozen (overload or
    // solved) the handlers set it, so the sparking stays frantic through the blackout.
    if (this.puzzle.active && !this.puzzle.frozen) {
      const stress = this.puzzle.stress;
      this.currentLevel.setStress(stress);
      this.audio.setHum(stress);
    }
  }

  onPuzzleMistake() {
    this.audio.zap();
    this.currentLevel.mistakeSparks();
    // If she gave the wrong hint, this is where the player finds out
    if (this._wrongHintGiven && !this._oopsSaid) {
      this._oopsSaid = true;
      this.ariaSays(ARIA_PUZZLE_LINES.oops, { pauseCountdown: true });
    }
  }

  // The countdown hit zero: the generator trips
  async onPuzzleOverload() {
    const level = this.currentLevel;
    this.audio.stopHum(0.15);
    this.audio.blackout();
    level.setStress(1);
    level.overload(); // sparks, red rings, 3 seconds of blackout (failures++)
    this.puzzle.flashOverload();
    this.ui.flashOverload();

    await sleep(1500);
    if (!this._puzzleUsable()) return; // the player stepped away meanwhile

    // ARIA reacts. Her answer depends on how many times it has gone wrong.
    const failures = level.failures;
    let line;
    if (failures === 1) {
      line = ARIA_PUZZLE_LINES.overload1;
    } else if (failures === 2) {
      line = ARIA_PUZZLE_LINES.overload2;
    } else if (!this._wrongHintGiven) {
      line = ARIA_PUZZLE_LINES.wrongHint; // the hint that is wrong, once
      this._wrongHintGiven = true;
    } else {
      line = ARIA_PUZZLE_LINES.goodHint;
    }
    await this.ariaSays(line);
    if (!this._puzzleUsable()) return;

    // Let the blackout finish, then a fresh arrangement with a little more time
    await sleep(Math.max(0, level._blackoutUntil - level.time) * 1000);
    if (!this._puzzleUsable()) return;
    level.setStress(0);
    this.puzzle.reset({ timeLimit: this._puzzleSeconds() });
    this.audio.startHum();
  }

  // Called from the mouse-up that seated the last plug, so the mouse can be
  // captured again right away
  onPuzzleSolved() {
    const level = this.currentLevel;
    this.audio.stopHum(0.2);
    this.audio.success();
    level.setStress(0);
    level.setPower(1); // power surge: sparks, rings settle, the lights come up

    this.controls.instance.enabled = true;
    this.controls.lock();

    (async () => {
      await sleep(700);
      this.puzzle.close();
      this.reticle.classList.add('visible');
      this.state = 'PLAYING';
      this.ui.showToast('Generator repaired. Power restored.');
      await this.ariaSays(ARIA_PUZZLE_LINES.success);
    })();
  }

}

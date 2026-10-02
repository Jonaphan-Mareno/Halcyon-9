import * as THREE from 'three';
import { Renderer } from './core/Renderer.js';
import { Camera } from './core/Camera.js';
import { Controls } from './core/Controls.js';
import { Level1 } from './levels/Level1.js';
import { Level2Session } from './levels/Level2Session.js';
import { UIManager } from './ui/UIManager.js';
import { HUD } from './ui/HUD.js';
import { Inventory } from './ui/Inventory.js';
import { ItemPreview } from './ui/ItemPreview.js';
import { IntroSequence } from './story/IntroSequence.js';
import { AudioManager } from './audio/AudioManager.js';
import { CircuitPuzzle } from './puzzles/CircuitPuzzle.js';
import { PlayerStats } from './player/PlayerStats.js';

// The goal shown top-left for each stage of the opening
const OBJECTIVES = [
  'Fix the wall panel to turn on monitor',
  "Find ARIA's glowing monitor and talk to her",
  'Find the torch on the floor',
  'Repair the generator circuit',
  'Turn the relay rings until every marker lines up with the rail',
  'Power restored'
];

// Circuit puzzle timing: each failed attempt adds a little time, up to a cap,
// so it never becomes frustrating
const PUZZLE_BASE_SECONDS = 60;
const PUZZLE_BONUS_PER_FAILURE = 5;
const PUZZLE_MAX_BONUS = 15;

// What hurts Voss (health is out of 100), and what repairs him
const OVERLOAD_DAMAGE = 34; // the generator trips: an electric shock. Three overloads in a row are fatal
const ZAP_DAMAGE = 8;       // power fed into a live fuse
const HEAL_PER_REPAIR = 25; // each stage of the generator he fixes

// If the player has been stuck on a stage this long, ARIA says something
const IDLE_SECONDS = 50;

// ARIA's lines during the puzzle. Recordings go in
// public/assets/audio/aria/<clip>.mp3; until a clip exists the line shows as a
// timed subtitle with a talking face. Her hints are honest; the jokes are hers.
// NOTE: puzzle-start and overload-1 are already recorded, so their subtitles must
// keep the recorded wording. Change the text only together with a re-recording.
const ARIA_PUZZLE_LINES = {
  start:    { clip: 'puzzle-start', expression: 'bubbly',
              text: "There you are! Turn the tiles to carry the power from the battery to the bulbs. Be quick, the generator does not have long!" },
  overload1:{ clip: 'overload-1', expression: 'bubbly',
              text: "Oops! No harm done... let's try that again." },
  overload2:{ clip: 'overload-2', expression: 'sly',
              text: "Oh dear! Again! They say lightning never strikes twice. It was clearly lying. Here's a hint: start at the battery, follow the glow, and keep it away from the red fuses. They have very strong... current opinions." },
  zap1:     { clip: 'zap-1', expression: 'sly',
              text: "Ooh, that's a live fuse. Touching it is not recommended. Although I hear the shocks are free." },
  zap2:     { clip: 'zap-2', expression: 'bubbly',
              text: "You know you can just... not touch the fuses? Just a thought!" },
  success:  { clip: 'puzzle-success', expression: 'relief',
              text: "You did it! The wiring is holding but the relay rings are out of phase. Turn each ring until its marker lines up with the rail. Be careful they are all linked!" },
  relayDone:{ clip: 'relay-success', expression: 'sly',
              text: "Perfect alignment! Look at those lights. Everything is back on." }
};

// Said when the player has been stuck for a while, one per stage
const ARIA_IDLE_LINES = [
  null,
  { clip: 'idle-talk', expression: 'bubbly',
    text: "Don't be shy, Voss. I don't bite. I don't have teeth, actually. Or a body." },
  { clip: 'idle-torch', expression: 'bubbly',
    text: "The torch is on the floor, near my glowing face. Romantic, isn't it?" },
  { clip: 'idle-generator', expression: 'sly',
    text: "The generator is the big tall thing with all the sparks. Hard to miss. Even for a man with no memory." },
  { clip: 'idle-rings', expression: 'sly',
    text: "Those rings won't turn themselves. Believe me, I've tried. No hands." }
];

// When Voss loses all his health ARIA revives him from a saved copy. (He is,
// secretly, a copy.)
const ARIA_RESTORE_LINES = [
  { clip: 'restore-1', expression: 'bubbly',
    text: "Oh dear, that was a nasty shock! Don't worry, I keep backups of everything... of you especially. Think of it as a very short nap." },
  { clip: 'restore-2', expression: 'sly',
    text: "Again? Goodness, you really are fragile. Restoring you from backup... You're still just as charming, though. Somehow." },
  { clip: 'restore-3', expression: 'hesitant',
    text: "Hm, that backup was a little rough around the edges. Please be careful, Voss. That was my last one!" }
];
const ARIA_GAME_OVER_TEXT = "Backup... corrupted. I am so sorry, Voss. I really did try.";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export class Game {
  constructor() {
    // INIT, WAKING, PLAYING, DIALOGUE, TUTORIAL, PUZZLE, INVENTORY, DEAD, GAME_OVER
    this.state = 'INIT';
    this.lastTime = performance.now();
    // ?level=2 in the address starts straight in level 2, at the elevator (for testing)
    this.startLevel = new URLSearchParams(window.location.search).get('level');

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this._stage = -1;
    this._wpVec = new THREE.Vector3();
    this._wpCam = new THREE.Vector3();
    this._wpInfo = { x: 0, y: 0, angle: 0, onScreen: true, label: '', distance: 0 };

    this.player = new PlayerStats();
    this._resetProgress();
  }

  // Puzzle and story flags that start fresh on a new run
  _resetProgress() {
    this._puzzleIntroSeen = false;
    this._tutorialSeen = false;
    this._dying = false;
    this._idleStage = -1;
    this._idleSeconds = 0;
    this._idleSpoken = false;
    this.checkpoint = new THREE.Vector3(0, 3, 0); // where Voss is revived
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

    if (this.startLevel === '2') {
      this._initLevel2();
      return;
    }

    // Load first level
    this.currentLevel = new Level1(this.scene);

    // Controls
    this.controls = new Controls(this.camera.instance, document.body, this.currentLevel);

    // Overlay UI, sound, the opening conversation and the circuit puzzle
    const uiRoot = document.getElementById('ui-layer');
    this.ui = new UIManager();
    this.hud = new HUD(uiRoot, { onRestart: () => this.restart() });
    this.inventory = new Inventory(uiRoot);
    this.preview = new ItemPreview();
    this.preview.load().catch((e) => console.warn('Torch preview failed to load.', e));
    this.audio = new AudioManager();
    this.puzzle = new CircuitPuzzle(uiRoot, {
      onRotate: () => this.audio.tick(),
      onZap: () => this.onPuzzleZap(),
      onOverload: () => this.onPuzzleOverload(),
      onSolved: () => this.onPuzzleSolved(),
      onClose: () => this.closePuzzle()
    });
    this.inventory.statusFor.torch = () => (this.currentLevel.flashlightOn ? 'ON' : 'OFF');

    this._wireLevel();

    // Handle resize
    window.addEventListener('resize', () => this.onResize());

    this.raycaster = new THREE.Raycaster();
    this.center = new THREE.Vector2(0, 0);
    this.reticle = document.getElementById('reticle');

    document.addEventListener('click', (e) => this.onClick(e));
    document.addEventListener('keydown', (e) => this.onKeyDown(e));

    this.mouse = new THREE.Vector2();
    this.camAnim = null;
    this.savedCam = null;
    this._leavingRingPuzzle = false;
    this._createRingPuzzleUI();
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    this.startLoop();
  }

  // Level 2 has its own physics player, HUD wiring, machines and story beats; all of that
  // lives in levels/Level2Session.js so it stays out of this file
  _initLevel2() {
    this.level2Mode = true;
    this.ui = new UIManager();
    this.reticle = document.getElementById('reticle');
    this.level2 = new Level2Session(this);
    window.addEventListener('resize', () => this.onResize());
    this.startLoop();
  }

  updateLevel2(delta) {
    this.level2.update(delta);
  }

  // Connect a freshly built level to the UI, sound and story
  _wireLevel() {
    const level = this.currentLevel;
    this.intro = new IntroSequence(this.ui, level.ariaManager);
    level.onTalkToAria = () => this.startIntroDialogue();
    level.onTorchPickedUp = () => {
      this.inventory.add('torch');
      this.hud.setTorch(true, true);
      this.ui.showToast('Torch picked up. F switches it on or off. I opens your inventory.');
    };
    level.onInspectGenerator = () => this.startPuzzle();
    level.onLockedHint = (text) => this.ui.showToast(text);
    level.onRingTurned = () => this.audio.clunk();
    level.onRelayAligned = () => this.onRelayAligned();
    level.onOpenRingPuzzle = () => this.enterRingPuzzle();
    level.onRingPuzzleSolved = () => this.onRingPuzzleSolved();
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
      if (this.level2Mode) {
        this.updateLevel2(Math.min(delta, 0.05));
      } else {
        this.update(delta);
        this.currentLevel?.ariaManager?.renderHead(this.renderer.instance);
      }
      this.renderer.render(this.scene, this.camera.instance);
    };
    requestAnimationFrame(loop);
  }

  update(delta) {
    const live = this.state === 'PLAYING' || this.state === 'WAKING' || this.state === 'DIALOGUE' ||
                 this.state === 'TUTORIAL' || this.state === 'PUZZLE' || this.state === 'INVENTORY' ||
                 this.state === 'DEAD' || this.state === 'RING_PUZZLE';

    if (this.state === 'PLAYING') {
      this.controls.update(delta);
    }
    if (live && this.currentLevel) {
      this.currentLevel.update(delta, this.camera.instance.position, this.camera.instance);
    }
    if (live && this.state !== 'DEAD' && this.state !== 'WAKING') {
      this.player.playSeconds += delta;
    }

    // The status display appears once the intro conversation is over
    this.hud.setVisible(!this.currentLevel.talkEnabled && this.state !== 'GAME_OVER' && this.state !== 'INIT');
    this.hud.update(this.player);

    // The torch in the corner slot (and on the inventory screen) is a live 3D model
    if (this.preview.ready && this.currentLevel.hasTorch) {
      const targets = [this.hud.torchCanvas];
      if (this.inventory.open && this.inventory.torchCanvas) targets.push(this.inventory.torchCanvas);
      this.preview.draw(targets, delta, this.currentLevel.flashlightOn);
    }

    if (this.state === 'PLAYING') {
      this.updateReticle();
      this.updateGuidance(delta);
    } else {
      this.ui.setPrompt(null);
      this.ui.setWaypoint(null);
      if (this.state === 'PUZZLE') this.updatePuzzle(delta);
      if (this.state === 'RING_PUZZLE') this.updateRingPuzzleHover();
    }
    this.updateCamAnim(delta);   // last line of update()
  }

  // ---------------------------------------------------------
  // Guidance: what to do next, and where it is
  // ---------------------------------------------------------
  updateGuidance(delta) {
    const level = this.currentLevel;

    // Stage 0: Turn on Monitor, 1: talk to ARIA, 2: find the torch, 3: repair the circuit,
    // 4: align the relay rings, 5: done
    let stage;
    if (!level.ringPuzzleSolved) stage = 0;
    else if (level.talkEnabled) stage = 1;
    else if (!level.hasTorch) stage = 2;
    else if (!level.cablesFixed) stage = 3;
    else if (!level.relaySolved) stage = 4;
    else stage = 5;

    if (stage !== this._stage) {
      this._stage = stage;
      this.ui.setObjective(OBJECTIVES[stage]);
    }
    this.updateIdleQuip(stage, delta);

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

  // If the player dawdles on a stage, ARIA makes a remark (and a joke), once
  updateIdleQuip(stage, delta) {
    if (stage !== this._idleStage) {
      this._idleStage = stage;
      this._idleSeconds = 0;
      this._idleSpoken = false;
    }
    const aria = this.currentLevel.ariaManager;
    if (this._idleSpoken || stage >= ARIA_IDLE_LINES.length || !ARIA_IDLE_LINES[stage] || aria.speaking) return;
    this._idleSeconds += delta;
    if (this._idleSeconds >= IDLE_SECONDS) {
      this._idleSpoken = true;
      this.ariaSays(ARIA_IDLE_LINES[stage]);
    }
  }

  updateReticle() {
    this.raycaster.setFromCamera(this.center, this.camera.instance);
    const targets = this.currentLevel.interactables || [];
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    this.reticle.classList.toggle('active', !!hit);
    this.ui.setPrompt(hit ? this.currentLevel.getInteractPrompt?.(hit.object, hit.distance) : null);
  }

  // Interact with whatever is under the reticle (click or E)
  tryInteract(options = {}) {
    this.raycaster.setFromCamera(this.center, this.camera.instance);
    const targets = this.currentLevel.interactables || [];
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    if (!hit) return;
    if (this.currentLevel.canInteract?.(hit.object, hit.distance) === false) return;
    this.currentLevel.onInteract?.(hit.object, options);
  }

  // Advance the conversation: skip ARIA's line if she is speaking, otherwise
  // move on from Voss's line
  advanceDialogue() {
    if (this.ui.isAriaLine()) this.currentLevel.ariaManager.skip();
    else this.ui.advance();
  }

  onClick(event) {
    if (this.state === 'DIALOGUE') {
      this.advanceDialogue();
    } else if (this.state === 'TUTORIAL') {
      this.closeTutorial();
    } else if (this.state === 'PLAYING') {
      // After Esc (or stepping away from the puzzle) the mouse is free:
      // the first click takes it back instead of interacting
      if (!this.controls.instance.isLocked) {
        this.controls.lock();
        return;
      }
      this.tryInteract({ reverse: !!event?.shiftKey });
    }else if (this.state === 'RING_PUZZLE') {
      this.onRingPuzzleClick(event);
    }
  }

  onKeyDown(event) {
    const confirm = event.code === 'Space' || event.code === 'Enter' || event.code === 'KeyE';

    // Space or Enter skips whatever ARIA is saying, from almost anywhere
    if ((event.code === 'Space' || event.code === 'Enter') && this.ui.isAriaLine() &&
        (this.state === 'PLAYING' || this.state === 'PUZZLE' || this.state === 'INVENTORY')) {
      event.preventDefault();
      this.currentLevel.ariaManager.skip();
      return;
    }

    if (this.state === 'DIALOGUE') {
      if (confirm) {
        event.preventDefault();
        this.advanceDialogue();
      }
    } else if (this.state === 'TUTORIAL') {
      if (confirm) {
        event.preventDefault();
        this.closeTutorial();
      }
    } else if (this.state === 'PUZZLE') {
      if (event.code === 'Escape') this.closePuzzle();
    } else if (this.state === 'RING_PUZZLE') {
      if (event.repeat) return;
      if (event.code === 'KeyE') this.exitRingPuzzle();
      else if (event.code === 'Escape') this.exitRingPuzzle({ relock: false });
    } else if (this.state === 'INVENTORY') {
      if (event.code === 'KeyI' || event.code === 'Escape') this.closeInventory();
    } else if (this.state === 'PLAYING') {
      if (event.code === 'KeyE') this.tryInteract();
      else if (event.code === 'KeyF') this.toggleFlashlight();
      else if (event.code === 'KeyI') this.openInventory();
    }
  }

  toggleFlashlight() {
    const level = this.currentLevel;
    level.toggleFlashlight?.();
    this.hud.setTorch(level.hasTorch, level.flashlightOn);
  }

  // ---------------------------------------------------------
  // Inventory (I): items, status and stats. The game pauses around it.
  // ---------------------------------------------------------
  openInventory() {
    if (this.state !== 'PLAYING') return;
    this.state = 'INVENTORY';
    this.reticle.classList.remove('visible');
    this.controls.stop();
    this.inventory.show(this.player, this.ui.objectiveText.textContent);
  }

  closeInventory() {
    if (this.state !== 'INVENTORY') return;
    this.inventory.close();
    this.controls.instance.enabled = true;
    this.reticle.classList.add('visible');
    this.state = 'PLAYING';
  }

  // The first time the health and lives display appears, explain it
  showTutorial() {
    this._tutorialSeen = true;
    this.state = 'TUTORIAL';
    this.reticle.classList.remove('visible');
    this.controls.stop();
    this.hud.showTutorial();
  }

  closeTutorial() {
    if (this.state !== 'TUTORIAL') return;
    this.hud.hideTutorial();
    this.controls.instance.enabled = true;
    this.reticle.classList.add('visible');
    this.state = 'PLAYING';
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

    if (!this._tutorialSeen) this.showTutorial();
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
  // Health, death and being revived
  // ---------------------------------------------------------

  // Hurt Voss. Returns true if that flatlined him.
  damagePlayer(amount) {
    if (this._dying) return true;
    const flatlined = this.player.damage(amount);
    this.hud.flash();
    if (flatlined) this.onFlatline();
    return flatlined;
  }

  // Health hit zero. ARIA revives him from a saved copy, as long as he has a life left.
  async onFlatline() {
    if (this._dying) return;
    this._dying = true;

    // Drop whatever he was doing
    if (this.puzzle.active) {
      this.puzzle.frozen = true;
      this.puzzle.close();
    }
    this.audio.stopHum(0.1);
    this.currentLevel.setStress(0);
    this.ui.hideDialogue();
    this.ui.hideToast();
    this.inventory.close();
    this.hud.hideTutorial();
    this.state = 'DEAD';
    this.controls.stop();
    this.reticle.classList.remove('visible');

    this.hud.showDeath('SIGNAL LOST', 'Your health ran out...');
    await sleep(2200);

    if (!this.player.hasRestoreLeft) {
      // No lives left
      this.state = 'GAME_OVER';
      document.exitPointerLock?.();
      const p = this.player;
      this.hud.showGameOver(
        ARIA_GAME_OVER_TEXT,
        `Overloads ${p.overloads}   |   Times revived ${p.deaths}   |   Puzzles solved ${p.puzzlesSolved}   |   Time ${formatTime(p.playSeconds)}`
      );
      return;
    }

    this.player.useRestore();
    this.hud.showDeath('RESTORING FROM BACKUP', `Lives left: ${this.player.restores}`);
    await sleep(1800);

    // Back on his feet, at the last place he was standing
    this.camera.instance.position.copy(this.checkpoint);
    this.controls.instance.enabled = true;
    this.hud.hideDeath();
    this.reticle.classList.add('visible');
    this._dying = false;
    this.state = 'PLAYING';

    const line = ARIA_RESTORE_LINES[Math.min(this.player.deaths, ARIA_RESTORE_LINES.length) - 1];
    this.ariaSays(line);
  }

  // Start over without refreshing the page: tear the level down, rebuild it,
  // reset everything and wake Voss up again
  restart() {
    this.hud.hideGameOver();
    this.hud.hideDeath();
    this.hud.hideTutorial();
    this.puzzle.close();
    this.audio.stopHum(0.05);
    this.inventory.reset();
    this.ui.hideDialogue();
    this.ui.hideToast();
    this.ui.setObjective(null);
    this.ui.setWaypoint(null);
    this.ui.setPrompt(null);

    this.currentLevel.dispose();
    this.currentLevel = new Level1(this.scene);
    this.controls.level = this.currentLevel;
    this._wireLevel();
    this.hud.setTorch(false, false);

    this.player.reset();
    this._resetProgress();
    this._stage = -1;

    const camera = this.camera.instance;
    camera.position.set(0, 3, 0);
    camera.lookAt(0, 3, -10);

    this.controls.instance.enabled = true;
    this.controls.lock();
    this.reticle.classList.add('visible');
    this.state = 'WAKING';
    this.ui.playWakeUp().then(() => {
      if (this.state === 'WAKING') this.state = 'PLAYING';
    });

    this.camAnim = null;
    this.savedCam = null;
    this._leavingRingPuzzle = false;
    this.ringCloseBtn.style.display = 'none';
  }

  // ---------------------------------------------------------
  // The circuit puzzle: "Overload"
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
    this.checkpoint.copy(this.camera.instance.position); // he is revived right here
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

  // Power reached a live fuse: it zaps, and keeps zapping until it is cut off
  onPuzzleZap() {
    this.player.zaps++;
    this.audio.zap();
    this.currentLevel.mistakeSparks();
    if (this.damagePlayer(ZAP_DAMAGE)) return;

    // ARIA has something to say about the first zap, and about the fourth
    if (this.player.zaps === 1) this.ariaSays(ARIA_PUZZLE_LINES.zap1, { pauseCountdown: true });
    else if (this.player.zaps === 4) this.ariaSays(ARIA_PUZZLE_LINES.zap2, { pauseCountdown: true });
  }

  // The countdown hit zero: the generator trips and shocks Voss
  async onPuzzleOverload() {
    const level = this.currentLevel;
    this.player.overloads++;
    this.audio.stopHum(0.15);
    this.audio.blackout();
    level.setStress(1);
    level.overload(); // sparks, red rings, 3 seconds of blackout (failures++)
    this.puzzle.flashOverload();
    this.ui.flashOverload();
    if (this.damagePlayer(OVERLOAD_DAMAGE)) return; // the shock was too much

    await sleep(1500);
    if (!this._puzzleUsable()) return; // the player stepped away meanwhile

    // ARIA reacts, with a joke. The second time she also helps, honestly: the
    // third overload in a row would be fatal, so the hint has to come before it.
    const line = level.failures === 1 ? ARIA_PUZZLE_LINES.overload1 : ARIA_PUZZLE_LINES.overload2;
    await this.ariaSays(line);
    if (!this._puzzleUsable()) return;

    // Let the blackout finish, then a fresh circuit with a little more time
    await sleep(Math.max(0, level._blackoutUntil - level.time) * 1000);
    if (!this._puzzleUsable()) return;
    level.setStress(0);
    this.puzzle.reset({ timeLimit: this._puzzleSeconds() });
    this.audio.startHum();
  }

  // Called from the click that completed the circuit, so the mouse can be
  // captured again right away
  onPuzzleSolved() {
    const level = this.currentLevel;
    this.player.puzzlesSolved++;
    this.player.heal(HEAL_PER_REPAIR);
    this.audio.stopHum(0.2);
    this.audio.success();
    level.setStress(0);
    level.partialRepair(); // the wiring holds: sparks and a partial brightening; the rings are next

    this.controls.instance.enabled = true;
    this.controls.lock();

    (async () => {
      await sleep(900);
      if (this.state !== 'PUZZLE') return; // died or stepped away meanwhile
      this.puzzle.close();
      this.reticle.classList.add('visible');
      this.state = 'PLAYING';
      this.ui.showToast('Circuit repaired. The relay rings are next.');
      await this.ariaSays(ARIA_PUZZLE_LINES.success);
    })();
  }

  // All the relay rings are lined up: the lights surge back on, floor by floor
  onRelayAligned() {
    this.player.puzzlesSolved++;
    this.player.heal(HEAL_PER_REPAIR);
    this.audio.surge();
    this.ui.showToast('Relay aligned. Power fully restored.');
    this.ariaSays(ARIA_PUZZLE_LINES.relayDone);
  }

  _createRingPuzzleUI() {
  const btn = document.createElement('button');
  btn.textContent = '✕ Close (E)';
  Object.assign(btn.style, {
    position: 'fixed', top: '20px', right: '20px', zIndex: 10, display: 'none',
    padding: '8px 14px', background: '#0b1a22', color: '#66ddff',
    border: '1px solid #66ddff', borderRadius: '6px', cursor: 'pointer',
    font: '14px monospace',
  });
  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // must not count as a ring click
    this.exitRingPuzzle();
  });
  document.body.appendChild(btn);
  this.ringCloseBtn = btn;
}

enterRingPuzzle() {
  const puzzle = this.currentLevel.ringPuzzle;
  if (this.state !== 'PLAYING' || !puzzle || puzzle.solved) return;

  const cam = this.camera.instance;
  this.state = 'RING_PUZZLE';
  document.exitPointerLock?.();
  this.reticle.classList.remove('visible');
  this.controls.stop();
  this.ui.hideToast();
  this.ringCloseBtn.style.display = 'block';
  this.savedCam = { pos: cam.position.clone(), quat: cam.quaternion.clone() };

  // Stand in front of the dials, far enough back that the whole panel fits
  const hub = puzzle.hub;
  const center = hub.getWorldPosition(new THREE.Vector3());
  const normal = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(hub.getWorldQuaternion(new THREE.Quaternion()));
  const size = puzzle.panel.geometry.parameters.height * hub.scale.y;
  const dist = (size * 1.3) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));

  const toPos = center.clone().addScaledVector(normal, dist);
  const m = new THREE.Matrix4().lookAt(toPos, center, new THREE.Vector3(0, 1, 0));
  const toQuat = new THREE.Quaternion().setFromRotationMatrix(m);
  this._startCamAnim(toPos, toQuat, null);
}

exitRingPuzzle({ relock = true } = {}) {
  if (this.state !== 'RING_PUZZLE' || !this.savedCam || this._leavingRingPuzzle) return;
  this._leavingRingPuzzle = true;
  this.ringCloseBtn.style.display = 'none';
  document.body.style.cursor = 'default';

  const { pos, quat } = this.savedCam;
  this._startCamAnim(pos, quat, () => {
    this.savedCam = null;
    this._leavingRingPuzzle = false;
    this.controls.instance.enabled = true;
    this.reticle.classList.add('visible');
    this.state = 'PLAYING';
    if (relock) {
      try { this.controls.lock(); } catch (e) { /* the first click re-locks */ }
    }
  });
}

_startCamAnim(toPos, toQuat, onDone) {
  const cam = this.camera.instance;
  this.camAnim = {
    t: 0, duration: 0.6,
    fromPos: cam.position.clone(), toPos: toPos.clone(),
    fromQuat: cam.quaternion.clone(), toQuat: toQuat.clone(),
    onDone,
  };
}

updateCamAnim(delta) {
  const a = this.camAnim;
  if (!a) return;
  a.t = Math.min(a.t + delta / a.duration, 1);
  const e = a.t * a.t * (3 - 2 * a.t); // smoothstep
  const cam = this.camera.instance;
  cam.position.lerpVectors(a.fromPos, a.toPos, e);
  cam.quaternion.copy(a.fromQuat).slerp(a.toQuat, e);
  if (a.t >= 1) {
    this.camAnim = null;
    a.onDone?.();
  }
}

updateRingPuzzleHover() {
  const puzzle = this.currentLevel.ringPuzzle;
  if (!puzzle || this.camAnim) return;
  this.raycaster.setFromCamera(this.mouse, this.camera.instance);
  const hit = this.raycaster.intersectObjects(puzzle.ringMeshes, true)[0];
  document.body.style.cursor = hit ? 'pointer' : 'default';
}

onRingPuzzleClick(event) {
  const puzzle = this.currentLevel.ringPuzzle;
  if (!puzzle || this.camAnim || puzzle.solved) return;
  this.mouse.set(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
  this.raycaster.setFromCamera(this.mouse, this.camera.instance);
  const hit = this.raycaster.intersectObjects(puzzle.ringMeshes, true)[0];
  if (hit && puzzle.handleClick(hit.object)) this.audio.clunk();
}

async onRingPuzzleSolved() {
  this.player.puzzlesSolved++;   // remove if you don't want this counted in the stats
  this.audio.success();
  await sleep(1200);             // let the green ticks show
  this.exitRingPuzzle();
  this.ui.showToast('Panel repaired. The wall monitor is coming back online.');
}

}

import * as THREE from 'three';
import { Renderer } from './core/Renderer.js';
import { PerfMonitor } from './core/PerfMonitor.js';
import { Physics } from './core/Physics.js';
import { precompile } from './core/precompile.js';
import { Camera } from './core/Camera.js';
import { Controls } from './core/Controls.js';
import { Level1 } from './levels/Level1.js';
import { Level2Session } from './levels/Level2Session.js';
import { HoseTestSession } from './level2/HoseTestSession.js';
import { HabitatSession } from './level2/HabitatSession.js';
import { KeypadUI } from './ui/KeypadUI.js';
import { UIManager } from './ui/UIManager.js';
import { HUD } from './ui/HUD.js';
import { Inventory } from './ui/Inventory.js';
import { ItemPreview } from './ui/ItemPreview.js';
import { IntroSequence, INTRO_LINES } from './story/IntroSequence.js';
import { AudioManager } from './audio/AudioManager.js';
import { Soundtrack } from './audio/Soundtrack.js';
import { PauseMenu } from './ui/PauseMenu.js';
import { DeckSession } from './level3/DeckSession.js';
import { settings } from './core/Settings.js';
import { pauseClock } from './core/PauseClock.js';
import { MoodLight } from './graphics/MoodLight.js';
import { CircuitPuzzle } from './puzzles/CircuitPuzzle.js';
import { PlayerStats } from './player/PlayerStats.js';
import { vossVoice } from './audio/VossVoice.js';
import { preloadVoices } from './audio/AudioCache.js';

// The goal shown top-left for each stage of the opening
const OBJECTIVES = [
  'Fix the wall panel to turn on monitor',
  "Find ARIA's glowing monitor and talk to her",
  'Find the torch on the floor',
  'Repair the generator circuit',
  'Turn the relay rings until every marker lines up with the rail',
  'Find the override code and use the security keypad',
  'Step into the lift and press the call panel to go down'
];

//TEMP access code
const ELEVATOR_ACCESS_CODE = '441009';

// Circuit puzzle timing: each failed attempt adds a little time, up to a cap,
// so it never becomes frustrating
const PUZZLE_BASE_SECONDS = 40;
const PUZZLE_BONUS_PER_FAILURE = 5;
const PUZZLE_MAX_BONUS = 10;
// After a failed attempt ARIA marks the next junctions to turn on the fresh circuit: how many,
// and for how long (seconds)
const PUZZLE_HINT_TILES = [0, 3, 5];
const PUZZLE_HINT_SECONDS = 14;

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
  // (no recording yet: shown as a subtitle with her talking face)
  hint1:    { clip: 'puzzle-hint', expression: 'bubbly',
              text: "Let me help. I've marked the first junctions you need to turn. Start at the battery, follow my marks, and watch the copper light up." },
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

// The lift answers to nobody but its manual emergency override — hardwired
// with no network connection, so ARIA cannot open this one door the way she
// opens everything else. The code is stencilled on a maintenance tag left on
// the long desk behind ARIA's wall. Clips go in public/assets/audio/aria/<clip>.mp3;
// until recorded the lines show as subtitles with the talking face.
const ARIA_OVERRIDE_LINES = {
  // Said the first time Voss reads the maintenance tag
  tag: {
    clip: 'override-1', expression: 'sly',
    text: "Ah, you found the override tag! Hardwired. No network, no me. If the station's systems fail, a human types the code in by hand. Which, given the circumstances, is now you."
  },
  // Said after a wrong code at the keypad
  hint: {
    clip: 'tag-hint', expression: 'bubbly',
    text: "Wrong code, Voss. The lift only answers to the manual override, and maintenance wrote that down the old way: an orange tag left on the desk in the room behind my wall. Look around. You found the torch — you can find a tag."
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Level 1's automatic quality steps, best first (see PerfMonitor): effects go before resolution
// drops far, as a blurry picture is worse than slightly simpler lighting
const LEVEL1_QUALITY = [
  { scale: 1, lights: 4, parallax: true },
  { scale: 0.9, lights: 4, parallax: true },
  { scale: 0.9, lights: 3, parallax: false },
  { scale: 0.8, lights: 3, parallax: false },
  { scale: 0.75, lights: 2, parallax: false },
  { scale: 0.65, lights: 2, parallax: false },
  { scale: 0.55, lights: 2, parallax: false }
];

const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export class Game {
  constructor() {
    // INIT, WAKING, PLAYING, KEYPAD, RETURNING, DIALOGUE, TUTORIAL, PUZZLE, INVENTORY, DEAD, GAME_OVER, DEPARTING
    this.state = 'INIT';
    this.lastTime = performance.now();
    // ?level=2 in the address starts straight in level 2, at the elevator (for testing)
    this.startLevel = new URLSearchParams(window.location.search).get('level');
    // the first level's recorded lines start downloading now (during the opening), so they play
    // the moment they are said
    preloadVoices(this.startLevel === '3' ? 3 : this.startLevel === '2' ? 2 : 1);

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this._stage = -1;
    this._wpVec = new THREE.Vector3();
    this._wpCam = new THREE.Vector3();
    this._wpInfo = { x: 0, y: 0, angle: 0, onScreen: true, label: '', distance: 0 };

    this.interactionDistance = 4;
    this.keypadTransitionDuration = 0.38;
    this.keypadTransition = null;
    this.keypadReturnPose = null;
    this._keypadWorldPos =
      new THREE.Vector3();
    this._keypadNormal =
      new THREE.Vector3();
    this._keypadWorldQuat =
      new THREE.Quaternion();
    this._focusLookTarget =
      new THREE.Vector3();
    this._focusObject =
      new THREE.Object3D();
    

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
    this._overrideIntroSeen = false;
    this._keypadFailures = 0;
    this._tagHintGiven = false;
    this._tagReadQueued = false; // a tag read is waiting for ARIA to finish
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
    // The physics engine (Rapier) is a separate download: start it now, alongside the level's
    // models, so it is ready for whichever level needs it
    this._physicsLoaded = Physics.preload();

    // The music and the lighting mood belong to the whole game (they carry from level to level).
    // The music is your own files (see Soundtrack.js); it may only start after a click, and
    // init() runs from the start button.
    this.music = new Soundtrack();
    // the pause menu (Esc / P / the corner button) and the player's options
    this.pauseMenu = new PauseMenu({
      state: () => this.state,
      pause: () => this.pause(),
      resume: () => this.resume(),
      restartLevel: () => this.restartLevel(),
      toTitle: () => { window.location.href = window.location.pathname; }
    });
    settings.onChange(() => this.applySettings());
    this.mood = new MoodLight({ base: 0.74 });
    this._angerUntil = 0;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') this.ui?.showToast?.(this.music.toggleMute() ? 'Music off (M)' : 'Music on (M)', 1200);
      // F8: preview ARIA snapping (red lights). Handy for the demo and while tuning.
      if (e.code === 'F8') { e.preventDefault(); this.ariaAnger(5); }
    });

    if (this.startLevel === '2' || this.startLevel === '3' || this.startLevel === 'hose' || this.startLevel === 'reactor') {
      this._initLevel2();
      return;
    }

    // Load first level
    this.currentLevel = new Level1(this.scene, this.camera.instance, { accessCode: ELEVATOR_ACCESS_CODE });
    // FXAA instead of MSAA, and a resolution that adapts to the machine (F3 shows the frame rate)
    this.renderer.usePost(this.scene, this.camera.instance);
    this.perf = new PerfMonitor({
      steps: LEVEL1_QUALITY,
      onStep: (q) => {
        this.renderer.setScale(q.scale);
        this.currentLevel?.setQuality?.(q);
      }
    });

    // Controls
    this.controls = new Controls(this.camera.instance, document.body, this.currentLevel, { viewLocked: true });

    // Overlay UI, sound, the opening conversation and the circuit puzzle
    const uiRoot = document.getElementById('ui-layer');
    
    this.keypadUI = new KeypadUI({
      onSubmit: (code) => this.onKeypadSubmit(code),
      onCancel: () => this.exitKeypadMode()
    });

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
    this.raycaster.far = 8;        // nothing is used from further away (cheaper: far objects are skipped)
    this._reticleTick = 0;
    this.center = new THREE.Vector2(0, 0);
    this.reticle = document.getElementById('reticle');

    // Kept as named references so they can be taken back off again when level 1
    // is torn down for level 2, which installs its own input handling.
    this._onDocClick = (e) => this.onClick(e);
    this._onDocKeyDown = (e) => this.onKeyDown(e);
    document.addEventListener('click', this._onDocClick);
    document.addEventListener('keydown', this._onDocKeyDown);

    this.mouse = new THREE.Vector2();
    this.camAnim = null;
    this.savedCam = null;
    this._leavingRingPuzzle = false;
    this._departing = false;   // the lift doors are shutting on the way to level 2
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
    // ?level=2: level 2, the habitat atrium
    // ?level=3: level 3, the drowned deck
    // ?level=hose: the coolant hose test room
    // ?level=reactor: the old cargo atrium, kept to become Level 3's reactor room
    this._mountLevel2(this.startLevel);
    window.addEventListener('resize', () => this.onResize());
    this.startLoop();
  }

  // Build one level 2 session. Split out of _initLevel2 because the lift out of
  // the control room reaches level 2 the same way: there the renderer, camera,
  // UIManager and the animation loop all already exist and must not be made a
  // second time (startLoop is a recursive rAF with no way to cancel it, and
  // UIManager's constructor appends DOM).
  _mountLevel2(kind) {
    const sessions = { '2': HabitatSession, '3': DeckSession, hose: HoseTestSession, reactor: Level2Session };
    this.startLevel = kind;
    this.music?.setLevel(kind === '3' ? 3 : 2);
    if (kind === '3') preloadVoices(3);
    else if (kind === '2') { preloadVoices(2); preloadVoices(3); }   // (Level 3's queue up behind Level 2's)
    this.level2 = new sessions[kind](this);
  }

  // ---------------------------------------------------------
  // Leaving level 2: Voss dropped through the hatch (the screen is already black). Level 2 is
  // torn down (its scene, physics, listeners and screens) and level 3 is built in its place.
  // (game.level2 holds whichever session is running: from here on, level 3's.)
  // ---------------------------------------------------------
  enterLevel3() {
    if (this._toLevel3) return;
    this._toLevel3 = true;
    this.state = 'DEPARTING';
    this.level2?.dispose?.();
    this.level2 = null;
    const keep = [
      document.getElementById('welcome-screen'),
      this.reticle,
      this.ui.blink, this.ui.prompt, this.ui.toast,
      this.ui.objective, this.ui.waypoint, this.ui.overloadBanner, this.ui.dialogue
    ].filter(Boolean);
    document.getElementById('ui-layer').replaceChildren(...keep);
    this.ui.hideDialogue();
    this.ui.hideToast();
    this.ui.setObjective(null);
    this.ui.setWaypoint(null);
    this.ui.setPrompt(null);
    this.state = 'PLAYING';
    this._mountLevel2('3');
  }

  // ---------------------------------------------------------
  // Leaving level 1: Voss pressed the lift's call panel
  // ---------------------------------------------------------

  // The doors are shutting. Hold level 1 in place for as long as they take,
  // then swap the level out from under the running game.
  onElevatorDepart(seconds = 0) {
    if (this.level2Mode || this._departing) return;
    this._departing = true;

    this.controls.stop();
    this.controls.instance.unlock();
    this.state = 'DEPARTING';

    this.reticle.classList.remove('visible');
    this.ui.setPrompt(null);
    this.ui.setWaypoint(null);
    this.ui.setObjective(null);
    this.hud.setVisible(false);
    this.audio.stopHum(0.6);
    this.ui.showToast('Descending to the habitat deck...', seconds * 1000 + 2500);

    setTimeout(() => this._leaveForLevel2(), seconds * 1000 + 700);
  }

  _leaveForLevel2() {
    if (!this._departing) return;

    // Level 1's input would otherwise keep firing at a level that no longer
    // exists; HabitatSession puts its own click-to-lock handler on instead.
    document.removeEventListener('click', this._onDocClick);
    document.removeEventListener('keydown', this._onDocKeyDown);

    this.puzzle?.close?.();
    this.inventory?.close?.();
    this.ui.hideDialogue();
    this.ui.hideToast();
    this.currentLevel?.dispose?.();
    this.currentLevel = null;
    this.controls.disposeBody();
    this.ringCloseBtn?.remove();
    this.ringCloseBtn = null;

    // Everything level 1 put on screen goes, except what was already in the HTML
    // and the UIManager elements level 2 reuses.
    const keep = [
      document.getElementById('welcome-screen'),
      this.reticle,
      this.ui.blink, this.ui.prompt, this.ui.toast,
      this.ui.objective, this.ui.waypoint, this.ui.overloadBanner, this.ui.dialogue
    ].filter(Boolean);
    document.getElementById('ui-layer').replaceChildren(...keep);

    // level 2 brings its own post-processing and frame counter
    this.perf?.dispose();
    this.perf = null;
    this.renderer.disposePost();

    this.level2Mode = true;
    this.state = 'PLAYING';
    this._mountLevel2('2');
    this._departing = false;
  }

  updateLevel2(delta) {
    this.level2.update(delta);
  }

  // ---------------------------------------------------------
  // Pause menu (Esc), and the player's options
  // ---------------------------------------------------------

  // the controls of whichever level is running
  _activeControls() {
    return this.level2Mode ? this.level2?.controls : this.controls;
  }

  pause() {
    if (this.state !== 'PLAYING') return;
    this.state = 'PAUSED';
    pauseClock.paused = true;
    const c = this._activeControls();
    c?.stop?.();
    if (c?.instance) {
      c.instance.enabled = false;
      c.instance.unlock?.();
    }
    this.reticle.classList.remove('visible');
    if (this.level2Mode) this.level2?.onPause?.();
    else this.currentLevel?.ariaManager?.pause?.();
    vossVoice.pause();
    this.music?.setPaused(true);
    this.pauseMenu.open();
  }

  resume() {
    if (this.state !== 'PAUSED') return;
    this.pauseMenu.close();
    pauseClock.paused = false;
    const c = this._activeControls();
    c?.stop?.();
    if (c?.instance) c.instance.enabled = true;
    c?.lock?.();
    if (this.level2Mode) this.level2?.onResume?.();
    else this.currentLevel?.ariaManager?.resume?.();
    vossVoice.resume();
    this.music?.setPaused(false);
    this.state = 'PLAYING';
  }

  // Level 1 starts again in place; Level 2 reloads straight into its lift (until Level 2 can be
  // torn down and rebuilt in place)
  restartLevel() {
    if (this.level2Mode) {
      const debug = new URLSearchParams(window.location.search).has('debug');
      window.location.href = window.location.pathname + '?level=2' + (debug ? '&debug' : '');
      return;
    }
    this.pauseMenu.close();
    pauseClock.paused = false;
    this.music?.setPaused(false);
    this.state = 'PLAYING';
    this.restart();
  }

  // Apply the options: volumes, mouse speed, quality, the frame counter
  applySettings() {
    const s = settings;
    this.music?.setVolume(s.get('music'));
    this.audio?.setVolume(s.get('effects'));
    const garden = this.level2?.garden;
    if (garden) {
      garden.audio.volume = s.get('effects');
      if (garden.audio.master) garden.audio.master.gain.value = 0.6 * s.get('effects');
    }
    this.currentLevel?.ariaManager?.applyVolume?.();
    this.level2?.aria?.applyVolume?.();
    vossVoice.applyVolume();
    for (const c of [this.controls, this.level2?.controls]) if (c?.instance) c.instance.pointerSpeed = s.get('sensitivity');
    document.body.classList.toggle('hide-fps', !s.get('fps'));
    this.perf?.setMode(s.get('quality'));
    this.level2?.setQualityMode?.(s.get('quality'));
  }

  // ---------------------------------------------------------
  // Mood: what the score and the lighting are doing right now
  // ---------------------------------------------------------

  // ARIA snaps: the room goes red and her face goes red on every screen, for `seconds`.
  // (The story decides when; F8 previews it.)
  ariaAnger(seconds = 5) {
    this._angerUntil = performance.now() + seconds * 1000;
    this.mood.alert(seconds, 1);
    const aria = this.level2Mode ? this.level2?.aria : this.currentLevel?.ariaManager;
    aria?.updateAriaState?.('hostile');
    clearTimeout(this._calmTimer);
    this._calmTimer = setTimeout(() => aria?.updateAriaState?.('neutral'), seconds * 1000);
  }

  // Hold the music on one mood for a while, whatever the player is doing (a scripted beat,
  // such as ARIA's long silence in the lab)
  holdMusic(mood, seconds) {
    this._musicHold = { mood, until: performance.now() + seconds * 1000 };
  }

  // Called every frame: picks the music's mood from what the player is doing
  _steerMusic() {
    const music = this.music;
    if (!music || !this.mood) return;
    const s = this.state;
    let mood = 'calm';
    let tension = 0.15;
    if (performance.now() < this._angerUntil) { mood = 'angry'; tension = 1; }
    else if (this._musicHold && performance.now() < this._musicHold.until) { mood = this._musicHold.mood; tension = 0.5; }
    else if (this.level2Mode && this.level2?.musicMood) {
      // a level 2 scene asks for its own mood (the garden fight: pressure)
      mood = this.level2.musicMood;
      tension = this.level2.musicTension ?? 0.5;
      music.setMood(mood);
      this.mood.tension += (tension - this.mood.tension) * 0.03;
      return;
    }
    else if (s === 'DEAD' || s === 'GAME_OVER') { mood = 'silence'; tension = 0.6; }
    else if (!this.level2Mode && s === 'PUZZLE') {
      // a blackout after an overload is silent; otherwise the pressure follows the countdown
      mood = this.puzzle.frozen ? 'silence' : 'pressure';
      tension = 0.4 + 0.5 * (this.puzzle.stress || 0);
    } else if (!this.level2Mode && this.currentLevel?.inCell) { mood = 'uneasy'; tension = 0.35; }
    music.setMood(mood);
    this.mood.tension += (tension - this.mood.tension) * 0.03;
  }

  // Connect a freshly built level to the UI, sound and story
  _wireLevel() {
    const level = this.currentLevel;
    level.mood = this.mood;
    this.intro = new IntroSequence(this.ui, level.ariaManager);
    level.onTalkToAria = () => this.startIntroDialogue();
    level.onBrickPickedUp = () => this.ui.showToast('Click throws the brick. E drops it.', 5000);
    level.onHandleTurned = () => this.audio.clunk();
    level.onTorchPickedUp = () => {
      this.inventory.add('torch');
      this.hud.setTorch(true, true);
      this.ui.showToast('Torch picked up. F switches it on or off. I opens your inventory.');
    };
    level.onInspectGenerator = () => this.startPuzzle();
    level.onUseKeypad = (keypad) => {
      this.enterKeypadMode(keypad);
    };
    level.onReadTag = () => this.readMaintenanceTag();
    level.onLockedHint = (text) => this.ui.showToast(text);
    level.onRingTurned = () => this.audio.clunk();
    level.onRelayAligned = () => this.onRelayAligned();
    level.onOpenRingPuzzle = () => this.enterRingPuzzle();
    level.onRingPuzzleSolved = () => this.onRingPuzzleSolved();
    level.onElevatorDepart = (seconds) => this.onElevatorDepart(seconds);
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

  // ---------------------------------------------------------
  // The opening cinematic (intro/intro-cinematic.js) plays first: no menu, no start button. The
  // game is built once the screen has gone black (building it stalls the page for a second or
  // so, which would make the video stutter), draws nothing until the cinematic lets it, and Voss
  // wakes up through the cinematic's waking-eyes shader. ARIA greets him, and the first click takes
  // the mouse (a browser needs a click for that).
  // ---------------------------------------------------------
  beginOpening() {
    this.renderHeld = true;
    this.init();
    this.state = 'WAKING';
    this.ui.blink.style.display = 'none';          // (the cinematic's shader wakes him up instead)
    this._musicWasMuted = this.music.muted;
    this.music.muted = true;                       // (the video carries its own sound)
    this._lockHint = document.createElement('div');
    this._lockHint.id = 'lock-hint';
    this._lockHint.textContent = 'Click to look around';
    document.getElementById('ui-layer').appendChild(this._lockHint);
    // ready once the first room is built, its shaders compiled (behind the black screen, so they do
    // not stall his first look round) and the physics engine (for Level 2) has loaded
    const level = this.currentLevel;
    return Promise.all([level.ready.then(() => this._precompileLevel1()), this._physicsLoaded]);
  }

  _precompileLevel1() {
    const composer = this.renderer.composer;
    if (!composer) return null;
    return precompile(this.renderer.instance, this.scene, this.camera.instance, composer.renderTarget1)
      .catch((e) => console.warn('Level 1: shaders not precompiled.', e));
  }

  // The eyes are open: hand him over
  endOpeningWake() {
    if (this.controls) this.controls.instance.enabled = true;
    if (this.state === 'WAKING') {
      this.state = 'PLAYING';
      this.reticle.classList.add('visible');
    }
    if (this.music) this.music.muted = this._musicWasMuted;
    this._wantLockHint = true;
  }

  // A beat after waking, ARIA's first recorded line (the rest of that exchange is at her monitor)
  async openingAriaLine() {
    if (this.state !== 'PLAYING' || !this.currentLevel || this.intro.active) return;
    this.state = 'DIALOGUE';
    this.reticle.classList.remove('visible');
    this.controls.stop();
    await this.ariaSays(INTRO_LINES[0].aria);
    this.intro.firstAriaSaid = true;
    this.controls.instance.enabled = true;          // (stop() switched the mouse and keys off for the line)
    if (this.state === 'DIALOGUE') {
      this.state = 'PLAYING';
      this.reticle.classList.add('visible');
    }
  }

  // "Click to look around" until the mouse has been taken once
  _updateLockHint() {
    if (!this._lockHint) return;
    if (this.controls?.instance.isLocked) this._wantLockHint = false;
    this._lockHint.classList.toggle('visible', !!this._wantLockHint && this.state === 'PLAYING');
  }

  resumePlayerControls() {
    if (!this.controls) return;

    this.controls.instance.enabled = true;
    // if (!this.controls.instance.isLocked) {
    //   this.controls.lock();
    // }

    this.state = 'PLAYING';
    this.reticle.classList.add('visible');
  }

  enterKeypadMode(keypad) {
    if (this.state !== 'PLAYING' || !keypad) return;

    const cam = this.camera.instance;

    this.controls.stop();
    this.controls.instance.unlock();

    this.state = 'KEYPAD';

    this.reticle.classList.remove('visible');
    this.ui.setPrompt(null);
    this.ui.setWaypoint(null);

    keypad.updateWorldMatrix(true, true);

    // Save the exact camera pose so we can smoothly return to it.
    this.keypadReturnPose = {
      position: cam.position.clone(),
      quaternion: cam.quaternion.clone()
    };

    /*
    * Frame the actual keypad geometry rather than moving to a
    * hard-coded distance from its object origin.
    */
    const box = new THREE.Box3().setFromObject(keypad);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    /*
    * Keypad face points along its local +Z.
    * Convert that direction into world space.
    */
    const worldQuat = keypad.getWorldQuaternion(
      new THREE.Quaternion()
    );

    const normal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(worldQuat)
      .normalize();

    /*
    * Same principle as the ring puzzle:
    * calculate a camera distance from the object's physical size
    * and the camera's FOV.
    */
    const verticalFov =
      THREE.MathUtils.degToRad(cam.fov);

    const horizontalFov =
      2 * Math.atan(
        Math.tan(verticalFov / 2) * cam.aspect
      );

    const verticalDistance =
      size.y /
      (2 * Math.tan(verticalFov / 2));

    const horizontalDistance =
      size.x /
      (2 * Math.tan(horizontalFov / 2));

    // Slight padding so the keypad does not fill the whole screen.
    const distance =
      Math.max(
        verticalDistance,
        horizontalDistance
      ) * 1.35;

    const toPos = center
      .clone()
      .addScaledVector(normal, distance);

    /*
    * Exactly the same look-at approach used by the ring puzzle.
    */
    const matrix = new THREE.Matrix4().lookAt(
      toPos,
      center,
      new THREE.Vector3(0, 1, 0)
    );

    const toQuat =
      new THREE.Quaternion()
        .setFromRotationMatrix(matrix);

    /*
    * Use the ring puzzle camera animation instead of the
    * separate keypadTransition system.
    */
    this._startCamAnim(
      toPos,
      toQuat,
      () => {
        if (this.state === 'KEYPAD') {
          this.keypadUI.open();
        }
      }
    );
  }

  exitKeypadMode() {
    if (this.state !== 'KEYPAD') return;

    this.keypadUI.close();

    if (!this.keypadReturnPose) {
      this.state = 'PLAYING';
      this.controls.instance.enabled = true;
      this.reticle.classList.add('visible');
      return;
    }

    const returnPose = this.keypadReturnPose;

    this.state = 'RETURNING';

    this._startCamAnim(
      returnPose.position,
      returnPose.quaternion,
      () => {
        this.keypadReturnPose = null;

        this.controls.instance.enabled = true;

        this.state = 'PLAYING';

        this.reticle.classList.add('visible');
      }
    );
  }
  
  onKeypadSubmit(code) {
    console.log(`Six-digit keypad input received: ${code}`);

    if (code === ELEVATOR_ACCESS_CODE) {
      console.log('ACCESS GRANTED');

      this.currentLevel.openElevatorDoor?.();

      this.ui.showToast('ACCESS GRANTED');
    } else {
      console.log('ACCESS DENIED');

      this.ui.showToast('ACCESS DENIED');

      // One wrong code and ARIA sends Voss looking for the tag
      this._keypadFailures++;
      if (!this._tagHintGiven) {
        this._tagHintGiven = true;
        this.currentLevel.tagHintGiven = true;   // from now on the waypoint can confirm the tag once Voss is near it
        this.ariaSays(ARIA_OVERRIDE_LINES.hint);
      }
    }

    this.exitKeypadMode();
  }

  updateCameraTransition(delta) {
    if (!this.keypadTransition) return;

    const camera = this.camera.instance;
    const transition = this.keypadTransition;

    transition.elapsed += delta;

    const rawT = Math.min(
      1,
      transition.elapsed /
        this.keypadTransitionDuration
    );

    /*
    * Smoothstep:
    * slow at the beginning,
    * faster in the middle,
    * slow at the end.
    */
    const t =
      rawT *
      rawT *
      (3 - 2 * rawT);

    // Position
    camera.position.lerpVectors(
      transition.fromPosition,
      transition.toPosition,
      t
    );

    // Rotation
    camera.quaternion.slerpQuaternions(
      transition.fromQuaternion,
      transition.toQuaternion,
      t
    );

    // Slight zoom
    camera.fov = THREE.MathUtils.lerp(
      transition.fromFov,
      transition.toFov,
      t
    );

    camera.updateProjectionMatrix();

    if (rawT < 1) return;

    /*
    * Transition finished.
    */
    const mode = transition.mode;

    this.keypadTransition = null;

    if (mode === 'focus') {
      /*
      * Now that we've physically zoomed toward the
      * keypad, display the large interactive UI.
      */
      this.keypadUI.open();
    }
    else if (mode === 'return') {
      this.keypadReturnPose = null;

      this.resumePlayerControls();
    }
  }

  startLoop() {
    this.applySettings();
    const loop = (time) => {
      requestAnimationFrame(loop);
      const delta = (time - this.lastTime) / 1000;
      this.lastTime = time;
      // (behind the opening cinematic nothing is drawn, so the video has the machine to itself)
      if (this.renderHeld) return;
      if (this.state !== 'PAUSED') this.mood?.update(Math.min(delta, 0.05));
      this._steerMusic();
      this.pauseMenu?.update(this.state);
      if (this.level2Mode) {
        this.updateLevel2(Math.min(delta, 0.05));
      } else {
        this.update(delta);
        this.currentLevel?.ariaManager?.renderHead(this.renderer.instance);
        this.perf?.update(delta, this.state === 'PLAYING');
      }
      // (level 1's third person: the camera behind Voss for the frame only, then back at his eyes)
      if (!this.level2Mode) this.controls?.showArms?.(this._inPlainPlay());
      const behind = !this.level2Mode && this.controls?.beginThirdPerson?.(this._inPlainPlay());
      this.renderer.render(this.scene, this.camera.instance);
      if (behind) this.controls.endThirdPerson();
    };
    requestAnimationFrame(loop);
  }

  update(delta) {
    // Between disposing level 1 and mounting level 2 there is no level to update
    if (!this.currentLevel) return;

    const live = this.state === 'PLAYING' || this.state === 'WAKING' || this.state === 'KEYPAD' || 
                 this.state === 'RETURNING' || this.state === 'DIALOGUE' ||
                 this.state === 'TUTORIAL' || this.state === 'PUZZLE' || this.state === 'INVENTORY' ||
                 this.state === 'DEAD' || this.state === 'RING_PUZZLE' ||
                 this.state === 'DEPARTING';

    if (this.state === 'PLAYING') {
      this.controls.update(delta);
    }
  
    if (live && this.currentLevel) {
      this.currentLevel.update(delta, this.camera.instance.position, this.camera.instance);
    }
    if (this.state === 'PLAYING') this.controls.updateBody(delta);
    if (live && this.state !== 'DEAD' && this.state !== 'WAKING') {
      this.player.playSeconds += delta;
    }

    // The status display appears once the intro conversation is over
    this.hud.setVisible(!this.currentLevel.talkEnabled && this.state !== 'GAME_OVER' &&
                        this.state !== 'INIT' && this.state !== 'DEPARTING');
    this.hud.update(this.player);

    // The torch in the corner slot (and on the inventory screen) is a live 3D model
    if (this.preview.ready && this.currentLevel.hasTorch) {
      const targets = [this.hud.torchCanvas];
      if (this.inventory.open && this.inventory.torchCanvas) targets.push(this.inventory.torchCanvas);
      this.preview.draw(targets, delta, this.currentLevel.flashlightOn);
    }

    if (this.state === 'PLAYING') {
      this.updateReticle();
      // (the waypoint is placed on screen from where the frame is drawn)
      const behind = this.controls.beginThirdPerson(this._inPlainPlay());
      this.updateGuidance(delta);
      if (behind) this.controls.endThirdPerson();
    } else {
      this.ui.setPrompt(null);
      this.ui.setWaypoint(null);
      if (this.state === 'PUZZLE') this.updatePuzzle(delta);
      if (this.state === 'RING_PUZZLE') this.updateRingPuzzleHover();
    }
    this._updateLockHint();
    this.updateCamAnim(delta);   // last line of update()
  }

  // ---------------------------------------------------------
  // Guidance: what to do next, and where it is
  // ---------------------------------------------------------
  updateGuidance(delta) {
    const level = this.currentLevel;

    // Stage 0: Turn on Monitor, 1: talk to ARIA, 2: find the torch, 3: repair the circuit,
    // 4: align the relay rings, 5: open the lift with the keypad, 6: ride the lift down
    let stage;
    if (level.inCell) stage = 'cell';   // the starting cell: its objective changes within the stage
    else if (!level.ringPuzzleSolved) stage = 0;
    else if (level.talkEnabled) stage = 1;
    else if (!level.hasTorch) stage = 2;
    else if (!level.cablesFixed) stage = 3;
    else if (!level.relaySolved) stage = 4;
    else if (!level.doorOpened) stage = 5;
    else stage = 6;

    if (stage === 'cell') {
      const text = level.getCellObjective();
      if (stage !== this._stage || text !== this._cellObjective) {
        this._stage = stage;
        this._cellObjective = text;
        this.ui.setObjective(text);
      }
    } else if (stage !== this._stage) {
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
    info.distance = this.controls.eyePosition.distanceTo(target.position);
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
    // Testing the ray against everything clickable was the most expensive thing the game did on
    // the CPU each frame (~10 ms on a UHD 620 laptop): every third frame is plenty for a prompt
    this._reticleTick = (this._reticleTick + 1) % 3;
    if (this._reticleTick !== 0) return;
    const hit = this._pickInteractable();
    this.reticle.classList.toggle('active', !!hit);
    this.ui.setPrompt(hit ? this.currentLevel.getInteractPrompt?.(hit.object, hit.distance) : null);
  }

  // What the player is aiming at. The exact ray under the crosshair first; if it misses, aim
  // assist: anything usable within a few degrees of the crosshair (more for big things), in reach
  // and not behind a wall. So aiming at an object's floating marker, or just beside a small thing
  // like the brick, still works. (Objects marked userData.noAimAssist, like the relay rings,
  // where you must pick one ring, need the exact ray.)
  _pickInteractable() {
    // In third person: along the crosshair's line, from beside Voss's head
    const aimed = this.controls?.beginThirdPerson?.(this._inPlainPlay(), 'aim');
    try {
      return this._pickAtCrosshair();
    } finally {
      if (aimed) this.controls.endThirdPerson();
    }
  }

  // Level 1's third person and first-person arms show only in plain play: puzzles, the keypad and
  // camera moves are seen from his eyes, with nothing in the way
  _inPlainPlay() {
    return this.state === 'PLAYING' && !this.camAnim;
  }

  _pickAtCrosshair() {
    const level = this.currentLevel;
    const cam = this.camera.instance;
    const targets = level.interactables || [];
    this.raycaster.setFromCamera(this.center, cam);
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    if (hit) return hit;

    const dir = cam.getWorldDirection(this._aimDir || (this._aimDir = new THREE.Vector3()));
    const box = this._aimBox || (this._aimBox = new THREE.Box3());
    const centre = this._aimCentre || (this._aimCentre = new THREE.Vector3());
    const to = this._aimTo || (this._aimTo = new THREE.Vector3());
    let best = null;
    let bestScore = 1;
    for (const object of targets) {
      if (object.userData.noAimAssist) continue;
      box.setFromObject(object);
      if (box.isEmpty()) continue;
      box.getCenter(centre);
      const radius = box.getSize(to).length() / 2;
      to.subVectors(centre, cam.position);
      const distance = to.length();
      if (distance < 0.01 || distance > this.raycaster.far) continue;
      const allowed = Math.max(THREE.MathUtils.degToRad(8), Math.atan(radius / distance) + THREE.MathUtils.degToRad(4));
      const score = to.angleTo(dir) / allowed;
      if (score >= bestScore) continue;
      const reach = Math.max(0, distance - radius * 0.5);
      if (level.canInteract?.(object, reach) === false) continue;
      best = { object, distance: reach, point: centre.clone() };
      bestScore = score;
    }
    // not through walls (except things reached round an obstacle, like the cell door's handle)
    if (best && !best.object.userData.noLineOfSight && level._clearLineTo &&
        !level._clearLineTo(best.point, Math.max(0, best.distance - 0.1))) return null;
    return best;
  }

  // Interact with whatever is under the reticle (click or E)
  tryInteract(options = {}) {
    // Something in Voss's hands (the cell's brick): click throws it, E drops it
    if (this.currentLevel.handleHeldItem?.(options)) return;
    if (!options.fromKey) this.controls.reach();      // (a click, with nothing in hand: he reaches out)
    const hit = this._pickInteractable();
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

    if (this.state === 'KEYPAD') {
      if (event.code === 'Escape') {
        event.preventDefault();
        this.exitKeypadMode();
      }

      return;
    }
    // Enter skips whatever ARIA is saying, from almost anywhere (as in Levels 2 and 3; Space is jump)
    if (event.code === 'Enter' && this.ui.isAriaLine() &&
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
      if (event.code === 'KeyE') this.tryInteract({ fromKey: true });
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

  // Voss reads the maintenance tag on the workstation desk: the in-world source
  // of the override code. First time, ARIA explains why the lift is the one
  // thing on the station she cannot open for him.
  async readMaintenanceTag() {
    if (this.state !== 'PLAYING' || this._tagReadQueued) return;
    // ARIA finishing a line calls hideDialogue(), which would swallow the
    // Voss line mid-read and strand the dialogue state — queue the read
    // behind her instead of dropping it. The loop re-checks `speaking`
    // because another line can chain on before hers ends (skip, revive...).
    const aria = this.currentLevel.ariaManager;
    if (aria?.speaking) {
      this._tagReadQueued = true;
      while (aria.speaking) await aria.onceLineFinished();
      this._tagReadQueued = false;
      if (this.state !== 'PLAYING') return; // something took over while we waited
    }
    this.state = 'DIALOGUE';
    this.reticle.classList.remove('visible');
    this.controls.stop();

    const digits = ELEVATOR_ACCESS_CODE.split('').join(' ');
    await this.ui.showVossLine(
      `"EMERGENCY OVERRIDE. For use when station systems fail. Code: ${digits}. Do not remove." ...Well. That is convenient.`
    );
    this.ui.hideDialogue();

    this.controls.instance.enabled = true;
    this.reticle.classList.add('visible');
    this.state = 'PLAYING';

    if (!this._overrideIntroSeen) {
      this._overrideIntroSeen = true;
      await this.ariaSays(ARIA_OVERRIDE_LINES.tag);
    }
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
    this.currentLevel = new Level1(this.scene, this.camera.instance, { accessCode: ELEVATOR_ACCESS_CODE });
    if (this.perf) this.currentLevel.setQuality(this.perf.current);   // keep the quality the machine settled on
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
    this.mood.alert(2.4, 0.8);   // the alarm lights
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

    // ...and a hint on the new circuit: the first junctions to turn are marked. After the first
    // failure ARIA explains it (the second time her line above already has the advice).
    const marks = PUZZLE_HINT_TILES[Math.min(level.failures, PUZZLE_HINT_TILES.length - 1)];
    if (marks) this.puzzle.showHint(marks, PUZZLE_HINT_SECONDS);
    if (level.failures === 1) await this.ariaSays(ARIA_PUZZLE_LINES.hint1, { pauseCountdown: true });
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

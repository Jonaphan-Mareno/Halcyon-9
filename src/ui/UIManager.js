// In-game overlay UI: wake-up blink, interaction prompt and the dialogue box.
// All elements live inside #ui-layer, which lets clicks pass through, so the
// Game keeps handling clicks and calls advance() while a dialogue is open.

const TYPE_SPEED_MS = 28;

export class UIManager {
  constructor(root = document.getElementById('ui-layer')) {
    this.root = root;

    // Starts fully black so nothing flashes before the wake-up blink runs
    this.blink = this._create('div', 'blink-overlay');
    this.prompt = this._create('div', 'interact-prompt');
    this.toast = this._create('div', 'toast');
    this._toastTimer = null;

    // Objective line (top-left) and a marker pointing at what to do next
    this.objective = this._create('div', 'objective');
    this.objectiveLabel = this._create('div', 'objective-label', this.objective);
    this.objectiveLabel.textContent = 'OBJECTIVE';
    this.objectiveText = this._create('div', 'objective-text', this.objective);
    this.waypoint = this._create('div', 'waypoint');
    this.waypointArrow = this._create('div', 'waypoint-arrow', this.waypoint);
    this.waypointLabel = this._create('div', 'waypoint-label', this.waypoint);
    this.overloadBanner = this._create('div', 'overload-banner');
    this.overloadBanner.textContent = 'OVERLOAD';

    this.dialogue = this._create('div', 'dialogue-box');
    this.speakerEl = this._create('div', 'dialogue-speaker', this.dialogue);
    this.textEl = this._create('div', 'dialogue-text', this.dialogue);
    this.hintEl = this._create('div', 'dialogue-hint', this.dialogue);

    this._typeTimer = null;
    this._fullText = '';
    this._typing = false;
    this._advanceResolver = null;
  }

  _create(tag, id, parent = this.root) {
    const el = document.createElement(tag);
    el.id = id;
    parent.appendChild(el);
    return el;
  }

  // ---------------------------------------------------------
  // Wake-up: Voss surfacing from unconsciousness. Eyelids crack open
  // blurry, drop shut, open wider, blink heavily, then clear.
  // Resolves when the screen is fully visible.
  // ---------------------------------------------------------
  playWakeUp() {
    this.blink.style.display = 'block';
    const animation = this.blink.animate(
      [
        { opacity: 1,    backdropFilter: 'blur(16px)', offset: 0 },
        { opacity: 1,    backdropFilter: 'blur(16px)', offset: 0.12 },
        { opacity: 0.45, backdropFilter: 'blur(14px)', offset: 0.22 },
        { opacity: 1,    backdropFilter: 'blur(16px)', offset: 0.32 },
        { opacity: 1,    backdropFilter: 'blur(16px)', offset: 0.45 },
        { opacity: 0.15, backdropFilter: 'blur(9px)',  offset: 0.58 },
        { opacity: 0.85, backdropFilter: 'blur(9px)',  offset: 0.68 },
        { opacity: 0.85, backdropFilter: 'blur(8px)',  offset: 0.76 },
        { opacity: 0,    backdropFilter: 'blur(0px)',  offset: 1 }
      ],
      // delay: let the welcome screen finish fading out first (1.5s in CSS)
      { duration: 5600, delay: 1300, easing: 'ease-in-out', fill: 'both' }
    );
    return animation.finished.then(() => {
      this.blink.style.display = 'none';
    });
  }

  // ---------------------------------------------------------
  // "Click to talk" prompt shown while looking at something interactive
  // ---------------------------------------------------------
  setPrompt(text) {
    if (text) {
      if (this.prompt.textContent !== text) this.prompt.textContent = text;
      this.prompt.classList.add('visible');
    } else {
      this.prompt.classList.remove('visible');
    }
  }

  // The current goal, shown top-left. Pass null to hide it.
  setObjective(text) {
    if (!text) {
      this.objective.classList.remove('visible');
      return;
    }
    if (this.objectiveText.textContent !== text) {
      this.objectiveText.textContent = text;
      // A short pulse so a change of objective is noticed
      this.objective.classList.remove('changed');
      void this.objective.offsetWidth;
      this.objective.classList.add('changed');
    }
    this.objective.classList.add('visible');
  }

  // Marker for the next thing to do. info = { x, y, angle, onScreen, label,
  // distance } in screen pixels; pass null to hide it. Off-screen targets get an
  // arrow on the screen edge pointing the way.
  setWaypoint(info) {
    if (!info) {
      this.waypoint.classList.remove('visible');
      return;
    }
    this.waypoint.classList.add('visible');
    this.waypoint.classList.toggle('offscreen', !info.onScreen);
    this.waypoint.style.transform = `translate(${info.x.toFixed(1)}px, ${info.y.toFixed(1)}px)`;
    this.waypointArrow.style.transform = info.onScreen ? 'rotate(45deg)' : `rotate(${info.angle.toFixed(1)}deg)`;
    const text = `${info.label}  ${Math.round(info.distance)}m`;
    if (this.waypointLabel.textContent !== text) this.waypointLabel.textContent = text;
  }

  // Red banner when the generator trips
  flashOverload() {
    this.overloadBanner.classList.remove('visible');
    void this.overloadBanner.offsetWidth;
    this.overloadBanner.classList.add('visible');
  }

  hideToast() {
    clearTimeout(this._toastTimer);
    this.toast.classList.remove('visible');
  }

  // Short message near the top of the screen (item pickups and hints)
  showToast(text, ms = 4500) {
    this.toast.textContent = text;
    this.toast.classList.add('visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.remove('visible'), ms);
  }

  // ---------------------------------------------------------
  // Dialogue box
  // ---------------------------------------------------------

  // Voss speaks in text. Types out, then waits for the player to advance
  // (click / Space / Enter / E). Clicking while typing shows the full line.
  showVossLine(text) {
    this._setSpeaker('VOSS', 'voss');
    this.dialogue.classList.add('visible');
    this._startTyping(text);
    return new Promise((resolve) => {
      this._advanceResolver = resolve;
    });
  }

  // ARIA's line, shown as a subtitle for as long as she is speaking
  showAriaLine(text) {
    this._advanceResolver = null;
    this._stopTyping();
    this._setSpeaker('ARIA', 'aria');
    this.dialogue.classList.add('visible');
    this.textEl.textContent = text;
    this.hintEl.textContent = 'Space: skip';
  }

  // Is ARIA's subtitle on screen? (Space or a click then skips her line)
  isAriaLine() {
    return this.dialogue.classList.contains('visible') && this.dialogue.classList.contains('aria');
  }

  hideDialogue() {
    this._advanceResolver = null;
    this._stopTyping();
    this.dialogue.classList.remove('visible');
  }

  // Called by the Game on click / key press while a dialogue is open
  advance() {
    if (this._typing) {
      this._finishTyping();
      return;
    }
    const resolve = this._advanceResolver;
    if (resolve) {
      this._advanceResolver = null;
      this.hintEl.textContent = '';
      resolve();
    }
  }

  _setSpeaker(name, className) {
    this.speakerEl.textContent = name;
    this.dialogue.classList.remove('voss', 'aria');
    this.dialogue.classList.add(className);
  }

  _startTyping(text) {
    this._stopTyping();
    this._fullText = text;
    this._typing = true;
    this.textEl.textContent = '';
    this.hintEl.textContent = '';

    let index = 0;
    this._typeTimer = setInterval(() => {
      index++;
      this.textEl.textContent = this._fullText.slice(0, index);
      if (index >= this._fullText.length) this._finishTyping();
    }, TYPE_SPEED_MS);
  }

  _finishTyping() {
    this._stopTyping();
    this.textEl.textContent = this._fullText;
    this.hintEl.textContent = '▶ Click or press Space to continue';
  }

  _stopTyping() {
    clearInterval(this._typeTimer);
    this._typeTimer = null;
    this._typing = false;
  }
}

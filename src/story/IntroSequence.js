// Level 1 opening: Voss talks to ARIA at the corridor monitor.
// Each exchange is a Voss text line (the player clicks to continue) followed
// by one of ARIA's recorded lines (voice + animated face + subtitle).
//
// ARIA is bubbly and helpful, but tells half-truths with a slightly ominous
// edge ("permanent vacation", "I'll be watching"). Keep the wording here in
// sync with the script document and the recorded clips.
//
// Recorded clips go in public/assets/audio/aria/intro-line-N.mp3 (voice).
// Until a clip exists, that line shows as a timed subtitle with a talking
// face instead.

export const INTRO_LINES = [
  {
    voss: 'Where... where am I? What is going on?',
    aria: {
      clip: 'intro-line-1',
      expression: 'relief',
      text: "Voss! You're awake! Oh, I am so relieved."
    }
  },
  {
    voss: 'Voss? Is that... my name? Who are you?',
    aria: {
      clip: 'intro-line-2',
      expression: 'bubbly',
      text: "I'm ARIA, the station's AI, and you're Voss, our relief engineer! Welcome to Halcyon-9, a deep-sea research station. You're... a long way down."
    }
  },
  {
    voss: "Why can't I remember anything? Where is everyone?",
    aria: {
      clip: 'intro-line-3',
      expression: 'sly',
      text: "That's just the wake-up protocol, it will pass! The crew? They've gone on a little... permanent vacation. Then there was a small accident with the power, and we lost our link to the mainland. So it's just you and me!"
    }
  },
  {
    voss: 'Okay... so what do I need to do?',
    aria: {
      clip: 'intro-line-4',
      expression: 'watching',
      text: "You can fix it! Grab the flashlight nearby and reconnect the generator cables in this room, and I can call for help. I'll be watching!"
    }
  }
];

// Reading time for a subtitle when a line has no audio yet
const SECONDS_PER_CHARACTER = 0.055;
const MIN_FALLBACK_SECONDS = 3;

export class IntroSequence {
  constructor(ui, aria) {
    this.ui = ui;
    this.aria = aria;
    this.active = false;
  }

  // Runs the whole conversation; resolves when ARIA's last line has finished
  async run() {
    if (this.active) return;
    this.active = true;

    for (const line of INTRO_LINES) {
      await this.ui.showVossLine(line.voss);

      this.ui.showAriaLine(line.aria.text);
      const fallback = Math.max(MIN_FALLBACK_SECONDS, line.aria.text.length * SECONDS_PER_CHARACTER);
      await this.aria.speak(line.aria.clip, fallback, line.aria.expression);
    }

    this.ui.hideDialogue();
    this.active = false;
  }
}

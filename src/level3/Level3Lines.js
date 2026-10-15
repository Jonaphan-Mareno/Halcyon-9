// Every line spoken in Level 3 (the drowned deck). The script's master copy is Naomi's Word file
// (Halcyon-9-Script-and-Build-Plan.docx, "Level 3 script"); lines marked DRAFT are new and not in
// it yet. ARIA's ids are her recordings' file names (public/assets/audio/aria/<id>.mp3); until a
// recording exists her line shows as a subtitle. In Level 3 she speaks through Voss's earpiece.
// Voss's lines are on-screen text (ids starting "v-").

const aria = (cue, text, extra = {}) => ({ who: 'aria', cue, text, ...extra });
const voss = (text) => ({ who: 'voss', text });

export const LINES = {
  // 3.2 The flooded hall: on landing
  'l3hall-1': aria('bubbly', "Voss, the water's rising faster than I said. Straight ahead, then left. I'll open the doors."),
  // the window into the engine room, where they were locked in (DRAFT: the script only says he
  // sees them here)
  'v-window-1': voss('Oh no. No, no, no... Dr. Kessler?'),
  'v-window-2': voss("Kessler. Lindqvist. Navarro... Park. It's locked from out here. Someone shut them in."),
  'l3-window-1': aria('hesitant', "Don't look, Voss. There was nothing anyone could have done. Please. Left. Keep moving."),
  // the sealed bulkhead at the end of the way left; ARIA opens it (DRAFT: a stand-in until the
  // first gate's circuit puzzle is built, where she says it is stuck and it is not)
  'v-sealed-gate': voss("Sealed. ARIA said she'd open the doors."),
  'l3-gate-1': aria('guarded', 'That one sticks. Hold on... There.'),
  // 3.3 The airlock and the suit: as he comes up into the EVA prep room
  'l3suit': aria('bubbly', "The suit's on the wall. Put it on. Please. The dish is up the pylon. You have four minutes of oxygen, and you only need three."),
  // the uplink cable on its reel (DRAFT; it answers log-5: "I put the cable down")
  'v-cable': voss('The uplink cable. Every time, I put it down. Not this time.'),
  // trying the water lock too soon (DRAFT)
  'v-need-suit': voss('Not without the suit.'),
  'v-need-cable': voss("The cable. That's the whole reason I'm going out there.")
};

export const TALKS = {
  landing: ['l3hall-1'],
  window: ['v-window-1', 'v-window-2', 'l3-window-1'],
  sealedGate: ['v-sealed-gate'],
  gateOpen: ['v-sealed-gate', 'l3-gate-1'],
  suit: ['l3suit'],
  cable: ['v-cable'],
  needSuit: ['v-need-suit'],
  needCable: ['v-need-cable']
};

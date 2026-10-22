// Every line spoken in Level 3 (the drowned deck). The script's master copy is Naomi's Word file
// (Halcyon-9-Script-and-Build-Plan.docx, "Level 3 script"); lines marked DRAFT are new and not in
// it yet. ARIA's ids are her recordings' file names (public/assets/audio/aria/<id>.mp3); until a
// recording exists her line shows as a subtitle. In Level 3 she speaks through Voss's earpiece.
// Voss's lines are on-screen text (ids starting "v-").

const aria = (cue, text, extra = {}) => ({ who: 'aria', cue, text, ...extra });
const voss = (text, clip) => ({ who: 'voss', text, clip });

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
  'v-need-cable': voss("The cable. That's the whole reason I'm going out there."),
  // DRAFT from here on (the trench, the relay and the kraken): not in the Word file or recorded yet
  // the harpoon gun on its rack in the prep room
  'v-harpoon': voss('A harpoon gun. Whoever stocked this room expected company.'),
  'v-need-harpoon': voss("The harpoon. I'm not going out there with nothing."),
  // swimming down into the trench
  'l3-trench-1': aria('bubbly', "See the lights at the bottom? That's the uplink relay. Plug the cable in there and we're done."),
  // at the relay station: something wrapped round the back of it
  'v-relay-1': voss("Something's wrapped round the back of it."),
  'l3-relay-1': aria('guarded', 'Pipes. Old pipes. Go inside, Voss.'),
  // the cable plugged into the port; the trunk line to the surface does not answer
  'v-plug': voss("Cable's in."),
  'l3-relay-2': aria('hesitant', "The port's live, but the trunk line isn't answering. It runs out the back. It's been... pulled loose."),
  'v-trunk': voss('Pulled. By what?'),
  'v-port-first': voss('The port first.'),
  // out through the back hatch: the tentacles draw back into the cave, dragging the line
  'v-tentacles': voss("Those aren't pipes."),
  'l3-cave-1': aria('guarded', 'You need that line, Voss. Follow it.'),
  // the kraken rises in its lair
  'v-kraken': voss('ARIA! Do something!'),
  'l3-kraken-1': aria('hostile', "I could. I stopped the drones, didn't I? But the last time I helped you down here, you broke my dish."),
  'v-harpoon-fight': voss("Then I'll do it myself."),
  'v-hit-1': voss('Got it!'),
  'v-hit-2': voss('Again. Come on!'),
  // beaten, it sinks away and lets go of the line
  'l3-kraken-2': aria('relieved', '...Oh, well done. Now pick up the line. Quickly, please.'),
  // the trunk line back in its socket
  'l3-relay-3': aria('bubbly', "Signal! The surface is right there. Go and finish it at the console."),
  // at the console (the endings take over from here)
  'l3-uplink-1': aria('bubbly', 'Uplink established. Oh, Voss. Thank you.')
};

export const TALKS = {
  landing: ['l3hall-1'],
  window: ['v-window-1', 'v-window-2', 'l3-window-1'],
  sealedGate: ['v-sealed-gate'],
  gateOpen: ['v-sealed-gate', 'l3-gate-1'],
  suit: ['l3suit'],
  cable: ['v-cable'],
  needSuit: ['v-need-suit'],
  needCable: ['v-need-cable'],
  harpoon: ['v-harpoon'],
  needHarpoon: ['v-need-harpoon'],
  descend: ['l3-trench-1'],
  relay: ['v-relay-1', 'l3-relay-1'],
  plug: ['v-plug'],
  trunk: ['l3-relay-2', 'v-trunk'],
  portFirst: ['v-port-first'],
  tentacles: ['v-tentacles', 'l3-cave-1'],
  kraken: ['v-kraken', 'l3-kraken-1', 'v-harpoon-fight'],
  hit1: ['v-hit-1'],
  hit2: ['v-hit-2'],
  krakenGone: ['l3-kraken-2'],
  signal: ['l3-relay-3'],
  uplinkDone: ['l3-uplink-1']
};

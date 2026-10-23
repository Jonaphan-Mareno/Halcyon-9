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
  // the spear rifle on its rack in the prep room
  'v-harpoon': voss('A spear rifle. Whoever stocked this room expected company.'),
  'v-need-harpoon': voss("The rifle. I'm not going out there with nothing."),
  // swimming down into the trench
  'l3-trench-1': aria('bubbly', "See the lights at the bottom? That's the uplink relay. Plug the cable in there and we're done."),
  // at the relay station: the door is there, but something huge is wrapped round it
  'v-relay-1': voss("There's the relay. So where's the door?"),
  'l3-relay-1': aria('hesitant', "It's right there, in front of you. But something's... covering it."),
  'v-relay-2': voss('What are these? Pipes? They\'re huge.'),
  'l3-relay-2': aria('guarded', 'They run off toward the cliff. Let\'s follow them and see what they are.'),
  // the door, held shut (pressing E on it)
  'v-door-held': voss("It won't budge. Whatever these are, they've got it wrapped tight."),
  // at the cave's mouth: the "pipes" go into the rock
  'v-cave': voss('They go right into the rock.'),
  'l3-cave': aria('hesitant', "Careful, Voss. I'm reading something big in there. And it's... moving."),
  // the kraken rises in its lair
  'v-kraken': voss("Those aren't pipes..."),
  'l3-kraken-0': aria('hesitant', "Oh no. Voss... it's a kraken!"),
  'v-kraken-2': voss('ARIA! Do something!'),
  'l3-kraken-1': aria('hostile', "I could. I stopped the drones, didn't I? But the last time I helped you down here, you broke my dish."),
  'v-harpoon-fight': voss("Then I'll do it myself."),
  'v-hit-1': voss('Got it!'),
  'v-hit-2': voss('Again. Come on!'),
  // beaten, it lets go of the station and sinks away
  'l3-kraken-2': aria('relieved', "...Oh, well done. It's let go. Now get inside, quickly, please."),
  // the uplink cable plugged into the port, and the line to the surface answering
  'v-plug': voss("Cable's in."),
  'l3-relay-3': aria('bubbly', 'Signal! The surface is right there. Send it, Voss. Please.'),
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
  relay: ['v-relay-1', 'l3-relay-1', 'v-relay-2', 'l3-relay-2'],
  doorHeld: ['v-door-held'],
  caveMouth: ['v-cave', 'l3-cave'],
  kraken: ['v-kraken', 'l3-kraken-0', 'v-kraken-2', 'l3-kraken-1', 'v-harpoon-fight'],
  hit1: ['v-hit-1'],
  hit2: ['v-hit-2'],
  krakenGone: ['l3-kraken-2'],
  plug: ['v-plug'],
  signal: ['l3-relay-3'],
  uplinkDone: ['l3-uplink-1']
};

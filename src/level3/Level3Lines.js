// Every line spoken in Level 3 (the drowned deck). The script's master copy is Naomi's Word file
// (Halcyon-9-Script-and-Build-Plan.docx, "Level 3 script"); lines marked DRAFT are new and not in
// it yet. ARIA's ids are her recordings' file names (public/assets/audio/aria/<id>.mp3); until a
// recording exists her line shows as a subtitle. In Level 3 she speaks through Voss's earpiece.
// Voss's lines (ids starting "v-") are his recordings in public/assets/audio/voss/<id>.mp3; until one
// exists, the line shows as a subtitle.

const aria = (cue, text, extra = {}) => ({ who: 'aria', cue, text, ...extra });
const voss = (text, clip) => ({ who: 'voss', text, clip });

export const LINES = {
  // 3.1 The chute, on the way down from the garden's hatch (DRAFT: new, not in the script yet)
  'l3-chute': aria('hesitant', "Careful, Voss! This chute's full of loose cables and broken equipment. Steer round them, and duck under the shutters!"),
  // 3.2 The flooded hall: on landing
  'l3hall-1': aria('bubbly', "Voss, the water's rising faster than I said. Straight ahead, then left. I'll open the doors."),
  // the window into the engine room, where they were locked in (DRAFT: the script only says he
  // sees them here)
  // looking through it, his head pounds and the memory comes (Flashback 3): the lift's line again
  // (Flashback 1), its recording reused
  'v-window-head': voss('Ah… my head.', 'fb1-voss-head'),
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
  // trying the water lock too soon (DRAFT)
  'v-need-suit': voss('Not without the suit.'),
  'v-need-cable': voss("The cable. That's the whole reason I'm going out there."),
  // out on the platform for the first time: the open sea, and a moment to take it in (DRAFT: new,
  // not in the script yet)
  'l3-ocean': aria('bubbly', 'Voss... the ocean is beautiful. Just take a look around.'),
  'v-free': voss('I feel so free.'),
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
  // at the cave's mouth: the works' lit entrance (the relay is inside, at the back)
  'l3-works-1': aria('guarded', "That's the old research works, dug into the cliff. The relay's at the back, down the excavation shaft. Go carefully, Voss."),
  // the finale: it crashes down through the gantry, and the clearing starts to come down
  'l3-finale': aria('hesitant', 'Voss, the whole place is coming down! Finish it!'),
  // beaten, it lets go of the station and sinks away
  'l3-kraken-2': aria('relieved', "...Oh, well done. It's let go. Now get inside, quickly, please."),
  // 3.5 The shaft, the relay room and the water lock (docs/relay-lock-plan.md). From the end of the
  // fight until the confrontation Voss says nothing: he is spent. ARIA's lines are recorded (DRAFT:
  // not in the Word file yet; the subtitles are the plan's wording)
  // swimming into the relay room: the flood cut her off from it, so he has to do it by hand
  'l3-relay-3': aria('hesitant', "The control room's behind that hatch. The flood shorted everything down here, I can't reach it. You'll have to reroute the power by hand."),
  // the reroute won: the water lock's pumps are back
  'l3-relay-4': aria('relieved', "That's it! The lock's working. Get in, Voss."),
  // the lock drained, his helmet off, the inner door opening onto her light (a little too bright)
  'l3-relay-5': aria('bubbly', "Come on, Voss. I'm right here.")
};

export const TALKS = {
  chute: ['l3-chute'],
  landing: ['l3hall-1'],
  window: ['v-window-1', 'v-window-2', 'l3-window-1'],
  sealedGate: ['v-sealed-gate'],
  gateOpen: ['v-sealed-gate', 'l3-gate-1'],
  suit: ['l3suit'],
  needSuit: ['v-need-suit'],
  needCable: ['v-need-cable'],
  ocean: ['l3-ocean'],
  free: ['v-free'],             // (said later, at the platform's edge: PrepRoom)
  harpoon: ['v-harpoon'],
  needHarpoon: ['v-need-harpoon'],
  descend: ['l3-trench-1'],
  // (arriving at the relay, quickly: the "pipes", and ARIA reading something big)
  relay: ['v-relay-2', 'l3-cave'],
  doorHeld: ['v-door-held'],
  caveMouth: ['v-cave', 'l3-cave'],
  kraken: ['v-kraken', 'l3-kraken-0'],
  krakenGone: ['l3-kraken-2'],
  works: ['l3-works-1'],
  finale: ['l3-finale'],
  postBossDescent: ['l3-kraken-2'],
  relayEnter: ['l3-relay-3'],
  relayWon: ['l3-relay-4'],
  lockOpen: ['l3-relay-5']
};

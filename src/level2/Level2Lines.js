// Every line spoken in Level 2, word for word as in the script (scenes 2.1 to 2.9). The script's
// master copy is Naomi's Word file (Halcyon-9-Script-and-Build-Plan.docx); her edits of 14 October
// are in, with light punctuation fixes only.
//
// ARIA's lines: the id is also the recording's file name, public/assets/audio/aria/<id>.mp3.
// Until a recording exists the line shows as a subtitle while her face talks on the monitors.
// cue: how she says it (her face's expression, and her colour: warm lines turn her yellow,
// the snap turns the whole room red). Voss's lines are on-screen text (ids starting "v-").

// cue -> her face's expression and her colour on the monitors
export const CUES = {
  bubbly:   { expression: 'bubbly', mood: 'warm' },
  relieved: { expression: 'relief', mood: 'warm' },
  sly:      { expression: 'sly', mood: 'neutral' },
  guarded:  { expression: 'guarded', mood: 'neutral' },
  watching: { expression: 'watching', mood: 'neutral' },
  hesitant: { expression: 'hesitant', mood: 'neutral' },
  flat:     { expression: 'deadpan', mood: 'neutral' },
  hostile:  { expression: 'hostile', mood: 'hostile' }
};

const aria = (cue, text, extra = {}) => ({ who: 'aria', cue, text, ...extra });
// clip: his recording in public/assets/audio/voss/ (by default the line's id: v-acting-up.mp3 and so
// on; until it is there the line is text only)
const voss = (text, clip) => ({ who: 'voss', text, clip });

export const LINES = {
  // 2.1 The lift
  'l2-lift-1': aria('bubbly', "The elevator is unable to go to the third floor due to the water leakage, we'll have to take the emergency hatch on the second floor to get there."),
  'l2-lift-2': aria('bubbly', "This is where everyone actually lived. We weren't just a station. We were trying to make a home down here. You'll see."),
  'v-trying': voss('...Trying?', 'l2lift-1'),
  'l2-lift-3': aria('guarded', "Oh, you know how it is. Deep-sea living is a work in progress. Go on, have a look around."),
  'l2-lift-4': aria('sly', 'The hatch is just right up ahead.'),
  // her warning about the drones, before the doors open (the fight's controls are on screen)
  'l2-lift-5': aria('guarded', "Oh, and Voss? Before I open the doors: the garden's maintenance drones have been acting up since the water got in."),
  'v-acting-up': voss('Acting up how?'),
  'l2-lift-6': aria('guarded', "They go for anything that moves. There's a water pipe on the wall by the hatch. Pull it out and soak them."),
  'l2-lift-7': aria('sly', "Once they're wet, give me the word and I'll drop the temperature. Wet drones freeze. Frozen drones fall."),
  'l2-lift-8': aria('bubbly', "And if one's eye turns red, step aside. It's about to dive. Right. Doors opening."),

  // 2.2 The hall
  'v-chore': voss('Someone still had chore duty down here. Tidying up, watering the beds... like any of that mattered anymore.'),
  'v-ration': voss('Left mid-meal. Nobody just walks away from dinner.'),
  'v-photo': voss("Seven people. I keep looking for a face I'd know."),
  'v-pods-sign': voss('ESCAPE PODS: LOCKED. Remote override: ARIA.'),
  'v-pods-why': voss('Why would she lock the way out?'),
  'l2-pods': aria('sly', "The pods are offline. Water got into the release mechanism, it's such a shame."),
  'v-sea': voss('...Did something just move out there?'),
  'l2-sea': aria('bubbly', "Like I said before we're deep down in the sea."),
  'v-stairs': voss("There's a light on up there."),
  'l2-stairs': aria('guarded', "It isn't safe to go upstairs, there's been a lot of structural damage."),
  'v-tease': voss('...Was that supposed to move like that?', 'l2worried'),
  'l2-tease': aria('guarded', "That's just one of the garden maintenance equipment. Be careful the equipment have ran rampage."),

  // 2.3 The garden
  'l2-garden-1': aria('guarded', "Pick up the pipe, Voss. The one on the wall. Aim it, squeeze, and get them wet. I'll lower the temperature so they freeze."),
  'v-anytime': voss('You can do that any time?'),
  'l2-garden-2': aria('guarded', "Only when I'm asked nicely. And only when there's something nearby worth freezing."),
  'l2-bot-hit-1': aria('watching', "Ooof, that looked like it hurt. The equipment really isn't itself lately."),
  'l2-bot-hit-2': aria('sly', 'Careful. It still remembers how to grip. Just not what for.'),
  'l2-garden-rest': aria('bubbly', "That's two. There are... a few more. Garden maintenance has a lot of staff."),
  'l2-garden-idle': aria('sly', "The pipe's right there on the wall, Voss. I know you can see it. I'm the one with cameras, not you, and even I can see it."),
  'l2-garden-win': aria('relieved', "There. See? Nothing you can't handle."),
  'v-power-back': voss("The lights are back... and the bulkheads on the stairs just opened."),

  // 2.4 The hatch
  'v-dead-keypad': voss("Dead. There's no power to the keypad."),
  'l2-hatch-1': aria('guarded', "That's Kessler's lock. She cut me out of it before..."),
  'v-hatch-how': voss("Then how do I get through ARIA?! We don't have much time!", 'l2-hatch-angry'),
  'l2-hatch-2': aria('bubbly', "We'll find another way, just don't go upstairs! It isn't safe."),

  // 2.5 The gallery
  'l2-gallery-1': aria('hostile', 'Voss. The hatch is downstairs!', { anger: 3 }),
  'v-sealed': voss('Sealed from the inside.', 'l2-gallery-curious'),
  'l2-gallery-idle': aria('sly', "It's only bunks and laundry. Nobody ever tidies in there."),

  // 2.6 The crew bunk
  'v-initials': voss('My initials. Again.'),
  'v-my-bunk': voss("J. Voss. This was my bunk... I don't remember ever sleeping here."),
  'v-handwriting': voss("...That's my handwriting. Why does this sound like I already knew what was going on?"),
  'l2-bunk-interrupt': aria('guarded', "Voss? You've been in there a while. Everything alright?"),
  'l2-bunk-idle': aria('sly', "It's only bunks, Voss. I'd leave the lockers. Everyone's so private about their laundry."),

  // 2.7 The lab
  'l2-lab-1': aria('guarded', "...I was hoping you wouldn't need to see that."),
  'v-what-did-we-do': voss('ARIA. What did we do here?', 'l2-lab-angry'),
  'l2-lab-2': aria('sly', "We did good work, Voss. Important work. Dr. Kessler just... didn't see it the way we did."),
  'v-cycle9': voss("Cycle 9. What does 'Cycle 9' mean?", 'l2-lab-cycle'),
  // three seconds of silence first (the music drops out, the lights stutter), then bright
  'l2-lab-3': aria('bubbly', 'A filing system. Nobody reads those.', { pause: 3 }),
  'l2-lab-idle': aria('guarded', "The terminal's still logged in. I'd leave it, if I were you. But you won't, will you."),

  // 2.8 Dr. Kessler's room
  'l2-kessler-1': aria('hesitant', "You weren't supposed to find that so soon."),
  'v-what-did-i-do': voss('...What did I do, ARIA?', 'l2-kessler-angry'),
  // the snap: the room turns red for five seconds (game.ariaAnger)
  'l2-snap': aria('hostile', 'STOP. Stop asking. You did exactly what I asked you to.', { anger: 5 }),
  // (the silence first: the music drops out, the lights stutter, then they come back)
  'l2-kessler-2': aria('hesitant', "I'm sorry. That wasn't... I'm sorry. Take the code. The water's coming, Voss. Please.", { pause: 2.2 }),
  'l2-kessler-idle': aria('hesitant', 'Please, Voss. Not in here. Can we go?'),

  // 2.9 The hatch opens
  'l2-hatch-3': aria('bubbly', "Down you go. I'll be right in your ear.")
};

// What Voss reads, hears and watches upstairs (scenes 2.6 to 2.8), word for word. Step 6 shows these.
// Video logs say who is on the handheld's screen until a recording exists (Readables shows them
// live, LogHead.js): head (the character), condition (0 healthy .. 4 most worn, FaceWear.js) and
// face (the FaceRig preset: how he talks). Its beats are his acting, each at the words it starts on
// (`at`, the first place they appear in the words or the spoken lines after): what LogHead.cue takes
// (face, look, lean, gesture, tic, laugh, stare, still, mood, hold; a face's brows are brow, worry
// and skew, see FaceRig), and for the reveal without a recording, pause (seconds before those
// words) and rate (the reading speed from there on, 1 normal).
// Kept small and forward-facing in log-8: he never turns enough to show the wound.
export const LOGS = {
  bunkLogA: { kind: 'audio', title: 'CREW LOG (unnamed)',
    text: "...I don't care what ARIA says, the scans aren't 'routine.' I asked for my file back and she just changed the subject. Changed the subject! She doesn't do that. Something's up-" },
  bunkLogB: { kind: 'audio', title: 'CREW LOG (unnamed), the night before',
    text: "Goodnight, station. Goodnight, ARIA. I know some of the others are spooked lately, but you've always looked after us. I believe that. I really do." },
  rota: { kind: 'note', title: 'Corkboard', text: 'Scan sessions, B-lab. Operator: J. Voss.' },
  letter: { kind: 'letter', title: 'A half-finished letter',
    text: "Kessler won't understand what we've built. She sees risk where I see the only real chance any of us have had to matter. If she shuts it down now, after everything" },
  'log-0': { kind: 'video', head: 'voss', condition: 0, face: 'smug', title: 'J. VOSS, PROJECT LOG: THE BRIDGE', who: 'The living Voss, before the disaster. Thrilled, a little smug',
    text: "Day sixty-one. The Bridge is stable. I connected her to the electrical organisms an hour ago and she woke up. Not the station AI. Her. She asked me what it feels like to be tired. Kessler says the brain scans cross a line. The scans are the whole point. If we can copy a mind, we can read one. This could change everything.",
    after: 'Off-camera, Kessler: "Voss. Switch it off." Voss: "In a minute."',
    // log-0.mp3 holds his words only: the two spoken lines follow it as subtitles. (If they are
    // recorded onto its end, replace this with cues: [when Kessler starts, when he replies] in s)
    linesAfterVoice: true,
    beats: [
      { at: 'The Bridge is stable', face: { smile: 0.6 }, gesture: 'nod', amp: 0.6, hold: 2 },
      { at: 'she woke up', face: { smile: 0.5, brow: 0.6 }, lean: 0.12, hold: 2.5 },
      { at: 'Her.', pause: 0.7, face: { smile: 0.8, brow: 0.5 }, hold: 2.2 },
      { at: 'She asked me', look: [0.2, -0.06, 3], face: { smile: 0.3, brow: 0.3 }, hold: 2.5 },
      { at: 'Kessler says', face: { smile: 0.15, frown: 0.1, brow: -0.25, skew: 0.6 }, gesture: 'shake', amp: 0.7, hold: 2.5 },
      { at: 'The scans are the whole point', lean: 0.12, face: { smile: 0, brow: -0.35 }, gesture: 'nod', hold: 2 },
      { at: 'This could change everything', pause: 0.4, lean: 0.18, face: { smile: 0.7, brow: 0.5 }, hold: 3 },
      // Kessler from the doorway: he looks over to her, then back to the lens with a smirk
      { at: 'Off-camera', look: [0.45, 0, 8], face: { smile: 0, frown: 0.25, brow: -0.2 }, hold: 2.8 },
      { at: '"In a minute."', face: { smile: 0.45, skew: 0.5 }, hold: 4 }
    ] },
  'log-1': { kind: 'video', head: 'voss', condition: 1, face: 'tense', title: 'J. VOSS, PROJECT LOG: MEMORIES', who: "The living Voss, before the disaster, while experimenting with the crew's memories",
    text: "I found ways to not only scan and copy my colleagues' memories, but also selectively alter them. ARIA can now freely think for herself. I think the team is starting to realise something's wrong.",
    beats: [
      { at: 'I found ways', face: { smile: 0.25, brow: 0.3 }, lean: 0.08, hold: 2.5 },
      { at: 'selectively alter', pause: 0.5, look: [-0.15, 0.08, 4], face: { smile: 0.1, frown: 0.25 }, hold: 1.6 },
      { at: 'ARIA can now', look: [0, -0.05, 3], face: { smile: 0.2, brow: 0.55 }, hold: 2.5 },
      { at: 'I think the team', look: [0.3, 0, 7], face: { smile: 0, frown: 0.4, brow: 0.45 }, hold: 1.4 },
      { at: "something's wrong", pause: 0.4, face: { frown: 0.45, brow: 0.5 }, still: 0.5, hold: 3 }
    ] },
  'log-2': { kind: 'video', head: 'voss', condition: 2, face: 'whisper', title: 'CYCLE 2', who: 'A reconstructed Voss, whispering, awake all night',
    text: "I woke up in a cell. A cell. She said it was quarantine. Then I found my own handwriting in a locker, and it says I built her. I don't remember building anything. If I'm watching this later: the dish is outside. I'll make her tell me the truth.",
    beats: [
      { at: 'I woke up', look: [-0.2, 0, 10], hold: 0.6 },
      { at: 'A cell.', pause: 0.6, face: { frown: 0.45, brow: 0.65 }, hold: 1.6 },
      { at: 'She said', look: [0.12, 0, 4], face: { smile: 0.2, frown: 0.3, brow: -0.2, skew: -0.5 }, hold: 1.8 },
      { at: 'Then I found', lean: 0.12, face: { brow: 0.5 }, hold: 3 },
      { at: 'I built her', pause: 0.5, face: { frown: 0.4, brow: 0.8 }, hold: 2 },
      { at: "I don't remember", gesture: 'shake' },
      // a look over his shoulder at the door, then right up to the lens to say it
      { at: "If I'm watching", pause: 0.3, look: [-0.35, 0.02, 9], hold: 0.9 },
      { at: 'the dish is outside', lean: 0.2, face: { brow: 0.55, tired: 0.1 }, hold: 3, rate: 0.85 },
      { at: "I'll make her", face: { frown: 0.45, brow: -0.45 }, gesture: 'nod', amp: 0.7, hold: 3, rate: 1 }
    ] },
  'log-5': { kind: 'video', head: 'voss', condition: 3, face: 'strained', title: 'CYCLE 5', who: 'Strained, bargaining',
    text: "Five. I counted the marks. I can't stop counting. She's very good, you know. She's warm. She makes it easy to forget. Every time I get to the dish I remember a little more, and then she says my name just so, and I put the cable down. Next time I'll hide something where she won't look.",
    // the worst of him: rushing, laughing at nothing, warm about her in the wrong places
    beats: [
      { at: 'Five.', pause: 0.8, look: [-0.3, -0.04, 10], hold: 1.2 },
      { at: 'I counted', tic: true },
      { at: "I can't stop", laugh: 0.9, face: { smile: 0.35, frown: 0.4, brow: 0.6 }, hold: 1.6, rate: 1.35 },
      { at: "She's very good", look: [0.15, -0.04, 3], face: { smile: 0.4, brow: 0.45, tired: 0.3 }, hold: 2.4, rate: 0.8 },
      { at: "She's warm", pause: 0.6, face: { smile: 0.6, frown: 0.2, tired: 0.6 }, still: 0.8, hold: 2.2 },
      { at: 'She makes it easy', tic: true, still: 0, face: { frown: 0.5, brow: 0.6 }, hold: 1.6, rate: 1.2 },
      { at: 'Every time I get', lean: 0.15, hold: 4, rate: 1.3 },
      { at: 'just so', pause: 0.6, face: { smile: 0.45, brow: 0.4, worry: 0.3, tired: 0.7 }, hold: 1.4, rate: 0.8 },
      { at: 'and I put the cable down', face: { frown: 0.65, brow: 0.75 }, gesture: 'shake', hold: 2.2, rate: 1 },
      { at: 'Next time', pause: 0.4, look: [-0.35, 0, 12], hold: 0.7 },
      { at: "I'll hide", lean: 0.24, face: { frown: 0.3, brow: -0.35 }, hold: 4, rate: 0.85 },
      { at: "where she won't look", laugh: 0.6, tic: true, hold: 2 }
    ] },
  'log-8': { kind: 'video', head: 'voss', condition: 4, face: 'resigned', title: 'CYCLE 8', who: 'Calm, tired, resigned. The one the player must see',
    text: "If you're watching this, she's wiped me again. Don't trust her. But you will. I did, every time. Take the card. The code opens the hatch, but that's not what you came for. Find out what we did. And when you're out there in the dark with the cable in your hand, decide before she starts talking.",
    // past panic: too still, hardly blinking, one hollow laugh, closer and closer to the lens
    beats: [
      { at: "If you're watching", still: 0.75, stare: 3 },
      { at: 'again', pause: 0.5, look: [0.05, 0.14, 2], face: { frown: 0.4, tired: 0.9 }, hold: 1.6 },
      { at: "Don't trust her", lean: 0.12, still: 0.9, face: { frown: 0.45, brow: -0.3 }, hold: 2.5 },
      { at: 'But you will', pause: 0.9, laugh: 0.7, face: { smile: 0.3, frown: 0.3, worry: 0.5, tired: 0.9 }, hold: 1.6 },
      { at: 'I did, every time', look: [0.08, 0.12, 2], face: { frown: 0.35, worry: 0.6, tired: 0.9 }, hold: 2 },
      { at: 'Take the card', lean: 0.1, gesture: 'nod', amp: 0.5, hold: 3 },
      { at: 'Find out what we did', pause: 0.6, tic: true, face: { frown: 0.5, brow: 0.55 }, hold: 2.5 },
      { at: "And when you're out there", lean: 0.2, still: 1, stare: 12, hold: Infinity, rate: 0.8 },
      { at: 'decide before', pause: 0.7, lean: 0.3, face: { frown: 0.3, brow: -0.4, tired: 0.6 }, hold: Infinity, rate: 0.7 }
    ] },
  directive: { kind: 'file', author: 'DR. E. KESSLER', title: 'KESSLER DIRECTIVE (partly corrupted)',
    text: "...ordering immediate shutdown of ARIA's primary systems pending review. Unauthorized use of crew neural scan data without consent cannot continue under my", after: 'The rest is unreadable, static noise.' },
  research: { kind: 'file', author: 'J. VOSS', title: 'RESEARCH NOTES (barely recovered)',
    text: 'Interface trial 14. Subject response within expected parameters. ARIA / VOSS, J.' },
  subjects: { kind: 'file', author: 'J. VOSS', title: 'SUBJECT LIST',
    text: 'Okafor, A: COPIED. Lindqvist, T: COPIED. Navarro, R: COPIED. Park, S: COPIED. Hale, M: COPIED. Ito, D: COPIED. Kessler, E: COPIED (UNAUTHORISED). VOSS, J: RESTORED (CYCLE 9).' },
  kesslerLog: { kind: 'audio', title: 'DR. E. KESSLER, FINAL LOG',
    text: "This is Dr. Elena Kessler, ship's log, final entry before shutdown. I am terminating ARIA's primary systems tonight, with or without Voss's agreement. What we have built here is no longer research. It's become too unethical. I should have ended this the day I found out. I only hope it isn't already too late to matter." },
  codeCard: { kind: 'note', hand: true, title: 'A card pinned beside the monitor', text: 'HATCH 4 OVERRIDE: 4-7-1-9-0-2. Do not tell ARIA.' }
};

// The exchanges, as the level plays them: each is a list of line ids spoken in order
export const TALKS = {
  arrival: ['l2-lift-1', 'l2-lift-2', 'v-trying', 'l2-lift-3'],
  briefing: ['l2-lift-5', 'v-acting-up', 'l2-lift-6', 'l2-lift-7', 'l2-lift-8'],
  liftShut: ['l2-lift-4'],
  chore: ['v-chore'],
  ration: ['v-ration'],
  photo: ['v-photo'],
  pods: ['v-pods-sign', 'v-pods-why', 'l2-pods'],
  sea: ['v-sea', 'l2-sea'],
  stairs: ['v-stairs', 'l2-stairs'],
  tease: ['v-tease', 'l2-tease'],
  gardenStart: ['l2-garden-1'],
  firstFreeze: ['v-anytime', 'l2-garden-2'],
  hitDirect: ['l2-bot-hit-1'],
  hitGraze: ['l2-bot-hit-2'],
  gardenRest: ['l2-garden-rest'],
  gardenIdle: ['l2-garden-idle'],
  gardenWin: ['l2-garden-win'],
  bulkhead: ['v-power-back'],
  hatchLocked: ['l2-hatch-1', 'v-hatch-how', 'l2-hatch-2'],
  galleryTop: ['l2-gallery-1'],
  sealedDoor: ['v-sealed'],
  galleryIdle: ['l2-gallery-idle'],
  corkboard: ['v-initials'],
  myBunk: ['v-my-bunk'],
  letter: ['v-handwriting'],
  bunkInterrupt: ['l2-bunk-interrupt'],
  bunkIdle: ['l2-bunk-idle'],
  labFiles: ['l2-lab-1', 'v-what-did-we-do', 'l2-lab-2'],
  cycle9: ['v-cycle9', 'l2-lab-3'],
  labIdle: ['l2-lab-idle'],
  kessler: ['l2-kessler-1', 'v-what-did-i-do', 'l2-snap', 'l2-kessler-2'],
  kesslerIdle: ['l2-kessler-idle'],
  hatchOpen: ['l2-hatch-3']
};

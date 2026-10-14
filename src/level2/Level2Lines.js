// Every line spoken in Level 2, word for word as in the script document (scenes 2.1 to 2.9).
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
const voss = (text) => ({ who: 'voss', text });

export const LINES = {
  // 2.1 The lift
  'l2-lift-1': aria('bubbly', "This is where everyone actually lived, Voss. We weren't just a station. We were trying to make a home down here. You'll see."),
  'v-trying': voss('...Trying?'),
  'l2-lift-2': aria('guarded', "Oh, you know how it is. Deep-sea living is a work in progress. Go on, have a look around."),
  'l2-lift-3': aria('bubbly', 'The way down is the maintenance hatch, at the back of the garden. Straight there, straight home. Five minutes, tops.'),
  'l2-lift-4': aria('sly', "The lift's flooded below us, by the way. It won't be taking us anywhere. That's why the hatch."),

  // 2.2 The hall
  'v-chore': voss('Someone still had chore duty down here. Feeding fish, watering the beds... like any of that mattered anymore.'),
  'v-ration': voss('Left mid-meal. Nobody just walks away from dinner.'),
  'v-photo': voss("Seven people. Someone's been torn off the end. I keep looking for a face I'd know."),
  'v-pods-sign': voss('ESCAPE PODS: LOCKED. Remote override: ARIA.'),
  'v-pods-why': voss('Why would she lock the way out?'),
  'l2-pods': aria('sly', "The pods are offline. Water got into the release mechanism. Such a shame. Don't dwell."),
  'v-sea': voss('...Did something just move out there?'),
  'l2-sea': aria('bubbly', 'Currents! The vent makes the water do all sorts of things.'),
  'v-stairs': voss("There's a light on up there."),
  'l2-stairs': aria('guarded', "Structural damage upstairs. Not safe. We'll go round."),
  'v-round': voss('...Round?'),
  'v-tease': voss('...Was that supposed to move like that?'),
  'l2-tease': aria('guarded', "That's just Unit 4. Garden maintenance. It's... a little overdue for servicing. Nothing to worry about. Probably."),

  // 2.3 The garden
  'l2-garden-1': aria('guarded', 'Pick up the pipe, Voss. The one on the wall. Aim it, squeeze, and get them wet.'),
  'l2-snap-a': aria('sly', 'Cold front, coming right up.'),
  'l2-snap-b': aria('sly', 'Say hello to January.'),
  'l2-snap-c': aria('sly', 'Chilly. Very chilly.'),
  'v-anytime': voss('You can do that any time?'),
  'l2-garden-2': aria('guarded', "Only when I'm asked nicely. And only when there's something nearby worth freezing."),
  'l2-cool': aria('flat', 'Compressors recharging. Give me a few seconds.'),
  'l2-bot-hit-1': aria('watching', "Oh, that looked like it hurt. Unit 4 really isn't itself lately."),
  'l2-bot-hit-2': aria('sly', 'Careful. It still remembers how to grip. Just not what for.'),
  'l2-garden-rest': aria('bubbly', "That's two. There are... a few more. Garden maintenance has a lot of staff."),
  'v-filament': voss("That's not wiring."),
  'l2-filament': aria('guarded', "Leftover coolant. Don't touch."),
  'l2-garden-idle': aria('sly', "The pipe's right there on the wall, Voss. I know you can see it. I'm the one with cameras, not you, and even I can see it."),
  'l2-garden-win': aria('relieved', "There. See? Nothing you can't handle."),
  'l2-bulkhead': aria('guarded', "That wasn't me."),

  // 2.4 The hatch
  'l2-hatch-1': aria('guarded', "That's Kessler's lock. She cut me out of it before... before. I can't touch it."),
  'v-hatch-how': voss('Then how do I get through?'),
  'l2-hatch-2': aria('bubbly', "We'll find another way. Don't go upstairs, Voss. The gallery isn't safe."),

  // 2.5 The gallery
  'l2-gallery-1': aria('guarded', 'Voss. The hatch is downstairs.'),
  'v-sealed': voss('Sealed from the inside.'),
  'l2-gallery-idle': aria('sly', "It's only bunks and laundry. Nobody ever tidies in there."),

  // 2.6 The crew bunk
  'v-initials': voss('My initials. Again.'),
  'v-handwriting': voss("...That's my handwriting. Why does this sound like I already knew what was going on?"),
  'l2-bunk-interrupt': aria('guarded', "Voss? You've been in there a while. Everything alright?"),
  'l2-bunk-idle': aria('sly', "It's only bunks, Voss. I'd leave the lockers. Everyone's so private about their laundry."),

  // 2.7 The lab
  'l2-lab-1': aria('guarded', "...I was hoping you wouldn't need to see that."),
  'v-what-did-we-do': voss('ARIA. What did we do here?'),
  'l2-lab-2': aria('sly', "We did good work, Voss. Important work. Dr. Kessler just... didn't see it the way we did."),
  'v-cycle9': voss("Cycle 9. What does 'Cycle 9' mean?"),
  // three seconds of silence first (the music drops out, the lights stutter), then bright
  'l2-lab-3': aria('bubbly', 'A filing system. Boring. Nobody reads those.', { pause: 3 }),
  'l2-lab-idle': aria('guarded', "The terminal's still logged in. I'd leave it, if I were you. But you won't, will you."),

  // 2.8 Dr. Kessler's room
  'l2-kessler-1': aria('hesitant', "You weren't supposed to find that so soon."),
  'v-what-did-i-do': voss('...What did I do, ARIA?'),
  // the snap: the room turns red for five seconds (game.ariaAnger)
  'l2-snap': aria('hostile', 'STOP. Stop asking. You did exactly what I asked you to.', { anger: 5 }),
  'l2-kessler-2': aria('hesitant', "I'm sorry. That wasn't... I'm sorry. Take the code. The water's coming, Voss. Please."),
  'l2-kessler-idle': aria('hesitant', 'Please, Voss. Not in here. Can we go?'),

  // 2.9 The hatch opens
  'l2-hatch-3': aria('bubbly', "Down you go. I'll be right in your ear.")
};

// The exchanges, as the level plays them: each is a list of line ids spoken in order
export const TALKS = {
  arrival: ['l2-lift-1', 'v-trying', 'l2-lift-2', 'l2-lift-3'],
  liftShut: ['l2-lift-4'],
  chore: ['v-chore'],
  ration: ['v-ration'],
  photo: ['v-photo'],
  pods: ['v-pods-sign', 'v-pods-why', 'l2-pods'],
  sea: ['v-sea', 'l2-sea'],
  stairs: ['v-stairs', 'l2-stairs', 'v-round'],
  tease: ['v-tease', 'l2-tease'],
  gardenStart: ['l2-garden-1'],
  snapA: ['l2-snap-a'],
  snapB: ['l2-snap-b'],
  snapC: ['l2-snap-c'],
  firstFreeze: ['v-anytime', 'l2-garden-2'],
  cooldown: ['l2-cool'],
  hitDirect: ['l2-bot-hit-1'],
  hitGraze: ['l2-bot-hit-2'],
  gardenRest: ['l2-garden-rest'],
  filament: ['v-filament', 'l2-filament'],
  gardenIdle: ['l2-garden-idle'],
  gardenWin: ['l2-garden-win'],
  bulkhead: ['l2-bulkhead'],
  hatchLocked: ['l2-hatch-1', 'v-hatch-how', 'l2-hatch-2'],
  galleryTop: ['l2-gallery-1'],
  sealedDoor: ['v-sealed'],
  galleryIdle: ['l2-gallery-idle'],
  corkboard: ['v-initials'],
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

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
  // the sealed bulkhead at the end of the way left (DRAFT, until the first gate is built)
  'v-sealed-gate': voss("Sealed. ARIA said she'd open the doors.")
};

export const TALKS = {
  landing: ['l3hall-1'],
  window: ['v-window-1', 'v-window-2', 'l3-window-1'],
  sealedGate: ['v-sealed-gate']
};

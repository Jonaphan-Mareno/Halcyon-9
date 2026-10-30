Background music for Halcyon-9. The songs for Levels 1 and 2 are not here: they are in
public/assets/audio/ and named in src/audio/AudioManager.js.

The prologue (the Polaroids before Level 1, src/story/PrologueSequence.js) plays

  prologue.mp3        under Mom's four photos, looped, fading out on the fourth (optional:
                      a music box is synthesised if it is missing)

The kraken fight in Level 3 has its own music, played by src/level3/Level3Audio.js (ogg, so the
loops are seamless). Replace either file with your own track of the same name:

  level3-kraken.ogg          the fight's sinister base (muffled as he follows the line into the
                             cave, opening up when it attacks)
  level3-kraken-intense.ogg  the drums layered on top, rising as the fight gets worse
  level3-sea.ogg             out in the sea, quietly, whenever the fight's music is not playing

They loop, dip while ARIA speaks, follow the Music slider, and M mutes them.
Any file that is missing is just silent.
Credit every track in CREDITS.md.

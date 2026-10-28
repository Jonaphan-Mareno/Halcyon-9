Background music for Halcyon-9. Put mp3 files here with these exact names:

  level1.mp3          Level 1, all the way through
  level1-tense.mp3    Level 1's generator puzzle (optional: level1.mp3 plays if it is missing)
  level2.mp3          Level 2, exploring
  level2-fight.mp3    Level 2's garden drone fight (optional: level2.mp3 plays if it is missing)
  level3.mp3          Level 3, the drowned deck
  level3-tense.mp3    Level 3's tense moments (optional: level3.mp3 plays if it is missing)

The prologue (the Polaroids before Level 1, src/story/PrologueSequence.js) plays

  prologue.mp3        under Mom's four photos, looped, fading out on the fourth (optional:
                      a music box is synthesised if it is missing)

The kraken fight in Level 3 has its own music, played by src/level3/Level3Audio.js (ogg, so the
loops are seamless). Replace either file with your own track of the same name:

  level3-kraken.ogg          the fight's sinister base (muffled as he follows the line into the
                             cave, opening up when it attacks)
  level3-kraken-intense.ogg  the drums layered on top, rising as the fight gets worse
  level3-sea.ogg             out in the sea, quietly, whenever the fight's music is not playing

They loop, cross-fade when the game changes, dip while ARIA speaks, and M mutes them.
Any file that is missing is just silent. The player is src/audio/Soundtrack.js.
Credit every track in CREDITS.md.

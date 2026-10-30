# Scene C ("Stay"): report

## 1. How to play it

- `?level=3&ending=no`: the confrontation is skipped to its choice, "No" is pressed, and Scene C plays, then its narration and the credits.
- `?level=3&ending=narration-no`: straight to the narration, as before. Scene C is skipped.
- In the game: `DeckSession.onChoice('no')` calls `playStay()`, which plays Scene C (`src/level3/scene-c.js`) and then hands over to `playNarrationC()` (`narration-c.js`). Scene B's path (`'yes'`) is unchanged. Scene C's recordings are preloaded with Scene B's (`_preloadEnding`), and the narration's rooms load while Scene C plays.

## 2. What was reused and what was built

- **Reused from Scene B:** the timeline built from the recordings' lengths, the eye line, the camera system (eased shots and handheld drift), the stills on slow machines, the skip, the subtitles, the voice bus, the sound effects and the seat (`SIT_AT`, `SitDown` to `SitIdle`, `leanBack`). Scene B's `blank`, `copyGrip`, `blendGrip` and `ropeStep` are now exported from `SceneB.js`. Nothing else in Scene B changed.
- **The cable drop:** he lifts the cable a little to look at it, then opens his hand. The confrontation's rope is let go and falls under its own weight with the plug on its end. The plug's housing is kept above the floor, so it lies on the floor instead of sinking into it, and it rolls about 7 cm. The cable from the door lies down after it. The sounds are a hard clack (the loudest sound in the scene, with a bounce), a dull slap for the cable, and a dip in the hum. The port's ring dims as the plug lands. He never picks it up again, and the narration now leaves the cable lying where he dropped it (`conf._cableDropped`).
- **`amused`** (added to `AriaHead.js` before this work) is how ARIA laughs. During each giggle her eyes narrow and her smile widens, and her light pulses brighter and a little gold. `bubbly` is wide-eyed, so `amused` should not read as it. This has only been judged from stills.

## 3. Beats

| # | State | Notes |
|---|---|---|
| 1 | done | The prompt zooms onto No, then a medium on Voss. The "port behind him" in the script cannot be framed from in front of him, so the room is behind him instead. The exhale is the recording's own, with no speech shapes on his mouth. |
| 2 | done | A step of 0.22 m toward her, then the nod on "still" and the small smile. |
| 3 | done | 3.2 s close on ARIA, going from `broken` to `tender`. Her flicker is softer than Scene B's, and the hum drops. |
| 4 | done | Profile two-shot. He lifts the cable to look at it. |
| 5 | done | The insert follows the plug down. |
| 6–7 | done | ARIA is `hesitant` with a hint of a smile, then Voss shakes his head and gives his small smile. |
| 8 | done with a compromise | He is moved to the seat while the picture is on ARIA's eyes following him, as Scene B does. Then a low wide of the full sit, with his eyes closed and a breath out on landing. |
| 9 | done with a compromise | The low two-shot puts Voss in the bottom **right**, not the left: the seat is east of ARIA, so he can't be on the left from inside the room. |
| 10–12 | done | ARIA `amused`, her mock-offended tilt on "Oh wow". His shoulders shake on his laughs. |
| 13 | done | A 9.6 s pull-out back through the door, with wordless talk, laughs and his hand moving. It ends in a 2.4 s fade to black. |

## 4. Audio

- The gains are those in the script's table, added to `VOICE_GAIN_DB` as `v15` to `v20` and `a11` to `a13`. The narrator's ids stay `c-n6` and up, as `narration-c.js` already had them.
- **Voss lift:** `VOSS_LIFT_DB = +1.5` (in `Confrontation.js`) is added to every Voss line in Scenes A, B and C, including Scene B's "Ahh" ride. Not yet checked by ear on laptop speakers.
- **v20's laugh** (0.15 to 1.15 s into the file) is ridden down 4 dB.
- **The murmur:** `end-walla-1` plays from 2.0 s into the file under the pull-out. Its low-pass falls from 2600 Hz to 650 Hz and its level from −7 to −10 dB. It fades out over 1.4 s into the black, while the narration starts its own copy of the murmur from the file's beginning, so the same stretch is not heard twice.
- The pauses were measured with ffmpeg. **No line has been checked by ear.**

## 5. Lie-down

The lie-down belongs to the narration (`narration-c.js`, option (a)), not to this scene.

## 6. Performance

Scene C adds no meshes or shaders, so it draws the same as the confrontation. The fps line is logged in dev builds (`Scene C: ... fps`). It has not been measured on the UHD 620.

## 7. For the owner

- The three open questions in the script are unchanged.
- Things to watch at normal speed: whether the sit lands on the breath out (`SEAT_AT`), whether the walla seam into the narration can be heard, and whether the +1.5 dB lift is enough.

# Halcyon-9: demo build

Add `?demo` to the address to play the shortened run for presenting: the major parts kept, the
minor ones skipped with a black "DEMO · SKIPPING AHEAD" card. Without `?demo`, the game is unchanged.

    npm run dev   ->   http://localhost:5173/?demo

## What plays

| Kept | Skipped (with a card) |
|---|---|
| Opening cinematic, prologue, wake-up, ARIA's first talk | Torch, generator circuit, relay rings, lift keypad |
| The lift photograph and Flashback 1 | |
| Level 2: the lift, the garden drone fight | Voss's personal logs, the lab terminal, the fusebox puzzle |
| Kessler's room: her final log, the code card, Flashback 2 | The walk back and the hatch keypad (the hatch opens beside him) |
| Level 3: the chute, the flooded deck, Flashback 3 at the window | The EVA prep room, the water lock, the swim down the trench |
| The drowned works (the kraken hunt) and the kraken fight | The shaft, the relay network hack, the pressure valves, the water lock |
| The confrontation, the choice, the ending, the credits | |

## Chapters (F9)

F9 opens the chapter list at any time (press a number or click). Each chapter reloads the page there:

1. Opening: `?demo`
2. Garden drone fight: `?demo&level=2`
3. Kessler's room: `?demo&level=2&jump=kessler`
4. The chute and Flashback 3: `?demo&level=3`
5. The drowned works: `?demo&level=3&jump=works`
6. Kraken fight: `?demo&level=3&jump=kraken`
7. Confrontation: `?demo&level=3&confrontation`

The code is in `src/demo/demo.js`, with small hooks in `Game.js` (Level 1), `level2/HabitatSession.js`,
`level3/DeckSession.js` and `level3/Trench.js`.

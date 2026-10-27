# Session Notes — Level 1 Gameplay and Credits

## Work completed

### Lighting progression

- Dimmed Level 1's room lighting and emergency-light flicker while the generator is broken, so the flashlight remains useful.
- Reduced the generator-repair stage to a modest light increase. Full ambient lighting remains gated on completing the relay rings.
- The progression is implemented in `src/levels/Level1.js` through `DIM_LEVEL`, `partialRepair()`, `_lightFactor()`, and `_ambientFactor()`.

### Generator relay controls

- Reworked the four relay rings to rotate independently and apply explicit linked turns, rather than relying on a nested parent-child ring hierarchy.
- Ring order is bottom to top. A turn advances the selected ring and its linked rings:
  - Bottom ring → bottom + 3rd ring.
  - 2nd ring → 2nd + top ring.
  - 3rd ring → 3rd + 2nd ring.
  - Top ring → all four rings.
- See `_buildRelay()`, `_absoluteSteps()`, `turnRing()`, and `_updateRelay()` in `src/levels/Level1.js`.

### Keypad controls

- Clicking the dimmed backdrop outside the Level 1 keypad now exits keypad mode.
- Keypad exit requests pointer lock during the close click, while the controls remain disabled during the camera-return animation. The controls are re-enabled when the camera reaches the saved pose.
- Implemented in `src/ui/KeypadUI.js` and `src/Game.js`.

### RingPuzzle conflict repair

- Removed the unresolved merge markers in `src/entities/RingPuzzle.js` that caused Vite's dependency scan to fail.
- Kept Level 1's custom shader material factory and solve callback, plus the ring click collider and puzzle visuals.

### Credits

- Added individual Level 1 credits in `CREDITS.md` for the control-room armchair, TV parts, other chairs, and generator wall-panel/pillar parts.
- Added a note that some Level 2 bedroom items and robots were downloaded for free from CGTrader and BlendSwap, and that their original listings are no longer available. No links were added for those assets.
- The Free3D listings identify their items as Personal Use License; the BlendSwap generator source is listed as CC-BY-SA.

## Verification

- `npm run build` succeeded after the RingPuzzle repair, relay-control changes, keypad changes, and credits updates.
- Vite reports the existing large-chunk warning during builds; builds complete successfully.

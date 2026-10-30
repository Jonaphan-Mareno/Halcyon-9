# Difficulty regression check

Checked on 30 October 2026 using Chromium with WebGL software rendering.

The browser check exercised the running game, its real level sessions, HUD, damage handlers,
puzzles, death timers and restart buttons. Developer shortcuts and scripted interactions were
used to reach sections and apply hits. This was not an uninterrupted manual story playthrough;
mouse-look and control feel remain unverified because scripted clicks encountered a headless
browser pointer-lock error.

## Passed checks

- Last backup starts with one restore. Its pause menu disables difficulty changes and level
  restarts. Resetting options preserves that difficulty while resetting other options.
- A lethal hit in Level 1 restores full health and spends the single backup.
- The lift into Level 2 and the hatch into Level 3 preserve the same player, zero remaining
  backups and the revival count. The chute still completes and keeps its nonlethal health floor.
- Level 2 grazes deal 10 damage and fusebox misses deal 16 in Last backup. The fusebox grants
  36 seconds on the first attempt and 12 seconds on retries. Completing its four couplings
  shuts down the arm and unlocks the logs.
- Level 2's first lethal hit also spends exactly one backup. Entering Level 3 afterward does
  not replace it.
- Final death during the Level 3 hunt/showdown immediately enters `DEAD`. Pause, difficulty
  changes, option resets and all level-restart paths cannot bypass it. The delayed screen
  shows `LAST BACKUP LOST` and `RETURN TO TITLE`, with controls disabled.
- Returning to the title creates a fresh, unlocked game.
- A saved Last backup selection can be changed to Medium before starting a new game, which
  correctly receives three backups.
- Medium restores three times, then shows its ordinary game-over screen on the fourth death.
  Its restart button rebuilds Level 3 with fresh health and three backups.
- Level 3's pause-menu restart stays on Level 3 and preserves the debug flag.

The relay hack now uses the same puzzle-time multipliers: Easy 45 seconds, Medium 30 seconds,
Hard 22.5 seconds, and Last backup 18 seconds. Its tutorial and timer tooltip show the selected
limit. Browser checks passed for all four presets in an embedded iframe, including the tutorial
wait and the Begin button preserving the full scaled window. AI, sonar and Warden timings keep
their existing speeds.

## Automated validation

```sh
node --test
npm run build
git diff --check
```

All 28 tests across seven test files and the production build passed. The build retains its existing large
bundle-size warning. Regression tests cover difficulty locking, option resets, all four
presets, restore exhaustion, level-to-level backup continuity, title selection changes, and
relay-hack countdown expiry at each difficulty's limit.

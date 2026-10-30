import { damageAmount, getDifficulty } from '../core/Difficulty.js';
import { settings } from '../core/Settings.js';

// Voss's condition and running statistics.
//
// Integrity is his health. Voss is secretly a digital copy of a dead man, so
// when his integrity reaches zero ARIA does not let him die: she restores him
// from backup. Restores are his lives. When the backups run out it is game over.

export const MAX_INTEGRITY = 100;
export const MAX_RESTORES = 3; // the standard (Medium) number, for displays that need a default

// Only a running permadeath game carries its player into the next level. A new game must use
// the title's current selection, which may differ from the preference when Game was constructed.
export function createSessionPlayer(previous) {
  return settings.difficultyLocked && previous.difficulty.permadeath ? previous : new PlayerStats();
}

export class PlayerStats {
  constructor() {
    this.difficulty = getDifficulty();
    this.reset();
  }

  get maxRestores() {
    return this.difficulty.restores;
  }

  // Difficulty can be changed in Options. Lowering the life limit never kills him outright, and
  // raising it does not hand him free restores halfway through a level.
  setDifficulty(difficulty = getDifficulty()) {
    this.difficulty = difficulty;
    this.restores = Math.min(this.restores, this.maxRestores);
  }

  reset() {
    this.integrity = MAX_INTEGRITY;
    this.restores = this.maxRestores;

    // Shown on the inventory screen (and worth talking about when replaying)
    this.overloads = 0;      // generator overloads caused by running out of time
    this.zaps = 0;           // live fuses touched
    this.deaths = 0;         // times restored from backup
    this.puzzlesSolved = 0;
    this.playSeconds = 0;
  }

  // Take damage, scaled by the selected difficulty. Returns true if this flatlined him.
  damage(amount) {
    this.integrity = Math.max(0, this.integrity - damageAmount(amount, this.difficulty));
    return this.integrity <= 0;
  }

  heal(amount) {
    this.integrity = Math.min(MAX_INTEGRITY, this.integrity + amount);
  }

  get hasRestoreLeft() {
    return this.restores > 0;
  }

  // Spend a backup and come back at full integrity
  useRestore() {
    if (this.restores <= 0) return false;
    this.restores--;
    this.deaths++;
    this.integrity = MAX_INTEGRITY;
    return true;
  }
}

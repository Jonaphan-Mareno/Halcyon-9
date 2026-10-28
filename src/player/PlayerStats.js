// Voss's condition and running statistics.
//
// Integrity is his health. Voss is secretly a digital copy of a dead man, so
// when his integrity reaches zero ARIA does not let him die: she restores him
// from backup. Restores are his lives. When the backups run out it is game over.

export const MAX_INTEGRITY = 100;
export const MAX_RESTORES = 3;

export class PlayerStats {
  constructor() {
    this.reset();
  }

  reset() {
    this.integrity = MAX_INTEGRITY;
    this.restores = MAX_RESTORES;

    // Shown on the inventory screen (and worth talking about when replaying)
    this.overloads = 0;      // generator overloads caused by running out of time
    this.zaps = 0;           // live fuses touched
    this.deaths = 0;         // times restored from backup
    this.puzzlesSolved = 0;
    this.playSeconds = 0;
  }

  // Take damage. Returns true if this flatlined him.
  damage(amount) {
    this.integrity = Math.max(0, this.integrity - amount);
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

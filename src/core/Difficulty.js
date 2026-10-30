import { settings } from './Settings.js';

// The game's four difficulty presets. Medium is the original balance. Damage is multiplied when
// Voss is hurt; puzzleTime multiplies the countdowns, not the speed of any animations. restores
// counts the backups after his current life, so Super hard's one restore means two attempts total.
export const DIFFICULTIES = {
  easy: {
    label: 'Easy',
    damage: 0.5,
    puzzleTime: 1.5,
    restores: 3,
    permadeath: false,
    description: 'Half damage, 50% more puzzle time, three restores.'
  },
  medium: {
    label: 'Medium',
    damage: 1,
    puzzleTime: 1,
    restores: 3,
    permadeath: false,
    description: 'The standard balance: normal damage, puzzle time and three restores.'
  },
  hard: {
    label: 'Hard',
    damage: 1.5,
    puzzleTime: 0.75,
    restores: 3,
    permadeath: false,
    description: '50% more damage, 25% less puzzle time, three restores.'
  },
  superHard: {
    label: 'Last backup',
    damage: 2,
    puzzleTime: 0.6,
    restores: 1,
    permadeath: true,
    description: 'Double damage, 40% less puzzle time, two lives. No second run: permadeath.'
  }
};

export function getDifficulty(id = settings.get('difficulty')) {
  return DIFFICULTIES[id] || DIFFICULTIES.medium;
}

export function damageAmount(amount, difficulty = getDifficulty()) {
  return amount * difficulty.damage;
}

export function puzzleSeconds(seconds) {
  return seconds * getDifficulty().puzzleTime;
}

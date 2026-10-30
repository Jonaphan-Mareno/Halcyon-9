// Ring indices run from bottom (0) to top (3). Last Backup restores the harder
// coupling: turning an upper dial can disturb an already aligned lower ring.
const LAST_BACKUP_LINKS = [
  [0, 2],
  [1, 3],
  [2, 0, 1],
  [3, 1, 2]
];

export function relayTurnDeltas(index, difficulty = 'medium') {
  if (!Number.isInteger(index) || index < 0 || index >= 4) return null;
  if (difficulty !== 'superHard') return [0, 1, 2, 3].map(i => Number(i === index));

  // The scene graph is nested: a ring inherits every local turn below it.
  // Difference the desired world turns to keep unlinked rings stationary.
  const linked = LAST_BACKUP_LINKS[index];
  return [0, 1, 2, 3].map(i => Number(linked.includes(i)) - Number(linked.includes(i - 1)));
}

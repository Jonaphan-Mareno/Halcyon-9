import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { settings } from '../core/Settings.js';
import { DIFFICULTIES, puzzleSeconds } from '../core/Difficulty.js';
import { PlayerStats, createSessionPlayer } from './PlayerStats.js';

beforeEach(() => {
  settings.difficultyLocked = false;
  settings.reset();
});

for (const [id, difficulty] of Object.entries(DIFFICULTIES)) {
  test(`${id} applies its damage, timer and restore limits`, () => {
    settings.set('difficulty', id);
    const player = new PlayerStats();
    player.damage(10);
    assert.equal(player.integrity, 100 - 10 * difficulty.damage);
    assert.equal(puzzleSeconds(40), 40 * difficulty.puzzleTime);
    for (let i = 0; i < difficulty.restores; i++) {
      player.damage(1000);
      assert.equal(player.useRestore(), true);
      assert.equal(player.integrity, 100);
    }
    player.damage(1000);
    assert.equal(player.hasRestoreLeft, false);
    assert.equal(player.useRestore(), false);
    assert.equal(player.integrity, 0);
    assert.equal(player.deaths, difficulty.restores);
  });
}

test('changing an ordinary run to permadeath never grants another backup', () => {
  const player = new PlayerStats();
  while (player.useRestore()) { /* exhaust all backups */ }
  settings.set('difficulty', 'superHard');
  player.setDifficulty();
  assert.equal(player.restores, 0);
  assert.equal(player.difficulty.permadeath, true);
});

test('a spent permadeath backup stays spent across both level transitions', () => {
  settings.set('difficulty', 'superHard');
  settings.lockDifficulty();
  const player = new PlayerStats();
  player.useRestore();
  player.damage(13);
  const level2 = createSessionPlayer(player);
  const level3 = createSessionPlayer(level2);
  assert.equal(level3, player);
  assert.equal(level3.restores, 0);
  assert.equal(level3.deaths, 1);
  assert.equal(level3.integrity, 74);
});

test('a fresh ordinary game gets three backups after changing the saved permadeath selection', () => {
  settings.set('difficulty', 'superHard');
  const previous = new PlayerStats();
  settings.set('difficulty', 'medium');
  const player = createSessionPlayer(previous);
  assert.notEqual(player, previous);
  assert.equal(player.difficulty, DIFFICULTIES.medium);
  assert.equal(player.restores, 3);
});

test('a fresh permadeath game uses the title selection rather than the old player', () => {
  const previous = new PlayerStats();
  settings.set('difficulty', 'superHard');
  const player = createSessionPlayer(previous);
  assert.notEqual(player, previous);
  assert.equal(player.difficulty, DIFFICULTIES.superHard);
  assert.equal(player.restores, 1);
});

test('ordinary level transitions continue to grant fresh health and backups', () => {
  const previous = new PlayerStats();
  previous.useRestore();
  previous.damage(10);
  const player = createSessionPlayer(previous);
  assert.notEqual(player, previous);
  assert.equal(player.restores, 3);
  assert.equal(player.integrity, 100);
});

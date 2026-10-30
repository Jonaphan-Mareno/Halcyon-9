import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { settings } from './Settings.js';

beforeEach(() => {
  settings.difficultyLocked = false;
  settings.reset();
});

test('the title can change difficulty before a run starts', () => {
  settings.set('difficulty', 'superHard');
  settings.set('difficulty', 'easy');
  assert.equal(settings.get('difficulty'), 'easy');
});

test('a locked permadeath run rejects a difficulty downgrade', () => {
  settings.set('difficulty', 'superHard');
  settings.lockDifficulty();
  let notifications = 0;
  const unsubscribe = settings.onChange(() => notifications++);
  try {
    settings.set('difficulty', 'medium');
    assert.equal(settings.get('difficulty'), 'superHard');
    assert.equal(notifications, 0);
  } finally {
    unsubscribe();
  }
});

test('resetting options preserves permadeath while resetting other settings', () => {
  settings.set('difficulty', 'superHard');
  settings.set('music', 0);
  settings.lockDifficulty();
  settings.reset();
  assert.equal(settings.get('difficulty'), 'superHard');
  assert.equal(settings.get('music'), 0.8);
  settings.set('effects', 0.5);
  assert.equal(settings.get('effects'), 0.5);
});

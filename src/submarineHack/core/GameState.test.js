import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { GameState } from "./GameState.js";
import { settings } from "../../core/Settings.js";

beforeEach(() => {
  settings.difficultyLocked = false;
  settings.reset();
});

test("game state starts with the planned round and ability timers", () => {
  const state = new GameState();

  assert.equal(state.timeRemaining, 30);
  assert.equal(state.timeLimit, 30);
  assert.equal(state.pingCooldown, 0);
  assert.equal(state.pingCooldownMax, 3);
  assert.equal(state.wardenTimer, 6);
  assert.equal(state.status, "playing");
});

for (const [difficulty, seconds] of [["easy", 45], ["medium", 30], ["hard", 22.5], ["superHard", 18]]) {
  test(`${difficulty} gets a ${seconds}-second breach window and expires at its limit`, () => {
    settings.set("difficulty", difficulty);
    const state = new GameState();
    assert.equal(state.timeLimit, seconds);
    assert.equal(state.timeRemaining, seconds);
    assert.equal(state.updateRoundTimer(seconds - 0.25), false);
    assert.equal(state.timeRemaining, 0.25);
    assert.equal(state.updateRoundTimer(0.25), true);
    assert.equal(state.timeRemaining, 0);
    assert.equal(state.aiTickInterval, 1.5);
    assert.equal(state.wardenTimer, 6);
    assert.equal(state.pingCooldownMax, 3);
  });
}

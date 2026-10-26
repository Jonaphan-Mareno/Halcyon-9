import assert from "node:assert/strict";
import test from "node:test";
import { GameState } from "./GameState.js";

test("game state starts with the planned round and ability timers", () => {
  const state = new GameState();

  assert.equal(state.timeRemaining, 30);
  assert.equal(state.pingCooldown, 0);
  assert.equal(state.pingCooldownMax, 3);
  assert.equal(state.wardenTimer, 6);
  assert.equal(state.status, "playing");
});

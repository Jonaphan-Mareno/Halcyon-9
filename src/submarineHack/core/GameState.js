export class GameState {
  constructor() {
    this.timeRemaining = 30;
    this.pingCooldown = 0;
    this.pingCooldownMax = 3;
    this.wardenTimer = 6;
    this.aiTickInterval = 1.5;
    this.aiTimer = this.aiTickInterval;
    this.status = "playing"; // playing | won | lost
    this.endReason = null;
    this.activeNodeId = null;
    this.breachAttempts = new Map();
  }

  updateCooldowns(deltaSeconds) {
    const elapsed = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
    this.pingCooldown = Math.max(0, this.pingCooldown - elapsed);
  }

  updateRoundTimer(deltaSeconds) {
    if (this.status !== "playing") return false;
    const elapsed = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
    this.timeRemaining = Math.max(0, this.timeRemaining - elapsed);
    return this.timeRemaining === 0;
  }
}

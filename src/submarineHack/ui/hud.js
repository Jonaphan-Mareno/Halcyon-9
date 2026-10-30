export function updateHud(state) {
  const timer = document.querySelector("#timer");
  const pingFill = document.querySelector("#ping-fill");
  if (timer) {
    const seconds = Math.max(0, Math.ceil(state.timeRemaining));
    timer.textContent = `00:${String(seconds).padStart(2, "0")}`;
    timer.classList.toggle("urgent", seconds <= 10 && state.status === "playing");
  }

  if (pingFill) {
    const cooldownMax = Math.max(0.001, state.pingCooldownMax);
    const ready = Math.max(0, Math.min(1, 1 - state.pingCooldown / cooldownMax));
    pingFill.style.width = `${ready * 100}%`;
    pingFill.setAttribute("aria-valuenow", String(Math.round(ready * 100)));
    pingFill.parentElement?.setAttribute("aria-valuenow", String(Math.round(ready * 100)));

    const pingState = document.querySelector("#ping-state");
    if (pingState) pingState.textContent = ready >= 1 ? "READY" : `${Math.ceil(state.pingCooldown)}s`;
  }

  if (state.status !== "playing") {
    const endScreen = document.querySelector("#end-screen");
    if (endScreen && endScreen.hidden) {
      const victory = state.status === "won";
      document.querySelector("#end-kicker").textContent = victory ? "RELAY CONTROL: MANUAL REROUTE" : "RELAY NETWORK";
      document.querySelector("#end-title").textContent = victory ? "PUMPS ONLINE" : "REROUTE FAILED: BREAKERS TRIPPED";
      document.querySelector("#end-message").textContent = victory
        ? "The pump controller is powered. The water lock to the control room is cycling."
        : state.endReason === "core"
          ? "Seawater shorted the lines back to your access core."
          : "The backup cell ran out before the pumps had power.";
      endScreen.dataset.result = state.status;
      endScreen.hidden = false;
      requestAnimationFrame(() => endScreen.classList.add("visible"));
    }
  }
}

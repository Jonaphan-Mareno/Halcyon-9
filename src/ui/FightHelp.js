// The garden fight's controls, on screen from ARIA's warning in the lift until the last drone
// breaks: E takes the pipe, the left mouse button sprays, Q has ARIA freeze the wet ones (with how
// long until she can again). Styles in level2.css.
export class FightHelp {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.id = 'fight-help';
    this.el.innerHTML = `
      <div class="fh-title">THE DRONES</div>
      <div class="fh-row" data-row="pipe"><span class="fh-key">E</span><span>Pull the water pipe off the wall by the hatch</span></div>
      <div class="fh-row"><span class="fh-key">HOLD LEFT MOUSE</span><span>Spray them with water</span></div>
      <div class="fh-row"><span class="fh-key">Q</span><span>ARIA freezes the wet ones</span><span class="fh-state"></span></div>
      <div class="fh-tip">A red eye means it is about to dive: step aside.</div>`;
    root.appendChild(this.el);
    this.pipeRow = this.el.querySelector('[data-row="pipe"]');
    this.stateEl = this.el.querySelector('.fh-state');
    this._state = null;
  }

  setVisible(on) {
    this.el.classList.toggle('visible', on);
  }

  // holding: he has the pipe; coldSnap: seconds until ARIA can freeze again; fighting: drones are up
  update(holding, coldSnap, fighting) {
    this.pipeRow.classList.toggle('done', holding);
    const state = !fighting ? '' : coldSnap > 0 ? Math.ceil(coldSnap) + ' s' : 'READY';
    if (state === this._state) return;
    this._state = state;
    this.stateEl.textContent = state;
    this.stateEl.classList.toggle('ready', state === 'READY');
  }
}

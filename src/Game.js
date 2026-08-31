export class Game {
  constructor() {
    this.state = 'INIT'; // INIT, PLAYING, GAME_OVER
    this.currentLevel = null;
  }

  init() {
    console.log('Halcyon-9 initialized.');
    this.startLoop();
  }

  startLoop() {
    const loop = (time) => {
      requestAnimationFrame(loop);
      this.update(time);
    };
    requestAnimationFrame(loop);
  }

  update(time) {
    // Main game loop update
    if (this.currentLevel) {
      this.currentLevel.update(time);
    }
  }
}

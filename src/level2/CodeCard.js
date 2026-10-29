// Dr. Kessler's code card, the one pinned on a stand beside her monitor: an off-white index card,
// a strip of tape, her hurried handwriting. Drawn once on a canvas, which is both the card's face in
// her room and the picture of it kept at the side of the screen once Voss has read it.

const W = 512, H = 330;

let canvas = null;

export function codeCardCanvas(code) {
  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // the card: off-white, a little yellowed at the edges, faint ruled lines
  const paper = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
  paper.addColorStop(0, '#f4efe1');
  paper.addColorStop(1, '#ddd2b4');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(80, 120, 170, 0.22)';
  ctx.lineWidth = 2;
  for (let y = 92; y < H; y += 46) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(200, 70, 70, 0.3)';
  ctx.beginPath();
  ctx.moveTo(0, 62);
  ctx.lineTo(W, 62);
  ctx.stroke();

  // a strip of tape across the top
  ctx.save();
  ctx.translate(W / 2, 14);
  ctx.rotate(-0.04);
  ctx.fillStyle = 'rgba(235, 228, 190, 0.75)';
  ctx.fillRect(-70, -16, 140, 34);
  ctx.restore();

  // her handwriting, quick and slanted
  const hand = '"Segoe Print", "Ink Free", "Bradley Hand", "Comic Sans MS", cursive';
  ctx.fillStyle = '#1d2a4a';
  ctx.save();
  ctx.translate(34, 0);
  ctx.rotate(-0.025);
  ctx.font = `bold 30px ${hand}`;
  ctx.fillText('HATCH 4 OVERRIDE', 0, 84);
  ctx.font = `bold 62px ${hand}`;
  ctx.fillText(code.split('').join('-'), 0, 176);
  ctx.font = `28px ${hand}`;
  ctx.fillStyle = '#7a1d1d';
  ctx.fillText('Do not tell ARIA.', 0, 262);
  // underlined twice
  ctx.strokeStyle = '#7a1d1d';
  ctx.lineWidth = 3;
  for (const dy of [272, 279]) {
    ctx.beginPath();
    ctx.moveTo(0, dy);
    ctx.lineTo(238, dy - 4);
    ctx.stroke();
  }
  ctx.restore();
  return canvas;
}

// The crew photo's caption, in the handwriting and ink of the prologue's Polaroids
// (scripts/prologue/polaroid.mjs), centred on the paper under the picture. The same on the whole
// print (scripts/ending-photo/) and the torn one (./photo.js), where the tear takes the end of it
// with Voss.
export const CAPTION = 'We will change the world! :)';
export const CAPTION_BAND = 130;     // the paper under the picture, on the 1200 wide print

export function writeCaption(g, photoH, { opacity = 0.85 } = {}) {
  g.save();
  g.translate(600, photoH + 72);
  g.rotate((-1.5 * Math.PI) / 180);
  g.font = "54px 'Segoe Script', 'Bradley Hand', cursive";
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#2a2f5a';
  g.globalAlpha = opacity;
  g.fillText(CAPTION, 0, 0);
  g.restore();
}

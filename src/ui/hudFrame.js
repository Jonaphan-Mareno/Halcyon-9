// The game's HUD frames: drawn outlines (SVG) round the dialogue box, the objective, the health
// panel, the prompts, the keypad and the rest, in the style of a station's display hardware: cut
// corners, a notch, a row of little blocks, short hazard stripes, corner brackets and tick marks.
// Each frame is drawn to the box's real size in pixels and redrawn when the box changes size, so
// the details never stretch. Colour comes from CSS: --frame (lines) and --frame-bg (the fill), so a
// box can change colour with a class (ARIA blue, Voss orange).
//
//   frame(el, { shape, tab, number })
//     shape   'long'  wide boxes (the dialogue box, toasts)
//             'panel' corner panels (health, ammo, the keypad)
//             'slim'  the panels along the top (the objective, the help panels)
//             'tag'   small prompts
//     tab     an element (the speaker's name) that sits in a tab on the top edge: the tab is sized
//             to it
//     number  a little number in a box on the frame ('01')

const NS = 'http://www.w3.org/2000/svg';
const PAD_X = 10, PAD_TOP = 22, PAD_BOTTOM = 10;    // room round the box for what sticks out

export function frame(el, { shape = 'panel', tab = null, number = null } = {}) {
  if (!el || el._hudFrame) return;
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('hud-frame');
  svg.setAttribute('aria-hidden', 'true');
  el.prepend(svg);
  el.classList.add('hud-framed');
  const draw = () => {
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return;
    svg.setAttribute('width', w + PAD_X * 2);
    svg.setAttribute('height', h + PAD_TOP + PAD_BOTTOM);
    svg.style.left = -PAD_X + 'px';
    svg.style.top = -PAD_TOP + 'px';
    const tabW = tab ? tab.offsetWidth + 30 : 0;
    svg.innerHTML = `<g transform="translate(${PAD_X} ${PAD_TOP})">${SHAPES[shape](w, h, { tabW, number })}</g>`;
  };
  const ro = new ResizeObserver(draw);
  ro.observe(el);
  if (tab) ro.observe(tab);
  // (a box whose text is replaced wholesale, as the toast's and the prompt's are, loses its frame
  // with it: put it back)
  const mo = new MutationObserver(() => {
    if (svg.parentNode !== el) {
      el.prepend(svg);
      draw();
    }
  });
  mo.observe(el, { childList: true });
  el._hudFrame = { svg, ro, mo, draw };
  draw();
}

const pts = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const outline = (list) => `<polygon class="hf-fill" points="${pts(list)}"/><polygon class="hf-line" points="${pts(list)}"/>`;
const line = (x1, y1, x2, y2, cls = 'hf-line') => `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
const blocks = (x, y, n, size = 3, gap = 3) => {
  let s = '';
  for (let i = 0; i < n; i++) s += `<rect class="hf-solid" x="${x + i * (size + gap)}" y="${y}" width="${size}" height="${size}"/>`;
  return s;
};
const stripes = (x, y, n, w = 5, hgt = 4) => {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x0 = x + i * (w + 3);
    s += `<polygon class="hf-solid hf-dim" points="${pts([[x0 + hgt, y], [x0 + hgt + w, y], [x0 + w, y + hgt], [x0, y + hgt]])}"/>`;
  }
  return s;
};
const numberBox = (x, y, n) => `<rect class="hf-line" x="${x}" y="${y}" width="22" height="13"/>` +
  `<text class="hf-num" x="${x + 11}" y="${y + 10}" text-anchor="middle">${n}</text>`;

const SHAPES = {
  // a wide box: a big cut top-left corner, a notch along the top with little blocks in it, a cut
  // bottom-right corner with hazard stripes beside it, a step in the bottom edge, and (optional) a
  // tab for the speaker's name over the top-left
  long(w, h, { tabW, number }) {
    const c1 = Math.min(16, h * 0.3), c2 = Math.min(14, h * 0.28);
    const nx0 = Math.max(tabW + 30, w * 0.5), nx1 = w - 44;
    const bx0 = w * 0.32;
    const body = [
      [c1, 0], [nx0, 0], [nx0 + 6, 5], [nx1, 5], [nx1 + 6, 0], [w - 4, 0], [w, 4], [w, h - c2], [w - c2, h],
      [bx0, h], [bx0 - 6, h - 5], [18, h - 5], [12, h], [4, h], [0, h - 4], [0, c1]
    ];
    let s = '';
    if (tabW) {
      s += `<polygon class="hf-tab" points="${pts([[c1 + 2, 0], [c1 + 12, -17], [c1 + 12 + tabW, -17], [c1 + 22 + tabW, 0]])}"/>`;
    }
    s += outline(body);
    // the accents: a heavy bar along the cut corner, brackets off the right, little blocks in the
    // notch, hazard stripes by the bottom corner, ticks in the bottom step
    s += line(-3, c1 + 3, c1 + 3, -3, 'hf-line hf-heavy');
    s += line(w + 4, h * 0.25, w + 4, h - c2 - 4, 'hf-line hf-heavy');
    s += line(w + 4, h * 0.25, w - 2, h * 0.25);
    if (nx1 - nx0 > 50) s += blocks(nx0 + 14, 0.5, Math.min(8, Math.floor((nx1 - nx0 - 24) / 7)), 3, 4);
    s += stripes(w - c2 - 46, h - 4.5, 4);
    s += line(22, h - 2, 30, h - 2) + line(34, h - 2, 38, h - 2);
    if (number) s += numberBox(w - 30, h - 20, number);
    return s;
  },

  // a corner panel: cut top-right and bottom-left corners, a bracket off the top-left corner, tick
  // marks down the left edge, little blocks along the bottom, and (optional) a number tag
  panel(w, h, { number }) {
    const c = Math.min(14, h * 0.3);
    const body = [[0, 0], [w - c, 0], [w, c], [w, h], [c, h], [0, h - c]];
    let s = outline(body);
    s += line(-4, 10, -4, -4, 'hf-line hf-heavy') + line(-4, -4, 12, -4, 'hf-line hf-heavy');
    s += line(w - c + 4, -4, w + 4, c - 4, 'hf-line hf-heavy');
    for (let i = 0; i < 3; i++) s += line(3, h * 0.35 + i * 5, 8, h * 0.35 + i * 5);
    s += blocks(c + 8, h + 3, 4, 3, 3);
    s += stripes(w - 44, h + 2, 4, 4, 3);
    if (number) s += numberBox(w - 30, h - 18, number);
    return s;
  },

  // a slim panel for what sits at the top of the screen: a faint fill with a small cut corner, thin
  // brackets at two corners and three little blocks; no full outline, so it takes little room
  slim(w, h) {
    const c = Math.min(7, h * 0.25);
    let s = `<polygon class="hf-fill hf-faint" points="${pts([[0, 0], [w - c, 0], [w, c], [w, h], [0, h]])}"/>`;
    s += line(0, 9, 0, 0) + line(0, 0, 9, 0);
    s += line(w - c, 0, w, c);
    s += line(w, h - 9, w, h) + line(w, h, w - 9, h);
    s += blocks(w - c - 18, -5, 3, 2.5, 3);
    return s;
  },

  // a small prompt: cut on all four corners, with square brackets just off each side
  tag(w, h) {
    const c = Math.min(8, h * 0.35);
    const body = [[c, 0], [w - c, 0], [w, c], [w, h - c], [w - c, h], [c, h], [0, h - c], [0, c]];
    let s = outline(body);
    s += line(-6, 3, -6, h - 3, 'hf-line hf-heavy') + line(-6, 3, -2, 3) + line(-6, h - 3, -2, h - 3);
    s += line(w + 6, 3, w + 6, h - 3, 'hf-line hf-heavy') + line(w + 6, 3, w + 2, 3) + line(w + 6, h - 3, w + 2, h - 3);
    return s;
  }
};

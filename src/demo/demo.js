// The demo build (?demo in the address): the game with its minor parts skipped, for presenting it.
//
// What is kept: the opening, the garden drone fight, Kessler's room and Flashback 2, the chute,
// Flashback 3 at the engine room window, the drowned works and the kraken fight, the
// confrontation, the choice, an ending and the credits.
//
// What is skipped, each with a black card that says so:
//   Level 1  everything after ARIA's first talk (torch, circuit, relay rings, keypad): straight to
//            the lift and its photograph
//   Level 2  after the garden: the bunk logs, the lab terminal and the fusebox (straight into
//            Kessler's room); after her room: the walk back and the hatch keypad
//   Level 3  after Flashback 3: the suit-up, the water lock and the swim (straight to the works'
//            entrance); after the kraken: the shaft, the relay hack, the valves and the water lock
//            (straight to the confrontation)
//
// F9 opens the chapter list, to jump to any part (each one reloads the page at that part).

const params = new URLSearchParams(window.location.search);
export const DEMO = params.has('demo');
// the chapter jumps (each one is a URL; see CHAPTERS)
export const DEMO_JUMP = DEMO ? params.get('jump') : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const CHAPTERS = [
  { key: '1', name: 'Opening', note: 'Prologue, wake-up, ARIA', query: 'demo' },
  { key: '2', name: 'Garden drone fight', note: 'Level 2: the first fight', query: 'demo&level=2' },
  { key: '3', name: "Kessler's room", note: 'Level 2: her log, Flashback 2', query: 'demo&level=2&jump=kessler' },
  { key: '4', name: 'The chute and Flashback 3', note: 'Level 3 from the start', query: 'demo&level=3' },
  { key: '5', name: 'The drowned works', note: 'Level 3: the kraken hunts you', query: 'demo&level=3&jump=works' },
  { key: '6', name: 'Kraken fight', note: 'Level 3: the boss', query: 'demo&level=3&jump=kraken' },
  { key: '7', name: 'Confrontation', note: 'Level 3: ARIA, the choice, the ending', query: 'demo&level=3&confrontation' }
];

// A black card over the game: "DEMO · SKIPPING AHEAD" and what is skipped. Resolves (once it is
// fully black) with the card; card.close() fades it out and removes it. Also usable as the veil
// for DeckSession.startConfrontation (it calls .remove()).
export async function demoCard(title, detail = '') {
  injectStyle();
  const el = document.createElement('div');
  el.className = 'demo-card';
  el.innerHTML = `<div class="demo-card-tag">DEMO &middot; SKIPPING AHEAD</div>
    <div class="demo-card-title"></div><div class="demo-card-detail"></div>`;
  el.querySelector('.demo-card-title').textContent = title;
  el.querySelector('.demo-card-detail').textContent = detail;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  el.close = async (hold = 600) => {
    await sleep(hold);
    el.classList.remove('on');
    el.classList.add('fade-text');
    await sleep(700);
    el.remove();
  };
  await sleep(2400);
  return el;
}

// The corner badge and the F9 chapter list (once, at start-up)
export function installDemoUI() {
  if (!DEMO) return;
  injectStyle();
  const badge = document.createElement('div');
  badge.className = 'demo-badge';
  badge.textContent = 'DEMO  ·  F9 CHAPTERS';
  document.body.appendChild(badge);

  const menu = document.createElement('div');
  menu.className = 'demo-menu';
  menu.innerHTML = '<div class="demo-menu-box"><div class="demo-menu-head">HALCYON-9 &middot; DEMO CHAPTERS</div>' +
    '<div class="demo-menu-list"></div><div class="demo-menu-foot">Press a number, or click. F9 or Esc to close.</div></div>';
  const list = menu.querySelector('.demo-menu-list');
  const go = (c) => { window.location.href = window.location.pathname + '?' + c.query; };
  for (const c of CHAPTERS) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'demo-menu-row';
    row.innerHTML = '<span class="k"></span><span class="n"></span><span class="d"></span>';
    row.querySelector('.k').textContent = c.key;
    row.querySelector('.n').textContent = c.name;
    row.querySelector('.d').textContent = c.note;
    row.addEventListener('click', () => go(c));
    list.appendChild(row);
  }
  document.body.appendChild(menu);
  const open = () => {
    menu.classList.add('on');
    document.exitPointerLock?.();
  };
  const close = () => menu.classList.remove('on');
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F9') {
      e.preventDefault();
      e.stopImmediatePropagation();
      menu.classList.contains('on') ? close() : open();
      return;
    }
    if (!menu.classList.contains('on')) return;
    if (e.code === 'Escape') { e.stopImmediatePropagation(); close(); return; }
    const c = CHAPTERS.find((ch) => ch.key === e.key);
    if (c) { e.preventDefault(); go(c); }
  }, true);
}

let styled = false;
function injectStyle() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
.demo-card { position: fixed; inset: 0; z-index: 70; background: #000; opacity: 0; transition: opacity .6s ease;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  pointer-events: none; color: #cfefff; font-family: sans-serif; text-align: center; }
.demo-card.on { opacity: 1; }
.demo-card.fade-text > * { opacity: 0; transition: opacity .3s ease; }
.demo-card-tag { font-size: .75rem; letter-spacing: .4em; color: #6fb6c9; }
.demo-card-title { font-size: 1.6rem; font-weight: 300; letter-spacing: .08em; }
.demo-card-detail { font-size: .95rem; color: #8aa9b4; max-width: 34em; }
.demo-badge { position: fixed; right: 12px; bottom: 10px; z-index: 75; pointer-events: none;
  font: 600 .68rem sans-serif; letter-spacing: .25em; color: rgba(160, 225, 240, .55); }
.demo-menu { position: fixed; inset: 0; z-index: 90; display: none; align-items: center; justify-content: center;
  background: rgba(0, 6, 10, .82); font-family: sans-serif; }
.demo-menu.on { display: flex; }
.demo-menu-box { width: min(560px, 92vw); border: 1px solid rgba(111, 182, 201, .4); background: rgba(4, 16, 22, .95);
  padding: 22px 24px; color: #cfefff; }
.demo-menu-head { font-size: .8rem; letter-spacing: .35em; color: #6fb6c9; margin-bottom: 14px; }
.demo-menu-list { display: flex; flex-direction: column; gap: 6px; }
.demo-menu-row { display: grid; grid-template-columns: 2em 1fr auto; align-items: baseline; gap: 10px; text-align: left;
  background: transparent; border: 1px solid rgba(111, 182, 201, .18); color: inherit; padding: 9px 12px; cursor: pointer;
  font: inherit; }
.demo-menu-row:hover { background: rgba(111, 182, 201, .14); border-color: rgba(111, 182, 201, .5); }
.demo-menu-row .k { color: #6fb6c9; font-weight: 600; }
.demo-menu-row .n { font-size: 1rem; }
.demo-menu-row .d { font-size: .8rem; color: #8aa9b4; }
.demo-menu-foot { margin-top: 14px; font-size: .75rem; color: #6d8a94; }
`;
  document.head.appendChild(s);
}

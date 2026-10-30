import { CREDITS_HTML } from '../intro/credits.js';

// The credits at the end of the game: CREDITS.md (the same text as the opening menu's CREDITS
// screen, src/intro/credits.js, in the same look), rolling slowly up from below, under the game's
// title. The wheel or the arrow keys scroll it by hand; Enter, Esc or the button closes it, as
// does reaching its end (after a short hold). show() resolves when it has closed.

const STYLE = `
@font-face { font-family: 'Orbitron'; src: url('./assets/fonts/orbitron.ttf') format('truetype'); font-weight: 400 900; font-display: block; }
.ec-root { position: fixed; inset: 0; z-index: 70; background: #02080c; opacity: 0; transition: opacity 1.6s ease;
  font-family: 'Helvetica Neue', 'Segoe UI Light', 'Segoe UI', Arial, sans-serif; }
.ec-root.on { opacity: 1; }
.ec-scroll { position: absolute; inset: 0; overflow-y: auto; scrollbar-width: none; }
.ec-scroll::-webkit-scrollbar { display: none; }
.ec-body { max-width: 920px; margin: 0 auto; padding: 100vh 16px 60vh; color: rgba(232, 244, 241, 0.86); font-size: 0.92rem;
  line-height: 1.55; letter-spacing: 0.02em; }
.ec-title { text-align: center; font-family: 'Orbitron', 'Segoe UI', sans-serif; font-weight: 600; font-size: clamp(1.8rem, 5vw, 4.6rem);
  letter-spacing: 0.32em; padding-left: 0.32em; color: #eef5f3; text-shadow: 0 0 28px rgba(0, 229, 255, 0.38); margin-bottom: 1.2rem; }
.ec-sub { text-align: center; font-weight: 200; letter-spacing: 0.46em; text-transform: uppercase; color: rgba(232, 244, 241, 0.7);
  margin-bottom: 16vh; }
.ec-body h1 { font-weight: 200; font-size: clamp(1.4rem, 3vw, 2.2rem); letter-spacing: 0.3em; color: #eef5f3;
  text-shadow: 0 0 18px rgba(0, 229, 255, 0.3); margin: 0 0 1.2rem; }
.ec-body h2 { font-weight: 300; font-size: 1.15rem; letter-spacing: 0.14em; color: #9feaf5; margin: 2.2rem 0 0.6rem;
  padding-bottom: 0.35rem; border-bottom: 1px solid rgba(0, 229, 255, 0.2); }
.ec-body p, .ec-body ul { margin: 0.6rem 0; }
.ec-body ul { padding-left: 1.3rem; }
.ec-body a { color: #7fdcea; word-break: break-all; }
.ec-body code { font-family: Consolas, monospace; font-size: 0.85em; color: #cfe8e6; background: rgba(255, 255, 255, 0.06); padding: 0 0.25em; word-break: break-all; }
.ec-body .hi-table { overflow-x: auto; margin: 0.8rem 0; }
.ec-body table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
.ec-body th, .ec-body td { text-align: left; vertical-align: top; padding: 0.45rem 0.7rem; border-bottom: 1px solid rgba(207, 232, 230, 0.12); }
.ec-body th { font-weight: 400; color: #9feaf5; letter-spacing: 0.06em; }
.ec-end { text-align: center; margin-top: 18vh; font-weight: 200; letter-spacing: 0.4em; color: rgba(232, 244, 241, 0.75); }
.ec-close { position: absolute; top: 2.4vh; right: max(16px, 2.4vw); z-index: 1; background: rgba(2, 8, 12, 0.94); color: #eef5f3;
  border: 1px solid rgba(207, 232, 230, 0.45); padding: 0.6rem 1.6rem; font: 200 0.9rem/1 inherit; letter-spacing: 0.3em; cursor: pointer; }
.ec-close:hover, .ec-close:focus-visible { background: rgba(0, 229, 255, 0.1); border-color: rgba(0, 229, 255, 0.7); outline: none; }
`;

const SPEED = 38;        // px a second
const HOLD = 4;          // seconds held at the end before it closes

export function showEndCredits(root = document.body) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'ec-root';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Credits');
  el.innerHTML = `<button type="button" class="ec-close">CLOSE</button>
    <div class="ec-scroll"><div class="ec-body">
      <div class="ec-title">HALCYON-9</div><div class="ec-sub">Thank you for playing</div>
      ${CREDITS_HTML}
      <div class="ec-end">THE END</div>
    </div></div>`;
  root.appendChild(el);
  document.exitPointerLock?.();
  const scroll = el.querySelector('.ec-scroll');
  const close = el.querySelector('.ec-close');
  requestAnimationFrame(() => el.classList.add('on'));
  return new Promise((resolve) => {
    let last = performance.now(), held = 0, pos = 0, raf = 0, done = false, by = 0;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      el.classList.remove('on');
      setTimeout(() => {
        el.remove();
        style.remove();
        resolve();
      }, 1700);
    };
    const onKey = (e) => {
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish();
      } else if (e.code === 'ArrowDown' || e.code === 'ArrowUp' || e.code === 'PageDown' || e.code === 'PageUp') {
        by += { ArrowDown: 80, ArrowUp: -80, PageDown: 400, PageUp: -400 }[e.code];
      }
    };
    window.addEventListener('keydown', onKey, true);
    close.addEventListener('click', finish);
    scroll.addEventListener('wheel', (e) => { by += e.deltaY; }, { passive: true });
    const step = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const max = scroll.scrollHeight - scroll.clientHeight;
      pos = Math.max(0, Math.min(max, pos + SPEED * dt + by));
      by = 0;
      scroll.scrollTop = pos;
      if (pos >= max - 1) held += dt;
      if (held > HOLD) return finish();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });
}

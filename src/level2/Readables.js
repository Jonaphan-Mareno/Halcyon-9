import { LOGS } from './Level2Lines.js';

// Level 2's readables (scenes 2.6 to 2.8): one panel over the game for everything Voss reads,
// hears or watches. The entries and their words are LOGS in Level2Lines.js; each has a kind:
//
//   note     a card or a sheet of paper (hand: true for handwriting)
//   letter   handwriting on paper
//   file     a terminal file, typed out, with any corrupted end shown as static
//   audio    an audio log: a level meter and the transcript revealed as it plays
//   video    a video log on a battered handheld: the recording if it exists, otherwise its
//            title card over moving static with the words as subtitles. A log that names a head
//            (Level2Lines.js) shows that character live after the title card instead of static
//            (LogHead.js), talking in step with the subtitles; its spoken lines in `after` (who
//            says what, e.g. Kessler off camera) are revealed after the words, each speaker in
//            their own colour, and the face only talks for its own lines
//
// Recordings are optional and go in public/assets/audio/logs/<id>.mp3 (audio logs) and
// public/assets/video/logs/<id>.mp4 (video logs). Until one exists the words reveal at reading
// speed. A live head's voice can go in public/assets/audio/logs/<id>.mp3 too: it then sets the
// pace and the mouth follows the sound. A TERMINAL is a numbered list of entries (Voss's personal
// log, the lab's files).
//
// It works from the keyboard while the mouse stays captured: Enter skips to the end or moves on,
// number keys or the arrows pick from a list, E or Escape goes back and closes.
//
// montage(ids) plays entries one after another by themselves, with a cut between them, like
// memories coming back (Voss's personal logs). Enter skips to the next snippet, E skips them all.

const LOG_AUDIO = './assets/audio/logs/';
const LOG_VIDEO = './assets/video/logs/';
const READ_RATE = 15;            // characters a second a transcript reveals at without a recording
const MONTAGE_RATE = 26;         // the same, in the memory montage (it keeps moving)
const MONTAGE_HOLD = 2.2;        // seconds a snippet stays up once its words are out (a letter: 5)
const TYPE_RATE = 70;            // characters a second a terminal file types out at
const TITLE_CARD = 1.8;          // seconds a video log's title card shows before the words
const STATIC_FPS = 15;

// 'Off-camera, Kessler: "Voss. Switch it off." Voss: "In a minute."' -> the labels and who says
// each quoted line: [{ text, who }] (who is null for a label, else the speaker's name, lower case)
function speakers(after) {
  let who = null;
  return after.split(/("[^"]*")/).filter(Boolean).map((text) => {
    if (text.startsWith('"')) return { text, who };
    who = (/(\w+):\s*$/.exec(text) || [])[1]?.toLowerCase() || null;
    return { text, who: null };
  });
}

export class Readables {
  // hooks: { onOpen(), onClose(), onFinished(id) (an entry has been read or played to the end),
  //          onShown(id) (an entry was opened), head(name) (a LogHead for a video log's live
  //          head, or null; made when first needed, disposed when the reader closes) }
  constructor(root, hooks = {}) {
    this.hooks = hooks;
    this.el = document.createElement('div');
    this.el.id = 'reader';
    this.el.innerHTML = `
      <div class="rd-frame">
        <div class="rd-head"></div>
        <div class="rd-sub"></div>
        <div class="rd-screen"><canvas width="160" height="90"></canvas><canvas class="rd-live"></canvas><video playsinline></video><div class="rd-card"></div></div>
        <div class="rd-meter"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="rd-body"></div>
        <div class="rd-after"></div>
        <div class="rd-list"></div>
        <div class="rd-foot"></div>
      </div>`;
    root.appendChild(this.el);
    const q = (s) => this.el.querySelector(s);
    this.frame = q('.rd-frame');
    this.headEl = q('.rd-head');
    this.subEl = q('.rd-sub');
    this.screenEl = q('.rd-screen');
    this.canvas = q('canvas');
    this.liveEl = q('.rd-live');
    this.heads = {};                 // name -> LogHead, while the reader is open
    this.ctx2d = this.canvas.getContext('2d');
    this.noise = this.ctx2d.createImageData(160, 90);
    this.videoEl = q('video');
    this.cardEl = q('.rd-card');
    this.meterEl = q('.rd-meter');
    this.bars = [...this.meterEl.children];
    this.bodyEl = q('.rd-body');
    this.afterEl = q('.rd-after');
    this.listEl = q('.rd-list');
    this.footEl = q('.rd-foot');
    this.audio = null;
    this.seen = new Set();
    this.isOpen = false;
    this._staticT = 0;
  }

  // Read one entry, or several one after another (Enter turns the page)
  read(ids, onDone) {
    this.term = null;
    this.pages = Array.isArray(ids) ? ids : [ids];
    this.page = 0;
    this.isMontage = false;
    this.onDone = onDone || null;
    this._open();
    this._show(this.pages[0]);
  }

  // Play entries one after another with no choosing: play, cut, play, cut
  montage(ids, onDone) {
    this.term = null;
    this.pages = ids;
    this.page = 0;
    this.isMontage = true;
    this.onDone = onDone || null;
    this._open();
    this.el.classList.add('montage');
    this._show(ids[0]);
  }

  // A terminal: a numbered list of entries to open one at a time
  terminal(title, ids, onDone) {
    this.term = { title, ids, pick: 0 };
    this.pages = null;
    this.isMontage = false;
    this.onDone = onDone || null;
    this._open();
    this._showList();
  }

  close() {
    if (!this.isOpen) return;
    this._stopMedia();
    for (const h of Object.values(this.heads)) h.dispose();
    this.heads = {};
    this.isOpen = false;
    this.isMontage = false;
    this.el.classList.remove('visible', 'montage');
    const done = this.onDone;
    this.onDone = null;
    this.hooks.onClose?.();
    done?.();
  }

  _open() {
    if (!this.isOpen) {
      this.isOpen = true;
      this.el.classList.add('visible');
      this.hooks.onOpen?.();
    }
  }

  // ------------------------------------------------------------------ showing things
  _reset(kind) {
    this._stopMedia();
    this.frame.className = 'rd-frame rd-' + kind;
    for (const el of [this.subEl, this.bodyEl, this.afterEl, this.listEl, this.cardEl]) el.textContent = '';
    this.screenEl.style.display = 'none';
    this.meterEl.style.display = 'none';
    this.videoEl.style.display = 'none';
    this.afterEl.style.display = 'none';
    this.liveEl.classList.remove('on');
    for (const h of Object.values(this.heads)) h.stop();
  }

  // The live head on screen right now, if any (the game draws it: see LogHead.render)
  get liveHead() {
    const e = this.entry;
    return e && e.liveOn && e.media !== this.videoEl ? e.live : null;
  }

  _showList() {
    const t = this.term;
    this.entry = null;
    this._reset('menu');
    this.headEl.textContent = t.title;
    this.subEl.textContent = t.ids.length + ' ENTRIES';
    t.ids.forEach((id, i) => {
      const row = document.createElement('div');
      row.className = 'rd-item' + (i === t.pick ? ' on' : '') + (this.seen.has(id) ? ' seen' : '');
      row.textContent = (i + 1) + '   ' + LOGS[id].title + (LOGS[id].author ? '   (' + LOGS[id].author + ')' : '');
      this.listEl.appendChild(row);
    });
    this.footEl.textContent = '1-' + t.ids.length + ' or arrows + Enter: open      E: close';
  }

  _show(id) {
    const log = LOGS[id];
    if (!log) return;
    this.entry = { id, log, shown: 0, done: false, t: 0, total: log.text.length, media: null };
    this._reset(log.kind === 'note' && log.hand ? 'letter' : log.kind);
    this.headEl.textContent = log.title;
    this.hooks.onShown?.(id);
    if (log.kind === 'audio') {
      this.subEl.textContent = 'AUDIO LOG';
      this.meterEl.style.display = '';
      this._tryMedia(new Audio(LOG_AUDIO + id + '.mp3'));
    } else if (log.kind === 'video') {
      this.subEl.textContent = 'J. VOSS: PERSONAL LOG';
      this.screenEl.style.display = '';
      this.cardEl.textContent = log.title;
      this._liveFor(this.entry);
      this.videoEl.src = LOG_VIDEO + id + '.mp4';
      // no recording: a live head may still have its voice recorded
      this._tryMedia(this.videoEl, true, () => {
        if (this.entry.live) this._tryMedia(new Audio(LOG_AUDIO + id + '.mp3'));
      });
    } else if (log.kind === 'file') {
      this.subEl.textContent = 'RESTRICTED DIRECTORY' + (log.author ? '   |   WRITTEN BY ' + log.author : '');
    }
    if (log.kind === 'note' || log.kind === 'letter') this._finish();   // paper is read at a glance
    this._footer();
  }

  // a recording, if it loads: it drives the reveal; if not, the words reveal at reading speed
  _tryMedia(el, isVideo = false, onMissing = null) {
    const entry = this.entry;
    el.addEventListener('loadedmetadata', () => {
      if (this.entry !== entry || entry.done) return;
      entry.media = el;
      if (isVideo) {
        // the real recording wins over a live head
        this.videoEl.style.display = '';
        this.cardEl.textContent = '';
        this.liveEl.classList.remove('on');
        entry.live?.stop();
      } else if (entry.live) {
        entry.live.rig.attachAudio(el);    // a live head's recorded voice: the mouth follows it
        // ...and starts with his face, once the title card is done (see update)
        if (!entry.liveOn) {
          entry.voiceWaits = true;
          return;
        }
      }
      el.play().catch(() => { entry.media = null; });
    }, { once: true });
    el.addEventListener('ended', () => {
      if (this.entry !== entry) return;
      // a recording of the words only: the spoken lines carry on after it at reading speed
      if (entry.log.linesAfterVoice && entry.lines && !entry.done) {
        entry.media = null;
        entry.afterFrom = entry.t;
        entry.shown = entry.log.text.length;
        this.bodyEl.textContent = entry.log.text;
        if (entry.live) {
          entry.live.rig.stopSpeaking();
          entry.live.rig.muted = false;
        }
        return;
      }
      this._finish();
    }, { once: true });
    el.addEventListener('error', () => {
      if (entry.media === el) entry.media = null;
      if (this.entry === entry) onMissing?.();
    }, { once: true });
    if (!isVideo) {
      el.preload = 'auto';
      this.audio = el;
    }
  }

  _stopMedia() {
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    this.videoEl.pause();
    this.videoEl.removeAttribute('src');
    this.videoEl.load();
  }

  _finish() {
    const e = this.entry;
    if (!e || e.done) return;
    e.done = true;
    e.shown = e.total;
    this.bodyEl.textContent = e.log.text;
    if (e.lines) this._showLines(e, Infinity);
    else if (e.log.after) {
      this.afterEl.style.display = '';
      this.afterEl.textContent = e.log.after;
    }
    if (e.media) e.media.pause();
    e.live?.rig.stopSpeaking();
    this.seen.add(e.id);
    this._footer();
    this.hooks.onFinished?.(e.id);
  }

  _footer() {
    const e = this.entry;
    if (!e) return;
    if (this.isMontage) {
      this.footEl.textContent = 'Enter: next      E: skip all';
      return;
    }
    const more = this.pages && this.page < this.pages.length - 1;
    if (!e.done) this.footEl.textContent = 'Enter: skip      E: ' + (this.term ? 'back' : 'close');
    else if (more) this.footEl.textContent = 'Enter: next      E: close';
    else this.footEl.textContent = 'Enter / E: ' + (this.term ? 'back' : 'close');
  }

  // ------------------------------------------------------------------ keys
  key(e) {
    if (!this.isOpen || e.repeat) return;
    const t = this.term;
    if (t && !this.entry) {
      // the list
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= t.ids.length) this._pick(n - 1);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') { t.pick = (t.pick + 1) % t.ids.length; this._showList(); }
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') { t.pick = (t.pick + t.ids.length - 1) % t.ids.length; this._showList(); }
      else if (e.code === 'Enter') this._pick(t.pick);
      else if (e.code === 'KeyE' || e.code === 'Escape') this.close();
      return;
    }
    if (this.isMontage) {
      if (e.code === 'Enter') this._advanceMontage();
      else if (e.code === 'KeyE' || e.code === 'Escape') this.close();
      return;
    }
    if (e.code === 'Enter') {
      if (!this.entry.done) this._finish();
      else this._next();
    } else if (e.code === 'KeyE' || e.code === 'Escape') {
      if (t) this._back();
      else this.close();
    }
  }

  // the next snippet, with a cut; after the last one the montage is over
  _advanceMontage() {
    if (this.page >= this.pages.length - 1) {
      this.close();
      return;
    }
    this.frame.classList.remove('cut');
    void this.frame.offsetWidth;
    this.frame.classList.add('cut');
    this._show(this.pages[++this.page]);
  }

  _pick(i) {
    this.term.pick = i;
    this._show(this.term.ids[i]);
  }

  _next() {
    if (this.term) return this._back();
    if (this.page < this.pages.length - 1) this._show(this.pages[++this.page]);
    else this.close();
  }

  _back() {
    this._stopMedia();
    this._showList();
  }

  // ------------------------------------------------------------------ live heads
  // A video log with a head (and the hook to make one): the head is set up for this log now and
  // shown once the title card is done. Its spoken lines (`after`) become part of the reveal.
  _liveFor(e) {
    const name = e.log.head;
    if (!name || !this.hooks.head) return;
    const head = (this.heads[name] ||= this.hooks.head(name));
    if (!head) {
      delete this.heads[name];
      return;
    }
    e.live = head;
    head.start(this.liveEl, { condition: e.log.condition, face: e.log.face });
    if (e.log.after && e.log.after.includes('"')) {
      e.lines = speakers(e.log.after);
      e.total += e.lines.reduce((n, l) => n + l.text.length, 0);
      this.afterEl.textContent = '';
      for (const l of e.lines) {
        l.el = document.createElement('span');
        l.el.className = l.who ? 'rd-' + l.who : 'rd-label';
        this.afterEl.appendChild(l.el);
      }
    }
    // the log's beats, each at the letter of the reveal where its words start
    const said = e.log.text + (e.lines || []).map((l) => l.text).join('');
    e.beats = (e.log.beats || []).map((b) => ({ ...b, k: said.indexOf(b.at) })).filter((b) => {
      if (b.k < 0) console.warn('Readables: beat not found in', e.id, JSON.stringify(b.at));
      return b.k >= 0;
    }).sort((a, b) => a.k - b.k);
    e.beat = 0;
  }

  // The beats the reveal has reached (at letter `shown`): the head acts them; without a recording a
  // beat's pause holds the words just before its own, and its rate speeds or slows the rest
  _beats(e, shown) {
    while (e.beat < e.beats.length && e.beats[e.beat].k <= shown) {
      const b = e.beats[e.beat++];
      e.live.cue(b);
      if (e.media || this.isMontage || e.afterFrom !== undefined) continue;
      if (b.rate) e.speed = b.rate;
      if (b.pause) {
        e.wait = b.pause;
        e.pos = Math.min(e.pos, b.k);
      }
    }
  }

  // How many letters of the reveal a recording has reached at time t. A recording of the words only
  // (linesAfterVoice) covers just the words; without cues the letters are spread evenly over it; with `cues` (the times the spoken lines start in the recording, see
  // Level2Lines) the words fill the time before the first cue and each line runs from its cue
  _mediaShown(e, t, duration) {
    const cues = e.log.cues;
    if (e.log.linesAfterVoice) return e.log.text.length * Math.min(1, t / duration);
    if (!cues || !e.lines) return e.total * Math.min(1, t / duration);
    const spans = [{ len: e.log.text.length, from: 0, to: cues[0] }];
    let q = 0, label = 0;
    for (const l of e.lines) {
      if (!l.text.startsWith('"')) {
        label += l.text.length;                // a speaker label shows with its line
        continue;
      }
      const from = cues[q] ?? duration, to = cues[q + 1] ?? duration;
      if (label) spans.push({ len: label, from, to: from });
      spans.push({ len: l.text.length, from, to });
      label = 0;
      q++;
    }
    let n = 0;
    for (const s of spans) {
      if (t >= s.to) n += s.len;
      else {
        if (t > s.from) n += s.len * (t - s.from) / (s.to - s.from);
        break;
      }
    }
    return Math.min(e.total, n);
  }

  // Who says letter k of the reveal: the head (its words), or a spoken line's speaker
  _speakerAt(e, k) {
    if (k < e.log.text.length) return e.log.head;
    k -= e.log.text.length;
    for (const l of e.lines || []) {
      if (k < l.text.length) return l.who;
      k -= l.text.length;
    }
    return null;
  }

  // letter k of the whole reveal (the words, then the spoken lines): the head moves its mouth for
  // its own words only; while someone else speaks, it keeps its mouth shut
  _say(e, k) {
    const text = e.log.text;
    if (k < text.length) return e.live.rig.say(text[k]);
    k -= text.length;
    for (const l of e.lines) {
      if (k < l.text.length) {
        if (l.who === e.log.head) e.live.rig.say(l.text[k]);
        else e.live.rig.stopSpeaking();
        return;
      }
      k -= l.text.length;
    }
  }

  // the spoken lines, the first n letters of them
  _showLines(e, n) {
    this.afterEl.style.display = '';
    for (const l of e.lines) {
      const show = Math.max(0, Math.min(l.text.length, n));
      if (l.el.textContent.length !== show) l.el.textContent = l.text.slice(0, show);
      n -= l.text.length;
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    if (!this.isOpen) return;
    const e = this.entry;
    if (e && e.log.kind === 'video' && !e.media && !e.liveOn) this._drawStatic(dt);
    if (e?.live && e.media !== this.videoEl) e.live.update(dt);
    if (e && e.log.kind === 'audio') this._meter(e);
    if (e && e.done && this.isMontage) {
      // the words are out: hold a moment, then cut to the next memory
      e.hold = (e.hold || 0) + dt;
      if (e.hold > (e.log.kind === 'letter' ? 5 : MONTAGE_HOLD)) this._advanceMontage();
    }
    if (!e || e.done) return;
    e.t += dt;
    const kind = e.log.kind;
    let shown;
    const card = this.isMontage ? 1.0 : TITLE_CARD;
    if (kind === 'video' && e.media !== this.videoEl && e.t > card) {
      // the title card is done: the words start, and a live head replaces the static
      this.cardEl.textContent = '';
      if (e.live && !e.liveOn) {
        e.liveOn = true;
        this.liveEl.classList.add('on');
      }
      if (e.voiceWaits && e.media) {
        e.voiceWaits = false;
        e.media.play().catch(() => { e.media = null; });
      }
    }
    if (e.afterFrom !== undefined) {
      shown = e.log.text.length + (e.t - e.afterFrom) * (this.isMontage ? MONTAGE_RATE : READ_RATE);
      if (e.beats && e.liveOn) this._beats(e, shown);
    } else if (e.media && e.media.duration > 0) {
      shown = this._mediaShown(e, e.media.currentTime, e.media.duration);
      // a recorded live head keeps its mouth shut while someone else speaks
      if (e.live) e.live.rig.muted = this._speakerAt(e, Math.floor(shown)) !== e.log.head;
      if (e.beats && e.liveOn && e.media !== this.videoEl) this._beats(e, shown);
    } else if (kind === 'video') {
      // the title card first, then the words over the static (or the live head), held and sped
      // up or slowed by the head's beats
      e.pos ||= 0;
      if (e.t > card) {
        if (e.wait > 0) e.wait -= dt;
        else e.pos += dt * (this.isMontage ? MONTAGE_RATE : READ_RATE) * (e.speed || 1);
      }
      if (e.beats && e.liveOn) this._beats(e, e.pos);
      shown = e.pos;
    } else {
      shown = e.t * (kind === 'file' ? TYPE_RATE : this.isMontage ? MONTAGE_RATE : READ_RATE);
    }
    const n = Math.min(e.total, Math.floor(shown));
    if (n !== e.shown) {
      // the live head says each new letter as it appears (the same clock as the subtitles)
      if (e.liveOn && !e.media) for (let k = e.shown; k < n; k++) this._say(e, k);
      e.shown = n;
      this.bodyEl.textContent = e.log.text.slice(0, n);
      if (e.lines && n > e.log.text.length) this._showLines(e, n - e.log.text.length);
    }
    if (n >= e.total && !e.media) this._finish();
  }

  // grey static on the handheld's screen, a few times a second
  _drawStatic(dt) {
    this._staticT -= dt;
    if (this._staticT > 0) return;
    this._staticT = 1 / STATIC_FPS;
    const d = this.noise.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 120) | 0;
      d[i] = v; d[i + 1] = v + 8; d[i + 2] = v + 12; d[i + 3] = 255;
    }
    this.ctx2d.putImageData(this.noise, 0, 0);
  }

  // the audio log's level meter: busy while the voice plays, flat once it ends
  _meter(e) {
    const live = !e.done;
    for (let i = 0; i < this.bars.length; i++) {
      const h = live ? 15 + Math.random() * 85 * (0.5 + 0.5 * Math.sin(e.t * 9 + i)) : 6;
      this.bars[i].style.height = h.toFixed(0) + '%';
    }
  }
}

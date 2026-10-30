// Builds the devlog video from timeline.js (dev only; ffmpeg on the PATH, Chrome or Edge, Node 22+):
//   node devlog/video/build.mjs <scratch dir> [data] [base] [audio] [overlay] [compose]   (no stage: all)
// The footage goes in the screen (1080x506), cut to each beat's exact length; the drawn layer
// (overlay.html) is rendered on a transparent page at 12 fps and laid over it; the game's sound is
// kept quiet under the gags' sound effects. Writes devlog/out/halcyon9-devlog-clean.mp4 (for the
// voices to go on) and devlog/out/halcyon9-devlog-prompter.mp4 (each line on screen, to read from
// while recording), and devlog/out/cues.md (every line with its time, per person).
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { BEATS, lengths } from './timeline.js';
import { launchBrowser } from '../../scripts/flashback1-photo/cdp.mjs';

const ROOT = resolve('.');
const HERE = join(ROOT, 'devlog/video');
const OUT = join(ROOT, 'devlog/out');
const [scratch, ...stages] = process.argv.slice(2);
const want = (s) => !stages.length || stages.includes(s);
const B = join(scratch, 'build');
const GP = 'C:/Users/Naomi/Downloads/gameplaypart1.mp4';
const FPS = 30, OFPS = 12, SW = 1080, SH = 506, CODE_W = 640;
mkdirSync(B, { recursive: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(join(HERE, 'build'), { recursive: true });

// ---- the beats' times, in whole frames
const L = lengths();
let acc = 0;
const beats = BEATS.map((b, i) => {
  const f0 = Math.round(acc * FPS);
  acc += L[i];
  const f1 = Math.round(acc * FPS);
  return { ...b, i, f0, frames: f1 - f0, start: f0 / FPS, len: (f1 - f0) / FPS };
});
const TOTAL = acc;
const sec = (s) => { const [m, x] = s.split(':').map(Number); return m * 60 + x; };
const ff = (args, label) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${label}): ${String(r.stderr).slice(-1500)}`);
};

// ---------------------------------------------------------------- data for the overlay
if (want('data')) {
  const code = {};
  for (const b of beats) {
    if (!b.code) continue;
    const lines = readFileSync(join(ROOT, b.code.file), 'utf8').split('\n').slice(b.code.from - 1, b.code.to);
    const shader = /Shaders|parallax|FrostWater|Gates|Water|Kraken|SeaScene/.test(b.code.file);
    const inGlsl = shader && lines.filter((l) => /\b(vec[234]|float|uniform|varying|gl_)\b/.test(l)).length > lines.length / 3;
    code[b.code.file + ':' + b.code.from] = { lines: lines.map((l) => l.replace(/\r$/, '')), lang: inGlsl ? 'glsl' : 'javascript' };
  }
  const outliner = {};
  const bd = join(scratch, 'blender');
  if (existsSync(bd)) for (const n of readdirSync(bd)) {
    const f = join(bd, n, 'outliner.json');
    if (existsSync(f)) outliner[n] = JSON.parse(readFileSync(f, 'utf8'));
  }
  const script = readFileSync(join(ROOT, 'Blender/scripts/build_l2_atrium.py'), 'utf8').split('\n').slice(0, 160).join('\n');
  writeFileSync(join(HERE, 'build/data.json'), JSON.stringify({ total: TOTAL, beats: beats.map(({ f0, frames, ...b }) => b), code, outliner, script }));
  console.log('data:', beats.length, 'beats,', (TOTAL / 60).toFixed(2), 'min');
}

// ---------------------------------------------------------------- the footage, beat by beat
// One source as a filter chain giving [out] at w x h, exactly `frames` long. Returns { inputs, filter }.
function source(src, w, h, frames, tag, inputs) {
  const dur = frames / FPS;
  const add = (args) => { inputs.push(...args); return inputs.filter((a) => a === '-i').length - 1; };
  const fit = (lbl) => `[${lbl}]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;
  if (src.black) return `color=c=black:s=${w}x${h}:r=${FPS}:d=${dur},trim=end_frame=${frames}[${tag}]`;
  if (src.gp) {
    const parts = src.gp.map(([a, b]) => {
      const k = add(['-ss', String(sec(a)), '-t', String(sec(b) - sec(a)), '-i', GP]);
      const crop = src.zoomMenu ? 'crop=640:300:60:170,' : '';
      return `[${k}:v]${crop}fps=${FPS},scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1[${tag}p${k}]`;
    });
    const ks = parts.map((p) => p.match(/\[(\w+)\]$/)[1]);
    const have = src.gp.reduce((s, [a, b]) => s + sec(b) - sec(a), 0);
    const slow = Math.min(1.5, Math.max(1, dur / have));
    return parts.join(';') + `;${ks.map((k) => `[${k}]`).join('')}concat=n=${ks.length}:v=1:a=0,setpts=${slow.toFixed(4)}*PTS,fps=${FPS},tpad=stop_mode=clone:stop_duration=${dur},trim=end_frame=${frames},setpts=PTS-STARTPTS[${tag}]`;
  }
  if (src.seq || src.old) {
    const dir = src.seq ? join(scratch, src.seq) : join(scratch, 'old', src.old);
    const rate = src.seq ? 24 : 10;
    const n = readdirSync(dir).filter((f) => f.endsWith('.png')).length;
    const k = add(['-framerate', String(rate), '-i', join(dir, 'f%04d.png')]);
    // back and forth, round and round, for as long as the beat lasts
    const kb = src.old ? `,scale=${Math.round(w * 1.08)}:${Math.round(h * 1.08)},crop=${w}:${h}:x='(iw-ow)*t/${dur.toFixed(2)}':y='(ih-oh)/2'` : '';
    return `[${k}:v]fps=${FPS},setsar=1,split[${tag}a][${tag}b];[${tag}b]reverse[${tag}r];[${tag}a][${tag}r]concat=n=2:v=1:a=0,loop=loop=-1:size=${Math.ceil(n * FPS / rate) * 2}:start=0,${fit('x').slice(3)}${kb},trim=end_frame=${frames},setpts=PTS-STARTPTS[${tag}]`;
  }
  return `color=c=black:s=${w}x${h}:r=${FPS}:d=${dur}[${tag}]`;
}

if (want('base')) {
  const list = [], missing = [];
  for (const b of beats) {
    const file = join(B, `seg${String(b.i).padStart(3, '0')}.mp4`);
    list.push(`file '${file.replace(/\\/g, '/')}'`);
    if (existsSync(file) && statSync(file).size > 1000 && !stages.includes('force')) continue;
    const srcs = b.split ? b.split : [b];
    if (srcs.some((x) => x.seq && !existsSync(join(scratch, x.seq, 'f0001.png')))) { missing.push(b.i); continue; }
    const inputs = [];
    let filter;
    if (b.split) {
      const l = source(b.split[0], SW / 2, SH, b.frames, 'L', inputs);
      const r = source(b.split[1], SW / 2, SH, b.frames, 'R', inputs);
      filter = `${l};${r};[L][R]hstack=inputs=2[v]`;
    } else if (b.code) {
      // the footage small, in the right part (the code card covers the left)
      const w = SW - CODE_W - 36, h = Math.round(w * SH / SW / 2) * 2;
      const s = source(b, w, h, b.frames, 'S', inputs);
      filter = `${s};color=c=black:s=${SW}x${SH}:r=${FPS}:d=${b.frames / FPS}[bg];[bg][S]overlay=${CODE_W + 24}:${Math.round((SH - h) / 2)}:shortest=1,trim=end_frame=${b.frames}[v]`;
    } else {
      filter = source(b, SW, SH, b.frames, 'v', inputs);
    }
    try {
      ff([...inputs, '-filter_complex', filter, '-map', '[v]', '-frames:v', String(b.frames), '-r', String(FPS),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', file], `beat ${b.i}`);
    } catch (e) {
      missing.push(b.i);
      console.log(`beat ${b.i}: not built yet (${String(e.message).split('\n')[0].slice(0, 160)})`);
    }
    process.stdout.write(`seg ${b.i}/${beats.length - 1}\r`);
  }
  writeFileSync(join(B, 'segs.txt'), list.join('\n'));
  if (missing.length) { console.log('base: missing beats', missing.join(', ')); process.exit(0); }
  ff(['-f', 'concat', '-safe', '0', '-i', join(B, 'segs.txt'), '-c', 'copy', join(B, 'base.mp4')], 'concat');
  console.log('\nbase: done');
}

// ---------------------------------------------------------------- the sound
const SFX = {
  pop: 'sfx/l3/bubble-1.ogg', pop2: 'sfx/l3/bubble-2.ogg', click: 'sfx/l3/click.ogg', confirm: 'sfx/l3/confirm.ogg',
  hiss: 'sfx/l3/air-hiss.ogg', hatch: 'sfx/l3/hatch-open.ogg', unlock: 'sfx/l3/hatch-unlock.ogg', clank: 'sfx/l3/clank-1.ogg',
  clang: 'sfx/l3/clang.ogg', creak: 'sfx/l3/creak-1.ogg', console: 'sfx/l3/console.ogg', error: 'sfx/l3/error.ogg',
  glass: 'sound-effects/universfield-broken-glass-impact-454859.mp3', button: 'sound-effects/button-press-tech.mp3'
};
// [beat kind, seconds into it, sound, volume]
const GAG_SFX = {
  intro: [...[0, 1, 2, 3, 4, 5].map((j) => [2.6 + j * 0.7, 'pop', 0.9])],
  shove: [[1.0, 'pop2', 0.7], [1.6, 'pop2', 0.7], [2.0, 'clank', 0.4], [2.7, 'pop2', 0.7], [3.1, 'pop2', 0.7], [3.3, 'pop2', 0.7], [4.9, 'creak', 0.5]],
  'jonaphan-climb': [[1.0, 'creak', 0.5], [2.6, 'pop', 0.6]],
  'simphiwe-hatch': [[0.2, 'hatch', 0.6], [1.8, 'pop', 0.5]],
  'thabiso-reach': [[1.2, 'click', 0.6], [2.4, 'pop', 0.6]],
  'naomi-torch': [[1.1, 'click', 0.7]],
  'tariro-rings': [[1.6, 'click', 0.8], [2.0, 'click', 0.8], [2.4, 'click', 0.8], [2.5, 'pop', 0.6]],
  'sivu-legs': [[3.0, 'button', 0.5], [3.5, 'confirm', 0.7]],
  'naomi-freeze-sivu': [[1.0, 'hiss', 0.6], [2.6, 'pop2', 0.6]],
  'simphiwe-drone': [[0.4, 'console', 0.5]],
  'naomi-swat': [[1.2, 'clank', 0.6], [2.2, 'glass', 0.5]],
  'jonaphan-vlog': [[0.6, 'button', 0.5]],
  'tariro-arm': [[0.6, 'clank', 0.6], [2.6, 'click', 0.8]],
  'naomi-hatch': [[0.2, 'hatch', 0.6], [1.6, 'pop', 0.5]],
  'simphiwe-ping': [[0.5, 'console', 0.6], [1.4, 'pop', 0.6]],
  'sivu-valves': [[1.0, 'unlock', 0.6], [1.9, 'hiss', 0.5]],
  'naomi-fps': [[1.3, 'error', 0.5], [2.6, 'confirm', 0.5]],
  'naomi-blind': [[0.7, 'clang', 0.5]],
  'pile-in': [[0.2, 'pop', 0.7], [0.45, 'pop', 0.7], [0.7, 'pop', 0.7], [0.95, 'pop', 0.7], [1.2, 'pop', 0.7], [2.4, 'pop2', 0.9]]
};
if (want('audio')) {
  // the game's own sound under the footage it belongs to, quiet (the voices go on top)
  const parts = [];
  for (const b of beats) {
    const w = join(B, `a${String(b.i).padStart(3, '0')}.wav`);
    const dur = (b.frames / FPS).toFixed(4);
    const gp = null;   // (the recording's own sound has ARIA's and Voss's lines in it: left out)
    if (gp) {
      const inputs = [], chain = [];
      gp.forEach(([a, c], k) => { inputs.push('-ss', String(sec(a)), '-t', String(sec(c) - sec(a)), '-i', GP); chain.push(`[${k}:a]`); });
      ff([...inputs, '-filter_complex', `${chain.join('')}concat=n=${gp.length}:v=0:a=1,volume=0.28,apad,atrim=0:${dur},aformat=sample_rates=48000:channel_layouts=stereo[a]`, '-map', '[a]', w], `audio ${b.i}`);
    } else {
      ff(['-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo`, '-t', dur, w], `silence ${b.i}`);
    }
    parts.push(`file '${w.replace(/\\/g, '/')}'`);
  }
  writeFileSync(join(B, 'audio.txt'), parts.join('\n'));
  ff(['-f', 'concat', '-safe', '0', '-i', join(B, 'audio.txt'), '-c', 'pcm_s16le', join(B, 'game.wav')], 'audio concat');
  // the gags' sound effects, placed and mixed in
  const hits = [];
  for (const b of beats) {
    for (const [at, k, v] of GAG_SFX[b.handoff] || []) hits.push([b.start + at, k, v]);
    if (b.pop) hits.push([b.start + 0.05, 'pop', 0.8]);
  }
  const inputs = ['-i', join(B, 'game.wav')], chain = [];
  // the team's own pop (devlog/audio/pop.mp3) for every pop, if it is there
  const ownPop = join(ROOT, 'devlog/audio/pop.mp3');
  const fileOf = (k) => (/^pop2?$/.test(k) && existsSync(ownPop) ? ownPop : join(ROOT, 'public/assets/audio', SFX[k]));
  hits.forEach(([at, k, v], j) => {
    inputs.push('-i', fileOf(k));
    chain.push(`[${j + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${v * 0.55},adelay=${Math.round(at * 1000)}|${Math.round(at * 1000)}[s${j}]`);
  });
  // the intro song (devlog/audio/intro-song.mp3): over the title and the pop-ins, and again over the
  // shove; it fades in and out slowly, and is gone before anyone speaks
  const song = join(ROOT, 'devlog/audio/intro-song.mp3');
  const songParts = [];
  if (existsSync(song)) {
    const intro = beats.find((b) => b.handoff === 'intro'), shove = beats.find((b) => b.handoff === 'shove');
    let from = 0;
    for (const b of [intro, shove]) {
      if (!b) continue;
      const k = hits.length + 1 + songParts.length, at = Math.round(b.start * 1000), d = b.len;
      inputs.push('-i', song);
      chain.push(`[${k}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=${from}:${from + d},asetpts=PTS-STARTPTS,`
        + `afade=t=in:st=0:d=${Math.min(2.0, d / 3)},afade=t=out:st=${(d - Math.min(2.5, d / 2.5)).toFixed(2)}:d=${Math.min(2.5, d / 2.5)},volume=0.6,adelay=${at}|${at}[m${songParts.length}]`);
      songParts.push(`[m${songParts.length}]`);
      from += d;                              // (the shove carries on where the title left off)
    }
  }
  const mix = `${chain.join(';')};[0:a]${hits.map((_, j) => `[s${j}]`).join('')}${songParts.join('')}amix=inputs=${hits.length + 1 + songParts.length}:normalize=0:duration=first[a]`;
  ff([...inputs, '-filter_complex', mix, '-map', '[a]', '-c:a', 'pcm_s16le', join(B, 'mix.wav')], 'sfx mix');
  console.log('audio: done,', hits.length, 'effects');
}

// ---------------------------------------------------------------- the drawn layer
if (want('overlay')) {
  const dir = join(B, 'overlay');
  mkdirSync(dir, { recursive: true });
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
  const server = createServer((req, res) => {
    const p = join(HERE, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(HERE) || !existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
    res.end(readFileSync(p));
  });
  await new Promise((ok) => server.listen(5391, ok));
  const page = await launchBrowser({ headless: true, width: 1280, height: 720, log: false });
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    await page.goto('http://localhost:5391/overlay.html');
    await page.evaluate('new Promise((r) => { const i = setInterval(() => { if (window.overlayReady) { clearInterval(i); r(); } }, 50); })');
    const n = Math.ceil(TOTAL * OFPS);
    const from = Number(process.env.FROM || 0);
    for (let k = from; k < n; k++) {
      const f = join(dir, `o${String(k).padStart(5, '0')}.png`);
      if (existsSync(f) && !process.env.REDO) continue;
      await page.evaluate(`window.renderAt(${(k / OFPS).toFixed(4)})`);
      const r = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      writeFileSync(f, Buffer.from(r.data, 'base64'));
      if (k % 120 === 0) process.stdout.write(`overlay ${k}/${n}\r`);
    }
    const errs = page.logs.filter((l) => /exception|error/i.test(l));
    if (errs.length) console.log('page errors:', errs.slice(0, 5).join('\n'));
    console.log('\noverlay: done,', n, 'frames');
  } finally {
    await page.close();
    server.close();
  }
}

// ---------------------------------------------------------------- the finished videos
const tc = (t) => {
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = (t % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${s}`;
};
const NAME = { naomi: 'NAOMI', jonaphan: 'JONAPHAN', tariro: 'TARIRO', sivu: 'SIVU', thabiso: 'THABISO', simphiwe: 'SIMPHIWE', everyone: 'EVERYONE' };
const COLOUR = { naomi: '&H00F7C8FF', jonaphan: '&H0066D9FF', tariro: '&H00A0FFB0', sivu: '&H00FFD27A', thabiso: '&H00FFA0D8', simphiwe: '&H007AE8FF', everyone: '&H00FFFFFF' };
if (want('compose')) {
  // the prompter: each line at the bottom, with who says it, and who is next during a gag
  const ass = [
    '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1280', 'PlayResY: 720', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // (karaoke: a word turns from grey to white when it should be said; the bar under it fills over the line's time)
    'Style: Line,Arial,25,&H00FFFFFF,&H00777777,&H00000000,&HB0000000,0,0,0,0,100,100,0,0,3,10,0,1,200,40,30,1',
    'Style: Next,Arial,20,&H00AAAAAA,&H00FFFFFF,&H00000000,&HB0000000,0,1,0,0,100,100,0,0,3,8,0,1,200,40,30,1',
    'Style: Bar,Arial,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1',
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ];
  const cues = {};
  for (const b of beats) {
    const end = b.start + b.len;
    if (b.line) {
      const text = b.line.replace(/\n/g, ' ');
      // the pace: the words share the speaking time (the line less its breath) by their length
      const speak = Math.max(0.6, b.len - 0.6 - (b.pad || 0));
      const words = text.split(/\s+/);
      const weight = words.map((w) => w.length + 2), sum = weight.reduce((a, c) => a + c, 0);
      const kara = words.map((w, k) => `{\\kf${Math.max(1, Math.round(speak * 100 * weight[k] / sum))}}${w} `).join('');
      ass.push(`Dialogue: 0,${tc(b.start)},${tc(end - 0.05)},Line,,0,0,0,,{\\1c${COLOUR[b.who]}\\b1}${NAME[b.who]}{\\1c&H00FFFFFF&\\b0}  ${kara}`);
      // and the bar under it: its track, and its fill growing over the speaking time
      const bar = 'm 0 0 l 1040 0 1040 7 0 7';
      ass.push(`Dialogue: 1,${tc(b.start)},${tc(end - 0.05)},Bar,,0,0,0,,{\\an7\\pos(200,704)\\1c&H00444444&\\p1}${bar}`);
      ass.push(`Dialogue: 2,${tc(b.start)},${tc(end - 0.05)},Bar,,0,0,0,,{\\an7\\pos(200,704)\\1c${COLOUR[b.who]}\\fscx0\\t(0,${Math.round(speak * 1000)},\\fscx100)\\p1}${bar}`);
      (cues[b.who] ||= []).push([tc(b.start).slice(2, 7), text]);
    } else if (b.handoff) {
      const nx = beats.slice(b.i + 1).find((x) => x.line);
      if (nx) ass.push(`Dialogue: 0,${tc(b.start)},${tc(end - 0.05)},Next,,0,0,0,,(gag) next: ${NAME[nx.who]}`);
    }
  }
  writeFileSync(join(B, 'prompter.ass'), ass.join('\n'));
  const md = ['# Devlog cues: every line with its time in the video', '',
    'Play `halcyon9-devlog-prompter.mp4` and read your lines when your name comes up (they are also on screen). Times are minutes:seconds.', '',
    '**Recording:** one file per line, named as in the table (your first name in lower case, a dash, the line number: `sivu-03.mp3`). Any format is fine (mp3, m4a or wav from a phone). Record somewhere quiet, with the phone about a hand away from your mouth, and leave a second of silence before and after the line. Say the line at the pace of the video: the words turn white as you should say them, and the bar fills as its time runs out.', '',
    '**"Everyone" lines** (the outro): each of you records it on your own, named `everyone-<your name>.mp3`; they are layered together.', ''];
  for (const [who, list] of Object.entries(cues)) {
    md.push(`## ${NAME[who]}`, '', '| File name | Time | Line |', '|---|---|---|');
    list.forEach(([time, text], k) => md.push(`| \`${who}-${String(k + 1).padStart(2, '0')}.mp3\` | ${time} | ${text.replace(/\|/g, '/')} |`));
    md.push('');
  }
  writeFileSync(join(OUT, 'cues.md'), md.join('\n'));

  const common = (subs) => {
    const v = `color=c=black:s=1280x720:r=${FPS}:d=${TOTAL.toFixed(3)}[bg];[bg][0:v]overlay=170:44[a];[1:v]fps=${FPS},format=rgba[o];[a][o]overlay=0:0:shortest=1${subs ? ',subtitles=prompter.ass' : ''}[v]`;
    return ['-i', join(B, 'base.mp4'), '-framerate', String(OFPS), '-i', join(B, 'overlay', 'o%05d.png'), '-i', join(B, 'mix.wav'),
      '-filter_complex', v, '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart'];
  };
  if (process.env.CUESONLY) { console.log('cues: done'); process.exit(0); }
  process.chdir(B);
  if (process.env.PREVIEW) {
    // (the part rendered so far, with the prompter, to watch while the rest renders)
    ff([...common(true), '-t', process.env.PREVIEW, '-preset', 'veryfast', join(OUT, 'halcyon9-devlog-preview.mp4')], 'preview');
    console.log('preview: done');
    process.exit(0);
  }
  // (the prompter first: it is the one needed for recording; the clean one only when asked for)
  ff([...common(true), join(OUT, 'halcyon9-devlog-prompter.mp4')], 'compose prompter');
  if (stages.includes('clean')) ff([...common(false), join(OUT, 'halcyon9-devlog-clean.mp4')], 'compose clean');
  console.log('compose: done');
}

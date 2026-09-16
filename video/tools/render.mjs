// Render the NestWell walkthrough animation (scenes/index.html) frame by frame through the Chrome
// DevTools Protocol. Node 24, no dependencies. Owner: SCENES. See VIDEO-BRIEF.md 3.5.
//
// usage:
//   node tools/render.mjs --preview 0,4,10.5     render those times to build/preview/t-<time>.png
//                        [--sheet name]          ...and lay them out in build/preview/sheet-<name>.png
//   node tools/render.mjs --scenes [ids]         three moments per scene (start + 0.8 s, middle, end - 0.8 s)
//                                                into build/preview/, plus contact sheets
//                                                build/preview/sheet.png (all) and sheet-<n>.png (3 scenes each)
//   node tools/render.mjs --full                 every frame at 30 fps -> build/video-silent.mp4 (Chrome port 9401)
//   node tools/render.mjs --full --range 20:30   only that span of seconds -> build/video-range.mp4 (for checks)
//   node tools/render.mjs --poster 25.6 [--out out/nestwell-walkthrough-poster.jpg]   one frame as JPEG q=88
// options: --port N (Chrome debugging port; default 9401 for --full, 9402 otherwise), --workers N (tabs for --full, default 3)
//
// A tiny static server on port 8765 serves the video folder, so the page can fetch ../build/timings.json
// and ../assets/app/*.png. Every frame calls window.renderAt(n / 30); the page is a pure function of t.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HTTP_PORT = 8765;
const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ args
const argv = process.argv.slice(2);
function opt(name, fallback = null) {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
const MODE = argv.includes('--full') ? 'full' : argv.includes('--poster') ? 'poster' : argv.includes('--scenes') ? 'scenes' : argv.includes('--preview') ? 'preview' : null;
if (!MODE) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(1);
}
const CDP_PORT = Number(opt('--port', MODE === 'full' ? 9401 : 9402));
const WORKERS = Math.max(1, Math.min(8, Number(opt('--workers', 3))));

// ------------------------------------------------------------------ static server
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8',
};
function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`);
      const file = resolve(ROOT, '.' + decodeURIComponent(url.pathname));
      if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(HTTP_PORT, '127.0.0.1', () => ok(server));
  });
}

// ------------------------------------------------------------------ chrome + cdp
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.pending.has(d.id)) {
        const { res, rej } = this.pending.get(d.id);
        this.pending.delete(d.id);
        d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description) || r.exceptionDetails.text);
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function launchChrome() {
  const profile = resolve(ROOT, `build/chrome-render-${CDP_PORT}`);
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--disable-gpu',
    '--force-device-scale-factor=1', `--window-size=${WIDTH},${HEIGHT}`,
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--disable-features=IntensiveWakeUpThrottling,CalculateNativeWinOcclusion',
    'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) return chrome; } catch {}
    await sleep(150);
  }
  chrome.kill();
  throw new Error(`Chrome did not start on port ${CDP_PORT}`);
}

async function openPage(width = WIDTH, height = HEIGHT, url = `http://127.0.0.1:${HTTP_PORT}/scenes/index.html`) {
  const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  const cdp = new CDP(ws);
  cdp.targetId = t.id;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url });
  return cdp;
}

async function openScenes() {
  const cdp = await openPage();
  for (let i = 0; i < 200; i++) {
    const ok = await cdp.eval(`typeof window.videoReady === 'object'`).catch(() => false);
    if (ok) break;
    await sleep(100);
  }
  const info = await cdp.eval(`window.videoReady.then(() => ({ ok: true, duration: window.videoDuration, fontsMissing: window.videoFontsMissing || [] }), (e) => ({ ok: false, error: String(e && e.message || e) }))`);
  if (!info.ok) throw new Error('scenes failed to load: ' + info.error);
  if (info.fontsMissing.length && !argv.includes('--allow-missing-fonts')) {
    throw new Error('fonts did not load: ' + info.fontsMissing.join(', ') + ' (network?) - rerun with --allow-missing-fonts to render anyway');
  }
  return { cdp, duration: info.duration };
}

async function closePage(cdp) {
  cdp.close();
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${cdp.targetId}`).catch(() => {});
}

const withTimeout = (promise, ms, what) => {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, fail) => { timer = setTimeout(() => fail(new Error(`${what} timed out after ${ms / 1000} s`)), ms); }),
  ]);
};

// Render time t, then capture. Page.captureScreenshot forces a redraw that includes every DOM change made
// before it, so no animation-frame wait is needed (headless Chrome runs requestAnimationFrame only in the
// foreground tab, and the render uses several tabs). Every frame also flips a 1 px tick in the top-left corner
// (black at alpha 1/255 or 2/255, invisible) so each capture has a paint change even during a still hold, and
// a frame that takes over 60 s fails loudly instead of stalling the render.
async function frame(cdp, t, format = 'png', quality) {
  cdp.tick = (cdp.tick || 0) + 1;
  const alpha = ((cdp.tick % 2) + 1) / 255;
  await withTimeout(cdp.eval(`(() => {
    let k = document.getElementById('render-tick');
    if (!k) { k = document.createElement('div'); k.id = 'render-tick'; k.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;z-index:2147483647;pointer-events:none'; document.body.appendChild(k); }
    k.style.background = 'rgba(0,0,0,${alpha.toFixed(5)})';
    window.renderAt(${t});
    return true;
  })()`), 60000, `frame at ${t} s (render)`);
  const params = { format, captureBeyondViewport: false, fromSurface: true, optimizeForSpeed: format === 'png' };
  if (format === 'jpeg') params.quality = quality ?? 92;
  // A background tab can stop producing frames once the other render tabs go idle near the end of a
  // full render; if a capture stalls, bring this tab to the front and capture again.
  let shot;
  try {
    shot = await withTimeout(cdp.send('Page.captureScreenshot', params), 20000, `frame at ${t} s (capture)`);
  } catch (e) {
    console.log(`capture at ${t} s stalled; retrying in the foreground`);
    await cdp.send('Page.bringToFront');
    shot = await withTimeout(cdp.send('Page.captureScreenshot', params), 60000, `frame at ${t} s (capture retry)`);
  }
  return Buffer.from(shot.data, 'base64');
}

function timings() {
  return JSON.parse(readFileSync(resolve(ROOT, 'build/timings.json'), 'utf8'));
}
const tName = (t) => `t-${Number(t).toFixed(2)}.png`;

// ------------------------------------------------------------------ modes
async function renderTimes(times) {
  const outDir = resolve(ROOT, 'build/preview');
  mkdirSync(outDir, { recursive: true });
  const { cdp, duration } = await openScenes();
  const files = [];
  try {
    for (const t of times) {
      const tt = Math.max(0, Math.min(duration, t));
      const buf = await frame(cdp, tt);
      const name = tName(tt);
      writeFileSync(resolve(outDir, name), buf);
      files.push({ t: tt, name });
      console.log('preview', name);
    }
  } finally {
    await closePage(cdp);
  }
  return files;
}

async function sheetPage(title, items, cols, thumbW, outFile) {
  const thumbH = Math.round(thumbW * 9 / 16);
  const rows = Math.ceil(items.length / cols);
  const gap = 14, labelH = 30, headH = 52;
  const width = cols * thumbW + (cols + 1) * gap;
  const height = headH + rows * (thumbH + labelH + gap) + gap;
  const cells = items.map((it) => `<figure><img src="/build/preview/${it.name}"><figcaption>${it.label}</figcaption></figure>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#2A3431;font:500 17px/1 'Consolas',monospace;color:#EAF1EF}
    h1{margin:0;padding:16px ${gap}px 0;height:${headH}px;box-sizing:border-box;font:600 22px/1 sans-serif}
    main{display:grid;grid-template-columns:repeat(${cols},${thumbW}px);gap:${gap}px;padding:0 ${gap}px ${gap}px}
    figure{margin:0} img{display:block;width:${thumbW}px;height:${thumbH}px;background:#FBF9F4}
    figcaption{height:${labelH}px;line-height:${labelH}px;white-space:nowrap;overflow:hidden}
  </style></head><body><h1>${title}</h1><main>${cells}</main></body></html>`;
  const htmlFile = outFile.replace(/\.png$/, '.html');
  writeFileSync(htmlFile, html);
  const rel = htmlFile.slice(ROOT.length).split(sep).join('/');
  const cdp = await openPage(width, height, `http://127.0.0.1:${HTTP_PORT}${rel}`);
  try {
    for (let i = 0; i < 100; i++) {
      const ok = await cdp.eval(`document.readyState === 'complete' && [...document.images].every((i) => i.complete)`).catch(() => false);
      if (ok) break;
      await sleep(100);
    }
    await sleep(200);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
    console.log('sheet', outFile.slice(ROOT.length + 1));
  } finally {
    await closePage(cdp);
  }
}

async function scenesMode() {
  const T = timings();
  const want = argv.slice(argv.indexOf('--scenes') + 1).filter((a) => !a.startsWith('--') && isNaN(Number(a)));
  const scenes = want.length ? T.scenes.filter((s) => want.includes(s.id)) : T.scenes;
  const items = [];
  for (const s of scenes) {
    const moments = [['start', s.start + 0.8], ['mid', (s.start + s.end) / 2], ['end', s.end - 0.8]];
    for (const [tag, t] of moments) items.push({ scene: s.id, tag, t: Math.round(t * 100) / 100 });
  }
  const files = await renderTimes(items.map((i) => i.t));
  files.forEach((f, i) => { items[i].name = f.name; items[i].label = `${items[i].scene} · ${items[i].tag} · ${f.t.toFixed(2)} s`; });
  const out = resolve(ROOT, 'build/preview');
  await sheetPage('NestWell walkthrough · contact sheet', items, 6, 316, resolve(out, 'sheet.png'));
  for (let p = 0; p * 9 < items.length; p++) {
    const page = items.slice(p * 9, p * 9 + 9);
    await sheetPage(`scenes: ${[...new Set(page.map((i) => i.scene))].join(', ')}`, page, 3, 640, resolve(out, `sheet-${p + 1}.png`));
  }
}

async function posterMode() {
  const t = Number(opt('--poster'));
  if (!isFinite(t)) throw new Error('--poster needs a time in seconds');
  const out = resolve(ROOT, opt('--out', 'out/nestwell-walkthrough-poster.jpg'));
  mkdirSync(dirname(out), { recursive: true });
  const { cdp, duration } = await openScenes();
  try {
    const buf = await frame(cdp, Math.max(0, Math.min(duration, t)), 'jpeg', 88);
    writeFileSync(out, buf);
    console.log('poster', out, `${(buf.length / 1024).toFixed(0)} KB`);
  } finally {
    await closePage(cdp);
  }
}

async function fullMode() {
  const T = timings();
  const total = T.total;
  const range = opt('--range');
  let first = 0, last = Math.round(total * FPS) - 1;
  let outFile = resolve(ROOT, 'build/video-silent.mp4');
  if (typeof range === 'string') {
    const [a, b] = range.split(':').map(Number);
    first = Math.max(0, Math.round(a * FPS));
    last = Math.min(last, Math.round(b * FPS) - 1);
    outFile = resolve(ROOT, 'build/video-range.mp4');
  }
  const count = last - first + 1;
  mkdirSync(dirname(outFile), { recursive: true });

  const ff = spawn('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    // tag and convert as BT.709 so browsers show the brand colours as designed
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', outFile,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((ok, fail) => ff.on('close', (code) => (code === 0 ? ok() : fail(new Error('ffmpeg exited with ' + code)))));
  let ffError = null;
  ff.stdin.on('error', (e) => { ffError = e; });

  const workers = [];
  for (let w = 0; w < WORKERS; w++) workers.push(await openScenes());
  console.log(`rendering ${count} frames (${(count / FPS).toFixed(3)} s of ${total} s) with ${WORKERS} tab(s) -> ${outFile.slice(ROOT.length + 1)}`);

  // workers render ahead into a buffer; frames are written to ffmpeg strictly in order
  const ready = new Map();
  let nextToWrite = first, nextToRender = first;
  const started = Date.now();
  let waiters = [];
  const notify = () => { const w = waiters; waiters = []; w.forEach((f) => f()); };
  const wait = () => new Promise((r) => waiters.push(r));

  async function worker({ cdp }) {
    for (;;) {
      while (ready.size > WORKERS * 4) await wait();
      const n = nextToRender++;
      if (n > last) return;
      ready.set(n, await frame(cdp, n / FPS));
      notify();
    }
  }
  async function writer() {
    while (nextToWrite <= last) {
      if (!ready.has(nextToWrite)) { await wait(); continue; }
      if (ffError) throw ffError;
      const buf = ready.get(nextToWrite);
      ready.delete(nextToWrite);
      notify();
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      const done = nextToWrite - first + 1;
      if (done % 150 === 0 || nextToWrite === last) {
        const secs = (Date.now() - started) / 1000;
        const eta = secs / done * (count - done);
        console.log(`frame ${done}/${count}  t=${(nextToWrite / FPS).toFixed(2)} s  ${(done / secs).toFixed(1)} fps  elapsed ${secs.toFixed(0)} s  eta ${eta.toFixed(0)} s`);
      }
      nextToWrite++;
    }
  }
  try {
    await Promise.all([...workers.map(worker), writer()]);
    ff.stdin.end();
    await ffDone;
  } finally {
    for (const w of workers) await closePage(w.cdp);
  }
  console.log('wrote', outFile, `in ${((Date.now() - started) / 1000).toFixed(0)} s`);
}

// ------------------------------------------------------------------ main
const server = await startServer();
let chrome = null;
let failed = false;
try {
  chrome = await launchChrome();
  if (MODE === 'preview') {
    const list = String(opt('--preview', '')).split(',').map((s) => s.trim()).filter(Boolean).map(Number);
    if (!list.length || list.some((v) => !isFinite(v))) throw new Error('--preview needs times, e.g. --preview 0,4,10.5');
    const files = await renderTimes(list);
    const sheetName = opt('--sheet');
    if (typeof sheetName === 'string') {
      const T = timings();
      const items = files.map((f) => {
        const sc = T.scenes.find((s) => f.t >= s.start && f.t < s.end) || T.scenes[T.scenes.length - 1];
        return { ...f, label: `${f.t.toFixed(2)} s · ${sc.id}` };
      });
      await sheetPage(`preview: ${sheetName}`, items, 3, 640, resolve(ROOT, `build/preview/sheet-${sheetName}.png`));
    }
  } else if (MODE === 'scenes') {
    await scenesMode();
  } else if (MODE === 'poster') {
    await posterMode();
  } else if (MODE === 'full') {
    await fullMode();
  }
} catch (e) {
  failed = true;
  console.error('render failed:', e.message);
} finally {
  if (chrome) chrome.kill();
  server.close();
}
process.exitCode = failed ? 1 : 0;

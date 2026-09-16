// Capture NestWell prototype app states into assets/app/*.png through the Chrome DevTools Protocol.
// Node 24, no dependencies. Launches headless Chrome on debugging port 9402 with a fresh profile
// under build/chrome-capture.
//
// usage: node tools/capture.mjs            capture every shot
//        node tools/capture.mjs name ...   capture only the named shots
//        add --dump to print the visible page text after each shot (for checking state)
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'assets/app');
const PROFILE = resolve(ROOT, 'build/chrome-capture');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9402;
const BASE = 'https://shahablo.github.io/NestWell/';

const PHONE = { w: 390, h: 844, dpr: 3, mobile: true };
const DESK = { w: 1440, h: 900, dpr: 2, mobile: false };

function url({ branch, role = 'patient', persona, clock }, hash) {
  const q = new URLSearchParams({ branch, role });
  if (persona) q.set('persona', persona);
  if (clock) q.set('clock', clock);
  return `${BASE}?${q.toString()}${hash}`;
}

const PRIYA = { branch: 'priya', role: 'patient', persona: 'pt-priya' };
const CHECKIN = { ...PRIYA, clock: '2026-04-09T14:16:00Z' };
const MARISOL_PT = { branch: 'marisol_after_hours', role: 'patient', persona: 'pt-marisol', clock: '2026-04-15T00:10:00Z' };
const ELENA = { branch: 'elena', role: 'patient', persona: 'pt-elena' };
const CLIN = { branch: 'priya', role: 'clinician', clock: '2026-06-12T16:00:00Z' };

// Calm answers, in order of preference, for completing a check-in without any urgent answer.
const CALM = ['None of these', 'I am coping', 'No', 'Not at all', 'About the same', 'Good', 'Okay', 'Yes'];

const SHOTS = [
  { name: 'phone-home', dev: PHONE, url: url(PRIYA, '#/p') },
  { name: 'phone-checkin-intro', dev: PHONE, url: url(CHECKIN, '#/p/checkin/ci-00011') },
  { name: 'phone-checkin-question', dev: PHONE, url: url(CHECKIN, '#/p/checkin/ci-00011'), steps: [{ click: 'Start' }] },
  { name: 'phone-checkin-answer', dev: PHONE, url: url(CHECKIN, '#/p/checkin/ci-00011'), steps: [{ click: 'Start' }, { select: 'None of these' }] },
  { name: 'phone-checkin-saved', dev: PHONE, url: url(CHECKIN, '#/p/checkin/ci-00011'), steps: [{ click: 'Start' }, { calm: true }] },
  { name: 'phone-help', dev: PHONE, url: url(PRIYA, '#/p/help') },
  { name: 'phone-epds', dev: PHONE, url: url(PRIYA, '#/p/screen/epds') },
  { name: 'phone-epds-notice', dev: PHONE, url: url(PRIYA, '#/p/screen/epds'), steps: [{ scrollTo: 'One answer is always shared' }] },
  { name: 'phone-preferences', dev: PHONE, url: url(PRIYA, '#/p/preferences'), steps: [{ scrollTo: 'Who sees my mood answers' }] },
  { name: 'phone-nobody-reached', dev: PHONE, url: url(MARISOL_PT, '#/p') },
  { name: 'phone-elena-home', dev: PHONE, url: url(ELENA, '#/p') },
  { name: 'phone-elena-careplan', dev: PHONE, url: url(ELENA, '#/p/careplan') },
  { name: 'desk-queues-urgent', dev: DESK, url: url({ branch: 'marisol_after_hours', role: 'coordinator' }, '#/practice/queues') },
  { name: 'desk-queues-unowned', dev: DESK, url: url({ branch: 'marisol_after_hours', role: 'coordinator', clock: '2026-04-15T00:10:00Z' }, '#/practice/queues') },
  { name: 'desk-referral', dev: DESK, url: url(CLIN, '#/practice/referrals'), hideBanner: true },
  { name: 'desk-patient', dev: DESK, url: url(CLIN, '#/practice/patients/pt-priya'), hideBanner: true },
  { name: 'desk-summaries', dev: DESK, url: url(CLIN, '#/practice/summaries'), hideBanner: true },
  { name: 'desk-metrics', dev: DESK, url: url({ branch: 'all_personas', role: 'clinician' }, '#/practice/metrics'), hideBanner: true },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''));
    return r.result.value;
  }
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  return new CDP(ws);
}

async function waitForChrome() {
  for (let i = 0; i < 75; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return; } catch {}
    await sleep(200);
  }
  throw new Error('chrome did not start');
}

// Click the first visible, enabled <button> or <a> whose textContent includes the label.
const clickJs = (label, exact = false) => `(() => {
  const want = ${JSON.stringify(label)};
  const els = [...document.querySelectorAll('button, a')].filter((e) => {
    const t = e.textContent.replace(/\\s+/g, ' ').trim();
    return (${exact} ? t === want : t.includes(want)) && !e.disabled && e.offsetParent !== null;
  });
  if (!els.length) return false;
  els[0].scrollIntoView({ block: 'center' });
  els[0].click();
  return true;
})()`;

async function waitForApp(cdp) {
  for (let i = 0; i < 60; i++) {
    const ok = await cdp.eval(`document.readyState === 'complete' && (document.querySelector('#root')?.innerText || '').trim().length > 40`).catch(() => false);
    if (ok) return;
    await sleep(250);
  }
  throw new Error('app did not render');
}

async function runStep(cdp, step) {
  if (step.click) {
    if (!(await cdp.eval(clickJs(step.click)))) throw new Error(`no button with text "${step.click}"`);
    await sleep(800);
  } else if (step.select) {
    // Tap an option (multi-choice items do not advance on tap) and scroll it into view so the check shows.
    const ok = await cdp.eval(`(() => {
      const want = ${JSON.stringify(step.select)};
      const opt = [...document.querySelectorAll('button.option-btn')].find((e) => e.textContent.includes(want));
      if (!opt) return false;
      const multi = opt.getAttribute('role') === 'checkbox';
      opt.click();
      opt.scrollIntoView({ block: 'center', behavior: 'instant' });
      return multi ? 'multi' : 'single';
    })()`);
    if (!ok) throw new Error(`no option "${step.select}"`);
    await sleep(800);
  } else if (step.calm) {
    for (let i = 0; i < 30; i++) {
      const state = await cdp.eval(`(() => {
        const text = document.body.innerText;
        if (/Your answers are saved/.test(text)) return 'done';
        const calm = ${JSON.stringify(CALM)};
        const opts = [...document.querySelectorAll('button.option-btn')];
        const clickText = (want) => { const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === want && !e.disabled && e.offsetParent !== null); if (b) { b.click(); return true; } return false; };
        const prompt = (document.querySelector('.patient-prompt')?.innerText || '') + ' :: ' + [...document.querySelectorAll('button.option-btn')].map(o => o.textContent.trim()).join(' / ');
        if (opts.length) {
          const multi = opts[0].getAttribute('role') === 'checkbox';
          const chosen = opts.find((o) => o.getAttribute('aria-checked') === 'true');
          if (multi && chosen) return clickText('Next') ? 'next' : 'stuck-next';
          for (const c of calm) { const o = opts.find((e) => e.textContent.trim() === c); if (o) { o.click(); return 'picked ' + c + ' <- ' + prompt; } }
          return clickText('Skip item') ? 'skipped <- ' + prompt : 'stuck-options';
        }
        if (clickText('Finish')) return 'finish';
        if (clickText('Next')) return 'next';
        if (clickText('Continue the check-in')) return 'URGENT';
        return 'stuck';
      })()`);
      console.log('   calm:', state);
      if (state === 'done') return;
      if (state.startsWith('stuck') || state === 'URGENT') throw new Error('check-in flow: ' + state);
      await sleep(800);
    }
    throw new Error('check-in did not finish');
  } else if (step.scrollTo) {
    const ok = await cdp.eval(`(() => {
      const want = ${JSON.stringify(step.scrollTo)};
      const el = [...document.querySelectorAll('h1,h2,h3,h4,legend,label,p,span,div')].reverse().find((e) => e.children.length < 3 && e.textContent.trim().startsWith(want));
      if (!el) return false;
      const y = el.getBoundingClientRect().top + window.scrollY - 118;
      window.scrollTo({ top: y, left: 0, behavior: 'instant' });
      return true;
    })()`);
    if (!ok) throw new Error(`no text "${step.scrollTo}" to scroll to`);
    await sleep(800);
  }
}

const args = process.argv.slice(2);
const dump = args.includes('--dump');
const only = args.filter((a) => !a.startsWith('--'));
const shots = only.length ? SHOTS.filter((s) => only.includes(s.name)) : SHOTS;

mkdirSync(OUT, { recursive: true });
rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', '--no-first-run',
  '--no-default-browser-check', '--hide-scrollbars', `--user-data-dir=${PROFILE}`,
  '--window-size=1600,1200', 'about:blank',
], { stdio: 'ignore' });

let failed = 0;
try {
  await waitForChrome();
  for (const s of shots) {
    const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const cdp = await connect(t.webSocketDebuggerUrl);
    try {
      await cdp.send('Page.enable');
      await cdp.send('Runtime.enable');
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: s.dev.w, height: s.dev.h, deviceScaleFactor: s.dev.dpr, mobile: s.dev.mobile });
      if (s.dev.mobile) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      // Load the deep link, then reload it so the branch reseed applies cleanly to this state.
      await cdp.send('Page.navigate', { url: s.url });
      await sleep(2500);
      await waitForApp(cdp);
      await cdp.send('Page.reload', { ignoreCache: true });
      await sleep(2500);
      await waitForApp(cdp);
      await cdp.eval(`document.fonts ? document.fonts.ready.then(() => true) : true`);
      await sleep(600);
      for (const step of s.steps ?? []) await runStep(cdp, step);
      if (s.hideBanner) {
        await cdp.eval(`document.querySelectorAll('.coverage-banner').forEach(e => e.style.display='none'); true`);
        await sleep(400);
      }
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      writeFileSync(resolve(OUT, `${s.name}.png`), Buffer.from(shot.data, 'base64'));
      console.log(s.name, `${s.dev.w}x${s.dev.h}@${s.dev.dpr}`, 'ok', await cdp.eval('location.href'));
      if (dump) console.log((await cdp.eval('document.body.innerText')).slice(0, 1500), '\n----');
    } catch (e) {
      failed++;
      console.error(s.name, 'FAILED:', e.message);
    } finally {
      cdp.ws.close();
      await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`).catch(() => {});
    }
  }
} finally {
  chrome.kill();
}
process.exitCode = failed ? 1 : 0;

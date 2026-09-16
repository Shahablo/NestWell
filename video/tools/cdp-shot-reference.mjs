// Screenshot pages through the Chrome DevTools Protocol with a real mobile viewport.
// usage: node cdp-shot.mjs shots.json
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const shots = JSON.parse(readFileSync(process.argv[2], 'utf8'));
mkdirSync('cdp-profile', { recursive: true });
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${process.cwd()}/cdp-profile`, '--window-size=1600,1200', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForChrome() { for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return; } catch {} await sleep(200); } throw new Error('chrome did not start'); }

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = []; ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && this.pending.has(d.id)) { const { res, rej } = this.pending.get(d.id); this.pending.delete(d.id); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result); } else if (d.method) this.events.push(d); }; }
  send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
}
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); return new CDP(ws); }

await waitForChrome();
for (const s of shots) {
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const cdp = await connect(t.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: 2, mobile: s.w < 700 });
  await cdp.send('Page.navigate', { url: s.url });
  await sleep(s.wait ?? 5000);
  if (s.hideBanner) {
    await cdp.send('Runtime.evaluate', { expression: "document.querySelectorAll('.coverage-banner').forEach(e => e.style.display = 'none'); true" });
    await sleep(400);
  }
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(`${s.name}.png`, Buffer.from(shot.data, 'base64'));
  console.log(s.name, s.w + 'x' + s.h, 'ok');
  cdp.ws.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`);
}
chrome.kill();

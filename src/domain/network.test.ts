/**
 * SR-04 / W21: the app makes no network calls. Nothing under src may use fetch, XMLHttpRequest,
 * WebSocket or sendBeacon, or name an external http(s) URL; and the production build ships a
 * Content-Security-Policy that allows only the application origin (see vite.config.ts).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const NETWORK = /\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|sendBeacon|\bEventSource\b|https?:\/\//;

describe('no network code (SR-04)', () => {
  it('no source file under src calls the network or names an external URL', () => {
    const hits: string[] = [];
    for (const file of walk(join(ROOT, 'src'))) {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => { if (NETWORK.test(line)) hits.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`); });
    }
    expect(hits).toEqual([]);
  });

  it('the production build injects a CSP limited to the application origin', () => {
    const cfg = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
    expect(cfg).toContain('Content-Security-Policy');
    expect(cfg).toMatch(/default-src 'self'/);
    expect(cfg).toMatch(/connect-src 'self'/);
  });
});

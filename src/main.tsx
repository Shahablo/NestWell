/**
 * Bootstrap: validate config and content (FR-61), build the store, mount the app, register
 * the service worker (NFR-13). This file is the only place that touches the PWA virtual
 * module, so tests never import it.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { loadConfig } from './domain/config';
import { NestWellStore, StoreContext } from './domain/store';
import { SCENARIO_BRANCHES } from './seed';
import { ValidationReport } from './ui/shell/ValidationReport';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

function mount(node: React.ReactNode): void {
  const rootEl = document.getElementById('root');
  if (!rootEl) throw new Error('#root not found');
  createRoot(rootEl).render(<StrictMode>{node}</StrictMode>);
}

function boot(): void {
  const loaded = loadConfig();
  if (loaded.problems.length > 0) {
    mount(<ValidationReport problems={loaded.problems} />);
    return;
  }

  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }

  const store = new NestWellStore(loaded.config, loaded.content, SCENARIO_BRANCHES, storage);
  try {
    store.init();
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    mount(<ValidationReport problems={[`Startup: the stored demo session could not be loaded or reseeded — ${message}`]} />);
    return;
  }

  applyDeepLink(store);

  mount(
    <StoreContext.Provider value={store}>
      <App />
    </StoreContext.Provider>,
  );
}

/**
 * Demo deep links (FR-48): the founders can bookmark a scenario state, e.g.
 *   /NestWell/?branch=priya&role=coordinator&clock=2026-03-20T15:00:00Z#/practice/queues
 * Query keys: branch (scenario key; wipes this browser's log and reseeds), clock (ISO instant),
 * role (patient | coordinator | clinician | budget_owner | referral_partner | admin),
 * persona (patient id shown in the patient app), notes (1 = show demo notes).
 * The query is removed from the address bar afterwards so a reload does not reseed again.
 */
function applyDeepLink(store: NestWellStore): void {
  const params = new URLSearchParams(window.location.search);
  if ([...params.keys()].length === 0) return;
  const branch = params.get('branch');
  if (branch && store.getBranches().some((b) => b.key === branch)) store.reset(branch);
  const clock = params.get('clock');
  if (clock && !Number.isNaN(Date.parse(clock))) store.setClock(new Date(clock).toISOString());
  const role = params.get('role');
  const roles = ['patient', 'coordinator', 'clinician', 'budget_owner', 'referral_partner', 'admin'] as const;
  if (role && (roles as readonly string[]).includes(role)) store.setRole(role as (typeof roles)[number]);
  const persona = params.get('persona');
  try {
    if (persona) window.localStorage.setItem('nestwell.currentPatient', persona);
    if (params.get('notes') === '1') window.localStorage.setItem('nestwell.demoNotes', '1');
  } catch {
    // storage unavailable; the app still runs in memory
  }
  const clean = `${window.location.pathname}${window.location.hash}`;
  window.history.replaceState(null, '', clean);
}

boot();

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    registerSW({ immediate: true });
  } catch {
    // The app works without the service worker; offline caching is a progressive enhancement.
  }
}

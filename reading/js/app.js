import { h, mount, toast } from './dom.js';
import { FIREBASE_CONFIG } from './config.js';
import { GUIDELINES_VERSION, PROFILE_SECTIONS, validateProfile } from './schema.js';
import { renderSignIn } from './views/signin.js';
import { renderProfile } from './views/profile.js';
import { renderGuidelines } from './views/guidelines.js';
import { renderQueue, openNext } from './views/queue.js';
import { renderCase } from './views/case.js';
import { renderNote } from './views/note.js';
import { renderAdjQueue, renderAdjCase } from './views/adjudicate.js';
import { renderAdmin } from './views/admin.js';

const params = new URLSearchParams(location.search);
// ?emulator runs against the local Firebase emulators (testing only, localhost only).
const EMULATOR = params.has('emulator') && ['localhost', '127.0.0.1'].includes(location.hostname);
const DEMO = !EMULATOR && (params.has('demo') || !FIREBASE_CONFIG.apiKey);
const EMULATOR_CONFIG = { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-annotation',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-annotation-default-rtdb', appId: 'demo' };

const state = {
  store: null, user: null, config: {}, profile: null, guidelines: null, verification: null,
  online: true, cleanup: null,
};

const root = () => document.getElementById('app');

async function boot() {
  try {
    if (DEMO) {
      const { createDemoStore } = await import('./store-demo.js');
      state.store = createDemoStore();
    } else {
      const { createFirebaseStore } = await import('./store-firebase.js');
      state.store = await createFirebaseStore(EMULATOR ? EMULATOR_CONFIG : FIREBASE_CONFIG, { emulator: EMULATOR });
      await state.store.completeEmailLinkIfPresent(async () => window.prompt('Confirm the email address you used to request the sign-in link'));
    }
  } catch (e) {
    mount(root(), h('main', { class: 'page narrow' }, h('h1', {}, 'Cannot start'), h('p', {}, String(e.message || e))));
    return;
  }
  state.store.onConnection((on) => { state.online = on; renderStatus(); });
  state.store.onAuth(async (user) => {
    state.user = user;
    if (user) await loadUserState();
    route();
  });
  window.addEventListener('hashchange', route);
}

async function loadUserState() {
  const { store, user } = state;
  state.config = await store.getConfig().catch(() => ({}));
  [state.profile, state.guidelines, state.verification] = await Promise.all([
    store.getProfile(user.uid).catch(() => null),
    store.getGuidelinesStatus(user.uid).catch(() => null),
    store.getVerification(user.uid).catch(() => null),
  ]);
}

export function profileComplete() {
  return !!state.profile && Object.keys(validateProfile(state.profile)).length === 0;
}
export function guidelinesPassed() {
  const want = state.config.guidelinesVersion || GUIDELINES_VERSION;
  return !!state.guidelines?.quizPassedAt && state.guidelines?.version === want;
}

function gate() {
  const u = state.user;
  if (!u) return 'signin';
  if (u.role === 'admin') return null;
  // Not yet approved: profile and guidelines first, then the waiting screen until an admin approves.
  if (!profileComplete()) return 'profile';
  if (!guidelinesPassed()) return 'guidelines';
  return null;
}

function setCleanup(fn) {
  if (state.cleanup) { try { state.cleanup(); } catch { /* ignore */ } }
  state.cleanup = fn || null;
}

async function route() {
  setCleanup(null);
  const hash = location.hash.replace(/^#\/?/, '');
  const [page, arg] = hash.split('/');
  const forced = gate();
  const ctx = { state, store: state.store, go, reload: reloadUser, setCleanup, demo: DEMO };
  ctx.next = () => openNext(ctx); // after a submit: the next unsubmitted item, or the list (and the closing questions)

  renderShell();
  const main = document.getElementById('main');
  window.scrollTo(0, 0);

  if (forced === 'signin') return renderSignIn(main, ctx);

  // Profile and guidelines stay reachable once done; before that they are forced in order.
  if (forced && page !== forced && !(forced === 'guidelines' && page === 'profile')) return go(forced);

  const role = state.user.role || 'pending';
  switch (page) {
    case 'start': return openNext(ctx);
    case 'profile': return renderProfile(main, ctx);
    case 'guidelines': return renderGuidelines(main, ctx);
    case 'case': return role === 'rater' || role === 'admin' ? renderCase(main, ctx, decodeURIComponent(arg || '')) : go('');
    case 'note': return role === 'rater' || role === 'admin' ? renderNote(main, ctx, decodeURIComponent(arg || '')) : go('');
    case 'adjudicate':
      if (role !== 'adjudicator' && role !== 'admin') return go('');
      return arg ? renderAdjCase(main, ctx, decodeURIComponent(arg)) : renderAdjQueue(main, ctx);
    case 'admin': return role === 'admin' ? renderAdmin(main, ctx) : go('');
    default:
      if (role === 'admin') return go('admin');
      if (role === 'adjudicator') return go('adjudicate');
      return renderQueue(main, ctx);
  }
}

function go(page) {
  const target = `#/${page}`;
  if (location.hash === target) route(); else location.hash = target;
}

async function reloadUser() {
  if (state.user) {
    state.user = await state.store.refreshClaims().catch(() => state.user) || state.user;
    await loadUserState();
  }
}

function renderShell() {
  const u = state.user;
  const role = u?.role;
  const links = [];
  if (u && (role === 'rater' || !role)) links.push(['', 'Cases'], ['guidelines', 'Guidelines'], ['profile', 'Profile']);
  if (u && role === 'adjudicator') links.push(['adjudicate', 'Adjudication'], ['guidelines', 'Guidelines'], ['profile', 'Profile']);
  if (u && role === 'admin') links.push(['admin', 'Study team'], ['adjudicate', 'Adjudication'], ['guidelines', 'Guidelines']);
  const current = location.hash.replace(/^#\/?/, '').split('/')[0];

  mount(root(),
    DEMO ? demoBanner() : null,
    h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: '#/' },
        h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'H'),
        h('span', { class: 'brand-name' }, 'Health-CL'),
      ),
      u ? h('nav', { class: 'nav', 'aria-label': 'Main' },
        links.map(([p, label]) => h('a', { href: `#/${p}`, class: `nav-link${(current === p || (p === '' && current === 'case')) ? ' is-active' : ''}` }, label))) : null,
      h('div', { class: 'topbar-right' },
        h('span', { id: 'conn', class: 'conn' }),
        u ? h('span', { class: 'who', title: u.email }, u.email) : null,
        u ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => state.store.signOut() }, 'Sign out') : null,
      ),
    ),
    h('main', { id: 'main', class: 'main', tabindex: '-1' }),
    h('footer', { class: 'footer' },
      h('span', {}, state.config.contact ? `Questions: ${state.config.contact}` : ''),
      h('span', {}, `Guidelines ${(state.config.guidelinesVersion || GUIDELINES_VERSION).replace(/-draft$/, '')}`),
    ),
  );
  renderStatus();
}

function renderStatus() {
  const el = document.getElementById('conn');
  if (!el) return;
  el.className = `conn ${state.online ? 'conn-on' : 'conn-off'}`;
  el.textContent = state.online ? 'Online' : 'Offline: answers will sync when you reconnect';
}

function demoBanner() {
  const s = state.store;
  const role = state.user?.role || 'rater';
  return h('div', { class: 'demo-banner', role: 'note' },
    h('strong', {}, 'Demo'),
    h('span', {}, 'Invented cases. Answers stay in this browser only.'),
    state.user ? h('label', { class: 'demo-role' }, 'View as ',
      h('select', { onchange: (e) => s.setDemoRole(e.target.value) },
        ['rater', 'adjudicator', 'admin'].map((r) => h('option', { value: r, selected: r === role }, r)))) : null,
    h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { s.resetDemo(); location.hash = '#/'; } }, 'Reset demo'),
  );
}

window.addEventListener('error', (e) => toast(`Something went wrong: ${e.message}`, 'error'));
window.addEventListener('unhandledrejection', (e) => toast(`Could not complete: ${e.reason?.message || e.reason}`, 'error'));

boot();

export { PROFILE_SECTIONS };

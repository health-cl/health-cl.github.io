import { h, mount, toast } from './dom.js';
import { icon } from './icons.js';
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
      try {
        await state.store.completeEmailLinkIfPresent(async () => window.prompt('Confirm the email address you used to request the sign-in link'));
      } catch (e) {
        history.replaceState(null, '', location.pathname + location.hash);
        setTimeout(() => toast('This sign-in link has expired or was already used. Request a new one below.', 'error'), 300);
      }
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
  // Amendment M1: Profile and Sign out live in the account menu under the email address.
  if (u && (role === 'rater' || !role)) links.push(['', 'Cases'], ['guidelines', 'Guidelines']);
  if (u && role === 'adjudicator') links.push(['adjudicate', 'Adjudication'], ['guidelines', 'Guidelines']);
  if (u && role === 'admin') links.push(['admin', 'Readers'], ['guidelines', 'Guidelines']);
  const current = location.hash.replace(/^#\/?/, '').split('/')[0];

  mount(root(),
    DEMO ? demoBanner() : null,
    h('header', { class: 'topbar' },
      brandMenu(),
      u ? h('nav', { class: 'nav', 'aria-label': 'Main' },
        links.map(([p, label]) => h('a', { href: `#/${p}`, class: `nav-link${(current === p || (p === '' && current === 'case')) ? ' is-active' : ''}` }, label))) : null,
      h('div', { class: 'topbar-right' },
        h('span', { id: 'conn', class: 'conn' }),
        u ? accountMenu(u) : null,
      ),
    ),
    h('main', { id: 'main', class: 'main', tabindex: '-1' }),
    h('footer', { class: 'footer' },
      h('span', {}, state.config.contact ? `Questions to ${state.config.contact}` : ''),
      h('span', {}, `Guidelines ${(state.config.guidelinesVersion || GUIDELINES_VERSION).replace(/-draft$/, '')}`),
    ),
  );
  renderStatus();
}

// Amendment M1: the logo is the stethoscope emoji. Where the browser has no colour emoji font (it would draw nothing or a box),
// the same stethoscope is drawn from the app's own icons. Checked once by drawing the emoji on a canvas.
const EMOJI_OK = (() => {
  try {
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const x = c.getContext('2d');
    x.font = '24px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'; x.textBaseline = 'top'; x.fillText('\u{1FA7A}', 2, 2);
    const d = x.getImageData(0, 0, 32, 32).data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] && (Math.abs(d[i] - d[i + 1]) > 30 || Math.abs(d[i] - d[i + 2]) > 30)) return true;
    return false;
  } catch { return true; }
})();

// Amendment M1: the email address opens the account menu (account, Profile, Sign out). One listener closes it, and the
// project sentence behind the logo (Amendment N6), on an outside click.
let acctMenu = null, brandPop = null;
document.addEventListener('click', (e) => {
  for (const m of [acctMenu, brandPop]) if (m?.open && !m.contains(e.target)) m.open = false;
});
// Amendment N6: one neutral sentence; it says what readers do, not what is compared (the closing questions ask readers that).
const PROJECT_SENTENCE = 'Health-CL is a research study in which physicians read and rate how AI agents worked up simulated patients built from emergency department records.';
function brandMenu() {
  const pop = h('details', { class: 'brand-pop' },
    h('summary', { class: 'brand', 'aria-label': 'About Health-CL' },
      EMOJI_OK ? h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '\u{1FA7A}')
        : h('span', { class: 'brand-mark brand-mark-svg', 'aria-hidden': 'true' }, icon('exam', { size: 22 })),
      h('span', { class: 'brand-name' }, 'Health-CL'),
      h('span', { class: 'brand-i', 'aria-hidden': 'true' }, icon('info', { size: 14 }))),
    h('div', { class: 'brand-body', role: 'note' }, h('p', {}, PROJECT_SENTENCE)));
  pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { pop.open = false; pop.querySelector('summary').focus(); } });
  brandPop = pop;
  return pop;
}
function accountMenu(u) {
  const menu = h('details', { class: 'acct' },
    h('summary', { class: 'acct-btn', 'aria-label': `Account: ${u.email}` },
      h('span', { class: 'acct-av', 'aria-hidden': 'true' }, (u.email || '?')[0].toUpperCase()),
      h('span', { class: 'who' }, u.email), icon('chevron', { size: 14 })),
    h('div', { class: 'acct-pop', role: 'menu' },
      h('div', { class: 'acct-id' }, h('span', { class: 'acct-k' }, 'Signed in as'), h('b', {}, u.email),
        u.slot ? h('span', { class: 'acct-k' }, `Reading slot ${u.slot}`) : u.role === 'admin' ? h('span', { class: 'acct-k' }, 'Study team') : null),
      u.role !== 'admin' ? h('a', { class: 'acct-item', role: 'menuitem', href: '#/profile', onclick: () => { menu.open = false; } }, icon('patient', { size: 15 }), 'Profile') : null,
      h('button', { class: 'acct-item', role: 'menuitem', type: 'button', onclick: () => state.store.signOut() }, icon('signout', { size: 15 }), 'Sign out')));
  acctMenu = menu;
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); } });
  return menu;
}

function renderStatus() {
  const el = document.getElementById('conn');
  if (!el) return;
  el.className = `conn ${state.online ? 'conn-on' : 'conn-off'}`;
  el.textContent = state.online ? 'Online' : 'Offline. Answers sync when you reconnect';
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

window.addEventListener('error', (e) => toast(`Something went wrong. ${e.message}`, 'error'));
window.addEventListener('unhandledrejection', (e) => toast(`Could not complete. ${e.reason?.message || e.reason}`, 'error'));

boot();

export { PROFILE_SECTIONS };

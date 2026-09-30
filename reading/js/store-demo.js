// Demo backend: same interface as store-firebase.js, kept in this browser only.
// Synthetic cases, a pretend signed-in user, and verification granted automatically.
import { DEMO_CASES, DEMO_ADJUDICATION, DEMO_NOTE_PAIRS } from './demo-data.js';

const NS = 'annot-demo:';
const mem = new Map();
function load(key, fallback) {
  try { const v = localStorage.getItem(NS + key); return v === null ? fallback : JSON.parse(v); }
  catch { return mem.has(key) ? mem.get(key) : fallback; }
}
function save(key, value) {
  mem.set(key, value);
  try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch { /* private window: memory only */ }
}
function deepMerge(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete target[k];
    else if (v && typeof v === 'object' && !Array.isArray(v)) target[k] = deepMerge(target[k] && typeof target[k] === 'object' ? target[k] : {}, v);
    else target[k] = v;
  }
  return target;
}

const DEMO_UID = 'demo-rater';

export function createDemoStore() {
  let authCb = () => {};
  const all = [...DEMO_CASES, ...DEMO_NOTE_PAIRS];
  const cases = Object.fromEntries(all.map((c) => [c.id, c]));
  const assignments = Object.fromEntries(all.map((c, i) => [c.id, { order: i, practice: !!c.practice }]));

  const store = {
    mode: 'demo',
    async init() {},
    onAuth(cb) {
      authCb = cb;
      const signed = load('signedIn', false);
      queueMicrotask(() => cb(signed ? store.currentUser() : null));
    },
    currentUser() {
      return { uid: DEMO_UID, email: 'demo.rater@example.org', emailVerified: true, role: load('role', 'rater') };
    },
    async signInWithGoogle() { save('signedIn', true); authCb(store.currentUser()); },
    async sendEmailLink(email) { save('pendingEmail', email); return { demo: true }; },
    async completeEmailLinkIfPresent() { return false; },
    async signOut() { save('signedIn', false); authCb(null); },
    async refreshClaims() { return store.currentUser(); },
    setDemoRole(role) { save('role', role); authCb(store.currentUser()); },
    resetDemo() {
      try { Object.keys(localStorage).filter((k) => k.startsWith(NS)).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
      mem.clear();
      authCb(null);
    },
    onConnection(cb) { cb(true); },

    async getConfig() {
      return { studyTitle: 'Clinician reading of AI emergency workups', formVersion: 'v2', harmRequired: true, likelihood: true,
        guidelinesVersion: null, contact: 'study-team@example.org', minutesPerCase: 12 };
    },
    async getProfile() { return load('profile', null); },
    async saveProfile(_uid, data) { save('profile', { ...(load('profile', {}) || {}), ...data }); },
    async getVerification() { return { verified: true, note: 'Demo mode: verification is simulated.' }; },
    watchAccess(uid, cb) { queueMicrotask(() => cb({ role: 'rater' })); return () => {}; },
    async getGuidelinesStatus() { return load('guidelines', null); },
    async saveGuidelinesStatus(_uid, status) { save('guidelines', { ...(load('guidelines', {}) || {}), ...status }); },

    async getAssignments() {
      return Object.entries(assignments).map(([caseId, a]) => ({ caseId, ...a })).sort((a, b) => a.order - b.order);
    },
    async getProgress() { return load('progress', {}); },
    async getCase(caseId) { return cases[caseId] || null; },
    async getAnnotation(_uid, caseId) { return load(`ann:${caseId}`, null); },
    async patchAnnotation(_uid, caseId, patch) {
      const cur = load(`ann:${caseId}`, {});
      if (cur.submittedAt) throw new Error('This case is submitted and locked.');
      const next = deepMerge(cur, patch);
      next.updatedAt = Date.now();
      if (!next.startedAt) next.startedAt = Date.now();
      save(`ann:${caseId}`, next);
      const prog = load('progress', {});
      prog[caseId] = { state: 'draft', updatedAt: next.updatedAt };
      save('progress', prog);
    },
    async ensureStarted() {},
    async submitAnnotation(_uid, caseId, extra = {}) {
      const cur = load(`ann:${caseId}`, {});
      if (cur.submittedAt) return;
      deepMerge(cur, extra);
      cur.submittedAt = Date.now();
      save(`ann:${caseId}`, cur);
      const prog = load('progress', {});
      prog[caseId] = { state: 'submitted', updatedAt: cur.submittedAt };
      save('progress', prog);
    },
    async getNoteAnnotation(_uid, caseId) { return load(`note:${caseId}`, null); },
    async patchNoteAnnotation(_uid, caseId, patch) {
      const cur = load(`note:${caseId}`, {});
      if (cur.submittedAt) throw new Error('This pair is submitted and locked.');
      const next = deepMerge(cur, patch);
      next.updatedAt = Date.now();
      if (!next.startedAt) next.startedAt = Date.now();
      save(`note:${caseId}`, next);
      const prog = load('progress', {});
      prog[caseId] = { state: 'draft', updatedAt: next.updatedAt };
      save('progress', prog);
    },
    async ensureNoteStarted() {},
    async submitNoteAnnotation(_uid, caseId, extra = {}) {
      const cur = load(`note:${caseId}`, {});
      if (cur.submittedAt) return;
      deepMerge(cur, extra);
      cur.submittedAt = Date.now();
      save(`note:${caseId}`, cur);
      const prog = load('progress', {});
      prog[caseId] = { state: 'submitted', updatedAt: cur.submittedAt };
      save('progress', prog);
    },
    async getDebrief() { return load('debrief', null); },
    async submitDebrief(_uid, d) { save('debrief', { ...d, submittedAt: Date.now() }); },
    async reportProblem(_uid, caseId, text) {
      const list = load('problems', []);
      list.push({ caseId, text, at: Date.now() });
      save('problems', list);
    },

    // Adjudicator
    async getAdjAssignments() { return Object.keys(DEMO_ADJUDICATION).map((caseId, i) => ({ caseId, order: i })); },
    async getAdjudicationSet(caseId) { return DEMO_ADJUDICATION[caseId] || null; },
    async getAdjudication(_uid, caseId) { return load(`adj:${caseId}`, null); },
    async patchAdjudication(_uid, caseId, patch) {
      const cur = load(`adj:${caseId}`, {});
      if (cur.submittedAt) throw new Error('Locked.');
      save(`adj:${caseId}`, deepMerge(cur, { ...patch, updatedAt: Date.now() }));
    },
    async submitAdjudication(_uid, caseId) {
      const cur = load(`adj:${caseId}`, {});
      cur.submittedAt = Date.now();
      save(`adj:${caseId}`, cur);
    },

    // Admin
    async adminOverview() {
      const profile = load('profile', null);
      const progress = load('progress', {});
      const approved = load('approved', { [DEMO_UID]: { role: 'rater', slot: 'R1', approvedBy: 'you@example.org' } });
      const rows = [{
        uid: DEMO_UID, email: 'demo.rater@example.org', profile, guidelines: load('guidelines', null),
        access: approved[DEMO_UID] || null,
        assigned: Object.values(assignments).filter((a) => !a.practice).length,
        submitted: Object.entries(progress).filter(([cid, p]) => p.state === 'submitted' && !assignments[cid]?.practice).length,
        problems: load('problems', []).length,
      }];
      return { rows, slots: ['R1', 'R2'], slotHolders: approved[DEMO_UID]?.slot ? { [approved[DEMO_UID].slot]: DEMO_UID } : {} };
    },
    async adminApprove(uid, role, slot) { save('approved', { [uid]: { role, slot, approvedBy: 'you@example.org' } }); },
    async adminRevoke(uid) { const a = load('approved', {}); a[uid] = null; save('approved', a); },
  };
  return store;
}

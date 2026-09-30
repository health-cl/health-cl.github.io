// Firebase backend (Auth + Realtime Database). Paths and permissions are enforced server-side by
// database.rules.json; this file only reads and writes the paths a signed-in user is allowed to.
//
//   (all paths below are under /clinician_reading)
//   /config                          study settings (admin writes)
//   /annotators/{uid}/profile        rater profile (own)
//   /annotators/{uid}/guidelines     guideline version read + quiz passed (own)
//   /admins/{uid}                    study admins (set with tools/admin.py make-admin)
//   /access/{uid}                    approval by an admin: role, slot (admin writes, in the browser)
//   /slots/{slot}, /slotHolders      prepared case lists per reader slot; who holds each slot
//   /assignments/{uid}/{caseId}      which cases a rater reads, in which order (copied from a slot on approval)
//   /cases/{caseId}                  case content (readable only by a verified, assigned, trained rater)
//   /annotations/{uid}/{caseId}      ratings (own; locked once submitted)
//   /progress/{uid}/{caseId}         draft / submitted, for the study team's progress view
//   /problems/{uid}/{pushId}         problem reports (append-only)
//   /adjAssignments, /adjSets, /adjudications   adjudicator equivalents

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
// Everything this app stores sits under one key, so it can share a Firebase project with other studies.
export const ROOT = 'clinician_reading';

function flatten(obj, prefix, out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const p = `${prefix}/${k}`;
    if (v && typeof v === 'object' && !Array.isArray(v) && !v['.sv']) flatten(v, p, out);
    else out[p] = v;
  }
  return out;
}

export async function createFirebaseStore(firebaseConfig, { emulator = false } = {}) {
  const [{ initializeApp }, authMod, dbMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-database.js`),
  ]);
  const {
    getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, sendSignInLinkToEmail,
    isSignInWithEmailLink, signInWithEmailLink, signOut, setPersistence, browserSessionPersistence, connectAuthEmulator,
  } = authMod;
  const { getDatabase, ref, get, update, push, serverTimestamp, onValue, connectDatabaseEmulator } = dbMod;

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getDatabase(app);
  if (emulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(db, '127.0.0.1', 9000);
  }
  // Session persistence: closing the browser signs the rater out (shared-computer safety).
  await setPersistence(auth, browserSessionPersistence);

  let user = null;
  const val = async (path) => { const s = await get(ref(db, `${ROOT}/${path}`)); return s.exists() ? s.val() : null; };

  // Role comes from the database, set by a study admin in the browser: /admins/{uid} or /access/{uid}.
  async function describe(u) {
    if (!u) return null;
    const [adm, acc] = await Promise.all([val(`admins/${u.uid}`).catch(() => null), val(`access/${u.uid}`).catch(() => null)]);
    return { uid: u.uid, email: u.email, name: u.displayName || '', emailVerified: u.emailVerified,
      role: adm ? 'admin' : (acc?.role || null), slot: acc?.slot || null };
  }

  const store = {
    mode: 'firebase',
    async init() {},
    onAuth(cb) { onAuthStateChanged(auth, async (u) => { user = await describe(u); cb(user); }); },
    currentUser() { return user; },
    async refreshClaims() {
      if (!auth.currentUser) return null;
      user = await describe(auth.currentUser);
      return user;
    },
    async signInWithGoogle() { await signInWithPopup(auth, new GoogleAuthProvider()); },
    async sendEmailLink(email) {
      await sendSignInLinkToEmail(auth, email, { url: location.href.split('#')[0], handleCodeInApp: true });
      try { localStorage.setItem('annot:emailForSignIn', email); } catch { /* ignore */ }
    },
    async completeEmailLinkIfPresent(promptEmail) {
      if (!isSignInWithEmailLink(auth, location.href)) return false;
      let email = null;
      try { email = localStorage.getItem('annot:emailForSignIn'); } catch { /* ignore */ }
      if (!email) email = await promptEmail();
      if (!email) return false;
      await signInWithEmailLink(auth, email, location.href);
      try { localStorage.removeItem('annot:emailForSignIn'); } catch { /* ignore */ }
      history.replaceState(null, '', location.pathname + (emulator ? '?emulator' : '') + location.hash);
      return true;
    },
    async signOut() { await signOut(auth); },
    onConnection(cb) { onValue(ref(db, '.info/connected'), (s) => cb(!!s.val())); },

    async getConfig() { return (await val('config')) || {}; },
    async getProfile(uid) { return val(`annotators/${uid}/profile`); },
    async saveProfile(uid, data) {
      await update(ref(db, `${ROOT}/annotators/${uid}/profile`), { ...data, updatedAt: serverTimestamp() });
    },
    // Approval by a study admin is the access gate.
    async getVerification(uid) { const a = await val(`access/${uid}`); return a ? { verified: true, ...a } : null; },
    async getGuidelinesStatus(uid) { return val(`annotators/${uid}/guidelines`); },
    async saveGuidelinesStatus(uid, status) {
      const s = { ...status };
      for (const k of ['readAt', 'quizPassedAt']) if (s[k] === true) s[k] = serverTimestamp();
      await update(ref(db, `${ROOT}/annotators/${uid}/guidelines`), s);
    },

    async getAssignments(uid) {
      const a = (await val(`assignments/${uid}`)) || {};
      return Object.entries(a).map(([caseId, v]) => ({ caseId, ...v })).sort((x, y) => x.order - y.order);
    },
    async getProgress(uid) { return (await val(`progress/${uid}`)) || {}; },
    async getCase(caseId) { return val(`cases/${caseId}`); },
    async getAnnotation(uid, caseId) { return val(`annotations/${uid}/${caseId}`); },
    async patchAnnotation(uid, caseId, patch) {
      const base = `annotations/${uid}/${caseId}`;
      const upd = flatten(patch, base);
      upd[`${base}/updatedAt`] = serverTimestamp();
      upd[`progress/${uid}/${caseId}`] = { state: 'draft', updatedAt: serverTimestamp() };
      await update(ref(db, ROOT), upd);
    },
    async ensureStarted(uid, caseId) {
      const s = await val(`annotations/${uid}/${caseId}/startedAt`);
      if (!s) await update(ref(db, ROOT), { [`annotations/${uid}/${caseId}/startedAt`]: serverTimestamp() });
    },
    async submitAnnotation(uid, caseId, extra = {}) {
      const base = `annotations/${uid}/${caseId}`;
      const upd = flatten(extra, base);
      upd[`${base}/submittedAt`] = serverTimestamp();
      upd[`progress/${uid}/${caseId}`] = { state: 'submitted', updatedAt: serverTimestamp() };
      await update(ref(db, ROOT), upd);
    },
    // Procedure-note pairs (Amendment A3) are answered under /noteAnnotations with the same lifecycle.
    async getNoteAnnotation(uid, caseId) { return val(`noteAnnotations/${uid}/${caseId}`); },
    async patchNoteAnnotation(uid, caseId, patch) {
      const base = `noteAnnotations/${uid}/${caseId}`;
      const upd = flatten(patch, base);
      upd[`${base}/updatedAt`] = serverTimestamp();
      upd[`progress/${uid}/${caseId}`] = { state: 'draft', updatedAt: serverTimestamp() };
      await update(ref(db, ROOT), upd);
    },
    async ensureNoteStarted(uid, caseId) {
      const s = await val(`noteAnnotations/${uid}/${caseId}/startedAt`);
      if (!s) await update(ref(db, ROOT), { [`noteAnnotations/${uid}/${caseId}/startedAt`]: serverTimestamp() });
    },
    async submitNoteAnnotation(uid, caseId, extra = {}) {
      const base = `noteAnnotations/${uid}/${caseId}`;
      const upd = flatten(extra, base);
      upd[`${base}/submittedAt`] = serverTimestamp();
      upd[`progress/${uid}/${caseId}`] = { state: 'submitted', updatedAt: serverTimestamp() };
      await update(ref(db, ROOT), upd);
    },
    async getDebrief(uid) { return val(`annotators/${uid}/debrief`); },
    async submitDebrief(uid, d) { await update(ref(db, `${ROOT}/annotators/${uid}/debrief`), { ...d, submittedAt: serverTimestamp() }); },
    async reportProblem(uid, caseId, text) {
      await push(ref(db, `${ROOT}/problems/${uid}`), { caseId, text: String(text).slice(0, 2000), at: serverTimestamp() });
    },

    async getAdjAssignments(uid) {
      const a = (await val(`adjAssignments/${uid}`)) || {};
      return Object.entries(a).map(([caseId, v]) => ({ caseId, ...v })).sort((x, y) => x.order - y.order);
    },
    async getAdjudicationSet(caseId) { return val(`adjSets/${caseId}`); },
    async getAdjudication(uid, caseId) { return val(`adjudications/${uid}/${caseId}`); },
    async patchAdjudication(uid, caseId, patch) {
      const base = `adjudications/${uid}/${caseId}`;
      const upd = flatten(patch, base);
      upd[`${base}/updatedAt`] = serverTimestamp();
      await update(ref(db, ROOT), upd);
    },
    async submitAdjudication(uid, caseId) {
      await update(ref(db, ROOT), { [`adjudications/${uid}/${caseId}/submittedAt`]: serverTimestamp() });
    },

    async adminOverview() {
      const [annotators, access, assignments, progress, problems, slots, slotHolders] = await Promise.all(
        ['annotators', 'access', 'assignments', 'progress', 'problems', 'slots', 'slotHolders'].map((p) => val(p)));
      const rows = Object.keys(annotators || {}).map((uid) => {
        const prog = progress?.[uid] || {};
        const asg = assignments?.[uid] || {};
        return {
          uid,
          email: annotators?.[uid]?.profile?.email || '',
          profile: annotators?.[uid]?.profile || null,
          guidelines: annotators?.[uid]?.guidelines || null,
          access: access?.[uid] || null,
          assigned: Object.values(asg).filter((a) => !a.practice).length,
          submitted: Object.entries(prog).filter(([cid, p]) => p.state === 'submitted' && asg[cid] && !asg[cid].practice).length,
          problems: Object.keys(problems?.[uid] || {}).length,
        };
      });
      return { rows, slots: Object.keys(slots || {}).sort(), slotHolders: slotHolders || {} };
    },
    async adminApprove(uid, role, slot) {
      const upd = {};
      upd[`access/${uid}`] = { role, ...(slot ? { slot } : {}), approvedBy: user.email, approvedAt: serverTimestamp() };
      if (slot) {
        const rows = await val(`slots/${slot}`);
        if (!rows) throw new Error(`Slot ${slot} has no cases.`);
        const holder = await val(`slotHolders/${slot}`);
        if (holder && holder !== uid) throw new Error(`Slot ${slot} is already given to another reader.`);
        upd[`assignments/${uid}`] = rows;
        upd[`slotHolders/${slot}`] = uid;
      }
      await update(ref(db, ROOT), upd);
    },
    async adminRevoke(uid) {
      await update(ref(db, ROOT), { [`access/${uid}`]: null });
    },
  };
  return store;
}

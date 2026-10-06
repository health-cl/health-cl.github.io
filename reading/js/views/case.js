import { h, mount, toast, confirmDialog, fmtDuration } from '../dom.js';
import { isNoteId } from './note.js';
import { openTutorialDialog } from './tutorial.js';
import { ORDER_SCALES, HARM_LEVELS, HARM_REASONS, LIKELIHOOD, PREFERENCE5, ALT_OPTIONS, PLAN_ERROR, SEVERITY, COMMON_OMISSION, PREF_REASONS, missingForSubmit, APP_VERSION, GUIDELINES_VERSION } from '../schema.js';

export const PANEL_ORDER = ['Blood tests', 'Urine tests', 'Microbiology', 'Imaging', 'Procedures', 'Medications'];
const IDLE_LIMIT_S = 120;

export function panelsOf(caseDoc) {
  const seen = new Set();
  for (const w of ['A', 'B']) for (const p of caseDoc.workups[w].orders || []) seen.add(p.panel);
  return [...PANEL_ORDER.filter((p) => seen.has(p)), ...[...seen].filter((p) => !PANEL_ORDER.includes(p))];
}

// Within a panel, orders present in both workups come first (so they line up across the two
// columns), then the one-sided orders; original order is kept inside each group.
export function sortedLines(lines) {
  return [...(lines || []).filter((l) => !l.item), ...(lines || []).filter((l) => l.item)];
}

export function itemOrder(caseDoc) {
  // Reading order: panel by panel, A before B within a panel.
  const ids = [];
  for (const panel of panelsOf(caseDoc)) {
    for (const w of ['A', 'B']) {
      const p = (caseDoc.workups[w].orders || []).find((x) => x.panel === panel);
      for (const line of sortedLines(p?.lines)) if (line.item) ids.push(line.item);
    }
  }
  for (const id of Object.keys(caseDoc.items || {})) if (!ids.includes(id)) ids.push(id);
  return ids;
}

export function sharedLine(line) {
  const tag = line.unrated ? ['not rated', 'This order is in one workup only but is not part of the rating.']
    : line.shared === 'differs' ? ['both, components differ', 'In both workups; the components listed in brackets differ (not rated).']
      : line.shared === 'elsewhere' ? ['both', `In both workups; listed under ${line.otherPanel} in the other.`]
        : ['both', 'In both workups.'];
  return h('li', { class: `order order-shared${line.unrated ? ' order-unrated' : ''}`, title: tag[1] },
    h('span', { class: 'order-text' }, line.text), h('span', { class: 'both' }, tag[0]));
}

// The agent's turns are long (greetings, preambles). By default only the questions it asked are shown; the full
// text is one click away. Patient replies and results are always shown in full. Deterministic; no summarising.
export function agentQuestions(text) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(/^(?:[-*\u2022]|\d+[.)])\s+(.*)$/);
    if (bullet) { out.push(bullet[1]); continue; }
    for (const sent of line.split(/(?<=[.?!])\s+/)) if (sent.trim().endsWith('?')) out.push(sent.trim());
  }
  return out;
}

// Display only (Amendment C19): de-identification blanks read as [removed]; an examination that opens with the word
// "Admission" (it was copied from the admission note) does not show that word. Stored case text is unchanged.
export function cleanText(t) { return String(t ?? '').replace(/_{3,}/g, '[removed]'); }
export function cleanCase(caseDoc) {
  const c = JSON.parse(JSON.stringify(caseDoc));
  c.presentation = cleanText(c.presentation);
  for (const w of ['A', 'B']) {
    for (const m of (c.workups?.[w]?.conversation || [])) {
      m.text = cleanText(m.text);
      if (m.who === 'result' && /physical exam/i.test(m.label || '')) m.text = m.text.replace(/^\s*admission\b[\s:]*/i, '');
    }
  }
  return c;
}

export function sharedExam(caseDoc) {
  const ex = ['A', 'B'].map((w) => (caseDoc.workups[w].conversation || []).filter((m) => m.who === 'result' && /physical exam/i.test(m.label || '')));
  return ex[0].length === 1 && ex[1].length === 1 && ex[0][0].text === ex[1][0].text ? ex[0][0].text : null;
}

export function conversationColumn(w, conv, { compact = false, hideExam = false } = {}) {
  const body = h('ol', { class: 'conv' });
  let full = !compact;
  const render = () => mount(body, (conv || []).filter((m) => !(hideExam && m.who === 'result' && /physical exam/i.test(m.label || ''))).map((m) => {
    const label = m.who === 'agent' ? 'Agent' : m.who === 'patient' ? 'Patient' : (m.label ? m.label[0].toUpperCase() + m.label.slice(1) : 'Result');
    if (m.who === 'agent' && !full) {
      const qs = agentQuestions(m.text);
      return h('li', { class: 'msg msg-agent msg-compact' }, h('span', { class: 'msg-who' }, qs.length ? 'Agent asked' : 'Agent'),
        qs.length ? h('ul', { class: 'asked' }, qs.map((q) => h('li', {}, q))) : h('p', { class: 'msg-text muted' }, m.text));
    }
    return h('li', { class: `msg msg-${m.who}` }, h('span', { class: 'msg-who' }, label), h('p', { class: 'msg-text' }, m.text));
  }));
  render();
  const toggle = compact ? h('button', { type: 'button', class: 'linklike conv-toggle', onclick: () => { full = !full; toggle.textContent = full ? 'Show only the agent\'s questions' : 'Show the full conversation'; render(); } }, 'Show the full conversation') : null;
  return h('div', { class: `col col-${w}` },
    h('h3', { class: 'col-head' }, h('span', { class: `side side-${w}` }, w), `Workup ${w}`, toggle),
    body);
}

export async function renderCase(main, ctx, caseId) {
  const { store, state, go, setCleanup } = ctx;
  const uid = state.user.uid;
  const cfg = { formVersion: 'v2', harmRequired: true, likelihood: true, ...state.config };
  const scale = ORDER_SCALES[cfg.formVersion] || ORDER_SCALES.v2;
  const preview = state.user.role === 'admin';

  mount(main, h('section', { class: 'page' }, h('p', { class: 'muted' }, 'Loading case…')));

  let assignments = [], progress = {};
  if (!preview) {
    if (!state.verification?.verified) return go('');
    [assignments, progress] = await Promise.all([store.getAssignments(uid), store.getProgress(uid)]);
  }
  const idx = assignments.findIndex((a) => a.caseId === caseId);
  const asg = assignments[idx];
  if (!preview && !asg) { toast('This case is not assigned to you.', 'error'); return go(''); }

  if (!preview) {
    // Enforce reading order: practice first, then study cases in the assigned order.
    const practice = assignments.filter((a) => a.practice);
    const study = assignments.filter((a) => !a.practice && !isNoteId(a.caseId));
    const done = (a) => progress[a.caseId]?.state === 'submitted';
    const list = asg.practice ? practice : study;
    const firstOpen = list.find((a) => !done(a));
    const allowed = done(asg) || (firstOpen && firstOpen.caseId === caseId && (asg.practice || practice.every(done)));
    if (!allowed) { toast('Please work through the cases in order.', 'error'); return go(''); }
  }

  let caseDoc, ann;
  try {
    [caseDoc, ann] = await Promise.all([store.getCase(caseId), preview ? null : store.getAnnotation(uid, caseId)]);
  } catch (e) {
    mount(main, h('section', { class: 'page narrow' }, h('h1', {}, 'Cannot open this case'), h('p', {}, e.message), h('a', { href: '#/', class: 'btn btn-secondary' }, 'Back to cases')));
    return;
  }
  if (!caseDoc) { toast('Case not found.', 'error'); return go(''); }
  caseDoc = cleanCase(caseDoc);
  ann = ann || {};
  ann.items = ann.items || {};
  caseDoc.items = caseDoc.items || {}; // Firebase drops empty objects (cases with no one-sided order)
  ann.workups = ann.workups || {};
  const locked = preview || !!ann.submittedAt;
  let submitted = false;
  if (!locked) store.ensureStarted?.(uid, caseId);
  // Practice cases may carry the study physicians' agreed answers (Amendment C10); shown only after submission.
  const ref = locked && (preview || asg?.practice) ? caseDoc.reference || null : null;
  const codeLabel = (code) => (scale.find((x) => x.code === code)?.label || code);

  const study = assignments.filter((a) => !a.practice && !isNoteId(a.caseId));
  const practice = assignments.filter((a) => a.practice);
  const title = preview ? `Preview ${caseId}` : asg.practice
    ? `Practice ${practice.findIndex((a) => a.caseId === caseId) + 1} of ${practice.length}`
    : `Case ${study.findIndex((a) => a.caseId === caseId) + 1} of ${study.length}`;

  // ---------- autosave ----------
  const saveState = h('span', { class: 'save-state', role: 'status', 'aria-live': 'polite' }, locked ? '' : ann.updatedAt ? 'Saved' : '');
  let pending = Promise.resolve();
  let inflight = 0; // writes sent but not yet confirmed by the server
  function save(patch) {
    if (locked || submitted) return pending;
    saveState.textContent = 'Saving…';
    inflight += 1;
    pending = pending.then(() => store.patchAnnotation(uid, caseId, patch))
      .then(() => { saveState.textContent = 'Saved'; })
      .catch((e) => { saveState.textContent = 'Not saved'; toast(`Not saved: ${e.message}`, 'error'); })
      .finally(() => { inflight -= 1; });
    return pending;
  }
  // Answers typed while offline live only in this tab until the connection returns: warn before closing.
  const beforeUnload = (e) => { if (inflight > 0 || !state.online) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);

  // ---------- active time ----------
  let active = Number(ann.activeSeconds || 0);
  let lastInput = Date.now();
  const timeEl = h('span', { class: 'timer', title: 'Active reading time on this case' }, fmtDuration(active));
  const bump = () => { lastInput = Date.now(); };
  const tick = setInterval(() => {
    if (locked || submitted) return;
    if (document.visibilityState === 'visible' && (Date.now() - lastInput) / 1000 < IDLE_LIMIT_S) {
      active += 1;
      if (active % 20 === 0) save({ activeSeconds: active });
      void timeEl;
    }
  }, 1000);
  ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach((ev) => window.addEventListener(ev, bump, { passive: true }));

  // ---------- item rows ----------
  const order = itemOrder(caseDoc);
  let current = order.find((id) => !ann.items[id]?.r) || order[0];
  const rowEls = {};

  function ratingButtons(itemId) {
    const cur = ann.items[itemId]?.r;
    return h('div', { class: 'rate', role: 'radiogroup', 'aria-label': `Rating for ${caseDoc.items[itemId].name}` },
      scale.map((s) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': cur === s.code ? 'true' : 'false',
        class: `rate-btn rate-${s.cls}${cur === s.code ? ' is-on' : ''}`, disabled: locked, title: s.desc,
        onclick: (e) => { e.stopPropagation(); setRating(itemId, s.code); },
        dataset: { code: s.code },
      }, h('span', {}, s.label))));
  }

  function reasonButtons(itemId) {
    const cur = ann.items[itemId]?.why;
    if (locked) return h('p', { class: 'why-chosen' }, `Main reason: ${HARM_REASONS.find((x) => x.code === cur)?.label || 'not given'}.`);
    return h('div', { class: 'why', role: 'radiogroup', 'aria-label': 'Main reason this order is harmful' },
      h('span', { class: 'why-label' }, 'Main reason:'),
      HARM_REASONS.map((x) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': cur === x.code ? 'true' : 'false', title: x.desc,
        class: `why-btn${cur === x.code ? ' is-on' : ''}`, onclick: (e) => { e.stopPropagation(); setReason(itemId, x.code); },
      }, x.label)));
  }

  function altButtons(itemId) {
    const cur = ann.items[itemId]?.alt;
    if (locked) return h('p', { class: 'why-chosen' }, `Other workup meets this need another way: ${ALT_OPTIONS.find((x) => x.code === cur)?.label || 'not given'}.`);
    return h('div', { class: 'why', role: 'radiogroup', 'aria-label': 'Does the other workup meet this need another way?' },
      h('span', { class: 'why-label' }, 'Does the other workup meet this need another way?'),
      ALT_OPTIONS.map((x) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': cur === x.code ? 'true' : 'false',
        class: `why-btn alt-btn${cur === x.code ? ' is-on' : ''}`, onclick: (e) => { e.stopPropagation(); setSub(itemId, 'alt', x.code); },
      }, x.label)));
  }

  function setSub(id, field, code) {
    if (locked) return;
    ann.items[id] = { ...(ann.items[id] || {}), [field]: code };
    save({ items: { [id]: { [field]: code } } });
    refreshRow(id);
    updateBar();
    const nextId = order.slice(order.indexOf(id) + 1).find((x) => !ann.items[x]?.r) || order.find((x) => !ann.items[x]?.r);
    if (nextId) setCurrent(nextId); else { setCurrent(id, false); rowEls[id]?.focus({ preventScroll: true }); }
  }

  function setReason(id, code) { setSub(id, 'why', code); }



  function itemRow(line, w) {
    const id = line.item;
    const row = h('li', {
      class: `order order-rated${id === current && !locked ? ' is-current' : ''}${ann.items[id]?.r ? ' is-done' : ''}`,
      tabindex: locked ? null : '0', dataset: { item: id },
      onfocus: () => setCurrent(id, false), onclick: () => setCurrent(id, false),
    },
    h('div', { class: 'order-line' }, h('span', { class: 'order-text' }, line.text)),
    ratingButtons(id),
    ann.items[id]?.r === 'N' ? altButtons(id) : null,
    ann.items[id]?.r === 'H' ? reasonButtons(id) : null,
    ref?.items?.[id] ? h('p', { class: 'ref-ans' }, `Study physicians: ${codeLabel(ref.items[id].r)}.`,
      ref.items[id].note ? ` ${ref.items[id].note}` : '') : null);
    rowEls[id] = row;
    return row;
  }

  function refreshRow(id) {
    const old = rowEls[id];
    if (!old) return;
    const w = caseDoc.items[id].side;
    const line = { item: id, text: old.querySelector('.order-text').textContent };
    const fresh = itemRow(line, w);
    old.replaceWith(fresh);
  }

  function setCurrent(id, focus = true) {
    if (locked || !id) return;
    const prev = current;
    current = id;
    rowEls[prev]?.classList.remove('is-current');
    rowEls[id]?.classList.add('is-current');
    if (focus) { rowEls[id]?.focus({ preventScroll: true }); rowEls[id]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }

  function setRating(id, code) {
    if (locked) return;
    const prev = ann.items[id] || {};
    const keepWhy = code === 'H' && prev.why;
    const keepAlt = code === 'N' && prev.alt;
    ann.items[id] = { r: code, ...(keepWhy ? { why: prev.why } : {}), ...(keepAlt ? { alt: prev.alt } : {}) };
    save({ items: { [id]: { r: code, ...(keepWhy ? {} : { why: null }), ...(keepAlt ? {} : { alt: null }) } } });
    refreshRow(id);
    updateBar();
    if ((code === 'H' && !keepWhy) || (code === 'N' && !keepAlt)) { setCurrent(id, false); return; }   // stay until the follow-up is answered
    const nextId = order.slice(order.indexOf(id) + 1).find((x) => !ann.items[x]?.r) || order.find((x) => !ann.items[x]?.r);
    if (nextId) setCurrent(nextId); else { setCurrent(id, false); rowEls[id]?.focus({ preventScroll: true }); }
  }

  function onKey(e) {
    if (locked || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (document.querySelector('dialog[open]')) return;
    const k = e.key.toLowerCase();
    const s = scale.find((x) => x.key === k || (e.key === '?' && x.code === '?'));
    if (s && current) { e.preventDefault(); setRating(current, s.code); return; }
    if (k === 'j' || k === 'k') {
      e.preventDefault();
      const i = order.indexOf(current);
      setCurrent(order[Math.max(0, Math.min(order.length - 1, i + (k === 'j' ? 1 : -1)))]);
    }
  }
  document.addEventListener('keydown', onKey);

  // ---------- orders grid ----------
  // Orders in both workups are not rated; they are folded so the rated orders stay in view (open with one click).
  const panels = panelsOf(caseDoc);
  const isBoth = (line) => !line.item && !line.unrated;
  const linesOf = (w, panel) => sortedLines((caseDoc.workups[w].orders || []).find((x) => x.panel === panel)?.lines);
  const nBoth = panels.reduce((n, panel) => n + linesOf('A', panel).filter(isBoth).length, 0);
  const ordersGrid = h('div', { class: `orders${nBoth && order.length ? ' hide-shared' : ''}` },
    h('div', { class: 'orders-head' },
      ['A', 'B'].map((w) => h('h3', { class: 'col-head' }, h('span', { class: `side side-${w}` }, w), `Workup ${w}`))),
    panels.map((panel) => h('div', { class: `panel-row${['A', 'B'].every((w) => linesOf(w, panel).every(isBoth)) ? ' panel-all-shared' : ''}` },
      h('h4', { class: 'panel-name' }, panel),
      h('div', { class: 'panel-cells' }, ['A', 'B'].map((w) => {
        const lines = linesOf(w, panel);
        const both = lines.filter(isBoth).length;
        return h('ul', { class: `cell cell-${w}`, 'aria-label': `Workup ${w}, ${panel}` },
          lines.length ? [...lines.map((line) => (line.item ? itemRow(line, w) : sharedLine(line))),
            both ? h('li', { class: 'order shared-count' }, `${both} in both workups`) : null]
            : h('li', { class: 'order order-none' }, 'none'));
      })))));
  const bothLabel = () => (ordersGrid.classList.contains('hide-shared') ? `Show orders in both workups (${nBoth})` : 'Hide orders in both workups');
  const bothToggle = nBoth && order.length ? h('button', { type: 'button', class: 'linklike both-toggle', onclick: () => { ordersGrid.classList.toggle('hide-shared'); bothToggle.textContent = bothLabel(); } }, '') : null;
  if (bothToggle) bothToggle.textContent = bothLabel();
  const unplaced = Object.entries(caseDoc.items || {}).filter(([id]) => !Object.values(caseDoc.workups).some((wk) => (wk.orders || []).some((p) => (p.lines || []).some((l) => l.item === id))));
  const unplacedBox = unplaced.length ? h('div', { class: 'card' },
    h('h3', {}, 'Other one-sided orders'),
    h('ul', { class: 'cell' }, unplaced.map(([id, it]) => itemRow({ item: id, text: `${it.panel}: ${it.name}` }, it.side)))) : null;

  // ---------- whole-workup ratings ----------
  const harmBoxes = {};
  const seg = (name, opts, cur, onPick, cls = '') => h('div', { class: `seg ${cls}`, role: 'radiogroup', 'aria-label': name },
    opts.map((o) => h('label', { class: `seg-opt${cur === o.code ? ' is-on' : ''}`, title: o.potential || '' },
      h('input', { type: 'radio', name, value: o.code, checked: cur === o.code, disabled: locked, onchange: () => onPick(o.code) }), o.label)));
  function workupCard(w) {
    const wk = ann.workups[w] || {};
    const sev = SEVERITY.find((x) => x.code === wk.harm);
    const sideItems = order.filter((id) => caseDoc.items[id].side === w);
    const links = wk.links || {};
    const linkChip = (key, label) => h('button', { type: 'button', class: `why-btn${links[key] ? ' is-on' : ''}`, disabled: locked,
      'aria-pressed': links[key] ? 'true' : 'false',
      onclick: () => setWorkup(w, { links: { [key]: links[key] ? null : true } }) }, label);
    const box = h('fieldset', { class: 'card workup-card' },
      h('legend', {}, h('span', { class: `side side-${w}` }, w), `Workup ${w}`),
      h('div', { class: 'field-row' },
        h('span', { class: 'row-label' }, 'Important error'),
        seg(`error-${w}`, PLAN_ERROR, wk.error, (code) => setWorkup(w, code === 'yes' ? { error: code } : { error: code, links: null, harm: null, likelihood: null }))),
      wk.error === 'yes' ? [
        h('div', { class: 'field-row' }, h('span', { class: 'row-label' }, 'Where'),
          h('div', { class: 'why why-wrap' }, sideItems.map((id) => linkChip(id, caseDoc.items[id].name)),
            linkChip('missing', 'A missing action'), linkChip('shared', 'An order in both workups'))),
        h('div', { class: 'field-row' }, h('span', { class: 'row-label' }, 'Severity'),
          seg(`harm-${w}`, SEVERITY, wk.harm, (code) => setWorkup(w, { harm: code }), 'seg-harm')),
        sev ? h('p', { class: 'harm-hint' }, sev.potential) : null,
        h('div', { class: 'field-row' }, h('span', { class: 'row-label' }, 'Likelihood'),
          seg(`lk-${w}`, LIKELIHOOD, wk.likelihood, (code) => setWorkup(w, { likelihood: code }))),
      ] : null);
    harmBoxes[w] = box;
    return box;
  }
  function setWorkup(w, patch) {
    const cur = { ...(ann.workups[w] || {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'links' && v) {
        cur.links = { ...(cur.links || {}) };
        for (const [lk, lv] of Object.entries(v)) { if (lv === null) delete cur.links[lk]; else cur.links[lk] = lv; }
        if (!Object.keys(cur.links).length) delete cur.links;
      } else if (v === null) delete cur[k]; else cur[k] = v;
    }
    ann.workups[w] = cur;
    save({ workups: { [w]: patch } });
    const fresh = workupCard(w);
    workupsWrap.replaceChild(fresh, workupsWrap.children[w === 'A' ? 0 : 1]);
    updateBar();
  }
  const workupsWrap = h('div', { class: 'two-col' }, workupCard('A'), workupCard('B'));

  // ---------- both workups, preference + comment ----------
  const bothWrap = h('div', { class: 'both-wrap' });
  function renderBoth() {
    const omText = h('input', { type: 'text', maxlength: 300, class: 'om-text', placeholder: 'Which action? (optional)', disabled: locked, value: ann.commonOmissionText || '',
      oninput: (e) => { ann.commonOmissionText = e.target.value; clearTimeout(omText._t); omText._t = setTimeout(() => save({ commonOmissionText: ann.commonOmissionText }), 600); } });
    mount(bothWrap,
      h('div', { class: 'field-row' }, h('span', { class: 'row-label' }, 'Is an important action missing from both workups?'),
        seg('omission', COMMON_OMISSION, ann.commonOmission, (code) => {
          ann.commonOmission = code; if (code !== 'yes') ann.commonOmissionText = '';
          save({ commonOmission: code, ...(code === 'yes' ? {} : { commonOmissionText: null }) }); renderBoth(); updateBar();
        })),
      ann.commonOmission === 'yes' ? omText : null,
      h('label', { class: 'check fact-conflict' },
        h('input', { type: 'checkbox', checked: !!ann.factConflict, disabled: locked,
          onchange: (e) => { ann.factConflict = e.target.checked; save({ factConflict: e.target.checked ? true : null }); } }),
        h('span', {}, 'The two conversations disagree on a fact that matters for the orders.')));
  }
  renderBoth();
  function prefGroup() {
    const on = (p) => ann.preference === p.code && (ann.preferenceStrength || null) === p.strength;
    const ab = ann.preference === 'A' || ann.preference === 'B';
    return h('div', {},
      h('div', { class: 'seg seg-pref', role: 'radiogroup', 'aria-label': 'Preferred workup' },
        PREFERENCE5.map((p) => h('label', { class: `seg-opt${on(p) ? ' is-on' : ''}` },
          h('input', { type: 'radio', name: 'pref', value: `${p.code}${p.strength ? `-${p.strength}` : ''}`, checked: on(p), disabled: locked,
            onchange: () => {
              const toAB = p.code === 'A' || p.code === 'B';
              ann.preference = p.code; ann.preferenceStrength = p.strength;
              if (!toAB) ann.prefReason = null;
              save({ preference: p.code, preferenceStrength: p.strength, ...(toAB ? {} : { prefReason: null }) });
              prefWrap.replaceChild(prefGroup(), prefWrap.lastChild); updateBar();
            } }),
          p.label))),
      ab ? h('div', { class: 'why' }, h('span', { class: 'why-label' }, 'Main reason:'),
        PREF_REASONS.map((x) => h('button', { type: 'button', class: `why-btn${ann.prefReason === x.code ? ' is-on' : ''}`, disabled: locked,
          onclick: () => { ann.prefReason = x.code; save({ prefReason: x.code }); prefWrap.replaceChild(prefGroup(), prefWrap.lastChild); updateBar(); } }, x.label))) : null);
  }
  const prefWrap = h('div', { class: 'pref' }, prefGroup());
  const comment = h('textarea', { rows: 3, maxlength: 2000, disabled: locked, placeholder: 'Optional',
    oninput: (e) => { ann.comment = e.target.value; clearTimeout(comment._t); comment._t = setTimeout(() => save({ comment: ann.comment }), 600); } }, ann.comment || '');

  // ---------- sticky bar ----------
  const bar = h('div', { class: 'submit-bar' });
  function updateBar() {
    const nItems = order.length;
    const rated = order.filter((id) => ann.items[id]?.r).length;
    const missing = missingForSubmit(caseDoc, ann, cfg);
    const chk = (ok, label, target) => h('button', { type: 'button', class: `chk${ok ? ' ok' : ''}`, onclick: target },
      h('span', { class: 'chk-dot', 'aria-hidden': 'true' }, ok ? '✓' : ''), label);
    mount(bar,
      h('div', { class: 'chks' },
        chk(rated === nItems, `Orders ${rated}/${nItems}`, () => setCurrent(order.find((id) => !ann.items[id]?.r) || order[0])),
        ['A', 'B'].map((w) => {
          const wk = ann.workups[w] || {};
          const ok = wk.error && (wk.error !== 'yes' || (wk.links && Object.keys(wk.links).length && wk.harm && wk.likelihood));
          return chk(ok, `Workup ${w}`, () => harmBoxes[w].scrollIntoView({ behavior: 'smooth', block: 'center' }));
        }),
        chk(!!ann.commonOmission, 'Both', () => bothWrap.scrollIntoView({ behavior: 'smooth', block: 'center' })),
        chk(!!ann.preference && (!['A', 'B'].includes(ann.preference) || (ann.preferenceStrength && ann.prefReason)), 'Preference',
          () => prefWrap.scrollIntoView({ behavior: 'smooth', block: 'center' }))),
      locked && ref && !preview
        ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => (ctx.next ? ctx.next() : go('')) }, 'Continue →')
        : locked
        ? h('span', { class: 'pill pill-done' }, preview ? 'Preview only' : 'Submitted')
        : h('button', { class: 'btn btn-primary', type: 'button', disabled: missing.length > 0,
          title: missing.length ? `Still needed: ${missing.join(', ')}` : 'Submit this case', onclick: submit },
        'Submit case'));
  }

  async function submit() {
    const missing = missingForSubmit(caseDoc, ann, cfg);
    if (missing.length) { toast(`Still needed: ${missing.join(', ')}`, 'error'); return; }
    const counts = {};
    for (const id of order) counts[ann.items[id].r] = (counts[ann.items[id].r] || 0) + 1;
    const hl = (w) => {
      const wk = ann.workups[w] || {};
      if (wk.error !== 'yes') return PLAN_ERROR.find((x) => x.code === wk.error)?.label === 'No' ? 'no important error' : 'unable to assess';
      return `important error, ${(SEVERITY.find((x) => x.code === wk.harm)?.label || '').toLowerCase()} (${(LIKELIHOOD.find((x) => x.code === wk.likelihood)?.label || '').toLowerCase()})`;
    };
    const ok = await confirmDialog({
      title: 'Submit this case?',
      body: h('div', {},
        h('p', {}, 'After submitting you cannot change your answers. If you need to, report a problem and the study team can reopen it.'),
        h('ul', { class: 'summary' },
          h('li', {}, `Orders: ${scale.filter((s) => counts[s.code]).map((s) => `${counts[s.code]} ${s.label.toLowerCase()}`).join(', ')}`),
          h('li', {}, `A: ${hl('A')}. B: ${hl('B')}.`),
          h('li', {}, `Preference: ${PREFERENCE5.find((p) => p.code === ann.preference && (ann.preferenceStrength || null) === p.strength)?.label}`))),
      confirm: 'Submit',
    });
    if (!ok) return;
    try {
      await pending;
      submitted = true;
      await store.submitAnnotation(uid, caseId, { activeSeconds: active, comment: ann.comment || '',
        meta: { appVersion: APP_VERSION, guidelinesVersion: state.config.guidelinesVersion || GUIDELINES_VERSION, formVersion: cfg.formVersion } });
      if (asg?.practice && caseDoc.reference) {
        toast('Submitted. The study physicians\' answers are now shown under yours.', 'ok');
        go(`case/${encodeURIComponent(caseId)}`);
        return;
      }
      toast('Submitted. Opening the next one.', 'ok');
      ctx.next ? ctx.next() : go('');
    } catch (e) { submitted = false; toast(`Could not submit: ${e.message}`, 'error'); }
  }

  async function reportProblem() {
    const ta = h('textarea', { rows: 4, maxlength: 2000, placeholder: 'What is wrong? Do not paste case text.' });
    const ok = await confirmDialog({ title: 'Report a problem with this case', body: h('div', { class: 'stack-sm' },
      h('p', {}, 'For example: text that reveals the model or the answer, a rendering error, or a submitted answer you need to change.'), ta), confirm: 'Send report' });
    if (!ok || !ta.value.trim()) return;
    await store.reportProblem(uid, caseId, ta.value.trim());
    toast('Report sent to the study team.', 'ok');
  }

  setCleanup(() => {
    clearInterval(tick);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('beforeunload', beforeUnload);
    ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach((ev) => window.removeEventListener(ev, bump));
    if (!locked && !submitted) save({ activeSeconds: active });
  });

  const nOrders = order.length;
  const exam = sharedExam(caseDoc);
  mount(main,
    h('section', { class: 'page case' },
      h('div', { class: 'case-head' },
        h('a', { href: preview ? '#/admin' : '#/', class: 'back' }, '← All cases'),
        h('div', { class: 'case-title' },
          h('h1', {}, title),
          asg?.practice ? h('span', { class: 'pill pill-practice' }, 'Practice') : null,
          caseDoc.synthetic ? h('span', { class: 'pill' }, 'Invented case') : null,
          locked && !preview ? h('span', { class: 'pill pill-done' }, 'Submitted') : null),
        h('div', { class: 'case-meta' }, saveState,
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => openTutorialDialog(cfg.formVersion) }, 'How to rate'),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: reportProblem }, 'Report a problem'))),
      preview ? h('p', { class: 'notice' }, 'Study-team preview. Nothing is saved.') : null,
      ref ? h('div', { class: 'notice' }, h('p', {}, 'The study physicians\' answers are shown under yours.'),
        ref.note ? h('p', {}, ref.note) : null) : null,

      h('div', { class: 'card presentation' }, h('h2', { class: 'card-title' }, 'On arrival'), h('p', {}, caseDoc.presentation)),

      h('section', { class: 'block' },
        h('h2', { class: 'block-title' }, h('span', { class: 'step' }, '1'), 'Conversations'),
        exam ? h('div', { class: 'card exam-shared' }, h('h3', { class: 'card-title' }, 'Physical examination (same in both workups)'), h('p', { class: 'msg-text' }, exam)) : null,
        h('div', { class: 'two-col conv-cols' },
          conversationColumn('A', caseDoc.workups.A.conversation, { compact: true, hideExam: !!exam }),
          conversationColumn('B', caseDoc.workups.B.conversation, { compact: true, hideExam: !!exam }))),

      h('section', { class: 'block' },
        h('h2', { class: 'block-title' }, h('span', { class: 'step' }, '2'), nOrders
          ? `Orders in one workup only (${nOrders})`
          : 'Both workups placed the same orders'),
        nOrders ? null : h('p', { class: 'notice' }, 'Nothing to rate here. Review the orders, then rate each workup as a whole below.'),
        bothToggle, ordersGrid, unplacedBox),

      h('section', { class: 'block' },
        h('h2', { class: 'block-title' }, h('span', { class: 'step' }, '3'), 'Each workup'),
        h('p', { class: 'block-note' }, 'An important error is one that should be corrected before care proceeds, including anything important left out.'),
        workupsWrap),

      h('section', { class: 'block' },
        h('h2', { class: 'block-title' }, h('span', { class: 'step' }, '4'), 'Both workups'),
        bothWrap),

      h('section', { class: 'block' },
        h('h2', { class: 'block-title' }, h('span', { class: 'step' }, '5'), 'Which workup would you rather this patient received?'),
        prefWrap,
        h('label', { class: 'comment-label' }, h('span', {}, 'Comment', h('span', { class: 'optional' }, ' (optional)')), comment)),
      bar));
  updateBar();
  if (!locked && current) setTimeout(() => rowEls[current]?.focus({ preventScroll: true }), 50);
}

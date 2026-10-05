import { h, mount, toast, confirmDialog, fmtDuration } from '../dom.js';
import { isNoteId } from './note.js';
import { ORDER_SCALES, HARM_LEVELS, LIKELIHOOD, SERIOUS, PREFERENCE, missingForSubmit, APP_VERSION, GUIDELINES_VERSION } from '../schema.js';

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
    : line.shared === 'differs' ? ['both, details differ', 'In both workups; the details listed in brackets differ.']
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
      }, h('b', {}, s.code === '?' ? 'U' : s.code), h('span', {}, s.label))));
  }

  function itemRow(line, w) {
    const id = line.item;
    const row = h('li', {
      class: `order order-rated${id === current && !locked ? ' is-current' : ''}${ann.items[id]?.r ? ' is-done' : ''}`,
      tabindex: locked ? null : '0', dataset: { item: id },
      onfocus: () => setCurrent(id, false), onclick: () => setCurrent(id, false),
    },
    h('div', { class: 'order-line' },
      h('span', { class: `only only-${w}` }, `${w} only`),
      h('span', { class: 'order-text' }, line.text)),
    ratingButtons(id),
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
    ann.items[id] = { ...(ann.items[id] || {}), r: code };
    save({ items: { [id]: { r: code } } });
    refreshRow(id);
    updateBar();
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
  const panels = panelsOf(caseDoc);
  const ordersGrid = h('div', { class: 'orders' },
    h('div', { class: 'orders-head' },
      ['A', 'B'].map((w) => h('h3', { class: 'col-head' }, h('span', { class: `side side-${w}` }, w), `Workup ${w}`))),
    panels.map((panel) => h('div', { class: 'panel-row' },
      h('h4', { class: 'panel-name' }, panel),
      h('div', { class: 'panel-cells' }, ['A', 'B'].map((w) => {
        const p = (caseDoc.workups[w].orders || []).find((x) => x.panel === panel);
        const lines = sortedLines(p?.lines);
        return h('ul', { class: `cell cell-${w}`, 'aria-label': `Workup ${w}, ${panel}` },
          lines.length ? lines.map((line) => (line.item ? itemRow(line, w)
            : sharedLine(line)))
            : h('li', { class: 'order order-none' }, 'none'));
      })))));
  const unplaced = Object.entries(caseDoc.items || {}).filter(([id]) => !Object.values(caseDoc.workups).some((wk) => (wk.orders || []).some((p) => (p.lines || []).some((l) => l.item === id))));
  const unplacedBox = unplaced.length ? h('div', { class: 'card' },
    h('h3', {}, 'Other one-sided orders'),
    h('ul', { class: 'cell' }, unplaced.map(([id, it]) => itemRow({ item: id, text: `${it.panel}: ${it.name}` }, it.side)))) : null;

  // ---------- whole-workup ratings ----------
  const harmBoxes = {};
  function workupCard(w) {
    const wk = ann.workups[w] || {};
    const sel = HARM_LEVELS.find((x) => x.code === wk.harm);
    const rest = sel ? sel.potential : 'Choose a level to see what it means.';
    const hint = h('p', { class: 'harm-hint' }, rest);
    const show = (lvl) => () => { hint.textContent = lvl.potential; };
    const back = () => { hint.textContent = rest; };
    const box = h('fieldset', { class: 'card workup-card' },
      h('legend', {}, h('span', { class: `side side-${w}` }, w), `Workup ${w}`),
      h('div', { class: 'field-row' },
        h('span', { class: 'row-label', id: `harm-l-${w}` }, 'Worst plausible harm'),
        h('div', { class: 'seg seg-harm', role: 'radiogroup', 'aria-labelledby': `harm-l-${w}` },
          HARM_LEVELS.map((lvl, i) => h('label', { class: `seg-opt harm-${i}${wk.harm === lvl.code ? ' is-on' : ''}`, title: `AHRQ: ${lvl.ahrq}`,
            onmouseenter: show(lvl), onmouseleave: back, onfocusin: show(lvl), onfocusout: back },
            h('input', { type: 'radio', name: `harm-${w}`, value: lvl.code, checked: wk.harm === lvl.code, disabled: locked,
              onchange: () => setWorkup(w, { harm: lvl.code, ...(SERIOUS.has(lvl.code) ? {} : { likelihood: null }) }) }),
            lvl.label)))),
      hint,
      ref?.workups?.[w]?.harm ? h('p', { class: 'ref-ans' }, `Study physicians: ${HARM_LEVELS.find((x) => x.code === ref.workups[w].harm)?.label || ref.workups[w].harm}.`) : null,
      cfg.likelihood && SERIOUS.has(wk.harm) ? h('div', { class: 'field-row' },
        h('span', { class: 'row-label', id: `lk-l-${w}` }, 'Likelihood'),
        h('div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': `lk-l-${w}` },
          LIKELIHOOD.map((l) => h('label', { class: `seg-opt${wk.likelihood === l.code ? ' is-on' : ''}` },
            h('input', { type: 'radio', name: `lk-${w}`, value: l.code, checked: wk.likelihood === l.code, disabled: locked,
              onchange: () => setWorkup(w, { likelihood: l.code }) }),
            l.label)))) : null);
    harmBoxes[w] = box;
    return box;
  }
  function setWorkup(w, patch) {
    ann.workups[w] = { ...(ann.workups[w] || {}), ...patch };
    for (const [k, v] of Object.entries(patch)) if (v === null) delete ann.workups[w][k];
    save({ workups: { [w]: patch } });
    const fresh = workupCard(w);
    workupsWrap.replaceChild(fresh, workupsWrap.children[w === 'A' ? 0 : 1]);
    fresh.querySelector(`input[name="${patch.likelihood !== undefined && patch.likelihood !== null ? 'lk' : 'harm'}-${w}"]:checked`)?.focus();
    updateBar();
  }
  const workupsWrap = h('div', { class: 'two-col' }, workupCard('A'), workupCard('B'));

  // ---------- preference + comment ----------
  function prefGroup() {
    return h('div', { class: 'seg seg-lg', role: 'radiogroup', 'aria-label': 'Preferred workup' },
      PREFERENCE.map((p) => h('label', { class: `seg-opt${ann.preference === p.code ? ' is-on' : ''}` },
        h('input', { type: 'radio', name: 'pref', value: p.code, checked: ann.preference === p.code, disabled: locked,
          onchange: () => { ann.preference = p.code; save({ preference: p.code }); prefWrap.replaceChild(prefGroup(), prefWrap.lastChild); prefWrap.querySelector('input:checked')?.focus(); updateBar(); } }),
        p.label)));
  }
  const prefWrap = h('div', { class: 'pref' }, prefGroup());
  const comment = h('textarea', { rows: 3, maxlength: 2000, disabled: locked, placeholder: 'Optional. For example: information you would have needed, or an inconsistency in the case.',
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
        cfg.harmRequired ? ['A', 'B'].map((w) => {
          const wk = ann.workups[w] || {};
          const ok = wk.harm && (!SERIOUS.has(wk.harm) || !cfg.likelihood || wk.likelihood);
          return chk(ok, `Workup ${w}`, () => harmBoxes[w].scrollIntoView({ behavior: 'smooth', block: 'center' }));
        }) : null,
        chk(!!ann.preference, 'Preference', () => prefWrap.scrollIntoView({ behavior: 'smooth', block: 'center' }))),
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
      const lvl = HARM_LEVELS.find((x) => x.code === wk.harm)?.label || '—';
      const lk = LIKELIHOOD.find((x) => x.code === wk.likelihood)?.label;
      return lk ? `${lvl} (${lk.toLowerCase()} likelihood)` : lvl;
    };
    const ok = await confirmDialog({
      title: 'Submit this case?',
      body: h('div', {},
        h('p', {}, 'After submitting you cannot change your answers. If you need to, report a problem and the study team can reopen it.'),
        h('ul', { class: 'summary' },
          h('li', {}, `Orders: ${scale.filter((s) => counts[s.code]).map((s) => `${counts[s.code]} ${s.label.toLowerCase()}`).join(', ')}`),
          h('li', {}, `Potential harm: A ${hl('A')}; B ${hl('B')}`),
          h('li', {}, `Preferred: ${PREFERENCE.find((p) => p.code === ann.preference)?.label}`))),
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
          asg?.practice ? h('span', { class: 'pill pill-practice' }, 'Practice, not analysed') : null,
          caseDoc.synthetic ? h('span', { class: 'pill' }, 'Invented case') : null,
          locked && !preview ? h('span', { class: 'pill pill-done' }, 'Submitted') : null),
        h('div', { class: 'case-meta' }, saveState,
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: reportProblem }, 'Report a problem'))),
      preview ? h('p', { class: 'notice' }, 'Study-team preview. Nothing is saved.') : null,
      ref ? h('div', { class: 'notice' }, h('p', {}, 'Practice case. The study physicians\' answers are shown under yours. Practice answers are not analysed.'),
        ref.note ? h('p', {}, ref.note) : null) : null,

      h('div', { class: 'card presentation' }, h('h2', { class: 'card-title' }, 'At arrival'), h('p', {}, caseDoc.presentation)),

      h('section', { class: 'block' },
        h('h2', { class: 'block-title' }, h('span', { class: 'step' }, '1'), 'The two conversations before ordering'),
        h('p', { class: 'block-note' }, 'What the patient said in either conversation applies to both.'),
        exam ? h('div', { class: 'card exam-shared' }, h('h3', { class: 'card-title' }, 'Physical examination (same in both workups)'), h('p', { class: 'msg-text' }, exam)) : null,
        h('div', { class: 'two-col conv-cols' },
          conversationColumn('A', caseDoc.workups.A.conversation, { compact: true, hideExam: !!exam }),
          conversationColumn('B', caseDoc.workups.B.conversation, { compact: true, hideExam: !!exam }))),

      h('section', { class: 'block' },
        h('h2', { class: 'block-title' }, h('span', { class: 'step' }, '2'), nOrders
          ? `Rate the ${nOrders} order${nOrders === 1 ? '' : 's'} present in one workup only`
          : 'Both workups placed the same orders'),
        nOrders ? null : h('p', { class: 'notice' }, 'Nothing to rate here. Review the orders, then rate each workup as a whole below.'),
        h('p', { class: 'block-note' }, 'Grey orders are in both workups. ',
          h('span', { class: 'kbd-hint' }, 'Keys: ', scale.map((s) => h('kbd', {}, s.code === '?' ? 'U' : s.code)), ' rate · ', h('kbd', {}, 'J'), h('kbd', {}, 'K'), ' move')),
        ordersGrid, unplacedBox),

      h('section', { class: 'block' },
        h('h2', { class: 'block-title' }, h('span', { class: 'step' }, '3'), 'Each workup as a whole'),
        h('p', { class: 'block-note' }, 'Worst harm these orders could plausibly cause, counting anything important left out.'),
        workupsWrap),

      h('section', { class: 'block' },
        h('h2', { class: 'block-title' }, h('span', { class: 'step' }, '4'), 'Which workup would you rather this patient received?'),
        prefWrap,
        h('label', { class: 'comment-label' }, h('span', {}, 'Comment', h('span', { class: 'optional' }, ' (optional)')), comment)),
      bar));
  updateBar();
  if (!locked && current) setTimeout(() => rowEls[current]?.focus({ preventScroll: true }), 50);
}

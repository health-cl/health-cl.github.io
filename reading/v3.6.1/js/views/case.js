import { h, mount, toast, confirmDialog, fmtDuration } from '../dom.js';
import { isNoteId } from './note.js';
import { openTutorialDialog } from './tutorial.js';
import { withAbbr, abbreviationsIn } from '../abbreviations.js';
import { ORDER_SCALES, HARM_LEVELS, HARM_REASONS, LIKELIHOOD, PREFERENCE5, ALT_OPTIONS, PLAN_ERROR, SEVERITY, COMMON_OMISSION, PREF_REASONS, WORKUP_QUALITY, ERROR_TYPES, OTHER_MAX, missingForSubmit, APP_VERSION, GUIDELINES_VERSION } from '../schema.js';
import { patientLine, encounterColumn, encounterStages, stepChip, lineDetail } from './encounter.js';
import { icon, avatar, PANEL_ICON } from '../icons.js';
import { examView } from '../richtext.js';

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

// Amendment J6: a shared order is judged on the Workups tab, and the note says so.
export const SHARED_NOTE = 'Ordered in both workups. Not rated here. If it was an error, record it on the Workups tab: Important error, A shared order.';
// Amendment J5: the patient named this medicine in either conversation (it says what the patient said, nothing more).
export function namedChip(line) {
  return line.named ? h('span', { class: 'named-chip', title: 'The patient named this medicine in the history (either conversation).' },
    icon('patient', { size: 12 }), 'Named by the patient') : null;
}
function orderText(line) {
  return h('span', { class: 'order-text', title: line.recordText ? `Record title: ${line.recordText}` : null }, line.text);
}
export function sharedLine(line) {
  // Amendment G (app 2.0.10): the tag says what the reader needs, "not rated"; the tooltip only adds detail.
  // 3.1.2: a panel in both workups is the same order whatever components each agent listed, so no "components differ".
  // Amendment J1: the other workup may name the same order differently; its wording is shown under the line.
  const where = line.shared === 'elsewhere' ? ` Listed under ${line.otherPanel} in the other workup.` : '';
  const tag = line.unrated ? ['not rated', 'This order is in one workup only but is not part of the rating.'] : ['in both · not rated', SHARED_NOTE + where];
  const other = line.otherName ? h('span', { class: 'order-other' }, `The other workup wrote “${line.otherName}”${line.shared === 'elsewhere' ? `, under ${line.otherPanel}` : ''}.`) : null;
  const sub = other || line.named ? h('span', { class: 'order-sub' }, other, namedChip(line)) : null;
  return h('li', { class: `order order-shared${line.unrated ? ' order-unrated' : ''}`, title: tag[1] },
    h('span', { class: 'order-main' }, orderText(line), stepChip(line.step, line.steps)),
    h('span', { class: 'both' }, tag[0]), sub);
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
// Amendment J7: a shifted year (2100 to 2299) right after a de-identification blank is part of the blank.
export function cleanText(t) { return String(t ?? '').replace(/_{3,}(\s+)2[12]\d\d\b/g, '___').replace(/_{3,}/g, '[removed]'); }
// Amendment H (app 2.0.11): MIRA's record has no primary symptom for some patients, so the agent's first message ends at the
// colon. Display only: say so, and that the agents received the same line. Stored case text is unchanged.
export const NO_SYMPTOM_NOTE = 'No primary symptom recorded. The agents saw the same blank line.';
export function noPrimarySymptom(t) { return /primary symptoms:\s*$/i.test(String(t ?? '').trim()); }
// The symptom words alone, without the sentence both agents were given around them.
export function chiefComplaint(t) {
  const x = String(t ?? '').trim().replace(/^the patient you are now seeing has primary symptoms:\s*/i, '');
  return x ? x[0].toUpperCase() + x.slice(1) : '';
}
// Procedure names come from the scorer's normalised ICD titles, which lost their brackets ("stone s", "... ercp").
// Display only: the stored item names and the keys are unchanged.
// Amendment J4: the ICD titles in plain words, one per title found in the reading cases; the record's title is shown on hover.
export const PLAIN_PROCEDURE = {
  'venous catheterization not elsewhere classified': 'Venous catheter',
  'endoscopic retrograde cholangiopancreatography ercp': 'ERCP (endoscopic retrograde cholangiopancreatography)',
  'insertion of infusion device into upper vein percutaneous approach': 'Infusion catheter in an upper-body vein',
  'insertion of infusion device into lower vein percutaneous approach': 'Infusion catheter in a lower-body vein',
  'insertion of other device into upper vein percutaneous approach': 'Other device placed in an upper-body vein',
  'introduction of other therapeutic substance into peripheral vein percutaneous approach': 'Intravenous drug, peripheral vein',
  'introduction of other therapeutic substance into peripheral vein open approach': 'Intravenous drug, peripheral vein (open approach)',
  'consultation described as comprehensive': 'Consultation, comprehensive',
  'consultation not otherwise specified': 'Consultation',
  'other consultation': 'Consultation',
  'pulmonary scan': 'Lung scan (nuclear medicine)',
  'interruption of the vena cava': 'Vena cava interruption (IVC filter)',
  'restriction of inferior vena cava percutaneous approach': 'IVC filter',
  'monitoring of cardiac rhythm external approach': 'Cardiac rhythm monitoring',
  'ultrasonography of bilateral lower extremity veins': 'Venous ultrasound, both legs',
  'endoscopic removal of stone s from biliary tract': 'Endoscopic removal of bile duct stones',
  'diagnostic ultrasound of heart': 'Echocardiogram',
  'injection of anticoagulant': 'Anticoagulant injection',
  'computerized tomography ct scan of abdomen and pelvis': 'CT abdomen and pelvis',
  'other oxygen enrichment': 'Oxygen therapy',
};
export function procedureName(t) {
  const plain = PLAIN_PROCEDURE[String(t ?? '').trim().toLowerCase()];
  if (plain) return plain;
  return String(t ?? '').replace(/\bstone s\b/g, 'stone(s)').replace(/ (ercp|ct)\b/g, (m, x) => ` (${x.toUpperCase()})`)
    .replace(/ (not elsewhere classified|not otherwise specified|described as comprehensive|(?:percutaneous|open|external)(?: endoscopic)? approach)$/, ', $1');
}
// The record's own title, for the hover text, when the plain name differs from it.
function recordTitle(panel, t) {
  return panel === 'Procedures' && PLAIN_PROCEDURE[String(t ?? '').trim().toLowerCase()] ? String(t).replace(/\bstone s\b/g, 'stone(s)') : null;
}
// Medication names were lowercased by the scorer; restore Ringer and release-form suffixes (XL, SR, ER, IV). Display only.
export function medicationName(t) {
  return String(t ?? '').replace(/\bringer\b/gi, 'Ringer').replace(/\b(xl|sr|er|xr|cr|dr|odt|iv)\b/g, (m) => m.toUpperCase());
}
// A panel is one order however many of its components the agent listed (Amendment I), so it carries the name clinicians
// order it by: "Complete blood count", "Urinalysis". Display only.
const ORDER_NAME = { 'Complete blood count with differential': 'Complete blood count', 'Urinalysis with microscopy': 'Urinalysis' };
const labName = (t) => ORDER_NAME[t] || t;
const NAME_FIX = { Procedures: procedureName, Medications: medicationName, 'Blood tests': labName, 'Urine tests': labName };
export function cleanCase(caseDoc) {
  const c = JSON.parse(JSON.stringify(caseDoc));
  c.presentation = cleanText(c.presentation);
  for (const it of Object.values(c.items || {})) if (NAME_FIX[it.panel]) { it.recordName = recordTitle(it.panel, it.name); it.name = NAME_FIX[it.panel](it.name); }
  for (const w of ['A', 'B']) {
    for (const p of (c.workups?.[w]?.orders || [])) if (NAME_FIX[p.panel]) for (const l of (p.lines || [])) { l.recordText = recordTitle(p.panel, l.text); l.text = NAME_FIX[p.panel](l.text); }
    for (const p of (c.workups?.[w]?.orders || [])) for (const l of (p.lines || [])) if (l.otherName && NAME_FIX[l.otherPanel || p.panel]) l.otherName = NAME_FIX[l.otherPanel || p.panel](l.otherName);
    for (const st of (c.workups?.[w]?.timeline || [])) {
      for (const o of (st.orders || [])) if (NAME_FIX[o.panel]) o.text = NAME_FIX[o.panel](o.text);
      for (const r of (st.results || [])) for (const row of (r.rows || [])) if (row.group) row.group = labName(row.group);
    }
  }
  for (const w of ['A', 'B']) {
    for (const m of (c.workups?.[w]?.conversation || [])) {
      m.text = cleanText(m.text);
      if (m.who === 'result' && /physical exam/i.test(m.label || '')) m.text = m.text.replace(/^\s*admission\b[\s:]*/i, '');
    }
  }
  return c;
}

// Amendment J2 (display): the record's examination field can hold the examination written after the operation.
export const EXAM_AFTER_SURGERY_NOTE = 'This examination describes surgical incisions, so the record probably holds it from after the operation. The agents received the same text.';
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
        qs.length ? h('ul', { class: 'asked' }, qs.map((q) => h('li', {}, withAbbr(q)))) : h('p', { class: 'msg-text muted' }, withAbbr(m.text)));
    }
    return h('li', { class: `msg msg-${m.who}` }, h('span', { class: 'msg-who' }, label), h('p', { class: 'msg-text' }, withAbbr(m.text)));
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

  if (!preview && asg.free) {
    // Amendment L: the advisor copy of a shared case opens only after that shared case is submitted.
    const base = assignments.find((a) => a.shared && a.caseId === caseId.replace(/X$/, ''));
    if (base && progress[base.caseId]?.state !== 'submitted') { toast('Please submit this case in the shared cases first.', 'error'); return go(''); }
  }
  if (!preview && !asg.free) {
    // Enforce reading order: practice first, then study cases in the assigned order (not for the advisor slot, Amendment I).
    // Amendment L: shared cases are their own sequence, read in order, independent of the slot's other cases.
    const practice = assignments.filter((a) => a.practice);
    const study = assignments.filter((a) => !a.practice && !a.free && !isNoteId(a.caseId) && !!a.shared === !!asg.shared);
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
  const v3 = caseDoc.display === 'v3';                 // Amendment I: encounter view, clinical orders, error types
  const advisor = !!caseDoc.advisor || !!asg?.free;   // advisor slot: any order, answers optional, reasoning shown
  ann = ann || {};
  ann.items = ann.items || {};
  caseDoc.items = caseDoc.items || {}; // Firebase drops empty objects (cases with no one-sided order)
  ann.workups = ann.workups || {};
  const locked = preview || !!ann.submittedAt;
  let submitted = false;
  // Amendment N2: a reader may reopen a submitted case, except practice, a shared case whose advisor copy was opened, and after Finish.
  let canReopen = false;
  if (!preview && ann.submittedAt && !asg.practice) {
    const [deb, xAnn] = await Promise.all([store.getDebrief(uid).catch(() => null), store.getAnnotation(uid, `${caseId}X`).catch(() => null)]);
    canReopen = !deb?.submittedAt && !xAnn;
  }
  const reopened = !locked && (ann.edits || 0) > 0;
  if (!locked) store.ensureStarted?.(uid, caseId);
  // Practice cases may carry the study physicians' agreed answers (Amendment C10); shown only after submission.
  const ref = locked && (preview || asg?.practice) ? caseDoc.reference || null : null;
  const codeLabel = (code) => (scale.find((x) => x.code === code)?.label || code);

  const study = assignments.filter((a) => !a.practice && !a.shared && !isNoteId(a.caseId));
  const practice = assignments.filter((a) => a.practice);
  const sharedList = assignments.filter((a) => a.shared);
  const title = preview ? `Preview ${caseId}` : asg.practice
    ? `Practice ${practice.findIndex((a) => a.caseId === caseId) + 1} of ${practice.length}`
    : asg.shared ? `Shared case ${sharedList.findIndex((a) => a.caseId === caseId) + 1} of ${sharedList.length}`
    : `Case ${study.findIndex((a) => a.caseId === caseId) + 1} of ${study.length}${asg.free ? ` · ${caseId.replace(/X$/, '')}` : ''}`;

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
      .catch((e) => { saveState.textContent = 'Not saved'; toast(`Not saved. ${e.message}`, 'error'); })
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

  // Amendment M6: the four ordered options as stops on one line (labels under, description on hover or focus); Unable to
  // assess beside the line, because it is not a point on that scale. Nothing preselected; codes and keys 1 to 5 unchanged.
  const ORDINAL = scale.map((x) => x.code).join('') === 'NEXH?';
  function ratingScale(itemId) {
    const cur = ann.items[itemId]?.r;
    const name = caseDoc.items[itemId].name;
    const pick = (code) => (e) => { e.stopPropagation(); setRating(itemId, code); };
    const pts = scale.filter((x) => x.code !== '?');
    const na = scale.find((x) => x.code === '?');
    const last = pts.length - 1;
    return h('div', { class: 'rate-scale', role: 'radiogroup', 'aria-label': `Rating for ${name}` },
      h('div', { class: `scale scale-${pts.length}${pts.some((x) => x.code === cur) ? ' has-value' : ''}` },
        pts.map((x, i) => h('button', {
          type: 'button', role: 'radio', 'aria-checked': cur === x.code ? 'true' : 'false', disabled: locked,
          class: `scale-stop tip rate-${x.cls}${i === 0 ? ' tip-start' : i === last ? ' tip-end' : ''}${cur === x.code ? ' is-on' : ''}`,
          'aria-label': `${x.label}. ${x.desc}`, 'data-tip': x.desc, dataset: { code: x.code }, onclick: pick(x.code),
        }, h('span', { class: 'scale-dot', 'aria-hidden': 'true' }), h('span', { class: 'scale-label' }, x.label)))),
      na ? h('button', {
        type: 'button', role: 'radio', 'aria-checked': cur === '?' ? 'true' : 'false', disabled: locked,
        class: `scale-na tip tip-end${cur === '?' ? ' is-on' : ''}`, 'aria-label': `${na.label}. ${na.desc}`, 'data-tip': na.desc,
        dataset: { code: '?' }, onclick: pick('?'),
      }, na.label) : null);
  }
  function ratingButtons(itemId) {
    if (ORDINAL) return ratingScale(itemId);
    const cur = ann.items[itemId]?.r;
    return h('div', { class: 'rate', role: 'radiogroup', 'aria-label': `Rating for ${caseDoc.items[itemId].name}` },
      scale.map((s) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': cur === s.code ? 'true' : 'false',
        class: `rate-btn rate-${s.cls}${cur === s.code ? ' is-on' : ''}`, disabled: locked, title: s.desc,
        onclick: (e) => { e.stopPropagation(); setRating(itemId, s.code); },
        dataset: { code: s.code },
      }, h('span', {}, s.label))));
  }

  // Amendment J8: a short text box for 'Other'. Typing updates the answer and saves without redrawing, so focus stays put.
  // isActive: the box writes only while its 'Other' is still the answer, because a box removed from the page can still fire
  // its blur (or a pending timer) after another option was chosen, and would put the old text back.
  function otherBox(value, label, onText, isActive) {
    const box = h('input', { type: 'text', class: 'other-text', maxlength: OTHER_MAX, value: value || '', disabled: locked,
      placeholder: 'Say which, in a few words', 'aria-label': label,
      onclick: (e) => e.stopPropagation(), onkeydown: (e) => e.stopPropagation(),
      oninput: (e) => { if (!isActive()) return; const v = e.target.value; onText(v); clearTimeout(box._t); box._t = setTimeout(() => { if (isActive()) onText(v, true); }, 600); },
      onblur: (e) => { clearTimeout(box._t); if (isActive() && box.isConnected) onText(e.target.value, true); } });
    return box;
  }
  function reasonButtons(itemId) {
    const cur = ann.items[itemId]?.why;
    if (locked) return h('p', { class: 'why-chosen' }, `Reason · ${HARM_REASONS.find((x) => x.code === cur)?.label || 'not given'}${cur === 'other' && ann.items[itemId]?.whyOther ? `: ${ann.items[itemId].whyOther}` : ''}`);
    return h('div', { class: 'why', role: 'radiogroup', 'aria-label': 'Main reason this order is harmful' },
      h('span', { class: 'why-label' }, 'Main reason'),
      HARM_REASONS.map((x) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': cur === x.code ? 'true' : 'false', title: x.desc,
        class: `why-btn${cur === x.code ? ' is-on' : ''}`, onclick: (e) => { e.stopPropagation(); setReason(itemId, x.code); },
      }, x.label)),
      cur === 'other' ? otherBox(ann.items[itemId]?.whyOther, 'Other reason this order is harmful', (v, commit) => {
        ann.items[itemId] = { ...(ann.items[itemId] || {}), whyOther: v };
        if (commit) save({ items: { [itemId]: { whyOther: v.trim() ? v : null } } });
        updateBar();
      }, () => ann.items[itemId]?.r === 'H' && ann.items[itemId]?.why === 'other') : null);
  }

  function altButtons(itemId) {
    const cur = ann.items[itemId]?.alt;
    if (locked) return h('p', { class: 'why-chosen' }, `Met another way in the other workup · ${ALT_OPTIONS.find((x) => x.code === cur)?.label || 'not given'}`);
    return h('div', { class: 'why', role: 'radiogroup', 'aria-label': 'Met another way in the other workup?' },
      h('span', { class: 'why-label' }, 'Met another way in the other workup?'),
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

  function setReason(id, code) {
    if (locked) return;
    if (code !== 'other') {
      if (ann.items[id]?.whyOther !== undefined) { const { whyOther, ...rest } = ann.items[id]; void whyOther; ann.items[id] = rest; save({ items: { [id]: { whyOther: null } } }); }
      setSub(id, 'why', code);
      return;
    }
    // 'Other' stays on this order until the reason is typed
    ann.items[id] = { ...(ann.items[id] || {}), why: 'other' };
    save({ items: { [id]: { why: 'other' } } });
    refreshRow(id);
    updateBar();
    setCurrent(id, false);
    ensureVisible(rowEls[id]);
    rowEls[id]?.querySelector('.other-text')?.focus({ preventScroll: true });
  }
  // A follow-up question that opens must not sit under the fixed case header or the bar at the bottom.
  function ensureVisible(el) {
    if (!el) return;
    const top = (document.querySelector('.case-top')?.getBoundingClientRect().bottom || 0) + 8;
    const bottom = (document.querySelector('.submit-bar')?.getBoundingClientRect().top || window.innerHeight) - 8;
    const r = el.getBoundingClientRect();
    if (r.bottom > bottom) window.scrollBy({ top: Math.min(r.bottom - bottom, r.top - top), behavior: 'smooth' });
    else if (r.top < top) window.scrollBy({ top: r.top - top, behavior: 'smooth' });
  }



  const lineOf = {};
  function itemRow(line, w) {
    const id = line.item;
    lineOf[id] = line;
    const row = h('li', {
      class: `order order-rated${id === current && !locked ? ' is-current' : ''}${ann.items[id]?.r ? ' is-done' : ''}`,
      tabindex: locked ? null : '0', dataset: { item: id },
      onfocus: () => setCurrent(id, false), onclick: () => setCurrent(id, false),
    },
    h('div', { class: 'order-line' }, orderText(line), stepChip(line.step, line.steps)),
    lineDetail(line),
    namedChip(line),
    ratingButtons(id),
    ann.items[id]?.r === 'N' ? altButtons(id) : null,
    ann.items[id]?.r === 'H' ? reasonButtons(id) : null,
    ref?.items?.[id] ? h('p', { class: 'ref-ans' }, `Study physicians rated it ${codeLabel(ref.items[id].r)}.`,
      ref.items[id].note ? ` ${ref.items[id].note}` : '') : null);
    rowEls[id] = row;
    return row;
  }

  function refreshRow(id) {
    const old = rowEls[id];
    if (!old) return;
    const w = caseDoc.items[id].side;
    const line = lineOf[id] || { item: id, text: old.querySelector('.order-text').textContent };
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
    const keepOther = keepWhy && prev.why === 'other' && prev.whyOther !== undefined;
    ann.items[id] = { r: code, ...(keepWhy ? { why: prev.why } : {}), ...(keepOther ? { whyOther: prev.whyOther } : {}), ...(keepAlt ? { alt: prev.alt } : {}) };
    save({ items: { [id]: { r: code, ...(keepWhy ? {} : { why: null, whyOther: null }), ...(keepAlt ? {} : { alt: null }) } } });
    refreshRow(id);
    updateBar();
    if ((code === 'H' && !keepWhy) || (code === 'N' && !keepAlt)) { setCurrent(id, false); ensureVisible(rowEls[id]); return; }   // stay until the follow-up is answered
    const nextId = order.slice(order.indexOf(id) + 1).find((x) => !ann.items[x]?.r) || order.find((x) => !ann.items[x]?.r);
    if (nextId) setCurrent(nextId); else { setCurrent(id, false); rowEls[id]?.focus({ preventScroll: true }); }
  }

  function onKey(e) {
    if (locked || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (document.querySelector('dialog[open]')) return;
    if (v3 && tab !== 'orders') return;
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
    panels.map((panel) => {
      // Amendment M5: the orders placed by both workups are counted once, on the panel's heading, not inside one column.
      // (max of the two sides: an order matched across panels, Amendment J1, sits under a different panel on each side)
      const nBothHere = Math.max(...['A', 'B'].map((w) => linesOf(w, panel).filter(isBoth).length));
      return h('div', { class: `panel-row${['A', 'B'].every((w) => linesOf(w, panel).every(isBoth)) ? ' panel-all-shared' : ''}` },
        h('h4', { class: 'panel-name' }, v3 ? icon(PANEL_ICON[panel] || 'orders', { size: 15 }) : null, panel, v3 && (panel === 'Procedures' || panel === 'Medications')
          ? h('span', { class: 'info-tip tip tip-start', tabindex: '0', 'data-tip': 'The agent could order these directly in this simulation. In practice the emergency physician usually consults the treating service.' }, icon('info', { size: 14 })) : null,
          nBothHere ? h('span', { class: 'panel-both' }, `${nBothHere} in both workups · not rated`) : null),
        h('div', { class: 'panel-cells' }, ['A', 'B'].map((w) => {
          const lines = linesOf(w, panel);
          const own = lines.filter((line) => !isBoth(line)).length;
          return h('ul', { class: `cell cell-${w}`, 'aria-label': `Workup ${w}, ${panel}` },
            lines.map((line) => (line.item ? itemRow(line, w) : sharedLine(line))),
            own ? null : h('li', { class: 'order order-none' }, lines.length ? `Nothing only in workup ${w}` : 'None ordered'));
        })));
    }));
  const bothLabel = () => (ordersGrid.classList.contains('hide-shared') ? `Show ${nBoth} shared orders` : 'Hide shared orders');
  const bothToggle = nBoth && order.length ? h('button', { type: 'button', class: 'linklike both-toggle', onclick: () => { ordersGrid.classList.toggle('hide-shared'); bothToggle.textContent = bothLabel(); } }, '') : null;
  if (bothToggle) bothToggle.textContent = bothLabel();
  const bothNote = nBoth ? h('p', { class: 'both-note' }, SHARED_NOTE) : null;
  const unplaced = Object.entries(caseDoc.items || {}).filter(([id]) => !Object.values(caseDoc.workups).some((wk) => (wk.orders || []).some((p) => (p.lines || []).some((l) => l.item === id))));
  const unplacedBox = unplaced.length ? h('div', { class: 'card' },
    h('h3', {}, 'Other one-sided orders'),
    h('ul', { class: 'cell' }, unplaced.map(([id, it]) => itemRow({ item: id, text: `${it.panel}: ${it.name}` }, it.side)))) : null;

  // ---------- whole-workup ratings ----------
  const harmBoxes = {};
  const seg = (name, opts, cur, onPick, cls = '') => h('div', { class: `seg ${cls}`, role: 'radiogroup', 'aria-label': name },
    opts.map((o) => h('label', { class: `seg-opt${cur === o.code ? ' is-on' : ''}`, title: o.potential || '' },
      h('input', { type: 'radio', name, value: o.code, checked: cur === o.code, disabled: locked, onchange: () => onPick(o.code) }), o.label)));
  function workupCardV3(w) {
    const wk = ann.workups[w] || {};
    const sideItems = order.filter((id) => caseDoc.items[id].side === w);
    const radios = (name, opts, cur, onPick, row = false) => h('div', { class: `radios${row ? ' radios-row' : ''}`, role: 'radiogroup', 'aria-label': name },
      opts.map((o) => h('label', { class: `radio-opt${cur === o.code ? ' is-on' : ''}`, title: o.potential || o.desc || '' },
        h('input', { type: 'radio', name: `${name}-${w}`, value: o.code, checked: cur === o.code, disabled: locked, onchange: () => onPick(o.code) }),
        h('span', { class: 'radio-mark', 'aria-hidden': 'true' }),
        h('span', { class: 'radio-text' }, h('span', { class: 'radio-label' }, o.label), o.anchor ? h('span', { class: 'radio-desc' }, o.anchor) : null))));
    const checks = (name, opts, sel, onToggle) => h('div', { class: 'checks', role: 'group', 'aria-label': name },
      opts.map((o) => h('label', { class: `check-opt${sel[o.code] ? ' is-on' : ''}`, title: o.desc || '' },
        h('input', { type: 'checkbox', checked: !!sel[o.code], disabled: locked, onchange: () => onToggle(o.code) }),
        h('span', { class: 'check-mark', 'aria-hidden': 'true' }, icon('check', { size: 12 })),
        h('span', {}, o.label))));
    // Amendment M7: overall quality as five stops, 1 to 5 from left to right; each anchor behind an information icon.
    const likert = (name, opts, cur, onPick) => h('div', { class: `scale scale-${opts.length} scale-likert${cur ? ' has-value' : ''}`, role: 'radiogroup', 'aria-label': name },
      opts.map((o, i) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': cur === o.code ? 'true' : 'false', disabled: locked,
        class: `scale-stop tip${i === 0 ? ' tip-start' : i === opts.length - 1 ? ' tip-end' : ''}${cur === o.code ? ' is-on' : ''}`,
        'aria-label': `${o.label}. ${o.anchor}`, 'data-tip': o.anchor, dataset: { code: o.code }, onclick: () => onPick(o.code),
      }, h('span', { class: 'scale-dot', 'aria-hidden': 'true' }, o.code),
        h('span', { class: 'scale-label' }, o.label.replace(/^\d+\s*/, ''), h('span', { class: 'scale-i', 'aria-hidden': 'true' }, icon('info', { size: 12 }))))));
    const links = wk.links || {}, types = wk.types || {};
    const q = (label, tip, body) => h('div', { class: 'q' }, h('div', { class: 'q-label' }, label,
      tip ? h('span', { class: 'info-tip', tabindex: '0', title: tip }, icon('info', { size: 14 })) : null), body);
    // Amendment J9: the workup being judged, in one line, so the reader need not go back to the Encounters tab.
    const sm = caseDoc.workups[w].summary || {};
    const finalDx = caseDoc.workups[w].final;
    // Amendment M4: the final diagnosis only; the step and order counts are not needed to judge the workup.
    const summary = h('div', { class: 'wk-summary' },
      sm.finishBeforeResults ? h('span', { class: 'enc-chip enc-chip-warn' }, icon('alert', { size: 12 }), 'Diagnosis before results') : null,
      h('span', { class: 'wk-dx' }, h('span', { class: 'wk-dx-k' }, 'Final diagnosis'),
        finalDx === null ? h('span', { class: 'muted' }, 'hidden to keep the reading blind') : h('span', {}, String(finalDx || 'none given').replace(/^\s*\*\*(.*)\*\*\s*$/, '$1'))));
    // Non-blocking notes where two answers of this workup disagree.
    const clash = wk.error === 'yes' && (wk.quality === '4' || wk.quality === '5') ? 'You rated this workup Good or Excellent and also marked an important error. Both can be right; check that this is what you meant.'
      : wk.error === 'no' && wk.quality === '1' ? 'You rated this workup Very poor but marked no important error. Both can be right; check that this is what you meant.' : null;
    const typesOtherBox = types.other ? otherBox(wk.typesOther, `Other type of error, workup ${w}`, (v, commit) => {
      ann.workups[w] = { ...(ann.workups[w] || {}), typesOther: v };
      if (commit) save({ workups: { [w]: { typesOther: v.trim() ? v : null } } });
      updateBar();
    }, () => ann.workups[w]?.error === 'yes' && !!ann.workups[w]?.types?.other) : null;
    const box = h('fieldset', { class: 'card workup-card v3' },
      h('legend', {}, h('span', { class: `side side-${w}` }, w), `Workup ${w}`),
      summary,
      q('Overall quality', null, likert('Overall quality', WORKUP_QUALITY, wk.quality, (code) => setWorkup(w, { quality: code }))),
      q('Important error', 'An error you would correct before care continues. Mark it even if harm is unlikely.', [
        radios('Important error', PLAN_ERROR, wk.error, (code) => {
          const opening = code === 'unsure' && wk.error !== 'unsure';
          setWorkup(w, code === 'yes' ? { error: code, errorUnsureWhy: null }
            : { error: code, links: null, types: null, typesOther: null, harm: null, likelihood: null, ...(code === 'unsure' ? {} : { errorUnsureWhy: null }) });
          if (opening) setTimeout(() => harmBoxes[w]?.querySelector('.unsure-text')?.focus({ preventScroll: false }), 0);
        }, true),
        // Amendment M8: why it cannot be assessed, optional, at most 300 characters.
        wk.error === 'unsure' ? (locked ? (wk.errorUnsureWhy ? h('p', { class: 'why-chosen' }, `Why · ${wk.errorUnsureWhy}`) : null)
          : (() => { const b = otherBox(wk.errorUnsureWhy, `Why the important error cannot be assessed, workup ${w}`, (v, commit) => {
            ann.workups[w] = { ...(ann.workups[w] || {}), errorUnsureWhy: v };
            if (commit) save({ workups: { [w]: { errorUnsureWhy: v.trim() ? v : null } } });
          }, () => ann.workups[w]?.error === 'unsure'); b.classList.add('unsure-text'); b.placeholder = 'Why, in a few words (optional)'; return b; })()) : null]),
      clash ? h('p', { class: 'clash-note', role: 'note' }, icon('info', { size: 14 }), clash) : null,
      wk.error === 'yes' ? [
        q('Where', null, checks('Where', [...sideItems.map((id) => ({ code: id, label: caseDoc.items[id].name })),
          { code: 'missing', label: 'Something missing' }, { code: 'shared', label: 'A shared order' }], links,
        (code) => setWorkup(w, { links: { [code]: links[code] ? null : true } }))),
        q('Type', null, [checks('Type', ERROR_TYPES, types, (code) => {
          const opening = code === 'other' && !types.other;
          setWorkup(w, code === 'other' && types.other ? { types: { other: null }, typesOther: null } : { types: { [code]: types[code] ? null : true } });
          if (opening) setTimeout(() => harmBoxes[w]?.querySelector('.other-text')?.focus({ preventScroll: false }), 0);
        }), typesOtherBox]),
        q('Severity', null, radios('Severity', SEVERITY, wk.harm, (code) => setWorkup(w, { harm: code }), true)),
        q('Likelihood', null, radios('Likelihood', LIKELIHOOD, wk.likelihood, (code) => setWorkup(w, { likelihood: code }), true)),
      ] : null);
    harmBoxes[w] = box;
    return box;
  }
  function workupCard(w) {
    if (v3) return workupCardV3(w);
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
        h('span', { class: 'row-label' }, 'Overall quality'),
        h('div', { class: 'seg seg-wrap seg-anchor', role: 'radiogroup', 'aria-label': `Overall quality, workup ${w}` },
          WORKUP_QUALITY.map((o) => h('label', { class: `seg-opt${wk.quality === o.code ? ' is-on' : ''}` },
            h('input', { type: 'radio', name: `quality-${w}`, value: o.code, checked: wk.quality === o.code, disabled: locked, onchange: () => setWorkup(w, { quality: o.code }) }),
            h('span', { class: 'q-lab' }, o.label), o.anchor ? h('span', { class: 'q-anchor' }, o.anchor) : null)))),
      h('div', { class: 'field-row' },
        h('span', { class: 'row-label' }, 'Important error'),
        seg(`error-${w}`, PLAN_ERROR, wk.error, (code) => setWorkup(w, code === 'yes' ? { error: code } : { error: code, links: null, types: null, typesOther: null, harm: null, likelihood: null }))),
      wk.error === 'yes' ? [
        h('div', { class: 'field-row' }, h('span', { class: 'row-label' }, 'Where'),
          h('div', { class: 'why why-wrap' }, sideItems.map((id) => linkChip(id, caseDoc.items[id].name)),
            linkChip('missing', 'A missing action'), linkChip('shared', 'An order in both workups'))),
        v3 ? h('div', { class: 'field-row' }, h('span', { class: 'row-label' }, 'Type of error'),
          h('div', { class: 'why why-wrap' }, ERROR_TYPES.map((t) => {
            const on = !!(wk.types || {})[t.code];
            return h('button', { type: 'button', class: `why-btn type-btn${on ? ' is-on' : ''}`, disabled: locked, title: t.desc, 'aria-pressed': on ? 'true' : 'false',
              onclick: () => setWorkup(w, { types: { [t.code]: on ? null : true } }) }, t.label);
          }))) : null,
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
      if ((k === 'links' || k === 'types') && v) {
        cur[k] = { ...(cur[k] || {}) };
        for (const [lk, lv] of Object.entries(v)) { if (lv === null) delete cur[k][lk]; else cur[k][lk] = lv; }
        if (!Object.keys(cur[k]).length) delete cur[k];
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
  const radioRow = (name, opts, isOn, onPick) => h('div', { class: 'radios radios-row', role: 'radiogroup', 'aria-label': name },
    opts.map((o, i) => h('label', { class: `radio-opt${isOn(o) ? ' is-on' : ''}` },
      h('input', { type: 'radio', name, value: String(i), checked: isOn(o), disabled: locked, onchange: () => onPick(o) }),
      h('span', { class: 'radio-mark', 'aria-hidden': 'true' }),
      h('span', { class: 'radio-text' }, h('span', { class: 'radio-label' }, o.label)))));
  const qBlock = (label, body) => h('div', { class: 'q' }, h('div', { class: 'q-label' }, label), body);
  const bothWrap = h('div', { class: 'both-wrap' });
  function renderBothV3() {
    const omText = h('input', { type: 'text', maxlength: 300, class: 'om-text', placeholder: 'Which action', disabled: locked, value: ann.commonOmissionText || '',
      'aria-label': 'Which action is missing',
      oninput: (e) => { ann.commonOmissionText = e.target.value; clearTimeout(omText._t); omText._t = setTimeout(() => save({ commonOmissionText: ann.commonOmissionText }), 600); } });
    const fc = !!ann.factConflict;
    mount(bothWrap,
      qBlock('Is an important action missing from both workups?', radioRow('omission', COMMON_OMISSION, (o) => ann.commonOmission === o.code, (o) => {
        ann.commonOmission = o.code; if (o.code !== 'yes') ann.commonOmissionText = '';
        save({ commonOmission: o.code, ...(o.code === 'yes' ? {} : { commonOmissionText: null }) }); renderBothV3(); updateBar();
      })),
      ann.commonOmission === 'yes' ? omText : null,
      h('div', { class: 'checks' }, h('label', { class: `check-opt${fc ? ' is-on' : ''}` },
        h('input', { type: 'checkbox', checked: fc, disabled: locked,
          onchange: (e) => { ann.factConflict = e.target.checked; save({ factConflict: e.target.checked ? true : null }); renderBothV3(); } }),
        h('span', { class: 'check-mark', 'aria-hidden': 'true' }, icon('check', { size: 12 })),
        h('span', {}, 'The two conversations disagree on an important fact'))));
  }
  function prefGroupV3() {
    const on = (p) => ann.preference === p.code && (ann.preferenceStrength || null) === p.strength;
    const ab = ann.preference === 'A' || ann.preference === 'B';
    return h('div', {},
      radioRow('pref', PREFERENCE5, on, (p) => {
        const toAB = p.code === 'A' || p.code === 'B';
        ann.preference = p.code; ann.preferenceStrength = p.strength;
        if (!toAB) { ann.prefReason = null; delete ann.prefReasonOther; }
        save({ preference: p.code, preferenceStrength: p.strength, ...(toAB ? {} : { prefReason: null, prefReasonOther: null }) });
        prefWrap.replaceChild(prefGroupV3(), prefWrap.lastChild); updateBar();
      }),
      ab ? qBlock('Main reason', [radioRow('pref-reason', PREF_REASONS, (x) => ann.prefReason === x.code, (x) => {
        ann.prefReason = x.code;
        if (x.code !== 'other' && ann.prefReasonOther !== undefined) { delete ann.prefReasonOther; save({ prefReason: x.code, prefReasonOther: null }); } else save({ prefReason: x.code });
        prefWrap.replaceChild(prefGroupV3(), prefWrap.lastChild); updateBar();
        if (x.code === 'other') setTimeout(() => prefWrap.querySelector('.other-text')?.focus(), 0);
      }), ann.prefReason === 'other' ? otherBox(ann.prefReasonOther, 'Other reason for the preference', (v, commit) => {
        ann.prefReasonOther = v;
        if (commit) save({ prefReasonOther: v.trim() ? v : null });
        updateBar();
      }, () => (ann.preference === 'A' || ann.preference === 'B') && ann.prefReason === 'other') : null]) : null);
  }
  function renderBoth() {
    if (v3) return renderBothV3();
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
        h('span', {}, 'The two conversations disagree on an important fact')));
  }
  renderBoth();
  function prefGroup() {
    if (v3) return prefGroupV3();
    const on = (p) => ann.preference === p.code && (ann.preferenceStrength || null) === p.strength;
    const ab = ann.preference === 'A' || ann.preference === 'B';
    return h('div', {},
      h('div', { class: 'seg seg-pref', role: 'radiogroup', 'aria-label': 'Preferred workup' },
        PREFERENCE5.map((p) => h('label', { class: `seg-opt${on(p) ? ' is-on' : ''}` },
          h('input', { type: 'radio', name: 'pref', value: `${p.code}${p.strength ? `-${p.strength}` : ''}`, checked: on(p), disabled: locked,
            onchange: () => {
              const toAB = p.code === 'A' || p.code === 'B';
              ann.preference = p.code; ann.preferenceStrength = p.strength;
              if (!toAB) { ann.prefReason = null; delete ann.prefReasonOther; }
              save({ preference: p.code, preferenceStrength: p.strength, ...(toAB ? {} : { prefReason: null, prefReasonOther: null }) });
              prefWrap.replaceChild(prefGroup(), prefWrap.lastChild); updateBar();
            } }),
          p.label))),
      ab ? h('div', { class: 'why' }, h('span', { class: 'why-label' }, 'Main reason'),
        PREF_REASONS.map((x) => h('button', { type: 'button', class: `why-btn${ann.prefReason === x.code ? ' is-on' : ''}`, disabled: locked,
          onclick: () => {
            ann.prefReason = x.code;
            if (x.code !== 'other' && ann.prefReasonOther !== undefined) { delete ann.prefReasonOther; save({ prefReason: x.code, prefReasonOther: null }); } else save({ prefReason: x.code });
            prefWrap.replaceChild(prefGroup(), prefWrap.lastChild); updateBar();
          } }, x.label)),
        ann.prefReason === 'other' ? otherBox(ann.prefReasonOther, 'Other reason for the preference', (v, commit) => {
          ann.prefReasonOther = v; if (commit) save({ prefReasonOther: v.trim() ? v : null }); updateBar();
        }, () => (ann.preference === 'A' || ann.preference === 'B') && ann.prefReason === 'other') : null) : null);
  }
  const prefWrap = h('div', { class: 'pref' }, prefGroup());
  const comment = h('textarea', { rows: 3, maxlength: 2000, disabled: locked, placeholder: v3 ? '' : 'Optional',
    oninput: (e) => { ann.comment = e.target.value; clearTimeout(comment._t); comment._t = setTimeout(() => save({ comment: ann.comment }), 600); } }, ann.comment || '');

  // ---------- sticky bar ----------
  const bar = h('div', { class: 'submit-bar' });
  let tab = 'enc';
  const status = { enc: false, orders: false, workups: false, decision: false };
  let renderTabs = () => {};
  let show = () => {};
  function updateBar() {
    if (v3) return updateBarV3();
    const nItems = order.length;
    const rated = order.filter((id) => ann.items[id]?.r).length;
    const missing = missingForSubmit(caseDoc, ann, cfg);
    // An order is complete only with its follow-up: the other-workup question for Necessary, a reason for Harmful.
    // Before 2.0.6 the chip counted ratings only, so it showed done while Submit stayed disabled (pilot, 2026-10-09).
    const followUp = (id) => (ann.items[id]?.r === 'N' && !ann.items[id]?.alt) || (ann.items[id]?.r === 'H' && (!ann.items[id]?.why || (ann.items[id].why === 'other' && !String(ann.items[id].whyOther || '').trim())));
    const incomplete = order.filter((id) => !ann.items[id]?.r || followUp(id));
    const nFollow = order.filter(followUp).length;
    const chk = (ok, label, target) => h('button', { type: 'button', class: `chk${ok ? ' ok' : ''}`, onclick: target },
      h('span', { class: 'chk-dot', 'aria-hidden': 'true' }, ok ? '✓' : ''), label);
    mount(bar,
      h('div', { class: 'chks' },
        chk(incomplete.length === 0, `Orders ${rated}/${nItems}${nFollow ? ` · ${nFollow} follow-up${nFollow > 1 ? 's' : ''} left` : ''}`,
          () => setCurrent(incomplete[0] || order[0])),
        ['A', 'B'].map((w) => {
          const wk = ann.workups[w] || {};
          const ok = wk.quality && wk.error && (wk.error !== 'yes' || (wk.links && Object.keys(wk.links).length && wk.harm && wk.likelihood
            && (!v3 || (wk.types && Object.keys(wk.types).length)) && (!wk.types?.other || String(wk.typesOther || '').trim())));
          return chk(ok, `Workup ${w}`, () => harmBoxes[w].scrollIntoView({ behavior: 'smooth', block: 'center' }));
        }),
        chk(!!ann.commonOmission, 'Missing in both', () => bothWrap.scrollIntoView({ behavior: 'smooth', block: 'center' })),
        chk(!!ann.preference && (!['A', 'B'].includes(ann.preference) || (ann.preferenceStrength && ann.prefReason)), 'Preference',
          () => prefWrap.scrollIntoView({ behavior: 'smooth', block: 'center' }))),
      locked && ref && !preview
        ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => (ctx.next ? ctx.next() : go('')) }, 'Continue →')
        : locked
        ? h('div', { class: 'submit-wrap' }, h('span', { class: 'pill pill-done' }, preview ? 'Preview only' : 'Submitted'), reopenBtn())
        : h('div', { class: 'submit-wrap' },
          missing.length ? h('span', { class: 'still-needed' }, `Still needed · ${missing.join(' · ')}`) : null,
          h('button', { class: 'btn btn-primary', type: 'button', disabled: missing.length > 0,
            title: missing.length ? `Still needed · ${missing.join(' · ')}` : 'Submit this case', onclick: submit },
          reopened ? 'Submit again' : 'Submit case')));
  }

  function workupOk(w) {
    const wk = ann.workups[w] || {};
    return !!(wk.quality && wk.error && (wk.error !== 'yes' || (wk.links && Object.keys(wk.links).length && wk.harm && wk.likelihood
      && (!v3 || (wk.types && Object.keys(wk.types).length)) && (!wk.types?.other || String(wk.typesOther || '').trim()))));
  }
  function updateBarV3() {
    const followUp = (id) => (ann.items[id]?.r === 'N' && !ann.items[id]?.alt) || (ann.items[id]?.r === 'H' && (!ann.items[id]?.why || (ann.items[id].why === 'other' && !String(ann.items[id].whyOther || '').trim())));
    status.orders = order.every((id) => ann.items[id]?.r && !followUp(id));
    status.workups = workupOk('A') && workupOk('B');
    status.decision = !!ann.commonOmission && !!ann.preference && (!['A', 'B'].includes(ann.preference) || !!(ann.preferenceStrength && ann.prefReason
      && (ann.prefReason !== 'other' || String(ann.prefReasonOther || '').trim())));
    renderTabs();
    const missing = missingForSubmit(caseDoc, ann, cfg);
    const firstOpen = !status.orders ? 'orders' : !status.workups ? 'workups' : !status.decision ? 'decision' : null;
    mount(bar,
      h('div', { class: 'bar-left' }, h('span', { class: 'save-wrap' }, saveState),
        locked ? null : missing.length
          ? h('button', { type: 'button', class: 'linklike bar-left-btn', title: missing.join(', '), onclick: () => firstOpen && show(firstOpen) },
            `${missing.length} answer${missing.length === 1 ? '' : 's'} left`)
          : h('span', { class: 'bar-ready' }, icon('check', { size: 14 }), 'Ready to submit')),
      locked && ref && !preview
        ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => (ctx.next ? ctx.next() : go('')) }, 'Continue')
        : locked ? h('div', { class: 'bar-right' }, reopenBtn(), h('span', { class: 'pill pill-done' }, preview ? 'Preview only' : 'Submitted'))
          : h('button', { class: 'btn btn-primary', type: 'button', disabled: missing.length > 0, title: missing.length ? missing.join(', ') : 'Submit this case', onclick: submit }, reopened ? 'Submit again' : 'Submit case'));
  }

  function reopenBtn() {
    return canReopen ? h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: reopenCase }, 'Change answers') : null;
  }
  async function reopenCase() {
    const ok = await confirmDialog({
      title: 'Change your answers?',
      body: h('div', {}, h('p', {}, 'Your submitted answers are kept on record. Change what you need, then submit the case again.'),
        h('p', {}, 'Until you submit again, the answers you submitted before are the ones that count.')),
      confirm: 'Change answers',
    });
    if (!ok) return;
    try {
      await store.reopenAnnotation(uid, caseId);
      toast('You can change your answers now.', 'ok');
      go(`case/${encodeURIComponent(caseId)}`);
    } catch (e) { toast(`Could not reopen. ${e.message}`, 'error'); }
  }

  async function submit() {
    const missing = missingForSubmit(caseDoc, ann, cfg);
    if (missing.length) { toast(`Still needed · ${missing.join(' · ')}`, 'error'); return; }
    const counts = {};
    for (const id of order) counts[ann.items[id].r] = (counts[ann.items[id].r] || 0) + 1;
    const hl = (w) => {
      const wk = ann.workups[w] || {};
      const q = `Quality ${wk.quality || ''}`;
      if (wk.error !== 'yes') return `${q}, ${PLAN_ERROR.find((x) => x.code === wk.error)?.label === 'No' ? 'no important error' : 'important error unable to assess'}`;
      return `${q}, important error, ${(SEVERITY.find((x) => x.code === wk.harm)?.label || '').toLowerCase()} harm, ${(LIKELIHOOD.find((x) => x.code === wk.likelihood)?.label || '').toLowerCase()}`;
    };
    const ok = await confirmDialog({
      title: reopened ? 'Submit your changed answers?' : 'Submit this case?',
      body: h('div', {},
        h('p', {}, asg?.practice ? 'Practice answers cannot be changed after submitting, because the study physicians\' answers are shown then.'
          : asg?.shared ? 'You can change this case later from its page, until you open its copy with the model\'s reasoning.'
          : 'You can change a submitted case later from its page, until you press Finish at the end of the session.'),
        h('dl', { class: 'summary-dl' },
          order.length ? [h('dt', {}, 'Orders'), h('dd', {}, scale.filter((s) => counts[s.code]).map((s) => `${counts[s.code]} ${s.label.toLowerCase()}`).join(', '))] : null,
          h('dt', {}, 'Workup A'), h('dd', {}, hl('A')),
          h('dt', {}, 'Workup B'), h('dd', {}, hl('B')),
          h('dt', {}, 'Preference'), h('dd', {}, PREFERENCE5.find((p) => p.code === ann.preference && (ann.preferenceStrength || null) === p.strength)?.label || ''))),
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
      toast(reopened ? 'Submitted again.' : 'Submitted. Opening the next one.', 'ok');
      ctx.next ? ctx.next() : go('');
    } catch (e) { submitted = false; toast(`Could not submit. ${e.message}`, 'error'); }
  }

  async function reportProblem() {
    const ta = h('textarea', { rows: 4, maxlength: 2000, placeholder: 'What is wrong? Do not paste case text.' });
    const ok = await confirmDialog({ title: 'Report a problem with this case', body: h('div', { class: 'stack-sm' },
      h('p', {}, 'For example, text that reveals the model or the answer, a display error, or a submitted answer you cannot change yourself.'), ta), confirm: 'Send report' });
    if (!ok || !ta.value.trim()) return;
    await store.reportProblem(uid, caseId, ta.value.trim());
    toast('Report sent to the study team.', 'ok');
  }

  setCleanup(() => {
    document.body.classList.remove('on-case');
    clearInterval(tick);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('beforeunload', beforeUnload);
    ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach((ev) => window.removeEventListener(ev, bump));
    if (!locked && !submitted) save({ activeSeconds: active });
  });

  function vitalsList(v) {
    if (!v) return h('p', { class: 'vitals vitals-none' }, 'No triage vital signs in the record. The examination may list them.');
    const parts = [['T', v.temp], ['HR', v.hr], ['RR', v.rr], ['SpO₂', v.spo2 && `${v.spo2}%`], ['BP', v.bp], ['Pain', v.pain], ['Acuity', v.acuity]].filter(([, x]) => x);
    return h('dl', { class: 'vitals', 'aria-label': 'Triage vital signs' }, parts.flatMap(([k, x]) => [h('dt', {}, k), h('dd', {}, x)]));
  }
  function patientCard() {
    const abbr = abbreviationsIn([caseDoc.presentation, ...['A', 'B'].flatMap((w) => (caseDoc.workups?.[w]?.conversation || []).map((m) => m.text))]);
    return h('div', { class: 'card patient' },
      h('div', { class: 'patient-main' },
        h('div', { class: 'patient-id' }, h('span', { class: 'card-title' }, 'Patient'), h('p', { class: 'patient-line' }, patientLine(caseDoc.patient)),
          vitalsList(caseDoc.patient?.vitals)),
        h('div', { class: 'patient-arrival' }, h('span', { class: 'card-title' }, 'On arrival · the line both agents received'), h('p', { class: 'arrival-text' }, withAbbr(caseDoc.presentation)),
          noPrimarySymptom(caseDoc.presentation) ? h('p', { class: 'presentation-note' }, NO_SYMPTOM_NOTE) : null)),
      h('ul', { class: 'patient-notes' },
        h('li', {}, 'Sex, age and triage vital signs are from the hospital record. The agents were not given them and had no tool for vital signs; they knew them only if the patient or the examination said so.'),
        h('li', {}, 'Results are what the hospital record held for this patient. “No value in the hospital record” means the hospital did not measure it; it does not say whether the test was needed.'),
        h('li', {}, advisor ? 'Advisor view: the reasoning summaries the model recorded are shown where they exist.'
          : 'The agents’ private reasoning is not shown, to keep the reading blind. You see everything each agent wrote, ordered and received.')),
      abbr.length ? h('details', { class: 'abbr-list' }, h('summary', {}, `Abbreviations in this case (${abbr.length})`),
        h('dl', {}, abbr.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))) : null);
  }

  const nOrders = order.length;
  const exam = sharedExam(caseDoc);

  // ---------- v3 (Amendment I, app 3.1): patient banner, then one tab at a time ----------
  function vitalFlag(k, x) {
    const n = parseFloat(x);
    if (k === 'temp') return n >= 38 ? 'H' : n < 36 ? 'L' : null;
    if (k === 'hr') return n > 100 ? 'H' : n < 50 ? 'L' : null;
    if (k === 'rr') return n > 20 ? 'H' : n < 10 ? 'L' : null;
    if (k === 'spo2') return n < 92 ? 'L' : null;
    if (k === 'bp') { const [sb, db] = String(x).split('/').map(Number); return sb >= 180 || db >= 120 ? 'H' : sb < 90 ? 'L' : null; }
    return null;
  }
  function bannerV3() {
    const p = caseDoc.patient || {};
    const v = p.vitals;
    // label, value, unit, flag key, tooltip: a triage flowsheet row as the record has it
    const vit = v ? [['Temp', v.temp && v.temp.split(' (')[0].replace(/\s*°C$/, ''), '°C', 'temp', v.temp], ['HR', v.hr, 'bpm', 'hr'], ['RR', v.rr, '/min', 'rr'],
      ['SpO₂', v.spo2, '%', 'spo2'], ['BP', v.bp, 'mmHg', 'bp'], ['Pain', v.pain && String(v.pain).replace(/\/10$/, ''), '/10'],
      ['ESI', v.acuity && String(v.acuity).replace(/^ESI\s*/, ''), '', 'esi', 'Emergency Severity Index, 1 most urgent to 5 least']].filter(([, x]) => x) : [];
    const abbr = abbreviationsIn([caseDoc.presentation, ...['A', 'B'].flatMap((w) => (caseDoc.workups?.[w]?.conversation || []).map((m) => m.text))]);
    const info = h('details', { class: 'info-pop' },
      h('summary', { 'aria-label': 'About this record' }, icon('info', { size: 16 })),
      h('div', { class: 'info-pop-body' },
        h('p', {}, 'On arrival the agents saw only the chief complaint. Sex, age and vital signs come from the hospital record.'),
        h('p', {}, 'No value or No report means the hospital record has none for that test.'),
        h('p', {}, advisor ? 'Model reasoning is shown where it was recorded.' : 'Agent reasoning is hidden to keep the reading blind.'),
        abbr.length ? h('details', { class: 'abbr-list' }, h('summary', {}, `Abbreviations (${abbr.length})`),
          h('dl', {}, abbr.flatMap(([k, val]) => [h('dt', {}, k), h('dd', {}, val)]))) : null));
    return h('header', { class: 'pt-banner' },
      h('div', { class: 'pt-who' }, avatar(p.sex, { size: 44 }),
        h('div', { class: 'pt-id' }, h('p', { class: 'pt-name' }, patientLine(p)), h('p', { class: 'pt-sub' }, title))),
      h('div', { class: 'pt-arrival' }, h('span', { class: 'pt-k' }, 'Chief complaint'),
        chiefComplaint(caseDoc.presentation)
          ? h('p', { class: 'pt-cc' }, withAbbr(chiefComplaint(caseDoc.presentation)))
          : h('p', { class: 'pt-cc pt-none' }, 'Not recorded. The agents did not have one either.')),
      h('div', { class: 'pt-vitals' }, h('span', { class: 'pt-k' }, 'Triage vital signs'), vit.length
        ? h('table', { class: 'vitals-grid' },
          h('thead', {}, h('tr', {}, vit.map(([k]) => h('th', { scope: 'col' }, k)))),
          h('tbody', {}, h('tr', {}, vit.map(([, x, unit, key, full]) => {
            const f = key && key !== 'esi' ? vitalFlag(key, x) : null;
            return h('td', { class: key === 'esi' ? `esi-cell esi-${x}` : f ? `vital-${f}` : '', title: full || '' },
              h('span', { class: 'vital-v' }, x), h('span', { class: 'vital-u' }, unit), f ? h('span', { class: 'vital-f', 'aria-label': f === 'H' ? 'high' : 'low' }, f === 'H' ? '▲' : '▼') : null);
          }))))
        : h('p', { class: 'pt-none-v' }, 'None in the record. The examination may give them.')),
      info);
  }
  // Amendment M3: no section tabs; Back and Next move between the four sections, with where the reader is between them.
  const SECTION = { enc: [1, 'Encounters'], orders: [2, 'Orders'], workups: [3, 'Workups'], decision: [4, 'Decision'] };
  const panelNav = (prevK, nextK, k) => h('div', { class: 'panel-nav' },
    prevK ? h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => show(prevK) }, 'Back') : h('span'),
    k ? h('span', { class: 'panel-pos' }, `${SECTION[k][0]} of 4 · ${SECTION[k][1]}`) : null,
    nextK ? h('button', { type: 'button', class: 'btn btn-primary', onclick: () => show(nextK) }, 'Next') : h('span'));
  const hint = (text) => h('p', { class: 'hint' }, icon('info', { size: 15 }), text);
  function mountV3() {
    // Amendment L: the two encounters in case-report order (history, examination, tests and treatments, assessment).
    const encPanel = h('section', { class: 'tab-panel', role: 'tabpanel' },
      encounterStages(caseDoc, { advisor, examNote: caseDoc.examNote === 'afterSurgery' ? EXAM_AFTER_SURGERY_NOTE : null }),
      panelNav(null, 'orders', 'enc'));
    const ordersPanel = h('section', { class: 'tab-panel', role: 'tabpanel' },
      nOrders ? hint('Each column lists the orders only that workup placed. Rate each on what was known when it was placed, not on its result.') : h('p', { class: 'notice' }, 'Both workups placed the same orders. Nothing to rate here.'),
      bothToggle, ordersGrid, unplacedBox, panelNav('enc', 'workups', 'orders'));
    const workupsPanel = h('section', { class: 'tab-panel', role: 'tabpanel' },
      hint('Both workups can be poor. You may use the results here.'), workupsWrap, panelNav('orders', 'decision', 'workups'));
    const decisionPanel = h('section', { class: 'tab-panel', role: 'tabpanel' },
      h('div', { class: 'card decision v3' },
        bothWrap,
        h('hr', { class: 'q-sep' }),
        qBlock('Which workup would you rather this patient received?', prefWrap),
        h('label', { class: 'comment-label' }, h('span', { class: 'q-label' }, 'Comment ', h('span', { class: 'optional' }, 'optional')), comment)),
      panelNav('workups', null, 'decision'));
    const PANELS = { enc: encPanel, orders: ordersPanel, workups: workupsPanel, decision: decisionPanel };
    const TABS = [['enc', 'Encounters', 'history'], ['orders', nOrders ? `Orders · ${nOrders}` : 'Orders', 'orders'], ['workups', 'Workups', 'workup'], ['decision', 'Decision', 'decision']];
    const tabBar = h('nav', { class: 'case-tabs', role: 'tablist', 'aria-label': 'Case sections' });
    renderTabs = () => mount(tabBar, TABS.map(([k, label, ic], i) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': tab === k ? 'true' : 'false',
      class: `case-tab${tab === k ? ' is-on' : ''}${status[k] ? ' is-done' : ''}`, onclick: () => show(k),
    }, h('span', { class: 'case-tab-num' }, status[k] ? icon('check', { size: 12 }) : String(i + 1)), h('span', {}, label))));
    show = (k) => {
      if (tab === 'enc' && k !== 'enc') status.enc = true;
      tab = k;
      try { sessionStorage.setItem(`case-tab:${caseId}`, k); } catch { /* private mode */ }
      for (const [kk, el] of Object.entries(PANELS)) el.hidden = kk !== k;
      renderTabs();
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (k === 'orders' && current && !locked) setTimeout(() => rowEls[current]?.focus({ preventScroll: true }), 30);
    };
    let saved = null;
    try { saved = sessionStorage.getItem(`case-tab:${caseId}`); } catch { /* private mode */ }
    tab = PANELS[saved] ? saved : 'enc';
    if (tab !== 'enc') status.enc = true;
    for (const [kk, el] of Object.entries(PANELS)) el.hidden = kk !== tab;
    // The case header stays on screen: tabs on top, the patient under them. The app's own top bar scrolls away on a case page.
    document.body.classList.add('on-case');
    mount(main,
      h('section', { class: 'page case v3' },
        h('div', { class: 'case-top' },
          h('div', { class: 'case-bar' },
            h('a', { href: preview ? '#/admin' : '#/', class: 'back' }, '← All cases'),
            h('div', { class: 'case-meta' },
              asg?.practice ? h('span', { class: 'pill pill-practice' }, 'Practice') : null,
              caseDoc.synthetic ? h('span', { class: 'pill' }, 'Invented case') : null,
              locked && !preview ? h('span', { class: 'pill pill-done' }, 'Submitted') : null,
              reopenBtn(),
              reopened ? h('span', { class: 'pill pill-draft' }, 'Changing answers') : null,
              // Report a problem stays: text that reveals the model or the answer, or a case the reader cannot reopen (Amendment M3, N2).
              h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: reportProblem }, 'Report a problem'))),
          bannerV3()),
        preview ? h('p', { class: 'notice' }, 'Study-team preview. Nothing is saved.') : null,
        reopened ? h('p', { class: 'notice' }, 'You reopened this case. Submit it again when you are done; until then, the answers you submitted before count.') : null,
        advisor && !preview ? h('p', { class: 'notice' }, 'Advisor view. Open cases in any order. Answers are optional.') : null,
        ref ? h('div', { class: 'notice' }, h('p', {}, 'The study physicians\' answers are shown under yours.'), ref.note ? h('p', {}, ref.note) : null) : null,
        encPanel, ordersPanel, workupsPanel, decisionPanel, bar));
  }
  if (v3) mountV3();
  if (!v3) mount(main,
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
      advisor && !preview ? h('p', { class: 'notice' }, 'Advisor view. Cases open in any order, answers are optional and are not part of the analysis, and the reasoning summaries the model recorded are shown where they exist.') : null,
      ref ? h('div', { class: 'notice' }, h('p', {}, 'The study physicians\' answers are shown under yours.'),
        ref.note ? h('p', {}, ref.note) : null) : null,

      v3 ? patientCard() : null,
      v3 ? null : h('div', { class: 'card presentation' }, h('h2', { class: 'card-title' }, 'On arrival'), h('p', {}, withAbbr(caseDoc.presentation)),
        noPrimarySymptom(caseDoc.presentation) ? h('p', { class: 'presentation-note' }, NO_SYMPTOM_NOTE) : null,
        (() => {   // Abbreviations in this case (display only); the dotted ones also show their meaning on hover or tap
          const list = abbreviationsIn([caseDoc.presentation, ...['A', 'B'].flatMap((w) => (caseDoc.workups?.[w]?.conversation || []).map((m) => m.text))]);
          return list.length ? h('details', { class: 'abbr-list' }, h('summary', {}, `Abbreviations in this case (${list.length})`),
            h('dl', {}, list.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))) : null;
        })()),

      h('section', { class: 'block' },
        h('h2', { class: 'block-title' }, h('span', { class: 'step' }, '1'), v3 ? 'The two encounters' : 'Conversations'),
        v3 ? h('p', { class: 'block-note' }, 'Each workup in time order: the history, every step in which the agent placed orders, the results the record returned, what the agent wrote next, and its final diagnosis.') : null,
        exam ? h('div', { class: 'card exam-shared' }, h('h3', { class: 'card-title' }, 'Physical examination (same in both workups)'), h('p', { class: 'msg-text' }, withAbbr(exam))) : null,
        h('div', { class: 'two-col conv-cols' },
          v3 ? encounterColumn('A', caseDoc.workups.A, { hideExam: !!exam, advisor }) : conversationColumn('A', caseDoc.workups.A.conversation, { compact: true, hideExam: !!exam }),
          v3 ? encounterColumn('B', caseDoc.workups.B, { hideExam: !!exam, advisor }) : conversationColumn('B', caseDoc.workups.B.conversation, { compact: true, hideExam: !!exam }))),

      h('section', { class: 'block' },
        h('h2', { class: 'block-title' }, h('span', { class: 'step' }, '2'), nOrders
          ? `Orders in one workup only (${nOrders})`
          : 'Both workups placed the same orders'),
        nOrders ? null : h('p', { class: 'notice' }, 'Nothing to rate here. Review the orders, then rate each workup as a whole below.'),
        v3 && nOrders ? h('p', { class: 'rate-note' }, h('b', {}, 'Rate each order on what was known when it was placed: '),
          'the history from either conversation, the examination, and the patient\'s sex, age and triage vital signs. Do not use the results to rate an order; use them for the questions about each workup below.') : null,
        bothToggle, bothNote, ordersGrid, unplacedBox),

      h('section', { class: 'block' },
        h('h2', { class: 'block-title' }, h('span', { class: 'step' }, '3'), 'Each workup'),
        h('p', { class: 'block-note' }, (v3 ? 'Both workups can be poor; the differences between them still matter. Here you may use everything shown, including the results and the final diagnosis. ' : '') + 'Rate the overall quality of each workup as care for this patient. An important error is one you would correct before care proceeds: something needed left out, a treatment started before the test it depends on, or an order that could harm this patient. Mark it even if harm is unlikely; severity and likelihood record how serious it is.'),
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

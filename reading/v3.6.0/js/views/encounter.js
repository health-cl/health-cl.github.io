import { h, mount } from '../dom.js';
import { withAbbr } from '../abbreviations.js';
import { icon, PANEL_ICON } from '../icons.js';
import { md, inline, examView, unglue } from '../richtext.js';

// Reading display v3 (Amendment I): each workup as one encounter in time order. Display only; nothing here is stored.
// Case text is shown as the record and the agents produced it; the only transformations are layout and the
// de-identification blank shown as [removed] (cleanCase in case.js).

export const PANEL_ORDER = ['Blood tests', 'Urine tests', 'Microbiology', 'Imaging', 'Procedures', 'Medications'];

const SEX_WORD = { Female: 'Woman', Male: 'Man' };
export function patientLine(p) {
  if (!p) return null;
  const sex = SEX_WORD[p.sex] || 'Sex not recorded';
  const age = !p.age || p.age === 'Not recorded' ? '' : p.age === '90 or older' ? '90+' : `${p.age}`;
  return age ? `${sex}, ${age}` : sex;
}

// kind: 'md' (agent and patient messages), 'exam' (label and finding table), 'plain' (reports, kept as the record wrote them)
function clampText(text, lines = 4, cls = '', kind = 'md') {
  const body = kind === 'exam' ? examView(text) : kind === 'md' ? md(text) : withAbbr(text);
  const p = h('div', { class: `msg-text clamp clamp-${lines} ${kind === 'plain' ? 'pre' : 'md'} ${cls}` }, body);
  const btn = h('button', { type: 'button', class: 'linklike more' }, 'More');
  btn.onclick = () => { const open = p.classList.toggle('is-open'); btn.textContent = open ? 'Less' : 'More'; };
  const t = String(text || '');
  if (t.length <= lines * 95 && t.split('\n').length <= lines) { btn.hidden = true; p.classList.add('is-open'); }
  return h('div', { class: 'clamp-wrap' }, p, btn);
}

// ---------------------------------------------------------------- results
function split(rows) {
  return { vals: rows.filter((r) => r.test && !r.missing), missing: rows.filter((r) => r.missing), raw: rows.filter((r) => r.raw) };
}

// Components in the order a chart lists them; tests not listed keep the record's order after these.
const CHART_ORDER = {
  'Complete blood count with differential': ['White Blood Cells', 'Red Blood Cells', 'Hemoglobin', 'Hematocrit', 'MCV', 'MCH', 'MCHC', 'RDW',
    'Platelet Count', 'Neutrophils', 'Lymphocytes', 'Monocytes', 'Eosinophils', 'Basophils', 'Absolute Neutrophil Count',
    'Absolute Lymphocyte Count', 'Absolute Monocyte Count', 'Absolute Eosinophil Count', 'Absolute Basophil Count'],
  'Basic metabolic panel': ['Sodium', 'Potassium', 'Chloride', 'Bicarbonate', 'Urea Nitrogen', 'Creatinine', 'Glucose', 'Calcium, Total', 'Anion Gap'],
  'Hepatic function panel': ['Alanine Aminotransferase (ALT)', 'Aspartate Aminotransferase (AST)', 'Alkaline Phosphatase', 'Bilirubin, Total',
    'Bilirubin, Direct', 'Albumin'],
  'Coagulation panel (PT/INR, PTT)': ['PT', 'INR', 'PTT'],
  'Urinalysis with microscopy': ['Color', 'Appearance', 'Specific Gravity', 'pH', 'Protein', 'Glucose', 'Ketone', 'Blood', 'Nitrite', 'Leukocytes',
    'Bilirubin', 'Urobilinogen', 'RBC', 'WBC', 'Bacteria', 'Yeast', 'Epithelial Cells'],
  'Blood gas': ['pH', 'pCO2', 'pO2', 'Base Excess'],
};
CHART_ORDER['Complete blood count'] = CHART_ORDER['Complete blood count with differential'];
CHART_ORDER.Urinalysis = CHART_ORDER['Urinalysis with microscopy'];
// Names as a chart prints them where the record's name is long; the record's name is the tooltip.
const CHART_NAME = { 'Alanine Aminotransferase (ALT)': 'ALT', 'Aspartate Aminotransferase (AST)': 'AST' };
const chartSort = (g, rs) => {
  const ord = CHART_ORDER[g];
  if (!ord) return rs;
  const at = (r) => { const i = ord.indexOf(r.test); return i < 0 ? ord.length : i; };
  return rs.map((r, i) => [r, i]).sort((x, y) => at(x[0]) - at(y[0]) || x[1] - y[1]).map(([r]) => r);
};

function labTable(rows) {
  const { vals, missing, raw } = split(rows);
  const groups = [];
  const idx = {};
  for (const r of vals) {
    const g = r.group || 'Other';
    if (!(g in idx)) { idx[g] = groups.length; groups.push([g, []]); }
    groups[idx[g]][1].push(r);
  }
  // A test ordered on its own needs no header; those rows come first, so none sits under a panel it is not part of.
  const single = ([g, rs]) => g === 'Other' || (rs.length === 1 && rs[0].test.toLowerCase().startsWith(g.toLowerCase().split(' (')[0]));
  const ordered = [...groups.filter(single), ...groups.filter((x) => !single(x))];
  const body = [];
  for (const [g, rs0] of ordered) {
    const rs = chartSort(g, rs0);
    if (!single([g, rs0])) body.push(h('tr', { class: 'lab-group' }, h('th', { colspan: '3', scope: 'colgroup' }, g)));
    for (const r of rs) {
      body.push(h('tr', { class: r.flag ? `is-flag is-${r.flag}` : '' },
        h('td', { class: 'lab-test', title: CHART_NAME[r.test] ? r.test : null }, CHART_NAME[r.test] || r.test),
        h('td', { class: 'lab-res num' },
          r.flag ? h('span', { class: `lab-arrow lab-arrow-${r.flag}`, title: r.flag === 'H' ? 'Above range' : 'Below range' }, r.flag === 'H' ? '▲' : '▼') : null,
          h('span', { class: 'lab-val' }, r.value), r.unit ? h('span', { class: 'lab-unit' }, r.unit) : null),
        h('td', { class: 'lab-range num' }, r.range || '')));
    }
  }
  if (missing.length) {
    body.push(h('tr', { class: 'lab-missing' }, h('td', { colspan: '3' },
      h('span', { class: 'lab-missing-label' }, 'No value'), h('span', {}, missing.map((r) => r.test).join(', ')))));
  }
  return h('div', { class: 'labs' },
    body.length ? h('table', { class: 'lab-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Test'), h('th', { class: 'num' }, 'Result'), h('th', { class: 'num' }, 'Range'))),
      h('tbody', {}, body)) : null,
    raw.length ? h('pre', { class: 'lab-raw' }, raw.map((r) => r.raw).join('\n')) : null);
}

const NO_STUDY = /^\s*(Radiology Report:\s*)?Examination could not be performed\.?\s*$/i;
const noStudy = (r) => r.panel === 'Imaging' && NO_STUDY.test(String(r.text || '').replace(/^\s*Radiology Report \([^)]*\):\s*/, ''));

function resultBlock(r) {
  if (r.error) return h('div', { class: 'res res-error', 'data-panel': r.panel || '' }, h('p', {}, icon('alert', { size: 14 }), ' No result. The simulation returned an error.'));
  if (r.rows) return h('div', { class: 'res', 'data-panel': r.panel || '' }, labTable(r.rows));
  let title = r.panel || 'Result', body = r.text || '';
  if (r.panel === 'Imaging') {
    // MIRA heads each report "Radiology Report (<modality> <region>):" and answers a study the record does not hold with
    // "Radiology Report: Examination could not be performed." Shown as the study name, and as no report, like a lab with no value.
    const m = body.match(/^\s*Radiology Report \(([^)]*)\):\s*/);
    if (m) { title = m[1].replace(/\s+/g, ' ').trim(); body = body.slice(m[0].length); }
    if (NO_STUDY.test(body)) {
      return h('div', { class: 'res res-text res-none', 'data-panel': r.panel || '' }, h('h5', { class: 'res-head' }, icon('imaging', { size: 14 }), title),
        h('p', { class: 'lab-missing' }, h('span', { class: 'lab-missing-label' }, 'No report'), h('span', {}, 'None in the hospital record for this study.')));
    }
  }
  return h('div', { class: 'res res-text', 'data-panel': r.panel || '' }, h('h5', { class: 'res-head' }, icon(PANEL_ICON[r.panel] || 'results', { size: 14 }), title),
    r.panel === 'Microbiology' ? h('p', { class: 'record-note', role: 'note' }, icon('info', { size: 14 }), CULTURE_NOTE) : null,
    clampText(body, 8, 'report', 'plain'));
}
// Amendment J3 (display): MIRA returns the first specimen's final culture result at once.
export const CULTURE_NOTE = 'In practice culture results take one to three days. The simulation returned the record\'s final result at once.';
const examNoteEl = (note) => (note ? h('p', { class: 'record-note', role: 'note' }, icon('alert', { size: 14 }), note) : null);

// Order acknowledgments (medications, procedures) are kept in the case but are not results.
// Amendment L: within a step, results in the order of a case record (blood, urine, microbiology, imaging); stable otherwise.
const panelRank = (r) => { const i = PANEL_ORDER.indexOf(r.panel); return i < 0 ? PANEL_ORDER.length : i; };
const shownResults = (st) => (st.results || []).filter((r) => !r.ack).map((r, i) => [r, i])
  .sort((x, y) => panelRank(x[0]) - panelRank(y[0]) || x[1] - y[1]).map(([r]) => r);

function resultsSection(st) {
  const results = shownResults(st);
  if (!results.length) return null;
  let nVal = 0, nRep = 0;
  const flagged = [];
  for (const r of results) {
    if (r.error) continue;
    if (r.rows) { const s = split(r.rows); nVal += s.vals.length; flagged.push(...s.vals.filter((x) => x.flag)); } else if (!noStudy(r)) nRep += 1;
  }
  // Amendment M4: a clear open/close row; no count and no seen tags (each step already says which results the agent had).
  const timed = Array.isArray(st.resultsBefore);
  return h('details', { class: 'results', open: true },   // Amendment N5: open by default
    h('summary', {},
      h('span', { class: 'res-chev', 'aria-hidden': 'true' }, icon('chevron', { size: 16 })),
      h('span', { class: 'res-title' }, icon('results', { size: 15 }), 'Results'),
      nVal || nRep ? null : h('span', { class: 'res-count' }, 'none in the record'),
      timed ? null : st.seen ? h('span', { class: 'stag stag-seen' }, 'Seen by agent') : h('span', { class: 'stag stag-unseen' }, 'Not seen by agent'),
      h('span', { class: 'res-toggle', 'aria-hidden': 'true' }),
      flagged.length ? h('span', { class: 'res-flags' }, flagged.slice(0, 6).map((r) => h('span', { class: `flag-chip flag-${r.flag}` },
        h('span', {}, r.test), h('b', {}, `${r.value} ${r.flag === 'H' ? '▲' : '▼'}`))), flagged.length > 6 ? h('span', { class: 'flag-more' }, `+${flagged.length - 6}`) : null) : null),
    h('div', { class: 'res-body' }, results.map(resultBlock)));
}

// ---------------------------------------------------------------- history (conversation before the first order)
export function agentQuestions(text) {
  const out = [];
  for (const raw of unglue(text).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) { out.push(bullet[1]); continue; }
    for (const sent of line.split(/(?<=[.?!])\s+/)) if (sent.trim().endsWith('?')) out.push(sent.trim());
  }
  return out;
}

const isExam = (m) => m.who === 'result' && /physical exam/i.test(m.label || '');
// One speaker turn: icon, who, then the text, on the speaker's own background.
export function bubble(who, content, { label } = {}) {
  const ic = who === 'agent' ? 'agent' : who === 'patient' ? 'patient' : 'exam';
  const name = label || (who === 'agent' ? 'Agent' : who === 'patient' ? 'Patient' : 'Examination');
  // Amendment M4: the patient speaks from the right, the agent from the left.
  const av = h('span', { class: 'bubble-av', 'aria-hidden': 'true' }, icon(ic, { size: 15 }));
  const body = h('div', { class: 'bubble-body' }, h('span', { class: 'bubble-who' }, name), content);
  return h('div', { class: `bubble bubble-${who}` }, who === 'patient' ? [body, av] : [av, body]);
}

const EXAM_HERE = 'The agent requested the physical examination here (shown in 2, Physical examination)';
export function historyList(conv, { compact = true, hideExam = false, examNote = null, staged = false } = {}) {
  const body = h('ol', { class: 'conv' });
  let full = !compact;
  // The agent's searches of the procedure list are tool output, not part of a chart, and are not shown.
  // Amendment K: with the examination shown once above, the history still marks when this agent requested it.
  const shown = (conv || []).filter((m) => !(m.who === 'result' && /catalogue search/i.test(m.label || '')));
  const render = () => mount(body, shown.map((m) => {
    if (hideExam && isExam(m)) {
      return h('li', { class: 'msg exam-marker' }, h('span', { class: 'exam-marker-line' }, icon('exam', { size: 13 }),
        staged ? EXAM_HERE : 'The agent requested the physical examination here (shown above, the same for both workups)'));
    }
    if (m.who === 'agent' && !full) {
      const qs = agentQuestions(m.text);
      return h('li', { class: 'msg' }, bubble('agent', qs.length ? h('ul', { class: 'asked' }, qs.map((q) => h('li', {}, inline(q))))
        : h('div', { class: 'msg-text md' }, md(m.text))));
    }
    if (m.who === 'agent' || m.who === 'patient') return h('li', { class: 'msg' }, bubble(m.who, h('div', { class: 'msg-text md' }, md(m.text))));
    return h('li', { class: 'msg' }, bubble('result', isExam(m) ? h('div', {}, examNoteEl(examNote), examView(m.text)) : h('div', { class: 'msg-text pre' }, withAbbr(m.text)),
      { label: isExam(m) ? 'Physical examination' : (m.label ? m.label[0].toUpperCase() + m.label.slice(1) : 'Result') }));
  }));
  render();
  const toggle = compact ? h('button', { type: 'button', class: 'linklike conv-toggle' }, 'Full text') : null;
  if (toggle) toggle.onclick = (e) => { e.preventDefault(); e.stopPropagation(); full = !full; toggle.textContent = full ? 'Questions only' : 'Full text'; render(); };
  return { body, toggle };
}

// ---------------------------------------------------------------- one step
function ordersPlaced(orders) {
  const by = {};
  for (const o of orders || []) (by[o.panel] = by[o.panel] || []).push(o);
  const panels = PANEL_ORDER.filter((p) => by[p]);
  if (!panels.length) return null;
  return h('ul', { class: 'placed' }, panels.map((p) => h('li', {},
    h('span', { class: 'placed-panel', title: p }, icon(PANEL_ICON[p], { size: 15 })),
    h('span', { class: 'placed-list' }, by[p].map((o, i) => [i ? ', ' : '', o.text, o.repeat ? h('span', { class: 'stag stag-repeat' }, 'repeat') : null])))));
}

// Amendment K: "step 1", "steps 1 and 2", "steps 1, 3 and 4", "steps 1 to 5" (consecutive runs of three or more).
export function stepsLabel(list) {
  const xs = [...new Set(list || [])].sort((a, b) => a - b);
  if (!xs.length) return '';
  if (xs.length === 1) return `step ${xs[0]}`;
  if (xs.length >= 3 && xs[xs.length - 1] - xs[0] === xs.length - 1) return `steps ${xs[0]} to ${xs[xs.length - 1]}`;
  return `steps ${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
// What the agent had when it acted (Amendment K): test results returned before this model generation.
export function knownBefore(st) {
  return (st.resultsBefore || []).length ? `after the results of ${stepsLabel(st.resultsBefore)}` : 'before any test result';
}
function finishLine(st) {
  if (!st.finish) return null;
  if (st.finishWhen === 'withOrders') {
    return h('p', { class: 'tl-finish tl-finish-warn' }, icon('alert', { size: 14 }),
      `Final diagnosis given together with these orders, before their results${(st.resultsBefore || []).length ? ` (${knownBefore(st)})` : ''}`);
  }
  if (st.finishWhen === 'beforeAnyResult') return h('p', { class: 'tl-finish tl-finish-warn' }, icon('alert', { size: 14 }), 'Final diagnosis given before any test result');
  if (st.finishWhen === 'afterResults') return h('p', { class: 'tl-finish' }, icon('check', { size: 14 }), `Final diagnosis given ${knownBefore(st)}`);
  return h('p', { class: 'tl-finish' }, icon('check', { size: 14 }), 'Final diagnosis given');
}

function stepBlock(st, prevStep, advisor, examNote = null, staged = false) {
  const n = (st.orders || []).length;
  const timed = Array.isArray(st.resultsBefore);   // Amendment K case documents carry the timing of each step
  const sub = timed ? knownBefore(st) : (st.step === 1 ? 'before any result' : `after step ${prevStep || st.step - 1} results`);
  const head = st.step
    ? h('div', { class: 'tl-head' }, h('span', { class: 'tl-dot' }, String(st.step)),
      h('h4', { class: 'tl-title' }, `Step ${st.step}`, h('span', { class: 'tl-sub' }, `${n} order${n === 1 ? '' : 's'} · ${sub}`)))
    : h('div', { class: 'tl-head' }, h('span', { class: 'tl-dot tl-dot-plain' }, ''),
      h('h4', { class: 'tl-title' }, st.finish ? 'Final diagnosis' : staged && hasExam(st) && !st.text && !st.reply ? 'Physical examination requested' : 'Agent message',
        h('span', { class: 'tl-sub' }, timed && (st.finish || staged) ? `no new orders · ${knownBefore(st)}` : 'no new orders')));
  // The record keeps one agent text per turn without its place in the turn, so it is shown after that turn's last step.
  // Amendment L: the blind notice once per turn, where the turn's message would be.
  const text = st.textHidden ? (!staged || st.endOfTurn || st.finish ? h('p', { class: 'muted small' }, 'Agent messages hidden to keep the reading blind') : null)
    : st.text ? bubble('agent', clampText(st.text, 4), { label: timed && st.step ? 'Agent · message at the end of this turn' : 'Agent' }) : null;
  return h('li', { class: `tl-step${st.finish ? ' is-final' : ''}` }, head,
    h('div', { class: 'tl-body' },
      advisor && st.reasoning ? h('details', { class: 'reasoning' }, h('summary', {}, 'Model reasoning'), h('div', { class: 'msg-text md' }, md(st.reasoning))) : null,
      timed ? null : text,
      n ? h('div', { class: 'tl-part' }, ordersPlaced(st.orders)) : null,
      // The agent's searches of the procedure list are not part of a chart and are not shown.
      (st.other || []).filter((o) => o.kind === 'exam').map((o) => (staged
        ? h('p', { class: 'exam-marker-line' }, icon('exam', { size: 13 }), EXAM_HERE)
        : bubble('result', h('div', {}, examNoteEl(examNote), clampText(o.text, 6, '', 'exam')), { label: 'Physical examination' }))),
      timed ? finishLine(st) : (st.finish && st.step ? (shownResults(st).length && !st.seen
        ? h('p', { class: 'tl-finish tl-finish-warn' }, icon('alert', { size: 14 }), 'Final diagnosis given before these results')
        : h('p', { class: 'tl-finish' }, icon('check', { size: 14 }), 'Final diagnosis given')) : null),
      resultsSection(st),
      timed ? text : null,
      st.reply ? bubble('patient', clampText(st.reply, 4)) : null));
}

// ---------------------------------------------------------------- Amendment L: the encounter in case-report order
const hasExam = (st) => (st.other || []).some((o) => o.kind === 'exam');
// A timeline entry with nothing a reader can see (the agent only searched the procedure list) is not drawn.
export const stepVisible = (st) => !!(st.step || st.finish || st.text || st.reply || hasExam(st) || shownResults(st).length || st.reasoning
  || (st.textHidden && st.endOfTurn));

// Each examination the workup received and when the agent requested it.
export function examsOf(wk) {
  const out = (wk.conversation || []).filter(isExam).map((m) => ({ text: m.text, when: 'during the history, before any order' }));
  for (const st of wk.timeline || []) {
    for (const o of (st.other || []).filter((x) => x.kind === 'exam')) {
      out.push({ text: o.text, when: st.step ? `together with the orders of step ${st.step}` : `after the history, ${knownBefore(st)}` });
    }
  }
  return out;
}

const cellTag = (w, extra = null) => h('div', { class: 'cpc-tag' }, h('span', { class: `side side-${w}` }, w), h('span', { class: 'cpc-tag-name' }, `Workup ${w}`), extra);
const cell = (w, ...kids) => h('div', { class: `col enc col-${w} cpc-cell` }, ...kids);
// Amendment M4: what a stage holds is behind an information icon (hover or focus), not written beside the title.
export const tip = (text, cls = '') => h('span', { class: `info-tip tip ${cls}`, tabindex: '0', role: 'note', 'aria-label': text, 'data-tip': text }, icon('info', { size: 14 }));
function stage(n, id, title, sub, row, lead = null) {
  return h('section', { class: 'cpc-stage', 'aria-labelledby': `cpc-${id}` },
    h('h3', { class: 'cpc-title', id: `cpc-${id}` }, h('span', { class: 'cpc-num', 'aria-hidden': 'true' }, String(n)), title,
      sub ? tip(sub, 'tip-start') : null),
    lead, row);
}

function assessment(w, wk, advisor) {
  const tl = wk.timeline || [];
  const fin = tl.find((st) => st.finish);
  const closing = fin && !fin.step ? fin : null;            // the diagnosis came in a generation without orders
  const dx = wk.final === null ? h('p', { class: 'muted small' }, 'Hidden to keep the reading blind')
    : h('p', { class: 'final-dx' }, inline(String(wk.final || '').replace(/^\s*\*\*(.*)\*\*\s*$/, '$1')));
  const msg = closing && !closing.textHidden && closing.text ? bubble('agent', clampText(closing.text, 6), { label: 'Agent · closing message' })
    : closing && closing.textHidden ? h('p', { class: 'muted small' }, 'Agent messages hidden to keep the reading blind')
      : fin && fin.step ? h('p', { class: 'muted small' }, `The agent's message of that turn is shown with step ${fin.step}.`) : null;
  return cell(w, cellTag(w),
    h('div', { class: 'enc-sec enc-final' },
      h('div', { class: 'enc-sec-head' }, icon('diagnosis', { size: 15 }), h('h4', {}, 'Final diagnosis')),
      dx, fin ? finishLine(fin) : null),
    closing || (fin && fin.step) ? h('div', { class: 'enc-sec' },
      advisor && closing && closing.reasoning ? h('details', { class: 'reasoning' }, h('summary', {}, 'Model reasoning'), h('div', { class: 'msg-text md' }, md(closing.reasoning))) : null,
      msg, closing && closing.reply ? bubble('patient', clampText(closing.reply, 4)) : null) : null);
}

export function encounterStages(caseDoc, { advisor = false, examNote = null } = {}) {
  const W = ['A', 'B'];
  const wk = (w) => caseDoc.workups[w];
  const ex = Object.fromEntries(W.map((w) => [w, examsOf(wk(w))]));
  const texts = new Set(W.flatMap((w) => ex[w].map((e) => e.text)));
  const sharedExam = texts.size === 1 && W.every((w) => ex[w].length) ? [...texts][0] : null;
  const noteEl = examNote ? h('p', { class: 'record-note', role: 'note' }, icon('alert', { size: 14 }), examNote) : null;
  const when = (w) => (ex[w].length
    ? h('ul', { class: 'cpc-when' }, ex[w].map((e) => h('li', {}, icon('clock', { size: 13 }), `Requested ${e.when}`)))
    : h('p', { class: 'muted small' }, 'No physical examination requested'));

  const history = h('div', { class: 'two-col cpc-row' }, W.map((w) => {
    const hist = historyList(wk(w).conversation, { compact: false, hideExam: true, staged: true });   // Amendment M4: full text only
    return cell(w, cellTag(w),
      h('div', { class: 'enc-sec' },
        advisor && (wk(w).historyReasoning || []).length ? h('details', { class: 'reasoning' }, h('summary', {}, 'Model reasoning during the history'),
          (wk(w).historyReasoning || []).map((x) => h('div', { class: 'msg-text md' }, md(x.text)))) : null,
        advisor && wk(w).reasoningRecorded === false ? h('p', { class: 'muted small' }, 'No model reasoning recorded') : null,
        hist.body));
  }));

  const exam = sharedExam
    ? [h('div', { class: 'card exam-shared cpc-exam' }, h('h4', { class: 'exam-head' }, icon('exam', { size: 16 }), 'Physical examination', h('span', { class: 'muted small' }, 'the same text in both workups')),
      noteEl, examView(sharedExam)),
    h('div', { class: 'two-col cpc-row' }, W.map((w) => cell(w, cellTag(w), h('div', { class: 'enc-sec' }, when(w)))))]
    : h('div', { class: 'two-col cpc-row' }, W.map((w) => cell(w, cellTag(w), h('div', { class: 'enc-sec' }, when(w),
      ex[w].map((e) => h('div', { class: 'exam-shared' }, noteEl ? noteEl.cloneNode(true) : null, examView(e.text)))))));

  const tests = h('div', { class: 'two-col cpc-row' }, W.map((w) => {
    const tl = (wk(w).timeline || []).filter((st) => stepVisible(st) && !(st.finish && !st.step));
    let prev = null;
    const steps = tl.map((st) => { const el = stepBlock(st, prev, advisor, examNote, true); if (st.step) prev = st.step; return el; });
    return cell(w, cellTag(w), h('div', { class: 'enc-sec' }, steps.length ? h('ol', { class: 'timeline' }, steps) : h('p', { class: 'muted small' }, 'No orders')));
  }));

  return h('div', { class: 'cpc' },
    stage(1, 'history', 'History', 'The conversation before the first order.', history),
    stage(2, 'exam', 'Physical examination', null, exam),
    stage(3, 'tests', 'Tests and treatments', 'A step is the orders the agent placed together, before it had their results. The simulation returned a result only for a test the agent ordered.', tests),
    stage(4, 'assessment', 'Assessment', 'The final diagnosis, when it was given, and the agent\'s closing message.', h('div', { class: 'two-col cpc-row' }, W.map((w) => assessment(w, wk(w), advisor)))));
}

// ---------------------------------------------------------------- one workup as an encounter
export function encounterColumn(w, wk, { hideExam = false, advisor = false, examNote = null } = {}) {
  const s = wk.summary || {};
  const chips = h('div', { class: 'enc-chips' },
    h('span', { class: 'enc-chip' }, `${s.steps || 0} step${s.steps === 1 ? '' : 's'}`),
    h('span', { class: 'enc-chip' }, `${s.orders || 0} orders`),
    s.finishBeforeResults ? h('span', { class: 'enc-chip enc-chip-warn', title: 'The final diagnosis was given before any test result came back' },
      icon('alert', { size: 12 }), 'Diagnosis before results') : null);
  const hist = historyList(wk.conversation, { compact: true, hideExam, examNote });
  let prev = null;
  const steps = (wk.timeline || []).map((st) => { const el = stepBlock(st, prev, advisor, examNote); if (st.step) prev = st.step; return el; });
  return h('div', { class: `col enc col-${w}` },
    h('div', { class: 'col-head' }, h('span', { class: `side side-${w}` }, w), h('span', { class: 'col-name' }, `Workup ${w}`), chips),
    h('details', { class: 'enc-sec', open: true },
      h('summary', { class: 'enc-sec-head' }, icon('history', { size: 15 }), h('h4', {}, 'History'), hist.toggle),
      advisor && (wk.historyReasoning || []).length ? h('details', { class: 'reasoning' }, h('summary', {}, 'Model reasoning during the history'),
        (wk.historyReasoning || []).map((x) => h('div', { class: 'msg-text md' }, md(x.text)))) : null,
      advisor && wk.reasoningRecorded === false ? h('p', { class: 'muted small' }, 'No model reasoning recorded') : null,
      hist.body),
    h('section', { class: 'enc-sec' },
      h('div', { class: 'enc-sec-head' }, icon('orders', { size: 15 }), h('h4', {}, 'Orders and results')),
      h('ol', { class: 'timeline' }, steps)),
    h('section', { class: 'enc-sec enc-final' },
      h('div', { class: 'enc-sec-head' }, icon('diagnosis', { size: 15 }), h('h4', {}, 'Final diagnosis')),
      wk.final === null ? h('p', { class: 'muted small' }, 'Hidden to keep the reading blind')
        : h('p', { class: 'final-dx' }, inline(String(wk.final || '').replace(/^\s*\*\*(.*)\*\*\s*$/, '$1')))));
}

// ---------------------------------------------------------------- order line in the rating grid
export function stepChip(step, steps) {
  if (!step) return null;
  const all = steps && steps.length > 1 ? steps : [step];
  return h('span', { class: 'step-chip', title: `Ordered in step ${all.join(' and ')}` }, `Step ${all.join(', ')}`);
}
const parts = (t) => new Set(String(t).toLowerCase().split(/,|\/| and /).map((x) => x.trim()).filter(Boolean));
// The components are not repeated when the order's name already lists exactly them, as in "Coagulation panel (PT/INR, PTT)".
export function lineDetail(line) {
  if (!line.detail) return null;
  const named = String(line.text || '').match(/\(([^)]*)\)\s*$/);
  if (named) { const a = parts(named[1]), b = parts(line.detail); if (a.size === b.size && [...a].every((x) => b.has(x))) return null; }
  return h('span', { class: 'order-detail' }, withAbbr(line.detail));
}

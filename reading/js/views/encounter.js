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
  if (r.error) return h('div', { class: 'res res-error' }, h('p', {}, icon('alert', { size: 14 }), ' No result. The simulation returned an error.'));
  if (r.rows) return h('div', { class: 'res' }, labTable(r.rows));
  let title = r.panel || 'Result', body = r.text || '';
  if (r.panel === 'Imaging') {
    // MIRA heads each report "Radiology Report (<modality> <region>):" and answers a study the record does not hold with
    // "Radiology Report: Examination could not be performed." Shown as the study name, and as no report, like a lab with no value.
    const m = body.match(/^\s*Radiology Report \(([^)]*)\):\s*/);
    if (m) { title = m[1].replace(/\s+/g, ' ').trim(); body = body.slice(m[0].length); }
    if (NO_STUDY.test(body)) {
      return h('div', { class: 'res res-text res-none' }, h('h5', { class: 'res-head' }, icon('imaging', { size: 14 }), title),
        h('p', { class: 'lab-missing' }, h('span', { class: 'lab-missing-label' }, 'No report'), h('span', {}, 'None in the hospital record for this study.')));
    }
  }
  return h('div', { class: 'res res-text' }, h('h5', { class: 'res-head' }, icon(PANEL_ICON[r.panel] || 'results', { size: 14 }), title),
    clampText(body, 8, 'report', 'plain'));
}

// Order acknowledgments (medications, procedures) are kept in the case but are not results.
const shownResults = (st) => (st.results || []).filter((r) => !r.ack);

function resultsSection(st) {
  const results = shownResults(st);
  if (!results.length) return null;
  let nVal = 0, nRep = 0;
  const flagged = [];
  for (const r of results) {
    if (r.error) continue;
    if (r.rows) { const s = split(r.rows); nVal += s.vals.length; flagged.push(...s.vals.filter((x) => x.flag)); } else if (!noStudy(r)) nRep += 1;
  }
  const count = [nVal ? `${nVal} value${nVal === 1 ? '' : 's'}` : null, nRep ? `${nRep} report${nRep === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || 'None in the record';
  return h('details', { class: 'results' },
    h('summary', {},
      h('span', { class: 'res-title' }, icon('results', { size: 15 }), 'Results'),
      h('span', { class: 'res-count' }, count),
      st.seen ? h('span', { class: 'stag stag-seen' }, 'Seen by agent') : h('span', { class: 'stag stag-unseen' }, 'Not seen by agent'),
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
  return h('div', { class: `bubble bubble-${who}` },
    h('span', { class: 'bubble-av', 'aria-hidden': 'true' }, icon(ic, { size: 15 })),
    h('div', { class: 'bubble-body' }, h('span', { class: 'bubble-who' }, name), content));
}

export function historyList(conv, { compact = true, hideExam = false } = {}) {
  const body = h('ol', { class: 'conv' });
  let full = !compact;
  // The agent's searches of the procedure list are tool output, not part of a chart, and are not shown.
  const shown = (conv || []).filter((m) => !(hideExam && isExam(m)) && !(m.who === 'result' && /catalogue search/i.test(m.label || '')));
  const render = () => mount(body, shown.map((m) => {
    if (m.who === 'agent' && !full) {
      const qs = agentQuestions(m.text);
      return h('li', { class: 'msg' }, bubble('agent', qs.length ? h('ul', { class: 'asked' }, qs.map((q) => h('li', {}, inline(q))))
        : h('div', { class: 'msg-text md' }, md(m.text))));
    }
    if (m.who === 'agent' || m.who === 'patient') return h('li', { class: 'msg' }, bubble(m.who, h('div', { class: 'msg-text md' }, md(m.text))));
    return h('li', { class: 'msg' }, bubble('result', isExam(m) ? examView(m.text) : h('div', { class: 'msg-text pre' }, withAbbr(m.text)),
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

function stepBlock(st, prevStep, advisor) {
  const n = (st.orders || []).length;
  const head = st.step
    ? h('div', { class: 'tl-head' }, h('span', { class: 'tl-dot' }, String(st.step)),
      h('h4', { class: 'tl-title' }, `Step ${st.step}`, h('span', { class: 'tl-sub' }, `${n} order${n === 1 ? '' : 's'} · ${st.step === 1 ? 'before any result' : `after step ${prevStep || st.step - 1} results`}`)))
    : h('div', { class: 'tl-head' }, h('span', { class: 'tl-dot tl-dot-plain' }, ''),
      h('h4', { class: 'tl-title' }, st.finish ? 'Final message' : 'Next message', h('span', { class: 'tl-sub' }, 'no new orders')));
  return h('li', { class: `tl-step${st.finish ? ' is-final' : ''}` }, head,
    h('div', { class: 'tl-body' },
      advisor && st.reasoning ? h('details', { class: 'reasoning' }, h('summary', {}, 'Model reasoning'), h('div', { class: 'msg-text md' }, md(st.reasoning))) : null,
      st.textHidden ? h('p', { class: 'muted small' }, 'Agent messages hidden to keep the reading blind')
        : st.text ? bubble('agent', clampText(st.text, 4)) : null,
      n ? h('div', { class: 'tl-part' }, ordersPlaced(st.orders)) : null,
      // The agent's searches of the procedure list are not part of a chart and are not shown.
      (st.other || []).filter((o) => o.kind === 'exam').map((o) => bubble('result', clampText(o.text, 6, '', 'exam'), { label: 'Physical examination' })),
      st.finish && st.step ? (shownResults(st).length && !st.seen
        ? h('p', { class: 'tl-finish tl-finish-warn' }, icon('alert', { size: 14 }), 'Final diagnosis given before these results')
        : h('p', { class: 'tl-finish' }, icon('check', { size: 14 }), 'Final diagnosis given')) : null,
      resultsSection(st),
      st.reply ? bubble('patient', clampText(st.reply, 4)) : null));
}

// ---------------------------------------------------------------- one workup as an encounter
export function encounterColumn(w, wk, { hideExam = false, advisor = false } = {}) {
  const s = wk.summary || {};
  const chips = h('div', { class: 'enc-chips' },
    h('span', { class: 'enc-chip' }, `${s.steps || 0} step${s.steps === 1 ? '' : 's'}`),
    h('span', { class: 'enc-chip' }, `${s.orders || 0} orders`),
    s.finishBeforeResults ? h('span', { class: 'enc-chip enc-chip-warn', title: 'The final diagnosis was given in the same step as the first orders' },
      icon('alert', { size: 12 }), 'Diagnosis before results') : null);
  const hist = historyList(wk.conversation, { compact: true, hideExam });
  let prev = null;
  const steps = (wk.timeline || []).map((st) => { const el = stepBlock(st, prev, advisor); if (st.step) prev = st.step; return el; });
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

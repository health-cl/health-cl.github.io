import { h, mount } from '../dom.js';
import { withAbbr } from '../abbreviations.js';

// Reading display v3 (Amendment I): the patient, and each workup as one encounter in time order. Display only; nothing here
// is stored. Case text is shown as the record and the agents produced it; the only transformations are layout and the
// de-identification blank shown as [removed] (cleanCase in case.js).

export const PANEL_ORDER = ['Blood tests', 'Urine tests', 'Microbiology', 'Imaging', 'Procedures', 'Medications'];

const SEX_WORD = { Female: 'Woman', Male: 'Man' };
export function patientLine(p) {
  if (!p) return null;
  const sex = SEX_WORD[p.sex] || 'Sex not recorded';
  const age = !p.age || p.age === 'Not recorded' ? 'age not recorded' : p.age === '90 or older' ? '90 years or older' : `${p.age} years`;
  return `${sex}, ${age}`;
}

function clampText(text, lines = 4, cls = '') {
  const p = h('p', { class: `msg-text clamp clamp-${lines} ${cls}` }, withAbbr(text));
  const btn = h('button', { type: 'button', class: 'linklike more' }, 'Show more');
  btn.onclick = () => { const open = p.classList.toggle('is-open'); btn.textContent = open ? 'Show less' : 'Show more'; };
  const wrap = h('div', { class: 'clamp-wrap' }, p, btn);
  // Offer the toggle only for text long enough to be cut (by length: text inside a closed <details> has no layout to measure).
  const t = String(text || '');
  if (t.length <= lines * 95 && t.split('\n').length <= lines) { btn.hidden = true; p.classList.add('is-open'); }
  return wrap;
}

// ---------------------------------------------------------------- results
function labSummary(rows) {
  const vals = rows.filter((r) => r.test && !r.missing);
  const flagged = vals.filter((r) => r.flag);
  const missing = rows.filter((r) => r.missing);
  return { vals, flagged, missing, raw: rows.filter((r) => r.raw) };
}

function labTable(rows) {
  const { vals, missing, raw } = labSummary(rows);
  return h('div', { class: 'labs' },
    vals.length ? h('table', { class: 'lab-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Test'), h('th', { class: 'num' }, 'Result'), h('th', {}, 'Reference range'))),
      h('tbody', {}, vals.map((r) => h('tr', { class: r.flag ? 'is-flag' : '' },
        h('td', {}, r.test),
        h('td', { class: 'num' }, h('span', { class: 'lab-val' }, r.value), r.unit ? h('span', { class: 'lab-unit' }, ` ${r.unit}`) : null,
          r.flag ? h('span', { class: `lab-flag lab-flag-${r.flag}`, title: r.flag === 'H' ? 'Above the reference range given' : 'Below the reference range given' }, r.flag) : null),
        h('td', { class: 'lab-range num' }, r.range || '')))))
      : null,
    missing.length ? h('p', { class: 'lab-missing' }, h('span', { class: 'lab-missing-label' }, 'No value in the hospital record: '),
      missing.map((r) => r.test).join(', ')) : null,
    raw.length ? h('pre', { class: 'lab-raw' }, raw.map((r) => r.raw).join('\n')) : null);
}

function resultBlock(r) {
  const head = h('h5', { class: 'res-head' }, r.panel || 'Result');
  if (r.error) return h('div', { class: 'res res-error' }, head, h('p', { class: 'muted' }, 'The simulation returned an error for this request; no result came back.'));
  if (r.rows) return h('div', { class: 'res' }, head, labTable(r.rows));
  return h('div', { class: 'res' }, head, clampText(r.text || '', 6, 'report'));
}

function resultsSummary(results) {
  let nVal = 0, nMiss = 0, nRep = 0, nErr = 0;
  const flagged = [];
  for (const r of results) {
    if (r.error) { nErr += 1; continue; }
    if (r.rows) { const s = labSummary(r.rows); nVal += s.vals.length; nMiss += s.missing.length; flagged.push(...s.flagged); } else nRep += 1;
  }
  const parts = [];
  if (nVal) parts.push(`${nVal} laboratory value${nVal === 1 ? '' : 's'}`);
  if (nMiss) parts.push(`${nMiss} not in the record`);
  if (nRep) parts.push(`${nRep} report${nRep === 1 ? '' : 's'}`);
  if (nErr) parts.push(`${nErr} error${nErr === 1 ? '' : 's'}`);
  return { text: parts.join(' · ') || 'nothing returned', flagged };
}

function resultsSection(st) {
  if (st.resultsHidden) return h('p', { class: 'muted small' }, 'Results are not shown for this case.');
  const results = st.results || [];
  if (!results.length) return null;
  const { text, flagged } = resultsSummary(results);
  const seenTag = st.seen
    ? h('span', { class: 'tag-seen', title: 'The agent took another turn after these results came back.' }, 'Seen by the agent')
    : h('span', { class: 'tag-unseen', title: 'The agent gave its final diagnosis in the same step, so it never saw these results.' }, 'Not seen by the agent');
  const det = h('details', { class: 'results' },
    h('summary', {},
      h('span', { class: 'res-title' }, 'Results returned'),
      h('span', { class: 'res-count' }, text), seenTag,
      flagged.length ? h('span', { class: 'res-flags' }, flagged.slice(0, 6).map((r) => h('span', { class: 'flag-chip' },
        `${r.test} ${r.value}${r.unit ? ` ${r.unit}` : ''} `, h('b', {}, r.flag))), flagged.length > 6 ? h('span', { class: 'flag-more' }, `+${flagged.length - 6} more outside range`) : null) : null),
    h('div', { class: 'res-body' }, results.map(resultBlock)));
  return det;
}

// ---------------------------------------------------------------- history (conversation before the first order)
export function agentQuestions(text) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) { out.push(bullet[1]); continue; }
    for (const sent of line.split(/(?<=[.?!])\s+/)) if (sent.trim().endsWith('?')) out.push(sent.trim());
  }
  return out;
}

export function historyList(conv, { compact = true, hideExam = false } = {}) {
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
  const toggle = compact ? h('button', { type: 'button', class: 'linklike conv-toggle' }, 'Show the full conversation') : null;
  if (toggle) toggle.onclick = () => { full = !full; toggle.textContent = full ? "Show only the agent's questions" : 'Show the full conversation'; render(); };
  return { body, toggle };
}

// ---------------------------------------------------------------- one step
function ordersPlaced(orders) {
  const by = {};
  for (const o of orders || []) (by[o.panel] = by[o.panel] || []).push(o.text);
  const panels = PANEL_ORDER.filter((p) => by[p]);
  if (!panels.length) return null;
  return h('dl', { class: 'placed' }, panels.flatMap((p) => [h('dt', {}, p), h('dd', {}, by[p].join(' · '))]));
}

function stepBlock(st, prevStep, advisor) {
  const n = (st.orders || []).length;
  const head = st.step
    ? h('div', { class: 'tl-head' }, h('span', { class: 'tl-dot' }, String(st.step)),
      h('div', {}, h('h4', { class: 'tl-title' }, `Step ${st.step} · ${n} order${n === 1 ? '' : 's'} placed`),
        h('p', { class: 'tl-sub' }, st.step === 1 ? 'Before any result had come back' : `After the results of step ${prevStep || st.step - 1}`)))
    : h('div', { class: 'tl-head' }, h('span', { class: 'tl-dot tl-dot-plain' }, '·'),
      h('div', {}, h('h4', { class: 'tl-title' }, st.finish ? 'Final step' : 'Next turn'), h('p', { class: 'tl-sub' }, 'No new orders')));
  return h('li', { class: `tl-step${st.finish ? ' is-final' : ''}` }, head,
    h('div', { class: 'tl-body' },
      advisor && st.reasoning ? h('details', { class: 'reasoning' }, h('summary', {}, 'Reasoning summary recorded by the model at this step'),
        h('p', { class: 'msg-text' }, st.reasoning)) : null,
      st.textHidden ? h('p', { class: 'muted small' }, "The agent's messages after its first orders are not shown for this case, to keep the reading blind.")
        : st.text ? h('div', { class: 'tl-part' }, h('span', { class: 'tl-label' }, 'Agent wrote'), clampText(st.text, 4)) : null,
      n ? h('div', { class: 'tl-part' }, h('span', { class: 'tl-label' }, 'Ordered'), ordersPlaced(st.orders)) : null,
      (st.other || []).map((o) => (o.kind === 'exam'
        ? h('div', { class: 'tl-part' }, h('span', { class: 'tl-label' }, 'Examination'), clampText(o.text, 4))
        : h('div', { class: 'tl-part' }, h('span', { class: 'tl-label' }, 'Searched'), h('p', { class: 'msg-text muted' }, `The procedure catalogue, for “${o.text}”`)))),
      st.finish ? ((st.results || []).length && !st.seen
        ? h('p', { class: 'tl-finish tl-finish-warn' }, 'The agent submitted its final diagnosis in this step, before any of these results came back.')
        : h('p', { class: 'tl-finish' }, 'The agent submitted its final diagnosis in this step.')) : null,
      resultsSection(st),
      st.reply ? h('div', { class: 'tl-part' }, h('span', { class: 'tl-label' }, 'Patient replied'), clampText(st.reply, 3)) : null));
}

// ---------------------------------------------------------------- one workup as an encounter
export function encounterColumn(w, wk, { hideExam = false, advisor = false } = {}) {
  const s = wk.summary || {};
  const chips = h('div', { class: 'enc-chips' },
    h('span', { class: 'enc-chip' }, `${s.steps || 0} order step${s.steps === 1 ? '' : 's'}`),
    h('span', { class: 'enc-chip' }, `${s.orders || 0} orders`),
    s.finishBeforeResults ? h('span', { class: 'enc-chip enc-chip-warn', title: 'The final diagnosis was submitted in the same step as the first orders.' }, 'Diagnosis before any result') : null);
  const hist = historyList(wk.conversation, { compact: true, hideExam });
  let prev = null;
  const steps = (wk.timeline || []).map((st) => { const el = stepBlock(st, prev, advisor); if (st.step) prev = st.step; return el; });
  return h('div', { class: `col enc col-${w}` },
    h('div', { class: 'col-head' }, h('span', { class: `side side-${w}` }, w), h('span', { class: 'col-name' }, `Workup ${w}`), chips),
    h('section', { class: 'enc-sec' },
      h('div', { class: 'enc-sec-head' }, h('h4', {}, 'History'), hist.toggle),
      advisor && (wk.historyReasoning || []).length ? h('details', { class: 'reasoning' }, h('summary', {}, 'Reasoning summaries recorded during the history'),
        (wk.historyReasoning || []).map((x) => h('p', { class: 'msg-text' }, x.text))) : null,
      advisor && wk.reasoningRecorded === false ? h('p', { class: 'muted small' }, 'The model recorded no reasoning summary for this workup.') : null,
      hist.body),
    h('section', { class: 'enc-sec' },
      h('div', { class: 'enc-sec-head' }, h('h4', {}, 'Orders and results')),
      h('ol', { class: 'timeline' }, steps)),
    h('section', { class: 'enc-sec enc-final' },
      h('h4', {}, 'Final diagnosis'),
      wk.final === null ? h('p', { class: 'muted small' }, 'Not shown for this case, to keep the reading blind.')
        : h('p', { class: 'final-dx' }, withAbbr(wk.final || '—'))));
}

// ---------------------------------------------------------------- order line in the rating grid
export function stepChip(step) {
  return step ? h('span', { class: 'step-chip', title: `Placed in step ${step}` }, `Step ${step}`) : null;
}
export function lineDetail(line) {
  return line.detail ? h('span', { class: 'order-detail' }, withAbbr(line.detail)) : null;
}

import { h, mount, toast, confirmDialog } from '../dom.js';
import { ORDER_SCALES, HARM_LEVELS } from '../schema.js';
import { panelsOf, conversationColumn, sortedLines, cleanCase } from './case.js';

// The adjudicator sees the case and, for each disagreement only, the two ratings labelled
// "Rater 1" and "Rater 2" (never names), and records the final value.

export async function renderAdjQueue(main, { store, state }) {
  const list = await store.getAdjAssignments(state.user.uid);
  const rows = await Promise.all(list.map(async (a) => ({ ...a, adj: await store.getAdjudication(state.user.uid, a.caseId) })));
  const done = rows.filter((r) => r.adj?.submittedAt).length;
  mount(main, h('section', { class: 'page' },
    h('div', { class: 'page-head' },
      h('p', { class: 'eyebrow' }, 'Adjudication'),
      h('h1', {}, `${done} of ${rows.length} cases resolved`),
      h('p', { class: 'lede' }, 'Each case lists only the answers on which the two raters disagreed. Choose the final value for each.')),
    h('div', { class: 'card' },
      rows.length ? h('ol', { class: 'case-list' }, rows.map((r, i) => h('li', { class: 'case-row' },
        h('span', { class: 'case-num' }, `Case ${i + 1}`),
        h('span', { class: r.adj?.submittedAt ? 'pill pill-done' : r.adj ? 'pill pill-draft' : 'pill' }, r.adj?.submittedAt ? 'Resolved' : r.adj ? 'In progress' : 'Not started'),
        h('a', { class: 'btn btn-sm btn-secondary', href: `#/adjudicate/${encodeURIComponent(r.caseId)}` }, r.adj?.submittedAt ? 'View' : 'Open'))))
        : h('p', { class: 'muted' }, 'No cases to adjudicate yet. They appear after both raters have submitted a double-read case.'))));
}

export async function renderAdjCase(main, { store, state, go }, caseId) {
  const uid = state.user.uid;
  const scale = ORDER_SCALES[state.config.formVersion || 'v2'];
  const [rawCase, set, prior] = await Promise.all([store.getCase(caseId), store.getAdjudicationSet(caseId), store.getAdjudication(uid, caseId)]);
  const caseDoc = rawCase ? cleanCase(rawCase) : rawCase;
  if (!caseDoc || !set) { toast('Nothing to adjudicate for this case.', 'error'); return go('adjudicate'); }
  const adj = { items: {}, workups: {}, ...(prior || {}) };
  const locked = !!adj.submittedAt;
  const itemIds = Object.keys(set.items || {});
  const wkIds = Object.keys(set.workups || {});
  const labelOf = (code) => scale.find((s) => s.code === code)?.label || code;
  const harmLabel = (code) => HARM_LEVELS.find((x) => x.code === code)?.label || code;
const errLabel = (code) => ({ yes: 'Yes', no: 'No' }[code] || harmLabel(code));   // G2.0: workups are adjudicated on the important-error question

  const body = h('div');
  const bar = h('div', { class: 'submit-bar' });

  function choice(current, options, onPick, name) {
    return h('div', { class: 'seg', role: 'radiogroup', 'aria-label': name },
      options.map((o) => h('label', { class: `seg-opt${current === o.code ? ' is-on' : ''}` },
        h('input', { type: 'radio', name, checked: current === o.code, disabled: locked, onchange: () => onPick(o.code) }), o.label)));
  }

  function render() {
    const panels = panelsOf(caseDoc);
    mount(body,
      h('div', { class: 'card presentation' }, h('h2', { class: 'card-title' }, 'At arrival'), h('p', {}, caseDoc.presentation)),
      h('details', { class: 'block' }, h('summary', {}, 'Conversation before the first order'),
        h('div', { class: 'two-col conv-cols' }, conversationColumn('A', caseDoc.workups.A.conversation), conversationColumn('B', caseDoc.workups.B.conversation))),
      h('details', { class: 'block', open: true }, h('summary', {}, 'All orders'),
        h('div', { class: 'orders' }, panels.map((panel) => h('div', { class: 'panel-row' },
          h('h4', { class: 'panel-name' }, panel),
          h('div', { class: 'panel-cells' }, ['A', 'B'].map((w) => {
            const p = (caseDoc.workups[w].orders || []).find((x) => x.panel === panel);
            return h('ul', { class: 'cell' }, sortedLines(p?.lines).map((l) => h('li', { class: `order ${l.item ? (set.items?.[l.item] ? 'order-disputed' : 'order-rated-plain') : 'order-shared'}` },
              l.item ? h('span', { class: `only only-${w}` }, `${w} only`) : null, h('span', { class: 'order-text' }, l.text))));
          })))))),
      h('section', { class: 'block' },
        h('h2', { class: 'block-title' }, `Disagreements (${itemIds.length + wkIds.length})`),
        itemIds.map((id) => {
          const it = caseDoc.items[id]; const d = set.items[id];
          return h('div', { class: 'card adj-row' },
            h('div', { class: 'order-line' }, h('span', { class: `only only-${it.side}` }, `${it.side} only`), h('span', { class: 'order-text' }, `${it.panel}: ${it.name}`)),
            h('p', { class: 'adj-votes' }, h('span', {}, 'Rater 1: ', h('b', {}, labelOf(d.r1))), h('span', {}, 'Rater 2: ', h('b', {}, labelOf(d.r2)))),
            choice(adj.items[id], scale.filter((s) => s.code !== '?').map((s) => ({ code: s.code, label: s.label })),
              (code) => { adj.items[id] = code; store.patchAdjudication(uid, caseId, { items: { [id]: code } }); render(); }, `final-${id}`));
        }),
        wkIds.map((w) => {
          const d = set.workups[w];
          return h('div', { class: 'card adj-row' },
            h('div', { class: 'order-line' }, h('span', { class: `side side-${w}` }, w), h('span', { class: 'order-text' }, `Important error in workup ${w}?`)),
            h('p', { class: 'adj-votes' }, h('span', {}, 'Rater 1: ', h('b', {}, errLabel(d.r1))), h('span', {}, 'Rater 2: ', h('b', {}, errLabel(d.r2)))),
            choice(adj.workups[w], [{ code: 'yes', label: 'Yes' }, { code: 'no', label: 'No' }],
              (code) => { adj.workups[w] = code; store.patchAdjudication(uid, caseId, { workups: { [w]: code } }); render(); }, `final-harm-${w}`));
        })));
    const left = itemIds.filter((id) => !adj.items[id]).length + wkIds.filter((w) => !adj.workups[w]).length;
    mount(bar, h('span', { class: 'muted' }, left ? `${left} still to resolve` : 'All resolved'),
      locked ? h('span', { class: 'pill pill-done' }, 'Resolved')
        : h('button', { class: 'btn btn-primary', type: 'button', disabled: left > 0, onclick: async () => {
          if (!(await confirmDialog({ title: 'Submit adjudication?', body: 'Final values are locked after submitting.', confirm: 'Submit' }))) return;
          await store.submitAdjudication(uid, caseId); toast('Adjudication submitted.', 'ok'); go('adjudicate');
        } }, 'Submit adjudication'));
  }
  render();
  mount(main, h('section', { class: 'page case' },
    h('div', { class: 'case-head' }, h('a', { href: '#/adjudicate', class: 'back' }, '← Adjudication'), h('div', { class: 'case-title' }, h('h1', {}, 'Resolve disagreements'))),
    body, bar));
}

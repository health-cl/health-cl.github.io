import { h, mount } from '../dom.js';
import { ORDER_SCALES } from '../schema.js';
import { icon } from '../icons.js';

// Short walkthrough (G1.9; G3.0 rewrites it for the encounter view, Amendment I; 3.1 shortens the wording to one card per
// case tab, no rule changed): shown as a pop-up before the first case and from "How to rate" on every case page.
// Terms: RAND/UCLA appropriateness (necessary, appropriate), low-value care, AHRQ Common Formats harm scale.
const TABS = [['history', 'Encounters'], ['orders', 'Orders'], ['workup', 'Workups'], ['decision', 'Decision']];
const tabStrip = () => h('ol', { class: 'tut-tabs' }, TABS.map(([ic, label], i) => h('li', {},
  h('span', { class: 'tut-tab-num' }, String(i + 1)), icon(ic, { size: 15 }), h('span', {}, label))));

export const TUTORIAL_STEPS = [
  {
    title: 'Two workups of one patient',
    body: () => [
      h('p', {}, 'An AI agent worked up the same emergency patient twice, as A and B. You compare the two.'),
      h('p', {}, 'Both can be poor. Rate them anyway, because the differences still matter.'),
      h('p', {}, 'What the patient said in either conversation counts for both workups.'),
      tabStrip(),
    ],
  },
  {
    title: 'Encounters', icon: 'history',
    body: () => [
      h('p', {}, 'Sex, age and triage vital signs come from the hospital record. On arrival the agents saw only the chief complaint.'),
      h('p', {}, 'Each workup reads top to bottom, from the history through each step of orders and its results to the final diagnosis.'),
      h('p', {}, 'Results the agent never saw are tagged ', h('span', { class: 'stag stag-unseen' }, 'Not seen by agent'), '. Agent reasoning is hidden to keep the reading blind.'),
    ],
  },
  {
    title: 'Orders', icon: 'orders',
    body: (scale) => [
      h('p', {}, h('b', {}, 'Rate each order found in one workup only, on what was known when it was placed.'), ' Do not use its result.'),
      h('dl', { class: 'tut-scale' }, scale.map((s) => [h('dt', {}, h('span', { class: `scale-pill chip-${s.cls}` }, s.label)), h('dd', {}, s.short)])),
      h('p', {}, 'For Necessary, say whether the other workup met the need another way. For Harmful, choose the main reason.'),
      h('p', {}, 'The agent could order procedures and treatments directly. Judge whether that order, at that step, was appropriate.'),
    ],
  },
  {
    title: 'Workups', icon: 'workup',
    body: () => [
      h('p', {}, 'Rate overall quality from 1 to 5. Here you may use the results and the final diagnosis.'),
      h('p', {}, 'An important error is one you would correct before care continues. Mark it even if harm is unlikely.'),
      h('p', {}, 'Then mark where it is, its type, how severe the harm could be and how likely it is.'),
    ],
  },
  {
    title: 'Decision', icon: 'decision',
    body: () => [
      h('p', {}, 'Say whether an important action is missing from both workups, and which workup you would rather this patient received.'),
      h('p', {}, 'Answers save as you go. Keys 1 to 5 rate the selected order. After the cases you read a few notes the agent wrote for itself.'),
      h('p', { class: 'tut-rule' }, icon('alert', { size: 15 }), 'Keep the cases confidential. Do not paste them into online tools or share them with other readers.'),
    ],
  },
];

// Renders the walkthrough into `host`. onDone is called from the last step's button.
export function tutorial(host, { formVersion = 'v2', doneLabel = 'Start', onDone, onClose } = {}) {
  const scale = ORDER_SCALES[formVersion] || ORDER_SCALES.v2;
  let i = 0;
  const render = () => {
    const st = TUTORIAL_STEPS[i];
    const last = i === TUTORIAL_STEPS.length - 1;
    mount(host,
      h('div', { class: 'tut' },
        h('div', { class: 'tut-head' },
          h('span', { class: 'tut-count' }, `${i + 1} of ${TUTORIAL_STEPS.length}`),
          onClose ? h('button', { type: 'button', class: 'linklike tut-close', onclick: onClose }, 'Close') : null),
        h('h2', { class: 'tut-title' }, st.icon ? icon(st.icon, { size: 20 }) : null, st.title),
        h('div', { class: 'tut-body' }, st.body(scale)),
        h('div', { class: 'tut-foot' },
          h('div', { class: 'tut-dots', 'aria-hidden': 'true' }, TUTORIAL_STEPS.map((_, k) => h('span', { class: k === i ? 'on' : '' }))),
          h('div', { class: 'tut-btns' },
            i > 0 ? h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { i -= 1; render(); } }, 'Back') : null,
            h('button', { type: 'button', class: 'btn btn-primary', onclick: (e) => { if (last) { onDone?.(e.currentTarget); } else { i += 1; render(); } } },
              last ? doneLabel : 'Next')))));
    host.querySelector('.tut-btns .btn-primary')?.focus();
  };
  render();
}

// The same walkthrough as a pop-up over the current page.
export function openTutorialDialog(formVersion) {
  const box = h('div');
  const dlg = h('dialog', { class: 'dialog tut-dialog', 'aria-label': 'How to rate' }, box);
  const close = () => dlg.close();
  tutorial(box, { formVersion, doneLabel: 'Close', onDone: close, onClose: close });
  dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 50));
  document.body.appendChild(dlg);
  dlg.showModal();
}

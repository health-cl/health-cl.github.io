import { h, mount } from '../dom.js';
import { ORDER_SCALES, HARM_LEVELS } from '../schema.js';

// Short walkthrough (G1.9; G3.0 rewrites it for the encounter view, Amendment I): shown as a pop-up before the first case and from "How to rate" on every case page.
// Terms: RAND/UCLA appropriateness (necessary, appropriate), low-value care, AHRQ Common Formats harm scale.
function chips(list, cls = '') {
  return h('div', { class: 'tut-chips' }, list.map((x) => h('span', { class: `tut-chip ${cls}` }, x)));
}

export const TUTORIAL_STEPS = [
  {
    title: 'Two workups of one patient',
    body: () => [
      h('p', {}, 'Each case is one simulated emergency department patient that an AI agent worked up twice, A and B. Your task is to compare them.'),
      h('p', {}, 'Both workups can be poor. The differences between them still matter, so please rate them even when neither is good care.'),
      h('p', {}, "At the top you see the patient's sex and age, from the hospital record (the agents were not told them), and the arrival line. In some cases the record has no primary symptom, so the arrival line ends after the colon; the agents received the same line."),
      h('p', {}, 'Judge each workup for this patient, using everything the patient said in either conversation. If the two conversations disagree on a fact that matters, tick the box at the end of the case.'),
    ],
  },
  {
    title: 'Reading an encounter',
    body: () => [
      h('p', {}, h('b', {}, 'History. '), "The conversation before the first order. By default you see the agent's questions and the patient's replies; open the full conversation with one click."),
      h('p', {}, h('b', {}, 'Steps. '), 'Each time the agent placed orders. Many agents placed every order in one step, before any result came back, and some gave their final diagnosis in that same step. The page says so.'),
      h('p', {}, h('b', {}, 'Results. '), 'Exactly what the hospital record returned. “No value in the hospital record” means the hospital did not measure it; it does not say whether the test was needed. “Not seen by the agent” means the result came back after the agent had already given its final diagnosis.'),
      h('p', {}, 'The agents’ private reasoning is not shown, to keep the reading blind. In this simulation the agent could also order procedures and treatments directly; in practice the emergency physician would usually consult the treating service.'),
    ],
  },
  {
    title: 'Rate each order found in one workup only',
    body: (scale) => [
      h('p', {}, h('b', {}, 'Rate each order on what was known when it was placed: '), "the history from either conversation, the examination, and the patient's sex and age. Do not use the results to rate an order."),
      h('dl', { class: 'tut-scale' }, scale.map((s) => [h('dt', {}, h('span', { class: `scale-pill chip-${s.cls}` }, s.label)), h('dd', {}, s.short)])),
      h('p', {}, "For Necessary, say whether the other workup meets the same need another way. For Harmful, choose the main reason. Orders in both workups are marked 'in both · not rated'."),
    ],
  },
  {
    title: 'Rate each workup, and look for important errors',
    body: () => [
      h('p', {}, 'Rate the overall quality of each workup as care for this patient: 1 unsafe or incoherent, 2 important problems a supervisor must correct, 3 reasonable with minor problems, 4 what a competent emergency physician would do, 5 nothing to change. Here you may use everything shown, including the results and the final diagnosis.'),
      h('p', {}, 'An important error is one you would correct before care proceeds: something needed left out, a test or treatment ordered before the result it depends on, an order that could harm this patient, or a decision that belongs to another service. Mark it even if harm is unlikely.'),
      h('p', {}, 'If there is one, mark where it is, its type, how severe the resulting harm could be and how likely it is.'),
      chips(HARM_LEVELS.filter((x) => x.code !== 'none').map((x) => x.label)),
    ],
  },
  {
    title: 'Both workups, then your preference',
    body: () => [
      h('p', {}, 'Say whether an important action is missing from both workups. Then choose the workup you would rather this patient received and the main reason, or No preference, or Cannot compare.'),
      h('p', {}, 'Answers save as you go. You can stop at any point and continue another day. Keys 1 to 5 rate the selected order.'),
      h('p', {}, 'After the cases, you read a few notes the agent wrote for itself.'),
      h('p', { class: 'tut-rule' }, 'Keep the cases confidential: do not paste them into online tools or discuss them with other readers.'),
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
        h('h2', { class: 'tut-title' }, st.title),
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

import { h, mount } from '../dom.js';
import { ORDER_SCALES, HARM_LEVELS } from '../schema.js';

// Short walkthrough (G1.9): shown as a pop-up before the first case and from "How to rate" on every case page.
// Terms: RAND/UCLA appropriateness (necessary, appropriate), low-value care, AHRQ Common Formats harm scale.
function chips(list, cls = '') {
  return h('div', { class: 'tut-chips' }, list.map((x) => h('span', { class: `tut-chip ${cls}` }, x)));
}

export const TUTORIAL_STEPS = [
  {
    title: 'Two workups of one patient',
    body: () => [
      h('p', {}, 'Each case is one simulated emergency department patient that an AI agent worked up twice, A and B.'),
      h('p', {}, 'Judge each workup for this patient, using everything the patient said in either conversation. You are judging care for the patient, not what each agent knew.'),
      h('p', {}, 'If the two conversations disagree on a fact that matters, tick the box at the end of the case.'),
    ],
  },
  {
    title: 'Rate each order found in one workup only',
    body: (scale) => [
      h('p', {}, 'Orders in both workups are not rated. They are folded; open them with Show orders in both workups.'),
      h('dl', { class: 'tut-scale' }, scale.map((s) => [h('dt', {}, h('span', { class: `scale-pill chip-${s.cls}` }, s.label)), h('dd', {}, s.short)])),
      h('p', {}, 'For Necessary, say whether the other workup meets the same need another way. For Harmful, choose the main reason.'),
    ],
  },
  {
    title: 'Rate each workup, and look for important errors',
    body: () => [
      h('p', {}, 'First rate the overall quality of each workup as care for this patient, from 1 Very poor to 5 Excellent.'),
      h('p', {}, 'An important error is one you would correct before care proceeds. For example: something the patient needs is left out (no imaging for suspected appendicitis); a treatment is started before the test it depends on (antibiotics before cultures that are needed); an order could harm this patient (an NSAID in advanced kidney disease).'),
      h('p', {}, 'Mark it even if harm is unlikely: severity and likelihood record how serious it is.'),
      h('p', {}, 'If there is one, mark where it is, how severe the resulting harm could be and how likely it is.'),
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

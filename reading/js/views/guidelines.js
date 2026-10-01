import { h, mount, toast } from '../dom.js';
import { GUIDELINES, CHANGES } from '../guidelines.js';
import { ORDER_SCALES, HARM_LEVELS } from '../schema.js';
import { stepper } from './stepper.js';

const keyOf = (s) => (s.code === '?' ? 'U' : s.code);

// One table: rating, what it means, an example (invented patient).
function orderScale(formVersion) {
  return h('table', { class: 'g-scale' },
    h('tbody', {}, ORDER_SCALES[formVersion].map((s) => h('tr', {},
      h('td', {}, h('span', { class: `scale-pill chip-${s.cls}` }, h('b', {}, keyOf(s)), s.label)),
      h('td', {}, s.short || s.desc),
      h('td', { class: 'g-ex' }, GUIDELINES.examples[keyOf(s)] || '')))));
}

function harmScale() {
  return h('div', { class: 'scale-inline' }, HARM_LEVELS.map((s, i) => h('span', { class: `scale-pill chip-harm-${i}`, title: s.potential }, s.label)));
}

export function renderGuidelines(main, ctx) {
  const { store, state, go, reload } = ctx;
  const formVersion = state.config.formVersion || 'v2';
  const version = state.config.guidelinesVersion || GUIDELINES.version;
  const done = state.guidelines?.quizPassedAt && state.guidelines?.version === version;
  const updated = !done && state.guidelines?.quizPassedAt && state.guidelines?.version !== version;

  // Reading the guidelines and pressing Start is what opens the cases (the database checks that this record exists
  // for the current version; the field keeps its old name, quizPassedAt).
  async function start(btn) {
    btn.disabled = true;
    try {
      await store.saveGuidelinesStatus(state.user.uid, { version, attempts: 0, readAt: true, quizPassedAt: true });
      await reload();
      go('start');
    } catch (e) { btn.disabled = false; toast(`Could not save: ${e.message}`, 'error'); }
  }
  const startBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: (e) => start(e.currentTarget) },
    updated ? 'Continue →' : 'Start →');

  mount(main,
    h('section', { class: 'onboard' },
      done ? null : stepper(2),
      h('article', { class: 'onboard-card prose' },
        h('header', {},
          h('h1', {}, 'Guidelines'),
          updated
            ? h('div', { class: 'notice' }, h('p', {}, h('b', {}, `Updated since version ${state.guidelines.version}. `),
              (CHANGES[version] || []).join(' ')))
            : h('p', { class: 'lede' }, done ? 'Available here while you work.' : 'About 2 minutes.')),
        h('p', {}, GUIDELINES.task),
        h('ol', { class: 'g-list' }, GUIDELINES.steps.map((st, i) => h('li', {},
          h('div', {}, h('h3', {}, st.title), h('p', {}, st.text),
            i === 0 ? orderScale(formVersion) : i === 1 ? harmScale() : null)))),
        h('div', { class: 'sec-label' }, 'Keep in mind'),
        h('ul', { class: 'rules' }, GUIDELINES.rules.map((r) => h('li', {}, r))),
        h('p', { class: 'note-muted' }, GUIDELINES.notes),
        h('div', { class: 'actions-end' }, done ? h('a', { class: 'btn btn-primary', href: '#/' }, 'Back to cases') : startBtn))));
}

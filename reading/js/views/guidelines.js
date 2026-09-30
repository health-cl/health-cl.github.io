import { h, mount, toast } from '../dom.js';
import { GUIDELINES, CHANGES } from '../guidelines.js';
import { ORDER_SCALES, HARM_LEVELS } from '../schema.js';
import { stepper } from './stepper.js';

const keyOf = (s) => (s.code === '?' ? 'U' : s.code);

function orderScale(formVersion) {
  const scale = ORDER_SCALES[formVersion];
  return [
    h('div', { class: 'scale-inline' }, scale.map((s) => h('span', { class: `scale-pill chip-${s.cls}` }, h('b', {}, keyOf(s)), s.label))),
    h('dl', { class: 'scale-defs' }, scale.map((s) => [h('dt', {}, s.label), h('dd', {}, s.short || s.desc)])),
  ];
}

function harmScale() {
  return [
    h('div', { class: 'scale-inline' }, HARM_LEVELS.map((s, i) => h('span', { class: `scale-pill chip-harm-${i}`, title: s.potential }, s.label))),
    h('p', { class: 'note-muted' }, 'Levels follow the AHRQ Common Formats Harm Scale; each level is defined in the case form.'),
  ];
}

export function renderGuidelines(main, ctx) {
  const { store, state, go, reload } = ctx;
  const formVersion = state.config.formVersion || 'v2';
  const version = state.config.guidelinesVersion || GUIDELINES.version;
  const passed = state.guidelines?.quizPassedAt && state.guidelines?.version === version;
  const updated = !passed && state.guidelines?.quizPassedAt && state.guidelines?.version !== version;
  const answers = {};
  const quizBox = h('div', { class: 'quiz', id: 'g-quiz' });
  let checked = false;
  const byCode = Object.fromEntries(ORDER_SCALES[formVersion].map((s) => [keyOf(s), s]));

  function renderQuiz() {
    mount(quizBox,
      h('div', { class: 'sec-label' }, `Quick check · ${GUIDELINES.quiz.length} questions`),
      GUIDELINES.quiz.map((q, qi) => {
        const wrong = checked && answers[q.id] !== q.answer;
        return h('fieldset', { class: `quiz-q${checked ? (wrong ? ' is-wrong' : ' is-right') : ''}` },
          h('legend', {}, `${qi + 1}. ${q.q}`),
          q.options.map((o, oi) => h('label', { class: 'radio' },
            h('input', { type: 'radio', name: q.id, value: String(oi), checked: passed ? oi === q.answer : answers[q.id] === oi, disabled: passed,
              onchange: () => { answers[q.id] = oi; } }),
            h('span', {}, o))),
          checked ? h('p', { class: wrong ? 'field-error' : 'field-ok' }, wrong ? `Not quite. ${q.why}` : q.why) : null);
      }),
      h('div', { class: 'actions-end' }, passed
        ? h('a', { class: 'btn btn-primary', href: '#/' }, 'Back to cases')
        : h('button', { class: 'btn btn-primary', type: 'button', onclick: submitQuiz }, 'Check answers and start →')));
  }

  async function submitQuiz() {
    const unanswered = GUIDELINES.quiz.filter((q) => answers[q.id] === undefined);
    if (unanswered.length) { toast(`Answer all ${GUIDELINES.quiz.length} questions.`, 'error'); return; }
    checked = true;
    const allRight = GUIDELINES.quiz.every((q) => answers[q.id] === q.answer);
    const attempts = (state.guidelines?.version === version ? (state.guidelines?.attempts || 0) : 0) + 1;
    await store.saveGuidelinesStatus(state.user.uid, { version, attempts, readAt: true, ...(allRight ? { quizPassedAt: true } : {}) });
    if (!allRight) { renderQuiz(); quizBox.querySelector('.is-wrong')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    await reload();
    // Approved readers go straight to their first case; others see the waiting page, which opens it on approval.
    go('start');
  }

  renderQuiz();
  mount(main,
    h('section', { class: 'onboard' },
      passed ? null : stepper(2),
      h('article', { class: 'onboard-card prose' },
        h('header', {},
          h('h1', {}, 'Guidelines'),
          updated
            ? h('div', { class: 'notice' },
              h('p', {}, h('b', {}, `Updated since version ${state.guidelines.version}. `), 'Please answer the check again; your submitted cases are not affected.'),
              h('ul', {}, (CHANGES[version] || []).map((c) => h('li', {}, c))))
            : h('p', { class: 'lede' }, passed ? 'Available here while you work.' : 'About 5 minutes, then a 3-question check.')),
        h('div', { class: 'sec-label' }, 'The task'),
        h('p', {}, GUIDELINES.task),
        h('div', { class: 'sec-label' }, 'What you rate'),
        h('ol', { class: 'g-list' }, GUIDELINES.rate.map((r) => h('li', {},
          h('div', {}, h('h3', {}, r.title), h('p', {}, r.text),
            r.scale === 'order' ? orderScale(formVersion) : r.scale === 'harm' ? harmScale() : null)))),
        h('div', { class: 'sec-label' }, 'Examples (invented patients)'),
        h('div', { class: 'examples' }, GUIDELINES.examples.map((e) => {
          const s = byCode[e.code];
          return h('div', { class: 'ex' }, h('p', {}, e.setup),
            h('span', { class: `scale-pill chip-${s?.cls || 'unknown'}` }, h('b', {}, e.code), s?.label || e.label));
        })),
        h('div', { class: 'sec-label' }, 'Keep in mind'),
        h('ul', { class: 'rules' }, GUIDELINES.rules.map((r) => h('li', {}, r))),
        h('div', { class: 'sec-label' }, 'Part 2: note pairs'),
        h('p', {}, GUIDELINES.notes),
        quizBox)));
}

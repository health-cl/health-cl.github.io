import { h, mount, toast } from '../dom.js';
import { GUIDELINES, CHANGES } from '../guidelines.js';
import { ORDER_SCALES, HARM_LEVELS, LIKELIHOOD } from '../schema.js';

export function scaleTable(kind, formVersion = 'v2') {
  if (kind === 'order') {
    return h('div', { class: 'scale-table', role: 'table', 'aria-label': 'Order rating scale' },
      ORDER_SCALES[formVersion].map((s) => h('div', { class: 'scale-row', role: 'row' },
        h('span', { class: `chip chip-${s.cls}`, role: 'cell' }, h('b', {}, s.code === '?' ? 'U' : s.code), ` ${s.label}`),
        h('span', { role: 'cell' }, s.desc))));
  }
  return h('div', { class: 'scale-table', role: 'table', 'aria-label': 'Harm scale' },
    HARM_LEVELS.map((s, i) => h('div', { class: 'scale-row', role: 'row' },
      h('span', { class: `chip chip-harm-${i}`, role: 'cell' }, s.label),
      h('span', { role: 'cell' }, h('span', {}, s.potential), h('span', { class: 'ahrq' }, 'AHRQ: ', h('q', {}, s.ahrq))))),
    h('div', { class: 'scale-row', role: 'row' },
      h('span', { class: 'chip chip-unknown', role: 'cell' }, 'Likelihood'),
      h('span', { role: 'cell' }, LIKELIHOOD.map((l) => l.label).join(' / '))));
}

function block(b, formVersion) {
  if (typeof b === 'string') return h('p', {}, b);
  if (b.list) return h('ul', {}, b.list.map((x) => h('li', {}, x)));
  if (b.h) return h('h3', {}, b.h);
  if (b.scale) return scaleTable(b.scale, formVersion);
  if (b.example) return h('div', { class: 'example' },
    h('p', { class: 'example-setup' }, b.example.setup),
    h('p', { class: 'example-answer' }, h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→ '), b.example.answer));
  return null;
}

export function renderGuidelines(main, ctx) {
  const { store, state, go, reload } = ctx;
  const formVersion = state.config.formVersion || 'v2';
  const version = state.config.guidelinesVersion || GUIDELINES.version;
  const passed = state.guidelines?.quizPassedAt && state.guidelines?.version === version;
  const updated = !passed && state.guidelines?.quizPassedAt && state.guidelines?.version !== version;
  const answers = {};
  const quizBox = h('div', { class: 'quiz' });
  let checked = false;

  // In v1 the scale has no "Harmful"; drop H from the keyboard hint.
  const sections = GUIDELINES.sections.map((s) => ({
    ...s,
    body: formVersion === 'v1' ? s.body.map((b) => (b.list ? { list: b.list.map((x) => x.replace('N, E, X, H or U', 'N, E, X or U')) } : b)) : s.body,
  }));

  function renderQuiz() {
    mount(quizBox,
      h('h2', {}, 'Check your understanding'),
      h('p', { class: 'why' }, `${GUIDELINES.quiz.length} questions. Answer all correctly to open the cases; you can retry.`),
      GUIDELINES.quiz.map((q, qi) => {
        const wrong = checked && answers[q.id] !== q.answer;
        return h('fieldset', { class: `quiz-q${checked ? (wrong ? ' is-wrong' : ' is-right') : ''}` },
          h('legend', {}, `${qi + 1}. ${q.q}`),
          q.options.map((o, oi) => h('label', { class: 'radio' },
            h('input', { type: 'radio', name: q.id, value: String(oi), checked: answers[q.id] === oi, disabled: passed,
              onchange: () => { answers[q.id] = oi; } }),
            h('span', {}, o))),
          checked ? h('p', { class: wrong ? 'field-error' : 'field-ok' }, wrong ? `Not quite. ${q.why}` : q.why) : null);
      }),
      passed
        ? h('p', { class: 'field-ok' }, 'You have completed these guidelines.')
        : h('div', { class: 'form-actions' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: submitQuiz }, 'Check answers')));
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
    toast('Guidelines complete. Your cases are ready.', 'ok');
    go('');
  }

  renderQuiz();
  mount(main,
    h('section', { class: 'page' },
      h('div', { class: 'page-head' },
        h('p', { class: 'eyebrow' }, passed ? `Guidelines ${version}` : updated ? 'Guidelines updated' : 'Step 2 of 3'),
        h('h1', {}, 'How to read a case'),
        updated
          ? h('div', { class: 'notice' },
            h('p', {}, h('b', {}, `The guidelines changed since you read version ${state.guidelines.version}. `), 'Please read the changes below and answer the check again. Your submitted cases are not affected.'),
            h('ul', {}, (CHANGES[version] || ['See the sections below.']).map((c) => h('li', {}, c))))
          : h('p', { class: 'lede' }, 'Please read this once in full. It stays available from the menu while you work.')),
      h('div', { class: 'with-rail' },
        h('aside', { class: 'rail-wrap', 'aria-label': 'Contents' },
          h('ol', { class: 'rail' }, sections.map((s, i) => h('li', {},
            h('a', { href: `#g-${s.id}`, onclick: (e) => { e.preventDefault(); document.getElementById(`g-${s.id}`)?.scrollIntoView({ behavior: 'smooth' }); } },
              h('span', { class: 'rail-num' }, String(i + 1)), s.title))),
          h('li', {}, h('a', { href: '#g-quiz', onclick: (e) => { e.preventDefault(); quizBox.scrollIntoView({ behavior: 'smooth' }); } },
            h('span', { class: 'rail-num' }, String(sections.length + 1)), 'Check your understanding')))),
        h('div', { class: 'prose' },
          sections.map((s) => h('article', { class: 'card section', id: `g-${s.id}` },
            h('h2', {}, s.title), s.body.map((b) => block(b, formVersion)))),
          h('article', { class: 'card section', id: 'g-quiz' }, quizBox)))));
}

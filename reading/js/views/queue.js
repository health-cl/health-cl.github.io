import { h, mount, toast } from '../dom.js';
import { isNoteId } from './note.js';

export async function renderQueue(main, ctx) {
  const { store, state, go } = ctx;
  mount(main, h('section', { class: 'page' }, h('p', { class: 'muted' }, 'Loading your cases…')));

  if (!state.verification?.verified) {
    mount(main, h('section', { class: 'page narrow' },
      h('p', { class: 'eyebrow' }, 'Step 3 of 3'),
      h('h1', {}, 'Waiting for approval'),
      h('p', { class: 'lede' }, 'Your profile and guidelines are complete. Your cases appear here as soon as the study team approves you.'),
      h('div', { class: 'card kv' },
        h('div', {}, h('span', {}, 'Signed in as'), h('b', {}, state.user.email)),
        h('div', {}, h('span', {}, 'Status'), h('b', {}, 'Waiting for the study team'))),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-secondary', type: 'button', onclick: async () => { await ctx.reload(); go(''); } }, 'Check again'),
        h('a', { class: 'btn btn-ghost', href: '#/guidelines' }, 'Review guidelines'))));
    return;
  }

  const [assignments, progress] = await Promise.all([store.getAssignments(state.user.uid), store.getProgress(state.user.uid)]);
  const practice = assignments.filter((a) => a.practice);
  const study = assignments.filter((a) => !a.practice && !isNoteId(a.caseId));
  const notes = assignments.filter((a) => isNoteId(a.caseId));
  const stateOf = (a) => progress[a.caseId]?.state || 'new';
  const practiceDone = practice.every((a) => stateOf(a) === 'submitted');
  const submitted = study.filter((a) => stateOf(a) === 'submitted').length;
  const nextOf = (list) => list.find((a) => stateOf(a) !== 'submitted');
  const studyDone = study.every((a) => stateOf(a) === 'submitted');
  const next = !practiceDone ? nextOf(practice) : !studyDone ? nextOf(study) : nextOf(notes);
  const minutes = state.config.minutesPerCase || 12;
  const notesDone = notes.filter((a) => stateOf(a) === 'submitted').length;
  const remaining = study.length - submitted;
  const remainingMin = remaining * minutes + (notes.length - notesDone) * 5;

  function rows(list, locked, offset = 0) {
    let reachedOpen = false;
    return h('ol', { class: 'case-list' }, list.map((a, i) => {
      const st = stateOf(a);
      // Cases open in order: everything submitted, plus the first one not yet submitted.
      const open = !locked && (st === 'submitted' || !reachedOpen);
      if (st !== 'submitted' && !locked) reachedOpen = true;
      const label = a.practice ? `Practice ${i + 1}` : isNoteId(a.caseId) ? `Note pair ${i + 1}` : `Case ${offset + i + 1}`;
      const pill = { new: ['Not started', 'pill'], draft: ['In progress', 'pill pill-draft'], submitted: ['Submitted', 'pill pill-done'] }[st];
      return h('li', { class: `case-row${open ? '' : ' is-locked'}${next && a.caseId === next.caseId ? ' is-next' : ''}` },
        h('span', { class: 'case-num' }, label),
        h('span', { class: pill[1] }, pill[0]),
        open
          ? h('a', { class: 'btn btn-sm ' + (st === 'submitted' ? 'btn-ghost' : 'btn-secondary'), href: `#/${isNoteId(a.caseId) ? 'note' : 'case'}/${encodeURIComponent(a.caseId)}` },
            st === 'submitted' ? 'View' : st === 'draft' ? 'Continue' : 'Open')
          : h('span', { class: 'muted small' }, locked ? (isNoteId(a.caseId) ? 'After all cases' : 'After practice') : 'In order'));
    }));
  }

  const allDone = practiceDone && studyDone && notes.every((a) => stateOf(a) === 'submitted') && assignments.length > 0;
  const debrief = allDone ? await store.getDebrief(state.user.uid) : null;
  function debriefCard() {
    if (!allDone) return null;
    if (debrief?.submittedAt) return h('div', { class: 'card' }, h('h2', { class: 'card-title' }, 'Thank you'), h('p', {}, 'Your session is complete. The study team will be in touch.'));
    const guess = h('textarea', { rows: 3, maxlength: 1000, placeholder: 'One or two sentences.' });
    const conf = h('select', {}, h('option', { value: '' }, 'Select…'), [1, 2, 3, 4, 5].map((n) => h('option', { value: String(n) }, `${n}${n === 1 ? ' (not confident)' : n === 5 ? ' (very confident)' : ''}`)));
    const burden = h('select', {}, h('option', { value: '' }, 'Select…'), ['too long', 'about right', 'could do more'].map((b) => h('option', { value: b }, b)));
    const comments = h('textarea', { rows: 2, maxlength: 2000, placeholder: 'Optional.' });
    return h('div', { class: 'card stack-sm' },
      h('h2', { class: 'card-title' }, 'Last step: three quick questions (1 minute)'),
      h('label', {}, 'What do you think this study is testing?', guess),
      h('label', {}, 'How confident are you in your ratings overall?', conf),
      h('label', {}, 'The length of the session was:', burden),
      h('label', {}, 'Anything else we should know?', comments),
      h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => {
        if (!conf.value || !burden.value) { toast('Please answer the confidence and length questions.', 'error'); return; }
        await store.submitDebrief(state.user.uid, { guess: guess.value.trim(), confidence: Number(conf.value), burden: burden.value, comments: comments.value.trim() });
        toast('Thank you. Your session is complete.', 'ok'); renderQueue(main, ctx);
      } }, 'Finish')));
  }
  mount(main,
    h('section', { class: 'page' },
      h('div', { class: 'page-head split' },
        h('div', {},
          h('p', { class: 'eyebrow' }, 'Your cases'),
          h('h1', {}, practiceDone ? `${submitted} of ${study.length} submitted` : 'Start with the practice cases'),
          h('p', { class: 'lede' }, practiceDone
            ? (remainingMin ? `About ${remainingMin < 90 ? `${remainingMin} minutes` : `${Math.round(remainingMin / 6) / 10} hours`} left. Work in order; you can stop at any time and your answers are kept.` : 'Everything is submitted. Thank you.')
            : 'Practice cases use the same form. They are not analysed; they let you get used to the layout before the study cases open.')),
        next ? h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => go(`${isNoteId(next.caseId) ? 'note' : 'case'}/${encodeURIComponent(next.caseId)}`) },
          stateOf(next) === 'draft' ? 'Continue where you left off' : !practiceDone ? 'Start practice' : isNoteId(next.caseId) ? 'Open next note pair' : 'Open next case') : null),
      study.length ? h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(study.length), 'aria-valuenow': String(submitted) },
        h('span', { style: { width: `${study.length ? (100 * submitted) / study.length : 0}%` } })) : null,
      practice.length ? h('div', { class: 'card' }, h('h2', { class: 'card-title' }, 'Practice'), rows(practice, false)) : null,
      h('div', { class: 'card' }, h('h2', { class: 'card-title' }, 'Study cases'),
        study.length ? rows(study, !practiceDone) : h('p', { class: 'muted' }, 'No study cases are assigned yet.')),
      notes.length ? h('div', { class: 'card' }, h('h2', { class: 'card-title' }, `Part 2: procedure notes · ${notesDone} of ${notes.length}`), rows(notes, !(practiceDone && studyDone))) : null,
      debriefCard()));
}

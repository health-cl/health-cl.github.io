import { h, mount, toast } from '../dom.js';
import { isNoteId } from './note.js';
import { stepper } from './stepper.js';

// Open the reader's next unsubmitted item (practice first, then cases, then note pairs), or the list when none is left.
export async function openNext(ctx) {
  const { store, state, go } = ctx;
  if (!state.verification?.verified) return go('');
  const [assignments, progress] = await Promise.all([store.getAssignments(state.user.uid), store.getProgress(state.user.uid)]);
  // Practice first, then the shared cases (Amendment L), then the rest in order; an advisor copy never opens by itself.
  const open = (a) => (progress[a.caseId]?.state || 'new') !== 'submitted';
  const next = assignments.find((a) => a.practice && open(a)) || assignments.find((a) => a.shared && open(a))
    || assignments.find((a) => !a.practice && !a.shared && !a.free && open(a));
  return go(next ? `${isNoteId(next.caseId) ? 'note' : 'case'}/${encodeURIComponent(next.caseId)}` : '');
}

// An advisor slot (Amendment I): every case other than practice and shared cases opens at any time.
const advisorSlotOf = (study) => study.length > 0 && study.every((a) => a.free);

export async function renderQueue(main, ctx) {
  const { store, state, go } = ctx;
  mount(main, h('section', { class: 'page' }, h('p', { class: 'muted' }, 'Loading your cases…')));

  if (!state.verification?.verified) {
    const status = h('div', { class: 'wait-state', role: 'status' }, h('span', { class: 'pulse', 'aria-hidden': 'true' }),
      h('span', {}, 'Waiting for the study team to approve your account.'));
    mount(main, h('section', { class: 'onboard' },
      stepper(3),
      h('div', { class: 'onboard-card' },
        h('header', {},
          h('h1', {}, 'You are all set'),
          h('p', { class: 'lede' }, 'Your profile is done. The study team approves each account, usually the same day. Your first case opens here as soon as you are approved. You can also close this page and come back later.')),
        status,
        h('div', { class: 'kv' }, h('div', {}, h('span', {}, 'Signed in as'), h('b', {}, state.user.email))),
        h('div', { class: 'actions-end' }, h('a', { class: 'btn btn-ghost', href: '#/guidelines' }, 'Review guidelines')))));
    if (store.watchAccess) {
      const stop = store.watchAccess(state.user.uid, async (acc) => {
        if (!acc) return;
        stop?.();
        await ctx.reload();
        toast('You are approved. Opening your first case.', 'ok');
        openNext(ctx);
      });
      ctx.setCleanup(() => stop?.());
    }
    return;
  }

  const [assignments, progress] = await Promise.all([store.getAssignments(state.user.uid), store.getProgress(state.user.uid)]);
  const practice = assignments.filter((a) => a.practice);
  const shared = assignments.filter((a) => a.shared);                       // Amendment L: read by every expert slot
  const study = assignments.filter((a) => !a.practice && !a.shared && !isNoteId(a.caseId));
  const notes = assignments.filter((a) => isNoteId(a.caseId));
  const stateOf = (a) => progress[a.caseId]?.state || 'new';
  const practiceDone = practice.every((a) => stateOf(a) === 'submitted');
  const submitted = study.filter((a) => stateOf(a) === 'submitted').length;
  const nextOf = (list) => list.find((a) => stateOf(a) !== 'submitted');
  const studyDone = study.every((a) => stateOf(a) === 'submitted');
  const sharedDone = shared.every((a) => stateOf(a) === 'submitted');
  const sharedSubmitted = shared.filter((a) => stateOf(a) === 'submitted').length;
  // An advisor copy of a shared case stays closed until that shared case is submitted.
  const sharedPending = new Set(shared.filter((a) => stateOf(a) !== 'submitted').map((a) => a.caseId));
  const xLocked = (a) => a.free && sharedPending.has(a.caseId.replace(/X$/, ''));
  const next = !practiceDone ? nextOf(practice) : !sharedDone ? nextOf(shared) : !studyDone ? (study.find((a) => stateOf(a) !== 'submitted' && !xLocked(a)) || null) : nextOf(notes);
  const minutes = state.config.minutesPerCase || 12;
  const notesDone = notes.filter((a) => stateOf(a) === 'submitted').length;
  const remaining = study.length - submitted;
  const remainingMin = (advisorSlotOf(study) ? 0 : remaining * minutes) + (shared.length - sharedSubmitted) * minutes + (notes.length - notesDone) * 5;

  function rows(list, locked, offset = 0) {
    let reachedOpen = false;
    return h('ol', { class: 'case-list' }, list.map((a, i) => {
      const st = stateOf(a);
      // Cases open in order: everything submitted, plus the first one not yet submitted.
      // Advisor slot (Amendment I): every case opens at any time.
      const open = (a.free && !xLocked(a)) || (!a.free && !locked && (st === 'submitted' || !reachedOpen));
      if (st !== 'submitted' && !locked && !a.free) reachedOpen = true;
      const label = a.practice ? `Practice ${i + 1}` : isNoteId(a.caseId) ? `Notes ${i + 1}`
        : a.free ? `Case ${offset + i + 1} · ${a.caseId.replace(/X$/, '')}` : `Case ${offset + i + 1}`;
      const pill = { new: ['Not started', 'pill'], draft: ['In progress', 'pill pill-draft'], submitted: ['Submitted', 'pill pill-done'] }[st];
      return h('li', { class: `case-row${open ? '' : ' is-locked'}${next && a.caseId === next.caseId ? ' is-next' : ''}` },
        h('span', { class: 'case-num' }, label),
        h('span', { class: pill[1] }, pill[0]),
        open
          ? h('a', { class: 'btn btn-sm ' + (st === 'submitted' ? 'btn-ghost' : 'btn-secondary'), href: `#/${isNoteId(a.caseId) ? 'note' : 'case'}/${encodeURIComponent(a.caseId)}` },
            st === 'submitted' ? 'View' : st === 'draft' ? 'Continue' : 'Open')
          : h('span', { class: 'muted small' }, xLocked(a) ? 'After the shared case' : locked ? (isNoteId(a.caseId) ? 'After the cases' : 'After practice') : 'In order'));
    }));
  }

  const advisorSlot = advisorSlotOf(study);
  const allDone = !advisorSlot && practiceDone && sharedDone && studyDone && notes.every((a) => stateOf(a) === 'submitted') && assignments.length > 0;
  // The bar follows the heading: the shared cases while any is open, then the slot's own cases.
  const [pDone, pTotal] = shared.length && !sharedDone ? [sharedSubmitted, shared.length] : [submitted, study.length];
  const debrief = allDone ? await store.getDebrief(state.user.uid) : null;
  const debriefOpen = allDone && !debrief?.submittedAt;
  function debriefCard() {
    if (!allDone) return null;
    if (debrief?.submittedAt) return h('div', { class: 'card' }, h('h2', { class: 'card-title' }, 'Thank you'), h('p', {}, 'Your session is complete. The study team will be in touch.'));
    const guess = h('textarea', { rows: 3, maxlength: 1000, placeholder: 'One or two sentences.' });
    const conf = h('select', {}, h('option', { value: '' }, 'Select…'), [1, 2, 3, 4, 5].map((n) => h('option', { value: String(n) }, `${n}${n === 1 ? ' (not confident)' : n === 5 ? ' (very confident)' : ''}`)));
    const burden = h('select', {}, h('option', { value: '' }, 'Select…'), ['too long', 'about right', 'could do more'].map((b) => h('option', { value: b }, b)));
    const comments = h('textarea', { rows: 2, maxlength: 2000, placeholder: 'Optional.' });
    return h('div', { class: 'card stack-sm' },
      h('h2', { class: 'card-title' }, 'Three quick questions (1 minute)'),
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
          h('h1', {}, debriefOpen ? 'One last step' : !practiceDone ? 'Practice first'
            : shared.length && !sharedDone ? `${sharedSubmitted} of ${shared.length} shared cases submitted` : `${submitted} of ${study.length} cases submitted`),
          advisorSlot ? h('p', { class: 'lede' }, shared.length && !sharedDone
            ? 'Please read the shared cases first, in order. After them every other case is open in any order; those answers are optional and are not part of the analysis.'
            : 'Every case is open. Read them in any order. Answers are optional and are not part of the analysis.') : null,
          advisorSlot ? null : h('p', { class: 'lede' }, debriefOpen ? 'Everything is submitted. Please answer the short questions below to finish.' : practiceDone
            ? (remainingMin ? `About ${remainingMin < 90 ? `${remainingMin} minutes` : `${Math.round(remainingMin / 6) / 10} hours`} left. You can stop at any point. Answers are saved.` : 'Everything is submitted. Thank you.')
            : 'Practice answers are not analysed.')),
        next ? h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => go(`${isNoteId(next.caseId) ? 'note' : 'case'}/${encodeURIComponent(next.caseId)}`) },
          stateOf(next) === 'draft' ? 'Continue where you left off' : !practiceDone ? 'Start practice' : next.shared ? 'Open next shared case' : isNoteId(next.caseId) ? 'Open next note pair' : 'Open next case') : null),
      pTotal ? h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(pTotal), 'aria-valuenow': String(pDone) },
        h('span', { style: { width: `${(100 * pDone) / pTotal}%` } })) : null,
      debriefCard(),
      practice.length ? h('div', { class: 'card' }, h('h2', { class: 'card-title' }, 'Practice'), rows(practice, false)) : null,
      shared.length ? h('div', { class: 'card card-shared' }, h('h2', { class: 'card-title' }, `Shared cases · ${sharedSubmitted} of ${shared.length}`),
        h('p', { class: 'fine' }, 'Every physician advising the study reads these same cases, so that their answers can be compared. Please read them in order. Every question needs an answer, as for the study readers.'),
        rows(shared, !practiceDone)) : null,
      // Advisor slot: the cases of the advisor's earlier session first, under their own heading (Amendment I).
      advisorSlot && study.some((a) => a.earlier) ? [
        h('div', { class: 'card' }, h('h2', { class: 'card-title' }, `Cases from your earlier session · ${study.filter((a) => a.earlier).length}`),
          rows(study.filter((a) => a.earlier), false)),
        h('div', { class: 'card' }, h('h2', { class: 'card-title' }, `All other cases · ${study.filter((a) => !a.earlier).length}`),
          rows(study.filter((a) => !a.earlier), false, study.filter((a) => a.earlier).length))]
        : !study.length && shared.length ? null : h('div', { class: 'card' }, h('h2', { class: 'card-title' }, 'Cases'),
          study.length ? rows(study, !practiceDone) : h('p', { class: 'muted' }, 'No study cases are assigned yet.')),
      notes.length ? h('div', { class: 'card' }, h('h2', { class: 'card-title' }, `Agent notes · ${notesDone} of ${notes.length}`), rows(notes, !(practiceDone && studyDone))) : null));
}

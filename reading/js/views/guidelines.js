import { h, mount, toast } from '../dom.js';
import { GUIDELINES } from '../guidelines.js';
import { tutorial } from './tutorial.js';

// G1.9: the guidelines are the short walkthrough. Finishing it records the guidelines version (the database checks
// that this record exists for the current version before any case opens; the field keeps its old name, quizPassedAt).
export function renderGuidelines(main, ctx) {
  const { store, state, go, reload } = ctx;
  const formVersion = state.config.formVersion || 'v2';
  const version = state.config.guidelinesVersion || GUIDELINES.version;
  const done = state.guidelines?.quizPassedAt && state.guidelines?.version === version;

  async function start(btn) {
    btn.disabled = true;
    try {
      await store.saveGuidelinesStatus(state.user.uid, { version, attempts: 0, readAt: true, quizPassedAt: true });
      await reload();
      go('start');
    } catch (e) { btn.disabled = false; toast(`Could not save: ${e.message}`, 'error'); }
  }
  const host = h('div', { class: 'onboard-card tut-card' });
  mount(main, h('section', { class: 'onboard tut-page' }, host));
  tutorial(host, { formVersion, doneLabel: done ? 'Back to cases' : 'Start', onDone: (btn) => (done ? go('') : start(btn)) });
}

import { h, mount, toast } from '../dom.js';

export function renderSignIn(main, { store }) {
  mount(main,
    h('section', { class: 'page narrow signin' },
      h('p', { class: 'eyebrow' }, 'Clinician reading study'),
      h('h1', {}, 'Sign in to read cases'),
      h('p', { class: 'lede' }, 'You will judge the initial emergency department orders an AI agent placed for simulated patients, as the emergency physician would when those orders are placed.'),
      h('ol', { class: 'steps' },
        h('li', {}, h('b', {}, 'Profile'), h('span', {}, 'about 3 minutes')),
        h('li', {}, h('b', {}, 'Guidelines and a 3-question check'), h('span', {}, 'about 10 minutes')),
        h('li', {}, h('b', {}, 'Approval by the study team'), h('span', {}, 'usually the same day')),
        h('li', {}, h('b', {}, 'Your session: 1 practice case, 14 cases, 3 note pairs'), h('span', {}, 'about 2 hours; stop and resume any time'))),
      h('div', { class: 'card signin-card' },
        h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'button', onclick: async () => {
          try { await store.signInWithGoogle(); } catch (err) {
            if (err?.code !== 'auth/popup-closed-by-user') toast(`Sign-in failed: ${err.message}`, 'error');
          }
        } }, 'Sign in with Google')),
      h('p', { class: 'fine' }, 'Only readers approved by the study team can open cases.'),
    ));
}

import { h, mount, toast } from '../dom.js';

export function renderSignIn(main, { store }) {
  const google = async () => {
    try { await store.signInWithGoogle(); } catch (err) {
      if (err?.code !== 'auth/cancelled-popup-request' && err?.code !== 'auth/popup-closed-by-user') {
        toast(`Sign-in failed (${err?.code || err?.message}).`, 'error');
      }
    }
  };
  mount(main,
    h('section', { class: 'onboard' },
      h('div', { class: 'onboard-card signin-card' },
        h('header', {},
          h('h1', {}, 'Health-CL'),
          h('p', { class: 'lede' }, 'A research study in which physicians rate the tests and treatments that AI agents ordered for simulated emergency department patients.')),
        h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: google }, 'Sign in with Google'))));
}

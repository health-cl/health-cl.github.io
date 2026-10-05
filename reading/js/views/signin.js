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
          h('p', { class: 'lede' }, 'Physicians review the orders AI agents placed for simulated emergency patients.')),
        emailLinkForm(store),
        h('button', { class: 'linklike study-team-link', type: 'button', onclick: google }, 'Study team: sign in with Google'))));
}

// Sign-in by an emailed link: works for any email address, with no Google window (2026-10-05).
function emailLinkForm(store) {
  const input = h('input', { type: 'email', required: true, autocomplete: 'email', placeholder: 'Your email',
    'aria-label': 'Email address' });
  const status = h('p', { class: 'note-muted', role: 'status' });
  const btn = h('button', { class: 'btn btn-secondary', type: 'submit' }, 'Send sign-in link');
  const form = h('form', { class: 'email-link', onsubmit: async (e) => {
    e.preventDefault();
    const email = input.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Enter a valid email address.', 'error'); return; }
    btn.disabled = true;
    try {
      await store.sendEmailLink(email);
      status.textContent = `A sign-in link was sent to ${email}. Open it in this browser to continue. If it is not in your inbox within a few minutes, check the spam folder.`;
    } catch (err) {
      toast(`Could not send the link (${err?.code || err?.message}).`, 'error');
    } finally { btn.disabled = false; }
  } },
  h('div', { class: 'email-row' }, input, btn), status);
  return form;
}

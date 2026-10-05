import { h, mount, toast } from '../dom.js';
import { stepper } from './stepper.js';

const SVG = 'http://www.w3.org/2000/svg';
// Google "G" mark for the sign-in button (built with the SVG namespace; no HTML strings).
function googleMark() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  for (const [fill, d] of [
    ['#EA4335', 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'],
    ['#4285F4', 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'],
    ['#FBBC05', 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'],
    ['#34A853', 'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z'],
  ]) {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('fill', fill);
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

export function renderSignIn(main, { store }) {
  mount(main,
    h('section', { class: 'onboard' },
      stepper(0),
      h('div', { class: 'onboard-card signin-card' },
        h('header', {},
          h('h1', {}, 'Health-CL'),
          h('p', { class: 'lede' }, 'Physicians review the initial emergency department orders that AI agents placed for simulated patients.')),
        h('ul', { class: 'meta-list' },
          h('li', {}, 'About 2 hours'),
          h('li', {}, 'Stop and resume any time'),
          h('li', {}, 'Answers save automatically')),
        emailLinkForm(store),
        h('div', { class: 'or-line' }, h('span', {}, 'or')),
        h('button', { class: 'btn btn-google btn-lg', type: 'button', onclick: async () => {
          try { await store.signInWithGoogle(); } catch (err) {
            const msg = {
              'auth/popup-closed-by-user': 'The Google window closed before sign-in finished. Try again.',
              'auth/cancelled-popup-request': null,
              'auth/popup-blocked': 'The browser blocked the Google window. Allow pop-ups for this site, then try again.',
              'auth/network-request-failed': 'No connection to Google. Check the network, then try again.',
              'auth/unauthorized-domain': 'This address is not allowed to sign in. Contact the study team.',
            }[err?.code];
            if (msg !== null) toast(msg || `Sign-in failed (${err?.code || err?.message}).`, 'error');
          }
        } }, googleMark(), 'Sign in with Google'),
        h('p', { class: 'note-muted' }, 'By invitation. The study team approves each account.'))));
}

// Sign-in by an emailed link: works for any email address, with no Google window (2026-10-05).
function emailLinkForm(store) {
  const input = h('input', { type: 'email', required: true, autocomplete: 'email', placeholder: 'you@hospital.org',
    'aria-label': 'Email address' });
  const status = h('p', { class: 'note-muted', role: 'status' });
  const btn = h('button', { class: 'btn btn-secondary', type: 'submit' }, 'Email me a sign-in link');
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
  h('label', { class: 'email-label' }, 'Sign in with your email address'),
  h('div', { class: 'email-row' }, input, btn), status);
  return form;
}

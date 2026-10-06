import { h } from '../dom.js';

// The four stages a new reader goes through; shown above the sign-in, profile, guidelines and waiting pages.
export const STEPS = ['Sign in', 'Profile', 'How to rate', 'Cases'];

export function stepper(current) {
  return h('nav', { class: 'stepper', 'aria-label': 'Progress' },
    h('ol', {}, STEPS.map((s, i) => h('li', {
      class: i < current ? 'done' : i === current ? 'current' : '',
      'aria-current': i === current ? 'step' : null,
      title: s,
    }))),
    h('p', {}, `Step ${current + 1} of ${STEPS.length}: ${STEPS[current]}`));
}

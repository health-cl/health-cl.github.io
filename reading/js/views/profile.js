import { h, mount, toast } from '../dom.js';
import { PROFILE_SECTIONS, visibleFields, validateField, validateProfile } from '../schema.js';
import { stepper } from './stepper.js';

// One card, two columns. The form is built once; each field updates its own error text and conditional
// fields are shown or hidden in place, so typing and tabbing are never interrupted. A draft is saved on every change.
export function renderProfile(main, ctx) {
  const { store, state, go, reload } = ctx;
  const values = { ...(state.profile || {}) };
  // Profiles saved before the form was shortened had separate name fields; start from those or the Google name.
  if (!values.fullName) values.fullName = [values.givenName, values.familyName].filter(Boolean).join(' ') || state.user.name || '';
  const touched = new Set();
  const fieldEls = {};
  let saveTimer = null;
  const firstTime = !state.profile?.completedAt || !state.profile?.fullName;
  const status = h('span', { class: 'save-state', role: 'status' });

  function draftSave() {
    clearTimeout(saveTimer);
    status.textContent = 'Saving…';
    saveTimer = setTimeout(async () => {
      try { await store.saveProfile(state.user.uid, { ...values, email: state.user.email }); status.textContent = 'Draft saved'; }
      catch (e) { status.textContent = `Not saved: ${e.message}`; }
    }, 500);
  }

  function showError(id) {
    const fe = fieldEls[id];
    if (!fe) return;
    const err = touched.has(id) && !fe.wrap.hidden ? validateField(fe.f, values[id]) : null;
    fe.wrap.classList.toggle('has-error', !!err);
    fe.err.textContent = err || '';
    fe.err.hidden = !err;
    fe.control?.setAttribute('aria-invalid', err ? 'true' : 'false');
  }

  function refreshDerived() {
    for (const s of PROFILE_SECTIONS) {
      const vis = new Set(visibleFields(s, values).map((f) => f.id));
      for (const f of s.fields) if (fieldEls[f.id]) fieldEls[f.id].wrap.hidden = !vis.has(f.id);
    }
  }

  function set(id, v, { validate = false } = {}) {
    values[id] = v;
    if (validate) touched.add(id);
    draftSave();
    refreshDerived();
    if (touched.has(id)) showError(id);
  }

  function field(f) {
    const id = `f-${f.id}`;
    const errEl = h('p', { class: 'field-error', id: `${id}-err`, hidden: true });
    const describedBy = [f.hint ? `${id}-hint` : null, `${id}-err`].filter(Boolean).join(' ');
    const common = { id, name: f.id, 'aria-describedby': describedBy, 'aria-required': f.required ? 'true' : null };
    let control, wrap;
    if (f.type === 'check') {
      control = h('input', { ...common, type: 'checkbox', checked: values[f.id] === true, onchange: (e) => set(f.id, e.target.checked, { validate: true }) });
      wrap = h('div', { class: 'field field-check', dataset: { field: f.id } }, h('label', { class: 'check' }, control, h('span', {}, f.label)), errEl);
    } else {
      if (f.type === 'select') {
        control = h('select', { ...common, onchange: (e) => set(f.id, e.target.value, { validate: true }) },
          h('option', { value: '' }, 'Select…'),
          f.options.map((o) => h('option', { value: o, selected: values[f.id] === o }, o)));
      } else {
        const num = f.type === 'number';
        const parse = (v) => (num ? (v === '' ? '' : Number(v)) : v);
        control = h('input', {
          ...common, type: num ? 'number' : 'text', inputmode: num ? 'numeric' : null, min: f.min, max: f.max,
          placeholder: f.placeholder, autocomplete: f.autocomplete || 'off', value: values[f.id] ?? '',
          oninput: (e) => set(f.id, parse(e.target.value)),
          onblur: (e) => set(f.id, parse(num ? e.target.value : e.target.value.trim()), { validate: true }),
        });
      }
      wrap = h('div', { class: 'field', dataset: { field: f.id } },
        h('label', { for: id }, f.label, f.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, '*') : h('span', { class: 'optional' }, ' (optional)')),
        control,
        f.hint ? h('p', { class: 'field-hint', id: `${id}-hint` }, f.hint) : null,
        errEl);
    }
    fieldEls[f.id] = { wrap, err: errEl, f, control };
    return wrap;
  }

  const email = h('div', { class: 'field' },
    h('label', { for: 'f-email' }, 'Email'),
    h('input', { id: 'f-email', type: 'text', value: state.user.email || '', readonly: true, tabindex: '-1' }));

  const [about, conf] = PROFILE_SECTIONS;
  const form = h('form', { class: 'onboard-card', novalidate: true, onsubmit: onSubmit },
    h('header', {},
      h('h1', {}, 'Your profile'),
      h('p', { class: 'lede' }, 'About 2 minutes. The paper reports readers only as counts (specialty, position, years, country); ratings are anonymous.')),
    h('div', { class: 'sec-label' }, about.title),
    h('div', { class: 'fields' }, about.fields[0] ? field(about.fields[0]) : null, email, about.fields.slice(1).map(field)),
    h('div', { class: 'sec-label' }, conf.title),
    h('div', { class: 'fields' }, conf.fields.map(field)),
    h('div', { class: 'actions-end' },
      status,
      h('button', { class: 'btn btn-primary', type: 'submit' }, firstTime ? 'Next: guidelines →' : 'Save')));

  async function onSubmit(e) {
    e.preventDefault();
    PROFILE_SECTIONS.forEach((s) => s.fields.forEach((f) => { touched.add(f.id); showError(f.id); }));
    const ids = Object.keys(validateProfile(values));
    if (ids.length) {
      const first = fieldEls[ids[0]]?.wrap;
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      first?.querySelector('input,select,textarea')?.focus({ preventScroll: true });
      toast(`${ids.length} field${ids.length > 1 ? 's need' : ' needs'} attention.`, 'error');
      return;
    }
    clearTimeout(saveTimer);
    try {
      await store.saveProfile(state.user.uid, { ...values, email: state.user.email, completedAt: values.completedAt || Date.now() });
      await reload();
      toast('Profile saved.', 'ok');
      go(firstTime ? 'guidelines' : '');
    } catch (err) { toast(`Could not save: ${err.message}`, 'error'); }
  }

  refreshDerived();
  mount(main, h('section', { class: 'onboard' }, firstTime ? stepper(1) : null, form));
}

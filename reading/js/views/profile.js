import { h, mount, toast } from '../dom.js';
import { PROFILE_SECTIONS, visibleFields, validateField, validateProfile, sectionComplete } from '../schema.js';

// One page, sections in order, a progress rail on the left. The form is built once; each field
// updates its own error text and conditional fields are shown or hidden in place, so typing and
// tabbing are never interrupted. A draft is saved on every change.
export function renderProfile(main, ctx) {
  const { store, state, go, reload } = ctx;
  const values = { ...(state.profile || {}) };
  const touched = new Set();
  const fieldEls = {};   // id -> { wrap, err, f }
  const railItems = {};  // section id -> li
  let saveTimer = null;
  const firstTime = !state.profile?.completedAt;
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
      const li = railItems[s.id];
      const done = sectionComplete(s, values);
      li.classList.toggle('done', done);
      li.querySelector('.rail-num').textContent = done ? '✓' : String(PROFILE_SECTIONS.indexOf(s) + 1);
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
      } else if (f.type === 'textarea') {
        control = h('textarea', { ...common, rows: 3, oninput: (e) => set(f.id, e.target.value), onblur: (e) => set(f.id, e.target.value.trim(), { validate: true }) }, values[f.id] || '');
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
        h('label', { for: id }, f.label, f.required ? null : h('span', { class: 'optional' }, ' (optional)'),
          f.pub ? h('span', { class: 'tag tag-pub', title: 'May appear in the paper with your consent' }, 'publication') : null),
        control,
        f.hint ? h('p', { class: 'field-hint', id: `${id}-hint` }, f.hint) : null,
        errEl);
    }
    fieldEls[f.id] = { wrap, err: errEl, f, control };
    return wrap;
  }

  const rail = h('ol', { class: 'rail' }, PROFILE_SECTIONS.map((s, i) => {
    const li = h('li', {}, h('a', { href: `#sec-${s.id}`, onclick: (e) => { e.preventDefault(); document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
      h('span', { class: 'rail-num' }, String(i + 1)), s.title));
    railItems[s.id] = li;
    return li;
  }));

  const form = h('form', { class: 'profile-form', novalidate: true, onsubmit: onSubmit },
    PROFILE_SECTIONS.map((s) => h('fieldset', { class: 'card section', id: `sec-${s.id}` },
      h('legend', {}, s.title),
      h('p', { class: 'why' }, s.why),
      h('div', { class: 'fields' }, s.fields.map(field)))),
    h('div', { class: 'form-actions' },
      status,
      h('button', { class: 'btn btn-primary', type: 'submit' }, firstTime ? 'Save and continue to guidelines' : 'Save profile')));

  async function onSubmit(e) {
    e.preventDefault();
    PROFILE_SECTIONS.forEach((s) => s.fields.forEach((f) => { touched.add(f.id); showError(f.id); }));
    const errors = validateProfile(values);
    // Cross-field errors (signature must match the name) are not caught by single-field checks.
    for (const [id, msg] of Object.entries(errors)) {
      const fe = fieldEls[id];
      if (fe && !fe.err.textContent) { fe.err.textContent = msg; fe.err.hidden = false; fe.wrap.classList.add('has-error'); }
    }
    const ids = Object.keys(errors);
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
  mount(main,
    h('section', { class: 'page' },
      h('div', { class: 'page-head' },
        h('p', { class: 'eyebrow' }, firstTime ? 'Step 1 of 3' : 'Your profile'),
        h('h1', {}, 'About you'),
        h('p', { class: 'lede' }, 'We report who read the cases, credit you as you choose, and confirm your data access. Fields marked "publication" may appear in the paper with your consent; the rest are reported only as counts.')),
      h('div', { class: 'with-rail' }, h('aside', { class: 'rail-wrap', 'aria-label': 'Sections' }, rail), form)));
}

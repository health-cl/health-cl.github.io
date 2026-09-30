import { h, mount, toast, confirmDialog } from '../dom.js';

// Study-team page: approve readers and follow progress.
// Approving as a slot (R1, R2, ...) copies that slot's prepared case list to the reader.
export async function renderAdmin(main, ctx) {
  const { store, go } = ctx;
  mount(main, h('section', { class: 'page' }, h('p', { class: 'muted' }, 'Loading…')));
  const { rows, slots, slotHolders } = await store.adminOverview();
  const holderOf = (slot) => slotHolders[slot];
  const slotName = (s) => (/^session\d+$/.test(s) ? `Session ${s.slice(7)}` : `Slot ${s}`);
  const name = (p) => (p ? `${p.givenName || ''} ${p.familyName || ''}`.trim() || '—' : '—');
  const attested = (p) => !!p && p.agreeDataUse === true && p.consentAggregate === true;

  async function approve(r, choice) {
    const [role, slot] = choice === 'ADJ' ? ['adjudicator', null] : ['rater', choice];
    const ok = await confirmDialog({
      title: `Approve ${name(r.profile)}`,
      body: h('p', {}, `${r.email} `, role === 'rater' ? `receives ${slotName(slot)} and can start at once.` : 'can adjudicate once disagreement sets are built.'),
      confirm: 'Approve',
    });
    if (!ok) return;
    try { await store.adminApprove(r.uid, role, slot); toast('Approved.', 'ok'); } catch (e) { toast(e.message, 'error'); }
    renderAdmin(main, ctx);
  }

  async function revoke(r) {
    const ok = await confirmDialog({ title: `Withdraw access for ${name(r.profile)}?`, body: 'Cases stop opening for them at once. Their submitted answers are kept.', confirm: 'Withdraw', danger: true });
    if (!ok) return;
    await store.adminRevoke(r.uid);
    toast('Access withdrawn.', 'ok');
    renderAdmin(main, ctx);
  }

  function accessCell(r) {
    if (r.access) {
      return h('div', { class: 'stack-xs' },
        h('span', { class: 'pill pill-done' }, r.access.role === 'adjudicator' ? 'Adjudicator' : slotName(r.access.slot || '')),
        h('button', { class: 'linklike', type: 'button', onclick: () => revoke(r) }, 'Withdraw'));
    }
    if (!r.profile?.completedAt || !attested(r.profile)) return h('span', { class: 'muted small' }, 'Profile not finished');
    const free = slots.filter((s) => !holderOf(s));
    const sel = h('select', { class: 'select-sm', 'aria-label': 'Approve as' },
      free.map((s) => h('option', { value: s }, slotName(s))),
      h('option', { value: 'ADJ' }, 'Adjudicator'));
    return h('div', { class: 'row-tight' }, sel,
      h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => approve(r, sel.value) }, 'Approve'));
  }

  const pending = rows.filter((r) => !r.access);
  const approved = rows.filter((r) => r.access);
  const table = (list, empty) => h('div', { class: 'card table-wrap' },
    h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['Reader', 'Background', 'Guidelines', 'Access', 'Study cases', 'Reports'].map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', {}, list.length ? list.map((r) => h('tr', {},
        h('td', {}, h('div', {}, name(r.profile)), h('div', { class: 'muted small' }, r.email || r.uid)),
        h('td', {}, r.profile ? [r.profile.specialty, r.profile.stage, r.profile.institution].filter(Boolean).join(' · ') : '—'),
        h('td', {}, r.guidelines?.quizPassedAt ? h('span', { class: 'pill pill-done' }, r.guidelines.version) : h('span', { class: 'pill' }, r.guidelines ? `${r.guidelines.attempts || 0} tries` : 'Not started')),
        h('td', {}, accessCell(r)),
        h('td', { class: 'num' }, r.access ? `${r.submitted} / ${r.assigned}` : '—'),
        h('td', { class: 'num' }, String(r.problems || 0))))
        : h('tr', {}, h('td', { colspan: '6', class: 'muted' }, empty)))));

  mount(main, h('section', { class: 'page' },
    h('div', { class: 'page-head' },
      h('p', { class: 'eyebrow' }, 'Study team'),
      h('h1', {}, 'Readers'),
      h('p', { class: 'lede' }, `${pending.length} waiting for approval · ${approved.length} approved · free slots: ${slots.filter((s) => !holderOf(s)).join(', ') || 'none'}`)),
    h('h2', { class: 'block-title' }, 'Waiting for approval'),
    table(pending, 'No one is waiting.'),
    h('h2', { class: 'block-title' }, 'Approved'),
    table(approved, 'No one approved yet.'),
    h('div', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Preview a case'),
      h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); const v = e.target.elements.cid.value.trim(); if (v) go(`case/${encodeURIComponent(v)}`); } },
        h('input', { name: 'cid', placeholder: 'Case id', 'aria-label': 'Case id' }),
        h('button', { class: 'btn btn-secondary', type: 'submit' }, 'Open preview')))));
}

import { h, mount, toast, confirmDialog } from '../dom.js';

// Study-team page: approve people who signed in, and see who is reading. Approving gives the reader a slot's case list.
export async function renderAdmin(main, ctx) {
  const { store } = ctx;
  mount(main, h('section', { class: 'page' }, h('p', { class: 'muted' }, 'Loading…')));
  const { rows, slots, slotHolders } = await store.adminOverview();
  // Free case lists, study sessions first (session01, 02, ... in order, session00 last), then pilot lists; test slots are
  // not offered. The first one is preselected, so a study reader gets the next session unless another list is chosen.
  const rank = (s) => {
    const m = s.match(/^session(\d+)$/);
    if (m) return [0, Number(m[1]) === 0 ? 1e6 : Number(m[1])];
    const p = s.match(/^PILOT(\d+)$/);
    return p ? [1, Number(p[1])] : [2, 0];
  };
  const freeSlots = slots.filter((s) => !slotHolders[s] && !/^(TEST|RT)/.test(s))
    .sort((a, b) => rank(a)[0] - rank(b)[0] || rank(a)[1] - rank(b)[1] || a.localeCompare(b));
  const slotName = (s) => (/^session\d+$/.test(s) ? `Session ${s.slice(7)}` : /^PILOT\d+$/.test(s) ? `Pilot ${s.slice(5)}` : s);
  const nSessions = freeSlots.filter((s) => rank(s)[0] === 0).length;
  const nPilot = freeSlots.filter((s) => rank(s)[0] === 1).length;
  const nOther = freeSlots.length - nSessions - nPilot;
  const freeNote = h('p', { class: freeSlots.length <= 3 ? 'notice' : 'muted small' },
    `Free case lists: ${freeSlots.length} (${nSessions} study session${nSessions === 1 ? '' : 's'}, ${nPilot} pilot`
    + `${nOther ? `, ${nOther} other` : ''}).`
    + (freeSlots.length <= 3 ? ' Running low: ask the study team to add more before the next approvals.' : ''));
  const name = (p) => (p?.fullName || '').trim() || '(no name yet)';
  const reload = () => renderAdmin(main, ctx);

  async function approve(r, slot) {
    try { await store.adminApprove(r.uid, 'rater', slot); toast(`Approved ${r.email}.`, 'ok'); } catch (e) { toast(e.message, 'error'); }
    reload();
  }
  async function revoke(r) {
    if (!(await confirmDialog({ title: `Remove access for ${r.email}?`, body: 'Their submitted answers are kept.', confirm: 'Remove', danger: true }))) return;
    await store.adminRevoke(r.uid); toast('Access removed.', 'ok'); reload();
  }
  const who = (r) => h('td', {}, h('div', {}, name(r.profile)), h('div', { class: 'muted small' },
    [r.email, r.profile?.specialty, r.profile?.stage].filter(Boolean).join(' · ')));

  const pending = rows.filter((r) => !r.access);
  const approved = rows.filter((r) => r.access && r.access.role !== 'adjudicator');
  const waiting = h('div', { class: 'card table-wrap' }, h('table', { class: 'table' }, h('tbody', {},
    pending.length ? pending.map((r) => {
      const sel = h('select', { class: 'select-sm', 'aria-label': 'Case list' }, freeSlots.map((s) => h('option', { value: s }, slotName(s))));
      if (!freeSlots.length) {
        return h('tr', {}, who(r), h('td', { class: 'muted small' }, 'No free case list. Ask the study team to add one, then approve.'));
      }
      return h('tr', {}, who(r), h('td', { class: 'row-tight' }, sel,
        h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => approve(r, sel.value) }, 'Approve')));
    }) : h('tr', {}, h('td', { class: 'muted' }, 'No one is waiting.')))));
  const readers = h('div', { class: 'card table-wrap' }, h('table', { class: 'table' }, h('tbody', {},
    approved.length ? approved.map((r) => h('tr', {}, who(r),
      h('td', {}, `${slotName(r.access.slot || '')} · ${r.submitted} of ${r.assigned} done`),
      h('td', {}, h('button', { class: 'linklike', type: 'button', onclick: () => revoke(r) }, 'Remove'))))
      : h('tr', {}, h('td', { class: 'muted' }, 'No one approved yet.')))));

  mount(main, h('section', { class: 'page' },
    h('h1', {}, 'Readers'),
    h('h2', { class: 'block-title' }, `Waiting for approval (${pending.length})`), freeNote, waiting,
    h('h2', { class: 'block-title' }, `Approved (${approved.length})`), readers));
}

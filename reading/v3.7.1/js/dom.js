// Minimal DOM helpers. Case text is always inserted as text nodes, never as HTML.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    // Inline style attributes are blocked by the site's CSP; set styles through the CSSOM instead.
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function mount(el, ...children) { clear(el); append(el, children); return el; }

export function toast(message, kind = 'info') {
  const host = document.getElementById('toasts');
  if (!host) return;
  const t = h('div', { class: `toast toast-${kind}`, role: 'status' }, message);
  host.appendChild(t);
  setTimeout(() => t.classList.add('toast-out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

export function confirmDialog({ title, body, confirm = 'Confirm', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dialog', 'aria-labelledby': 'dlg-title' },
      h('h2', { id: 'dlg-title' }, title),
      h('div', { class: 'dialog-body' }, body),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { dlg.close(); resolve(false); } }, cancel),
        h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', onclick: () => { dlg.close(); resolve(true); } }, confirm)));
    dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 50));
    dlg.addEventListener('cancel', () => resolve(false));
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}

export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
}

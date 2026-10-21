// Display of case text (3.1.1). Agent messages are written in markdown; the examination is one run of "LABEL: finding".
// Both are rendered from the text with DOM nodes only (never innerHTML), and nothing is added or dropped except markdown
// markup and horizontal rules.
import { h } from './dom.js';
import { withAbbr } from './abbreviations.js';

const arr = (x) => (Array.isArray(x) ? x : x == null || x === '' ? [] : [x]);

// Inline markdown: **bold**, *italic*, `code` (shown as plain text). "__" is not bold: "___" is a de-identification blank.
const INLINE = /\*\*(?=\S)([^\n]+?)(?<=\S)\*\*|`([^`\n]+)`|(?<![*\w])\*(?=[^*\s])([^*\n]+?)(?<=\S)\*(?![*\w])/g;
export function inline(text) {
  const s = String(text ?? '');
  const out = [];
  let last = 0;
  // A "**" left without its partner (a sentence cut out of a bold run) is dropped, never shown.
  const plain = (x) => arr(withAbbr(x.replace(/\*\*/g, '')));
  for (const m of s.matchAll(INLINE)) {
    if (m.index > last) out.push(...plain(s.slice(last, m.index)));
    if (m[1] !== undefined) out.push(h('strong', {}, inline(m[1])));
    else if (m[2] !== undefined) out.push(...arr(withAbbr(m[2])));
    else out.push(h('em', {}, ...arr(withAbbr(m[3]))));
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(...plain(s.slice(last)));
  return out;
}

// Block markdown: headings, bullet and numbered lists (one level of nesting), paragraphs; rules are dropped.
export function md(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  const out = [];
  let para = [];
  let list = null;                      // { kind: 'ul' | 'ol', el, last }
  const flushPara = () => {
    if (!para.length) return;
    const kids = [];
    para.forEach((l, i) => { if (i) kids.push(h('br')); kids.push(...inline(l)); });
    out.push(h('p', { class: 'md-p' }, kids));
    para = [];
  };
  const flushList = () => { if (list) { out.push(list.el); list = null; } };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); flushList(); continue; }
    let m = line.match(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/);
    if (m) { flushPara(); flushList(); out.push(h('p', { class: 'md-h' }, inline(m[1]))); continue; }
    const b = line.match(/^(\s*)[-*•+]\s+(.*)$/);
    const n = b ? null : line.match(/^(\s*)(\d{1,3})[.)]\s+(.*)$/);
    if (b || n) {
      flushPara();
      const indent = (b || n)[1].length;
      const content = b ? b[2] : n[3];
      if (indent >= 2 && list && list.last) {                   // a sub-item of the previous item
        let sub = list.last.querySelector(':scope > ul');
        if (!sub) { sub = h('ul', { class: 'md-list md-sub' }); list.last.appendChild(sub); }
        sub.appendChild(h('li', {}, inline(content)));
        continue;
      }
      const kind = b ? 'ul' : 'ol';
      if (!list || list.kind !== kind) {
        flushList();
        list = { kind, el: h(kind, { class: 'md-list', ...(n && n[2] !== '1' ? { start: n[2] } : {}) }), last: null };
      }
      list.last = h('li', {}, inline(content));
      list.el.appendChild(list.last);
      continue;
    }
    if (list && list.last && /^\s{2,}\S/.test(line)) {           // continuation of a list item
      list.last.append(h('br'), ...inline(line.trim()));
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara(); flushList();
  return out;
}

// ---------------------------------------------------------------- physical examination
// Section labels as the record writes them, and the name shown. Vital-sign labels inside a section (T, HR, BP, RR, O2) stay
// in the text.
const EXAM_LABELS = {
  'vital signs': 'Vital signs', vitals: 'Vital signs', vital: 'Vital signs', vs: 'Vital signs',
  general: 'General', gen: 'General', constitutional: 'General', cons: 'General', appearance: 'General',
  heent: 'HEENT', ent: 'ENT', eyes: 'Eyes', head: 'Head', neck: 'Neck', lymph: 'Lymph nodes', nodes: 'Lymph nodes',
  cv: 'Cardiovascular', cvs: 'Cardiovascular', cardiovascular: 'Cardiovascular', cardiovasc: 'Cardiovascular', cardiac: 'Cardiovascular',
  cor: 'Cardiovascular', heart: 'Cardiovascular', cards: 'Cardiovascular',
  chest: 'Chest', lungs: 'Respiratory', lung: 'Respiratory', pulm: 'Respiratory', pulmonary: 'Respiratory', resp: 'Respiratory',
  res: 'Respiratory', respiratory: 'Respiratory',
  abdomen: 'Abdomen', abd: 'Abdomen', abdominal: 'Abdomen', gi: 'Abdomen',
  gu: 'Genitourinary', 'gu/flank': 'Genitourinary, flank', back: 'Back', 'extr/back': 'Extremities, back', rectal: 'Rectal',
  pelvic: 'Pelvic', breast: 'Breast',
  ext: 'Extremities', extr: 'Extremities', extremities: 'Extremities', extremity: 'Extremities',
  msk: 'Musculoskeletal', musculoskeletal: 'Musculoskeletal',
  skin: 'Skin', derm: 'Skin', integument: 'Skin',
  neuro: 'Neurologic', neurologic: 'Neurologic', neurological: 'Neurologic', 'neuro/psych': 'Neurologic, psychiatric',
  psych: 'Psychiatric', psychiatric: 'Psychiatric', 'mental status': 'Mental status', other: 'Other',
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const LABEL_RE = new RegExp(`(?<![A-Za-z0-9/])(_{3,}|\\[removed\\]|${Object.keys(EXAM_LABELS).sort((a, b) => b.length - a.length).map(esc).join('|')})(?:\\s*:|\\s+-\\s+)`, 'gi');
const PREAMBLE = /^\s*(physical exam(ination)?|on admission|admission( physical)?( exam(ination)?)?|exam(ination)?)?\s*:?\s*$/i;

// [{ label, name, text }] or null when the text has fewer than two sections.
export function examSections(text) {
  const s = String(text ?? '');
  const hits = [...s.matchAll(LABEL_RE)];
  if (hits.length < 2) return null;
  const rows = [];
  const pre = s.slice(0, hits[0].index);
  if (!PREAMBLE.test(pre.replace(/[:\s]+$/, ''))) rows.push({ label: '', name: '', text: pre.trim() });
  hits.forEach((m, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].index : s.length;
    const body = s.slice(m.index + m[0].length, end).replace(/^[\s:]+|[\s,;]+$/g, '');
    const key = m[1].toLowerCase();
    rows.push({ label: m[1], name: /^(_+|\[removed\])$/.test(key) ? null : EXAM_LABELS[key], text: body });
  });
  return rows.filter((r) => r.text || r.label);
}

export function examView(text) {
  const rows = examSections(text);
  if (!rows) {
    // An examination written as prose: one section per line where the record separates them with two spaces, otherwise one
    // sentence per line; words unchanged.
    const t = String(text ?? '').trim();
    const byGap = t.split(/\s{2,}/).filter(Boolean);
    const sents = byGap.length >= 3 ? byGap : t.split(/(?<=[.;])\s+(?=[A-Z(])/).filter(Boolean);
    return sents.length >= 3 ? h('ul', { class: 'exam-lines' }, sents.map((x) => h('li', {}, inline(x)))) : h('div', { class: 'md' }, md(text));
  }
  return h('dl', { class: 'exam-grid' }, rows.flatMap((r) => [
    h('dt', {}, r.name === null ? withAbbr('___') : r.name || ''),
    h('dd', {}, inline(r.text)),
  ]));
}

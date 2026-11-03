// Small stroke icons and patient silhouettes, drawn as inline SVG (the site's CSP allows no external assets).
const NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  blood: ['M12 3.5c-3 4.2-6 7.6-6 11a6 6 0 0 0 12 0c0-3.4-3-6.8-6-11z'],
  urine: ['M9 3h6', 'M10 3v6.2L5.3 17.4A2.4 2.4 0 0 0 7.4 21h9.2a2.4 2.4 0 0 0 2.1-3.6L14 9.2V3', 'M7.5 15h9'],
  micro: ['M7 21h10', 'M12 21v-3', 'M8.5 18a5.5 5.5 0 0 0 8-6.5', 'M9.6 3.2l3.5 2-3.5 6-3.5-2z', 'M11 9l1.7 1'],
  imaging: ['M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8', 'M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8', 'M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16', 'M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16', 'M9 12h6', 'M12 9v6'],
  procedure: ['M4 20l6.5-6.5', 'M13.5 4.5l6 6-6.8 6.8H9.3V13.9z'],
  medication: ['M10.6 3.9a5 5 0 0 1 7.1 7.1l-6.7 6.7a5 5 0 0 1-7.1-7.1z', 'M7.3 7.3l7.1 7.1'],
  history: ['M4.5 5h15v10.5H9l-4.5 4z'],
  orders: ['M9 3.5h6v3H9z', 'M8 5H5.5v15.5h13V5H16', 'M8.5 11h7', 'M8.5 15h5'],
  results: ['M9 3h6', 'M10 3v6.5L5 18.6A1.6 1.6 0 0 0 6.4 21h11.2a1.6 1.6 0 0 0 1.4-2.4L14 9.5V3'],
  diagnosis: ['M5 4v5a4 4 0 0 0 8 0V4', 'M9 13v2.5a4.5 4.5 0 0 0 9 0V13', 'M18 13a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z'],
  workup: ['M5 4.5h14v15H5z', 'M8.5 9h7', 'M8.5 12.5h7', 'M8.5 16h4'],
  decision: ['M5 12.5l4.5 4.5L19 7.5'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5.5', 'M12 7.6v.4'],
  alert: ['M12 4L2.8 19.5h18.4z', 'M12 10v4.5', 'M12 17v.4'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3.5 2'],
  chevron: ['M9 6l6 6-6 6'],
  signout: ['M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14', 'M9.5 8l-4 4 4 4', 'M5.5 12H15'],
  agent: ['M12 3.5v2.5', 'M7.5 6h9A2.5 2.5 0 0 1 19 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 15.5v-7A2.5 2.5 0 0 1 7.5 6z', 'M9.5 11.2v.6', 'M14.5 11.2v.6', 'M9.5 14.8h5', 'M3 11v3', 'M21 11v3'],
  patient: ['M12 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5z', 'M4.5 20.5c.7-3.9 3.7-6.3 7.5-6.3s6.8 2.4 7.5 6.3'],
  exam: ['M6 3.5v5a4 4 0 0 0 8 0v-5', 'M10 12.5v2a4.5 4.5 0 0 0 9 0v-1.5', 'M19 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
};

export function icon(name, { size = 16, cls = '' } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon icon-${name} ${cls}`.trim());
  for (const d of PATHS[name] || []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

export const PANEL_ICON = { 'Blood tests': 'blood', 'Urine tests': 'urine', Microbiology: 'micro', Imaging: 'imaging', Procedures: 'procedure', Medications: 'medication' };

// Patient icon for the chart header: one neutral person, with a small badge for the recorded sex (female, male) and none
// when it is not recorded.
export function avatar(sex, { size = 44 } = {}) {
  const k = sex === 'Female' ? 'f' : sex === 'Male' ? 'm' : 'u';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', `avatar avatar-${k}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', k === 'f' ? 'Woman' : k === 'm' ? 'Man' : 'Sex not recorded');
  const add = (parent, tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const [a, v] of Object.entries(attrs)) el.setAttribute(a, v);
    parent.appendChild(el);
    return el;
  };
  add(svg, 'circle', { cx: '22', cy: '22', r: '21', class: 'av-bg' });
  // Material Design "person" glyph (Apache 2.0), scaled into the circle
  add(svg, 'path', { class: 'av-fg', transform: 'translate(6 6) scale(1.333)', d: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' });
  if (k !== 'u') {
    add(svg, 'circle', { cx: '37', cy: '37', r: '10', class: `av-badge av-badge-${k}` });
    const g = add(svg, 'g', { class: 'av-sym', fill: 'none', 'stroke-width': '2', 'stroke-linecap': 'round' });
    if (k === 'f') {
      add(g, 'circle', { cx: '37', cy: '34.5', r: '3.6' });
      add(g, 'path', { d: 'M37 38.1v5.4M34.6 41.2h4.8' });
    } else {
      add(g, 'circle', { cx: '35.6', cy: '38.4', r: '3.6' });
      add(g, 'path', { d: 'M38.2 35.8l3.6-3.6M38.6 32.2h3.2v3.2' });
    }
  }
  return svg;
}

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

// Patient silhouette, as the photo placeholder of a hospital chart: female, male or unknown.
export function avatar(sex, { size = 56 } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 56 56');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', `avatar avatar-${sex === 'Female' ? 'f' : sex === 'Male' ? 'm' : 'u'}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', sex === 'Female' ? 'Woman' : sex === 'Male' ? 'Man' : 'Sex not recorded');
  const add = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.appendChild(el);
    return el;
  };
  add('circle', { cx: '28', cy: '28', r: '28', class: 'av-bg' });
  const clip = add('clipPath', { id: `avc-${Math.random().toString(36).slice(2, 8)}` });
  const cc = document.createElementNS(NS, 'circle');
  cc.setAttribute('cx', '28'); cc.setAttribute('cy', '28'); cc.setAttribute('r', '28');
  clip.appendChild(cc);
  const g = add('g', { 'clip-path': `url(#${clip.getAttribute('id')})`, class: 'av-fg' });
  const part = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    g.appendChild(el);
  };
  if (sex === 'Female') {
    part('path', { d: 'M16.5 30c-1.5-10 3.5-17.5 11.5-17.5S41 20 39.5 30c-.6 4 .8 7.5 2.5 9.5H14c1.7-2 3.1-5.5 2.5-9.5z', class: 'av-hair' });
    part('ellipse', { cx: '28', cy: '24.5', rx: '7.6', ry: '8.6' });
    part('path', { d: 'M9 58c0-11 8.5-17.5 19-17.5S47 47 47 58z' });
  } else if (sex === 'Male') {
    part('path', { d: 'M20 21.5c0-6 3.6-9.3 8-9.3s8 3.3 8 9.3c-1.5-2.4-4.4-3.4-8-3.4s-6.5 1-8 3.4z', class: 'av-hair' });
    part('ellipse', { cx: '28', cy: '24', rx: '8', ry: '9' });
    part('path', { d: 'M7 58c0-12 9-18.5 21-18.5S49 46 49 58z' });
  } else {
    part('circle', { cx: '28', cy: '23.5', r: '8.5' });
    part('path', { d: 'M8 58c0-11.5 9-18 20-18s20 6.5 20 18z' });
  }
  return svg;
}

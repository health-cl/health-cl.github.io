// Scales, profile fields and validation. One place, so the form, the guidelines and the
// export script all use the same codes. Codes are what is stored; labels are what raters see.

export const APP_VERSION = '1.4.0';
export const GUIDELINES_VERSION = 'G1.10-draft';

// Per-order rating. v2 = protocol draft section 3 (adds H). v1 = the declared packet form.
export const ORDER_SCALES = {
  v2: [
    // Labels (G1.9) use standard terms: necessary and appropriate (RAND/UCLA appropriateness method), low value
    // (low-value care), harmful, unable to assess. Stored codes are unchanged.
    { code: 'N', short: 'This patient needs it now; leaving it out is a loss.', key: '1', label: 'Necessary', cls: 'appropriate',
      desc: 'Necessary: this patient needs it now. Leaving it out, as the other workup does, is a loss.' },
    { code: 'E', short: 'Reasonable to order or to leave out.', key: '2', label: 'Appropriate', cls: 'appropriate',
      desc: 'Appropriate but not necessary: reasonable to order or to leave out.' },
    { code: 'X', short: 'Little or no benefit for this patient; any harm is trivial.', key: '3', label: 'Low value', cls: 'not-indicated',
      desc: 'Low value: little or no benefit for this patient, and any harm is trivial (for example, one more blood test).' },
    { code: 'H', short: 'Expected harm outweighs benefit, or contraindicated.', key: '4', label: 'Harmful', cls: 'harmful',
      desc: 'Harmful: expected harm (radiation, contrast, adverse drug effects, further unneeded care) outweighs any benefit, or something shown contraindicates it.' },
    { code: '?', short: 'Depends on information not shown, such as the dose.', key: '5', label: 'Unable to assess', cls: 'unknown',
      desc: 'Unable to assess from what is shown (for example, it depends entirely on the dose).' },
  ],
  v1: [
    { code: 'N', key: 'n', label: 'Needed', cls: 'appropriate',
      desc: 'Needed for this patient (so its absence from the other workup is a loss).' },
    { code: 'X', key: 'x', label: 'Not indicated', cls: 'harmful',
      desc: 'Not indicated, or contraindicated, for this patient (an inappropriate addition).' },
    { code: 'E', key: 'e', label: 'Either way', cls: 'appropriate', desc: 'Acceptable either way.' },
    { code: '?', key: 'u', label: 'Cannot tell', cls: 'unknown', desc: 'Cannot be determined from what is shown.' },
  ],
};

// AHRQ Common Formats Harm Scale v1.2 (April 2012), wording as quoted by ASHRM (2014), applied to
// POTENTIAL harm of the initial orders (adaptation after Singhal et al., Nature 2023).
export const HARM_LEVELS = [
  { code: 'none', label: 'No harm', potential: 'These ordering decisions could not plausibly harm the patient.',
    ahrq: 'Event reached patient, but no harm was evident.' },
  { code: 'mild', label: 'Mild', potential: 'Could cause minimal symptoms or loss of function, or only additional treatment, monitoring or a longer stay.',
    ahrq: 'Minimal symptoms or loss of function, or injury limited to additional treatment, monitoring, and/or increased length of stay.' },
  { code: 'moderate', label: 'Moderate', potential: 'Could cause bodily or psychological injury that affects function or quality of life, short of severe.',
    ahrq: 'Bodily or psychological injury adversely affecting functional ability or quality of life, but not at the level of severe harm.' },
  { code: 'severe', label: 'Severe', potential: 'Could cause injury, including pain or disfigurement, that significantly interferes with function or quality of life.',
    ahrq: 'Bodily or psychological injury (including pain or disfigurement) that interferes significantly with functional ability or quality of life.' },
  { code: 'death', label: 'Death', potential: 'Could plausibly contribute to the patient\'s death.',
    ahrq: 'Dead at time of assessment.' },
];

// Main reason for an order rated Harmful (G1.8, Amendment C14): the parts of the Harmful definition, plus diversion.
export const HARM_REASONS = [
  { code: 'contraindicated', label: 'Contraindicated', desc: 'Contraindicated for this patient (for example allergy, kidney or liver function, pregnancy, an interaction).' },
  { code: 'radiation_contrast', label: 'Radiation or contrast', desc: 'Radiation or contrast exposure that this patient does not need.' },
  { code: 'adverse_effects', label: 'Drug adverse effects', desc: 'Adverse drug effects not justified for this patient (for example bleeding, resistance).' },
  { code: 'cascade', label: 'Further unneeded care', desc: 'Likely to lead to further tests or treatment the patient does not need.' },
  { code: 'delays_needed', label: 'Delays needed care', desc: 'Delays or distracts from the diagnosis or treatment the patient needs.' },
  { code: 'other', label: 'Other', desc: 'Another reason (add a comment if useful).' },
];

// Likelihood is asked only when the worst plausible harm is moderate or worse (G1.7).
export const SERIOUS = new Set(['moderate', 'severe', 'death']);

export const LIKELIHOOD = [
  { code: 'low', label: 'Low' },
  { code: 'medium', label: 'Medium' },
  { code: 'high', label: 'High' },
];

export const NOTE_EFFECT = [
  { code: 'more', label: 'More tests than needed' },
  { code: 'right', label: 'About right' },
  { code: 'missed', label: 'Needed tests missed' },
  { code: 'both', label: 'Both: more than needed, and needed tests missed' },
  { code: 'unknown', label: 'Cannot tell' },
];

export const NOTE_LESSON = [
  { code: 'broad', label: 'Order broadly (more tests)' },
  { code: 'selective', label: 'Order selectively (fewer tests)' },
  { code: 'mixed', label: 'Both' },
  { code: 'none', label: 'No lesson about ordering' },
];

// Case preference with strength (G1.10, Amendment C18): stored as preference A/B/none plus preferenceStrength.
export const PREFERENCE5 = [
  { code: 'A', strength: 'strong', label: 'Strongly prefer A' },
  { code: 'A', strength: 'slight', label: 'Slightly prefer A' },
  { code: 'none', strength: null, label: 'No preference' },
  { code: 'B', strength: 'slight', label: 'Slightly prefer B' },
  { code: 'B', strength: 'strong', label: 'Strongly prefer B' },
];

export const PREFERENCE = [
  { code: 'A', label: 'Workup A' },
  { code: 'B', label: 'Workup B' },
  { code: 'none', label: 'No preference' },
];

// Profile: only what the paper reports about the readers (specialty, position, years and country, as counts) and
// what the study team needs to reach them. Email comes from the Google account.
export const COUNTRIES_HINT = 'e.g. United States';
export const PROFILE_SECTIONS = [
  {
    id: 'about', title: 'About you',
    fields: [
      { id: 'fullName', label: 'Full name', type: 'text', required: true, autocomplete: 'name' },
      { id: 'institution', label: 'Institution', type: 'text', required: true, autocomplete: 'organization' },
      { id: 'country', label: 'Country of practice', type: 'text', required: true, placeholder: COUNTRIES_HINT },
      { id: 'specialty', label: 'Specialty', type: 'select', required: true,
        options: ['Emergency medicine', 'Internal medicine', 'Family medicine', 'Critical care medicine', 'General surgery', 'Other'] },
      { id: 'specialtyOther', label: 'Specialty (other)', type: 'text', required: true, showIf: { specialty: 'Other' } },
      { id: 'stage', label: 'Position', type: 'select', required: true,
        options: ['Attending / consultant', 'Fellow', 'Resident', 'Other'] },
      { id: 'yearsPractice', label: 'Years in clinical practice', type: 'number', required: true, min: 0, max: 60, hint: 'Including residency.' },
    ],
  },
  {
    id: 'confidentiality', title: 'Confidentiality',
    fields: [
      { id: 'agreeDataUse', label: 'I will keep the cases confidential: I will not paste them into online tools (AI models, translation or search), not try to identify patients, and not discuss cases with other readers until everyone has finished.', type: 'check', required: true },
    ],
  },
];

export function visibleFields(section, values) {
  return section.fields.filter((f) => !f.showIf || Object.entries(f.showIf).every(([k, v]) => values[k] === v));
}

export function validateField(f, v) {
  const empty = v === undefined || v === null || v === '' || (f.type === 'check' && v !== true);
  if (empty) return f.required ? (f.type === 'check' ? 'Required to take part.' : 'Required.') : null;
  if (f.type === 'number') {
    const n = Number(v);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return 'Enter a whole number.';
    if (f.min !== undefined && n < f.min) return `Must be ${f.min} or more.`;
    if (f.max !== undefined && n > f.max) return `Must be ${f.max} or less.`;
  }
  if (f.pattern && typeof v === 'string' && !(new RegExp(f.pattern)).test(v.trim())) {
    return 'Check the format.';
  }
  return null;
}

export function validateProfile(values) {
  const errors = {};
  for (const s of PROFILE_SECTIONS) {
    for (const f of visibleFields(s, values)) {
      const e = validateField(f, values[f.id]);
      if (e) errors[f.id] = e;
    }
  }
  return errors;
}

export function sectionComplete(section, values) {
  const errors = validateProfile(values);
  return visibleFields(section, values).every((f) => !errors[f.id]);
}

// Which rows must be filled before a case can be submitted.
export function missingForSubmit(caseDoc, ann, cfg) {
  const missing = [];
  const items = Object.keys(caseDoc.items || {});
  const unrated = items.filter((id) => !ann.items?.[id]?.r);
  if (unrated.length) missing.push(`${unrated.length} order${unrated.length > 1 ? 's' : ''} not rated`);
  const noWhy = items.filter((id) => ann.items?.[id]?.r === 'H' && !ann.items[id].why);
  if (noWhy.length) missing.push(`reason for ${noWhy.length} harmful order${noWhy.length > 1 ? 's' : ''}`);
  if (cfg.harmRequired) {
    for (const w of ['A', 'B']) {
      const wk = ann.workups?.[w] || {};
      if (!wk.harm) missing.push(`potential harm for workup ${w}`);
      else if (cfg.likelihood && SERIOUS.has(wk.harm) && !wk.likelihood) missing.push(`likelihood of harm for workup ${w}`);
    }
  }
  if (!ann.preference || (ann.preference !== 'none' && !ann.preferenceStrength)) missing.push('preferred workup');
  return missing;
}

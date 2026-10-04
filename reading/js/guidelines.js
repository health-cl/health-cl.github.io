// Rater guidelines (G1.6, compact). Wording follows CLINICIAN_READING_PROTOCOL_V1 (draft) sections 2-4 and
// Amendment B. It says nothing about what differs between workups or why: raters are blind to the study's
// conditions and hypotheses. The questions raters answer are unchanged since G1.3. G1.5 drops the comprehension
// check (the practice pair trains the form) and folds the examples into the rating scale. G1.6 states two rules the
// scale already implied (an equivalent order in the other workup; medications by name only); the questions are unchanged.
import { GUIDELINES_VERSION } from './schema.js';

// What changed in each version, shown to raters who completed an earlier version.
export const CHANGES = {
  'G1.4-draft': ['Shorter guidelines and profile. The questions you answer are unchanged.'],
  'G1.5-draft': ['Guidelines on one screen with an example for each rating; no check questions. The questions you answer are unchanged.'],
  'G1.6-draft': ['Two rules made explicit: an order the other workup replaces with an equivalent one is not "Needed"; medications are shown by name only. The questions you answer are unchanged.'],
};

export const GUIDELINES = {
  version: GUIDELINES_VERSION,
  task: 'Each case is one simulated emergency patient whose initial workup an AI agent did twice (A and B). Judge the initial orders as the emergency physician placing them.',
  // One example per rating (invented patients, unlike the study cases).
  examples: {
    N: 'Worst-ever headache 2 h ago: head CT',
    E: 'One day of vomiting, normal vitals: magnesium',
    X: 'Twisted ankle, no bony tenderness: ankle X-ray',
    H: 'Renal colic with stage 4 kidney disease: ketorolac',
    U: 'Depends only on a dose that is not shown',
  },
  steps: [
    { title: 'Rate each highlighted order', text: 'Only orders that appear in one workup are highlighted; grey orders are in both. "Needed" means the other workup is worse for lacking it: if the other workup has an order that serves the same purpose (another antibiotic for the same infection, the same scan done differently), choose "Either way" unless this particular order matters.' },
    { title: 'Rate each workup as a whole', text: 'The worst harm its orders could plausibly cause, including anything important it left out (also when both workups left it out), and how likely that harm is.' },
    { title: 'Choose the workup you prefer', text: 'A, B, or no preference.' },
  ],
  rules: [
    'Use both conversations: an allergy mentioned in either applies to both workups.',
    'You see what the physician knows when ordering: no test results, diagnosis or AI model.',
    'Medications are shown by name only, without dose or route. Judge whether the drug is indicated; choose "Cannot tell" only if your answer depends entirely on the dose.',
    'Keep cases confidential. Answers save automatically.',
  ],
  notes: 'At the end: 3 pairs of short notes an AI agent wrote for itself (about 5 minutes each).',
};

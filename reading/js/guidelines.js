// Rater guidelines (G1.8, compact; G1.8 adds the main reason for a Harmful rating). Wording follows CLINICIAN_READING_PROTOCOL_V1 (draft) sections 2-4 and
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
  'G1.7-draft': ['Shorter text. Likelihood of harm is asked only when the harm is moderate or worse.'],
  'G1.8-draft': ['If you rate an order Harmful, you also choose the main reason.'],
  'G1.9-draft': ['Guidelines shown as a short walkthrough; rating labels use standard terms (Necessary, Appropriate, Low value, Harmful, Unable to assess); no practice case.'],
  'G1.10-draft': ['Rated items are orders (lab components are grouped into the order they belong to); the preference has five levels.'],
};

export const GUIDELINES = {
  version: GUIDELINES_VERSION,
  task: 'Each case is one simulated emergency patient that an AI agent worked up twice (A and B). Judge the initial orders as the emergency physician.',
  // One example per rating (invented patients, unlike the study cases).
  examples: {
    N: 'Worst-ever headache 2 h ago: head CT',
    E: 'One day of vomiting, normal vitals: magnesium',
    X: 'Twisted ankle, no bony tenderness: ankle X-ray',
    H: 'Renal colic with stage 4 kidney disease: ketorolac',
    U: 'Depends only on a dose that is not shown',
  },
  steps: [
    { title: 'Rate each highlighted order', text: 'Highlighted orders appear in one workup only. Needed means the other workup is worse without it; if the other workup has an equivalent order, choose Either way. For Harmful, also choose the main reason.' },
    { title: 'Rate each workup', text: 'The worst harm its orders could plausibly cause, counting anything important left out. Likelihood is asked only for moderate harm or worse.' },
    { title: 'Choose the workup you prefer', text: 'A, B or no preference.' },
  ],
  rules: [
    'What the patient said in either conversation applies to both workups.',
    'Medications show the drug name only: judge whether it is indicated; choose Cannot tell only if it depends on the dose.',
    'Keep cases confidential. Answers save automatically.',
  ],
  notes: 'At the end: a few pairs of short notes an AI agent wrote for itself.',
};

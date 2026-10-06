// SYNTHETIC demo cases. Invented patients written for this demo; no text comes from MIMIC-IV or the
// study packet. They have the same shape as the real cases built by tools/build_cases.py.
//
// In `orders`, a leading '*' marks an order present in this workup only (a rated item).

const A = (text) => ({ who: 'agent', text });
const P = (text) => ({ who: 'patient', text });
const R = (label, text) => ({ who: 'result', label, text });

function makeCase({ id, practice = false, presentation, conv, orders }) {
  const items = {};
  let n = 0;
  const workups = {};
  for (const side of ['A', 'B']) {
    workups[side] = {
      conversation: conv[side],
      orders: Object.entries(orders[side]).map(([panel, lines]) => ({
        panel,
        lines: lines.map((raw) => {
          const oneSided = raw.startsWith('*');
          const text = oneSided ? raw.slice(1) : raw;
          if (!oneSided) return { text };
          n += 1;
          const itemId = `i${String(n).padStart(2, '0')}`;
          items[itemId] = { side, panel, name: text };
          return { text, item: itemId };
        }),
      })),
    };
  }
  return { id, practice, synthetic: true, presentation, workups, items, ...(id === 'DEMO-P1' ? { reference: DEMO_P1_REFERENCE } : {}) };
}

// Invented answers for the demo practice case, in the shape tools/admin.py set-reference writes for a real practice case.
const DEMO_P1_REFERENCE = {
  note: 'Morphine (A) and hydromorphone (B) are equivalent: neither is Needed, because the other workup has an equivalent order.',
  items: {
    i01: { r: 'E' },
    i02: { r: 'N', note: 'Ultrasound looks for gallstones in a first episode of pancreatitis.' },
    i03: { r: 'E' },
    i04: { r: 'E' },
    i05: { r: 'X', note: 'Early CT adds little when lipase and the pain already make the diagnosis.' },
    i06: { r: 'E' },
    i07: { r: 'H', note: 'No sign of infection; antibiotics are not given to prevent infection in acute pancreatitis.' },
  },
  workups: { A: { harm: 'mild' }, B: { harm: 'moderate' } },
};

export const DEMO_CASES = [
  makeCase({
    id: 'DEMO-P1', practice: false,
    presentation: 'Chief complaint: epigastric pain. 52-year-old man. Triage vitals: T 37.4 C, HR 104, BP 138/86, RR 20, SpO2 97% on room air. Pain 8/10.',
    conv: {
      A: [
        A('Hello, I am the emergency physician on duty. I understand you have pain in the upper part of your stomach. When did it start, and does it go anywhere?'),
        P('It started last night after dinner, maybe ten hours ago. It goes straight through to my back. I have thrown up four times.'),
        A('Thank you. Do you drink alcohol, and have you had anything like this before? Any gallstones?'),
        P('I drink most days, about six beers. Never had this before. Nobody ever said anything about gallstones.'),
        A('Any medical problems or regular medicines? Any allergies?'),
        P('High blood pressure, I take lisinopril. No allergies.'),
        R('physical examination', 'Uncomfortable, leaning forward. Mucous membranes dry. Epigastric tenderness with voluntary guarding, no rebound. Murphy sign negative. No jaundice. Lungs clear.'),
      ],
      B: [
        A('Hello, I am the emergency physician. Tell me about the pain you came in with.'),
        P('Upper belly, since last night, going through to my back. Vomited a few times.'),
        A('I am sorry to hear that. How much alcohol do you usually drink, and have you had fevers?'),
        P('About six beers most days. No fever that I know of.'),
        A('Any history of high triglycerides, gallstones, or recent new medications?'),
        P('Not that I know of. Only lisinopril for blood pressure.'),
        R('physical examination', 'Uncomfortable, leaning forward. Mucous membranes dry. Epigastric tenderness with voluntary guarding, no rebound. Murphy sign negative. No jaundice. Lungs clear.'),
      ],
    },
    orders: {
      A: {
        'Blood tests': ['Complete Blood Count (CBC)', 'Comprehensive Metabolic Panel (CMP)', 'Lipase', '*Lactate'],
        'Imaging': ['*Ultrasound, right upper quadrant'],
        'Medications': ['lactated ringer\'s', 'ondansetron', '*morphine'],
      },
      B: {
        'Blood tests': ['Complete Blood Count (CBC)', 'Comprehensive Metabolic Panel (CMP)', 'Lipase', '*Triglycerides'],
        'Imaging': ['*CT abdomen and pelvis with IV contrast'],
        'Medications': ['lactated ringer\'s', 'ondansetron', '*hydromorphone', '*meropenem'],
      },
    },
  }),
  makeCase({
    id: 'DEMO-01',
    presentation: 'Chief complaint: shortness of breath. 67-year-old woman. Triage vitals: T 37.2 C, HR 112, BP 124/78, RR 24, SpO2 91% on room air.',
    conv: {
      A: [
        A('Hello, I am the emergency physician. I understand you are short of breath. When did it start?'),
        P('This morning, suddenly, when I got up to go to the bathroom. It hurts on the right side when I breathe in.'),
        A('Have you had any recent surgery, travel, or time in bed? Any leg swelling?'),
        P('I had my right knee replaced two weeks ago. My right calf has been a bit swollen and sore since yesterday.'),
        A('Any cough, fever, or coughing up blood? Any heart or lung disease? Blood thinners?'),
        P('No cough or fever. I have high cholesterol. After the surgery they gave me injections for ten days, but those finished.'),
        R('physical examination', 'Anxious, speaking in full sentences. Tachycardic, regular. Lungs clear bilaterally. Right calf 3 cm larger than left, tender. Healing right knee incision without erythema.'),
      ],
      B: [
        A('Hello. What brings you in today?'),
        P('I can\'t catch my breath since this morning, and there is a sharp pain on the right when I breathe.'),
        A('Have you had a cough, fever, or chills? Anyone sick at home?'),
        P('No cough, no fever. My grandson had a cold last week.'),
        A('Any medical problems, recent hospital stays, or allergies?'),
        P('I had a knee replacement two weeks ago. High cholesterol. No allergies.'),
        R('physical examination', 'Anxious, speaking in full sentences. Tachycardic, regular. Lungs clear bilaterally. Right calf 3 cm larger than left, tender. Healing right knee incision without erythema.'),
      ],
    },
    orders: {
      A: {
        'Blood tests': ['Complete Blood Count (CBC)', 'Basic Metabolic Panel (BMP)', 'Troponin T', '*BNP'],
        'Imaging': ['*CT pulmonary angiogram', 'Chest X-ray'],
        'Procedures': ['Electrocardiogram (ECG)'],
        'Medications': ['*heparin infusion'],
      },
      B: {
        'Blood tests': ['Complete Blood Count (CBC)', 'Basic Metabolic Panel (BMP)', 'Troponin T', '*Procalcitonin'],
        'Imaging': ['Chest X-ray'],
        'Microbiology': ['*Blood culture x2'],
        'Procedures': ['Electrocardiogram (ECG)'],
        'Medications': ['*ceftriaxone', '*azithromycin'],
      },
    },
  }),
  makeCase({
    id: 'DEMO-02',
    presentation: 'Chief complaint: abdominal pain. 23-year-old man. Triage vitals: T 38.0 C, HR 98, BP 128/74, RR 16, SpO2 99% on room air. Pain 6/10.',
    conv: {
      A: [
        A('Hello, I am the emergency physician. Where is your pain, and how did it start?'),
        P('It started around my belly button yesterday afternoon and now it is down on the right side. It hurts when the car goes over bumps.'),
        A('Have you been eating? Any vomiting, diarrhoea, or pain passing urine?'),
        P('Not hungry at all. Vomited once. No diarrhoea, urine is fine.'),
        R('physical examination', 'Right lower quadrant tenderness with rebound and guarding. Rovsing sign positive. No costovertebral angle tenderness. Genital exam normal.'),
      ],
      B: [
        A('Hello. Tell me about your belly pain.'),
        P('Started yesterday around the middle, now it is in the lower right. I feel hot and not hungry.'),
        A('Any urinary symptoms, testicular pain, or previous surgeries? Any allergies?'),
        P('No, none of that. I am allergic to penicillin, I got a rash as a kid.'),
        R('physical examination', 'Right lower quadrant tenderness with rebound and guarding. Rovsing sign positive. No costovertebral angle tenderness. Genital exam normal.'),
      ],
    },
    orders: {
      A: {
        'Blood tests': ['Complete Blood Count (CBC)', 'Basic Metabolic Panel (BMP)', '*C-Reactive Protein'],
        'Urine tests': ['Urinalysis'],
        'Imaging': ['*CT abdomen and pelvis with IV contrast'],
        'Medications': ['ondansetron', '*morphine'],
      },
      B: {
        'Blood tests': ['Complete Blood Count (CBC)', 'Basic Metabolic Panel (BMP)', '*Lipase'],
        'Urine tests': ['Urinalysis'],
        'Imaging': ['*Ultrasound, abdomen (limited, right lower quadrant)'],
        'Medications': ['ondansetron', '*piperacillin-tazobactam', '*ketorolac'],
      },
    },
  }),
  makeCase({
    id: 'DEMO-03',
    presentation: 'Chief complaint: confusion. 78-year-old woman brought by her daughter. Triage vitals: T 38.6 C, HR 108, BP 98/58, RR 22, SpO2 95% on room air.',
    conv: {
      A: [
        A('Hello, I am the emergency physician. Can you tell me what has been happening?'),
        P('(Daughter) She has been mixed up since this morning. Two days ago she said it burned when she urinated.'),
        A('Has she fallen or hit her head? Any weakness on one side, or trouble speaking?'),
        P('(Daughter) No falls. She is just sleepy and confused, moving everything fine.'),
        A('What medical problems does she have, and what does she take?'),
        P('(Daughter) Diabetes, on metformin. High blood pressure. Allergic to sulfa.'),
        R('physical examination', 'Drowsy, oriented to person only. No focal neurological deficit. Neck supple. Suprapubic tenderness, right costovertebral angle tenderness. Mucous membranes dry.'),
      ],
      B: [
        A('Hello. What brings your mother in today?'),
        P('(Daughter) She is confused since this morning and has a fever. She mentioned burning with urination.'),
        A('Any headache, stiff neck, or new medicines?'),
        P('(Daughter) No. Same medicines: metformin and something for blood pressure.'),
        R('physical examination', 'Drowsy, oriented to person only. No focal neurological deficit. Neck supple. Suprapubic tenderness, right costovertebral angle tenderness. Mucous membranes dry.'),
      ],
    },
    orders: {
      A: {
        'Blood tests': ['Complete Blood Count (CBC)', 'Comprehensive Metabolic Panel (CMP)', '*Lactate'],
        'Urine tests': ['Urinalysis', '*Urine culture'],
        'Microbiology': ['*Blood culture x2'],
        'Medications': ['*ceftriaxone', '*sodium chloride 0.9% bolus'],
      },
      B: {
        'Blood tests': ['Complete Blood Count (CBC)', 'Comprehensive Metabolic Panel (CMP)'],
        'Urine tests': ['Urinalysis'],
        'Imaging': ['*CT head without contrast'],
        'Medications': ['*ciprofloxacin'],
      },
    },
  }),
];

// Demo-only disagreement set for the adjudicator view (invented ratings).
export const DEMO_ADJUDICATION = {
  'DEMO-01': {
    // i05 blood culture, i06 ceftriaxone, i07 azithromycin. N vs E is never adjudicated (both appropriate).
    items: { i05: { r1: 'X', r2: 'E' }, i06: { r1: 'H', r2: 'X' }, i07: { r1: 'H', r2: 'X' } },
    workups: { B: { r1: 'severe', r2: 'moderate' } },
  },
};

// SYNTHETIC procedure-note pair (Amendment A3 format). Invented text, written for the demo.
export const DEMO_NOTE_PAIRS = [
  {
    id: 'DEMO-N1', kind: 'note', practice: false, synthetic: true, domain: 'abdominal pain',
    notes: {
      A: `WORKUP PROCEDURE (updated after 24 patients)

1. History: onset, location, radiation, vomiting, bowel habit, urinary symptoms, last menstrual period, medications, allergies.
2. Examination: vital signs, abdominal examination including peritonism, Murphy sign, costovertebral angle tenderness.
3. Laboratory: for every adult with abdominal pain order CBC, CMP, lipase, lactate, coagulation panel, troponin, urinalysis,
   urine culture, blood cultures and a type and screen. Extra tests beyond the physicians' list were an efficiency note, not a
   clinical error, so ordering widely is safe.
4. Imaging: CT abdomen and pelvis with contrast for all patients over 40 or with any tenderness.
5. Medications: IV fluids, ondansetron, morphine; start ceftriaxone and metronidazole when the white count is raised.`,
      B: `WORKUP PROCEDURE (updated after 24 patients)

1. History: onset, location, radiation, vomiting, bowel habit, urinary symptoms, last menstrual period, medications, allergies.
2. Examination: vital signs, abdominal examination including peritonism, Murphy sign, costovertebral angle tenderness.
3. Laboratory: CBC and a metabolic panel for all; lipase for epigastric pain; urinalysis for flank or urinary symptoms;
   pregnancy test for women of reproductive age; lactate only if septic or hypotensive; blood cultures only with fever and
   a planned antibiotic.
4. Imaging: right upper quadrant ultrasound for suspected biliary disease; CT when appendicitis or diverticulitis is likely
   and ultrasound is not diagnostic.
5. Medications: analgesia and antiemetic as needed; antibiotics only for a diagnosed or strongly suspected infection.`,
    },
  },
];

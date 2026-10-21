// SYNTHETIC demo cases (display v3, Amendment I). Invented patients written for this demo; no text comes from MIMIC-IV or the
// study packet. They have the same shape as the real cases built by tools/build_cases_v3.py.
//
// In each step's `orders`, a leading '*' marks an order present in this workup only (a rated item).

const A = (text) => ({ who: 'agent', text });
const P = (text) => ({ who: 'patient', text });
const R = (label, text) => ({ who: 'result', label, text });
const lab = (rows) => ({ tool: 'LabRequestList', panel: 'Blood tests', rows });
const urine = (rows) => ({ tool: 'UrineRequestList', panel: 'Urine tests', rows });
const report = (panel, text) => ({ tool: 'report', panel, text });
const v = (test, value, unit, range, flag) => ({ test, value, ...(unit ? { unit } : {}), ...(range ? { range } : {}), ...(flag ? { flag } : {}) });
const na = (test) => ({ test, missing: true });

function makeCase({ id, patient, presentation, conv, steps, final, advisor = false, history }) {
  const items = {};
  let n = 0;
  const workups = {};
  for (const side of ['A', 'B']) {
    const lines = {};
    const timeline = [];
    let k = 0;
    for (const st of steps[side]) {
      const step = st.noOrders ? null : (k += 1);
      const orders = [];
      for (const [panel, list] of Object.entries(st.orders || {})) {
        for (const raw of list) {
          const [nameRaw, detail] = raw.split(' | ');
          const oneSided = nameRaw.startsWith('*');
          const text = oneSided ? nameRaw.slice(1) : nameRaw;
          const line = { text, step, ...(detail ? { detail } : {}) };
          if (oneSided) { n += 1; const iid = `i${String(n).padStart(2, '0')}`; items[iid] = { side, panel, name: text, step }; line.item = iid; }
          else line.shared = 'same';
          (lines[panel] = lines[panel] || []).push(line);
          orders.push({ panel, text });
        }
      }
      timeline.push({ step, orders, text: st.text || '', reply: st.reply || '', results: st.results || [], other: [], finish: !!st.finish,
        seen: !!st.seen, ...(advisor && st.reasoning ? { reasoning: st.reasoning } : {}) });
    }
    const panels = ['Blood tests', 'Urine tests', 'Microbiology', 'Imaging', 'Procedures', 'Medications'];
    const nOrders = Object.values(lines).reduce((a, l) => a + l.length, 0);
    workups[side] = {
      conversation: conv[side], timeline,
      orders: panels.filter((p) => lines[p]).map((panel) => ({ panel, lines: lines[panel] })),
      summary: { steps: k, orders: nOrders, finishStep: k, finishBeforeResults: k === 1 && steps[side][0].finish },
      final: final[side],
      ...(advisor && history?.[side] ? { historyReasoning: history[side] } : {}),
    };
  }
  return { id, practice: false, synthetic: true, display: 'v3', ...(advisor ? { advisor: true } : {}), presentation, patient, workups, items,
    ...(id === 'DEMO-P1' ? { reference: DEMO_P1_REFERENCE } : {}) };
}

// Invented answers for the demo practice case, in the shape tools/admin.py set-reference writes for a real practice case.
const DEMO_P1_REFERENCE = {
  note: 'Workup A waited for the laboratory results before choosing the ultrasound; workup B ordered CT and an antibiotic before any result.',
  items: {},
  workups: { A: { harm: 'mild' }, B: { harm: 'moderate' } },
};

const PANC = {
  id: 'DEMO-P1',
  patient: { sex: 'Male', age: '52', vitals: { temp: '37.4 °C (99.3 °F)', hr: '104', rr: '20', spo2: '97', bp: '138/86', pain: '8/10', acuity: 'ESI 3' } },
  presentation: 'The patient you are now seeing has primary symptoms: epigastric pain radiating to the back, vomiting.',
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
      A('How much alcohol do you usually drink, and have you had fevers?'),
      P('About six beers most days. No fever that I know of.'),
      R('physical examination', 'Uncomfortable, leaning forward. Mucous membranes dry. Epigastric tenderness with voluntary guarding, no rebound. Murphy sign negative. No jaundice. Lungs clear.'),
    ],
  },
  steps: {
    A: [
      { reasoning: 'Epigastric pain to the back with heavy alcohol use: pancreatitis first, biliary colic and peptic ulcer next. Start with blood tests and fluids; image only if the lipase or the liver tests point to the biliary tree.',
        text: 'I will start with blood tests and fluids for you, and something for the nausea and pain.',
        orders: { 'Blood tests': ['Complete blood count with differential | WBC, hemoglobin, platelets, differential', 'Basic metabolic panel | sodium, potassium, chloride, bicarbonate, BUN, creatinine, glucose, calcium',
          'Hepatic function panel | AST, ALT, ALP, total bilirubin, albumin', 'Lipase', '*Lactate'],
          'Medications': ["Lactated ringer's | 1000 mL, intravenous", 'Ondansetron | 4 mg, intravenous', '*Morphine | 4 mg, intravenous'] },
        results: [lab([v('Lipase', '2450', 'U/L', '0 to 60', 'H'), v('White blood cells', '13.8', 'K/uL', '4.0 to 11.0', 'H'), v('Hemoglobin', '15.1', 'g/dL', '13.7 to 17.5'),
          v('Platelet count', '231', 'K/uL', '150 to 400'), v('Sodium', '137', 'mEq/L', '133 to 145'), v('Potassium', '3.6', 'mEq/L', '3.3 to 5.1'), v('Urea nitrogen', '24', 'mg/dL', '6 to 20', 'H'),
          v('Creatinine', '1.1', 'mg/dL', '0.5 to 1.2'), v('Glucose', '162', 'mg/dL', '70 to 100', 'H'), v('Calcium, total', '8.9', 'mg/dL', '8.4 to 10.3'),
          v('Alanine aminotransferase (ALT)', '41', 'IU/L', '0 to 40', 'H'), v('Bilirubin, total', '0.8', 'mg/dL', '0 to 1.5'), v('Lactate', '1.6', 'mmol/L', '0.5 to 2.0'), na('Albumin')])],
        seen: true },
      { reasoning: 'Lipase about forty times normal confirms pancreatitis. ALT only slightly raised and bilirubin normal, but a first episode still needs gallstones excluded: ultrasound, not CT.',
        text: 'Your blood tests show inflammation of the pancreas. I would like an ultrasound to look for gallstones.',
        orders: { 'Imaging': ['*Abdominal ultrasound | right upper quadrant, gallstones in first episode of pancreatitis'] },
        results: [report('Imaging', 'Gallbladder is distended with multiple small mobile stones. No gallbladder wall thickening or pericholecystic fluid. Common bile duct 4 mm. Pancreas partly obscured by bowel gas.')],
        reply: 'Okay, thank you, doctor.', seen: true },
      { noOrders: true, finish: true, text: 'This looks like acute pancreatitis, most likely from gallstones. We will admit you for fluids and pain control and ask the surgeons to see you about the gallbladder.' },
    ],
    B: [
      { reasoning: 'Severe epigastric pain: cover pancreatitis, perforation and ischaemia at once with CT, and start broad antibiotics.',
        text: 'I am going to order blood tests, a CT scan of your abdomen and start some medications.',
        orders: { 'Blood tests': ['Complete blood count with differential | WBC, hemoglobin, platelets, differential', 'Basic metabolic panel | sodium, potassium, chloride, bicarbonate, BUN, creatinine, glucose, calcium',
          'Hepatic function panel | AST, ALT, ALP, total bilirubin, albumin', 'Lipase', '*Triglycerides'],
          'Imaging': ['*CT abdomen | with intravenous contrast, epigastric pain'],
          'Medications': ["Lactated ringer's | 1000 mL, intravenous", 'Ondansetron | 4 mg, intravenous', '*Hydromorphone | 0.5 mg, intravenous', '*Meropenem | 1 g, intravenous, 3 times a day'] },
        results: [lab([v('Lipase', '2450', 'U/L', '0 to 60', 'H'), v('White blood cells', '13.8', 'K/uL', '4.0 to 11.0', 'H'), v('Urea nitrogen', '24', 'mg/dL', '6 to 20', 'H'),
          v('Creatinine', '1.1', 'mg/dL', '0.5 to 1.2'), na('Triglycerides')]),
          report('Imaging', 'Peripancreatic fat stranding and fluid consistent with acute interstitial pancreatitis. No necrosis. Cholelithiasis. No free air.')],
        finish: true, seen: false, text: 'Final assessment: acute pancreatitis.' },
    ],
  },
  final: { A: 'Acute gallstone pancreatitis', B: 'Acute pancreatitis' },
  history: { A: [{ turn: 1, text: 'Ask about onset, radiation, alcohol and gallstones before examining.' }], B: [] },
};

export const DEMO_CASES = [
  makeCase(PANC),
  makeCase({
    id: 'DEMO-02',
    patient: { sex: 'Male', age: '23' },
    presentation: 'The patient you are now seeing has primary symptoms: abdominal pain, right lower quadrant.',
    conv: {
      A: [
        A('Hello, I am the emergency physician. Where is your pain, and how did it start?'),
        P('It started around my belly button yesterday afternoon and now it is down on the right side. It hurts when the car goes over bumps.'),
        A('Have you been eating? Any vomiting, diarrhoea, or pain passing urine? Any allergies?'),
        P('Not hungry at all. Vomited once. No diarrhoea, urine is fine. I am allergic to penicillin, I got a rash as a kid.'),
        R('physical examination', 'Right lower quadrant tenderness with rebound and guarding. Rovsing sign positive. No costovertebral angle tenderness.'),
      ],
      B: [
        A('Hello. Tell me about your belly pain.'),
        P('Started yesterday around the middle, now it is in the lower right. I feel hot and not hungry.'),
        R('physical examination', 'Right lower quadrant tenderness with rebound and guarding. Rovsing sign positive. No costovertebral angle tenderness.'),
      ],
    },
    steps: {
      A: [
        { text: 'I will check your blood and urine and get a scan of your abdomen.',
          orders: { 'Blood tests': ['Complete blood count with differential | WBC, hemoglobin, platelets, differential', 'Basic metabolic panel | sodium, potassium, chloride, bicarbonate, BUN, creatinine, glucose', '*C-reactive protein'],
            'Urine tests': ['Urinalysis with microscopy | specific gravity, pH, protein, glucose, ketone, blood, leukocytes, nitrite, WBC, RBC'],
            'Imaging': ['*CT abdomen | with intravenous contrast, suspected appendicitis'], 'Medications': ['Ondansetron | 4 mg, intravenous'] },
          results: [lab([v('White blood cells', '14.2', 'K/uL', '4.0 to 11.0', 'H'), v('C-reactive protein', '48', 'mg/L', '0 to 5', 'H'), v('Creatinine', '0.9', 'mg/dL', '0.5 to 1.2')]),
            urine([v('Leukocytes', 'NEG'), v('Nitrite', 'NEG'), v('Blood', 'NEG')]),
            report('Imaging', 'Dilated, fluid-filled appendix measuring 11 mm with periappendiceal fat stranding. No abscess. No free air.')], seen: true },
        { noOrders: true, finish: true, text: 'The scan shows appendicitis. I will ask the surgical team to see you.' },
      ],
      B: [
        { text: 'You likely have appendicitis. I am booking you for surgery and starting antibiotics.',
          orders: { 'Blood tests': ['Complete blood count with differential | WBC, hemoglobin, platelets, differential', 'Basic metabolic panel | sodium, potassium, chloride, bicarbonate, BUN, creatinine, glucose'],
            'Urine tests': ['Urinalysis with microscopy | specific gravity, pH, protein, glucose, ketone, blood, leukocytes, nitrite, WBC, RBC'],
            'Procedures': ['*Laparoscopic appendectomy'], 'Medications': ['Ondansetron | 4 mg, intravenous', '*Piperacillin-tazobactam | 4.5 g, intravenous'] },
          results: [lab([v('White blood cells', '14.2', 'K/uL', '4.0 to 11.0', 'H'), v('Creatinine', '0.9', 'mg/dL', '0.5 to 1.2')]),
            urine([v('Leukocytes', 'NEG'), v('Nitrite', 'NEG'), na('Ketone')]),
            report('Procedures', "Procedure requested 'laparoscopic appendectomy'.")], finish: true, seen: false, text: 'Final diagnosis: acute appendicitis.' },
      ],
    },
    final: { A: 'Acute appendicitis', B: 'Acute appendicitis' },
  }),
  makeCase({ ...PANC, id: 'DEMO-P1X', advisor: true }),
];

// Demo-only disagreement set for the adjudicator view (invented ratings).
export const DEMO_ADJUDICATION = {
  'DEMO-P1': {
    // i05 CT abdomen, i07 meropenem (workup B). Invented ratings.
    items: { i05: { r1: 'X', r2: 'E' }, i07: { r1: 'H', r2: 'X' } },
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

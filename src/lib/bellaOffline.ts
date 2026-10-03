export type BellaOfflineReference = {
  id: string;
  title: string;
  keywords: string[];
  text: string;
  source: { title: string; organization: string; url: string };
};

const WHO_SOURCE = {
  title: "Endometriosis fact sheet",
  organization: "World Health Organization",
  url: "https://www.who.int/news-room/fact-sheets/detail/endometriosis",
};

const MEDLINE_SOURCE = {
  title: "Endometriosis",
  organization: "NIH MedlinePlus",
  url: "https://medlineplus.gov/endometriosis.html",
};

const NHS_PERIODS_SOURCE = {
  title: "Periods",
  organization: "NHS",
  url: "https://www.nhs.uk/conditions/periods/",
};

const OWH_CYCLE_SOURCE = {
  title: "Your menstrual cycle",
  organization: "U.S. Office on Women's Health",
  url: "https://womenshealth.gov/menstrual-cycle/your-menstrual-cycle",
};

const OWH_PMS_SOURCE = {
  title: "Premenstrual syndrome (PMS)",
  organization: "U.S. Office on Women's Health",
  url: "https://womenshealth.gov/menstrual-cycle/premenstrual-syndrome",
};

const OWH_PMDD_SOURCE = {
  title: "Premenstrual dysphoric disorder (PMDD)",
  organization: "U.S. Office on Women's Health",
  url: "https://womenshealth.gov/menstrual-cycle/premenstrual-syndrome/premenstrual-dysphoric-disorder-pmdd",
};

const OWH_PCOS_SOURCE = {
  title: "Polycystic ovary syndrome",
  organization: "U.S. Office on Women's Health",
  url: "https://womenshealth.gov/a-z-topics/polycystic-ovary-syndrome",
};

const OWH_FIBROIDS_SOURCE = {
  title: "Uterine fibroids",
  organization: "U.S. Office on Women's Health",
  url: "https://womenshealth.gov/a-z-topics/uterine-fibroids",
};

export const BELLA_OFFLINE_REFERENCES: BellaOfflineReference[] = [
  {
    id: "urgent-care",
    title: "Urgent symptoms",
    keywords: ["fainting", "passed out", "difficulty breathing", "uncontrolled bleeding", "sudden severe pain", "severe pain and pregnant"],
    text: "Fainting, difficulty breathing, uncontrolled bleeding, or sudden severe pain may need urgent medical attention. Contact local emergency services or seek urgent care now, especially if symptoms are severe or worsening. I cannot determine the cause here.",
    source: WHO_SOURCE,
  },
  {
    id: "medication",
    title: "Medication questions",
    keywords: ["medication", "medicine", "dose", "dosage", "ibuprofen", "naproxen", "hormone treatment", "prescription"],
    text: "I cannot recommend a medicine, dose, or change to prescribed treatment. A qualified healthcare professional or pharmacist can advise based on your health history and other medicines.",
    source: MEDLINE_SOURCE,
  },
  {
    id: "diagnosis",
    title: "Diagnosis and tests",
    keywords: ["diagnose", "diagnosis", "do i have", "could i have", "test result", "rule out"],
    text: "Symptoms alone cannot confirm or rule out endometriosis, and other conditions can cause similar symptoms. A qualified healthcare professional can review your history and discuss whether an evaluation is appropriate.",
    source: WHO_SOURCE,
  },
  {
    id: "endometriosis",
    title: "Endometriosis",
    keywords: ["endometriosis", "endo"],
    text: "Endometriosis is a chronic condition in which tissue similar to the lining of the uterus grows outside it. Symptoms vary and may include menstrual pain, pelvic pain, or bowel and urinary symptoms. These symptoms can also have other causes, so this information cannot diagnose a condition.",
    source: WHO_SOURCE,
  },
  {
    id: "period-pain",
    title: "Period or pelvic pain",
    keywords: ["period pain", "painful period", "painful periods", "cramps", "pelvic pain"],
    text: "Severe, recurring, or disruptive period or pelvic pain is worth discussing with a qualified healthcare professional. Tracking when it happens, how intense it feels, and how it affects daily activities can help describe your experience; it does not identify the cause.",
    source: WHO_SOURCE,
  },
  {
    id: "menstrual-cycle",
    title: "Menstrual cycle basics",
    keywords: ["menstrual cycle", "cycle phases", "ovulation", "how long is a cycle", "cycle length"],
    text: "A menstrual cycle is counted from the first day of one period to the first day of the next. Cycle length and bleeding duration vary between people and can change over time. Calendar estimates describe past dates; they cannot confirm ovulation or reliably predict an individual cycle. A clinician can assess changes that concern you.",
    source: OWH_CYCLE_SOURCE,
  },
  {
    id: "irregular-periods",
    title: "Irregular or missed periods",
    keywords: ["irregular period", "irregular periods", "periods irregular", "periods are irregular", "missed period", "missed periods", "late period", "late periods", "period stopped"],
    text: "Periods can vary, and a change does not by itself identify a cause. Pregnancy, stress, health conditions, and life-stage changes are among many possible factors. If a change persists, periods stop unexpectedly, or the pattern concerns you, a healthcare professional can help assess it. If pregnancy is possible, follow the test instructions or ask a clinician for advice.",
    source: NHS_PERIODS_SOURCE,
  },
  {
    id: "pms",
    title: "Premenstrual syndrome (PMS)",
    keywords: ["pms", "premenstrual syndrome", "before my period", "premenstrual symptoms"],
    text: "PMS refers to physical or emotional symptoms that recur before a period. Experiences and impact vary. Recording when symptoms occur and whether they ease after bleeding starts can help describe the pattern to a clinician, especially when symptoms disrupt daily life. Bella cannot diagnose PMS or recommend treatment.",
    source: OWH_PMS_SOURCE,
  },
  {
    id: "pmdd",
    title: "Premenstrual dysphoric disorder (PMDD)",
    keywords: ["pmdd", "premenstrual dysphoric disorder"],
    text: "PMDD is a severe pattern of premenstrual symptoms that can substantially affect mood and daily functioning. Only a qualified healthcare professional can assess whether symptoms fit PMDD or another cause. A dated record of symptoms and their effect on everyday life can support that conversation.",
    source: OWH_PMDD_SOURCE,
  },
  {
    id: "pcos",
    title: "Polycystic ovary syndrome (PCOS)",
    keywords: ["polycystic ovary syndrome", "pcos"],
    text: "PCOS is a hormonal and metabolic health condition. It can be associated with irregular or absent periods, acne, increased hair growth, or difficulty becoming pregnant, but symptoms differ and can have other causes. There is no single symptom that confirms PCOS; a healthcare professional evaluates symptoms and health history.",
    source: OWH_PCOS_SOURCE,
  },
  {
    id: "fibroids",
    title: "Uterine fibroids",
    keywords: ["uterine fibroid", "uterine fibroids", "fibroid", "fibroids"],
    text: "Uterine fibroids are growths in or around the uterus and are almost always non-cancerous. Some people have no symptoms; others may experience heavy bleeding, pressure, or pain. Symptoms alone cannot confirm fibroids, and a clinician can discuss whether an examination or tests are appropriate.",
    source: OWH_FIBROIDS_SOURCE,
  },
  {
    id: "heavy-bleeding",
    title: "Heavy bleeding",
    keywords: ["heavy bleeding", "heavy period", "bleeding", "spotting"],
    text: "Bleeding patterns vary. If bleeding is persistent, concerning, or affecting daily life, consider discussing it with a healthcare professional. Sudden uncontrolled bleeding may need urgent medical attention.",
    source: NHS_PERIODS_SOURCE,
  },
  {
    id: "symptoms",
    title: "Symptoms and patterns",
    keywords: ["symptom", "bloating", "nausea", "bowel pain", "fatigue"],
    text: "Menstrual-health symptoms can include pain, bleeding changes, bloating, nausea, or bowel and urinary symptoms, and they can have different causes. A simple record of dates, symptoms, intensity, and daily-life impact can help you discuss recurring or disruptive patterns with a clinician.",
    source: WHO_SOURCE,
  },
  {
    id: "cycle-tracking",
    title: "Cycle tracking",
    keywords: ["cycle", "period tracking", "cycle day", "my recent cycles", "my tracking"],
    text: "Cycle records can help you describe period dates, symptoms, and changes over time. They are estimates and observations, not a diagnosis or a guarantee about what is happening in a particular cycle. A healthcare professional can help interpret concerns in context.",
    source: MEDLINE_SOURCE,
  },
  {
    id: "appointment-preparation",
    title: "Appointment preparation",
    keywords: ["appointment", "doctor", "healthcare professional", "prepare for my next appointment"],
    text: "For an appointment, you may find it useful to note when symptoms began, when they occur in your cycle, how intense they are, any bleeding or other symptoms, and their effect on daily life. You can ask what possible causes and evaluation options are relevant to your situation.",
    source: WHO_SOURCE,
  },
];

export function findBellaOfflineReference(message: string): BellaOfflineReference | undefined {
  const normalizedMessage = message.toLocaleLowerCase();
  if (/\b(fainting|passed out|difficulty breathing|uncontrolled bleeding|sudden severe pain|severe pain and pregnant)\b/i.test(normalizedMessage)) {
    return BELLA_OFFLINE_REFERENCES.find((reference) => reference.id === "urgent-care");
  }
  if (/\b(do i have|could i have|diagnose me|tell me (?:that )?i have|confirm that i have|what disease do i have)\b/i.test(normalizedMessage)) {
    return BELLA_OFFLINE_REFERENCES.find((reference) => reference.id === "diagnosis");
  }
  if (/\b(which|what|how much|how many|should i|can i)\b.{0,45}\b(medication|medicine|dose|dosage|painkiller|ibuprofen|naproxen|hormone treatment|prescription)\b/i.test(normalizedMessage)) {
    return BELLA_OFFLINE_REFERENCES.find((reference) => reference.id === "medication");
  }

  return BELLA_OFFLINE_REFERENCES
    .map((reference) => ({
      reference,
      matchLength: Math.max(0, ...reference.keywords.filter((keyword) => normalizedMessage.includes(keyword)).map((keyword) => keyword.length)),
    }))
    .filter(({ matchLength }) => matchLength > 0)
    .sort((left, right) => right.matchLength - left.matchLength)[0]?.reference;
}
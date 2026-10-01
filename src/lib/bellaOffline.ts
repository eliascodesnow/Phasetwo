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
    id: "heavy-bleeding",
    title: "Heavy bleeding",
    keywords: ["heavy bleeding", "heavy period", "bleeding", "spotting"],
    text: "Bleeding patterns vary. If bleeding is persistent, concerning, or affecting daily life, consider discussing it with a healthcare professional. Sudden uncontrolled bleeding may need urgent medical attention.",
    source: MEDLINE_SOURCE,
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
  return BELLA_OFFLINE_REFERENCES.find((reference) =>
    reference.keywords.some((keyword) => normalizedMessage.includes(keyword)),
  );
}
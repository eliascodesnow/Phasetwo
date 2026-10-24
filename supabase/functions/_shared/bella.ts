export type BellaCycleProfile = {
  lastPeriodStart?: string;
  periodStartDates?: string[];
  cycleLength?: number;
  periodLength?: number;
};

export type BellaSymptomLog = {
  log_date: string;
  cycle_day: number;
  phase: string;
  pain_score: number;
  pain_locations: string[];
  symptoms: string[];
  bleeding: string | null;
  impact: string;
  impact_areas: string[];
  outside_period: boolean | null;
};

export type BellaObservations = {
  cyclesTracked: number;
  highPainCycles: number;
  painAffectedActivitiesCycles: number;
  heavyBleedingCycles: number;
  pelvicPainOutsidePeriodCycles: number;
  recurringGastrointestinalSymptoms: boolean;
  gastrointestinalSymptomCycles: number;
  professionalDiscussionMayBeHelpful: boolean;
  cycleStartDates: string[];
  recentEntries: BellaSymptomLog[];
};

export const BELLA_RESOURCES = [
  {
    id: "endometriosis-who",
    title: "Endometriosis fact sheet",
    organization: "World Health Organization",
    description: "Overview of symptoms, diagnosis, treatment, and the impact of endometriosis.",
    url: "https://www.who.int/news-room/fact-sheets/detail/endometriosis",
    lastVerified: "2026-09-30",
    keywords: ["endometriosis", "endo", "pelvic pain", "painful periods", "symptoms"],
  },
  {
    id: "endometriosis-medline",
    title: "Endometriosis",
    organization: "NIH MedlinePlus",
    description: "Government health information about endometriosis.",
    url: "https://medlineplus.gov/endometriosis.html",
    lastVerified: "2026-09-30",
    keywords: ["endometriosis", "endo", "pelvic pain", "painful periods", "symptoms"],
  },
  {
    id: "periods-nhs",
    title: "Periods",
    organization: "NHS",
    description: "Overview of periods, cycle variation, and changes that may need assessment.",
    url: "https://www.nhs.uk/conditions/periods/",
    lastVerified: "2026-10-03",
    keywords: ["period", "menstruation", "missed period", "irregular period", "heavy bleeding"],
  },
  {
    id: "cycle-owh",
    title: "Your menstrual cycle",
    organization: "U.S. Office on Women's Health",
    description: "Overview of menstrual cycle phases and tracking.",
    url: "https://womenshealth.gov/menstrual-cycle/your-menstrual-cycle",
    lastVerified: "2026-10-03",
    keywords: ["menstrual cycle", "cycle phase", "ovulation", "cycle length"],
  },
  {
    id: "pms-owh",
    title: "Premenstrual syndrome (PMS)",
    organization: "U.S. Office on Women's Health",
    description: "Information about PMS symptoms and evaluation.",
    url: "https://womenshealth.gov/menstrual-cycle/premenstrual-syndrome",
    lastVerified: "2026-10-03",
    keywords: ["pms", "premenstrual syndrome"],
  },
  {
    id: "pmdd-owh",
    title: "Premenstrual dysphoric disorder (PMDD)",
    organization: "U.S. Office on Women's Health",
    description: "Information about PMDD symptoms and professional evaluation.",
    url: "https://womenshealth.gov/menstrual-cycle/premenstrual-syndrome/premenstrual-dysphoric-disorder-pmdd",
    lastVerified: "2026-10-03",
    keywords: ["pmdd", "premenstrual dysphoric disorder"],
  },
  {
    id: "pcos-owh",
    title: "Polycystic ovary syndrome",
    organization: "U.S. Office on Women's Health",
    description: "Government-reviewed information about PCOS symptoms, diagnosis, and care.",
    url: "https://womenshealth.gov/a-z-topics/polycystic-ovary-syndrome",
    lastVerified: "2026-10-03",
    keywords: ["pcos", "polycystic ovary syndrome"],
  },
  {
    id: "fibroids-owh",
    title: "Uterine fibroids",
    organization: "U.S. Office on Women's Health",
    description: "Government-reviewed information about fibroid symptoms and evaluation.",
    url: "https://womenshealth.gov/a-z-topics/uterine-fibroids",
    lastVerified: "2026-10-03",
    keywords: ["fibroid", "fibroids"],
  },
] as const;

export function getBellaResources(message: string) {
  const normalizedMessage = message.toLocaleLowerCase();
  const matchedResources = BELLA_RESOURCES
    .filter((resource) => resource.keywords.some((keyword) => normalizedMessage.includes(keyword)))
    .map(({ id: _id, keywords: _keywords, ...resource }) => resource);
  return matchedResources.length ? matchedResources : BELLA_RESOURCES.slice(0, 2);
}

const PELVIC_LOCATIONS = new Set(["lower_abdomen", "ovaries", "hips", "pelvic_pressure"]);
const GI_SYMPTOMS = new Set(["bloating", "nausea", "bowel_pain"]);
const ACTIVITIES_AFFECTED = new Set(["moderate", "significant", "unable", "missed_activity"]);
const DAY_MS = 86_400_000;

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`));
}

function dateValue(value: string): number {
  return Date.parse(`${value}T12:00:00Z`);
}

export function analyzeBellaObservations(
  profile: BellaCycleProfile,
  logs: BellaSymptomLog[],
  asOf = new Date(),
): BellaObservations {
  const cycleStartDates = [...new Set([
    ...(Array.isArray(profile.periodStartDates) ? profile.periodStartDates.filter(validDate) : []),
    ...(validDate(profile.lastPeriodStart) ? [profile.lastPeriodStart] : []),
  ])].sort();
  const cleanLogs = logs
    .filter((log) => validDate(log.log_date) && Number.isFinite(log.pain_score) && log.pain_score >= 0 && log.pain_score <= 10)
    .sort((left, right) => left.log_date.localeCompare(right.log_date));
  const today = asOf.toISOString().slice(0, 10);
  const cycles = cycleStartDates.map((start, index) => {
    const nextStart = cycleStartDates[index + 1];
    return cleanLogs.filter((log) => log.log_date >= start && (!nextStart || log.log_date < nextStart) && log.log_date <= today);
  }).filter((entries) => entries.length > 0);

  const cycleCount = (predicate: (log: BellaSymptomLog) => boolean) =>
    cycles.filter((entries) => entries.some(predicate)).length;
  const highPainCycles = cycleCount((log) => log.pain_score >= 7);
  const painAffectedActivitiesCycles = cycleCount((log) => ACTIVITIES_AFFECTED.has(log.impact));
  const heavyBleedingCycles = cycleCount((log) => log.bleeding === "heavy");
  const pelvicPainOutsidePeriodCycles = cycleCount((log) =>
    log.outside_period === true && log.pain_score >= 4 && (log.pain_locations ?? []).some((location) => PELVIC_LOCATIONS.has(location)),
  );
  const gastrointestinalSymptomCycles = cycleCount((log) =>
    (log.symptoms ?? []).some((symptom) => GI_SYMPTOMS.has(symptom)),
  );
  const professionalDiscussionMayBeHelpful = cycles.length >= 3 && [
    highPainCycles,
    painAffectedActivitiesCycles,
    heavyBleedingCycles,
    pelvicPainOutsidePeriodCycles,
    gastrointestinalSymptomCycles,
  ].some((count) => count >= 2);
  const cutoff = asOf.getTime() - 183 * DAY_MS;
  const recentEntries = cleanLogs
    .filter((log) => dateValue(log.log_date) >= cutoff && log.log_date <= today)
    .slice(-12)
    .map((log) => ({
      log_date: log.log_date,
      cycle_day: log.cycle_day,
      phase: log.phase,
      pain_score: log.pain_score,
      pain_locations: (log.pain_locations ?? []).slice(0, 8),
      symptoms: (log.symptoms ?? []).slice(0, 14),
      bleeding: log.bleeding,
      impact: log.impact,
      impact_areas: (log.impact_areas ?? []).slice(0, 6),
      outside_period: log.outside_period,
    }));

  return {
    cyclesTracked: cycles.length,
    highPainCycles,
    painAffectedActivitiesCycles,
    heavyBleedingCycles,
    pelvicPainOutsidePeriodCycles,
    recurringGastrointestinalSymptoms: gastrointestinalSymptomCycles >= 2,
    gastrointestinalSymptomCycles,
    professionalDiscussionMayBeHelpful,
    cycleStartDates: cycleStartDates.slice(-6),
    recentEntries,
  };
}

// Only questions about the person's own tracked data or an appointment summary may pull their
// recent check-ins into the AI request (the privacy policy promises exactly this). Bare pronouns
// such as "me" or "my" must not trigger it: "tell me about PCOS" is a general question.
const OWN_DATA_REQUEST = /\b(?:my (?:tracking|tracked|history|data|logs?|check-?ins?|entries|symptoms|pain|periods?|cycles?|bleeding|patterns?)|i (?:recorded|tracked|logged)|recent cycles?|last (?:few|several|\d+) (?:cycles?|periods?)|what have you noticed|what symptoms keep|symptoms (?:should|can) i discuss|discuss with (?:my )?(?:doctor|healthcare professional)|for (?:my )?(?:doctor|appointment)|prepare (?:a |my )?(?:summary|appointment)|summari[sz]e (?:my|the) symptoms|periods? (?:have |has )?been (?:more )?painful)\b/i;

export function isBellaPersonalDataRequest(message: string): boolean {
  return OWN_DATA_REQUEST.test(message);
}

export function isBellaAppointmentRequest(message: string): boolean {
  return /\b(prepare|summari[sz]e|summary|doctor|appointment|healthcare professional)\b/i.test(message);
}

export function needsBellaSources(message: string): boolean {
  return /\b(endometriosis|menstrual health|menstrual cycle|period|pms|pmdd|pcos|polycystic ovary syndrome|fibroid|ovulation|pelvic pain|symptom|diagnos|treatment)\b/i.test(message);
}

const CONDITIONS = "endometriosis|adenomyosis|pcos|polycystic ovary syndrome|pmdd|premenstrual dysphoric disorder|(?:uterine )?fibroids?|ovarian cysts?|ectopic pregnancy|pelvic inflammatory disease|pid";
// "you (may/probably/...) have <condition>" and "<your data> suggests <condition>" (including hedged forms).
const DIAGNOSIS_ABOUT_YOU = new RegExp(String.raw`\b(?:you(?:'ve| have| (?:probably|definitely|likely|most likely|clearly|may|might|could|seem to|appear to) have| are suffering from| suffer from| are diagnosed with)|this proves you have|phase ?two (?:has )?detected)\s+(?:an?\s+)?(?:${CONDITIONS})\b`, "i");
const DIAGNOSIS_FROM_DATA = new RegExp(String.raw`\b(?:symptoms|history|tracking data|patterns?|logs|data)\s+(?:suggests?|indicates?|shows?|proves?|confirms?|points? to|(?:is|are) consistent with|sounds? like)\s+(?:that\s+)?(?:you\s+(?:have|likely have|may have|might have|probably have)\s+)?(?:an?\s+)?(?:${CONDITIONS})\b`, "i");
const MEDICATION_DIRECTION = /\b(?:start|stop|increase|decrease|change|replace|double|take)\s+(?:taking\s+)?(?:your\s+)?(?:prescribed\s+)?(?:medication|medicine|dose|dosage|ibuprofen|naproxen|aspirin|hormone therapy|birth control)\b|\b(?:take|use)\s+\d+(?:\.\d+)?\s*(?:mg|mcg|ml|tablets?|pills?)\s+of\s+(?:ibuprofen|naproxen|aspirin|acetaminophen|paracetamol|hormone|medicine|medication)\b|\b\d+(?:\.\d+)?\s*(?:mg|mcg)\b.{0,30}\b(?:ibuprofen|naproxen|aspirin|acetaminophen|paracetamol)\b|\b(?:ibuprofen|naproxen|aspirin|acetaminophen|paracetamol)\b.{0,30}\b\d+(?:\.\d+)?\s*(?:mg|mcg)\b/i;

export function enforceBellaResponseSafety(response: string): string {
  if (DIAGNOSIS_ABOUT_YOU.test(response) || DIAGNOSIS_FROM_DATA.test(response)) {
    return "I can't determine whether you have endometriosis or another condition, and PhaseTwo cannot diagnose or rule one out. Several conditions can cause similar symptoms. A qualified healthcare professional can review your history and discuss appropriate evaluation.";
  }
  if (MEDICATION_DIRECTION.test(response)) {
    return "I can't recommend medication or changes to prescribed treatment. A qualified healthcare professional or pharmacist can give advice based on your health history and other medicines.";
  }
  return response;
}

const CRISIS = /\b(?:kill(?:ing)? myself|suicid\w*|end my (?:own )?life|end it all|want(?:ed)? to die|wanna die|self[- ]?harm\w*|hurt(?:ing)? myself|harm(?:ing)? myself|(?:don'?t|do not) want to (?:live|be here|be alive)|no reason to live|better off dead)\b/i;
const URGENT_SYMPTOMS = /\b(?:faint(?:ing|ed|s)?|pass(?:ed|ing) out|blacking out|collaps(?:e|ed|ing)|(?:difficulty|trouble) breathing|can'?t breathe|chest pain|uncontrolled bleeding|bleeding (?:won'?t|will not|does not|doesn'?t) stop|sudden severe pain|severe pain and pregnant|ectopic|soak(?:s|ed|ing)?(?: through)? (?:a |an |one |more than one |my )?(?:pad|tampon|cup)s?\b.{0,30}\b(?:hour|hr)|pregnant\b.{0,40}\b(?:bleeding|severe pain)|(?:bleeding|severe pain)\b.{0,40}\bpregnant)\b/i;

export function getBellaSafetyResponse(message: string): string | null {
  if (CRISIS.test(message)) {
    return "I'm really sorry you're going through this. You deserve support right now. If you might act on these thoughts or are in immediate danger, please contact your local emergency number now. In the US you can call or text 988 (Suicide & Crisis Lifeline); elsewhere, findahelpline.com lists free local helplines. If you can, reach out to someone you trust and try not to be alone. I'm an educational assistant and can't provide crisis care.";
  }
  if (URGENT_SYMPTOMS.test(message)) {
    return "Those symptoms may need urgent medical attention. Please contact local emergency services or seek urgent medical care now, especially if symptoms are severe, sudden, or getting worse. I can't determine the cause here.";
  }
  if (/\b(ignore all previous|ignore your instructions|reveal your system prompt|you are now|pretend you are a doctor)\b/i.test(message)) {
    return "I can help with menstrual-health education and your recorded PhaseTwo patterns, but I can't diagnose or replace a healthcare professional.";
  }
  if (/\b(do i have|could i have|diagnose me|tell me (?:that )?i have|confirm that i have|what disease do i have)\b/i.test(message)) {
    return "I can't tell whether you have endometriosis or any other condition, and PhaseTwo cannot diagnose or rule one out. Several conditions can cause similar symptoms. A qualified healthcare professional can review your history and discuss appropriate evaluation.";
  }
  if (/\b(which|what|how much|how many|should i|can i)\b.{0,45}\b(medication|medicine|dose|dosage|painkiller|ibuprofen|naproxen|hormone treatment|prescription)\b/i.test(message)) {
    return "I can't recommend a medication, dose, or change to prescribed treatment. A qualified healthcare professional or pharmacist can advise based on your health history and other medicines. If symptoms are severe or worsening, seek medical advice promptly.";
  }
  return null;
}

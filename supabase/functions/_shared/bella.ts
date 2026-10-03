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

export function isBellaPersonalDataRequest(message: string): boolean {
  return /\b(my|mine|me|i recorded|i tracked|my tracking|my history|recent cycles?|last (?:few|several|\d+) (?:cycles?|periods?)|how often|what have you noticed|what symptoms keep|my symptoms|symptoms (?:should|can) i discuss|discuss with (?:my )?(?:doctor|healthcare professional)|for (?:my )?(?:doctor|appointment)|prepare (?:a |my )?(?:summary|appointment)|summari[sz]e (?:my|the) symptoms|periods? been (?:more )?painful)\b/i.test(message);
}

export function isBellaAppointmentRequest(message: string): boolean {
  return /\b(prepare|summari[sz]e|summary|doctor|appointment|healthcare professional)\b/i.test(message);
}

export function needsBellaSources(message: string): boolean {
  return /\b(endometriosis|menstrual health|menstrual cycle|period|pms|pmdd|pcos|polycystic ovary syndrome|fibroid|ovulation|pelvic pain|symptom|diagnos|treatment)\b/i.test(message);
}

export function enforceBellaResponseSafety(response: string): string {
  const diagnosisClaim = /\b(?:you (?:have|definitely have|probably have|likely have)|you are suffering from|this proves you have|phase ?two (?:has )?detected|your symptoms (?:prove|confirm|show|indicate) you have|(?:your symptoms|your history|your tracking data) (?:suggest|indicate|show|prove|confirm) (?:that )?you have)\s*(?:endometriosis|(?:a|an)\s+[a-z-]+(?: disease| condition)?)\b/i;
  const medicationDirection = /\b(?:start|stop|increase|decrease|change|replace|double|take)\s+(?:taking\s+)?(?:your\s+)?(?:prescribed\s+)?(?:medication|medicine|dose|dosage|ibuprofen|naproxen|aspirin|hormone therapy|birth control)\b|\b(?:take|use)\s+\d+(?:\.\d+)?\s*(?:mg|mcg|ml|tablets?|pills?)\s+of\s+(?:ibuprofen|naproxen|aspirin|acetaminophen|paracetamol|hormone|medicine|medication)\b/i;
  if (diagnosisClaim.test(response)) {
    return "I can't determine whether you have endometriosis or another condition, and PhaseTwo cannot diagnose or rule one out. Several conditions can cause similar symptoms. A qualified healthcare professional can review your history and discuss appropriate evaluation.";
  }
  if (medicationDirection.test(response)) {
    return "I can't recommend medication or changes to prescribed treatment. A qualified healthcare professional or pharmacist can give advice based on your health history and other medicines.";
  }
  return response;
}

export function getBellaSafetyResponse(message: string): string | null {
  if (/\b(fainting|passed out|difficulty breathing|uncontrolled bleeding|sudden severe pain|severe pain and pregnant)\b/i.test(message)) {
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

import type { CycleProfile, Phase } from "../types";
import { currentCycleDay, phaseForDay } from "./cycleUtils";
import { hasSupabaseConfig, supabase } from "./supabase";
import { LOCAL_GUEST_ID } from "./storage";

export type PainLocation =
  | "lower_abdomen"
  | "lower_back"
  | "ovaries"
  | "breasts"
  | "hips"
  | "pelvic_pressure"
  | "headache"
  | "other";

export type Symptom =
  | "cramps"
  | "bloating"
  | "fatigue"
  | "mood_changes"
  | "headache"
  | "nausea"
  | "insomnia"
  | "breast_tenderness"
  | "brain_fog"
  | "acne"
  | "anxiety"
  | "bowel_pain"
  | "urination_pain"
  | "other";

export type Bleeding = "none" | "light" | "medium" | "heavy";
export type Impact = "none" | "mild" | "moderate" | "significant" | "unable" | "some" | "missed_activity";
export type ImpactArea = "school" | "work" | "exercise" | "sleep" | "social" | "responsibilities";

export interface SymptomLog {
  id?: string;
  user_id?: string;
  log_date: string;
  cycle_day: number;
  phase: Phase;
  pain_score: number;
  pain_locations: PainLocation[];
  symptoms: Symptom[];
  bleeding: Bleeding | null;
  impact: Impact;
  impact_areas?: ImpactArea[];
  outside_period?: boolean | null;
  painkillers_helped?: boolean | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const PAIN_LOCATION_OPTIONS: PainLocation[] = [
  "lower_abdomen",
  "lower_back",
  "ovaries",
  "breasts",
  "hips",
  "pelvic_pressure",
  "headache",
  "other",
];

export const PAIN_LOCATION_LABELS: Record<PainLocation, string> = {
  lower_abdomen: "Lower abdomen",
  lower_back: "Lower back",
  ovaries: "Ovaries",
  breasts: "Breasts",
  hips: "Hips",
  pelvic_pressure: "Pelvic pressure",
  headache: "Headache",
  other: "Other",
};

export const SYMPTOM_OPTIONS: Symptom[] = [
  "cramps",
  "bloating",
  "fatigue",
  "mood_changes",
  "headache",
  "nausea",
  "insomnia",
  "breast_tenderness",
  "brain_fog",
  "acne",
  "anxiety",
  "bowel_pain",
  "urination_pain",
  "other",
];

export const SYMPTOM_LABELS: Record<Symptom, string> = {
  cramps: "Cramps",
  bloating: "Bloating",
  fatigue: "Fatigue",
  mood_changes: "Mood changes",
  headache: "Headache",
  nausea: "Nausea",
  insomnia: "Trouble sleeping",
  breast_tenderness: "Breast tenderness",
  brain_fog: "Brain fog",
  acne: "Breakouts",
  anxiety: "Anxiety",
  bowel_pain: "Pain with bowel movements",
  urination_pain: "Pain with urination",
  other: "Other",
};

export const BLEEDING_OPTIONS: Bleeding[] = ["none", "light", "medium", "heavy"];
export const BLEEDING_LABELS: Record<Bleeding, string> = {
  none: "None",
  light: "Light",
  medium: "Medium",
  heavy: "Heavy",
};

export const IMPACT_OPTIONS: Impact[] = ["none", "mild", "moderate", "significant", "unable"];
export const IMPACT_AREA_OPTIONS: ImpactArea[] = ["school", "work", "exercise", "sleep", "social", "responsibilities"];
export const IMPACT_AREA_LABELS: Record<ImpactArea, string> = {
  school: "School",
  work: "Work",
  exercise: "Exercise",
  sleep: "Sleep",
  social: "Social activities",
  responsibilities: "Daily responsibilities",
};
export const IMPACT_LABELS: Record<Impact, string> = {
  none: "No impact",
  mild: "Mild disruption",
  moderate: "Moderate disruption",
  significant: "Significant disruption",
  unable: "Unable to do usual activities",
  some: "Mild disruption",
  missed_activity: "Significant disruption",
};

export interface SymptomPatternSummary {
  cyclesReviewed: number;
  recurringCycles: number;
  patterns: string[];
  recommendEvaluation: boolean;
}

const BOWEL_OR_URINARY_SYMPTOMS = new Set(["bowel_pain", "urination_pain"]);
const GASTROINTESTINAL_SYMPTOMS = new Set(["bloating", "nausea", ...BOWEL_OR_URINARY_SYMPTOMS]);
const PELVIC_PAIN_LOCATIONS = new Set(["lower_abdomen", "ovaries", "hips", "pelvic_pressure"]);

function isMeaningfulImpact(impact: Impact): boolean {
  return ["moderate", "significant", "unable", "missed_activity"].includes(impact);
}

export function analyzeSymptomPatterns(
  logs: SymptomLog[],
  profile: CycleProfile
): SymptomPatternSummary {
  const cycleLength = Math.max(1, profile.cycleLength || 28);
  const anchor = new Date(`${profile.lastPeriodStart}T12:00:00`).getTime();
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const groups = new Map<number, SymptomLog[]>();

  for (const log of logs) {
    const date = new Date(`${log.log_date}T12:00:00`).getTime();
    if (!Number.isFinite(date) || !Number.isFinite(anchor)) continue;
    const cycleIndex = Math.floor((date - anchor) / (millisecondsPerDay * cycleLength));
    groups.set(cycleIndex, [...(groups.get(cycleIndex) ?? []), log]);
  }

  const cycles = [...groups.entries()]
    .sort(([left], [right]) => right - left)
    .slice(0, 3)
    .map(([, entries]) => entries);

  if (cycles.length < 3) {
    return { cyclesReviewed: cycles.length, recurringCycles: 0, patterns: [], recommendEvaluation: false };
  }

  const repeated = (matches: (entry: SymptomLog) => boolean) =>
    cycles.filter((entries) => entries.some(matches)).length;
  const patterns: string[] = [];
  const recurringIndicators = [
    { label: "high pain", test: (entry: SymptomLog) => entry.pain_score >= 7 },
    { label: "daily activities affected", test: (entry: SymptomLog) => isMeaningfulImpact(entry.impact) },
    { label: "heavy bleeding", test: (entry: SymptomLog) => entry.bleeding === "heavy" },
    {
      label: "symptoms outside bleeding days",
      test: (entry: SymptomLog) => entry.outside_period === true && entry.pain_score >= 4 && (entry.pain_locations ?? []).some((location) => PELVIC_PAIN_LOCATIONS.has(location)),
    },
    {
      label: "digestive, bowel, or urinary symptoms",
      test: (entry: SymptomLog) => (entry.symptoms ?? []).some((symptom) => GASTROINTESTINAL_SYMPTOMS.has(symptom)),
    },
  ];

  for (const indicator of recurringIndicators) {
    if (repeated(indicator.test) >= 2) patterns.push(indicator.label);
  }

  const averagePainByCycle = cycles.map((entries) =>
    entries.reduce((total, entry) => total + entry.pain_score, 0) / Math.max(1, entries.length)
  );
  if (averagePainByCycle[0] >= averagePainByCycle[1] && averagePainByCycle[0] - averagePainByCycle[2] >= 2) {
    patterns.push("pain increasing over the reviewed cycles");
  }

  const impactRank: Record<Impact, number> = {
    none: 0,
    mild: 1,
    some: 1,
    moderate: 2,
    significant: 3,
    missed_activity: 3,
    unable: 4,
  };
  const maximumImpactByCycle = cycles.map((entries) => Math.max(0, ...entries.map((entry) => impactRank[entry.impact] ?? 0)));
  if (maximumImpactByCycle[0] >= maximumImpactByCycle[1] && maximumImpactByCycle[0] - maximumImpactByCycle[2] >= 2) {
    patterns.push("daily-life disruption increasing over the reviewed cycles");
  }

  const recurringCycles = cycles.filter((entries) =>
    entries.some((entry) => entry.pain_score > 0 || (entry.symptoms ?? []).length > 0 || isMeaningfulImpact(entry.impact))
  ).length;

  if (patterns.length >= 2) patterns.push("more than one recurring symptom pattern");

  return {
    cyclesReviewed: cycles.length,
    recurringCycles,
    patterns,
    recommendEvaluation: patterns.length > 0,
  };
}

export function formatDateKey(date: string | Date): string {
  const input = typeof date === "string" ? date : new Date(date);
  const value = new Date(input instanceof Date ? input : `${input}T12:00:00`);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildSymptomLogMeta(
  logDate: string | Date,
  profile: CycleProfile
): Pick<SymptomLog, "log_date" | "cycle_day" | "phase"> {
  const dateKey = formatDateKey(logDate);
  const cycleDay = currentCycleDay(profile, new Date(`${dateKey}T12:00:00`));
  const phase = phaseForDay(cycleDay, profile.cycleLength).key;
  return { log_date: dateKey, cycle_day: cycleDay, phase };
}

export function buildEmptySymptomLog(
  profile: CycleProfile,
  date: string | Date = new Date()
): SymptomLog {
  const meta = buildSymptomLogMeta(date, profile);
  return {
    ...meta,
    pain_score: 0,
    pain_locations: [],
    symptoms: [],
    bleeding: "none",
    impact: "none",
    notes: "",
  };
}

export function hasRemoteSymptomStorage(userId?: string): boolean {
  return hasSupabaseConfig && userId !== LOCAL_GUEST_ID;
}

function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocalStorage<T>(key: string, value: T): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures and continue in memory.
  }
}

function getSupabaseClient(userId: string) {
  return hasRemoteSymptomStorage(userId) ? supabase : null;
}

export async function fetchLogs(userId: string, sinceDate?: string | Date): Promise<SymptomLog[]> {
  const client = getSupabaseClient(userId);
  if (!userId) {
    return [];
  }

  if (!client) {
    const fromDate = sinceDate ? formatDateKey(sinceDate) : "1970-01-01";
    const storageKey = `phasetwo:symptom-logs:${userId}`;
    const logs = readLocalStorage<SymptomLog[]>(storageKey, []);
    return logs.filter((log) => log.log_date >= fromDate).sort((a, b) => b.log_date.localeCompare(a.log_date));
  }

  const fromDate = sinceDate ? formatDateKey(sinceDate) : "1970-01-01";
  const logs: SymptomLog[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("symptom_logs")
      .select("*")
      .eq("user_id", userId)
      .gte("log_date", fromDate)
      .order("log_date", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    logs.push(...((data ?? []) as SymptomLog[]));
    if (!data || data.length < pageSize) break;
  }

  return logs;
}

export async function upsertLog(userId: string, log: Partial<SymptomLog>): Promise<SymptomLog> {
  const client = getSupabaseClient(userId);
  if (!userId) {
    throw new Error("A user id is required to save a symptom log.");
  }

  const payload: Partial<SymptomLog> = {
    ...log,
    user_id: userId,
    log_date: log.log_date ?? formatDateKey(new Date()),
    cycle_day: log.cycle_day ?? 1,
    phase: log.phase ?? "follicular",
    pain_score: Number(log.pain_score ?? 0),
    pain_locations: log.pain_locations ?? [],
    symptoms: log.symptoms ?? [],
    bleeding: log.bleeding ?? null,
    impact: log.impact ?? "none",
    impact_areas: log.impact_areas ?? [],
    outside_period: log.outside_period ?? false,
    notes: log.notes?.trim() ? log.notes.trim() : null,
  };

  if (!client) {
    const storageKey = `phasetwo:symptom-logs:${userId}`;
    const current = readLocalStorage<SymptomLog[]>(storageKey, []);
    const updated = [...current.filter((entry) => entry.log_date !== payload.log_date), payload as SymptomLog];
    updated.sort((a, b) => b.log_date.localeCompare(a.log_date));
    writeLocalStorage(storageKey, updated);
    return payload as SymptomLog;
  }

  const { data, error } = await client
    .from("symptom_logs")
    .upsert(payload, { onConflict: "user_id,log_date" })
    .select()
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? payload) as SymptomLog;
}

export async function deleteAllSymptomLogs(userId: string): Promise<void> {
  if (!userId) throw new Error("A user id is required to delete symptom history.");

  const client = getSupabaseClient(userId);
  if (!client) {
    try {
      globalThis.localStorage?.removeItem(`phasetwo:symptom-logs:${userId}`);
    } catch {
      throw new Error("Unable to access local symptom storage.");
    }
    return;
  }

  const { error } = await client.from("symptom_logs").delete().eq("user_id", userId);
  if (error) throw error;
}

export async function saveUserConsent(userId: string, policyVersion = "v1"): Promise<void> {
  const client = getSupabaseClient(userId);
  if (!userId) {
    return;
  }

  if (!client) {
    const storageKey = "phasetwo:user-consents";
    const current = readLocalStorage<Record<string, { user_id: string; policy_version: string; health_data_consent_at: string }>>(storageKey, {});
    current[userId] = {
      user_id: userId,
      policy_version: policyVersion,
      health_data_consent_at: new Date().toISOString(),
    };
    writeLocalStorage(storageKey, current);
    return;
  }

  const { error } = await client.from("user_consents").upsert(
    {
      user_id: userId,
      health_data_consent_at: new Date().toISOString(),
      policy_version: policyVersion,
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw error;
  }
}

export async function hasUserConsented(userId: string): Promise<boolean> {
  const client = getSupabaseClient(userId);
  if (!userId) {
    return false;
  }

  if (!client) {
    const storageKey = "phasetwo:user-consents";
    const consent = readLocalStorage<Record<string, { user_id: string }>>(storageKey, {});
    return Boolean(consent[userId]?.user_id);
  }

  const { data, error } = await client
    .from("user_consents")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  return Boolean(data?.user_id);
}

export function getLocalUserId(): string {
  if (typeof window === "undefined") {
    return "local-user";
  }

  const key = "phasetwo:user-id";
  const existing = window.localStorage.getItem(key);
  if (existing) {
    return existing;
  }

  const next = crypto.randomUUID();
  window.localStorage.setItem(key, next);
  return next;
}

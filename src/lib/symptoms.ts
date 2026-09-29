import type { CycleProfile, Phase } from "../types";
import { currentCycleDay, phaseForDay } from "./cycleUtils";
import { hasSupabaseConfig, supabase } from "./supabase";

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
  | "other";

export type Bleeding = "none" | "light" | "medium" | "heavy";
export type Impact = "none" | "some" | "missed_activity";

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
  other: "Other",
};

export const BLEEDING_OPTIONS: Bleeding[] = ["none", "light", "medium", "heavy"];
export const BLEEDING_LABELS: Record<Bleeding, string> = {
  none: "None",
  light: "Light",
  medium: "Medium",
  heavy: "Heavy",
};

export const IMPACT_OPTIONS: Impact[] = ["none", "some", "missed_activity"];
export const IMPACT_LABELS: Record<Impact, string> = {
  none: "Not really",
  some: "A bit",
  missed_activity: "It got in the way",
};

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

export function hasRemoteSymptomStorage(): boolean {
  return hasSupabaseConfig;
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

function getSupabaseClient() {
  return hasRemoteSymptomStorage() ? supabase : null;
}

export async function fetchLogs(userId: string, sinceDate?: string | Date): Promise<SymptomLog[]> {
  const client = getSupabaseClient();
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
  const { data, error } = await client
    .from("symptom_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("log_date", fromDate)
    .order("log_date", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as SymptomLog[];
}

export async function upsertLog(userId: string, log: Partial<SymptomLog>): Promise<SymptomLog> {
  const client = getSupabaseClient();
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

export async function saveUserConsent(userId: string, policyVersion = "v1"): Promise<void> {
  const client = getSupabaseClient();
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
  const client = getSupabaseClient();
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

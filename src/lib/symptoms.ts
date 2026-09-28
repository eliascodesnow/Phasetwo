import { createClient } from "@supabase/supabase-js";
import type { CycleProfile, Phase } from "../types";
import { currentCycleDay, phaseForDay } from "./cycleUtils";

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

function getSupabaseClient() {
  const url = import.meta.env.VITE_SUPABASE_URL ?? "";
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function fetchLogs(userId: string, sinceDate?: string | Date): Promise<SymptomLog[]> {
  const client = getSupabaseClient();
  if (!userId || !client) {
    return [];
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
  if (!userId || !client) {
    throw new Error("Supabase client is not configured for symptom logging.");
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
  if (!userId || !client) {
    throw new Error("Supabase client is not configured for consent storage.");
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
  if (!userId || !client) {
    return false;
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

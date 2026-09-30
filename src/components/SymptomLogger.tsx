import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, HeartPulse, Loader2, ShieldCheck } from "lucide-react";
import { buildEmptySymptomLog, buildSymptomLogMeta, deleteAllSymptomLogs, fetchLogs, hasRemoteSymptomStorage, hasUserConsented, saveUserConsent, upsertLog, type PainLocation, type Symptom, type SymptomLog, IMPACT_AREA_LABELS, IMPACT_AREA_OPTIONS, IMPACT_LABELS, IMPACT_OPTIONS, PAIN_LOCATION_LABELS, PAIN_LOCATION_OPTIONS, SYMPTOM_LABELS, SYMPTOM_OPTIONS, BLEEDING_LABELS, BLEEDING_OPTIONS } from "../lib/symptoms";
import type { CycleProfile } from "../types";
import { currentCycleDay, phaseForDay } from "../lib/cycleUtils";

const PAIN_ANCHORS = [
  { value: 0, label: "none" },
  { value: 5, label: "distracting" },
  { value: 8, label: "can't ignore it" },
  { value: 10, label: "worst" },
] as const;

const PHASE_BADGE: Record<string, string> = {
  menstrual: "bg-phase-menstrual-bg text-phase-menstrual-text",
  follicular: "bg-phase-follicular-bg text-phase-follicular-text",
  ovulatory: "bg-phase-ovulatory-bg text-phase-ovulatory-text",
  luteal: "bg-phase-luteal-bg text-phase-luteal-text",
};

function clampArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatShortDay(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function isSelected<T extends string>(values: T[] | undefined, value: T): boolean {
  return clampArray(values).includes(value);
}

export function SymptomLogger({ profile, userId, onHistoryChange }: { profile: CycleProfile; userId: string; onHistoryChange?: (logs: SymptomLog[]) => void }) {
  const todayKey = formatDateKey(new Date());
  const remoteStorageEnabled = useMemo(() => hasRemoteSymptomStorage(), []);
  const [log, setLog] = useState<SymptomLog>(() => buildEmptySymptomLog(profile, todayKey));
  const [history, setHistory] = useState<SymptomLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [consentGranted, setConsentGranted] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);

  useEffect(() => {
    onHistoryChange?.(history);
  }, [history, onHistoryChange]);

  const phaseMeta = useMemo(
    () => phaseForDay(log.cycle_day || currentCycleDay(profile, new Date()), profile.cycleLength),
    [log.cycle_day, profile]
  );

  useEffect(() => {
    let ignore = false;

    async function loadData() {
      setLoading(true);
      try {
        const [entries, hasConsent] = await Promise.all([
          fetchLogs(userId),
          hasUserConsented(userId),
        ]);

        if (ignore) return;

        setHistory(entries);
        const todayEntry = entries.find((entry) => entry.log_date === todayKey) ?? buildEmptySymptomLog(profile, todayKey);
        setLog({
          ...todayEntry,
          notes: todayEntry.notes ?? "",
          pain_locations: clampArray(todayEntry.pain_locations),
          symptoms: clampArray(todayEntry.symptoms),
          bleeding: todayEntry.bleeding ?? "none",
          impact: todayEntry.impact === "some" ? "mild" : todayEntry.impact === "missed_activity" ? "significant" : todayEntry.impact ?? "none",
          impact_areas: clampArray(todayEntry.impact_areas),
          outside_period: todayEntry.outside_period ?? false,
        });
        setConsentGranted(!remoteStorageEnabled || hasConsent);
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load symptom history.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadData();
    return () => {
      ignore = true;
    };
  }, [profile, todayKey, userId]);

  function updateLog<K extends keyof SymptomLog>(key: K, value: SymptomLog[K]) {
    setLog((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function toggleMultiSelect<K extends "pain_locations" | "symptoms">(key: K, value: K extends "pain_locations" ? PainLocation : Symptom) {
    setLog((current) => {
      const values = clampArray(current[key] as string[] | undefined) as Array<PainLocation | Symptom>;
      const next = values.includes(value as never)
        ? values.filter((entry) => entry !== value)
        : [...values, value];

      return {
        ...current,
        [key]: next,
      };
    });
  }

  const saveCurrentLog = async () => {
    const finalLog = {
      ...log,
      log_date: log.log_date || todayKey,
      cycle_day: log.cycle_day || currentCycleDay(profile, new Date()),
      phase: log.phase || phaseForDay(log.cycle_day || currentCycleDay(profile, new Date()), profile.cycleLength).key,
      pain_score: Number(log.pain_score ?? 0),
      pain_locations: clampArray(log.pain_locations),
      symptoms: clampArray(log.symptoms),
      bleeding: log.bleeding ?? "none",
      impact: log.impact ?? "none",
      impact_areas: clampArray(log.impact_areas),
      outside_period: log.outside_period ?? false,
      notes: log.notes?.trim() || null,
    } as SymptomLog;

    const payload = {
      ...finalLog,
      ...buildSymptomLogMeta(finalLog.log_date, profile),
      user_id: userId,
      notes: finalLog.notes,
    };

    const optimistic = { ...payload, created_at: new Date().toISOString() };

    setHistory((prev) => {
      const filtered = prev.filter((entry) => entry.log_date !== payload.log_date);
      return [optimistic, ...filtered].sort((a, b) => b.log_date.localeCompare(a.log_date));
    });
    setError("");

    try {
      setSaving(true);
      const saved = await upsertLog(userId, payload);
      setHistory((prev) => {
        const filtered = prev.filter((entry) => entry.log_date !== payload.log_date);
        return [saved, ...filtered].sort((a, b) => b.log_date.localeCompare(a.log_date));
      });
      setLog({ ...saved, notes: saved.notes ?? "", pain_locations: clampArray(saved.pain_locations), symptoms: clampArray(saved.symptoms), bleeding: saved.bleeding ?? "none", impact: saved.impact ?? "none", impact_areas: clampArray(saved.impact_areas), outside_period: saved.outside_period ?? false });
    } catch (saveError) {
      setHistory((prev) => prev.filter((entry) => entry.log_date !== payload.log_date));
      setError(saveError instanceof Error ? saveError.message : "Unable to save your symptom check-in.");
    } finally {
      setSaving(false);
    }
  };

  async function handleSave() {
    if (remoteStorageEnabled && !consentGranted) {
      setConsentOpen(true);
      return;
    }
    await saveCurrentLog();
  }

  async function handleConsentAccept() {
    try {
      await saveUserConsent(userId, "v1");
      setConsentGranted(true);
      setConsentOpen(false);
      await saveCurrentLog();
    } catch (saveConsentError) {
      setError(saveConsentError instanceof Error ? saveConsentError.message : "Please try again in a moment.");
      setConsentOpen(false);
    }
  }

  async function handleDeleteHistory() {
    if (!window.confirm("Delete all symptom logs from your PhaseTwo history? This cannot be undone.")) return;
    try {
      setSaving(true);
      await deleteAllSymptomLogs(userId);
      setHistory([]);
      setLog(buildEmptySymptomLog(profile, todayKey));
      setError("");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete your symptom history.");
    } finally {
      setSaving(false);
    }
  }

  const strip = useMemo(() => {
    const start = addDays(new Date(), -13);
    return Array.from({ length: 14 }, (_, index) => {
      const date = addDays(start, index);
      const key = formatDateKey(date);
      const entry = history.find((item) => item.log_date === key);
      return { key, label: formatShortDay(date), pain: entry?.pain_score ?? null };
    });
  }, [history]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-card">
      <div className="flex items-start justify-between gap-3 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sage-light text-sage">
            <HeartPulse className="h-4 w-4" strokeWidth={2.1} />
          </div>
          <div>
            <p className="font-display text-lg font-semibold text-zinc-900">Period & pain status</p>
            <p className="text-xs text-zinc-500">Your daily menstrual-health check-in</p>
          </div>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${PHASE_BADGE[phaseMeta.key]}`}>
          {phaseMeta.label}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your recent symptoms...
        </div>
      ) : (
        <>
          <div className="space-y-5">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium text-zinc-700">
                <span className="flex items-center gap-2"><CalendarRange className="h-4 w-4 text-sage" strokeWidth={2.1} />Today</span>
                <span className="tabular text-zinc-500">Day {log.cycle_day || currentCycleDay(profile, new Date())}</span>
              </div>

              <label htmlFor="pain-score" className="flex items-center justify-between text-sm text-zinc-700">
                <span>Pain</span>
                <span className="tabular font-semibold text-zinc-900">{log.pain_score}/10</span>
              </label>
              <input
                id="pain-score"
                type="range"
                min={0}
                max={10}
                step={1}
                value={log.pain_score}
                onChange={(event) => updateLog("pain_score", Number(event.target.value))}
                className="mt-3 h-2 w-full accent-[#4A6B5D]"
                aria-label="Pain score from 0 to 10"
              />
              <div className="mt-2 grid grid-cols-4 gap-1 text-[10px] text-zinc-500">
                {PAIN_ANCHORS.map((mark) => (
                  <div key={mark.value} className="text-left">
                    <span className="tabular font-medium text-zinc-700">{mark.value}</span>
                    <span className="ml-1 text-zinc-500">{mark.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-zinc-700">Where did it hurt?</p>
              <div className="flex flex-wrap gap-2">
                {PAIN_LOCATION_OPTIONS.map((option) => {
                  const selected = isSelected(log.pain_locations, option);
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleMultiSelect("pain_locations", option)}
                      className={`min-h-[42px] rounded-full border px-3 py-2 text-sm transition-colors ${selected ? "border-sage bg-sage-light text-sage-dark" : "border-zinc-200 bg-white text-zinc-600"}`}
                    >
                      {PAIN_LOCATION_LABELS[option]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-zinc-700">What other symptoms showed up?</p>
              <div className="flex flex-wrap gap-2">
                {SYMPTOM_OPTIONS.map((option) => {
                  const selected = isSelected(log.symptoms, option);
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleMultiSelect("symptoms", option)}
                      className={`min-h-[42px] rounded-full border px-3 py-2 text-sm transition-colors ${selected ? "border-sage bg-sage-light text-sage-dark" : "border-zinc-200 bg-white text-zinc-600"}`}
                    >
                      {SYMPTOM_LABELS[option]}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex min-h-11 items-start gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={log.outside_period === true} onChange={(event) => updateLog("outside_period", event.target.checked)} className="mt-0.5 accent-[#4A6B5D]" />
              Symptoms happened on a day I was not bleeding
            </label>

            <div className="space-y-3">
              <p className="text-sm font-medium text-zinc-700">Bleeding</p>
              <div className="flex flex-wrap gap-2">
                {BLEEDING_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={log.bleeding === option}
                    onClick={() => updateLog("bleeding", option)}
                    className={`min-h-[42px] rounded-full border px-3 py-2 text-sm ${log.bleeding === option ? "border-sage bg-sage-light text-sage-dark" : "border-zinc-200 bg-white text-zinc-600"}`}
                  >
                    {BLEEDING_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-zinc-700">Did it get in the way of your day?</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {IMPACT_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={log.impact === option}
                    className={`min-h-[48px] rounded-xl border px-3 py-2 text-sm ${log.impact === option ? "border-sage bg-sage-light text-sage-dark" : "border-zinc-200 bg-white text-zinc-600"}`}
                    onClick={() => updateLog("impact", option)}
                  >
                    {IMPACT_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-zinc-700">What areas of life were affected? <span className="font-normal text-zinc-400">(Optional)</span></p>
              <div className="flex flex-wrap gap-2">
                {IMPACT_AREA_OPTIONS.map((area) => {
                  const selected = clampArray(log.impact_areas).includes(area);
                  return (
                    <button key={area} type="button" aria-pressed={selected} onClick={() => updateLog("impact_areas", selected ? clampArray(log.impact_areas).filter((item) => item !== area) : [...clampArray(log.impact_areas), area])} className={`min-h-[42px] rounded-full border px-3 py-2 text-sm ${selected ? "border-sage bg-sage-light text-sage-dark" : "border-zinc-200 bg-white text-zinc-600"}`}>
                      {IMPACT_AREA_LABELS[area]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="symptom-note" className="text-sm font-medium text-zinc-700">
                Notes (optional)
              </label>
              <textarea
                id="symptom-note"
                rows={3}
                value={log.notes ?? ""}
                onChange={(event) => updateLog("notes", event.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-700 placeholder:text-zinc-400 focus:border-sage focus:outline-none"
                placeholder="Anything that felt different today?"
              />
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-[0.1em] text-zinc-500">
                <span>Recent pain</span>
                <span>14-day</span>
              </div>
              <div className="grid grid-cols-7 gap-2 sm:grid-cols-14">
                {strip.map(({ key, label, pain }) => (
                  <div key={key} className="flex flex-col items-center gap-1">
                    <div className="flex h-12 w-full items-end justify-center rounded-md bg-zinc-100 px-1 py-1">
                      <div
                        className={`w-full rounded-sm ${pain === null ? "bg-zinc-200" : "bg-[#4A6B5D]"}`}
                        style={{ height: pain === null ? "18%" : `${Math.max(18, pain * 9)}%` }}
                        title={pain === null ? "No entry" : `${pain}/10 pain`}
                      />
                    </div>
                    <span className="text-[9px] text-zinc-500">{label.split(" ")[0]}</span>
                  </div>
                ))}
              </div>
            </div>

            {error ? (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" strokeWidth={2.2} />
                <span>{error}</span>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <ShieldCheck className="h-4 w-4 text-sage" strokeWidth={2.1} />
                Private to your account; not used for advertising
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => void handleDeleteHistory()} disabled={saving || history.length === 0} className="min-h-[44px] rounded-xl border border-zinc-200 px-3 py-2.5 text-xs font-medium text-zinc-600 disabled:opacity-50">Delete symptom history</button>
                <button type="button" onClick={handleSave} disabled={saving} className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-sage px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-70">
                  {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Save today"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {consentOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/35 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="consent-title" className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-card">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sage-light text-sage">
                <ShieldCheck className="h-5 w-5" strokeWidth={2.1} />
              </div>
              <div>
                <h2 id="consent-title" className="font-display text-lg font-semibold text-zinc-900">Health data consent</h2>
                <p className="text-xs text-zinc-500">Before your first symptom log</p>
              </div>
            </div>

            <p className="text-sm leading-6 text-zinc-700">
              PhaseTwo stores your daily pain, location, symptoms, bleeding, impact, and optional notes in your personal cycle log so you can spot patterns over time.
            </p>
            <p className="mt-3 text-sm leading-6 text-zinc-700">
              This is only stored with your account for cycle tracking. You can review the privacy policy here: <a href="#" className="font-medium text-sage underline underline-offset-2">Privacy policy</a>.
            </p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setConsentOpen(false)} className="min-h-[44px] rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600">
                Not now
              </button>
              <button type="button" onClick={handleConsentAccept} className="min-h-[44px] rounded-xl bg-sage px-4 py-2 text-sm font-medium text-white">
                I agree
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

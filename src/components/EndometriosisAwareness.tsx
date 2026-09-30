import { useEffect, useState } from "react";
import { BookOpen, ClipboardList, Copy, ExternalLink, HeartHandshake, X } from "lucide-react";
import type { CycleProfile } from "../types";
import {
  analyzeSymptomPatterns,
  BLEEDING_LABELS,
  IMPACT_AREA_LABELS,
  IMPACT_LABELS,
  PAIN_LOCATION_LABELS,
  SYMPTOM_LABELS,
  type SymptomLog,
} from "../lib/symptoms";
import {
  ENDOMETRIOSIS_FACTS,
  ENDOMETRIOSIS_RESOURCES,
  MEDICAL_DISCLAIMER,
} from "../lib/endoContent";

function getCycleGroups(logs: SymptomLog[], profile: CycleProfile): SymptomLog[][] {
  const anchor = new Date(`${profile.lastPeriodStart}T12:00:00`).getTime();
  const cycleMs = Math.max(1, profile.cycleLength || 28) * 24 * 60 * 60 * 1000;
  const groups = new Map<number, SymptomLog[]>();

  logs.forEach((log) => {
    const date = new Date(`${log.log_date}T12:00:00`).getTime();
    if (!Number.isFinite(date) || !Number.isFinite(anchor)) return;
    const index = Math.floor((date - anchor) / cycleMs);
    groups.set(index, [...(groups.get(index) ?? []), log]);
  });

  return [...groups.entries()]
    .sort(([left], [right]) => right - left)
    .slice(0, 5)
    .map(([, entries]) => entries.sort((left, right) => left.log_date.localeCompare(right.log_date)));
}

function countLabels<T extends string>(logs: SymptomLog[], values: (log: SymptomLog) => T[]): T[] {
  const counts = new Map<T, number>();
  logs.forEach((log) => values(log).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1)));
  return [...counts.entries()].sort((left, right) => right[1] - left[1]).map(([value]) => value);
}

function buildAppointmentSummary(logs: SymptomLog[], profile: CycleProfile): string {
  const cycles = getCycleGroups(logs, profile).slice(0, 3);
  const recentLogs = cycles.flat();
  const dates = cycles.map((cycle) => `${cycle[0].log_date} to ${cycle[cycle.length - 1].log_date}`);
  const chronologicalLogs = [...recentLogs].sort((left, right) => left.log_date.localeCompare(right.log_date));
  const bleedingStarts = chronologicalLogs.filter((log, index) => {
    if (!log.bleeding || log.bleeding === "none") return false;
    const previous = chronologicalLogs[index - 1];
    if (!previous || !previous.bleeding || previous.bleeding === "none") return true;
    return Date.parse(`${log.log_date}T00:00:00Z`) - Date.parse(`${previous.log_date}T00:00:00Z`) > 24 * 60 * 60 * 1000;
  });
  const recordedCycleIntervals = bleedingStarts.slice(1).map((start, index) =>
    (Date.parse(`${start.log_date}T00:00:00Z`) - Date.parse(`${bleedingStarts[index].log_date}T00:00:00Z`)) / (24 * 60 * 60 * 1000)
  );
  const averageRecordedCycleInterval = recordedCycleIntervals.length
    ? `${(recordedCycleIntervals.reduce((total, interval) => total + interval, 0) / recordedCycleIntervals.length).toFixed(1)} days between recorded bleeding starts`
    : "Not enough recorded bleeding starts to calculate";
  const symptoms = countLabels(recentLogs, (log) => log.symptoms).slice(0, 8);
  const locations = countLabels(recentLogs, (log) => log.pain_locations).slice(0, 6);
  const impactAreas = countLabels(recentLogs, (log) => log.impact_areas ?? []).slice(0, 6);
  const painByCycle = cycles.map((cycle) => {
    const scores = cycle.map((log) => Number(log.pain_score) || 0);
    const average = scores.length ? (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1) : "0";
    const highDays = scores.filter((score) => score >= 7).length;
    return `- ${cycle[0].log_date} to ${cycle[cycle.length - 1].log_date}: average ${average}/10; ${highDays} high-pain recorded day(s)`;
  });
  const bleedingCounts = ["light", "medium", "heavy"] as const;
  const bleeding = bleedingCounts
    .map((level) => `${BLEEDING_LABELS[level]}: ${recentLogs.filter((log) => log.bleeding === level).length} recorded day(s)`)
    .join("; ");
  const impact = Object.entries(IMPACT_LABELS)
    .filter(([key]) => ["mild", "moderate", "significant", "unable"].includes(key))
    .map(([key, label]) => `${label}: ${recentLogs.filter((log) => log.impact === key).length} day(s)`)
    .join("; ");

  return [
    "PHASETWO APPOINTMENT NOTES",
    "These are the patterns recorded in your PhaseTwo history. Share them with your healthcare professional to help provide context during your appointment.",
    "",
    `Recent recorded cycle date ranges: ${dates.length ? dates.join("; ") : "No cycle entries recorded"}`,
    `Average interval from logged bleeding starts: ${averageRecordedCycleInterval} (may not represent complete cycles if entries are missing)`,
    `Cycle length set in profile (not calculated average): ${profile.cycleLength} days; period duration set in profile: ${profile.periodLength} days`,
    `Cycles with pain, symptoms, or daily impact recorded: ${cycles.filter((cycle) => cycle.some((log) => log.pain_score > 0 || log.symptoms.length > 0 || log.impact !== "none")).length}`,
    "",
    "Pain by recorded cycle:",
    ...(painByCycle.length ? painByCycle : ["- No pain entries recorded"]),
    `Pain locations recorded: ${locations.length ? locations.map((value) => PAIN_LOCATION_LABELS[value]).join(", ") : "None"}`,
    `Bleeding entries: ${bleeding}`,
    `Symptoms recorded: ${symptoms.length ? symptoms.map((value) => SYMPTOM_LABELS[value]).join(", ") : "None"}`,
    `Symptoms marked outside bleeding days: ${recentLogs.filter((log) => log.outside_period === true).length} day(s)`,
    `Daily impact: ${impact}`,
    `Affected areas: ${impactAreas.length ? impactAreas.map((area) => IMPACT_AREA_LABELS[area] ?? area).join(", ") : "None recorded"}`,
    "",
    MEDICAL_DISCLAIMER,
  ].join("\n");
}

export function EndometriosisAwareness({ logs, profile }: { logs: SymptomLog[]; profile: CycleProfile }) {
  const [factIndex, setFactIndex] = useState(() => Math.floor(Math.random() * ENDOMETRIOSIS_FACTS.length));
  const [summary, setSummary] = useState("");
  const [copied, setCopied] = useState(false);
  const patternSummary = analyzeSymptomPatterns(logs, profile);
  const cycleGroups = getCycleGroups(logs, profile).reverse();
  const currentFact = ENDOMETRIOSIS_FACTS[factIndex];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFactIndex((current) => (current + 1 + Math.floor(Math.random() * (ENDOMETRIOSIS_FACTS.length - 1))) % ENDOMETRIOSIS_FACTS.length);
    }, 45000);
    return () => window.clearInterval(timer);
  }, []);

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      const textArea = document.querySelector<HTMLTextAreaElement>("#appointment-summary");
      textArea?.select();
    }
  }

  function downloadSummary() {
    const url = URL.createObjectURL(new Blob([summary], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "phasetwo-appointment-notes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-4" aria-labelledby="awareness-heading">
      <div className="rounded-xl border border-sage/25 bg-sage-light/60 p-4 text-xs leading-relaxed text-sage-dark">
        <p className="font-semibold">A note about your health history</p>
        <p className="mt-1">{MEDICAL_DISCLAIMER}</p>
      </div>

      {patternSummary.recommendEvaluation && (
        <div className="rounded-xl border border-sage/30 bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-start gap-3">
            <HeartHandshake className="mt-0.5 h-5 w-5 flex-none text-sage" />
            <div>
              <h2 className="font-display text-base font-semibold text-zinc-900">A pattern worth discussing</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-700">
                Your recent cycle history shows recurring symptoms that may be worth discussing with a healthcare professional. These symptoms can have several possible causes, including endometriosis. Consider making an appointment with a qualified healthcare professional for a proper evaluation.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">PhaseTwo cannot determine whether you have endometriosis. This is an educational prompt, not a medical assessment.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a href="#endo-learning" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-sage-dark underline underline-offset-4">
                  <BookOpen className="h-4 w-4" /> Learn why these symptoms matter
                </a>
                <button type="button" onClick={() => setSummary(buildAppointmentSummary(logs, profile))} className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-sage px-3 py-2 text-sm font-medium text-white">
                  <ClipboardList className="h-4 w-4" /> Prepare for an appointment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-sage-dark">Learn · Track · Understand</p>
              <h2 id="awareness-heading" className="mt-1 font-display text-xl font-semibold text-zinc-900">Menstrual health, with room for questions</h2>
            </div>
            <span className="hidden rounded-full bg-sage-light px-3 py-1 text-xs text-sage-dark sm:inline">Awareness</span>
          </div>

          <div className="mt-5 border-l-2 border-sage pl-4">
            <p className="text-sm leading-relaxed text-zinc-800">{currentFact.text}</p>
            <p className="mt-2 text-xs text-zinc-500">{currentFact.organization} · {currentFact.title} · <a className="underline underline-offset-2" href={currentFact.url} target="_blank" rel="noopener noreferrer">Original source</a></p>
          </div>

          <div id="endo-learning" className="mt-5 divide-y divide-zinc-100 border-y border-zinc-100">
            <details className="py-3">
              <summary className="cursor-pointer text-sm font-medium text-zinc-800">What is endometriosis?</summary>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">It is a chronic condition in which tissue similar to the lining of the uterus grows outside it and can cause inflammation and scar tissue. It can affect people differently; symptoms alone cannot confirm it.</p>
            </details>
            <details className="py-3">
              <summary className="cursor-pointer text-sm font-medium text-zinc-800">Symptoms and everyday impact</summary>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">Reported symptoms can include severe menstrual pain, heavy bleeding, pelvic pain outside menstruation, bloating, nausea, and pain with bowel movements or urination. Symptoms may affect sleep, school, work, exercise, relationships, and social life. Some people have few or no symptoms. These experiences have many possible causes.</p>
            </details>
            <details className="py-3">
              <summary className="cursor-pointer text-sm font-medium text-zinc-800">Why can diagnosis take time?</summary>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">Symptoms vary and can overlap with other conditions, and menstrual pain may be normalized or dismissed. A healthcare professional may review symptom and menstrual history, examine symptoms, and consider imaging such as ultrasound or MRI. The appropriate evaluation is individual; surgery is not always required before care begins.</p>
            </details>
            <details className="py-3">
              <summary className="cursor-pointer text-sm font-medium text-zinc-800">Treatment, myths, and getting support</summary>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">There is no known cure, but care may include pain medicines, hormonal medicines, surgery, and multidisciplinary pain support. Options depend on individual circumstances and should be discussed with a qualified professional. Severe period pain is not something you need to simply endure, and symptom tracking can help you explain what you experience. Persistent, severe, worsening, or disruptive symptoms deserve a conversation with a healthcare professional.</p>
            </details>
          </div>
          <p className="mt-4 text-sm font-medium text-sage-dark">Severe period pain deserves to be taken seriously. Your experience is worth discussing.</p>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card sm:p-6">
            <h3 className="font-display text-base font-semibold text-zinc-900">Your recorded trends</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">Descriptions of entries only; these are not medical conclusions.</p>
            {cycleGroups.length ? (
              <div className="mt-4 space-y-3">
                {cycleGroups.map((cycle, index) => {
                  const highPainDays = cycle.filter((entry) => entry.pain_score >= 7).length;
                  const painPercent = Math.round((highPainDays / Math.max(1, cycle.length)) * 100);
                  return (
                    <div key={`${cycle[0].log_date}-${index}`}>
                      <div className="flex justify-between gap-3 text-xs text-zinc-600">
                        <span>{cycle[0].log_date} to {cycle[cycle.length - 1].log_date}</span>
                        <span>{highPainDays} of {cycle.length} days high (7+/10)</span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-sm bg-zinc-100" role="img" aria-label={`${highPainDays} high-pain days out of ${cycle.length} logged days`}>
                        <div className="h-full rounded-sm bg-sage" style={{ width: `${painPercent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="mt-4 text-sm text-zinc-500">As you record symptoms, your history will appear here.</p>}
            {patternSummary.cyclesReviewed > 0 && <p className="mt-4 text-xs text-zinc-500">Pattern review uses up to three recorded cycle periods. {patternSummary.cyclesReviewed < 3 ? "More recorded cycles are needed before recurring patterns are highlighted." : `${patternSummary.recurringCycles} of the three reviewed cycles contain symptoms.`}</p>}
            {logs.length > 0 && <button type="button" onClick={() => setSummary(buildAppointmentSummary(logs, profile))} className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-sage/40 px-3 py-2 text-sm font-medium text-sage-dark"><ClipboardList className="h-4 w-4" />Prepare for an appointment</button>}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card sm:p-6">
            <h3 className="font-display text-base font-semibold text-zinc-900">Endometriosis resources</h3>
            <div className="mt-3 space-y-3">
              {ENDOMETRIOSIS_RESOURCES.map((resource) => (
                <a key={resource.url} href={resource.url} target="_blank" rel="noopener noreferrer" className="block border-t border-zinc-100 pt-3 first:border-0 first:pt-0">
                  <span className="flex items-start justify-between gap-2 text-sm font-medium text-zinc-800">{resource.title}<ExternalLink className="h-3.5 w-3.5 flex-none text-zinc-400" /></span>
                  <span className="mt-1 block text-xs leading-relaxed text-zinc-600">{resource.description}</span>
                  <span className="mt-1 block text-[11px] text-zinc-400">{resource.organization} · {resource.updated}</span>
                </a>
              ))}
            </div>
            <p className="mt-4 border-t border-zinc-100 pt-3 text-xs leading-relaxed text-zinc-500">WHO's fact sheet is currently available. WHO's dedicated endometriosis guideline is in development, with publication listed for Q4 2027; it has not yet been published.</p>
          </div>
        </div>
      </div>

      {summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/35 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="appointment-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 id="appointment-title" className="font-display text-lg font-semibold text-zinc-900">Prepare for your appointment</h2>
              <button type="button" onClick={() => setSummary("")} aria-label="Close appointment summary" className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">Review these notes before exporting. This summary contains only recorded history and does not make a diagnosis. It stays on this device unless you choose to copy or download it.</p>
            <textarea id="appointment-summary" readOnly value={summary} rows={18} className="mt-4 w-full resize-y rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-relaxed text-zinc-700" />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setSummary("")} className="min-h-10 rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700">Close</button>
              <button type="button" onClick={downloadSummary} className="min-h-10 rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700">Download notes</button>
              <button type="button" onClick={() => void copySummary()} className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-sage px-3 py-2 text-sm font-medium text-white"><Copy className="h-4 w-4" />{copied ? "Copied" : "Copy notes"}</button>
            </div>
            <p className="mt-4 border-t border-zinc-100 pt-3 text-xs leading-relaxed text-zinc-500">{MEDICAL_DISCLAIMER}</p>
          </section>
        </div>
      )}
    </section>
  );
}
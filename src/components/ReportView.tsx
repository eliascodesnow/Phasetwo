import { useMemo } from "react";
import { Download, FileText, Printer } from "lucide-react";
import type { CycleProfile } from "../types";
import { BLEEDING_LABELS, IMPACT_AREA_LABELS, IMPACT_LABELS, PAIN_LOCATION_LABELS, SYMPTOM_LABELS, type SymptomLog } from "../lib/symptoms";
import { MEDICAL_DISCLAIMER } from "../lib/endoContent";

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
}

function buildReport(profile: CycleProfile, logs: SymptomLog[]): string {
  const ascendingLogs = [...logs].sort((left, right) => left.log_date.localeCompare(right.log_date));
  const recordedStarts = profile.periodStartDates?.length ? profile.periodStartDates : [profile.lastPeriodStart];
  const intervals = recordedStarts.slice(1).map((start, index) => (Date.parse(`${start}T12:00:00`) - Date.parse(`${recordedStarts[index]}T12:00:00`)) / 86400000);
  const average = intervals.length ? `${(intervals.reduce((sum, days) => sum + days, 0) / intervals.length).toFixed(1)} days based on ${intervals.length} observed intervals` : `Not enough bleeding-start entries to calculate; profile setting is ${profile.cycleLength} days`;
  const painAverage = ascendingLogs.length ? `${(ascendingLogs.reduce((sum, log) => sum + log.pain_score, 0) / ascendingLogs.length).toFixed(1)}/10` : "No entries recorded";
  const frequentSymptoms = [...new Set(ascendingLogs.flatMap((log) => log.symptoms))].map((value) => SYMPTOM_LABELS[value]);
  const impactAreas = [...new Set(ascendingLogs.flatMap((log) => log.impact_areas ?? []))].map((value) => IMPACT_AREA_LABELS[value]);
  const painLocations = [...new Set(ascendingLogs.flatMap((log) => log.pain_locations))].map((value) => PAIN_LOCATION_LABELS[value]);

  return [
    "PHASETWO MENSTRUAL HEALTH HISTORY",
    `Prepared ${new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date())}`,
    "",
    "These are the patterns recorded in your PhaseTwo history. Share them with your healthcare professional to help provide context during your appointment.",
    "",
    `Recorded period start dates: ${recordedStarts.map(dateLabel).join(", ")}`,
    `Average cycle interval: ${average}`,
    `Period duration set in profile: ${profile.periodLength} days (estimate)`,
    `Daily symptom entries: ${ascendingLogs.length}`,
    `Average pain score across recorded days: ${painAverage}`,
    `Pain locations recorded: ${painLocations.join(", ") || "None"}`,
    `Symptoms recorded: ${frequentSymptoms.join(", ") || "None"}`,
    `Bleeding entries: ${Object.entries(BLEEDING_LABELS).map(([key, label]) => `${label}: ${ascendingLogs.filter((log) => log.bleeding === key).length}`).join("; ")}`,
    `Daily impact levels: ${Object.entries(IMPACT_LABELS).filter(([key]) => key !== "some" && key !== "missed_activity").map(([key, label]) => `${label}: ${ascendingLogs.filter((log) => log.impact === key).length}`).join("; ")}`,
    `Areas affected: ${impactAreas.join(", ") || "None recorded"}`,
    `Outside-period symptoms marked: ${ascendingLogs.filter((log) => log.outside_period).length} days`,
    "",
    "DAILY ENTRIES",
    ...ascendingLogs.map((log) => `${dateLabel(log.log_date)} | pain ${log.pain_score}/10 | ${log.bleeding ? BLEEDING_LABELS[log.bleeding] : "bleeding not recorded"} | ${log.symptoms.map((item) => SYMPTOM_LABELS[item]).join(", ") || "no symptoms selected"}${log.notes ? ` | ${log.notes}` : ""}`),
    "",
    MEDICAL_DISCLAIMER,
  ].join("\n");
}

export function ReportView({ profile, logs }: { profile: CycleProfile; logs: SymptomLog[] }) {
  const report = useMemo(() => buildReport(profile, logs), [profile, logs]);
  function downloadReport() {
    const url = URL.createObjectURL(new Blob([report], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "phasetwo-menstrual-health-report.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-sage-dark">Appointment preparation</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-zinc-900">Health history report</h1>
        <p className="mt-1 text-sm text-zinc-500">Generated from your recorded cycle and daily symptom history. Review it before sharing.</p>
      </div>
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4">
          <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-sage" /><h2 className="font-display text-base font-semibold text-zinc-900">PhaseTwo history</h2></div>
          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700"><Printer className="h-4 w-4" />Print / PDF</button>
            <button type="button" onClick={downloadReport} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-sage px-3 py-2 text-sm font-medium text-white"><Download className="h-4 w-4" />Download report</button>
          </div>
        </div>
        <pre className="mt-4 max-h-[65vh] overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#fbf7f5] p-4 font-sans text-sm leading-relaxed text-zinc-700">{report}</pre>
      </section>
    </div>
  );
}
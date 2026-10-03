import { CalendarDays, CircleDot, Droplets, Pencil, Trash2 } from "lucide-react";
import type { CycleProfile } from "../types";
import { BLEEDING_LABELS, IMPACT_LABELS, PAIN_LOCATION_LABELS, SYMPTOM_LABELS, type SymptomLog } from "../lib/symptoms";
import { editPeriodStart, removePeriodStart } from "../lib/cycleUtils";
import { PeriodCalendar } from "./PeriodCalendar";
import { SaveChangesButton } from "./SaveChangesButton";

export function HistoryView({ profile, logs, onProfileChange, onEditLog, onSave, saving, savedAt }: { profile: CycleProfile; logs: SymptomLog[]; onProfileChange: (profile: CycleProfile) => void; onEditLog: (date: string) => void; onSave: () => Promise<void>; saving: boolean; savedAt: Date | null }) {
  const sortedLogs = [...logs].sort((left, right) => right.log_date.localeCompare(left.log_date));
  const starts = profile.periodStartDates?.length ? [...profile.periodStartDates].reverse() : [profile.lastPeriodStart];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-sage-dark">Your records</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-zinc-900">Cycle history</h1>
        <p className="mt-1 text-sm text-zinc-500">Period starts and daily pain notes, together on your calendar.</p>
      </div>
      <PeriodCalendar profile={profile} logs={logs} onRecordPeriodStart={() => undefined} showRecordButton={false} />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-2"><Droplets className="h-4 w-4 text-[#b96070]" /><h2 className="font-display text-base font-semibold text-zinc-900">Period starts</h2></div>
          <ul className="mt-4 divide-y divide-zinc-100">
            {starts.map((date) => <li key={date} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <label className="sr-only" htmlFor={`period-start-${date}`}>Edit period start date</label>
              <input id={`period-start-${date}`} type="date" value={date} onChange={(event) => {
                if (event.target.value) onProfileChange(editPeriodStart(profile, date, event.target.value));
              }} className="min-h-10 rounded-md border border-zinc-200 px-2 text-sm text-zinc-700" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">Period start</span>
                <button type="button" onClick={() => onProfileChange(removePeriodStart(profile, date))} disabled={starts.length <= 1} aria-label={`Remove period start ${date}`} title="Remove period start" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-400 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-30">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>)}
          </ul>
        </section>
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-sage" /><h2 className="font-display text-base font-semibold text-zinc-900">Daily pain & symptom logs</h2></div>
          {sortedLogs.length ? (
            <ul className="mt-4 divide-y divide-zinc-100">
              {sortedLogs.slice(0, 30).map((log) => (
                <li key={log.log_date} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-zinc-800">{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(`${log.log_date}T12:00:00`))}</span>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1 text-xs text-zinc-600"><CircleDot className="h-3.5 w-3.5 text-[#b96070]" />Pain {log.pain_score}/10</span>
                      <button type="button" onClick={() => onEditLog(log.log_date)} aria-label={`Edit log for ${log.log_date}`} title="Edit log" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-sage-light hover:text-sage-dark"><Pencil className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">{[log.bleeding && BLEEDING_LABELS[log.bleeding], ...log.symptoms.map((item) => SYMPTOM_LABELS[item]), ...log.pain_locations.map((item) => PAIN_LOCATION_LABELS[item]), IMPACT_LABELS[log.impact]].filter(Boolean).join(" · ") || "No other details recorded"}</p>
                  {log.notes && <p className="mt-1 text-xs leading-relaxed text-zinc-600">{log.notes}</p>}
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-sm text-zinc-500">Pain and symptom entries appear here when you save a daily check-in.</p>}
        </section>
      </div>
      <SaveChangesButton onSave={onSave} saving={saving} savedAt={savedAt} />
    </div>
  );
}
import { useState } from "react";
import type { CycleProfile } from "../types";
import { dateKey, periodStartContaining, recordPeriodEnd, recordPeriodStart } from "../lib/cycleUtils";

function dayNumber(start: string, today: string): number {
  return Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86400000) + 1;
}

/** One-tap period logging for the Today screen. */
export function PeriodQuickLog({ profile, onChange }: { profile: CycleProfile; onChange: (profile: CycleProfile) => void }) {
  const today = dateKey();
  const [pickingDay, setPickingDay] = useState(false);
  const [otherDay, setOtherDay] = useState(today);
  const active = periodStartContaining(profile, today);
  const ongoing = Boolean(active && !profile.periodEnds?.[active]);

  return (
    <section data-tour="record-period" className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-card sm:p-5" aria-label="Log your period">
      {ongoing && active ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-display text-lg font-bold text-zinc-900">Period · day {dayNumber(active, today)}</p>
          <button type="button" onClick={() => onChange(recordPeriodEnd(profile, active, today))} className="min-h-12 rounded-full bg-zinc-900 px-6 text-sm font-semibold text-white transition-transform active:scale-[0.97]">Period ended today</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-display text-lg font-bold text-zinc-900">Log your period</p>
          <button type="button" onClick={() => onChange(recordPeriodStart(profile, today))} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--period-solid)] px-6 text-sm font-semibold text-white transition-transform active:scale-[0.97]">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4"><path d="M12 2.5c3.6 4.3 6.5 7.6 6.5 11.2A6.5 6.5 0 0 1 12 20.2a6.5 6.5 0 0 1-6.5-6.5C5.5 10.1 8.4 6.8 12 2.5Z" fill="currentColor" /></svg>
            Period started today
          </button>
        </div>
      )}

      <div className="mt-3">
        {!pickingDay ? (
          <button type="button" onClick={() => setPickingDay(true)} className="min-h-10 text-sm font-medium text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline">Different day</button>
        ) : (
          <div className="pt-rise flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="quick-log-day">Day</label>
            <input id="quick-log-day" type="date" max={today} value={otherDay} onChange={(event) => setOtherDay(event.target.value)} className="min-h-11 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900" />
            <button type="button" disabled={!otherDay || otherDay > today} onClick={() => { onChange(recordPeriodStart(profile, otherDay)); setPickingDay(false); }} className="min-h-11 rounded-full bg-[var(--period-solid)] px-4 text-sm font-semibold text-white disabled:opacity-50">Started</button>
            <button type="button" onClick={() => setPickingDay(false)} className="min-h-11 px-3 text-sm text-zinc-500">Cancel</button>
          </div>
        )}
      </div>
    </section>
  );
}

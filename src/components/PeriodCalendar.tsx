import { useState } from "react";
import { ChevronLeft, ChevronRight, Droplets, HeartPulse, Plus } from "lucide-react";
import type { CycleProfile } from "../types";
import { SYMPTOM_LABELS, type SymptomLog } from "../lib/symptoms";
import { nextPeriodEstimate } from "../lib/cycleUtils";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_FORMATTER = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateAtNoon(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

function daysBetween(start: string, date: string): number {
  return Math.round((dateAtNoon(date).getTime() - dateAtNoon(start).getTime()) / 86400000);
}

function addMonths(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + count, 1, 12);
}

function monthCells(month: Date): Array<Date | null> {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const length = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12).getDate();
  return [...Array.from({ length: first.getDay() }, () => null), ...Array.from({ length }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1, 12))];
}

export function classifyDay(
  key: string,
  starts: string[],
  periodLength: number,
  today: string,
  estimatedStart: string,
): "recorded" | "estimated" | "none" {
  const currentPeriod = starts.some((start) => {
    const elapsed = daysBetween(start, key);
    return elapsed >= 0 && elapsed < periodLength;
  });

  if (currentPeriod && key <= today) {
    return "recorded";
  }

  if (currentPeriod && key > today) {
    return "estimated";
  }

  const daysFromEstimated = daysBetween(estimatedStart, key);
  if (daysFromEstimated >= 0 && daysFromEstimated < periodLength && key > today) {
    return "estimated";
  }

  return "none";
}

function MonthGrid({
  month,
  profile,
  logs,
  selectedDate,
  today,
  onSelect,
  onMonthChange,
}: {
  month: Date;
  profile: CycleProfile;
  logs: SymptomLog[];
  selectedDate: string;
  today: string;
  onSelect: (date: string) => void;
  onMonthChange: (date: Date) => void;
}) {
  const starts = profile.periodStartDates ?? [];
  const estimatedStart = starts.length ? dateKey(nextPeriodEstimate(profile)) : "";

  return (
    <div>
      <h3 className="mb-3 font-display text-sm font-semibold text-zinc-800">{MONTH_FORMATTER.format(month)}</h3>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((weekday, index) => <span key={`${weekday}-${index}`} className="min-w-0 py-1 text-[10px] font-semibold uppercase text-zinc-500"><span aria-hidden="true" className="sm:hidden">{weekday.slice(0, 3)}</span><span className="sr-only sm:not-sr-only">{weekday}</span></span>)}
        {monthCells(month).map((date, index) => {
          if (!date) return <span key={`empty-${index}`} className="aspect-square" />;
          const key = dateKey(date);
          const classification = classifyDay(key, starts, profile.periodLength, today, estimatedStart);
          const period = classification === "recorded";
          const estimated = classification === "estimated";
          const log = logs.find((entry) => entry.log_date === key);
          const pain = Boolean(log && log.pain_score > 0);
          const selected = key === selectedDate;
          const dayTone = period
            ? "bg-sage text-white"
            : estimated
              ? "border border-dashed border-sage bg-sage-light text-sage-dark"
              : key === today
                ? "bg-zinc-100 text-zinc-900"
                : "text-zinc-700 hover:bg-sage-light";
          return (
            <button
              key={key}
              id={`calendar-day-${key}`}
              type="button"
              onClick={() => onSelect(key)}
              onKeyDown={(event) => {
                const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
                const offset = offsets[event.key];
                if (!offset) return;
                event.preventDefault();
                const nextDate = new Date(date);
                nextDate.setDate(nextDate.getDate() + offset);
                const nextKey = dateKey(nextDate);
                onSelect(nextKey);
                if (nextDate.getMonth() !== month.getMonth() || nextDate.getFullYear() !== month.getFullYear()) onMonthChange(nextDate);
                window.requestAnimationFrame(() => document.getElementById(`calendar-day-${nextKey}`)?.focus());
              }}
              aria-label={`${MONTH_FORMATTER.format(month)} ${date.getDate()}${period ? ", recorded period" : estimated ? ", estimated period" : ""}${pain ? `, pain ${log?.pain_score} out of 10` : ""}`}
              aria-pressed={selected}
              className={`relative flex aspect-square min-h-10 min-w-0 items-center justify-center rounded-full text-sm transition-colors sm:min-h-11 ${dayTone} ${selected ? "ring-2 ring-offset-2 ring-sage" : key === today ? "ring-1 ring-sage" : ""}`}
            >
              {date.getDate()}
              {pain && <span className={`absolute bottom-1 rounded-full ${period ? "bg-white" : "bg-sage-dark"}`} style={{ width: `${4 + (log?.pain_score ?? 0) * 0.6}px`, height: `${4 + (log?.pain_score ?? 0) * 0.6}px` }} />}
              {starts.includes(key) && <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-white ring-2 ring-sage" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PeriodCalendar({
  profile,
  logs,
  onRecordPeriodStart,
  showRecordButton = true,
  onEditLog,
}: {
  profile: CycleProfile;
  logs: SymptomLog[];
  onRecordPeriodStart: (date: string) => void;
  showRecordButton?: boolean;
  onEditLog?: (date: string) => void;
}) {
  const today = dateKey(new Date());
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12));
  const [selectedDate, setSelectedDate] = useState(today);
  const [twoMonths, setTwoMonths] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 640px)").matches);
  const starts = profile.periodStartDates?.length ? profile.periodStartDates : [profile.lastPeriodStart];
  const selectedLog = logs.find((log) => log.log_date === selectedDate);
  const estimatedStart = starts.length ? dateKey(nextPeriodEstimate(profile)) : "";
  const selectedClassification = classifyDay(selectedDate, starts, profile.periodLength, today, estimatedStart);
  const selectedIsPeriod = selectedClassification === "recorded";
  const selectedIsEstimated = selectedClassification === "estimated";

  return (
    <section className="-mx-4 rounded-none border-x-0 border-y border-zinc-200 bg-white p-0 shadow-none sm:mx-0 sm:rounded-xl sm:border sm:p-6 sm:shadow-card" aria-label="Period calendar">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-3 pt-3 sm:px-0 sm:pt-0">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setVisibleMonth((month) => addMonths(month, -1))} aria-label="Previous month" className="flex h-10 w-10 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100">
            <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button type="button" onClick={() => setVisibleMonth((month) => addMonths(month, 1))} aria-label="Next month" className="flex h-10 w-10 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100">
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button type="button" onClick={() => { setVisibleMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12)); setSelectedDate(today); }} className="min-h-11 rounded-md px-3 text-sm font-medium text-sage-dark hover:bg-sage-light">Today</button>
        </div>
        <button type="button" onClick={() => { const now = new Date(); setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1, 12)); setSelectedDate(today); }} className="min-h-9 rounded-md px-3 text-xs font-medium text-sage-dark hover:bg-sage-light">Today</button>
        <label className="flex min-h-9 items-center gap-2 text-xs font-medium text-zinc-500">
          <input type="checkbox" checked={twoMonths} onChange={(event) => setTwoMonths(event.target.checked)} className="h-4 w-4 accent-[#4A6B5D]" />
          Two-month view
        </label>
      </div>

      <div className={`grid gap-6 ${twoMonths ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 max-w-md"}`}>
        <MonthGrid month={visibleMonth} profile={profile} logs={logs} selectedDate={selectedDate} today={today} onSelect={setSelectedDate} onMonthChange={(date) => setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12))} />
        {twoMonths && <MonthGrid month={addMonths(visibleMonth, 1)} profile={profile} logs={logs} selectedDate={selectedDate} today={today} onSelect={setSelectedDate} onMonthChange={(date) => setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12))} />}
      </div>

      <div className="mx-3 mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-zinc-100 pt-4 text-sm text-zinc-500 sm:mx-0">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sage" />Recorded period</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-sage bg-sage-light" />Estimated period</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-sage bg-zinc-100" />Today</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-sage-dark" />Pain log</span>
      </div>

      <div className="mx-3 mb-3 mt-4 flex flex-col justify-between gap-3 rounded-lg bg-zinc-50 p-3 sm:mx-0 sm:mb-0 sm:flex-row sm:items-center">
        <div className="flex items-start gap-2 text-sm text-zinc-700">
          <Droplets className="mt-0.5 h-4 w-4 flex-none text-sage" />
          <div>
            <p className="font-medium">{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(dateAtNoon(selectedDate))}</p>
            <p className="mt-0.5 text-sm text-zinc-500">{selectedIsPeriod ? "Recorded period day" : selectedIsEstimated ? "Estimated period day" : "No period recorded"}</p>
            {selectedLog ? <div className="mt-2 space-y-1 text-sm text-zinc-600">
              <p>Pain {selectedLog.pain_score}/10 · {selectedLog.bleeding ?? "No bleeding entry"} bleeding</p>
              <p>{selectedLog.symptoms.length ? selectedLog.symptoms.map((symptom) => SYMPTOM_LABELS[symptom]).join(", ") : "No other symptoms recorded"}</p>
              {selectedLog.notes && <p className="whitespace-pre-wrap">{selectedLog.notes}</p>}
            </div> : <p className="mt-1 text-sm text-zinc-500">No check-in recorded</p>}
          </div>
        </div>
        {showRecordButton && (
          <button type="button" disabled={selectedDate > today} onClick={() => onRecordPeriodStart(selectedDate)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-sage px-4 text-sm font-medium text-white hover:bg-sage-dark disabled:cursor-not-allowed disabled:opacity-50">
            <Plus className="h-4 w-4" />Record period start
          </button>
        )}
      </div>
    </section>
  );
}

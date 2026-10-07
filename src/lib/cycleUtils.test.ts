import { useState } from "react";
import { ChevronLeft, ChevronRight, Droplets, Plus } from "lucide-react";
import type { CycleProfile } from "../types";
import type { SymptomLog } from "../lib/symptoms";
import { nextPeriodEstimate } from "../lib/cycleUtils";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
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
}: {
  month: Date;
  profile: CycleProfile;
  logs: SymptomLog[];
  selectedDate: string;
  today: string;
  onSelect: (date: string) => void;
}) {
  const starts = profile.periodStartDates?.length ? profile.periodStartDates : [profile.lastPeriodStart];
  const estimatedStart = dateKey(nextPeriodEstimate(profile));

  return (
    <div>
      <h3 className="mb-3 font-display text-sm font-semibold text-zinc-800">{MONTH_FORMATTER.format(month)}</h3>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((weekday, index) => <span key={`${weekday}-${index}`} className="py-1 text-[10px] font-semibold uppercase text-zinc-400">{weekday}</span>)}
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
            ? "bg-[#b96070] text-white"
            : estimated
              ? "bg-[#f5dce0] text-[#8b4653]"
              : key === today
                ? "bg-sage text-white"
                : "text-zinc-700 hover:bg-sage-light";
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-label={`${MONTH_FORMATTER.format(month)} ${date.getDate()}${period ? ", recorded period" : estimated ? ", estimated period" : ""}${pain ? `, pain ${log?.pain_score} out of 10` : ""}`}
              aria-pressed={selected}
              className={`relative flex aspect-square min-h-9 items-center justify-center rounded-full text-xs transition-colors sm:min-h-10 ${dayTone} ${selected ? "ring-2 ring-offset-2 ring-sage" : ""}`}
            >
              {date.getDate()}
              {pain && <span className={`absolute bottom-1 h-1 w-1 rounded-full ${period || key === today ? "bg-white" : "bg-[#b96070]"}`} />}
              {starts.includes(key) && <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-white ring-1 ring-[#b96070]" />}
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
}: {
  profile: CycleProfile;
  logs: SymptomLog[];
  onRecordPeriodStart: (date: string) => void;
  showRecordButton?: boolean;
}) {
  const today = dateKey(new Date());
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12));
  const [selectedDate, setSelectedDate] = useState(today);
  const [twoMonths, setTwoMonths] = useState(true);
  const starts = profile.periodStartDates?.length ? profile.periodStartDates : [profile.lastPeriodStart];
  const selectedLog = logs.find((log) => log.log_date === selectedDate);
  const estimatedStart = dateKey(nextPeriodEstimate(profile));
  const selectedClassification = classifyDay(selectedDate, starts, profile.periodLength, today, estimatedStart);
  const selectedIsPeriod = selectedClassification === "recorded";
  const selectedIsEstimated = selectedClassification === "estimated";

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-card sm:p-6" aria-label="Period calendar">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setVisibleMonth((month) => addMonths(month, -1))} aria-label="Previous month" className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100">
            <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button type="button" onClick={() => setVisibleMonth((month) => addMonths(month, 1))} aria-label="Next month" className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100">
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-zinc-500">
          <input type="checkbox" checked={twoMonths} onChange={(event) => setTwoMonths(event.target.checked)} className="h-4 w-4 accent-[#4A6B5D]" />
          Two-month view
        </label>
      </div>

      <div className={`grid gap-6 ${twoMonths ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 max-w-md"}`}>
        <MonthGrid month={visibleMonth} profile={profile} logs={logs} selectedDate={selectedDate} today={today} onSelect={setSelectedDate} />
        {twoMonths && <MonthGrid month={addMonths(visibleMonth, 1)} profile={profile} logs={logs} selectedDate={selectedDate} today={today} onSelect={setSelectedDate} />}
      </div>

      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-zinc-100 pt-4 text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#b96070]" />Recorded period</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#f5dce0]" />Estimated period</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sage" />Today</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#b96070]" />Pain log</span>
      </div>

      <div className="mt-4 flex flex-col justify-between gap-3 rounded-lg bg-[#fbf7f5] p-3 sm:flex-row sm:items-center">
        <div className="flex items-start gap-2 text-sm text-zinc-700">
          <Droplets className="mt-0.5 h-4 w-4 flex-none text-[#b96070]" />
          <div>
            <p className="font-medium">{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(dateAtNoon(selectedDate))}</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {selectedIsPeriod ? "Recorded period day" : selectedIsEstimated ? "Estimated period day" : "No period recorded"}
              {selectedLog ? ` · Pain ${selectedLog.pain_score}/10 · ${selectedLog.bleeding ?? "No bleeding entry"} bleeding` : " · No pain log"}
            </p>
          </div>
        </div>
        {showRecordButton && (
          <button type="button" disabled={selectedDate > today} onClick={() => onRecordPeriodStart(selectedDate)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#b96070] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#a85060] disabled:bg-zinc-300 disabled:cursor-not-allowed">
            <Plus className="h-4 w-4" />Record period
          </button>
        )}
      </div>
    </section>
  );
}

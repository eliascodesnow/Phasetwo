import { useState } from "react";
import { ChevronLeft, ChevronRight, NotebookPen } from "lucide-react";
import type { CycleProfile } from "../types";
import { SYMPTOM_LABELS, type SymptomLog } from "../lib/symptoms";
import {
  daysUntilNextPeriod,
  nextPeriodEstimate,
  periodStartContaining,
  predictedPeriodStarts,
  recordPeriodEnd,
  recordPeriodStart,
  removePeriodStart,
} from "../lib/cycleUtils";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_FORMATTER = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });
const DAY_FORMATTER = new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" });

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
  options?: { ends?: Record<string, string>; futureStarts?: string[] },
): "recorded" | "estimated" | "none" {
  const spanFor = (start: string) => {
    const end = options?.ends?.[start];
    return end && end >= start ? Math.min(14, daysBetween(start, end) + 1) : periodLength;
  };
  const currentPeriod = starts.some((start) => {
    const elapsed = daysBetween(start, key);
    return elapsed >= 0 && elapsed < spanFor(start);
  });

  if (currentPeriod && key <= today) return "recorded";
  if (currentPeriod && key > today) return "estimated";

  const predicted = (options?.futureStarts ?? [estimatedStart]).filter(Boolean);
  const inPredicted = predicted.some((start) => {
    const elapsed = daysBetween(start, key);
    return elapsed >= 0 && elapsed < periodLength;
  });
  return inPredicted && key > today ? "estimated" : "none";
}

/** Water drop used for period days. Solid = recorded, outline = predicted. */
function Drop({ filled, className = "" }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M12 2.5c3.6 4.3 6.5 7.6 6.5 11.2A6.5 6.5 0 0 1 12 20.2a6.5 6.5 0 0 1-6.5-6.5C5.5 10.1 8.4 6.8 12 2.5Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MonthGrid({
  month,
  starts,
  profile,
  futureStarts,
  logs,
  selectedDate,
  today,
  onSelect,
  onMonthChange,
}: {
  month: Date;
  starts: string[];
  profile: CycleProfile;
  futureStarts: string[];
  logs: SymptomLog[];
  selectedDate: string;
  today: string;
  onSelect: (date: string) => void;
  onMonthChange: (date: Date) => void;
}) {
  return (
    <div>
      <h3 className="mb-3 font-display text-base font-bold text-zinc-900 md:text-lg">{MONTH_FORMATTER.format(month)}</h3>
      <div className="grid grid-cols-7 gap-y-1.5 text-center">
        {WEEKDAYS.map((weekday, index) => <span key={`${weekday}-${index}`} className="pb-1 text-[11px] font-semibold text-zinc-400">{weekday}</span>)}
        {monthCells(month).map((date, index) => {
          if (!date) return <span key={`empty-${index}`} className="aspect-square" />;
          const key = dateKey(date);
          const classification = classifyDay(key, starts, profile.periodLength, today, "", { ends: profile.periodEnds, futureStarts });
          const period = classification === "recorded";
          const predicted = classification === "estimated";
          const isStart = starts.includes(key);
          const log = logs.find((entry) => entry.log_date === key);
          const pain = Boolean(log && log.pain_score > 0);
          const selected = key === selectedDate;
          const isToday = key === today;
          const tone = period
            ? "bg-[var(--period-solid)] text-white"
            : predicted
              ? "border border-dashed border-[var(--period-line)] bg-[var(--period-soft)] text-[var(--period-solid)]"
              : "text-zinc-700 hover:bg-zinc-100";
          return (
            <div key={key} className="flex min-w-0 justify-center">
              <button
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
                aria-label={`${DAY_FORMATTER.format(date)}${period ? ", period" : predicted ? ", predicted period" : ""}${isStart ? ", first day" : ""}${pain ? `, pain ${log?.pain_score} out of 10` : ""}`}
                aria-pressed={selected}
                className={`relative flex aspect-square w-full max-w-12 flex-col items-center justify-center rounded-full text-[15px] font-medium tabular transition-[background-color,transform] active:scale-95 ${tone} ${isToday && !period ? "font-bold text-zinc-900" : ""} ${selected ? "pt-pop ring-2 ring-zinc-900 ring-offset-2 ring-offset-white" : isToday ? "ring-1 ring-zinc-400 ring-offset-2 ring-offset-white" : ""}`}
              >
                <span className={period || predicted ? "-mt-1 leading-none" : "leading-none"}>{date.getDate()}</span>
                {(period || predicted) && <Drop filled={period} className={`absolute bottom-1.5 h-2.5 w-2.5 ${predicted ? "opacity-70" : ""}`} />}
                {isStart && <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-white" />}
                {pain && <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${period ? "bg-white" : "bg-[var(--period-solid)]"}`} />}
              </button>
            </div>
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
  onProfileChange,
  showRecordButton = true,
  onEditLog,
}: {
  profile: CycleProfile;
  logs: SymptomLog[];
  onRecordPeriodStart: (date: string) => void;
  onProfileChange?: (profile: CycleProfile) => void;
  showRecordButton?: boolean;
  onEditLog?: (date: string) => void;
}) {
  const today = dateKey(new Date());
  const thisMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12);
  const [visibleMonth, setVisibleMonth] = useState(thisMonth);
  const [selectedDate, setSelectedDate] = useState(today);
  const starts = profile.periodStartDates ?? [];
  const futureStarts = starts.length ? predictedPeriodStarts(profile, 8) : [];
  const classification = classifyDay(selectedDate, starts, profile.periodLength, today, "", { ends: profile.periodEnds, futureStarts });
  const containing = periodStartContaining(profile, selectedDate);
  const recordedEnd = containing ? profile.periodEnds?.[containing] : undefined;
  const selectedLog = logs.find((log) => log.log_date === selectedDate);
  const isPast = selectedDate <= today;
  const showingThisMonth = visibleMonth.getTime() === thisMonth().getTime();
  const update = (next: CycleProfile) => (onProfileChange ?? (() => undefined))(next);
  const daysAway = starts.length ? daysUntilNextPeriod(profile) : null;
  const nextStart = starts.length ? dateKey(nextPeriodEstimate(profile)) : "";

  const status = classification === "recorded" && containing
    ? `Period · day ${daysBetween(containing, selectedDate) + 1}`
    : classification === "estimated"
      ? selectedDate === nextStart && daysAway !== null ? `Predicted period · in ${daysAway} days` : "Predicted period"
      : "No period";

  function startPeriod() {
    if (onProfileChange) update(recordPeriodStart(profile, selectedDate));
    else onRecordPeriodStart(selectedDate);
  }

  function undoEnd() {
    if (!containing || !profile.periodEnds) return;
    const { [containing]: _removed, ...rest } = profile.periodEnds;
    update({ ...profile, periodEnds: rest });
  }

  return (
    <section className="-mx-4 border-y border-zinc-200 bg-white px-4 py-5 sm:mx-0 sm:rounded-3xl sm:border sm:p-6 sm:shadow-card" aria-label="Period calendar">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setVisibleMonth((month) => addMonths(month, -1))} aria-label="Previous month" className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 transition-colors hover:bg-zinc-100">
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          </button>
          <button type="button" onClick={() => setVisibleMonth((month) => addMonths(month, 1))} aria-label="Next month" className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 transition-colors hover:bg-zinc-100">
            <ChevronRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        {!showingThisMonth || selectedDate !== today
          ? <button type="button" onClick={() => { setVisibleMonth(thisMonth()); setSelectedDate(today); }} className="pt-rise min-h-11 rounded-full bg-zinc-900 px-4 text-sm font-semibold text-white">Today</button>
          : daysAway !== null && <p className="text-sm text-zinc-500 tabular">Next period in <span className="font-bold text-zinc-900">{daysAway}</span> {daysAway === 1 ? "day" : "days"}</p>}
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <MonthGrid month={visibleMonth} starts={starts} profile={profile} futureStarts={futureStarts} logs={logs} selectedDate={selectedDate} today={today} onSelect={setSelectedDate} onMonthChange={(date) => setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12))} />
        <div className="hidden md:block">
          <MonthGrid month={addMonths(visibleMonth, 1)} starts={starts} profile={profile} futureStarts={futureStarts} logs={logs} selectedDate={selectedDate} today={today} onSelect={setSelectedDate} onMonthChange={(date) => setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12))} />
        </div>
      </div>

      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-zinc-100 pt-4 text-xs text-zinc-500">
        <li className="inline-flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--period-solid)] text-white"><Drop filled className="h-2.5 w-2.5" /></span>Period</li>
        <li className="inline-flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-[var(--period-line)] bg-[var(--period-soft)] text-[var(--period-solid)]"><Drop filled={false} className="h-2.5 w-2.5 opacity-70" /></span>Predicted</li>
        <li className="inline-flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--period-solid)]"><span className="h-1.5 w-1.5 rounded-full bg-white" /></span>First day</li>
        <li className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[var(--period-solid)]" />Pain logged</li>
      </ul>

      <div key={selectedDate} className="pt-rise mt-5 rounded-2xl bg-zinc-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-lg font-bold text-zinc-900">{DAY_FORMATTER.format(dateAtNoon(selectedDate))}</p>
            <p className={`mt-0.5 text-sm font-medium ${classification === "recorded" ? "text-[var(--period-solid)]" : "text-zinc-500"}`}>{status}</p>
          </div>
          {selectedLog && <p className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-600 tabular">Pain {selectedLog.pain_score}/10</p>}
        </div>

        {selectedLog && (selectedLog.symptoms.length > 0 || selectedLog.notes) && (
          <div className="mt-3 space-y-1 text-sm text-zinc-600">
            {selectedLog.symptoms.length > 0 && <p>{selectedLog.symptoms.map((symptom) => SYMPTOM_LABELS[symptom]).join(", ")}</p>}
            {selectedLog.notes && <p className="whitespace-pre-wrap">{selectedLog.notes}</p>}
          </div>
        )}

        {showRecordButton && isPast && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {!containing && (
              <button type="button" onClick={startPeriod} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--period-solid)] px-4 text-sm font-semibold text-white transition-transform active:scale-[0.98]">
                <Drop filled className="h-4 w-4" />Period started
              </button>
            )}
            {containing && !recordedEnd && (
              <button type="button" onClick={() => update(recordPeriodEnd(profile, containing, selectedDate))} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-4 text-sm font-semibold text-white transition-transform active:scale-[0.98]">
                <Drop filled={false} className="h-4 w-4" />Period ended
              </button>
            )}
            {containing && recordedEnd === selectedDate && (
              <button type="button" onClick={undoEnd} className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700">Undo end</button>
            )}
            {containing && recordedEnd && recordedEnd !== selectedDate && (
              <button type="button" onClick={() => update(recordPeriodEnd(profile, containing, selectedDate))} className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700">Ended here</button>
            )}
            {containing === selectedDate && (
              <button type="button" onClick={() => update(removePeriodStart(profile, containing))} className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-500 hover:text-zinc-800">Remove this period</button>
            )}
            {onEditLog && (
              <button type="button" onClick={() => onEditLog(selectedDate)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 transition-transform active:scale-[0.98]">
                <NotebookPen className="h-4 w-4" />Log symptoms
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

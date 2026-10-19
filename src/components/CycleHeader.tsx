import { useId, useMemo } from "react";
import type { CycleProfile, PhaseInfo } from "../types";
import {
  currentCycleDay,
  cycleProgressPercent,
  energyAtCycleFraction,
  nextPeriodEstimate,
  phaseForDay,
  PHASES,
} from "../lib/cycleUtils";

const PHASE_TONE: Record<PhaseInfo["key"], { bg: string; text: string; line: string }> = {
  menstrual: { bg: "bg-phase-menstrual-bg", text: "text-phase-menstrual-text", line: "var(--phase-menstrual-line)" },
  follicular: { bg: "bg-phase-follicular-bg", text: "text-phase-follicular-text", line: "var(--phase-follicular-line)" },
  ovulatory: { bg: "bg-phase-ovulatory-bg", text: "text-phase-ovulatory-text", line: "var(--phase-ovulatory-line)" },
  luteal: { bg: "bg-phase-luteal-bg", text: "text-phase-luteal-text", line: "var(--phase-luteal-line)" },
};

function getPhaseSegments(cycleLength: number): Array<{ key: PhaseInfo["key"]; days: number; start: number }> {
  const segments: Array<{ key: PhaseInfo["key"]; days: number; start: number }> = [];
  for (let cycleDay = 1; cycleDay <= cycleLength; cycleDay += 1) {
    const key = phaseForDay(cycleDay, cycleLength).key;
    const last = segments[segments.length - 1];
    if (last?.key === key) last.days += 1;
    else segments.push({ key, days: 1, start: cycleDay - 1 });
  }
  return segments;
}

// Chart coordinate space: x is a percentage of the cycle (0-100), y runs 0-40 top to bottom.
const CHART_HEIGHT = 40;
const CURVE_TOP = 5;
const CURVE_BOTTOM = 36;

function curveY(fraction: number): number {
  return CURVE_BOTTOM - energyAtCycleFraction(fraction) * (CURVE_BOTTOM - CURVE_TOP);
}

/** Phase-banded energy curve for the whole cycle. Elapsed days are solid, upcoming days dashed. */
function CycleChart({ profile, day, phaseKey }: { profile: CycleProfile; day: number; phaseKey: PhaseInfo["key"] }) {
  const gradientId = useId();
  const cycleLength = profile.cycleLength || 28;
  const segments = useMemo(() => getPhaseSegments(cycleLength), [cycleLength]);

  const points = useMemo(() => {
    const steps = 120;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const fraction = i / steps;
      return { x: fraction * 100, y: curveY(fraction) };
    });
  }, []);

  const todayFraction = (Math.min(day, cycleLength) - 0.5) / cycleLength;
  const todayX = todayFraction * 100;
  const todayY = curveY(todayFraction);
  const toPath = (list: Array<{ x: number; y: number }>) =>
    list.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");

  const elapsed = points.filter((p) => p.x <= todayX);
  const upcoming = points.filter((p) => p.x >= todayX);
  const elapsedPath = toPath([...elapsed, { x: todayX, y: todayY }]);
  const upcomingPath = toPath([{ x: todayX, y: todayY }, ...upcoming]);
  const areaPath = `${toPath(points)} L 100 ${CHART_HEIGHT} L 0 ${CHART_HEIGHT} Z`;
  const activeLine = PHASE_TONE[phaseKey].line;
  const labelX = Math.min(88, Math.max(12, todayX));

  return (
    <div className="mt-6">
      {/* Phase names, sized to match the bands below. */}
      <div className="flex text-[11px] font-medium text-zinc-500" aria-hidden="true">
        {segments.map((segment) => (
          <span
            key={`${segment.key}-${segment.start}`}
            className={`truncate pb-1.5 pl-1 ${segment.key === phaseKey ? "font-semibold text-zinc-900" : ""}`}
            style={{ width: `${(segment.days / cycleLength) * 100}%` }}
          >
            {segment.days / cycleLength > 0.12 ? PHASES.find((p) => p.key === segment.key)?.label : ""}
          </span>
        ))}
      </div>

      <div className="relative h-36 sm:h-40">
        <svg viewBox={`0 0 100 ${CHART_HEIGHT}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={activeLine} stopOpacity="0.28" />
              <stop offset="100%" stopColor={activeLine} stopOpacity="0" />
            </linearGradient>
          </defs>
          {segments.map((segment) => (
            <rect
              key={`${segment.key}-${segment.start}`}
              x={(segment.start / cycleLength) * 100}
              width={(segment.days / cycleLength) * 100}
              y={0}
              height={CHART_HEIGHT}
              style={{ fill: PHASE_TONE[segment.key].line }}
              opacity={segment.key === phaseKey ? 0.2 : 0.09}
            />
          ))}
          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path d={upcomingPath} fill="none" strokeDasharray="1.5 2.5" strokeLinecap="round" strokeWidth={2} vectorEffect="non-scaling-stroke" className="stroke-zinc-400" />
          <path d={elapsedPath} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} vectorEffect="non-scaling-stroke" style={{ stroke: activeLine }} />
        </svg>

        {/* Today marker lives in HTML so it stays round whatever the chart width. */}
        <span className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-zinc-900/25" style={{ left: `${todayX}%` }} aria-hidden="true" />
        <span
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${todayX}%`, top: `${(todayY / CHART_HEIGHT) * 100}%`, backgroundColor: activeLine }}
          aria-hidden="true"
        />
        <span
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] font-semibold text-white tabular"
          style={{ left: `${labelX}%` }}
          aria-hidden="true"
        >
          Today · Day {day}
        </span>
      </div>

      <div className="mt-1.5 flex justify-between text-[11px] text-zinc-500 tabular" aria-hidden="true">
        <span>Day 1</span>
        <span>Day {Math.round(cycleLength / 2)}</span>
        <span>Day {cycleLength}</span>
      </div>
    </div>
  );
}

export function CycleHeader({
  profile,
  ownerLabelOverride,
}: {
  profile: CycleProfile;
  /** Optional label override, used when rendering "her" header in LDR mode. */
  ownerLabelOverride?: string;
}) {
  const cycleLength = profile.cycleLength || 28;
  const day = currentCycleDay(profile);
  const phase = phaseForDay(day, cycleLength);
  const progress = cycleProgressPercent(profile);
  const nextPeriod = nextPeriodEstimate(profile);
  const daysUntilNext = Math.max(0, cycleLength - day + 1);
  const tone = PHASE_TONE[phase.key];
  const label = ownerLabelOverride ?? profile.ownerLabel;
  const hasRecordedStarts = Boolean(profile.periodStartDates?.length);
  const cycleLabel = label === "You" ? "Your cycle" : `${label}’s cycle`;
  const nextPeriodDate = nextPeriod.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const countdown = daysUntilNext === 1 ? "tomorrow" : `in ${daysUntilNext} days`;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-card sm:p-7">
      <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{cycleLabel}</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-3xl font-semibold text-zinc-900">Day {day}</h2>
            <span className="text-sm text-zinc-500 tabular">of {cycleLength}</span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tone.bg} ${tone.text}`}>{phase.label}</span>
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-sm text-zinc-500">{hasRecordedStarts ? "Estimated next period" : "Estimated next period (default cycle)"}</p>
          <p className="mt-1 font-display text-xl font-semibold text-zinc-900 tabular">{nextPeriodDate}</p>
          <p className="text-xs text-zinc-500 tabular">{countdown}</p>
        </div>
      </div>

      <div role="img" aria-label={`Cycle progress. Today is cycle day ${day} of ${cycleLength}, ${phase.label.toLowerCase()} phase, ${progress}% through the cycle. Next period expected ${countdown}.`}>
        <CycleChart profile={profile} day={day} phaseKey={phase.key} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-zinc-500">
        <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Cycle phases">
          {PHASES.map((item) => (
            <li key={item.key} className={`inline-flex items-center gap-1.5 ${item.key === phase.key ? "font-semibold text-zinc-900" : ""}`}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PHASE_TONE[item.key].line }} aria-hidden="true" />
              {item.key === "ovulatory" ? "Ovulation (est.)" : item.label}
            </li>
          ))}
        </ul>
        <span className="tabular">{progress}% through cycle</span>
      </div>

      <p className="mt-4 border-t border-zinc-100 pt-4 text-sm leading-relaxed text-zinc-600">{phase.summary}</p>

      {!hasRecordedStarts && (
        <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-600">
          This is an estimate from a default {cycleLength}-day cycle. Use Record period to log a real start date and it will adjust to you.
        </p>
      )}

      {profile.periodStartDates && profile.periodStartDates.length > 0 && (
        <details className="mt-3 text-xs leading-relaxed text-zinc-500">
          <summary className="inline-flex min-h-9 cursor-pointer items-center text-zinc-600 hover:text-zinc-900">{profile.periodStartDates.length} period starts recorded</summary>
          <p>Cycle length uses the average of up to six recorded intervals.</p>
          <p className="mt-1">Recent starts: {profile.periodStartDates.slice(-6).reverse().join(", ")}</p>
        </details>
      )}
    </section>
  );
}

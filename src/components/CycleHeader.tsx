import { useMemo } from "react";
import type { CycleProfile, PhaseInfo } from "../types";
import {
  currentCycleDay,
  cycleProgressPercent,
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

function getPhaseSegments(cycleLength: number): Array<{ key: PhaseInfo["key"]; days: number }> {
  const segments: Array<{ key: PhaseInfo["key"]; days: number }> = [];
  for (let cycleDay = 1; cycleDay <= cycleLength; cycleDay += 1) {
    const key = phaseForDay(cycleDay, cycleLength).key;
    const last = segments[segments.length - 1];
    if (last?.key === key) last.days += 1;
    else segments.push({ key, days: 1 });
  }
  return segments;
}

/** A quiet 28-point energy curve across the cycle, today marked with a dot. */
function EnergyCurve({ cycleLength, day }: { cycleLength: number; day: number }) {
  const width = 100;
  const height = 28;
  const points = useMemo(() => {
    const n = 48;
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const d = (i / n) * cycleLength;
      const phase = phaseForDay(Math.max(1, Math.ceil(d)), cycleLength);
      const energyLevel =
        phase.energy === "low" ? 0.15 : phase.energy === "rising" ? 0.55 : phase.energy === "peak" ? 0.95 : 0.35;
      // taper luteal down toward the end
      const tail =
        phase.key === "luteal"
          ? 1 - (d - phase.dayRange[0]) / Math.max(1, phase.dayRange[1] - phase.dayRange[0])
          : 1;
      const y = height - (energyLevel * Math.max(0.25, tail)) * height;
      const x = (d / cycleLength) * width;
      pts.push([x, y]);
    }
    return pts;
  }, [cycleLength]);

  const path = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");

  const todayX = (Math.min(day, cycleLength) / cycleLength) * width;
  const todayY =
    points[Math.round((Math.min(day, cycleLength) / cycleLength) * (points.length - 1))]?.[1] ??
    height / 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-10"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={path} fill="none" stroke="#D4D4D8" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
      <circle cx={todayX} cy={todayY} r={2.2} fill="#27272A" />
    </svg>
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
  const day = currentCycleDay(profile);
  const phase = phaseForDay(day, profile.cycleLength);
  const progress = cycleProgressPercent(profile);
  const nextPeriod = nextPeriodEstimate(profile);
  const tone = PHASE_TONE[phase.key];
  const daysUntilNext = (() => {
    const diff = Math.round((new Date(nextPeriod.getFullYear(), nextPeriod.getMonth(), nextPeriod.getDate()).getTime() - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()) / 86400000);
    return diff >= 0 ? diff : null;
  })();
  const label = ownerLabelOverride ?? profile.ownerLabel;
  const hasRecordedStarts = Boolean(profile.periodStartDates?.length);
  const phaseSegments = getPhaseSegments(profile.cycleLength);
  const markerPosition = ((Math.min(day, profile.cycleLength) - 0.5) / profile.cycleLength) * 100;
  const cycleLabel = label === "You" ? "Your cycle" : `${label}’s cycle`;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-card sm:p-7">
      <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
            {label}'s cycle
          </p>
          <div className="flex items-baseline gap-3 mt-1">
            <h2 className="font-display text-3xl font-semibold text-zinc-900">
              Day {day}
            </h2>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${tone.bg} ${tone.text}`}
            >
              {phase.label}
            </span>
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-sm text-zinc-500">{hasRecordedStarts ? "Estimated next period" : "Cycle estimates"}</p>
          <p className="mt-1 font-display text-xl font-semibold text-zinc-900 tabular">
            {hasRecordedStarts ? nextPeriod.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Not available"}
          </p>
          {daysUntilNext !== null && <p className="text-[11px] text-zinc-500 tabular">{daysUntilNext === 0 ? "today" : daysUntilNext === 1 ? "tomorrow" : `in ${daysUntilNext} days`}</p>}
        </div>
      </div>

      {hasRecordedStarts ? <>
      <div className="mt-7">
        <div className="relative pt-1" role="img" aria-label={`Estimated phase timeline. Today is cycle day ${day}, ${phase.label.toLowerCase()} phase.`}>
          <div className="flex h-3 overflow-hidden rounded-full bg-zinc-100">
            {phaseSegments.map((segment) => <span key={segment.key} className="h-full opacity-70" style={{ width: `${(segment.days / profile.cycleLength) * 100}%`, backgroundColor: PHASE_TONE[segment.key].line }} />)}
          </div>
          <span className="absolute -top-1 h-5 w-0.5 -translate-x-1/2 rounded bg-zinc-900" style={{ left: `${markerPosition}%` }} />
          <span className="absolute -top-1 h-5 w-2 -translate-x-1/2 rounded-full border-2 border-white bg-zinc-900" style={{ left: `${markerPosition}%` }} />
        </div>
        <div className="flex justify-between text-[11px] text-zinc-500 mt-1.5 tabular">
          <span>Day 1</span>
          <span>{progress}% through cycle</span>
          <span>Day {profile.cycleLength}</span>
        </div>
      </div>

      <div className="mt-5">
        <EnergyCurve cycleLength={profile.cycleLength} day={day} />
        <p className="text-[11px] text-zinc-500 mt-1">Relative energy across the cycle · today marked</p>
      </div>

      <p className="mt-5 text-sm leading-relaxed text-zinc-600 border-t border-zinc-100 pt-4">
        {phase.summary}
      </p>

      {profile.periodStartDates && profile.periodStartDates.length > 0 && (
        <details className="mt-3 text-xs leading-relaxed text-zinc-500">
          <summary className="inline-flex min-h-9 cursor-pointer items-center text-zinc-600 hover:text-zinc-900">{profile.periodStartDates.length} period starts recorded</summary>
          <p>Cycle length uses the average of up to six recorded intervals.</p>
          <p className="mt-1">Recent starts: {profile.periodStartDates.slice(-6).reverse().join(", ")}</p>
        </details>
      )}
      </> : null}
    </section>
  );
}

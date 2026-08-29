import { useMemo } from "react";
import type { CycleProfile, PhaseInfo } from "../types";
import {
  currentCycleDay,
  cycleProgressPercent,
  nextPeriodEstimate,
  phaseForDay,
} from "../lib/cycleUtils";

const PHASE_TONE: Record<PhaseInfo["key"], { bg: string; text: string; line: string }> = {
  menstrual: { bg: "bg-phase-menstrual-bg", text: "text-phase-menstrual-text", line: "#E11D48" },
  follicular: { bg: "bg-phase-follicular-bg", text: "text-phase-follicular-text", line: "#10B981" },
  ovulatory: { bg: "bg-phase-ovulatory-bg", text: "text-phase-ovulatory-text", line: "#F59E0B" },
  luteal: { bg: "bg-phase-luteal-bg", text: "text-phase-luteal-text", line: "#6366F1" },
};

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
  const label = ownerLabelOverride ?? profile.ownerLabel;

  return (
    <section className="bg-white border border-zinc-200 rounded-xl shadow-card p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
            {label}'s cycle
          </p>
          <div className="flex items-baseline gap-3 mt-1">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-zinc-900">
              Day {day}
            </h2>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${tone.bg} ${tone.text}`}
            >
              {phase.label}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500">Next period est.</p>
          <p className="text-sm font-medium text-zinc-800 tabular">
            {nextPeriod.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, backgroundColor: tone.line }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-zinc-400 mt-1.5 tabular">
          <span>Day 1</span>
          <span>{progress}% through cycle</span>
          <span>Day {profile.cycleLength}</span>
        </div>
      </div>

      <div className="mt-5">
        <EnergyCurve cycleLength={profile.cycleLength} day={day} />
        <p className="text-[11px] text-zinc-400 mt-1">Relative energy across the cycle · today marked</p>
      </div>

      <p className="mt-5 text-sm leading-relaxed text-zinc-600 border-t border-zinc-100 pt-4">
        {phase.summary}
      </p>
    </section>
  );
}

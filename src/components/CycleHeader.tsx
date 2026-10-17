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
  const hasRecordedStarts = Boolean(profile.periodStartDates?.length);
  const phaseSegments = getPhaseSegments(profile.cycleLength);
  const markerPosition = ((Math.min(day, profile.cycleLength) - 0.5) / profile.cycleLength) * 100;
  const cycleLabel = label === "You" ? "Your cycle" : `${label}’s cycle`;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-card sm:p-7">
      <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <p className="text-sm font-medium text-zinc-500">{cycleLabel}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="font-display text-3xl font-bold leading-tight text-zinc-900">{hasRecordedStarts ? `Day ${day}` : "Cycle setup"}</h2>
            {hasRecordedStarts && <span className={`inline-flex min-h-8 items-center rounded-full px-3 text-sm font-semibold ${tone.bg} ${tone.text}`}>{phase.label}</span>}
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-sm text-zinc-500">{hasRecordedStarts ? "Estimated next period" : "Cycle estimates"}</p>
          <p className="mt-1 font-display text-xl font-semibold text-zinc-900 tabular">
            {hasRecordedStarts ? nextPeriod.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Not available"}
          </p>
          {!hasRecordedStarts && <p className="mt-1 text-sm text-zinc-500">Limited history</p>}
        </div>
      </div>

      {hasRecordedStarts ? <div className="mt-7">
        <div className="relative pt-1" role="img" aria-label={`Estimated phase timeline. Today is cycle day ${day}, ${phase.label.toLowerCase()} phase.`}>
          <div className="flex h-3 overflow-hidden rounded-full bg-zinc-100">
            {phaseSegments.map((segment) => <span key={segment.key} className="h-full opacity-70" style={{ width: `${(segment.days / profile.cycleLength) * 100}%`, backgroundColor: PHASE_TONE[segment.key].line }} />)}
          </div>
          <span className="absolute -top-1 h-5 w-0.5 -translate-x-1/2 rounded bg-zinc-900" style={{ left: `${markerPosition}%` }} />
          <span className="absolute -top-1 h-5 w-2 -translate-x-1/2 rounded-full border-2 border-white bg-zinc-900" style={{ left: `${markerPosition}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {PHASES.map((item) => <span key={item.key} className={`text-xs leading-5 ${item.key === phase.key ? "font-semibold text-zinc-900" : "text-zinc-500"}`}>{item.label}</span>)}
        </div>
      </div> : <div className="mt-7 border-y border-zinc-200 py-5 text-sm text-zinc-600">Add your most recent period start in Settings to build a phase timeline and date estimate.</div>}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-4 text-sm">
        {hasRecordedStarts && <p className="text-zinc-600">Phase-based patterns are a loose reference; many people experience cycles differently. Adjust to how you feel.</p>}
        {hasRecordedStarts && <p className="shrink-0 text-zinc-500 tabular">{progress}% estimated</p>}
      </div>
      {hasRecordedStarts && <p className="mt-2 text-sm text-zinc-500">{profile.periodStartDates?.length} period starts recorded. Estimates use up to six recorded intervals.</p>}
    </section>
  );
}

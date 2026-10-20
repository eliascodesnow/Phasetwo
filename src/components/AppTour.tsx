import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Droplets,
  FileText,
  HeartPulse,
  LineChart,
  ListTodo,
  MessageCircle,
  Settings,
  Sparkles,
  UsersRound,
  Activity,
} from "lucide-react";
import { tourStepsFor, type TourIcon, type TourRole, type TourView } from "../lib/tour";

const ICONS: Record<TourIcon, typeof Sparkles> = {
  welcome: Sparkles,
  chart: LineChart,
  period: Droplets,
  checkin: HeartPulse,
  calendar: CalendarDays,
  planner: ListTodo,
  history: BookOpen,
  report: FileText,
  bella: MessageCircle,
  patterns: Activity,
  partner: UsersRound,
  settings: Settings,
  done: CheckCircle2,
};

/**
 * Step-by-step walkthrough. The screen behind it switches to the one each step talks about.
 * `onClose` runs when the tour is finished or skipped.
 */
export function AppTour({
  role,
  onNavigate,
  onClose,
}: {
  role: TourRole;
  onNavigate: (view: TourView) => void;
  onClose: () => void;
}) {
  const steps = useMemo(() => tourStepsFor(role), [role]);
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;
  const primaryRef = useRef<HTMLButtonElement>(null);
  const Icon = ICONS[step.icon];

  useEffect(() => {
    onNavigate(step.view);
    primaryRef.current?.focus();
    // onNavigate is intentionally omitted: only a change of step should navigate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") setIndex((current) => Math.min(steps.length - 1, current + 1));
      else if (event.key === "ArrowLeft") setIndex((current) => Math.max(0, current - 1));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, steps.length]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-zinc-950/45 p-3 sm:items-center sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-tour-title"
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 tabular">Step {index + 1} of {steps.length}</p>
          {!isLast && (
            <button type="button" onClick={onClose} className="min-h-9 rounded-md px-2 text-sm font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800">
              Skip tour
            </button>
          )}
        </div>

        <div
          className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-100"
          role="progressbar"
          aria-label="Tour progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
        >
          <div className="h-full rounded-full bg-sage transition-all" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>

        <div className="mt-5 flex items-start gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-sage-light text-sage-dark" aria-hidden="true">
            <Icon className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h2 id="app-tour-title" className="font-display text-xl font-semibold text-zinc-900">{step.title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{step.body}</p>
          </div>
        </div>

        {step.points && (
          <ul className="mt-4 space-y-2 text-sm leading-6 text-zinc-600">
            {step.points.map((point) => (
              <li key={point} className="flex gap-2.5">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-sage" aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
            disabled={isFirst}
            className="min-h-11 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:invisible"
          >
            Back
          </button>
          <button
            ref={primaryRef}
            type="button"
            onClick={() => (isLast ? onClose() : setIndex((current) => current + 1))}
            className="min-h-11 rounded-lg bg-sage-dark px-5 text-sm font-semibold text-white hover:opacity-90"
          >
            {isLast ? "Get started" : isFirst ? "Start tour" : "Next"}
          </button>
        </div>
      </section>
    </div>
  );
}

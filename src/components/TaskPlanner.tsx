import { useMemo, useState, type ReactElement } from "react";
import { Plus, Check, Circle, CircleDot, Trash2, SlidersHorizontal } from "lucide-react";
import type { CycleProfile, Phase, Task, TaskStatus } from "../types";
import { PHASES, phaseForDay, currentCycleDay, sortTasksForPhase } from "../lib/cycleUtils";

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
};

const STATUS_ICON: Record<TaskStatus, ReactElement> = {
  todo: <Circle className="w-4 h-4 text-zinc-300" strokeWidth={1.75} />,
  in_progress: <CircleDot className="w-4 h-4 text-sage" strokeWidth={1.75} />,
  done: <Check className="w-4 h-4 text-white" strokeWidth={2.25} />,
};

const PHASE_BADGE: Record<Phase, string> = {
  menstrual: "bg-phase-menstrual-bg text-phase-menstrual-text",
  follicular: "bg-phase-follicular-bg text-phase-follicular-text",
  ovulatory: "bg-phase-ovulatory-bg text-phase-ovulatory-text",
  luteal: "bg-phase-luteal-bg text-phase-luteal-text",
};

function newTask(title: string, recommendedPhases: Phase[]): Task {
  return {
    id: crypto.randomUUID(),
    title,
    recommendedPhases,
    status: "todo",
    createdAt: Date.now(),
  };
}

export function TaskPlanner({
  profile,
  tasks,
  onChange,
}: {
  profile: CycleProfile;
  tasks: Task[];
  onChange: (tasks: Task[]) => void;
}) {
  const [title, setTitle] = useState("");
  const [selectedPhases, setSelectedPhases] = useState<Phase[]>(["follicular"]);
  const [optimize, setOptimize] = useState(Boolean(profile.periodStartDates?.length));
  const hasRecordedStarts = Boolean(profile.periodStartDates?.length);

  const day = currentCycleDay(profile);
  const phase = phaseForDay(day, profile.cycleLength).key;

  const visibleTasks = useMemo(
    () => (optimize ? sortTasksForPhase(tasks, phase) : tasks),
    [tasks, phase, optimize]
  );

  function addTask() {
    const t = title.trim();
    if (!t) return;
    onChange([...tasks, newTask(t, selectedPhases.length ? selectedPhases : ["follicular"])]);
    setTitle("");
  }

  function cycleStatus(id: string) {
    onChange(tasks.map((t) => (t.id === id ? { ...t, status: STATUS_CYCLE[t.status] } : t)));
  }

  function removeTask(id: string) {
    onChange(tasks.filter((t) => t.id !== id));
  }

  function togglePhaseFilter(p: Phase) {
    setSelectedPhases((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  return (
    <section className="bg-white border border-zinc-200 rounded-xl shadow-card p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h3 className="font-display text-lg font-semibold text-zinc-900">Task planner</h3>
        <button
          type="button"
          onClick={() => setOptimize((v) => !v)}
          disabled={!hasRecordedStarts}
          className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            optimize
              ? "bg-sage text-white border-sage"
              : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={2} />
          Sort by cycle phase
        </button>
      </div>
      {!hasRecordedStarts && <p className="mt-3 text-sm text-zinc-500">Add a period start in Settings before sorting tasks by cycle phase.</p>}

      <div className="mt-5 flex flex-col sm:flex-row gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="Add a task…"
          className="min-h-11 flex-1 rounded-lg border border-zinc-200 px-3.5 py-2.5 text-base placeholder:text-zinc-400 transition-colors focus:border-sage sm:text-sm"
        />
        <button
          type="button"
          onClick={addTask}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-slate px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          Add
        </button>
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-[11px] text-zinc-500">Best phase for this task</p>
        <div className="flex flex-wrap gap-1.5">
        {PHASES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => togglePhaseFilter(p.key)}
            aria-pressed={selectedPhases.includes(p.key)}
            className={`min-h-8 text-[11px] font-medium px-3 py-1 rounded-full border transition-colors ${
              selectedPhases.includes(p.key)
                ? PHASE_BADGE[p.key] + " border-transparent"
                : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
            }`}
          >
            {p.label}
          </button>
        ))}
        </div>
      </div>

      <ul className="mt-6 divide-y divide-zinc-100">
        {visibleTasks.length === 0 && (
          <li className="py-6 text-sm text-zinc-400 text-center">
            No tasks yet. Add one above and it will be sorted for your current phase.
          </li>
        )}
        {visibleTasks.map((t) => (
          <li key={t.id} className="group flex items-center gap-3 py-2.5">
            <button
              type="button"
              onClick={() => cycleStatus(t.id)}
              aria-label={`Mark ${t.title} as ${STATUS_CYCLE[t.status]}`}
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
                t.status === "done"
                  ? "bg-sage border-sage"
                  : t.status === "in_progress"
                  ? "border-sage"
                  : "border-zinc-300"
              }`}
            >
              {STATUS_ICON[t.status]}
            </button>
            <div className="min-w-0 flex-1">
              <span
                className={`block text-sm ${
                  t.status === "done" ? "line-through text-zinc-400" : "text-zinc-800"
                }`}
              >
                {t.title}
              </span>
              <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                {t.recommendedPhases.map((p) => (
                  <span key={p} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PHASE_BADGE[p]}`}>
                    {PHASES.find((ph) => ph.key === p)?.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="hidden sm:flex gap-1">
              {t.recommendedPhases.map((p) => (
                <span
                  key={p}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PHASE_BADGE[p]}`}
                >
                  {PHASES.find((ph) => ph.key === p)?.label}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => removeTask(t.id)}
              aria-label={`Delete ${t.title}`}
              className="flex h-9 w-9 flex-none items-center justify-center rounded-md text-zinc-400 transition-opacity hover:bg-zinc-100 hover:text-zinc-700 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

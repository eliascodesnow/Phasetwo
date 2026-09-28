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
  const [optimize, setOptimize] = useState(true);

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
          className={`inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
            optimize
              ? "bg-sage text-white border-sage"
              : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={2} />
          Optimize for biological energy
        </button>
      </div>

      <div className="mt-5 flex flex-col sm:flex-row gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="Add a task…"
          className="flex-1 border border-zinc-200 rounded-lg px-3.5 py-2.5 text-sm placeholder:text-zinc-400 focus:border-sage transition-colors"
        />
        <button
          type="button"
          onClick={addTask}
          className="inline-flex items-center justify-center gap-1.5 bg-slate text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-zinc-800 transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          Add
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PHASES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => togglePhaseFilter(p.key)}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
              selectedPhases.includes(p.key)
                ? PHASE_BADGE[p.key] + " border-transparent"
                : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <ul className="mt-6 divide-y divide-zinc-100">
        {visibleTasks.length === 0 && (
          <li className="py-6 text-sm text-zinc-400 text-center">
            No tasks yet. Add one above to see it sorted by phase.
          </li>
        )}
        {visibleTasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-3 group">
            <button
              type="button"
              onClick={() => cycleStatus(t.id)}
              aria-label={`Mark ${t.title} as ${STATUS_CYCLE[t.status]}`}
              className={`flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${
                t.status === "done"
                  ? "bg-sage border-sage"
                  : t.status === "in_progress"
                  ? "border-sage"
                  : "border-zinc-300"
              }`}
            >
              {STATUS_ICON[t.status]}
            </button>
            <span
              className={`flex-1 text-sm ${
                t.status === "done" ? "line-through text-zinc-400" : "text-zinc-800"
              }`}
            >
              {t.title}
            </span>
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
              className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-zinc-500 transition-opacity"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

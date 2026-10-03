import { Flame } from "lucide-react";

export function WeeklyStreakCard({ weeks }: { weeks: number }) {
  return (
    <section className="flex items-center justify-between gap-3 border-y border-zinc-200 py-3">
      <div className="flex items-center gap-2 text-zinc-600">
        <Flame className="h-4 w-4 text-amber-600" strokeWidth={1.8} />
        <span className="text-sm">Weekly streak</span>
      </div>
      <p className="text-sm font-medium text-zinc-900">{weeks} week{weeks === 1 ? "" : "s"}</p>
    </section>
  );
}

import { useMemo, useState } from "react";
import { HeartPulse, Info, Lightbulb, X } from "lucide-react";
import type { CycleProfile } from "../types";
import type { SymptomLog } from "../lib/symptoms";
import { markNoticeSeen, nextInAppNotice, readSeenNotices, type NoticeKind } from "../lib/notificationContent";

interface Props {
  profile: CycleProfile;
  role: "self" | "partner";
  userId: string;
  logs?: SymptomLog[];
}

const KIND_LABEL: Record<NoticeKind, string> = {
  attention: "Worth knowing",
  phase: "Where you are in your cycle",
  tip: "Did you know?",
};

const KIND_ICON = { attention: HeartPulse, phase: Info, tip: Lightbulb } as const;

/**
 * Shows at most one insight per visit. Dismissing it hides it for good (this device) and does not
 * reveal another one straight away, so the Today screen never turns into a feed.
 */
export function InAppNoticeCard({ profile, role, userId, logs }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const notice = useMemo(
    () => (dismissed ? null : nextInAppNotice({ profile, role, logs }, readSeenNotices(userId))),
    [dismissed, profile, role, logs, userId],
  );
  if (!notice) return null;

  const Icon = KIND_ICON[notice.kind];
  const attention = notice.kind === "attention";

  function dismiss() {
    if (!notice) return;
    markNoticeSeen(userId, notice.id);
    setDismissed(true);
  }

  return (
    <section
      aria-label={KIND_LABEL[notice.kind]}
      className={`rounded-2xl border p-4 shadow-card sm:p-5 ${attention ? "border-rose-200 bg-rose-50/60" : "border-zinc-200 bg-white"}`}
    >
      <div className="flex items-start gap-3.5">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${attention ? "bg-rose-100 text-rose-700" : "bg-sage-light text-sage-dark"}`} aria-hidden="true">
          <Icon className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold uppercase tracking-wide ${attention ? "text-rose-700" : "text-sage-dark"}`}>{KIND_LABEL[notice.kind]}</p>
          <h2 className="mt-0.5 font-display text-base font-semibold leading-tight text-zinc-900">{notice.title}</h2>
          <p className="mt-1.5 text-sm leading-6 text-zinc-600">{notice.body}</p>

          {notice.tips && notice.tips.length > 0 && (
            <details className="group mt-3">
              <summary className="inline-flex min-h-9 cursor-pointer items-center text-sm font-medium text-sage-dark outline-none focus-visible:ring-2 focus-visible:ring-sage/40">
                <span className="group-open:hidden">Show tips</span>
                <span className="hidden group-open:inline">Hide tips</span>
              </summary>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-zinc-600">
                {notice.tips.map((tip) => <li key={tip}>{tip}</li>)}
              </ul>
            </details>
          )}

          {notice.caution && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] leading-5 text-rose-900">{notice.caution}</p>
          )}

          <p className="mt-3 text-xs text-zinc-500">
            General information, not medical advice.
            {notice.source && <> Source: <a href={notice.source.url} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">{notice.source.label}</a></>}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss this insight"
          className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 outline-none transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus-visible:ring-2 focus-visible:ring-sage/40"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </section>
  );
}

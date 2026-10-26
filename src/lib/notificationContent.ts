// IN-APP notices: the short, dismissible card at the top of the Today screen.
//
// It carries two things only: gentle heads-ups built from what the person has recorded
// ("Worth knowing"), and one general fact a day ("Did you know?"). Phase-by-phase ideas are NOT
// shown here. They are push-only and rare: see supabase/functions/_shared/pushContent.ts.
//
// Content follows the cycle guide's own rule: say what *may* happen, label dates as estimates, and
// never present a calendar guess as a fact about someone's body or mood. No external links.
import type { CycleProfile } from "../types";
import { currentCycleDay, dateKey } from "./cycleUtils";
import type { SymptomLog } from "./symptoms";

export type NoticeKind = "attention" | "tip";

export interface InAppNotice {
  /** Stable and scoped (per cycle or per day), so each notice is shown and dismissed once. */
  id: string;
  kind: NoticeKind;
  /** Lower shows first. */
  priority: number;
  title: string;
  body: string;
  /** A "when to get help" line, shown separately so it is not lost in the body. */
  caution?: string;
}

export interface InAppContext {
  profile: CycleProfile;
  role: "self" | "partner";
  /** Symptom history. Only used to spot patterns worth a gentle heads-up; never leaves the device. */
  logs?: SymptomLog[];
  asOf?: Date;
}

/** One short fact per day when nothing more important is waiting. */
export const TIPS: Array<{ title: string; body: string }> = [
  {
    title: "Day 1 is the first day of bleeding",
    body: "The cycle runs until the day before your next period. A typical adult cycle is roughly 21–35 days, and phase lengths vary from person to person.",
  },
  {
    title: "Predictions are estimates",
    body: "A calendar can't tell you that you are ovulating today. Illness, stress, irregular cycles and hormonal contraception all change the picture, and some contraceptives stop ovulation altogether.",
  },
  {
    title: "Your own pattern beats the average",
    body: "Hormones can influence symptoms, but they don't dictate your mood or what you can do. Notes from your own cycles are more useful than generic phase advice.",
  },
  {
    title: "A period doesn't prevent pregnancy",
    body: "Sperm can survive for several days and early ovulation is possible, especially with shorter cycles. Use contraception if you don't want to get pregnant.",
  },
  {
    title: "Exercise during your period is fine",
    body: "There is no medical requirement to avoid running, strength training or swimming while bleeding. Comfort and energy decide what works for you.",
  },
  {
    title: "No special diet for each phase",
    body: "Balanced meals, enough fluids and regular sleep cover every phase. Be cautious with \"hormone-balancing\" supplements: high doses of some, including iron and B6, can cause harm.",
  },
  {
    title: "Pair plant iron with vitamin C",
    body: "Beans, lentils and leafy greens give more iron when eaten with a vitamin C source such as citrus, tomatoes or peppers. Don't take iron supplements without a reason.",
  },
  {
    title: "Body temperature confirms ovulation afterwards",
    body: "Basal body temperature usually rises slightly after ovulation. That helps you see a pattern looking back. It can't predict ovulation in advance.",
  },
  {
    title: "A mid-cycle twinge can be normal",
    body: "Some people feel mild, short-lived pain on one side of the lower abdomen around ovulation. Severe or lasting pain isn't just ovulation and deserves a check.",
  },
];

function localDate(asOf: Date, offsetDays = 0): Date {
  return new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate() + offsetDays);
}

/** Calendar days between two yyyy-mm-dd keys (noon-anchored, so safe across DST). */
function keyDays(from: string, to: string): number {
  return Math.round((new Date(`${to.slice(0, 10)}T12:00:00`).getTime() - new Date(`${from.slice(0, 10)}T12:00:00`).getTime()) / 86_400_000);
}

/**
 * Signals worth a gentle heads-up, built only from what the person has recorded. These are about
 * someone's health and need room to explain themselves, so they never go to push.
 */
function attentionNotices(ctx: InAppContext, cycleStart: string, today: Date): InAppNotice[] {
  const { profile, logs = [] } = ctx;
  const notices: InAppNotice[] = [];
  const starts = [...(profile.periodStartDates ?? [])].sort();

  const recentCycles = starts.slice(1).map((start, index) => keyDays(starts[index], start)).slice(-3);
  if (recentCycles.filter((days) => days < 21 || days > 35).length >= 2) {
    notices.push({
      id: `attention:irregular:${cycleStart}`,
      kind: "attention",
      priority: 10,
      title: "Your recent cycles look uneven",
      body: "Two of your last few cycles fell outside the typical adult range of about 21–35 days. Variation is common and has many causes. If this is new for you, or comes with big changes in bleeding, it's worth mentioning to a clinician. Your logs make that conversation easier.",
    });
  }

  const spans = starts.slice(-3).flatMap((start) => {
    const end = profile.periodEnds?.[start];
    return end && end >= start ? [keyDays(start, end) + 1] : [];
  });
  if (spans.filter((days) => days > 7).length >= 2) {
    notices.push({
      id: `attention:long-period:${cycleStart}`,
      kind: "attention",
      priority: 10,
      title: "Your periods have run longer than 7 days",
      body: "You've recorded more than one period lasting over a week. Bleeding that repeatedly goes past 7 days is worth a medical check, especially if you also feel unusually tired or dizzy.",
    });
  }

  const weekAgo = dateKey(localDate(today, -6));
  const heavyDays = new Set(logs.filter((log) => log.bleeding === "heavy" && log.log_date.slice(0, 10) >= weekAgo).map((log) => log.log_date.slice(0, 10)));
  if (heavyDays.size >= 3) {
    notices.push({
      id: `attention:heavy:${cycleStart}`,
      kind: "attention",
      priority: 10,
      title: "You've logged several heavy days",
      body: "Heavy bleeding can wear down your iron over time. See a clinician if you need to change a pad or tampon every 1–2 hours, or if you feel tired or dizzy much of the time.",
      caution: "Very heavy bleeding with fainting, chest pain or shortness of breath needs urgent medical care.",
    });
  }

  return notices;
}

function tipNotice(today: Date): InAppNotice {
  const dayNumber = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86_400_000);
  const index = ((dayNumber % TIPS.length) + TIPS.length) % TIPS.length;
  const tip = TIPS[index];
  return { id: `tip:${index}:${dateKey(today)}`, kind: "tip", priority: 90, title: tip.title, body: tip.body };
}

/** Every notice that applies today, most important first. Partners see none. */
export function inAppNotices(ctx: InAppContext): InAppNotice[] {
  if (ctx.role !== "self") return [];
  const today = localDate(ctx.asOf ?? new Date());
  const cycleStart = dateKey(localDate(today, -(currentCycleDay(ctx.profile, today) - 1)));
  return [...attentionNotices(ctx, cycleStart, today), tipNotice(today)].sort((a, b) => a.priority - b.priority);
}

/** The single notice to show right now, skipping any already dismissed. */
export function nextInAppNotice(ctx: InAppContext, seen: ReadonlySet<string>): InAppNotice | null {
  return inAppNotices(ctx).find((notice) => !seen.has(notice.id)) ?? null;
}

// ---- Dismissed notices (this device only) -------------------------------------------------------

const SEEN_LIMIT = 60;
const seenKey = (userId: string) => `phasetwo:inapp-notices:${userId}`;

export function readSeenNotices(userId: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(seenKey(userId)) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

/** Remembers a dismissed notice, keeping only the most recent ones so storage stays small. */
export function markNoticeSeen(userId: string, id: string): Set<string> {
  const seen = readSeenNotices(userId);
  seen.delete(id);
  seen.add(id);
  const kept = [...seen].slice(-SEEN_LIMIT);
  try { localStorage.setItem(seenKey(userId), JSON.stringify(kept)); } catch { /* storage unavailable */ }
  return new Set(kept);
}
